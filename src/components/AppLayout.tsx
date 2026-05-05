import { Outlet } from "react-router-dom";
import { NavigationRail } from "./NavigationRail";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, RefreshCw } from "lucide-react";
import brandLogo from "@/assets/logo-espetinho.png";

export function AppLayout() {
  const isMobile = useIsMobile();
  const { profile, signOut } = useAuth();

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
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
