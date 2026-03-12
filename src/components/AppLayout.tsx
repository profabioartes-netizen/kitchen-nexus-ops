import { Outlet } from "react-router-dom";
import { NavigationRail } from "./NavigationRail";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/AuthContext";
import { LogOut, RefreshCw } from "lucide-react";
import coffeeLogo from "@/assets/coffee-thrones-logo.png";

export function AppLayout() {
  const isMobile = useIsMobile();
  const { profile, signOut } = useAuth();

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden">
      {!isMobile && <NavigationRail />}
      {isMobile && (
        <header className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b bg-card safe-area-top">
          <div className="flex items-center gap-2">
            <img src={coffeeLogo} alt="Coffee Thrones" className="h-8 w-auto object-contain" />
            <span className="font-semibold text-sm truncate">
              {profile?.full_name || "Coffee Thrones"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent transition-colors touch-manipulation"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors touch-manipulation"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </header>
      )}
      <main className="flex-1 min-h-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
