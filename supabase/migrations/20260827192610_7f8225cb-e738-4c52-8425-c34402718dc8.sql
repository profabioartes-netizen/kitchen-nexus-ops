CREATE OR REPLACE FUNCTION public.register_order_credit(p_order_id uuid, p_amount numeric, p_method text, p_created_by_name text DEFAULT NULL::text, p_client_token text DEFAULT NULL::text)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Preserva o meio de pagamento real (dinheiro/pix/débito/crédito) para conferência financeira
  v_method := CASE
    WHEN COALESCE(p_method, 'cash') IN ('cash','pix','debit','credit','card') THEN COALESCE(p_method, 'cash')
    ELSE 'cash'
  END;

  INSERT INTO public.payments (order_id, method, amount, kind, created_by_name, client_token, tenant_id)
  VALUES (p_order_id, v_method, v_amount, 'credit', p_created_by_name, p_client_token, v_order.tenant_id)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$function$;