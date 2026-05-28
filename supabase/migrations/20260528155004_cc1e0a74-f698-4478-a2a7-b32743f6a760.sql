
CREATE OR REPLACE FUNCTION public.get_customers_revenue(
  p_customer_ids uuid[],
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE(customer_id uuid, total_revenue numeric, payment_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.customer_id,
         COALESCE(SUM(p.amount), 0)::numeric AS total_revenue,
         COUNT(p.id)::bigint AS payment_count
  FROM public.payments p
  JOIN public.orders o ON o.id = p.order_id
  WHERE o.customer_id = ANY(p_customer_ids)
    AND p.tenant_id = public.current_tenant_id(auth.uid())
    AND o.tenant_id = public.current_tenant_id(auth.uid())
    AND (p_start IS NULL OR p.created_at >= p_start)
    AND (p_end IS NULL OR p.created_at < p_end)
  GROUP BY o.customer_id;
$$;

CREATE OR REPLACE FUNCTION public.get_customers_revenue_summary(
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE(total_revenue numeric, customers_count bigint, payments_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(p.amount), 0)::numeric AS total_revenue,
         COUNT(DISTINCT o.customer_id)::bigint AS customers_count,
         COUNT(p.id)::bigint AS payments_count
  FROM public.payments p
  JOIN public.orders o ON o.id = p.order_id
  WHERE o.customer_id IS NOT NULL
    AND p.tenant_id = public.current_tenant_id(auth.uid())
    AND o.tenant_id = public.current_tenant_id(auth.uid())
    AND (p_start IS NULL OR p.created_at >= p_start)
    AND (p_end IS NULL OR p.created_at < p_end);
$$;

GRANT EXECUTE ON FUNCTION public.get_customers_revenue(uuid[], timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_customers_revenue_summary(timestamptz, timestamptz) TO authenticated;
