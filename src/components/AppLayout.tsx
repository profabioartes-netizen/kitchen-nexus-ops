import { Outlet } from "react-router-dom";
import { NavigationRail } from "./NavigationRail";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import huskyLogo from "@/assets/husky-pdv-logo.png";

export function AppLayout() {
  const isMobile = useIsMobile();
  const { profile, signOut } = useAuth();
  const { tenant, isSuperAdmin, reload } = useTenant();

  const isImpersonating =
    isSuperAdmin && typeof window !== "undefined" && !!sessionStorage.getItem("impersonate_tenant_id");

  const exitImpersonation = () => {
    try {
      sessionStorage.removeItem("impersonate_tenant_id");
    } catch {
      // ignore
    }
    reload();
    window.location.href = "/admin-platform";
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden">
      {!isMobile && <NavigationRail />}
      {isMobile && (
        <header className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b border-primary/40 bg-primary text-primary-foreground safe-area-top">
          <div className="flex items-center gap-2">
            <img src={brandLogo} alt="Espetinho do Marcelo" className="h-9 w-auto object-contain" />
            <span className="font-semibold text-sm truncate text-white">
              {profile?.full_name || "Espetinho do Marcelo"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { import("@/lib/forceUpdate").then(m => m.forceUpdate()); }}
              className="flex items-center gap-1.5 text-xs text-white/80 hover:text-accent transition-colors touch-manipulation"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-xs text-white/80 hover:text-accent transition-colors touch-manipulation"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </header>
      )}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {isImpersonating && (
          <div className="flex-shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-amber-500/15 border-b border-amber-500/40 text-amber-100 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                Modo Super Admin — visualizando o PDV de <strong>{tenant?.nome_comercio || "estabelecimento"}</strong>.
              </span>
            </div>
            <button
              onClick={exitImpersonation}
              className="px-2 py-1 rounded bg-amber-500/30 hover:bg-amber-500/50 font-medium"
            >
              Voltar ao Painel Super Admin
            </button>
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
