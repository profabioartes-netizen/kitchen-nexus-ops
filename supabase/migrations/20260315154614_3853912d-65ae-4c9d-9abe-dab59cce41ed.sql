-- Atomic get-or-create to prevent duplicate open orders for the same table under concurrent waiter/self-service actions
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
SET search_path = public
AS $$
DECLARE
  existing_order public.orders%ROWTYPE;
  created_order public.orders%ROWTYPE;
BEGIN
  -- Serialize order creation per table to avoid race conditions
  PERFORM pg_advisory_xact_lock(hashtext(p_table_id::text));

  SELECT *
    INTO existing_order
  FROM public.orders
  WHERE table_id = p_table_id
    AND status IN ('open', 'billing_in_progress', 'paid_pending_finalization')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Optionally fill waiter_name if it was never set
    IF existing_order.waiter_name IS NULL AND p_waiter_name IS NOT NULL THEN
      UPDATE public.orders
      SET waiter_name = p_waiter_name,
          updated_at = now()
      WHERE id = existing_order.id
      RETURNING * INTO existing_order;
    END IF;

    RETURN existing_order;
  END IF;

  INSERT INTO public.orders (table_id, status, total, waiter_name, customer_name, whatsapp_phone, guests)
  VALUES (p_table_id, 'open', 0, p_waiter_name, p_customer_name, p_whatsapp_phone, COALESCE(p_guests, 1))
  RETURNING * INTO created_order;

  UPDATE public.restaurant_tables
  SET status = 'occupied',
      updated_at = now()
  WHERE id = p_table_id;

  RETURN created_order;
END;
$$;