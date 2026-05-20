-- 1) REPLICA IDENTITY FULL nas tabelas que ainda estão em DEFAULT
ALTER TABLE public.restaurant_tables REPLICA IDENTITY FULL;
ALTER TABLE public.comanda_locks REPLICA IDENTITY FULL;
ALTER TABLE public.order_item_complements REPLICA IDENTITY FULL;
ALTER TABLE public.table_activity_log REPLICA IDENTITY FULL;
ALTER TABLE public.self_service_sessions REPLICA IDENTITY FULL;

-- 2) Adicionar tabelas à publicação supabase_realtime (idempotente)
DO $$
DECLARE
  t text;
  tables_to_add text[] := ARRAY[
    'orders',
    'order_items',
    'order_item_complements',
    'restaurant_tables',
    'comanda_locks',
    'payments',
    'table_activity_log',
    'self_service_sessions'
  ];
BEGIN
  FOREACH t IN ARRAY tables_to_add LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;