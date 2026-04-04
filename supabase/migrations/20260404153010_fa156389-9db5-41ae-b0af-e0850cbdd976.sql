CREATE OR REPLACE FUNCTION public.get_safe_table_location(p_table_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(BTRIM(COALESCE(internal_number, default_name)), '')
  FROM public.restaurant_tables
  WHERE id = p_table_id
$$;

CREATE OR REPLACE FUNCTION public.get_or_create_open_order(
  p_table_id uuid,
  p_waiter_name text DEFAULT NULL::text,
  p_customer_name text DEFAULT NULL::text,
  p_whatsapp_phone text DEFAULT NULL::text,
  p_guests integer DEFAULT 1
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN public.get_or_create_open_order(
    p_table_id,
    p_waiter_name,
    p_customer_name,
    p_whatsapp_phone,
    p_guests,
    NULL
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_open_order(
  p_table_id uuid,
  p_waiter_name text DEFAULT NULL::text,
  p_customer_name text DEFAULT NULL::text,
  p_whatsapp_phone text DEFAULT NULL::text,
  p_guests integer DEFAULT 1,
  p_location text DEFAULT NULL::text
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  created_order public.orders%ROWTYPE;
  v_default_location text;
  v_requested_location text;
  v_customer_name text;
  v_final_location text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  v_default_location := public.get_safe_table_location(p_table_id);
  v_requested_location := NULLIF(BTRIM(p_location), '');
  v_customer_name := NULLIF(BTRIM(p_customer_name), '');

  IF v_requested_location IS NOT NULL
     AND v_customer_name IS NOT NULL
     AND lower(v_requested_location) = lower(v_customer_name) THEN
    v_requested_location := NULL;
  END IF;

  v_final_location := COALESCE(v_requested_location, v_default_location);

  INSERT INTO public.orders (
    table_id,
    status,
    total,
    waiter_name,
    customer_name,
    whatsapp_phone,
    guests,
    origin_location,
    current_location,
    origin
  )
  VALUES (
    p_table_id,
    'open',
    0,
    p_waiter_name,
    p_customer_name,
    p_whatsapp_phone,
    COALESCE(p_guests, 1),
    v_final_location,
    v_final_location,
    'waiter'
  )
  RETURNING * INTO created_order;

  UPDATE public.restaurant_tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_table_id;

  INSERT INTO public.table_activity_log (
    table_id,
    order_id,
    action,
    description,
    user_name
  )
  VALUES (
    p_table_id,
    created_order.id,
    'comanda_created',
    format(
      'Nova comanda criada | order_id=%s | mesa_id=%s | session_id=null | tipo=manual | waiter=%s | location=%s',
      created_order.id,
      p_table_id,
      COALESCE(p_waiter_name, 'null'),
      COALESCE(v_final_location, 'null')
    ),
    COALESCE(p_waiter_name, 'Sistema')
  );

  RETURN created_order;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_or_create_self_service_order(
  p_table_id uuid,
  p_session_id uuid,
  p_customer_name text DEFAULT NULL::text,
  p_whatsapp_phone text DEFAULT NULL::text,
  p_guests integer DEFAULT 1
)
RETURNS public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_session public.self_service_sessions%ROWTYPE;
  v_existing_order public.orders%ROWTYPE;
  v_created_order public.orders%ROWTYPE;
  v_is_reuse boolean := false;
  v_table_location text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  v_table_location := public.get_safe_table_location(p_table_id);

  SELECT * INTO v_session
  FROM public.self_service_sessions
  WHERE id = p_session_id AND table_id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão % inválida para mesa % — sessão não encontrada ou pertence a outra mesa',
      p_session_id, p_table_id;
  END IF;

  IF v_session.order_id IS NOT NULL THEN
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE id = v_session.order_id
      AND table_id = p_table_id
      AND status = 'open'
    LIMIT 1;

    IF FOUND THEN
      IF v_existing_order.table_id != p_table_id THEN
        RAISE EXCEPTION 'SEGURANÇA: comanda % pertence à mesa % mas foi requisitada pela mesa %',
          v_existing_order.id, v_existing_order.table_id, p_table_id;
      END IF;
      v_is_reuse := true;
      v_created_order := v_existing_order;
    ELSE
      UPDATE public.self_service_sessions
      SET order_id = NULL
      WHERE id = v_session.id;
    END IF;
  END IF;

  IF NOT v_is_reuse THEN
    INSERT INTO public.orders (
      table_id,
      status,
      total,
      waiter_name,
      customer_name,
      whatsapp_phone,
      guests,
      origin_location,
      current_location,
      origin
    )
    VALUES (
      p_table_id,
      'open',
      0,
      'Auto-atendimento',
      COALESCE(NULLIF(BTRIM(p_customer_name), ''), v_session.customer_name),
      p_whatsapp_phone,
      COALESCE(p_guests, 1),
      v_table_location,
      v_table_location,
      'self_service'
    )
    RETURNING * INTO v_created_order;

    UPDATE public.self_service_sessions
    SET order_id = v_created_order.id
    WHERE id = v_session.id;

    UPDATE public.restaurant_tables
    SET status = 'occupied', updated_at = now()
    WHERE id = p_table_id;

    INSERT INTO public.table_activity_log (
      table_id,
      order_id,
      action,
      description,
      user_name
    )
    VALUES (
      p_table_id,
      v_created_order.id,
      'comanda_created',
      format(
        'Nova comanda criada | order_id=%s | mesa_id=%s | location=%s | session_id=%s | tipo=auto | customer=%s',
        v_created_order.id,
        p_table_id,
        COALESCE(v_table_location, 'null'),
        p_session_id,
        COALESCE(NULLIF(BTRIM(p_customer_name), ''), v_session.customer_name, '?')
      ),
      COALESCE(NULLIF(BTRIM(p_customer_name), ''), v_session.customer_name, 'Cliente')
    );
  END IF;

  IF v_created_order.table_id != p_table_id THEN
    RAISE EXCEPTION 'CRÍTICO: comanda % retornada para mesa errada (comanda.mesa=% ≠ requisição.mesa=%)',
      v_created_order.id, v_created_order.table_id, p_table_id;
  END IF;

  RETURN v_created_order;
END;
$function$;

UPDATE public.orders o
SET origin_location = loc.location_name,
    current_location = loc.location_name,
    updated_at = now()
FROM (
  SELECT id,
         name,
         NULLIF(BTRIM(COALESCE(internal_number, default_name)), '') AS location_name
  FROM public.restaurant_tables
) AS loc
WHERE o.table_id = loc.id
  AND o.origin = 'self_service'
  AND loc.location_name IS NOT NULL
  AND (
    NULLIF(BTRIM(o.origin_location), '') IS NULL
    OR NULLIF(BTRIM(o.current_location), '') IS NULL
    OR lower(COALESCE(o.origin_location, '')) = lower(COALESCE(loc.name, ''))
    OR lower(COALESCE(o.current_location, '')) = lower(COALESCE(loc.name, ''))
    OR lower(COALESCE(o.origin_location, '')) = lower(COALESCE(o.customer_name, ''))
    OR lower(COALESCE(o.current_location, '')) = lower(COALESCE(o.customer_name, ''))
  );

WITH safe_locations AS (
  SELECT o.id AS order_id,
         NULLIF(BTRIM(COALESCE(t.internal_number, t.default_name)), '') AS location_name,
         lower(COALESCE(t.name, '')) AS raw_table_name,
         lower(COALESCE(o.customer_name, '')) AS raw_customer_name
  FROM public.orders o
  JOIN public.restaurant_tables t ON t.id = o.table_id
)
UPDATE public.print_jobs pj
SET payload = jsonb_set(
              jsonb_set(pj.payload, '{location}', to_jsonb(COALESCE(sl.location_name, 'Sem local'))),
              '{table_name}', to_jsonb(COALESCE(sl.location_name, 'Sem local'))
            )
FROM safe_locations sl
WHERE pj.payload ? 'order_id'
  AND pj.payload->>'order_id' = sl.order_id::text
  AND pj.status IN ('pending', 'processing', 'error')
  AND (
    NULLIF(BTRIM(COALESCE(pj.payload->>'location', '')), '') IS NULL
    OR NULLIF(BTRIM(COALESCE(pj.payload->>'table_name', '')), '') IS NULL
    OR lower(COALESCE(pj.payload->>'location', '')) = sl.raw_table_name
    OR lower(COALESCE(pj.payload->>'table_name', '')) = sl.raw_table_name
    OR lower(COALESCE(pj.payload->>'location', '')) = sl.raw_customer_name
    OR lower(COALESCE(pj.payload->>'table_name', '')) = sl.raw_customer_name
  );