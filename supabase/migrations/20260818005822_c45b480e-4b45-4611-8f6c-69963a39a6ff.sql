ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'payment',
  ADD COLUMN IF NOT EXISTS created_by_name text;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_kind_check CHECK (kind IN ('payment', 'credit'));

CREATE INDEX IF NOT EXISTS payments_order_id_kind_idx ON public.payments (order_id, kind);