import { User, Plus } from "lucide-react";

interface Order {
  id: string;
  customer_name: string | null;
  waiter_name: string | null;
  total: number;
  created_at: string;
  status: string;
  origin?: string;
}

interface Props {
  orders: Order[];
  selectedOrderId: string | null;
  onSelect: (orderId: string) => void;
  onCreateNew?: () => void;
  vertical?: boolean;
}

export default function OrderSelector({ orders, selectedOrderId, onSelect, onCreateNew, vertical }: Props) {
  if (orders.length <= 1 && !vertical) return null;

  // Vertical sidebar mode (desktop with multiple orders)
  if (vertical) {
    return (
      <div className="w-44 border-r bg-secondary/20 flex flex-col overflow-hidden flex-shrink-0">
        <div className="px-3 py-2.5 border-b flex-shrink-0">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Comandas ({orders.length})
          </span>
        </div>
        <div className="flex-1 overflow-auto py-1.5 space-y-1 px-2">
          {orders.map((o) => {
            const isActive = o.id === selectedOrderId;
            const label = o.customer_name || o.waiter_name || "Sem nome";
            return (
              <button
                key={o.id}
                onClick={() => onSelect(o.id)}
                className={`w-full flex flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors touch-manipulation ${
                  isActive
                    ? "bg-accent text-accent-foreground shadow-sm"
                    : "bg-card border border-border text-foreground hover:bg-secondary"
                }`}
              >
                <div className="flex items-center gap-1.5 w-full">
                  <User className="h-3 w-3 shrink-0" />
                  <span className="text-xs font-medium truncate flex-1">{label}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1 w-full">
                  {o.origin === "self_service" && (
                    <span className="text-[8px] font-bold bg-orange-500/20 text-orange-700 rounded px-1 py-0.5 uppercase leading-none">QR</span>
                  )}
                  {o.origin === "waiter" && (
                    <span className="text-[8px] font-bold bg-blue-500/20 text-blue-700 rounded px-1 py-0.5 uppercase leading-none">Garçom</span>
                  )}
                  <span className={`text-[10px] ml-auto tabular-nums ${isActive ? "text-accent-foreground/70" : "text-muted-foreground"}`}>
                    R$ {Number(o.total).toFixed(0)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        {onCreateNew && (
          <div className="px-2 py-2 border-t flex-shrink-0">
            <button
              onClick={onCreateNew}
              className="w-full flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-medium border border-dashed border-border text-muted-foreground hover:bg-secondary transition-colors touch-manipulation"
            >
              <Plus className="h-3 w-3" />
              Nova Comanda
            </button>
          </div>
        )}
      </div>
    );
  }

  // Horizontal mode (mobile / fallback)
  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b bg-secondary/30 overflow-x-auto scrollbar-hide">
      <span className="text-[10px] font-medium text-muted-foreground shrink-0 uppercase tracking-wider mr-1">
        Comandas
      </span>
      {orders.map((o) => {
        const isActive = o.id === selectedOrderId;
        const label = o.customer_name || o.waiter_name || "Sem nome";
        return (
          <button
            key={o.id}
            onClick={() => onSelect(o.id)}
            className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors touch-manipulation ${
              isActive
                ? "bg-accent text-accent-foreground shadow-sm"
                : "bg-card border border-border text-foreground hover:bg-secondary"
            }`}
          >
            <User className="h-3 w-3" />
            <span className="max-w-[100px] truncate">{label}</span>
            {o.origin === "self_service" && (
              <span className="text-[8px] font-bold bg-orange-500/20 text-orange-700 rounded px-1 py-0.5 uppercase leading-none">QR</span>
            )}
            {o.origin === "waiter" && (
              <span className="text-[8px] font-bold bg-blue-500/20 text-blue-700 rounded px-1 py-0.5 uppercase leading-none">Garçom</span>
            )}
            <span className={`text-[10px] ${isActive ? "text-accent-foreground/70" : "text-muted-foreground"}`}>
              R$ {Number(o.total).toFixed(0)}
            </span>
          </button>
        );
      })}
      {onCreateNew && (
        <button
          onClick={onCreateNew}
          className="shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium border border-dashed border-border text-muted-foreground hover:bg-secondary transition-colors touch-manipulation"
        >
          <Plus className="h-3 w-3" />
          Nova
        </button>
      )}
    </div>
  );
}
