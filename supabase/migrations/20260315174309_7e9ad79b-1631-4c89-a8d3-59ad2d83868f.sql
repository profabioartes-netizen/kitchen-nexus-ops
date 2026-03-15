
CREATE OR REPLACE FUNCTION public.get_or_create_open_order(
  p_table_id uuid,
  p_waiter_name text DEFAULT NULL,
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
  existing_order public.orders%ROWTYPE;
  created_order public.orders%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  -- Only reuse an order that belongs to the SAME waiter (match by waiter_name)
  -- This prevents overwriting another waiter/customer comanda
  IF p_waiter_name IS NOT NULL THEN
    SELECT *
      INTO existing_order
    FROM public.orders
    WHERE table_id = p_table_id
      AND status IN ('open', 'billing_in_progress', 'paid_pending_finalization')
      AND waiter_name = p_waiter_name
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF FOUND THEN
    UPDATE public.orders
    SET customer_name = COALESCE(customer_name, p_customer_name),
        whatsapp_phone = COALESCE(whatsapp_phone, p_whatsapp_phone),
        guests = COALESCE(guests, COALESCE(p_guests, 1)),
        updated_at = now()
    WHERE id = existing_order.id
    RETURNING * INTO existing_order;

    RETURN existing_order;
  END IF;

  -- Always INSERT a new independent order
  INSERT INTO public.orders (table_id, status, total, waiter_name, customer_name, whatsapp_phone, guests)
  VALUES (p_table_id, 'open', 0, p_waiter_name, p_customer_name, p_whatsapp_phone, COALESCE(p_guests, 1))
  RETURNING * INTO created_order;

  UPDATE public.restaurant_tables
  SET status = 'occupied', updated_at = now()
  WHERE id = p_table_id;

  RETURN created_order;
END;
$$;
