CREATE OR REPLACE FUNCTION public.get_or_create_open_order(p_table_id uuid, p_waiter_name text DEFAULT NULL::text, p_customer_name text DEFAULT NULL::text, p_whatsapp_phone text DEFAULT NULL::text, p_guests integer DEFAULT 1, p_location text DEFAULT NULL::text, p_customer_id uuid DEFAULT NULL::uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  created_order public.orders%ROWTYPE;
  v_default_location text;
  v_requested_location text;
  v_customer_name text;
  v_final_location text;
  v_tenant_id uuid;
  v_existing public.orders%ROWTYPE;
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

  -- Guard: an explicitly requested comanda number must be unique among ACTIVE orders
  IF v_requested_location IS NOT NULL THEN
    v_tenant_id := public.current_tenant_id(auth.uid());

    -- serialize concurrent attempts for the same tenant + number
    PERFORM pg_advisory_xact_lock(
      hashtextextended(COALESCE(v_tenant_id::text, '-') || ':' || lower(v_requested_location), 42)
    );

    SELECT o.* INTO v_existing
    FROM public.orders o
    WHERE o.status IN ('open', 'billing_in_progress', 'paid_pending_finalization')
      AND (v_tenant_id IS NULL OR o.tenant_id = v_tenant_id)
      AND lower(BTRIM(COALESCE(o.origin_location, ''))) = lower(v_requested_location)
    ORDER BY o.created_at ASC
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      RAISE EXCEPTION 'COMANDA_NUMBER_IN_USE'
        USING ERRCODE = 'P0001',
              DETAIL = json_build_object(
                'code', 'COMANDA_NUMBER_IN_USE',
                'number', v_requested_location,
                'order_id', v_existing.id,
                'table_id', v_existing.table_id,
                'customer_name', v_existing.customer_name
              )::text;
    END IF;
  END IF;

  INSERT INTO public.orders (
    table_id, status, total, waiter_name, customer_name, whatsapp_phone,
    guests, origin_location, current_location, origin, customer_id
  )
  VALUES (
    p_table_id, 'open', 0, p_waiter_name, p_customer_name, p_whatsapp_phone,
    COALESCE(p_guests, 1), v_final_location, v_final_location, 'waiter', p_customer_id
  )
  RETURNING * INTO created_order;

  UPDATE public.restaurant_tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_table_id;

  IF p_customer_id IS NOT NULL THEN
    UPDATE public.customers
    SET visit_count = visit_count + 1,
        last_visit_at = now()
    WHERE id = p_customer_id;
  END IF;

  INSERT INTO public.table_activity_log (table_id, order_id, action, description, user_name)
  VALUES (
    p_table_id, created_order.id, 'comanda_created',
    format('Nova comanda criada | order_id=%s | mesa_id=%s | tipo=manual | waiter=%s | location=%s | customer_id=%s',
      created_order.id, p_table_id, COALESCE(p_waiter_name, 'null'),
      COALESCE(v_final_location, 'null'), COALESCE(p_customer_id::text, 'null')),
    COALESCE(p_waiter_name, 'Sistema')
  );

  RETURN created_order;
END;
$function$;