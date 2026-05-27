import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Users, ChefHat, Crown } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantRealtime } from "@/hooks/useTenantRealtime";
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

const vipColor = "border-l-[#facc15] bg-[#fef9c3] text-[#854d0e]";


export default function WaiterTablesPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Realtime estrito por tenant
  useTenantRealtime({
    channelKey: "waiter-tables",
    tables: ["restaurant_tables", "orders", "order_items"],
    invalidateKeys: [
      ["restaurant_tables"],
      ["open_orders"],
      ["undelivered_item_counts_waiter"],
    ],
  });

  // comanda_locks: canal separado
  useEffect(() => {
    const channel = supabase
      .channel('waiter-locks-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comanda_locks' }, () => {
        queryClient.invalidateQueries({ queryKey: ["active_locks"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["restaurant_tables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id, name, default_name, internal_number, sector, status, sort_order, seats")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000, // mudam raramente; realtime invalida quando preciso
    refetchOnWindowFocus: false,
  });

  const { data: openOrders = [] } = useQuery({
    queryKey: ["open_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, table_id, status, total, waiter_name, customer_name, customer_id, created_at, origin_location, current_location, guests")
        .not("status", "in", '("closed","finished","finalized","canceled","merged")')
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: vipCustomerIds = new Set<string>() } = useQuery({
    queryKey: ["vip_customer_ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers" as any)
        .select("id")
        .eq("is_vip", true);
      if (error) throw error;
      return new Set<string>(((data ?? []) as any[]).map((c) => c.id));
    },
    staleTime: 60_000,
  });

  const ordersByTable = openOrders.reduce<Record<string, (typeof openOrders)[0]>>((acc, o) => {
    if (o.table_id && !acc[o.table_id]) acc[o.table_id] = o;
    return acc;
  }, {});

  const occupiedTableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const table of tables) {
      if (ordersByTable[table.id]) ids.add(table.id);
    }
    return ids;
  }, [tables, ordersByTable]);

  const openOrderIds = useMemo(() => openOrders.map((o) => o.id), [openOrders]);

  // Undelivered item counts per order
  const { data: undeliveredCounts = {} } = useQuery({
    queryKey: ["undelivered_item_counts_waiter", openOrderIds],
    queryFn: async () => {
      if (openOrderIds.length === 0) return {};
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, quantity")
        .in("order_id", openOrderIds)
        .is("delivered_at", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const item of data) {
        counts[item.order_id] = (counts[item.order_id] || 0) + (item.quantity || 1);
      }
      return counts;
    },
    enabled: openOrderIds.length > 0,
  });


  const occupied = occupiedTableIds.size;

  // Mostrar apenas comandas abertas. Mesas livres não aparecem na grade.
  const sortedTables = useMemo(() => {
    const getComandaNum = (ord: any | undefined): number => {
      if (!ord) return Number.MAX_SAFE_INTEGER;
      const raw = (ord.origin_location ?? ord.current_location ?? "").toString().trim();
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
    };
    return tables
      .filter((t) => occupiedTableIds.has(t.id))
      .sort((a, b) => {
        const aOrder = ordersByTable[a.id];
        const bOrder = ordersByTable[b.id];
        const aNum = getComandaNum(aOrder);
        const bNum = getComandaNum(bOrder);
        if (aNum !== bNum) return aNum - bNum;
        return new Date(aOrder.created_at).getTime() - new Date(bOrder.created_at).getTime();
      });
  }, [tables, occupiedTableIds, ordersByTable]);

  // Visual label: prefers registered comanda number; falls back to sequential.
  const visualLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    sortedTables.forEach((table, i) => {
      const ord = ordersByTable[table.id];
      const raw = ord ? ((ord as any).origin_location ?? (ord as any).current_location ?? "").toString().trim() : "";
      labels[table.id] = raw ? `Comanda ${raw}` : `Comanda ${i + 1}`;
    });
    return labels;
  }, [sortedTables, ordersByTable]);


  const [vipOnly, setVipOnly] = useState<boolean>(() => {
    try { return localStorage.getItem("tables_vip_only") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("tables_vip_only", vipOnly ? "1" : "0"); } catch {}
  }, [vipOnly]);

  const vipOpenCount = useMemo(
    () => sortedTables.reduce((n, t) => {
      const ord = ordersByTable[t.id] as any;
      return n + (ord && ord.customer_id && vipCustomerIds.has(ord.customer_id) ? 1 : 0);
    }, 0),
    [sortedTables, ordersByTable, vipCustomerIds]
  );

  const visibleTables = useMemo(
    () => vipOnly
      ? sortedTables.filter((t) => {
          const ord = ordersByTable[t.id] as any;
          return ord && ord.customer_id && vipCustomerIds.has(ord.customer_id);
        })
      : sortedTables,
    [sortedTables, ordersByTable, vipOnly, vipCustomerIds]
  );

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
        {(["occupied", "bill"] as TableStatus[]).map((s) => (
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

      {/* VIP filter toggle */}
      <button
        onClick={() => setVipOnly((v) => !v)}
        className={`mb-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${vipOnly ? "" : "bg-card text-muted-foreground"}`}
        style={vipOnly ? { backgroundColor: "#fef9c3", borderColor: "#facc15", color: "#854d0e" } : undefined}
      >
        <Crown className="h-3.5 w-3.5" />
        Apenas VIPs
        <span className="tabular-nums opacity-80">({vipOpenCount})</span>
      </button>

      {/* Table list */}
      <div className="space-y-2">
        {visibleTables.map((table) => {
          const order = ordersByTable[table.id];
          const hasPending = order ? (undeliveredCounts[order.id] || 0) > 0 : false;
          const status: TableStatus = order
            ? (order.status === "billing_in_progress" || order.status === "paid_pending_finalization"
              ? "bill"
              : (table.status === "delivered" && !hasPending ? "delivered" : "occupied"))
            : (table.status as TableStatus);
          const isVip = !!(order && (order as any).customer_id && vipCustomerIds.has((order as any).customer_id));
          return (
            <button
              key={table.id}
              onClick={() => navigate(`/garcom/mesa/${table.id}`)}
              className={`w-full flex items-center gap-3 rounded-xl border border-l-4 p-4 text-left transition-all active:scale-[0.98] ${isVip && status === "occupied" ? vipColor : (statusColors[status] || "")} relative`}
            >

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {isVip && (
                    <span className="flex items-center gap-0.5 rounded-full bg-yellow-400 text-yellow-900 px-1.5 py-0.5 flex-shrink-0">
                      <Crown className="h-2.5 w-2.5" />
                      <span className="text-[8px] font-bold uppercase leading-none">VIP</span>
                    </span>
                  )}
                  <span className="font-semibold text-base truncate">
                    {order?.customer_name || visualLabels[table.id] || table.name}
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
                    <span className="text-[10px] text-muted-foreground">{visualLabels[table.id] || table.name}</span>
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
        {visibleTables.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4">
            <ChefHat className="h-10 w-10 text-muted-foreground/60 mb-3" />
            <p className="text-sm font-medium text-foreground">
              {vipOnly ? "Nenhuma comanda VIP aberta" : "Nenhuma comanda aberta"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {vipOnly ? "Desative o filtro para ver todas." : "As comandas que você abrir aparecerão aqui."}
            </p>
            {vipOnly && (
              <button
                onClick={() => setVipOnly(false)}
                className="mt-3 text-xs font-medium text-accent hover:underline"
              >
                Limpar filtro
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}