import { Outlet, NavLink, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import LoadingScreen from "@/components/LoadingScreen";
import { LogOut, Building2, Users, Shield } from "lucide-react";

export default function AdminPlatformLayout() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isSuperAdmin, loading: tenantLoading } = useTenant();
  const navigate = useNavigate();

  if (authLoading || tenantLoading) return <LoadingScreen mode="full" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const link = "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors";
  const active = "bg-primary/20 text-white";
  const inactive = "text-white/70 hover:bg-white/10 hover:text-white";

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <aside className="w-64 border-r border-white/10 bg-primary flex flex-col p-4 gap-2">
        <div className="flex items-center gap-2 px-2 py-3 mb-2">
          <Shield className="h-6 w-6 text-accent" />
          <div>
            <div className="font-bold text-white">HuskyPDV</div>
            <div className="text-[10px] text-white/60 uppercase tracking-wider">Plataforma</div>
          </div>
        </div>

        <NavLink to="/admin-platform" end className={({ isActive }) => `${link} ${isActive ? active : inactive}`}>
          <Building2 className="h-4 w-4" /> Estabelecimentos
        </NavLink>
        <NavLink to="/admin-platform/usuarios" className={({ isActive }) => `${link} ${isActive ? active : inactive}`}>
          <Users className="h-4 w-4" /> Usuários
        </NavLink>

        <div className="mt-auto space-y-1">
          <button
            onClick={() => navigate("/")}
            className={`${link} ${inactive} w-full`}
          >
            ← Voltar ao PDV
          </button>
          <button onClick={signOut} className={`${link} ${inactive} w-full`}>
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
