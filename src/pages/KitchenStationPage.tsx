import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, ChefHat, GlassWater, CakeSlice, Clock, Flame, CheckCircle2, Truck } from "lucide-react";

type PrepStatus = "pending" | "sent" | "preparing" | "ready" | "delivered";

const stations = [
  { id: "Cozinha", label: "Cozinha", icon: ChefHat },
  { id: "Bar", label: "Bebidas", icon: GlassWater },
  { id: "Sobremesa", label: "Sobremesas", icon: CakeSlice },
] as const;

const statusFlow: PrepStatus[] = ["pending", "sent", "preparing", "ready", "delivered"];

const statusConfig: Record<PrepStatus, { label: string; icon: typeof Clock; colorClass: string }> = {
  pending: { label: "Pendente", icon: Clock, colorClass: "text-muted-foreground bg-muted" },
  sent: { label: "Enviado", icon: Clock, colorClass: "text-[hsl(var(--status-reserved))] bg-[hsl(var(--status-reserved)/0.12)]" },
  preparing: { label: "Preparando", icon: Flame, colorClass: "text-[hsl(var(--status-occupied))] bg-[hsl(var(--status-occupied)/0.12)]" },
  ready: { label: "Pronto", icon: CheckCircle2, colorClass: "text-[hsl(var(--status-free))] bg-[hsl(var(--status-free)/0.12)]" },
  delivered: { label: "Entregue", icon: Truck, colorClass: "text-primary bg-primary/10" },
};

export default function KitchenStationPage() {
  const queryClient = useQueryClient();
  const [activeStation, setActiveStation] = useState<string>("Cozinha");
  const [statusFilter, setStatusFilter] = useState<PrepStatus | "all">("all");

  // Fetch open order items with table info
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["kitchen_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*, orders!inner(status, table_id, restaurant_tables:table_id(name)), products!inner(station)")
        .eq("orders.status", "open")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 5000,
  });

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("kitchen_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["kitchen_items"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PrepStatus }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ preparation_status: status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kitchen_items"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const advanceStatus = (id: string, current: PrepStatus) => {
    const idx = statusFlow.indexOf(current);
    if (idx < statusFlow.length - 1) {
      updateStatus.mutate({ id, status: statusFlow[idx + 1] });
    }
  };

  // Filter items by station
  const stationItems = items.filter((item) => {
    const station = item.products?.station ?? "Cozinha";
    return station === activeStation;
  });

  const filteredItems = statusFilter === "all"
    ? stationItems.filter((i) => i.preparation_status !== "delivered")
    : stationItems.filter((i) => i.preparation_status === statusFilter);

  // Count by status for badges
  const countByStatus = (status: PrepStatus) =>
    stationItems.filter((i) => i.preparation_status === status).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Produção por Estação</h1>
      </div>

      {/* Station tabs */}
      <div className="flex gap-2 mb-4">
        {stations.map((station) => {
          const count = items.filter(
            (i) => (i.products?.station ?? "Cozinha") === station.id && i.preparation_status !== "delivered"
          ).length;
          return (
            <button
              key={station.id}
              onClick={() => setActiveStation(station.id)}
              className={`flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                activeStation === station.id
                  ? "bg-accent text-accent-foreground"
                  : "bg-card text-foreground hover:bg-secondary"
              }`}
            >
              <station.icon className="h-4 w-4" />
              {station.label}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  activeStation === station.id
                    ? "bg-accent-foreground/20 text-accent-foreground"
                    : "bg-accent/15 text-accent"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setStatusFilter("all")}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            statusFilter === "all" ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"
          }`}
        >
          Ativos
        </button>
        {statusFlow.map((s) => {
          const conf = statusConfig[s];
          const count = countByStatus(s);
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary"
              }`}
            >
              {conf.label}
              {count > 0 && (
                <span className="rounded-full bg-foreground/10 px-1.5 text-[10px]">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Items grid */}
      {filteredItems.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Nenhum item nesta estação</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 overflow-auto flex-1">
          {filteredItems.map((item) => {
            const status = (item.preparation_status ?? "pending") as PrepStatus;
            const conf = statusConfig[status];
            const Icon = conf.icon;
            const tableName = item.orders?.restaurant_tables?.name ?? "—";
            const isLast = status === "delivered";

            return (
              <div
                key={item.id}
                className={`rounded-lg border bg-card p-4 flex flex-col gap-2 transition-all ${
                  status === "ready" ? "border-[hsl(var(--status-free))] shadow-md" : ""
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">{tableName}</span>
                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${conf.colorClass}`}>
                    <Icon className="h-3 w-3" />
                    {conf.label}
                  </span>
                </div>

                {/* Product */}
                <div>
                  <p className="font-medium text-sm">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">×{item.quantity}</p>
                </div>

                {/* Notes */}
                {item.notes && (
                  <p className="text-xs bg-muted rounded px-2 py-1 text-muted-foreground italic">
                    {item.notes}
                  </p>
                )}

                {/* Time */}
                <p className="text-[10px] text-muted-foreground">
                  {new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>

                {/* Action */}
                {!isLast && (
                  <button
                    onClick={() => advanceStatus(item.id, status)}
                    disabled={updateStatus.isPending}
                    className="mt-auto flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                  >
                    {statusFlow.indexOf(status) < statusFlow.length - 1 && (
                      <>
                        {statusConfig[statusFlow[statusFlow.indexOf(status) + 1]].icon &&
                          (() => {
                            const NextIcon = statusConfig[statusFlow[statusFlow.indexOf(status) + 1]].icon;
                            return <NextIcon className="h-4 w-4" />;
                          })()
                        }
                        <span>{statusConfig[statusFlow[statusFlow.indexOf(status) + 1]].label}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
