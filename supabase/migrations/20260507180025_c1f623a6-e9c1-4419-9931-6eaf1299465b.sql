
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status         ON public.orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_table_status   ON public.orders(tenant_id, table_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created_at     ON public.orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_status     ON public.order_items(order_id, preparation_status);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_created   ON public.order_items(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_created      ON public.payments(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order               ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_table_activity_tenant_created ON public.table_activity_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_table_activity_order         ON public.table_activity_log(order_id);
CREATE INDEX IF NOT EXISTS idx_comanda_locks_table          ON public.comanda_locks(table_id);
CREATE INDEX IF NOT EXISTS idx_nfce_records_order           ON public.nfce_records(order_id);
CREATE INDEX IF NOT EXISTS idx_nfce_records_tenant_status   ON public.nfce_records(tenant_id, status);

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
