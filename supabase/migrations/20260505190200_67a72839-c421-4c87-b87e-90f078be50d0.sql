
-- 1) Remover defaults hardcoded de tenant_id em todas as tabelas operacionais
ALTER TABLE public.orders ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.order_items ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.order_item_complements ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.payments ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.products ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.categories ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.print_jobs ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.printers ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.cash_movements ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.cash_register_sessions ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.restaurant_tables ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.restaurant_settings ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.table_activity_log ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.nfce_records ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.complements ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.complement_groups ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.product_complement_groups ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.self_service_sessions ALTER COLUMN tenant_id DROP DEFAULT;
ALTER TABLE public.comanda_locks ALTER COLUMN tenant_id DROP DEFAULT;

-- 2) Função guardiã: preenche tenant do usuário se NULL; bloqueia tenant alheio
CREATE OR REPLACE FUNCTION public.enforce_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_user_tenant uuid;
  v_is_super boolean := false;
BEGIN
  -- Service role / sem auth: confia no payload (edge functions com service key)
  IF v_user IS NULL THEN
    IF NEW.tenant_id IS NULL THEN
      RAISE EXCEPTION 'tenant_id obrigatório (operação sem usuário autenticado)';
    END IF;
    RETURN NEW;
  END IF;

  v_is_super := public.is_super_admin(v_user);
  v_user_tenant := public.current_tenant_id(v_user);

  -- INSERT/UPDATE: se tenant_id veio nulo, preencher com o do usuário
  IF NEW.tenant_id IS NULL THEN
    IF v_user_tenant IS NULL AND NOT v_is_super THEN
      RAISE EXCEPTION 'Usuário sem tenant vinculado não pode inserir dados';
    END IF;
    NEW.tenant_id := COALESCE(v_user_tenant, NEW.tenant_id);
    IF NEW.tenant_id IS NULL THEN
      RAISE EXCEPTION 'tenant_id obrigatório';
    END IF;
  END IF;

  -- Super admin pode operar em qualquer tenant
  IF v_is_super THEN
    RETURN NEW;
  END IF;

  -- Usuário comum: NEW.tenant_id deve ser igual ao seu
  IF NEW.tenant_id <> v_user_tenant THEN
    RAISE EXCEPTION 'Acesso negado: tentativa de gravar dados em outro tenant (esperado %, recebido %)', v_user_tenant, NEW.tenant_id;
  END IF;

  -- UPDATE: impedir trocar o tenant_id de um registro
  IF TG_OP = 'UPDATE' AND OLD.tenant_id IS NOT NULL AND NEW.tenant_id <> OLD.tenant_id THEN
    RAISE EXCEPTION 'Não é permitido transferir registros entre tenants';
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Aplicar trigger em todas as 19 tabelas operacionais
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'orders','order_items','order_item_complements','payments','products','categories',
    'print_jobs','printers','cash_movements','cash_register_sessions','restaurant_tables',
    'restaurant_settings','table_activity_log','nfce_records','complements','complement_groups',
    'product_complement_groups','self_service_sessions','comanda_locks'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_enforce_tenant_id ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_enforce_tenant_id BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_id()',
      t
    );
  END LOOP;
END $$;

-- 4) Função de auditoria: lista contagem de registros que escapariam ao isolamento
CREATE OR REPLACE FUNCTION public.audit_tenant_isolation()
RETURNS TABLE(table_name text, rows_without_tenant bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t text;
  c bigint;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'orders','order_items','order_item_complements','payments','products','categories',
      'print_jobs','printers','cash_movements','cash_register_sessions','restaurant_tables',
      'restaurant_settings','table_activity_log','nfce_records','complements','complement_groups',
      'product_complement_groups','self_service_sessions','comanda_locks'
    ])
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE tenant_id IS NULL', t) INTO c;
    table_name := t;
    rows_without_tenant := c;
    RETURN NEXT;
  END LOOP;
END;
$$;
