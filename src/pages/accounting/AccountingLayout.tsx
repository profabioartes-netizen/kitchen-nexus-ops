import { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, FileText, LogOut } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";

export default function AccountingLayout() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate("/contabilidade/login", { replace: true });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();

      if (profile?.role !== "contabilidade") {
        await supabase.auth.signOut();
        navigate("/contabilidade/login", { replace: true });
        return;
      }
      setAuthorized(true);
      setLoading(false);
    };
    check();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/contabilidade/login", { replace: true });
  };

  if (loading || !authorized) return <LoadingScreen mode="full" />;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
    }`;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r bg-card p-4">
        <div className="mb-6 flex items-center gap-2 px-1">
          <BarChart3 className="h-6 w-6 text-accent" />
          <div>
            <h2 className="text-sm font-semibold leading-tight">Contabilidade</h2>
            <p className="text-[10px] text-muted-foreground">Coffee Thrones</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          <NavLink to="/contabilidade" end className={linkClass}>
            <BarChart3 className="h-4 w-4" />
            Dashboard
          </NavLink>
          <NavLink to="/contabilidade/vendas" className={linkClass}>
            <FileText className="h-4 w-4" />
            Vendas
          </NavLink>
        </nav>

        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <header className="md:hidden flex items-center justify-between border-b bg-card px-4 py-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-accent" />
            <span className="text-sm font-semibold">Contabilidade</span>
          </div>
          <div className="flex gap-2">
            <NavLink to="/contabilidade" end className={({ isActive }) => `p-2 rounded ${isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
              <BarChart3 className="h-4 w-4" />
            </NavLink>
            <NavLink to="/contabilidade/vendas" className={({ isActive }) => `p-2 rounded ${isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground"}`}>
              <FileText className="h-4 w-4" />
            </NavLink>
            <button onClick={handleSignOut} className="p-2 text-muted-foreground">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
