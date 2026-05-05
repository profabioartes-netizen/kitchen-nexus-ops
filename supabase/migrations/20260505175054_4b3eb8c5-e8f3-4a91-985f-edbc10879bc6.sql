ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_type text NOT NULL DEFAULT 'unit',
  ADD COLUMN IF NOT EXISTS price_per_kg numeric;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_sale_type_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_sale_type_check CHECK (sale_type IN ('unit', 'weight'));