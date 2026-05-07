import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Clock, ShoppingBag } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantRealtime } from "@/hooks/useTenantRealtime";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function WaiterOrdersPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  // Realtime estrito por tenant
  useTenantRealtime({
    channelKey: "waiter-orders",
    tables: ["orders", "order_items"],
    invalidateKeys: [["waiter_open_orders"]],
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["waiter_open_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, restaurant_tables(name, sort_order)")
        .in("status", ["open", "billing_in_progress", "paid_pending_finalization"]);
      if (error) throw error;
      return data;
    },
  });

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a: any, b: any) => {
      const aSort = (a as any)?.restaurant_tables?.sort_order ?? Number.MAX_SAFE_INTEGER;
      const bSort = (b as any)?.restaurant_tables?.sort_order ?? Number.MAX_SAFE_INTEGER;
      if (aSort !== bSort) return aSort - bSort;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [orders]);

  // Show all open orders but highlight waiter's own
  const myOrders = sortedOrders.filter((o) => o.waiter_name === profile?.full_name);
  const otherOrders = sortedOrders.filter((o) => o.waiter_name !== profile?.full_name);

  if (isLoading) {
    return <LoadingScreen />;
  }

  const renderOrder = (order: any) => (
    <button
      key={order.id}
      onClick={() => {
        if (order.table_id) navigate(`/garcom/mesa/${order.table_id}`);
      }}
      className="w-full flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-all active:scale-[0.98]"
    >
      <div className="rounded-lg bg-accent/10 p-2.5">
        <ShoppingBag className="h-5 w-5 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">
          {(order as any).restaurant_tables?.name ?? "Sem comanda"}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(order.created_at), { addSuffix: true, locale: ptBR })}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end flex-shrink-0">
        <span className="text-sm font-semibold">R$ {Number(order.total).toFixed(2)}</span>
        {order.waiter_name && (
          <span className="text-[10px] text-muted-foreground mt-0.5">{order.waiter_name}</span>
        )}
      </div>
    </button>
  );

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold mb-4">Pedidos Abertos</h1>

      {orders.length === 0 && (
        <div className="text-center py-12">
          <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum pedido aberto no momento</p>
        </div>
      )}

      {myOrders.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Meus pedidos</p>
          <div className="space-y-2 mb-6">{myOrders.map(renderOrder)}</div>
        </>
      )}

      {otherOrders.length > 0 && (
        <>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Outros pedidos</p>
          <div className="space-y-2">{otherOrders.map(renderOrder)}</div>
        </>
      )}
    </div>
  );
}
