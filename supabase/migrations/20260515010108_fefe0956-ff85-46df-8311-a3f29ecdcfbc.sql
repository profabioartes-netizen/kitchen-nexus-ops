-- Tabela de clientes recorrentes
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id(auth.uid()),
  name text NOT NULL,
  phone text,
  notes text,
  birthday date,
  visit_count integer NOT NULL DEFAULT 0,
  last_visit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_select ON public.customers FOR SELECT TO authenticated
  USING (public.user_belongs_to_tenant(tenant_id));
CREATE POLICY tenant_insert ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.user_belongs_to_tenant(tenant_id));
CREATE POLICY tenant_update ON public.customers FOR UPDATE TO authenticated
  USING (public.user_belongs_to_tenant(tenant_id))
  WITH CHECK (public.user_belongs_to_tenant(tenant_id));
CREATE POLICY tenant_delete ON public.customers FOR DELETE TO authenticated
  USING (public.user_belongs_to_tenant(tenant_id));

CREATE TRIGGER trg_enforce_tenant_id
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_id();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_customers_tenant_name ON public.customers (tenant_id, lower(name));
CREATE INDEX idx_customers_tenant_phone ON public.customers (tenant_id, phone);

-- Vínculo opcional de comanda com cliente
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_id uuid;
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders (customer_id);

-- Sobrecarga de get_or_create_open_order com p_customer_id
CREATE OR REPLACE FUNCTION public.get_or_create_open_order(
  p_table_id uuid,
  p_waiter_name text DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_whatsapp_phone text DEFAULT NULL,
  p_guests integer DEFAULT 1,
  p_location text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
)
RETURNS public.orders
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