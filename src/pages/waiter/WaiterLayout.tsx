import { Outlet, NavLink, Navigate } from "react-router-dom";
import { LayoutGrid, ClipboardList, UserCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const tabs = [
  { to: "/garcom", icon: LayoutGrid, label: "Comandas", end: true },
  { to: "/garcom/pedidos", icon: ClipboardList, label: "Pedidos" },
  { to: "/garcom/perfil", icon: UserCircle, label: "Perfil" },
];

export default function WaiterLayout() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/garcom/login" replace />;

  // Only waiter (and admin) roles can access
  const role = profile?.role ?? "waiter";
  if (!["waiter", "admin", "manager"].includes(role)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-background p-6 text-center">
        <p className="text-lg font-semibold mb-2">Acesso negado</p>
        <p className="text-sm text-muted-foreground">Seu perfil não tem permissão para o modo garçom.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="flex-shrink-0 border-t bg-card safe-area-bottom">
        <div className="flex justify-around items-center h-16">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-4 py-2 text-[11px] font-medium transition-colors ${
                  isActive
                    ? "text-accent"
                    : "text-muted-foreground"
                }`
              }
            >
              <tab.icon className="h-6 w-6" />
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
