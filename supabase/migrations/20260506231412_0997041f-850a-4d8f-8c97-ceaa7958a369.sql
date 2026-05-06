-- Backfill profiles + tornar current_tenant_id resiliente + sync automático

-- 1) Backfill: criar/atualizar profiles para usuários com vínculo ativo
INSERT INTO public.profiles (id, tenant_id)
SELECT ut.user_id, ut.tenant_id
FROM public.user_tenants ut
WHERE ut.active = true
ON CONFLICT (id) DO UPDATE
  SET tenant_id = COALESCE(public.profiles.tenant_id, EXCLUDED.tenant_id);

-- 2) current_tenant_id com fallback para user_tenants
CREATE OR REPLACE FUNCTION public.current_tenant_id(_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT tenant_id FROM public.profiles WHERE id = _user_id LIMIT 1),
    (SELECT tenant_id FROM public.user_tenants
       WHERE user_id = _user_id AND active = true
       ORDER BY created_at ASC LIMIT 1)
  )
$$;

-- 3) Trigger: sincronizar profiles.tenant_id sempre que user_tenants for inserido/atualizado
CREATE OR REPLACE FUNCTION public.sync_profile_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.active = true AND NEW.tenant_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, tenant_id)
    VALUES (NEW.user_id, NEW.tenant_id)
    ON CONFLICT (id) DO UPDATE
      SET tenant_id = COALESCE(public.profiles.tenant_id, EXCLUDED.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_tenant ON public.user_tenants;
CREATE TRIGGER trg_sync_profile_tenant
AFTER INSERT OR UPDATE ON public.user_tenants
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_tenant();
