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
}

export default function OrderSelector({ orders, selectedOrderId, onSelect, onCreateNew }: Props) {
  if (orders.length <= 1) return null;

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
