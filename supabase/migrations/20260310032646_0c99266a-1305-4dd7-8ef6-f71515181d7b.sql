
ALTER TABLE public.order_items
ADD COLUMN preparation_status TEXT NOT NULL DEFAULT 'pending';

ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
