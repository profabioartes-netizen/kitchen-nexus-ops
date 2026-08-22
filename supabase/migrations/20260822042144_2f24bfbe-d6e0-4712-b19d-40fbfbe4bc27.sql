-- 1) Colunas de auditoria/estorno (não destrutivo)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by_name text,
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS client_token text;

CREATE UNIQUE INDEX IF NOT EXISTS payments_order_client_token_uidx
  ON public.payments (order_id, client_token)
  WHERE client_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_order_active_idx
  ON public.payments (order_id)
  WHERE voided_at IS NULL;

-- 2) Fonte única de saldo
CREATE OR REPLACE FUNCTION public.get_order_balance(p_order_id uuid)
RETURNS TABLE(order_id uuid, total numeric, paid numeric, remaining numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id,
         ROUND(COALESCE(o.total, 0)::numeric, 2) AS total,
         ROUND(COALESCE((
           SELECT SUM(p.amount) FROM public.payments p
           WHERE p.order_id = o.id AND p.voided_at IS NULL
         ), 0)::numeric, 2) AS paid,
         GREATEST(0, ROUND(COALESCE(o.total, 0)::numeric
           - COALESCE((
               SELECT SUM(p.amount) FROM public.payments p
               WHERE p.order_id = o.id AND p.voided_at IS NULL
             ), 0)::numeric, 2)) AS remaining
  FROM public.orders o
  WHERE o.id = p_order_id
    AND public.user_belongs_to_tenant(o.tenant_id);
$$;

-- 3) Registrar abatimento (transacional, idempotente, seguro p/ concorrência)
CREATE OR REPLACE FUNCTION public.register_order_credit(
  p_order_id uuid,
  p_amount numeric,
  p_method text,
  p_created_by_name text DEFAULT NULL,
  p_client_token text DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_paid numeric;
  v_remaining numeric;
  v_amount numeric;
  v_method text;
  v_row public.payments%ROWTYPE;
BEGIN
  IF p_client_token IS NOT NULL THEN
    SELECT * INTO v_row FROM public.payments
    WHERE order_id = p_order_id AND client_token = p_client_token LIMIT 1;
    IF FOUND THEN
      RETURN v_row; -- idempotente
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('order_balance:' || p_order_id::text, 7));

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Comanda não encontrada' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.user_belongs_to_tenant(v_order.tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  v_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'AMOUNT_INVALID' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(amount), 0)::numeric INTO v_paid
  FROM public.payments WHERE order_id = p_order_id AND voided_at IS NULL;

  v_remaining := ROUND(COALESCE(v_order.total, 0)::numeric - v_paid, 2);

  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'NO_BALANCE_DUE' USING ERRCODE = 'P0001';
  END IF;

  IF v_amount > v_remaining + 0.001 THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_BALANCE' USING ERRCODE = 'P0001',
      DETAIL = json_build_object('remaining', v_remaining)::text;
  END IF;

  v_method := CASE WHEN COALESCE(p_method, 'cash') IN ('credit', 'debit') THEN 'card' ELSE COALESCE(p_method, 'cash') END;

  INSERT INTO public.payments (order_id, method, amount, kind, created_by_name, client_token, tenant_id)
  VALUES (p_order_id, v_method, v_amount, 'credit', p_created_by_name, p_client_token, v_order.tenant_id)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 4) Cancelar (estornar) um abatimento específico
CREATE OR REPLACE FUNCTION public.void_order_payment(
  p_payment_id uuid,
  p_reason text,
  p_voided_by_name text DEFAULT NULL
)
RETURNS public.payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payments%ROWTYPE;
BEGIN
  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row FROM public.payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.user_belongs_to_tenant(v_row.tenant_id) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  IF v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_VOIDED' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.payments
  SET voided_at = now(),
      voided_by_name = p_voided_by_name,
      void_reason = BTRIM(p_reason)
  WHERE id = p_payment_id AND voided_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ALREADY_VOIDED' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_balance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_order_credit(uuid, numeric, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_order_payment(uuid, text, text) TO authenticated, service_role;

-- 5) Faturamento por cliente ignora lançamentos cancelados
CREATE OR REPLACE FUNCTION public.get_customers_revenue(p_customer_ids uuid[], p_start timestamp with time zone, p_end timestamp with time zone)
RETURNS TABLE(customer_id uuid, total_revenue numeric, payment_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT o.customer_id,
         COALESCE(SUM(p.amount), 0)::numeric AS total_revenue,
         COUNT(p.id)::bigint AS payment_count
  FROM public.payments p
  JOIN public.orders o ON o.id = p.order_id
  WHERE o.customer_id = ANY(p_customer_ids)
    AND p.voided_at IS NULL
    AND p.tenant_id = public.current_tenant_id(auth.uid())
    AND o.tenant_id = public.current_tenant_id(auth.uid())
    AND (p_start IS NULL OR p.created_at >= p_start)
    AND (p_end IS NULL OR p.created_at < p_end)
  GROUP BY o.customer_id;
$$;

CREATE OR REPLACE FUNCTION public.get_customers_revenue_summary(p_start timestamp with time zone, p_end timestamp with time zone)
RETURNS TABLE(total_revenue numeric, customers_count bigint, payments_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(p.amount), 0)::numeric AS total_revenue,
         COUNT(DISTINCT o.customer_id)::bigint AS customers_count,
         COUNT(p.id)::bigint AS payments_count
  FROM public.payments p
  JOIN public.orders o ON o.id = p.order_id
  WHERE o.customer_id IS NOT NULL
    AND p.voided_at IS NULL
    AND p.tenant_id = public.current_tenant_id(auth.uid())
    AND o.tenant_id = public.current_tenant_id(auth.uid())
    AND (p_start IS NULL OR p.created_at >= p_start)
    AND (p_end IS NULL OR p.created_at < p_end);
$$;