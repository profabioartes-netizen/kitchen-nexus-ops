
CREATE OR REPLACE FUNCTION public.get_or_create_self_service_order(
  p_table_id uuid,
  p_session_id uuid,
  p_customer_name text DEFAULT NULL::text,
  p_whatsapp_phone text DEFAULT NULL::text,
  p_guests integer DEFAULT 1
)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session public.self_service_sessions%ROWTYPE;
  v_existing_order public.orders%ROWTYPE;
  v_created_order public.orders%ROWTYPE;
  v_is_reuse boolean := false;
  v_table_name text;
BEGIN
  -- Lock on BOTH table_id and session_id to prevent any cross-table collision
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_table_id::text, 0)
  );
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_session_id::text, 0)
  );

  SELECT name INTO v_table_name FROM public.restaurant_tables WHERE id = p_table_id;

  -- Validate session belongs to THIS table
  SELECT * INTO v_session
  FROM public.self_service_sessions
  WHERE id = p_session_id AND table_id = p_table_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão % inválida para mesa % — sessão não encontrada ou pertence a outra mesa',
      p_session_id, p_table_id;
  END IF;

  -- If session already has an order, validate it strictly
  IF v_session.order_id IS NOT NULL THEN
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE id = v_session.order_id
      AND table_id = p_table_id   -- CRITICAL: must match table
      AND status = 'open'
    LIMIT 1;

    IF FOUND THEN
      -- Double-check: order table_id MUST match request table_id
      IF v_existing_order.table_id != p_table_id THEN
        RAISE EXCEPTION 'SEGURANÇA: comanda % pertence à mesa % mas foi requisitada pela mesa %',
          v_existing_order.id, v_existing_order.table_id, p_table_id;
      END IF;
      v_is_reuse := true;
      v_created_order := v_existing_order;
    ELSE
      -- Order was closed/cancelled or belongs to wrong table — clear the link
      UPDATE public.self_service_sessions
      SET order_id = NULL
      WHERE id = v_session.id;
    END IF;
  END IF;

  IF NOT v_is_reuse THEN
    INSERT INTO public.orders (
      table_id, status, total, waiter_name, customer_name, whatsapp_phone, guests,
      origin_location, current_location, origin
    )
    VALUES (
      p_table_id, 'open', 0, 'Auto-atendimento',
      COALESCE(NULLIF(BTRIM(p_customer_name), ''), v_session.customer_name),
      p_whatsapp_phone, COALESCE(p_guests, 1),
      v_table_name, v_table_name, 'self_service'
    )
    RETURNING * INTO v_created_order;

    -- Link order to session
    UPDATE public.self_service_sessions
    SET order_id = v_created_order.id
    WHERE id = v_session.id;

    UPDATE public.restaurant_tables
    SET status = 'occupied', updated_at = now()
    WHERE id = p_table_id;

    -- Audit log
    INSERT INTO public.table_activity_log (
      table_id, order_id, action, description, user_name
    )
    VALUES (
      p_table_id,
      v_created_order.id,
      'comanda_created',
      format('Nova comanda criada | order_id=%s | mesa_id=%s | mesa=%s | session_id=%s | tipo=auto | customer=%s',
        v_created_order.id, p_table_id, COALESCE(v_table_name, '?'), p_session_id,
        COALESCE(NULLIF(BTRIM(p_customer_name), ''), v_session.customer_name, '?')),
      COALESCE(NULLIF(BTRIM(p_customer_name), ''), v_session.customer_name, 'Cliente')
    );
  END IF;

  -- FINAL SAFETY CHECK: returned order MUST belong to requested table
  IF v_created_order.table_id != p_table_id THEN
    RAISE EXCEPTION 'CRÍTICO: comanda % retornada para mesa errada (comanda.mesa=% ≠ requisição.mesa=%)',
      v_created_order.id, v_created_order.table_id, p_table_id;
  END IF;

  RETURN v_created_order;
END;
$function$;
