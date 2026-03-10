import { NavLink } from "react-router-dom";
import {
  LayoutGrid,
  ShoppingCart,
  BarChart3,
  Package,
  Warehouse,
  Settings,
  ChefHat,
} from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutGrid, label: "Mesas" },
  { to: "/caixa", icon: ShoppingCart, label: "Caixa" },
  { to: "/produtos", icon: Package, label: "Produtos" },
  { to: "/estoque", icon: Warehouse, label: "Estoque" },
  { to: "/relatorios", icon: BarChart3, label: "Relatórios" },
  { to: "/gestao", icon: Settings, label: "Gestão" },
];

export function NavigationRail() {
  return (
    <nav className="nav-rail flex-shrink-0">
      <div className="mb-6 flex flex-col items-center gap-1">
        <ChefHat className="h-7 w-7 text-nav-active" />
        <span className="font-display text-[10px] tracking-wide text-nav-active">
          KILO
        </span>
      </div>

      <div className="flex flex-col gap-1 w-full px-2">
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
    </nav>
  );
}
