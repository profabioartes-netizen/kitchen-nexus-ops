-- Add internal_number and sector columns to restaurant_tables
ALTER TABLE public.restaurant_tables
  ADD COLUMN IF NOT EXISTS internal_number text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sector text DEFAULT NULL;