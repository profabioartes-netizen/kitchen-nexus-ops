
-- Add location tracking columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS origin_location text DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS current_location text DEFAULT NULL;

-- Update get_or_create_open_order to accept and set location
CREATE OR REPLACE FUNCTION public.get_or_create_open_order(
  p_table_id uuid,
  p_waiter_name text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_whatsapp_phone text DEFAULT NULL,
  p_guests integer DEFAULT 1,
  p_location text DEFAULT NULL
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  created_order public.orders%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  INSERT INTO public.orders (
    table_id, status, total, waiter_name, customer_name, whatsapp_phone, guests,
    origin_location, current_location
  )
  VALUES (
    p_table_id, 'open', 0, p_waiter_name, p_customer_name, p_whatsapp_phone, COALESCE(p_guests, 1),
    p_location, p_location
  )
  RETURNING * INTO created_order;

  UPDATE public.restaurant_tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_table_id;

  INSERT INTO public.table_activity_log (
    table_id, order_id, action, description, user_name
  )
  VALUES (
    p_table_id,
    created_order.id,
    'comanda_created',
    format('Nova comanda criada | order_id=%s | mesa_id=%s | session_id=null | tipo=manual | waiter=%s | location=%s',
      created_order.id, p_table_id, COALESCE(p_waiter_name, 'null'), COALESCE(p_location, 'null')),
    COALESCE(p_waiter_name, 'Sistema')
  );

  RETURN created_order;
END;
$$;

-- Update get_or_create_self_service_order to set location from table name
CREATE OR REPLACE FUNCTION public.get_or_create_self_service_order(
  p_table_id uuid,
  p_session_id uuid,
  p_customer_name text DEFAULT NULL,
  p_whatsapp_phone text DEFAULT NULL,
  p_guests integer DEFAULT 1
)
RETURNS orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session public.self_service_sessions%ROWTYPE;
  v_existing_order public.orders%ROWTYPE;
  v_created_order public.orders%ROWTYPE;
  v_is_reuse boolean := false;
  v_table_name text;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_table_id::text || ':' || p_session_id::text, 0)
  );

  -- Get table name for location
  SELECT name INTO v_table_name FROM public.restaurant_tables WHERE id = p_table_id;

  SELECT * INTO v_session
  FROM public.self_service_sessions
  WHERE id = p_session_id AND table_id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão de autoatendimento inválida para esta mesa';
  END IF;

  IF v_session.order_id IS NOT NULL THEN
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE id = v_session.order_id AND table_id = p_table_id AND status = 'open'
    LIMIT 1;

    IF FOUND THEN
      v_is_reuse := true;
      v_created_order := v_existing_order;
    END IF;
  END IF;

  IF NOT v_is_reuse THEN
    INSERT INTO public.orders (
      table_id, status, total, waiter_name, customer_name, whatsapp_phone, guests,
      origin_location, current_location
    )
    VALUES (
      p_table_id, 'open', 0, 'Auto-atendimento',
      COALESCE(NULLIF(BTRIM(p_customer_name), ''), v_session.customer_name),
      p_whatsapp_phone, COALESCE(p_guests, 1),
      v_table_name, v_table_name
    )
    RETURNING * INTO v_created_order;

    UPDATE public.self_service_sessions
    SET order_id = v_created_order.id
    WHERE id = v_session.id;

    UPDATE public.restaurant_tables
    SET status = 'occupied', updated_at = now()
    WHERE id = p_table_id;

    INSERT INTO public.table_activity_log (
      table_id, order_id, action, description, user_name
    )
    VALUES (
      p_table_id,
      v_created_order.id,
      'comanda_created',
      format('Nova comanda criada | order_id=%s | mesa_id=%s | session_id=%s | tipo=auto | location=%s',
        v_created_order.id, p_table_id, p_session_id, COALESCE(v_table_name, 'null')),
      COALESCE(NULLIF(BTRIM(p_customer_name), ''), v_session.customer_name, 'Cliente')
    );
  END IF;

  RETURN v_created_order;
END;
$$;
