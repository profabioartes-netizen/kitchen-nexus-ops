-- Keep exactly one active order per table and make total recalculation concurrency-safe
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_active_per_table_idx
ON public.orders (table_id)
WHERE table_id IS NOT NULL
  AND status IN ('open', 'billing_in_progress', 'paid_pending_finalization');

-- Faster item lookups by order timeline
CREATE INDEX IF NOT EXISTS idx_order_items_order_created_at
ON public.order_items (order_id, created_at);

-- Recalculate total with row lock to avoid race conditions
CREATE OR REPLACE FUNCTION public.recalculate_order_total(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_order_id IS NULL THEN
    RETURN;
  END IF;

  -- Serialize recalculations per order
  PERFORM 1
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  UPDATE public.orders o
  SET total = COALESCE((
        SELECT SUM(oi.price * oi.quantity)::numeric
        FROM public.order_items oi
        WHERE oi.order_id = o.id
      ), 0),
      updated_at = now()
  WHERE o.id = p_order_id;
END;
$$;

-- Auto-sync totals whenever items change
CREATE OR REPLACE FUNCTION public.sync_order_total_from_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_order_id uuid;
  v_old_order_id uuid;
BEGIN
  v_new_order_id := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.order_id ELSE NULL END;
  v_old_order_id := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.order_id ELSE NULL END;

  IF v_old_order_id IS NOT NULL THEN
    PERFORM public.recalculate_order_total(v_old_order_id);
  END IF;

  IF v_new_order_id IS NOT NULL AND v_new_order_id IS DISTINCT FROM v_old_order_id THEN
    PERFORM public.recalculate_order_total(v_new_order_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_total_from_items ON public.order_items;
CREATE TRIGGER trg_sync_order_total_from_items
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_total_from_items();

-- Harden get-or-create against lock-key collisions and enrich missing metadata without overwriting existing values
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
  -- Serialize order creation per table with 64-bit key to reduce collision risk
  PERFORM pg_advisory_xact_lock(hashtextextended(p_table_id::text, 0));

  SELECT *
    INTO existing_order
  FROM public.orders
  WHERE table_id = p_table_id
    AND status IN ('open', 'billing_in_progress', 'paid_pending_finalization')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.orders
    SET waiter_name = COALESCE(waiter_name, p_waiter_name),
        customer_name = COALESCE(customer_name, p_customer_name),
        whatsapp_phone = COALESCE(whatsapp_phone, p_whatsapp_phone),
        guests = COALESCE(guests, COALESCE(p_guests, 1)),
        updated_at = now()
    WHERE id = existing_order.id
    RETURNING * INTO existing_order;

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