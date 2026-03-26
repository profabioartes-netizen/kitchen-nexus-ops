CREATE TABLE public.nfce_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  chave_acesso text,
  url_danfe text,
  error_message text,
  raw_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nfce_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read nfce_records" ON public.nfce_records FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert nfce_records" ON public.nfce_records FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update nfce_records" ON public.nfce_records FOR UPDATE TO public USING (true);

CREATE INDEX idx_nfce_records_order_id ON public.nfce_records(order_id);