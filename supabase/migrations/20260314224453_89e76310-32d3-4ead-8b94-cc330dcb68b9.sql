CREATE TABLE public.self_service_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  customer_name text NOT NULL DEFAULT '',
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '60 minutes'),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.self_service_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read sessions" ON public.self_service_sessions FOR SELECT TO public USING (true);
CREATE POLICY "Anyone can insert sessions" ON public.self_service_sessions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Anyone can update sessions" ON public.self_service_sessions FOR UPDATE TO public USING (true);
CREATE POLICY "Anyone can delete sessions" ON public.self_service_sessions FOR DELETE TO public USING (true);

CREATE INDEX idx_self_service_sessions_table ON public.self_service_sessions(table_id);
CREATE INDEX idx_self_service_sessions_token ON public.self_service_sessions(session_token);