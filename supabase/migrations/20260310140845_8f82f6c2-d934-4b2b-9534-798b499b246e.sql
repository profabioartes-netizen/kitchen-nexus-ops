
CREATE TABLE public.order_item_complements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  complement_id UUID NOT NULL REFERENCES public.complements(id),
  complement_name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.order_item_complements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read order_item_complements" ON public.order_item_complements FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert order_item_complements" ON public.order_item_complements FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can delete order_item_complements" ON public.order_item_complements FOR DELETE TO public USING (true);
