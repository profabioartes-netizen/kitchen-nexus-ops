import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Users, ChefHat, Droplets } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type TableStatus = "free" | "occupied" | "bill" | "delivered";

const statusLabels: Record<TableStatus, string> = {
  free: "Livre",
  occupied: "Pendente",
  bill: "Conta",
  delivered: "ENTREGUE",
};

const statusColors: Record<TableStatus, string> = {
  free: "border-l-[hsl(var(--status-free))] bg-[hsl(var(--status-free)/0.06)]",
  occupied: "border-l-[#c7b8f0] bg-[#ece8fb]",
  bill: "border-l-[hsl(var(--status-bill))] bg-[hsl(var(--status-bill)/0.06)]",
  delivered: "border-l-[#16a34a] bg-[#16a34a/0.06]",
};

export default function WaiterTablesPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Realtime: sync tables and orders instantly
  useEffect(() => {
    const channel = supabase
      .channel('waiter-tables-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => {
        queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comanda_locks' }, () => {
        queryClient.invalidateQueries({ queryKey: ["active_locks"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        queryClient.invalidateQueries({ queryKey: ["water_alerts_waiter"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["restaurant_tables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: openOrders = [] } = useQuery({
    queryKey: ["open_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .in("status", ["open", "billing_in_progress", "paid_pending_finalization"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const ordersByTable = openOrders.reduce<Record<string, (typeof openOrders)[0]>>((acc, o) => {
    if (o.table_id && !acc[o.table_id]) acc[o.table_id] = o;
    return acc;
  }, {});

  const openOrderIds = useMemo(() => openOrders.map((o) => o.id), [openOrders]);

  const WATER_NAMES = ["água com gás", "água sem gás"];
  const { data: waterAlertOrders = {} } = useQuery({
    queryKey: ["water_alerts_waiter", openOrderIds],
    queryFn: async () => {
      if (openOrderIds.length === 0) return {};
      const { data, error } = await supabase
        .from("order_items")
        .select("id, order_id, product_name, quantity")
        .in("order_id", openOrderIds)
        .is("delivered_at", null);
      if (error) throw error;
      const map: Record<string, { ids: string[]; names: string[] }> = {};
      for (const item of data) {
        if (WATER_NAMES.includes(item.product_name.toLowerCase().trim())) {
          if (!map[item.order_id]) map[item.order_id] = { ids: [], names: [] };
          map[item.order_id].ids.push(item.id);
          map[item.order_id].names.push(item.product_name);
        }
      }
      return map;
    },
    enabled: openOrderIds.length > 0,
  });

  const dismissWaterAlert = useMutation({
    mutationFn: async (itemIds: string[]) => {
      const { error } = await supabase
        .from("order_items")
        .update({ delivered_at: new Date().toISOString() })
        .in("id", itemIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["water_alerts_waiter"] });
      toast.success("Águas marcadas como entregues!");
    },
    onError: () => toast.error("Erro ao marcar águas como entregues"),
  });

  const occupied = tables.filter((t) => t.status === "occupied").length;

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="p-4 pb-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ChefHat className="h-6 w-6 text-accent" />
          <h1 className="text-lg font-semibold">Comandas</h1>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-card border px-3 py-1.5">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{occupied}/{tables.length}</span>
        </div>
      </div>

      {/* Status legend */}
      <div className="flex gap-3 mb-4 overflow-x-auto">
        {(["free", "occupied", "bill"] as TableStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-1.5 flex-shrink-0">
            <div className={`h-2.5 w-2.5 rounded-full table-status-${s} border`} />
            <span className="text-[10px] text-muted-foreground">{statusLabels[s]}</span>
          </div>
        ))}
      </div>

      {/* Greeting */}
      {profile?.full_name && (
        <p className="text-sm text-muted-foreground mb-3">
          Olá, <span className="font-medium text-foreground">{profile.full_name}</span>
        </p>
      )}

      {/* Table list */}
      <div className="space-y-2">
        {tables.map((table) => {
          const order = ordersByTable[table.id];
          const status = table.status as TableStatus;
          const waterAlert = order ? waterAlertOrders[order.id] : undefined;
          return (
            <button
              key={table.id}
              onClick={() => navigate(`/garcom/mesa/${table.id}`)}
              className={`w-full flex items-center gap-3 rounded-xl border border-l-4 p-4 text-left transition-all active:scale-[0.98] ${statusColors[status] || ""} relative`}
            >
              {/* Water alert icon */}
              {waterAlert && (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    dismissWaterAlert.mutate(waterAlert.ids);
                  }}
                  className="absolute -top-2 -left-1 z-30 flex items-center gap-1 rounded-full bg-destructive text-destructive-foreground px-2 py-1 animate-pulse shadow-lg"
                  title={`Entregar: ${waterAlert.names.join(", ")}`}
                >
                  <Droplets className="h-3.5 w-3.5" />
                  <span className="text-[8px] font-black uppercase leading-none">ÁGUA</span>
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-base truncate">
                    {order?.customer_name || (table as any).default_name || table.name}
                  </span>
                  {(order as any)?.current_location && (
                    <span className="text-[10px] bg-accent/15 text-accent rounded-full px-2 py-0.5 flex-shrink-0">
                      📍 {(order as any).current_location}
                    </span>
                  )}
                  {!(order as any)?.current_location && (table as any).sector && (
                    <span className="text-[10px] bg-secondary rounded-full px-2 py-0.5 text-muted-foreground flex-shrink-0">
                      📍 {(table as any).sector}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {order?.customer_name && (
                    <span className="text-[10px] text-muted-foreground">{(table as any).default_name || table.name}</span>
                  )}
                  {(order as any)?.origin_location && (order as any)?.current_location !== (order as any)?.origin_location && (
                    <span className="text-[10px] text-muted-foreground italic">
                      origem: {(order as any).origin_location}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{table.seats} lugares</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {statusLabels[status]}
                  </span>
                  {(order as any)?.guests > 1 && (
                    <span className="text-[10px] text-muted-foreground">{(order as any).guests} pessoas</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {order && (
                  <span className="text-sm font-semibold">
                    R$ {Number(order.total).toFixed(2)}
                  </span>
                )}
                {order?.waiter_name && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                    {order.waiter_name}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}