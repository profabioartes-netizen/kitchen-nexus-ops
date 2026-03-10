import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2, ChefHat, GlassWater, CakeSlice, Clock, Flame,
  CheckCircle2, Truck, Volume2, VolumeX, AlertTriangle,
} from "lucide-react";

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

// Format elapsed time mm:ss
function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Get the relevant start time for elapsed calculation
function getElapsedMs(item: any): number {
  const now = Date.now();
  // Use the most relevant timestamp based on current status
  const status = item.preparation_status ?? "pending";
  if (status === "preparing" && item.preparing_at) {
    return now - new Date(item.preparing_at).getTime();
  }
  if (status === "ready" && item.ready_at) {
    return now - new Date(item.ready_at).getTime();
  }
  if (status === "delivered" && item.delivered_at) {
    return 0;
  }
  // For sent/pending, use sent_at or created_at
  const ref = item.sent_at || item.created_at;
  return now - new Date(ref).getTime();
}

function isDelayed(item: any): boolean {
  const prepTime = item.products?.prep_time_minutes ?? 15;
  const status = item.preparation_status ?? "pending";
  if (status === "delivered" || status === "ready") return false;
  // Calculate total elapsed since sent
  const ref = item.sent_at || item.created_at;
  const elapsed = Date.now() - new Date(ref).getTime();
  return elapsed > prepTime * 60 * 1000;
}

export default function KitchenStationPage() {
  const queryClient = useQueryClient();
  const [activeStation, setActiveStation] = useState<string>("Cozinha");
  const [statusFilter, setStatusFilter] = useState<PrepStatus | "all">("all");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [tick, setTick] = useState(0);
  const alertedRef = useRef<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Timer tick every second for elapsed updates
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Create audio context for alert sound
  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      osc.type = "square";
      gain.gain.value = 0.15;
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.stop(ctx.currentTime + 0.5);
    } catch {
      // Audio not supported
    }
  }, [soundEnabled]);

  // Fetch open order items with table info and product prep time
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["kitchen_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*, orders!inner(status, table_id, restaurant_tables:table_id(name)), products!inner(station, prep_time_minutes)")
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

  // Check for delayed items and play alert
  useEffect(() => {
    if (!soundEnabled) return;
    const stationItems = items.filter((i) => (i.products?.station ?? "Cozinha") === activeStation);
    for (const item of stationItems) {
      if (isDelayed(item) && !alertedRef.current.has(item.id)) {
        alertedRef.current.add(item.id);
        playAlertSound();
        break; // One alert per cycle
      }
    }
  }, [tick, items, activeStation, soundEnabled, playAlertSound]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: PrepStatus }) => {
      const timestampField: Record<string, string> = {
        sent: "sent_at",
        preparing: "preparing_at",
        ready: "ready_at",
        delivered: "delivered_at",
      };
      const updates: Record<string, any> = { preparation_status: status };
      if (timestampField[status]) {
        updates[timestampField[status]] = new Date().toISOString();
      }
      const { error } = await supabase
        .from("order_items")
        .update(updates)
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

  // Filter items
  const stationItems = items.filter((item) => {
    const station = item.products?.station ?? "Cozinha";
    return station === activeStation;
  });

  const filteredItems = statusFilter === "all"
    ? stationItems.filter((i) => i.preparation_status !== "delivered")
    : stationItems.filter((i) => i.preparation_status === statusFilter);

  const countByStatus = (status: PrepStatus) =>
    stationItems.filter((i) => i.preparation_status === status).length;

  const delayedCount = stationItems.filter((i) =>
    i.preparation_status !== "delivered" && i.preparation_status !== "ready" && isDelayed(i)
  ).length;

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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Produção por Estação</h1>
          {delayedCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-destructive/15 text-destructive px-2.5 py-1 text-xs font-semibold animate-pulse">
              <AlertTriangle className="h-3.5 w-3.5" />
              {delayedCount} atrasado{delayedCount > 1 ? "s" : ""}
            </span>
          )}
        </div>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            soundEnabled ? "bg-accent text-accent-foreground" : "bg-card hover:bg-secondary"
          }`}
          title={soundEnabled ? "Desativar alerta sonoro" : "Ativar alerta sonoro"}
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          Alerta sonoro
        </button>
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
              onClick={() => { setActiveStation(station.id); alertedRef.current.clear(); }}
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
            const delayed = isDelayed(item);
            const elapsed = getElapsedMs(item);
            const prepTime = item.products?.prep_time_minutes ?? 15;

            // Timeline timestamps
            const sentTime = item.sent_at ? new Date(item.sent_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
            const preparingTime = item.preparing_at ? new Date(item.preparing_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
            const readyTime = item.ready_at ? new Date(item.ready_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;
            const deliveredTime = item.delivered_at ? new Date(item.delivered_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;

            return (
              <div
                key={item.id}
                className={`rounded-lg border bg-card p-4 flex flex-col gap-2 transition-all ${
                  delayed
                    ? "border-destructive shadow-[0_0_12px_-3px_hsl(var(--destructive)/0.4)] animate-pulse"
                    : status === "ready"
                    ? "border-[hsl(var(--status-free))] shadow-md"
                    : ""
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

                {/* Elapsed timer */}
                {!isLast && (
                  <div className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-mono ${
                    delayed
                      ? "bg-destructive/10 text-destructive"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3" />
                      <span className="font-semibold">{formatElapsed(elapsed)}</span>
                    </div>
                    <span className="text-[10px] opacity-70">
                      {delayed ? (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          &gt; {prepTime}min
                        </span>
                      ) : (
                        `meta: ${prepTime}min`
                      )}
                    </span>
                  </div>
                )}

                {/* Timeline */}
                <div className="flex gap-1 text-[9px] text-muted-foreground flex-wrap">
                  {sentTime && (
                    <span className="rounded bg-muted px-1.5 py-0.5">📤 {sentTime}</span>
                  )}
                  {preparingTime && (
                    <span className="rounded bg-muted px-1.5 py-0.5">🔥 {preparingTime}</span>
                  )}
                  {readyTime && (
                    <span className="rounded bg-muted px-1.5 py-0.5">✅ {readyTime}</span>
                  )}
                  {deliveredTime && (
                    <span className="rounded bg-muted px-1.5 py-0.5">🚚 {deliveredTime}</span>
                  )}
                  {!sentTime && !preparingTime && (
                    <span className="rounded bg-muted px-1.5 py-0.5">
                      📝 {new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>

                {/* Action */}
                {!isLast && (
                  <button
                    onClick={() => advanceStatus(item.id, status)}
                    disabled={updateStatus.isPending}
                    className={`mt-auto flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 ${
                      delayed
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-accent text-accent-foreground"
                    }`}
                  >
                    {(() => {
                      const nextStatus = statusFlow[statusFlow.indexOf(status) + 1];
                      const NextIcon = statusConfig[nextStatus].icon;
                      return (
                        <>
                          <NextIcon className="h-4 w-4" />
                          <span>{statusConfig[nextStatus].label}</span>
                        </>
                      );
                    })()}
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
