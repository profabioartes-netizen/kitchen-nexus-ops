import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, CircleDollarSign, Loader2, Settings, Grid3X3, Move, X, Check, Eye, ChefHat, UtensilsCrossed, CheckCircle2, Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

type TableStatus = "free" | "occupied" | "bill" | "delivered";

const statusLabels: Record<TableStatus, string> = {
  free: "LIVRE",
  occupied: "AGUARDANDO",
  bill: "CONTA",
  delivered: "ENTREGUE",
};

const badgeStyles: Record<TableStatus, { bg: string; color: string }> = {
  free: { bg: "rgba(0,0,0,0.08)", color: "#444" },
  occupied: { bg: "#7c6bc4", color: "white" },
  bill: { bg: "hsl(25 85% 55% / 0.15)", color: "hsl(25 85% 35%)" },
  delivered: { bg: "#166534", color: "#bbf7d6" },
};

const statusCycle: TableStatus[] = ["free", "occupied", "bill", "delivered"];

const TABLE_W = 130;
const TABLE_H = 140;

interface QuickEditForm {
  id: string;
  name: string;
  seats: string;
  sector: string;
}

function TableDuration({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);
  const mins = Math.floor((now - new Date(createdAt).getTime()) / 60000);
  return (
    <span className="flex items-center gap-1 text-[11px] tabular-nums font-medium" style={{ color: "inherit", opacity: 0.7 }}>
      <span className="text-[12px]">⏱</span>
      {mins} min
    </span>
  );
}

