
ALTER TABLE public.restaurant_tables 
  ADD COLUMN sort_order INTEGER DEFAULT 0,
  ADD COLUMN active BOOLEAN NOT NULL DEFAULT true;

-- Set initial sort order based on name
UPDATE public.restaurant_tables SET sort_order = 
  CAST(regexp_replace(name, '[^0-9]', '', 'g') AS INTEGER);

-- Allow delete for admin management
CREATE POLICY "Anyone can delete tables" ON public.restaurant_tables FOR DELETE USING (true);
