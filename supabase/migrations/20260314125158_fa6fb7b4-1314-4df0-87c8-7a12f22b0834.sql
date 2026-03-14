
-- Cash register sessions (abertura/fechamento de caixa)
CREATE TABLE public.cash_register_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_at timestamp with time zone NOT NULL DEFAULT now(),
  closed_at timestamp with time zone,
  opening_amount numeric NOT NULL DEFAULT 0,
  closing_amount numeric,
  opened_by_name text NOT NULL DEFAULT '',
  closed_by_name text,
  notes text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_register_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cash_register_sessions" ON public.cash_register_sessions FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert cash_register_sessions" ON public.cash_register_sessions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update cash_register_sessions" ON public.cash_register_sessions FOR UPDATE TO public USING (true);

-- Cash movements (sangria, suprimento, vendas em dinheiro)
CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cash_register_sessions(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'opening', 'sale', 'withdraw', 'supply'
  amount numeric NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cash_movements" ON public.cash_movements FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert cash_movements" ON public.cash_movements FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can delete cash_movements" ON public.cash_movements FOR DELETE TO public USING (true);
