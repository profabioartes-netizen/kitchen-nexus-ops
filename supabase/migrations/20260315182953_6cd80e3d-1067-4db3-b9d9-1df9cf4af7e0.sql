CREATE OR REPLACE FUNCTION public.get_or_create_open_order(
  p_table_id uuid,
  p_waiter_name text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_whatsapp_phone text DEFAULT NULL,
  p_guests integer DEFAULT 1
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  created_order public.orders%ROWTYPE;
BEGIN
  -- Serialize creations per table to avoid race conditions
  PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  -- Manual flow: ALWAYS create a new independent comanda
  INSERT INTO public.orders (
    table_id,
    status,
    total,
    waiter_name,
    customer_name,
    whatsapp_phone,
    guests
  )
  VALUES (
    p_table_id,
    'open',
    0,
    p_waiter_name,
    p_customer_name,
    p_whatsapp_phone,
    COALESCE(p_guests, 1)
  )
  RETURNING * INTO created_order;

  UPDATE public.restaurant_tables
  SET status = 'occupied',
      updated_at = now()
  WHERE id = p_table_id;

  RETURN created_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_self_service_order(
  p_table_id uuid,
  p_session_id uuid,
  p_customer_name text DEFAULT NULL,
  p_whatsapp_phone text DEFAULT NULL,
  p_guests integer DEFAULT 1
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session public.self_service_sessions%ROWTYPE;
  v_existing_order public.orders%ROWTYPE;
  v_created_order public.orders%ROWTYPE;
BEGIN
  -- Serialize by table + session to avoid duplicate inserts from rapid taps
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_table_id::text || ':' || p_session_id::text, 0)
  );

  SELECT *
  INTO v_session
  FROM public.self_service_sessions
  WHERE id = p_session_id
    AND table_id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão de autoatendimento inválida para esta mesa';
  END IF;

  -- Reuse ONLY when same table + same session + status open
  IF v_session.order_id IS NOT NULL THEN
    SELECT *
    INTO v_existing_order
    FROM public.orders
    WHERE id = v_session.order_id
      AND table_id = p_table_id
      AND status = 'open'
    LIMIT 1;

    IF FOUND THEN
      RETURN v_existing_order;
    END IF;
  END IF;

  -- Different session/device (or previous order no longer open) => new comanda
  INSERT INTO public.orders (
    table_id,
    status,
    total,
    waiter_name,
    customer_name,
    whatsapp_phone,
    guests
  )
  VALUES (
    p_table_id,
    'open',
    0,
    'Auto-atendimento',
    COALESCE(NULLIF(BTRIM(p_customer_name), ''), v_session.customer_name),
    p_whatsapp_phone,
    COALESCE(p_guests, 1)
  )
  RETURNING * INTO v_created_order;

  UPDATE public.self_service_sessions
  SET order_id = v_created_order.id
  WHERE id = v_session.id;

  UPDATE public.restaurant_tables
  SET status = 'occupied',
      updated_at = now()
  WHERE id = p_table_id;

  RETURN v_created_order;
END;
$$;