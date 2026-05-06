-- 1. Colunas extras em print_jobs
ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agent_id uuid,
  ADD COLUMN IF NOT EXISTS claimed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_print_jobs_pending_station
  ON public.print_jobs (tenant_id, station, status, created_at)
  WHERE status = 'pending';

-- 2. Reserva de jobs por um agente (atômica)
CREATE OR REPLACE FUNCTION public.claim_print_jobs_for_agent(
  p_token_hash text,
  p_limit integer DEFAULT 5
)
RETURNS SETOF public.print_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.print_agents%ROWTYPE;
BEGIN
  SELECT * INTO v_agent
  FROM public.print_agents
  WHERE token_hash = p_token_hash AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token de agente inválido ou desativado' USING ERRCODE = 'P0004';
  END IF;

  UPDATE public.print_agents
  SET last_seen_at = now()
  WHERE id = v_agent.id;

  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.print_jobs
    WHERE tenant_id = v_agent.tenant_id
      AND station = v_agent.station
      AND status = 'pending'
    ORDER BY created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(p_limit, 1)
  )
  UPDATE public.print_jobs pj
  SET status = 'processing',
      agent_id = v_agent.id,
      claimed_at = now(),
      attempts = pj.attempts + 1
  FROM picked
  WHERE pj.id = picked.id
  RETURNING pj.*;
END;
$$;

-- 3. Atualizar status do job (printed | error | pending para retry)
CREATE OR REPLACE FUNCTION public.update_print_job_status(
  p_token_hash text,
  p_job_id uuid,
  p_status text,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent public.print_agents%ROWTYPE;
BEGIN
  SELECT * INTO v_agent
  FROM public.print_agents
  WHERE token_hash = p_token_hash AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Token de agente inválido ou desativado' USING ERRCODE = 'P0004';
  END IF;

  IF p_status NOT IN ('printed','error','pending') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status;
  END IF;

  UPDATE public.print_jobs
  SET status = p_status,
      error_message = p_error_message,
      printed_at = CASE WHEN p_status = 'printed' THEN now() ELSE printed_at END
  WHERE id = p_job_id
    AND tenant_id = v_agent.tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job % não encontrado para este tenant', p_job_id;
  END IF;

  UPDATE public.print_agents SET last_seen_at = now() WHERE id = v_agent.id;
END;
$$;