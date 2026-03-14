
CREATE TABLE public.restaurant_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read settings" ON public.restaurant_settings FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert settings" ON public.restaurant_settings FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update settings" ON public.restaurant_settings FOR UPDATE TO public USING (true);

INSERT INTO public.restaurant_settings (key, value) VALUES ('self_service_requires_approval', 'true');
