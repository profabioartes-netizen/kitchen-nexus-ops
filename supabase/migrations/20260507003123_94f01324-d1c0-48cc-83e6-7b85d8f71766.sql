ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;
DROP INDEX IF EXISTS public.categories_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS categories_tenant_name_unique
  ON public.categories (tenant_id, lower(btrim(name)));