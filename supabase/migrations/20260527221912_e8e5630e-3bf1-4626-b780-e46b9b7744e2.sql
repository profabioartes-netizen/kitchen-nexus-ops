ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS is_vip boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_customers_vip ON public.customers(tenant_id) WHERE is_vip = true;