-- ============================================================
-- FASE 1: TENANTS + ROLES
-- ============================================================

CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin_cliente', 'atendente', 'caixa', 'cozinha');
CREATE TYPE public.tenant_status AS ENUM ('ativo', 'suspenso', 'cancelado');

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_comercio text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  cor_primaria text DEFAULT '#1E40AF',
  cor_secundaria text DEFAULT '#FACC15',
  status public.tenant_status NOT NULL DEFAULT 'ativo',
  plano text NOT NULL DEFAULT 'trial',
  data_expiracao_plano timestamptz,
  owner_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' AND length(slug) BETWEEN 2 AND 60)
);

CREATE INDEX idx_tenants_slug ON public.tenants(slug);
CREATE INDEX idx_tenants_status ON public.tenants(status);

CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de vínculo usuário ↔ tenant ↔ role
CREATE TABLE public.user_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role)
);

CREATE INDEX idx_user_tenants_user ON public.user_tenants(user_id);
CREATE INDEX idx_user_tenants_tenant ON public.user_tenants(tenant_id);

-- profiles: adicionar tenant_id principal e default_tenant
ALTER TABLE public.profiles
  ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);

-- ============================================================
-- FUNÇÕES DE SEGURANÇA (security definer, evitam recursão RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_tenants
    WHERE user_id = _user_id AND role = 'super_admin' AND active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id(_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.user_belongs_to_tenant(_tenant_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_tenants
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.user_has_role_in_tenant(_tenant_id uuid, _role public.app_role, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin(_user_id) OR EXISTS (
    SELECT 1 FROM public.user_tenants
    WHERE user_id = _user_id AND tenant_id = _tenant_id AND role = _role AND active = true
  )
$$;

CREATE OR REPLACE FUNCTION public.tenant_is_active(_tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.tenants WHERE id = _tenant_id AND status = 'ativo')
$$;

-- ============================================================
-- SEED: tenant inicial + super_admin
-- ============================================================

INSERT INTO public.tenants (id, nome_comercio, slug, status, plano, cor_primaria, cor_secundaria)
VALUES ('00000000-0000-0000-0000-000000000001', 'Espetinho do Marcelo', 'espetinhodomarcelo', 'ativo', 'pro', '#1E40AF', '#FACC15');

-- Garantir profile do super_admin (caso o trigger não tenha rodado)
INSERT INTO public.profiles (id, full_name, role, active)
VALUES ('ebc2395a-b1b9-4194-a91d-38f060f87179', 'Fábio (Plataforma HuskyPDV)', 'admin', true)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

-- Vincular como super_admin
INSERT INTO public.user_tenants (user_id, tenant_id, role)
VALUES ('ebc2395a-b1b9-4194-a91d-38f060f87179', '00000000-0000-0000-0000-000000000001', 'super_admin');

-- Vincular todos os profiles existentes ao tenant inicial como admin_cliente (preserva acesso operacional)
UPDATE public.profiles SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

INSERT INTO public.user_tenants (user_id, tenant_id, role)
SELECT p.id, '00000000-0000-0000-0000-000000000001'::uuid,
  CASE
    WHEN p.role IN ('admin', 'manager') THEN 'admin_cliente'::public.app_role
    WHEN p.role = 'waiter' THEN 'atendente'::public.app_role
    WHEN p.role = 'cashier' THEN 'caixa'::public.app_role
    WHEN p.role = 'kitchen' THEN 'cozinha'::public.app_role
    ELSE 'atendente'::public.app_role
  END
FROM public.profiles p
WHERE p.id != 'ebc2395a-b1b9-4194-a91d-38f060f87179'
ON CONFLICT DO NOTHING;

-- ============================================================
-- FASE 2: tenant_id em todas as tabelas operacionais
-- ============================================================

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'restaurant_tables','orders','order_items','order_item_complements',
    'products','categories','complements','complement_groups','product_complement_groups',
    'printers','print_jobs','payments','cash_movements','cash_register_sessions',
    'restaurant_settings','nfce_records','table_activity_log','comanda_locks','self_service_sessions'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE', tbl);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', tbl, '00000000-0000-0000-0000-000000000001');
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', tbl);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT %L', tbl, '00000000-0000-0000-0000-000000000001');
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_tenant ON public.%I(tenant_id)', tbl, tbl);
  END LOOP;
END $$;

-- restaurant_settings: chave passa a ser por tenant — drop unique antiga se existir, criar composta
ALTER TABLE public.restaurant_settings DROP CONSTRAINT IF EXISTS restaurant_settings_pkey;
ALTER TABLE public.restaurant_settings DROP CONSTRAINT IF EXISTS restaurant_settings_key_key;
ALTER TABLE public.restaurant_settings ADD CONSTRAINT restaurant_settings_pkey PRIMARY KEY (tenant_id, key);

-- ============================================================
-- RLS ENDURECIDA
-- ============================================================

-- TENANTS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin gerencia tenants" ON public.tenants
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Usuários veem o próprio tenant" ON public.tenants
  FOR SELECT TO authenticated
  USING (public.user_belongs_to_tenant(id));

-- USER_TENANTS
ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin gerencia vínculos" ON public.user_tenants
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_cliente gerencia vínculos do próprio tenant" ON public.user_tenants
  FOR ALL TO authenticated
  USING (public.user_has_role_in_tenant(tenant_id, 'admin_cliente'))
  WITH CHECK (public.user_has_role_in_tenant(tenant_id, 'admin_cliente') AND role <> 'super_admin');

CREATE POLICY "Usuário vê os próprios vínculos" ON public.user_tenants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Helper: gera policies padrão tenant-scoped para uma tabela
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'restaurant_tables','orders','order_items','order_item_complements',
    'products','categories','complements','complement_groups','product_complement_groups',
    'printers','print_jobs','payments','cash_movements','cash_register_sessions',
    'restaurant_settings','nfce_records','table_activity_log','comanda_locks','self_service_sessions'
  ];
  pol record;
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Drop ALL existing policies on the table
    FOR pol IN SELECT polname FROM pg_policy WHERE polrelid = ('public.'||tbl)::regclass LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.polname, tbl);
    END LOOP;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    -- SELECT: pertence ao tenant ou super_admin
    EXECUTE format($p$
      CREATE POLICY "tenant_select" ON public.%I
        FOR SELECT TO authenticated
        USING (public.user_belongs_to_tenant(tenant_id))
    $p$, tbl);

    -- INSERT: deve ser do próprio tenant (ou super_admin)
    EXECUTE format($p$
      CREATE POLICY "tenant_insert" ON public.%I
        FOR INSERT TO authenticated
        WITH CHECK (public.user_belongs_to_tenant(tenant_id))
    $p$, tbl);

    -- UPDATE: do próprio tenant
    EXECUTE format($p$
      CREATE POLICY "tenant_update" ON public.%I
        FOR UPDATE TO authenticated
        USING (public.user_belongs_to_tenant(tenant_id))
        WITH CHECK (public.user_belongs_to_tenant(tenant_id))
    $p$, tbl);

    -- DELETE: do próprio tenant
    EXECUTE format($p$
      CREATE POLICY "tenant_delete" ON public.%I
        FOR DELETE TO authenticated
        USING (public.user_belongs_to_tenant(tenant_id))
    $p$, tbl);
  END LOOP;
END $$;

-- PROFILES: super_admin gerencia tudo; usuário vê próprio + colegas do mesmo tenant
DROP POLICY IF EXISTS "Users can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Super admin gerencia profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Profile próprio" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR (tenant_id IS NOT NULL AND public.user_belongs_to_tenant(tenant_id)));

CREATE POLICY "Inserir próprio profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Atualizar próprio profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "admin_cliente atualiza profiles do tenant" ON public.profiles
  FOR UPDATE TO authenticated
  USING (tenant_id IS NOT NULL AND public.user_has_role_in_tenant(tenant_id, 'admin_cliente'))
  WITH CHECK (tenant_id IS NOT NULL AND public.user_has_role_in_tenant(tenant_id, 'admin_cliente'));

-- ============================================================
-- Atualizar handle_new_user para opcionalmente herdar tenant_id de metadata
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := NULLIF(NEW.raw_user_meta_data->>'tenant_id', '')::uuid;

  INSERT INTO public.profiles (id, full_name, tenant_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_tenant_id
  );
  RETURN NEW;
END;
$$;