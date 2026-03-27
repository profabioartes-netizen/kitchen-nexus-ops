import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  ShoppingCart,
  Package,
  Printer,
  LogOut,
  Sun,
  Moon,
  RefreshCw,
  Landmark,
  Settings,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  Crown,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import coffeeLogo from "@/assets/coffee-thrones-logo.png";
import { cn } from "@/lib/utils";

type NavItem = {
  to: string;
  icon: typeof LayoutGrid;
  label: string;
};

const operationalItems: NavItem[] = [
  { to: "/", icon: LayoutGrid, label: "Comandas" },
  { to: "/caixa", icon: ShoppingCart, label: "Caixa" },
  { to: "/controle-caixa", icon: Landmark, label: "Abertura de Caixa" },
];

const managementItems: NavItem[] = [
  { to: "/produtos", icon: Package, label: "Produtos" },
  { to: "/cardapio-cliente", icon: Smartphone, label: "Cardápio Digital" },
  { to: "/impressoras", icon: Printer, label: "Impressoras" },
  { to: "/configuracoes", icon: Settings, label: "Configurações" },
];

function SectionLabel({ collapsed, label }: { collapsed: boolean; label: string }) {
  if (collapsed) {
    return <div className="mx-auto my-1 h-px w-6 bg-sidebar-border" />;
  }
  return (
    <span className="px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/50 select-none">
      {label}
    </span>
  );
}

function SidebarItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-3 rounded-lg px-3 transition-all duration-200",
          collapsed ? "justify-center h-11 w-11 mx-auto" : "h-11",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_2px_8px_hsl(var(--sidebar-primary)/0.35)]"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Active indicator bar */}
          {isActive && !collapsed && (
            <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-sidebar-primary-foreground/60" />
          )}
          <item.icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-[18px] w-[18px]")} />
          {!collapsed && (
            <span className="text-[13px] font-medium truncate">{item.label}</span>
          )}
          {/* Tooltip for collapsed mode */}
          {collapsed && (
            <span className="absolute left-full ml-2 z-50 hidden group-hover:flex items-center whitespace-nowrap rounded-md bg-popover text-popover-foreground px-2.5 py-1.5 text-xs font-medium shadow-lg border">
              {item.label}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function NavigationRail() {
  const { profile, signOut } = useAuth();
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("coffee-thrones-theme");
    return saved !== "light";
  });
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("coffee-thrones-sidebar");
    return saved === "collapsed";
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
    }
    localStorage.setItem("coffee-thrones-theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem("coffee-thrones-sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  return (
    <nav
      className={cn(
        "hidden md:flex flex-col flex-shrink-0 h-screen border-r border-sidebar-border transition-all duration-300 ease-in-out",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}
      style={{ background: "hsl(var(--sidebar-background))" }}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border flex-shrink-0 transition-all duration-300",
        collapsed ? "justify-center px-1 py-3" : "gap-3 px-4 py-3"
      )}>
        <img
          src={coffeeLogo}
          alt="Coffee Thrones"
          className={cn("object-contain transition-all duration-300", collapsed ? "h-8 w-8" : "h-9 w-9")}
        />
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="font-display text-sm text-sidebar-accent-foreground leading-tight truncate">
              Coffee Thrones
            </span>
            <span className="text-[10px] text-sidebar-foreground/50 leading-tight">Sistema PDV</span>
          </div>
        )}
      </div>

      {/* Nav sections */}
      <div className="flex-1 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden py-2 px-2 no-scrollbar">
        <SectionLabel collapsed={collapsed} label="Operacional" />
        {operationalItems.map((item) => (
          <SidebarItem key={item.to} item={item} collapsed={collapsed} />
        ))}

        <SectionLabel collapsed={collapsed} label="Gestão" />
        {managementItems.map((item) => (
          <SidebarItem key={item.to} item={item} collapsed={collapsed} />
        ))}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-0.5 px-2 pb-2 border-t border-sidebar-border pt-2 flex-shrink-0">
        {/* User info */}
        {!collapsed && profile?.full_name && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sidebar-accent/50 mb-1">
            <div className="h-7 w-7 rounded-full bg-sidebar-primary/20 flex items-center justify-center">
              <Crown className="h-3.5 w-3.5 text-sidebar-primary" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-medium text-sidebar-accent-foreground truncate">{profile.full_name}</span>
              <span className="text-[9px] text-sidebar-foreground/50 capitalize">{profile.role || "Operador"}</span>
            </div>
          </div>
        )}
        {collapsed && profile?.full_name && (
          <div className="group relative flex justify-center py-1">
            <div className="h-8 w-8 rounded-full bg-sidebar-primary/20 flex items-center justify-center">
              <Crown className="h-3.5 w-3.5 text-sidebar-primary" />
            </div>
            <span className="absolute left-full ml-2 z-50 hidden group-hover:flex items-center whitespace-nowrap rounded-md bg-popover text-popover-foreground px-2.5 py-1.5 text-xs font-medium shadow-lg border">
              {profile.full_name}
            </span>
          </div>
        )}

        {/* Theme toggle */}
        <button
          onClick={() => setIsDark((v) => !v)}
          className={cn(
            "group relative flex items-center gap-3 rounded-lg px-3 h-10 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200",
            collapsed && "justify-center w-11 mx-auto px-0"
          )}
        >
          {isDark ? <Sun className="h-[18px] w-[18px] shrink-0" /> : <Moon className="h-[18px] w-[18px] shrink-0" />}
          {!collapsed && <span className="text-[13px] font-medium">{isDark ? "Modo Claro" : "Modo Escuro"}</span>}
          {collapsed && (
            <span className="absolute left-full ml-2 z-50 hidden group-hover:flex items-center whitespace-nowrap rounded-md bg-popover text-popover-foreground px-2.5 py-1.5 text-xs font-medium shadow-lg border">
              {isDark ? "Modo Claro" : "Modo Escuro"}
            </span>
          )}
        </button>

        {/* Force update */}
        <button
          onClick={() => { import("@/lib/forceUpdate").then(m => m.forceUpdate()); }}
          className={cn(
            "group relative flex items-center gap-3 rounded-lg px-3 h-10 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all duration-200",
            collapsed && "justify-center w-11 mx-auto px-0"
          )}
        >
          <RefreshCw className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="text-[13px] font-medium">Atualizar</span>}
          {collapsed && (
            <span className="absolute left-full ml-2 z-50 hidden group-hover:flex items-center whitespace-nowrap rounded-md bg-popover text-popover-foreground px-2.5 py-1.5 text-xs font-medium shadow-lg border">
              Atualizar
            </span>
          )}
        </button>

        {/* Logout */}
        <button
          onClick={signOut}
          className={cn(
            "group relative flex items-center gap-3 rounded-lg px-3 h-10 text-sidebar-foreground hover:bg-destructive/15 hover:text-destructive transition-all duration-200",
            collapsed && "justify-center w-11 mx-auto px-0"
          )}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="text-[13px] font-medium">Sair</span>}
          {collapsed && (
            <span className="absolute left-full ml-2 z-50 hidden group-hover:flex items-center whitespace-nowrap rounded-md bg-popover text-popover-foreground px-2.5 py-1.5 text-xs font-medium shadow-lg border">
              Sair
            </span>
          )}
        </button>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 h-9 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200 mt-1",
            collapsed && "justify-center w-11 mx-auto px-0"
          )}
        >
          {collapsed ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronLeft className="h-4 w-4 shrink-0" />}
          {!collapsed && <span className="text-[11px] font-medium">Recolher menu</span>}
        </button>
      </div>
    </nav>
  );
}
