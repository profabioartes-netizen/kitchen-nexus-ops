
-- Printers table
CREATE TABLE public.printers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  station TEXT NOT NULL DEFAULT 'Cozinha',
  model TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  port INTEGER NOT NULL DEFAULT 9100,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read printers" ON public.printers FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert printers" ON public.printers FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update printers" ON public.printers FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete printers" ON public.printers FOR DELETE TO public USING (true);

-- Print jobs queue
CREATE TABLE public.print_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  printer_id UUID REFERENCES public.printers(id) ON DELETE SET NULL,
  station TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  printed_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read print_jobs" ON public.print_jobs FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert print_jobs" ON public.print_jobs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update print_jobs" ON public.print_jobs FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete print_jobs" ON public.print_jobs FOR DELETE TO public USING (true);

-- Enable realtime for print_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;

-- Seed default printers
INSERT INTO public.printers (name, station, model, ip) VALUES
  ('Impressora Cozinha', 'Cozinha', 'Epson TM-T20', '192.168.1.100'),
  ('Impressora Bar', 'Bar', 'Epson TM-T20', '192.168.1.101'),
  ('Impressora Caixa', 'Caixa', 'Bematech MP-4200', '192.168.1.102');
