import { useState } from "react";
import { Outlet, NavLink, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import LoadingScreen from "@/components/LoadingScreen";
import { LogOut, Building2, Users, Menu, X } from "lucide-react";
import huskyLogo from "@/assets/husky-pdv-logo.png";

export default function AdminPlatformLayout() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isSuperAdmin, loading: tenantLoading } = useTenant();
  const [open, setOpen] = useState(false);

  if (authLoading || tenantLoading) return <LoadingScreen mode="full" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const link = "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors";
  const active = "bg-primary/20 text-white";
  const inactive = "text-white/70 hover:bg-white/10 hover:text-white";

  const close = () => setOpen(false);

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-primary border-b border-white/10">
        <button
          onClick={() => setOpen(true)}
          className="p-2 -ml-2 rounded text-white/80 hover:bg-white/10"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <img src={huskyLogo} alt="HuskyPDV" className="h-8 w-auto object-contain" />
        <div className="w-9" />
      </header>

      {/* Overlay */}
      {open && (
        <button
          aria-label="Fechar menu"
          onClick={close}
          className="md:hidden fixed inset-0 z-40 bg-black/60"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static z-50 top-0 left-0 h-full w-64 border-r border-white/10 bg-primary flex flex-col p-4 gap-2 transform transition-transform duration-200 ease-out
          ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}
      >
        <div className="md:hidden flex justify-end">
          <button
            onClick={close}
            className="p-2 -mr-2 rounded text-white/70 hover:bg-white/10"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col items-center px-2 pt-1 pb-3 mb-2">
          <img src={huskyLogo} alt="HuskyPDV" className="w-full max-w-[160px] h-auto object-contain drop-shadow-lg" />
          <div className="text-[10px] text-white/60 uppercase tracking-[0.2em] mt-1">Plataforma</div>
        </div>

        <NavLink to="/admin-platform" end onClick={close} className={({ isActive }) => `${link} ${isActive ? active : inactive}`}>
          <Building2 className="h-4 w-4" /> Estabelecimentos
        </NavLink>
        <NavLink to="/admin-platform/usuarios" onClick={close} className={({ isActive }) => `${link} ${isActive ? active : inactive}`}>
          <Users className="h-4 w-4" /> Usuários
        </NavLink>

        <div className="mt-auto space-y-1">
          <button onClick={signOut} className={`${link} ${inactive} w-full`}>
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
