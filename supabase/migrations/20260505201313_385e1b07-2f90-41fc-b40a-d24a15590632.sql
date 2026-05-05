-- Public function to lookup tenant by slug for personalized login
CREATE OR REPLACE FUNCTION public.get_tenant_by_slug(_slug text)
RETURNS TABLE (
  id uuid,
  nome_comercio text,
  slug text,
  logo_url text,
  cor_primaria text,
  cor_secundaria text,
  status tenant_status
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, nome_comercio, slug, logo_url, cor_primaria, cor_secundaria, status
  FROM public.tenants
  WHERE slug = lower(_slug)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_by_slug(text) TO anon, authenticated;