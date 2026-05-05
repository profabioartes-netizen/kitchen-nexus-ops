import { useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import LoadingScreen from "@/components/LoadingScreen";
import { toast } from "sonner";

/**
 * Página invisível usada quando o Super Admin clica em "Acessar PDV"
 * de um estabelecimento. Recebe o tenant_id por query param, marca esse
 * tenant como "impersonado" (apenas para a aba atual via sessionStorage)
 * e redireciona para a raiz para entrar no PDV daquele cliente.
 */
export default function ImpersonateTenantPage() {
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: tenantLoading, reload } = useTenant();

  const tenantId = params.get("tenant");

  useEffect(() => {
    if (authLoading || tenantLoading) return;
    if (!user) return;
    if (!isSuperAdmin) return;
    if (!tenantId) return;

    try {
      sessionStorage.setItem("impersonate_tenant_id", tenantId);
    } catch {
      // ignore storage errors
    }
    // Recarregar contexto de tenant para puxar o impersonado
    reload();
  }, [authLoading, tenantLoading, user, isSuperAdmin, tenantId, reload]);

  if (authLoading || tenantLoading) return <LoadingScreen mode="full" />;

  if (!user) {
    // Não logado: mandar para login operacional
    return <Navigate to="/login" replace />;
  }

  if (!isSuperAdmin) {
    toast.error("Acesso negado: apenas Super Admin pode acessar o PDV de outros estabelecimentos.");
    return <Navigate to="/" replace />;
  }

  if (!tenantId) {
    return <Navigate to="/admin-platform" replace />;
  }

  return <Navigate to="/" replace />;
}
