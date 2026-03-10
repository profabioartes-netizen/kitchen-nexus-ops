ALTER TABLE public.restaurant_tables ADD COLUMN default_name text;
UPDATE public.restaurant_tables SET default_name = name;
ALTER TABLE public.restaurant_tables ALTER COLUMN default_name SET NOT NULL;
ALTER TABLE public.restaurant_tables ALTER COLUMN default_name SET DEFAULT '';