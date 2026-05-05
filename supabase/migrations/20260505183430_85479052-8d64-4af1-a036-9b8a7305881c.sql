REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_tenant_id(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_belongs_to_tenant(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_has_role_in_tenant(uuid, public.app_role, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.tenant_is_active(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_belongs_to_tenant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role_in_tenant(uuid, public.app_role, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_is_active(uuid) TO authenticated;