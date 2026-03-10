ALTER TABLE public.orders ADD COLUMN customer_name text;
ALTER TABLE public.orders ADD COLUMN guests integer DEFAULT 1;