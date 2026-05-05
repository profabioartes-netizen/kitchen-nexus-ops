-- Allow tenant admins (admin_cliente) to update their own tenant's name and logo.
-- Other fields (status, plano, slug, datas) remain super-admin only.

CREATE POLICY "Admin do tenant edita nome e logo"
ON public.tenants
FOR UPDATE
TO authenticated
USING (
  public.user_has_role_in_tenant(id, 'admin_cliente'::app_role)
)
WITH CHECK (
  public.user_has_role_in_tenant(id, 'admin_cliente'::app_role)
);