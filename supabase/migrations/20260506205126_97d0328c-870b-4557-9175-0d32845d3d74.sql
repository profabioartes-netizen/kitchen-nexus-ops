-- ============================================================
-- print_agents: cada notebook instalado recebe um token próprio
-- ============================================================
CREATE TABLE public.print_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT current_tenant_id(auth.uid()),
  name text NOT NULL DEFAULT 'Agente sem nome',
  token_hash text NOT NULL UNIQUE,
  station text NOT NULL DEFAULT 'Caixa',
  printer_name text,
  active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  agent_version text,
  agent_host text,
  paired_at timestamptz NOT NULL DEFAULT now(),
  paired_by_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_print_agents_tenant ON public.print_agents(tenant_id);
CREATE INDEX idx_print_agents_token ON public.print_agents(token_hash);

ALTER TABLE public.print_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.print_agents FOR SELECT TO authenticated
  USING (user_belongs_to_tenant(tenant_id));
CREATE POLICY "tenant_insert" ON public.print_agents FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_tenant(tenant_id));
CREATE POLICY "tenant_update" ON public.print_agents FOR UPDATE TO authenticated
  USING (user_belongs_to_tenant(tenant_id))
  WITH CHECK (user_belongs_to_tenant(tenant_id));
CREATE POLICY "tenant_delete" ON public.print_agents FOR DELETE TO authenticated
  USING (user_belongs_to_tenant(tenant_id));

CREATE TRIGGER trg_enforce_tenant_id_print_agents
  BEFORE INSERT OR UPDATE ON public.print_agents
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_id();

CREATE TRIGGER trg_print_agents_updated_at
  BEFORE UPDATE ON public.print_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- agent_pairing_codes: códigos de 6 dígitos com TTL de 10min
-- ============================================================
CREATE TABLE public.agent_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT current_tenant_id(auth.uid()),
  code_hash text NOT NULL UNIQUE,
  station text NOT NULL DEFAULT 'Caixa',
  suggested_name text,
  created_by_user_id uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz,
  consumed_agent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pairing_codes_tenant ON public.agent_pairing_codes(tenant_id);
CREATE INDEX idx_pairing_codes_hash ON public.agent_pairing_codes(code_hash);

ALTER TABLE public.agent_pairing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.agent_pairing_codes FOR SELECT TO authenticated
  USING (user_belongs_to_tenant(tenant_id));
CREATE POLICY "tenant_insert" ON public.agent_pairing_codes FOR INSERT TO authenticated
  WITH CHECK (user_belongs_to_tenant(tenant_id));
CREATE POLICY "tenant_delete" ON public.agent_pairing_codes FOR DELETE TO authenticated
  USING (user_belongs_to_tenant(tenant_id));

CREATE TRIGGER trg_enforce_tenant_id_pairing_codes
  BEFORE INSERT OR UPDATE ON public.agent_pairing_codes
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_id();

-- ============================================================
-- consume_pairing_code: chamada pela edge function pair-print-agent
-- Valida o código (hash sha256 hex), cria o agente e devolve dados
-- para a edge function gerar o token bruto.
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_pairing_code(
  p_code_hash text,
  p_token_hash text,
  p_agent_name text,
  p_agent_host text,
  p_agent_version text
) RETURNS TABLE(
  agent_id uuid,
  tenant_id uuid,
  tenant_name text,
  station text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code public.agent_pairing_codes%ROWTYPE;
  v_agent public.print_agents%ROWTYPE;
  v_tenant_name text;
BEGIN
  SELECT * INTO v_code
  FROM public.agent_pairing_codes
  WHERE code_hash = p_code_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código de pareamento inválido' USING ERRCODE = 'P0001';
  END IF;

  IF v_code.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Código de pareamento já foi utilizado' USING ERRCODE = 'P0002';
  END IF;

  IF v_code.expires_at < now() THEN
    RAISE EXCEPTION 'Código de pareamento expirado' USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO public.print_agents (
    tenant_id, name, token_hash, station,
    agent_host, agent_version, paired_by_user_id,
    last_seen_at
  ) VALUES (
    v_code.tenant_id,
    COALESCE(NULLIF(BTRIM(p_agent_name), ''), v_code.suggested_name, 'Agente'),
    p_token_hash,
    v_code.station,
    p_agent_host,
    p_agent_version,
    v_code.created_by_user_id,
    now()
  ) RETURNING * INTO v_agent;

  UPDATE public.agent_pairing_codes
  SET consumed_at = now(), consumed_agent_id = v_agent.id
  WHERE id = v_code.id;

  SELECT nome_comercio INTO v_tenant_name FROM public.tenants WHERE id = v_agent.tenant_id;

  agent_id := v_agent.id;
  tenant_id := v_agent.tenant_id;
  tenant_name := v_tenant_name;
  station := v_agent.station;
  RETURN NEXT;
END;
$$;

-- ============================================================
-- Helpers para o agente (chamados via edge function autenticada por token)
-- ============================================================
CREATE OR REPLACE FUNCTION public.agent_heartbeat(
  p_token_hash text,
  p_agent_host text,
  p_agent_version text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent_id uuid;
  v_tenant uuid;
BEGIN
  UPDATE public.print_agents
  SET last_seen_at = now(),
      agent_host = COALESCE(p_agent_host, agent_host),
      agent_version = COALESCE(p_agent_version, agent_version)
  WHERE token_hash = p_token_hash AND active = true
  RETURNING id, tenant_id INTO v_agent_id, v_tenant;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'Token de agente inválido ou desativado' USING ERRCODE = 'P0004';
  END IF;

  RETURN v_tenant;
END;
$$;