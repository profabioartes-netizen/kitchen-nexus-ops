-- Add merged_from column to track which tables were merged into this order
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS merged_from text[] DEFAULT '{}';