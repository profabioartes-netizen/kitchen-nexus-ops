DROP FUNCTION IF EXISTS public.consume_pairing_code(text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.consume_pairing_code(p_code_hash text, p_token_hash text, p_agent_name text, p_agent_host text, p_agent_version text)
 RETURNS TABLE(agent_id uuid, tenant_id uuid, tenant_name text, station text, stations text[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_code public.agent_pairing_codes%ROWTYPE;
  v_agent public.print_agents%ROWTYPE;
  v_tenant_name text;
  v_stations text[];
  v_primary text;
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

  v_stations := CASE
    WHEN v_code.stations IS NOT NULL AND array_length(v_code.stations, 1) > 0 THEN v_code.stations
    ELSE ARRAY[v_code.station]
  END;
  v_primary := COALESCE(v_stations[1], v_code.station, 'Caixa');

  INSERT INTO public.print_agents (
    tenant_id, name, token_hash, station, stations,
    agent_host, agent_version, paired_by_user_id,
    last_seen_at
  ) VALUES (
    v_code.tenant_id,
    COALESCE(NULLIF(BTRIM(p_agent_name), ''), v_code.suggested_name, 'Agente'),
    p_token_hash,
    v_primary,
    v_stations,
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
  stations := v_agent.stations;
  RETURN NEXT;
END;
$function$;