export default function TablesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"grid" | "floor">("grid");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [didDrag, setDidDrag] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [quickEdit, setQuickEdit] = useState<QuickEditForm | null>(null);
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tableCountOpen, setTableCountOpen] = useState(false);
  const [tableCountValue, setTableCountValue] = useState("");

  // Realtime: auto-refresh when tables or orders change in DB
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => {
        queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ["open_orders"] });
        queryClient.invalidateQueries({ queryKey: ["today_revenue"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        queryClient.invalidateQueries({ queryKey: ["kitchen_orders_count"] });
        queryClient.invalidateQueries({ queryKey: ["order_item_counts"] });
        queryClient.invalidateQueries({ queryKey: ["unviewed_item_counts"] });
        queryClient.invalidateQueries({ queryKey: ["preview_order_items"] });
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
        .in("status", ["open", "billing_in_progress", "paid_pending_finalization"]);
      if (error) throw error;
      return data;
    },
  });

  // Kitchen orders: items sent to kitchen but not yet delivered
  const { data: kitchenCount = 0 } = useQuery({
    queryKey: ["kitchen_orders_count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("order_items")
        .select("*", { count: "exact", head: true })
        .eq("sent_to_kitchen", true)
        .in("preparation_status", ["pending", "preparing"]);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Today's revenue and client count from finalized orders
  const { data: todayStats = { revenue: 0, clients: 0 } } = useQuery({
    queryKey: ["today_revenue"],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("orders")
        .select("total, guests")
        .eq("status", "finalized")
        .gte("created_at", todayStart.toISOString());
      if (error) throw error;
      return {
        revenue: data.reduce((sum, o) => sum + Number(o.total), 0),
        clients: data.reduce((sum, o) => sum + (o.guests || 1), 0),
      };
    },
  });

  // Fetch items for the previewed order
  const { data: previewItems = [] } = useQuery({
    queryKey: ["preview_order_items", previewOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, product_name, quantity, sent_to_kitchen, viewed_at")
        .eq("order_id", previewOrderId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!previewOrderId,
  });

  // Fetch item counts for all orders
  const { data: orderItemCounts = {} } = useQuery({
    queryKey: ["order_item_counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, quantity, viewed_at");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const item of data) {
        counts[item.order_id] = (counts[item.order_id] || 0) + (item.quantity || 1);
      }
      return counts;
    },
  });

  // Count unviewed items per order
  const { data: unviewedCounts = {} } = useQuery({
    queryKey: ["unviewed_item_counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, quantity, viewed_at")
        .is("viewed_at", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const item of data) {
        counts[item.order_id] = (counts[item.order_id] || 0) + (item.quantity || 1);
      }
      return counts;
    },
  });

  const updatePosition = useMutation({
    mutationFn: async ({ id, x, y }: { id: string; x: number; y: number }) => {
      const { error } = await supabase
        .from("restaurant_tables")
        .update({ position_x: x, position_y: y })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
    },
  });

  const quickEditMutation = useMutation({
    mutationFn: async (form: QuickEditForm) => {
      const table = tables.find((t) => t.id === form.id);
      const defaultName = (table as any)?.default_name || table?.name || "Comanda";
      const customerName = form.name.trim();
      const tableName = customerName || defaultName;
      const { error } = await supabase
        .from("restaurant_tables")
        .update({
          name: tableName,
          seats: parseInt(form.seats) || 4,
          sector: form.sector.trim() || null,
        } as any)
        .eq("id", form.id);
      if (error) throw error;
      return customerName;
    },
    onSuccess: (customerName, variables) => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables_admin"] });
      setQuickEdit(null);
      toast.success("Comanda atualizada!");
      navigate(`/mesas/${variables.id}/pedido`, { state: { customerName: customerName || undefined, sector: variables.sector.trim() || undefined } });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const toggleDelivered = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const newStatus = currentStatus === "delivered" ? "occupied" : "delivered";
      const { error } = await supabase
        .from("restaurant_tables")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
      return newStatus;
    },
    onMutate: async ({ id, currentStatus }) => {
      await queryClient.cancelQueries({ queryKey: ["restaurant_tables"] });
      const previous = queryClient.getQueryData(["restaurant_tables"]);
      const newStatus = currentStatus === "delivered" ? "occupied" : "delivered";
      queryClient.setQueryData(["restaurant_tables"], (old: any[]) =>
        old?.map((t: any) => t.id === id ? { ...t, status: newStatus } : t) ?? []
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(["restaurant_tables"], context.previous);
      toast.error("Erro ao atualizar status da mesa");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
    },
  });

  // Fetch ALL tables (active + inactive) for counting
  const { data: allTables = [] } = useQuery({
    queryKey: ["restaurant_tables_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const saveTableCount = useMutation({
    mutationFn: async (desiredCount: number) => {
      const currentCount = allTables.length;
      if (desiredCount === currentCount) return;

      if (desiredCount < currentCount) {
        // Tables to remove are the ones at the end (highest sort_order)
        const sorted = [...allTables].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const toRemove = sorted.slice(desiredCount);
        const blocked = toRemove.filter(t => ["occupied", "delivered"].includes(t.status));
        if (blocked.length > 0) {
          throw new Error(`Não é possível reduzir: ${blocked.length} comanda(s) com status ativo (${blocked.map(t => t.name).join(", ")}). Libere-as primeiro.`);
        }
        const idsToRemove = toRemove.map(t => t.id);
        // Check if any have open orders
        const { data: activeOrders } = await supabase
          .from("orders")
          .select("id, table_id")
          .in("table_id", idsToRemove)
          .in("status", ["open", "billing_in_progress", "paid_pending_finalization"]);
        if (activeOrders && activeOrders.length > 0) {
          throw new Error("Não é possível remover comandas com pedidos abertos.");
        }
        // Deactivate (soft delete) tables
        const { error } = await supabase
          .from("restaurant_tables")
          .delete()
          .in("id", idsToRemove);
        if (error) throw error;
      } else {
        // Add new tables
        const maxOrder = allTables.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0);
        const newTables = [];
        for (let i = currentCount + 1; i <= desiredCount; i++) {
          newTables.push({
            name: `Comanda ${i}`,
            default_name: `Comanda ${i}`,
            seats: 4,
            active: true,
            status: "free",
            sort_order: maxOrder + (i - currentCount),
          });
        }
        const { error } = await supabase.from("restaurant_tables").insert(newTables);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables_all"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables_admin"] });
      setTableCountOpen(false);
      toast.success("Quantidade de comandas atualizada!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const openTable = (id: string) => {
    navigate(`/mesas/${id}/pedido`);
  };

  const handleQuickEdit = (table: any) => {
    setQuickEdit({
      id: table.id,
      name: "",
      seats: String(table.seats),
      sector: (table as any).sector || "",
    });
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, tableId: string, tableX: number, tableY: number) => {
      if (viewMode !== "floor") return;
      if (quickEdit) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDraggingId(tableId);
      setDidDrag(false);
      setDragOffset({ x: e.clientX - rect.left - tableX, y: e.clientY - rect.top - tableY });
      setDragPos({ x: tableX, y: tableY });
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [viewMode, quickEdit]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingId) return;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(0, Math.min(rect.width - TABLE_W, e.clientX - rect.left - dragOffset.x));
      const y = Math.max(0, Math.min(rect.height - TABLE_H, e.clientY - rect.top - dragOffset.y));
      setDragPos({ x, y });
      setDidDrag(true);
    },
    [draggingId, dragOffset]
  );

  const handlePointerUp = useCallback(() => {
    if (!draggingId) return;
    if (didDrag) {
      updatePosition.mutate({ id: draggingId, x: dragPos.x, y: dragPos.y });
    } else {
      openTable(draggingId);
    }
    setDraggingId(null);
  }, [draggingId, dragPos, didDrag, updatePosition]);

  const occupied = tables.filter((t) => t.status === "occupied").length;
  const free = tables.filter((t) => t.status === "free").length;
  const ordersByTable = openOrders.reduce<Record<string, (typeof openOrders)[0]>>((acc, o) => {
    if (o.table_id) acc[o.table_id] = o;
    return acc;
  }, {});

  const sortedTables = useMemo(() => {
    const activeStatuses = ["occupied", "delivered", "bill"];
    return [...tables].sort((a, b) => {
      const aActive = activeStatuses.includes(a.status);
      const bActive = activeStatuses.includes(b.status);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      if (aActive && bActive) {
        const aOrder = ordersByTable[a.id];
        const bOrder = ordersByTable[b.id];
        const aTime = aOrder ? new Date(aOrder.created_at).getTime() : 0;
        const bTime = bOrder ? new Date(bOrder.created_at).getTime() : 0;
        return aTime - bTime;
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }, [tables, ordersByTable]);

  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return sortedTables;
    const q = searchQuery.toLowerCase().trim();
    return sortedTables.filter((t) => {
      const order = ordersByTable[t.id];
      const customerMatch = order?.customer_name?.toLowerCase().includes(q);
      const tableNameMatch = t.name.toLowerCase().includes(q);
      const waiterMatch = order?.waiter_name?.toLowerCase().includes(q);
      return customerMatch || tableNameMatch || waiterMatch;
    });
  }, [sortedTables, ordersByTable, searchQuery]);

  const tablesWithPositions = filteredTables.map((t, i) => {
    const hasPosition = (t.position_x !== null && t.position_x !== 0) || (t.position_y !== null && t.position_y !== 0);
    if (hasPosition) return t;
    const cols = 6;
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { ...t, position_x: 20 + col * (TABLE_W + 16), position_y: 20 + row * (TABLE_H + 16) };
  });

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
        <h1 className="text-2xl font-semibold">Mapa de Comandas</h1>
        <div className="flex gap-2">
          <div className="flex rounded-md border bg-card overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === "grid" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"}`}
            >
              <Grid3X3 className="h-4 w-4" />
              Grade
            </button>
          </div>
          <button
            onClick={() => navigate("/mesas/gerenciar")}
            className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
            Gerenciar
          </button>
          <Popover open={tableCountOpen} onOpenChange={(open) => {
            setTableCountOpen(open);
            if (open) setTableCountValue(String(allTables.length));
          }}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors">
                <Plus className="h-4 w-4 text-muted-foreground" />
                Qtd. Comandas
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-4" align="end">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Quantidade de Comandas</label>
                  <Input
                    type="number"
                    min="1"
                    max="200"
                    value={tableCountValue}
                    onChange={(e) => setTableCountValue(e.target.value)}
                    className="mt-1"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">Atual: {allTables.length} comandas</p>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setTableCountOpen(false)}
                    className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={!tableCountValue || parseInt(tableCountValue) < 1 || saveTableCount.isPending}
                    onClick={() => saveTableCount.mutate(parseInt(tableCountValue))}
                    className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {saveTableCount.isPending ? "Salvando..." : "Salvar"}
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-status-occupied/15">
            <Users className="h-4.5 w-4.5 text-status-occupied" />
          </div>
          <div>
            <p className="text-xl font-bold leading-none">{occupied}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Ocupadas</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-status-free/15">
            <UtensilsCrossed className="h-4.5 w-4.5 text-status-free" />
          </div>
          <div>
            <p className="text-xl font-bold leading-none">{free}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Livres</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15">
            <CheckCircle2 className="h-4.5 w-4.5 text-accent" />
          </div>
          <div>
            <p className="text-xl font-bold leading-none">{todayStats.clients}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Atendidos hoje</p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome do cliente..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4">
        {statusCycle.map((s) => (
          <div key={s} className="flex items-center gap-2 text-xs">
            <div className={`h-3 w-3 rounded-full border-2 table-status-${s}`} />
            <span className="text-muted-foreground">{statusLabels[s]}</span>
          </div>
        ))}
        {viewMode === "floor" && (
          <span className="text-xs text-muted-foreground ml-auto italic">Arraste as comandas para reorganizar o layout</span>
        )}
      </div>

      {/* Grid View */}
      {viewMode === "grid" && (
        <LayoutGroup>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredTables.map((table) => {
            const order = ordersByTable[table.id];
            const effectiveStatus: TableStatus = order
              ? (order.status === "billing_in_progress" ? "bill" : (table.status === "delivered" ? "delivered" : "occupied"))
              : (table.status as TableStatus);
            const useInlineOccupied = effectiveStatus === "occupied";
            const useInlineDelivered = effectiveStatus === "delivered";
            return (
              <motion.div
                layout
                layoutId={`comanda-${table.id}`}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                key={table.id}
                className={`${!useInlineOccupied && !useInlineDelivered ? `table-status-${effectiveStatus}` : ""} relative flex flex-col rounded-xl border-2 p-4 min-h-[140px] cursor-pointer group`}
                style={useInlineOccupied ? { backgroundColor: "#ece8fb", borderColor: "#c7b8f0", color: "#3730a3" } : useInlineDelivered ? { backgroundColor: "#bbf7d6", borderColor: "#bbf7d6", color: "#166534" } : undefined}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => order ? openTable(table.id) : handleQuickEdit(table)}
              >


                {/* Unviewed items badge */}
                {order && (unviewedCounts[order.id] || 0) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 z-20 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-black px-1 leading-none animate-pulse">
                    {unviewedCounts[order.id]}
                  </span>
                )}

                {/* Preview popover for occupied tables */}
                {order && (
                  <Popover
                    open={previewOrderId === order.id}
                    onOpenChange={(open) => { if (!open) setPreviewOrderId(null); }}
                  >
                    <PopoverTrigger asChild>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        onMouseEnter={(e) => { e.stopPropagation(); setPreviewOrderId(order.id); }}
                        onMouseLeave={(e) => { e.stopPropagation(); setPreviewOrderId(null); }}
                        className={`absolute top-1.5 left-1.5 rounded p-1 transition-opacity z-10 ${previewOrderId === order.id ? "opacity-100 bg-accent/20" : "opacity-0 group-hover:opacity-100"} hover:bg-secondary/80`}
                        
                      >
                        <Eye className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="right"
                      align="start"
                      sideOffset={8}
                      className="w-52 p-0 shadow-md max-h-[320px] overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                      onMouseEnter={() => setPreviewOrderId(order.id)}
                      onMouseLeave={() => setPreviewOrderId(null)}
                    >
                      {previewItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic p-2.5">Carregando...</p>
                      ) : (() => {
                        const newItems = previewItems.filter((i) => !i.sent_to_kitchen);
                        const ongoingItems = previewItems.filter((i) => i.sent_to_kitchen);
                        return (
                          <div>
                            {newItems.length > 0 && (
                              <>
                                <div className="bg-accent/15 rounded-md m-2 mb-0 p-2.5 ring-1 ring-accent/20">
                                  <p className="text-[10px] text-accent uppercase tracking-widest font-black mb-1.5">● Novos Pedidos</p>
                                  <div className="space-y-1">
                                    {newItems.map((item) => (
                                      <div key={item.id} className="flex items-center justify-between text-xs gap-1">
                                        <span className="truncate flex-1 mr-1 font-semibold">{item.product_name}</span>
                                        {!(item as any).viewed_at && (
                                          <span className="flex-shrink-0 text-[8px] font-black uppercase bg-destructive text-destructive-foreground rounded px-1 py-0.5 leading-none">NOVO</span>
                                        )}
                                        <span className="text-accent flex-shrink-0 tabular-nums font-bold">×{item.quantity}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                                {ongoingItems.length > 0 && (
                                  <div className="mx-2.5 my-1.5 border-t border-border" />
                                )}
                              </>
                            )}
                            {ongoingItems.length > 0 && (
                              <div className="p-2.5">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Pedido em Andamento</p>
                                <div className="space-y-1">
                                  {ongoingItems.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between text-xs gap-1">
                                      <span className="truncate flex-1 mr-1">{item.product_name}</span>
                                      {!(item as any).viewed_at && (
                                        <span className="flex-shrink-0 text-[8px] font-black uppercase bg-destructive text-destructive-foreground rounded px-1 py-0.5 leading-none">NOVO</span>
                                      )}
                                      <span className="text-muted-foreground flex-shrink-0 tabular-nums">×{item.quantity}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {newItems.length === 0 && ongoingItems.length === 0 && (
                              <p className="text-xs text-muted-foreground italic p-2.5">Sem itens</p>
                            )}
                          </div>
                        );
                      })()}
                    </PopoverContent>
                  </Popover>
                )}

                {/* Table header */}
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display text-lg leading-tight">
                    {order?.customer_name || (table as any).default_name || table.name}
                  </span>
                  {order && <TableDuration createdAt={order.created_at} />}
                </div>
                {order?.customer_name && (
                  <span className="text-[10px] text-muted-foreground">{(table as any).default_name || table.name}</span>
                )}

                {(table as any).internal_number && (
                  <span className="text-[10px]" style={useInlineDelivered ? { color: "#15803d" } : undefined}>#{(table as any).internal_number}</span>
                )}

                {(table as any).sector && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] bg-accent/20 rounded-full px-1.5 py-0.5 font-medium" style={useInlineDelivered ? { color: "#15803d" } : undefined}>{(table as any).sector}</span>
                  </div>
                )}

                <span
                  className="inline-block text-[9px] font-bold uppercase tracking-wider mt-1.5 rounded-full px-2 py-0.5"
                  style={{ backgroundColor: (badgeStyles[effectiveStatus] ?? badgeStyles.free).bg, color: (badgeStyles[effectiveStatus] ?? badgeStyles.free).color }}
                >
                  {statusLabels[effectiveStatus]}
                </span>

{/* Order details */}
                {order && (
                  <div className="mt-auto pt-2 border-t border-border/50 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold tabular-nums">R$ {Number(order.total).toFixed(2)}</span>
                      <span className="text-[10px]" style={useInlineDelivered ? { color: "#15803d" } : undefined}>
                        {orderItemCounts[order.id] || 0} {orderItemCounts[order.id] === 1 ? "item" : "itens"}
                      </span>
                    </div>
                    {order?.waiter_name && (
                      <p className="text-[10px] truncate" style={{ color: useInlineOccupied ? "#4f46e5" : useInlineDelivered ? "#15803d" : undefined }}>{order.waiter_name}</p>
                    )}
                  </div>
                )}

                {/* Delivery toggle - below order details */}
                {(effectiveStatus === "occupied" || effectiveStatus === "delivered") && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      toggleDelivered.mutate({ id: table.id, currentStatus: table.status });
                    }}
                    className="mt-2 flex items-center justify-center gap-1.5 w-full rounded-lg py-1.5 text-[10px] font-bold uppercase tracking-wider transition-transform hover:scale-[1.02] active:scale-[0.97]"
                    style={{
                      backgroundColor: effectiveStatus === "delivered" ? "#166534" : "#7c6bc4",
                      color: effectiveStatus === "delivered" ? "#bbf7d6" : "white",
                    }}
                    title={effectiveStatus === "delivered" ? "Desmarcar entregue" : "Marcar como entregue"}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {effectiveStatus === "delivered" ? "Entregue ✓" : "Marcar entregue"}
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
        </LayoutGroup>
      )}

      {/* Floor Plan View */}
      {viewMode === "floor" && (
        <div
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative flex-1 min-h-[500px] rounded-lg border-2 border-dashed border-border bg-card/50 overflow-hidden"
          style={{ touchAction: "none" }}
        >
          {tablesWithPositions.map((table) => {
            const order = ordersByTable[table.id];
            const isDragging = draggingId === table.id;
            const x = isDragging ? dragPos.x : (table.position_x ?? 0);
            const y = isDragging ? dragPos.y : (table.position_y ?? 0);

                const effectiveFloorStatus: TableStatus = order
                  ? (order.status === "billing_in_progress" ? "bill" : (table.status === "delivered" ? "delivered" : "occupied"))
                  : (table.status as TableStatus);
                const floorInlineOccupied = effectiveFloorStatus === "occupied";
                const floorInlineDelivered = effectiveFloorStatus === "delivered";
                return (
              <div
                key={table.id}
                onPointerDown={(e) => handlePointerDown(e, table.id, x, y)}
                className={`${!floorInlineOccupied && !floorInlineDelivered ? `table-status-${effectiveFloorStatus}` : ""} absolute flex flex-col items-center justify-center rounded-lg border-2 cursor-grab active:cursor-grabbing select-none transition-shadow group ${isDragging ? "shadow-lg z-50 scale-105" : "hover:shadow-md"}`}
                style={{
                  left: x,
                  top: y,
                  width: TABLE_W,
                  height: TABLE_H,
                  transition: isDragging ? "none" : "box-shadow 0.2s, transform 0.2s",
                  ...(floorInlineOccupied ? { backgroundColor: "#ece8fb", borderColor: "#c7b8f0", color: "#3730a3" } : floorInlineDelivered ? { backgroundColor: "#bbf7d6", borderColor: "#bbf7d6", color: "#166534" } : {}),
                }}
              >
                {/* Delivery toggle on floor plan */}
                {(effectiveFloorStatus === "occupied" || effectiveFloorStatus === "delivered") && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      toggleDelivered.mutate({ id: table.id, currentStatus: table.status });
                    }}
                    className="absolute top-1 left-1 rounded-full p-1 z-20 hover:scale-110 transition-transform"
                    style={{ backgroundColor: effectiveFloorStatus === "delivered" ? "#166534" : "#7c6bc4" }}
                    title={effectiveFloorStatus === "delivered" ? "Desmarcar entregue" : "Marcar como entregue"}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" style={{ color: effectiveFloorStatus === "delivered" ? "#bbf7d6" : "white" }} />
                  </button>
                )}


                <span className="font-display text-sm">{table.name}</span>
                
                {(table as any).sector && (
                  <span className="text-[8px] bg-accent/30 rounded px-1 mt-0.5" style={floorInlineDelivered ? { color: "#15803d" } : undefined}>{(table as any).sector}</span>
                )}
                <span
                  className="inline-block text-[8px] font-bold uppercase tracking-wider mt-1 rounded-full px-1.5 py-0.5"
                  style={{ backgroundColor: (badgeStyles[effectiveFloorStatus] ?? badgeStyles.free).bg, color: (badgeStyles[effectiveFloorStatus] ?? badgeStyles.free).color }}
                >
                  {statusLabels[effectiveFloorStatus]}
                </span>
{order && (
                  <>
                    <span className="text-[10px] font-semibold mt-0.5">R$ {Number(order.total).toFixed(2)}</span>
                    <span className="text-[9px] text-muted-foreground">
                      {orderItemCounts[order.id] || 0} {orderItemCounts[order.id] === 1 ? "item" : "itens"}
                    </span>
                    <TableDuration createdAt={order.created_at} />
                  </>
                )}
                {(order as any)?.customer_name && (
                  <span className="text-[8px] text-accent font-medium truncate max-w-[110px]">{(order as any).customer_name}</span>
                )}
                {order?.waiter_name && (
                  <span className="text-[9px] text-muted-foreground truncate max-w-[110px]">{order.waiter_name}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Quick edit popover */}
      {quickEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
          <div className="w-full max-w-xs rounded-lg border bg-background p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Abrir Mesa</h3>
              <button onClick={() => setQuickEdit(null)} className="rounded p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nome do Cliente</label>
                <input
                  type="text"
                  value={quickEdit.name}
                  onChange={(e) => setQuickEdit({ ...quickEdit, name: e.target.value })}
                  autoFocus
                  className="mt-1 w-full rounded-md border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Mesa</label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {["Mesa 1", "Mesa 2", "Mesa 3", "Mesa 4", "Mesa 5", "Mesa 6", "Mesa Redonda Fora", "Mesa Quadrada Fora", "Quiosque"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setQuickEdit({ ...quickEdit, sector: opt })}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${quickEdit.sector === opt ? "bg-accent text-accent-foreground border-accent" : "bg-card hover:bg-secondary border-border text-foreground"}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={quickEdit.sector}
                  onChange={(e) => setQuickEdit({ ...quickEdit, sector: e.target.value })}
                  placeholder="Ou digite manualmente..."
                  className="mt-2 w-full rounded-md border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setQuickEdit(null)} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary">
                Cancelar
              </button>
              <button
                disabled={quickEditMutation.isPending}
                onClick={() => quickEditMutation.mutate(quickEdit)}
                className="flex items-center gap-1.5 rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {quickEditMutation.isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
