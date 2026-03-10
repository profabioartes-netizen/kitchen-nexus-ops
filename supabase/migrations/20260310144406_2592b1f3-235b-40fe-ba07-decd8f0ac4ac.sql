-- Add preparation timing columns to order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS preparing_at timestamptz,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Add expected preparation time to products (in minutes)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS prep_time_minutes integer NOT NULL DEFAULT 15;