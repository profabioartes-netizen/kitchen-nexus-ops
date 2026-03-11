import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  ShoppingCart,
  BarChart3,
  Package,
  Printer,
  LogOut,
  Sun,
  Moon,
  DollarSign,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import coffeeLogo from "@/assets/coffee-thrones-logo.png";

const navItems = [
  { to: "/", icon: LayoutGrid, label: "Comandas" },
  { to: "/caixa", icon: ShoppingCart, label: "Caixa" },
  { to: "/produtos", icon: Package, label: "Produtos" },
  { to: "/impressoras", icon: Printer, label: "Impressoras" },
  { to: "/relatorios", icon: BarChart3, label: "Relatórios" },
  { to: "/clientes", icon: DollarSign, label: "Vendas" },
];

export function NavigationRail() {
  const { profile, signOut } = useAuth();
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem("coffee-thrones-theme");
    return saved !== "light";
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.add("light");
    }
    localStorage.setItem("coffee-thrones-theme", isDark ? "dark" : "light");
  }, [isDark]);

  return (
    <>
      {/* Desktop: vertical sidebar */}
      <nav className="nav-rail flex-shrink-0 hidden md:flex flex-col">
        <div className="mb-6 flex flex-col items-center px-2 pt-2">
          <img src={coffeeLogo} alt="Coffee Thrones" className="h-16 w-auto object-contain" />
        </div>

        <div className="flex flex-col gap-1 w-full px-2 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 rounded-md py-2.5 px-1 text-[11px] font-medium transition-colors ${
                  isActive
                    ? "bg-nav-active text-nav-active-foreground"
                    : "text-nav-foreground hover:bg-sidebar-accent"
                }`
              }
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Theme toggle + User info + logout */}
        <div className="px-2 pb-3 flex flex-col items-center gap-2">
          <button
            onClick={() => setIsDark((v) => !v)}
            className="flex flex-col items-center gap-1 rounded-md py-2 px-1 text-[11px] font-medium text-nav-foreground hover:bg-sidebar-accent transition-colors w-full"
            title={isDark ? "Modo Claro" : "Modo Escuro"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span>{isDark ? "Claro" : "Escuro"}</span>
          </button>
          {profile?.full_name && (
            <span className="text-[10px] text-nav-foreground text-center leading-tight truncate w-full">
              {profile.full_name}
            </span>
          )}
          <button
            onClick={signOut}
            className="flex flex-col items-center gap-1 rounded-md py-2 px-1 text-[11px] font-medium text-nav-foreground hover:bg-sidebar-accent transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </button>
        </div>
      </nav>

      {/* Mobile: bottom navigation bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-sidebar-border flex items-center justify-around px-1 py-1.5 safe-area-bottom">
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 rounded-md py-1.5 px-2 text-[10px] font-medium transition-colors ${
                isActive
                  ? "bg-nav-active text-nav-active-foreground"
                  : "text-nav-foreground"
              }`
            }
          >
            <item.icon className="h-4.5 w-4.5" />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setIsDark((v) => !v)}
          className="flex flex-col items-center gap-0.5 rounded-md py-1.5 px-2 text-[10px] font-medium text-nav-foreground"
        >
          {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          <span>{isDark ? "Claro" : "Escuro"}</span>
        </button>
      </nav>
    </>
  );
}
