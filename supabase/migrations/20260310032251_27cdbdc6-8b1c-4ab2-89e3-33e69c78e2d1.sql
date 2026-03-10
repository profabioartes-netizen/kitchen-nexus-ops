
CREATE TABLE public.table_activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE CASCADE NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  description TEXT NOT NULL,
  user_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.table_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read table_activity_log" ON public.table_activity_log FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert table_activity_log" ON public.table_activity_log FOR INSERT TO public WITH CHECK (true);
