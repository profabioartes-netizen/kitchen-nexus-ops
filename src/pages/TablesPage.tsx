import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, Grid3X3, Move, X, Check, Eye, ChefHat, UtensilsCrossed, CheckCircle2, Search, Plus, Lock, Clock, BarChart3 } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import { useTenantRealtime } from "@/hooks/useTenantRealtime";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useGoLiveDate } from "@/hooks/useGoLiveDate";

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
  const { user, profile } = useAuth();
  const isWaiter = profile?.role === "waiter";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"grid" | "floor">("grid");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [didDrag, setDidDrag] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [quickEdit, setQuickEdit] = useState<QuickEditForm | null>(null);
  const [previewTableId, setPreviewTableId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [tableCountOpen, setTableCountOpen] = useState(false);
  const [tableCountValue, setTableCountValue] = useState("");

  // Realtime estrito: filtra por tenant_id no servidor + só invalida em colunas significativas
  useTenantRealtime({
    channelKey: "dashboard",
    tables: ["restaurant_tables", "orders", "order_items"],
    invalidateKeys: [
      ["restaurant_tables"],
      ["open_orders"],
      ["today_revenue"],
      ["avg_service_time"],
      ["kitchen_orders_count"],
      ["order_item_counts"],
      ["undelivered_item_counts"],
      ["unviewed_item_counts"],
      ["preview_order_items"],
    ],
  });

  // comanda_locks: canal separado (não tem campo significativo a filtrar)
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-locks-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comanda_locks' }, () => {
        queryClient.invalidateQueries({ queryKey: ["active_locks"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // Active locks query
  const { data: activeLocks = [] } = useQuery({
    queryKey: ["active_locks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comanda_locks")
        .select("table_id, locked_by_user_id, locked_by_user_name, lock_expires_at")
        .gt("lock_expires_at", new Date().toISOString());
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const locksByTable = useMemo(() => {
    const map: Record<string, { userId: string; userName: string }> = {};
    for (const lock of activeLocks) {
      if (new Date(lock.lock_expires_at) > new Date()) {
        map[lock.table_id] = { userId: lock.locked_by_user_id, userName: lock.locked_by_user_name };
      }
    }
    return map;
  }, [activeLocks]);

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
        .not("status", "in", '("closed","finished","finalized","canceled","merged")')
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
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
  // Date key resets queries at midnight
  const { goLiveAt } = useGoLiveDate();
  const todayDateKey = new Date().toISOString().slice(0, 10);

  const { data: todayStats = { revenue: 0, clients: 0 } } = useQuery({
    queryKey: ["today_revenue", todayDateKey, goLiveAt],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const cutoff = goLiveAt && new Date(goLiveAt) > todayStart ? goLiveAt : todayStart.toISOString();
      const { data, error } = await supabase
        .from("orders")
        .select("total, guests")
        .eq("status", "finalized")
        .gte("created_at", cutoff);
      if (error) throw error;
      return {
        revenue: data.reduce((sum, o) => sum + Number(o.total), 0),
        clients: data.reduce((sum, o) => sum + (o.guests || 1), 0),
      };
    },
    refetchInterval: 60_000,
  });

  // Average service time for today (delivered comandas)
  const { data: avgServiceTime = null } = useQuery({
    queryKey: ["avg_service_time", todayDateKey, goLiveAt],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const cutoff = goLiveAt && new Date(goLiveAt) > todayStart ? goLiveAt : todayStart.toISOString();
      const { data, error } = await supabase
        .from("orders")
        .select("created_at, delivered_at")
        .not("delivered_at", "is", null)
        .gte("created_at", cutoff)
        .not("status", "eq", "canceled");
      if (error) throw error;
      if (!data || data.length === 0) return null;
      const times = data
        .filter((o: any) => o.delivered_at && o.created_at)
        .map((o: any) => new Date(o.delivered_at).getTime() - new Date(o.created_at).getTime());
      if (times.length === 0) return null;
      const avgMs = times.reduce((a: number, b: number) => a + b, 0) / times.length;
      return Math.round(avgMs / 60000);
    },
    refetchInterval: 60_000,
  });

  // Preview query moved below allOrdersByTable (see below)

  // Derive open order IDs to scope item queries
  const openOrderIds = useMemo(() => openOrders.map((o) => o.id), [openOrders]);

  // Fetch item counts only for open orders
  const { data: orderItemCounts = {} } = useQuery({
    queryKey: ["order_item_counts", openOrderIds],
    queryFn: async () => {
      if (openOrderIds.length === 0) return {};
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, quantity")
        .in("order_id", openOrderIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const item of data) {
        counts[item.order_id] = (counts[item.order_id] || 0) + (item.quantity || 1);
      }
      return counts;
    },
    enabled: openOrderIds.length > 0,
  });

  // Count unviewed items only for open orders
  const { data: unviewedCounts = {} } = useQuery({
    queryKey: ["unviewed_item_counts", openOrderIds],
    queryFn: async () => {
      if (openOrderIds.length === 0) return {};
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, quantity, viewed_at")
        .in("order_id", openOrderIds)
        .is("viewed_at", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const item of data) {
        counts[item.order_id] = (counts[item.order_id] || 0) + (item.quantity || 1);
      }
      return counts;
    },
    enabled: openOrderIds.length > 0,
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
      const customerName = form.name.trim();
      // Update table metadata (seats/sector) without changing the default name
      const { error } = await supabase
        .from("restaurant_tables")
        .update({
          seats: parseInt(form.seats) || 4,
          sector: form.sector.trim() || null,
        } as any)
        .eq("id", form.id);
      if (error) throw error;
      // Update customer name on the order if there's an active one
      const activeOrder = ordersByTable[form.id];
      if (activeOrder) {
        await supabase.from("orders").update({ customer_name: customerName || null }).eq("id", activeOrder.id);
      }
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

  // Toggle delivery for a single ORDER (not table) — paralelizado + optimistic
  const toggleOrderDelivered = useMutation({
    mutationFn: async ({ orderId, tableId, isDelivered }: { orderId: string; tableId: string; isDelivered: boolean }) => {
      const now = new Date().toISOString();
      const value = !isDelivered ? now : null;

      const orderUpd = supabase.from("orders").update({ delivered_at: value } as any).eq("id", orderId);
      const itemsUpd = !isDelivered
        ? supabase.from("order_items").update({ delivered_at: value } as any).eq("order_id", orderId).is("delivered_at", null)
        : supabase.from("order_items").update({ delivered_at: value } as any).eq("order_id", orderId);

      await Promise.all([orderUpd, itemsUpd]);
      // Recalc roda em background — não bloqueia o clique
      void recalcTableDeliveryStatus(tableId);
    },
    onMutate: async ({ orderId, tableId, isDelivered }) => {
      const value = !isDelivered ? new Date().toISOString() : null;
      await queryClient.cancelQueries({ queryKey: ["open_orders"] });
      const prevOrders = queryClient.getQueryData<any[]>(["open_orders"]);
      queryClient.setQueryData<any[]>(["open_orders"], (old) =>
        old?.map((o) => (o.id === orderId ? { ...o, delivered_at: value } : o)) ?? old
      );
      const prevTables = queryClient.getQueryData<any[]>(["restaurant_tables"]);
      queryClient.setQueryData<any[]>(["restaurant_tables"], (old) =>
        old?.map((t) => (t.id === tableId ? { ...t, status: !isDelivered ? "delivered" : "occupied" } : t)) ?? old
      );
      return { prevOrders, prevTables };
    },
    onError: (_e, _v, ctx: any) => {
      if (ctx?.prevOrders) queryClient.setQueryData(["open_orders"], ctx.prevOrders);
      if (ctx?.prevTables) queryClient.setQueryData(["restaurant_tables"], ctx.prevTables);
      toast.error("Erro ao atualizar status de entrega");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["preview_order_items"] });
    },
  });

  // Toggle ALL orders on a table as delivered — paralelizado entre pedidos
  const toggleAllOrdersDelivered = useMutation({
    mutationFn: async ({ tableId, markDelivered }: { tableId: string; markDelivered: boolean }) => {
      const tableOrders = allOrdersByTable[tableId] || [];
      const value = markDelivered ? new Date().toISOString() : null;

      const ops: any[] = [];
      for (const ord of tableOrders) {
        ops.push(supabase.from("orders").update({ delivered_at: value } as any).eq("id", ord.id));
        if (markDelivered) {
          ops.push(
            supabase.from("order_items")
              .update({ delivered_at: value } as any)
              .eq("order_id", ord.id)
              .is("delivered_at", null)
          );
        } else {
          ops.push(supabase.from("order_items").update({ delivered_at: value } as any).eq("order_id", ord.id));
        }
      }
      await Promise.all(ops);
      void recalcTableDeliveryStatus(tableId);
    },
    onMutate: async ({ tableId, markDelivered }) => {
      const value = markDelivered ? new Date().toISOString() : null;
      await queryClient.cancelQueries({ queryKey: ["open_orders"] });
      const prevOrders = queryClient.getQueryData<any[]>(["open_orders"]);
      const ids = (allOrdersByTable[tableId] || []).map((o: any) => o.id);
      queryClient.setQueryData<any[]>(["open_orders"], (old) =>
        old?.map((o) => (ids.includes(o.id) ? { ...o, delivered_at: value } : o)) ?? old
      );
      const prevTables = queryClient.getQueryData<any[]>(["restaurant_tables"]);
      queryClient.setQueryData<any[]>(["restaurant_tables"], (old) =>
        old?.map((t) => (t.id === tableId ? { ...t, status: markDelivered ? "delivered" : "occupied" } : t)) ?? old
      );
      return { prevOrders, prevTables };
    },
    onError: (_e, _v, ctx: any) => {
      if (ctx?.prevOrders) queryClient.setQueryData(["open_orders"], ctx.prevOrders);
      if (ctx?.prevTables) queryClient.setQueryData(["restaurant_tables"], ctx.prevTables);
      toast.error("Erro ao atualizar status de entrega");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["preview_order_items"] });
    },
  });

  // Recalculate table status based on its orders' delivered_at
  const recalcTableDeliveryStatus = async (tableId: string) => {
    const { data: tableOrders } = await supabase
      .from("orders")
      .select("id, delivered_at")
      .eq("table_id", tableId)
      .not("status", "in", '("closed","finished","finalized","canceled","merged")');
    if (!tableOrders || tableOrders.length === 0) return;
    const allDelivered = tableOrders.every(o => !!o.delivered_at);
    const newStatus = allDelivered ? "delivered" : "occupied";
    await supabase.from("restaurant_tables").update({ status: newStatus }).eq("id", tableId);
  };

  // Legacy single-order toggle (for waiter single-order tables)
  const toggleDelivered = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const newStatus = currentStatus === "delivered" ? "occupied" : "delivered";
      const { error } = await supabase
        .from("restaurant_tables")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;

      const tableOrder = ordersByTable[id];
      if (tableOrder) {
        if (newStatus === "delivered") {
          await supabase.from("orders").update({ delivered_at: new Date().toISOString() } as any).eq("id", tableOrder.id);
          await supabase.from("order_items")
            .update({ delivered_at: new Date().toISOString() } as any)
            .eq("order_id", tableOrder.id)
            .is("delivered_at", null);
        } else {
          await supabase.from("orders").update({ delivered_at: null } as any).eq("id", tableOrder.id);
          await supabase.from("order_items")
            .update({ delivered_at: null } as any)
            .eq("order_id", tableOrder.id);
        }
      }
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

  const sortedOpenOrders = [...openOrders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const ordersByTable = sortedOpenOrders
    .reduce<Record<string, (typeof openOrders)[0]>>((acc, o) => {
      if (o.table_id && !acc[o.table_id]) acc[o.table_id] = o;
      return acc;
    }, {});
  // All orders grouped by table (for search across all customers)
  const allOrdersByTable = useMemo(() => {
    const map: Record<string, typeof openOrders> = {};
    for (const o of sortedOpenOrders) {
      if (o.table_id) {
        if (!map[o.table_id]) map[o.table_id] = [];
        map[o.table_id].push(o);
      }
    }
    return map;
  }, [openOrders]);

  // Fetch undelivered item counts per order (to override delivered status)
  const { data: undeliveredCounts = {} } = useQuery({
    queryKey: ["undelivered_item_counts", openOrderIds],
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

  // Helper: does any order on this table have undelivered items?
  const tableHasPendingItems = (tableId: string): boolean => {
    const tableOrders = allOrdersByTable?.[tableId] || [];
    if (tableOrders.length === 0) {
      const singleOrder = ordersByTable[tableId];
      if (singleOrder) return (undeliveredCounts[singleOrder.id] || 0) > 0;
      return false;
    }
    return tableOrders.some(o => (undeliveredCounts[o.id] || 0) > 0);
  };


  // Fetch items for ALL orders of the previewed table
  const previewTableOrders = useMemo(() => {
    if (!previewTableId) return [];
    return allOrdersByTable[previewTableId] || [];
  }, [previewTableId, allOrdersByTable]);

  const previewTableOrderIds = useMemo(() => previewTableOrders.map(o => o.id), [previewTableOrders]);

  const { data: previewItems = [] } = useQuery({
    queryKey: ["preview_order_items", previewTableOrderIds],
    queryFn: async () => {
      if (previewTableOrderIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_items")
        .select("id, order_id, product_name, quantity, sent_to_kitchen, viewed_at, delivered_at, notes, order_item_complements(complement_name, quantity)")
        .in("order_id", previewTableOrderIds)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: previewTableOrderIds.length > 0,
  });

  const occupied = Object.keys(ordersByTable).length;
  const free = Math.max(0, tables.length - occupied);

  const sortedTables = useMemo(() => {
    // Active tables (occupied/bill/delivered) come first, then free ones
    const statusPriority: Record<string, number> = {
      occupied: 0,
      bill: 1,
      delivered: 2,
      free: 3,
    };
    return [...tables].sort((a, b) => {
      const aHasOrder = !!ordersByTable[a.id];
      const bHasOrder = !!ordersByTable[b.id];
      // Tables with active orders always come first
      if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1;
      // Among active tables, sort by order creation time (oldest first)
      if (aHasOrder && bHasOrder) {
        const aOrder = ordersByTable[a.id];
        const bOrder = ordersByTable[b.id];
        return new Date(aOrder.created_at).getTime() - new Date(bOrder.created_at).getTime();
      }
      // Among free tables, keep original sort_order
      const sortDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (sortDiff !== 0) return sortDiff;
      return (a.internal_number || a.default_name || a.name).localeCompare(
        b.internal_number || b.default_name || b.name,
        "pt-BR",
        { numeric: true, sensitivity: "base" }
      );
    });
  }, [tables, ordersByTable]);

  // Deterministic visual label: based on full sortedTables (stable, doesn't shift with search)
  const visualLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    sortedTables.forEach((t, i) => {
      labels[t.id] = `Comanda ${i + 1}`;
    });
    return labels;
  }, [sortedTables]);

  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return sortedTables;
    const q = searchQuery.toLowerCase().trim();
    // Allow searching by just the comanda number ("1", "12") or full label ("comanda 1")
    const numericQ = q.replace(/\D/g, "");
    return sortedTables.filter((t) => {
      const order = ordersByTable[t.id];
      const customerMatch = order?.customer_name?.toLowerCase().includes(q);
      const tableNameMatch = t.name.toLowerCase().includes(q);
      const waiterMatch = order?.waiter_name?.toLowerCase().includes(q);
      const allOrders = allOrdersByTable[t.id] || [];
      const internalCustomerMatch = allOrders.some((o) => o.customer_name?.toLowerCase().includes(q));
      const label = (visualLabels[t.id] || "").toLowerCase();
      const labelMatch = label.includes(q);
      const labelNumber = label.replace(/\D/g, "");
      const numberMatch = numericQ.length > 0 && labelNumber === numericQ;
      return customerMatch || tableNameMatch || waiterMatch || internalCustomerMatch || labelMatch || numberMatch;
    });
  }, [sortedTables, ordersByTable, allOrdersByTable, searchQuery, visualLabels]);

  // Map of matched internal customer names per table (for "Contém: X" label)
  const searchMatchedCustomers = useMemo(() => {
    if (!searchQuery.trim()) return {};
    const q = searchQuery.toLowerCase().trim();
    const map: Record<string, string[]> = {};
    for (const t of filteredTables) {
      const primaryOrder = ordersByTable[t.id];
      const allOrders = allOrdersByTable[t.id] || [];
      const matchedNames = allOrders
        .filter((o) => o.customer_name?.toLowerCase().includes(q) && o.id !== primaryOrder?.id)
        .map((o) => o.customer_name!)
        .filter(Boolean);
      if (matchedNames.length > 0) map[t.id] = matchedNames;
    }
    return map;
  }, [filteredTables, ordersByTable, allOrdersByTable, searchQuery]);

  const tablesWithPositions = filteredTables.map((t, i) => {
    const hasPosition = (t.position_x !== null && t.position_x !== 0) || (t.position_y !== null && t.position_y !== 0);
    if (hasPosition) return t;
    const cols = 6;
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { ...t, position_x: 20 + col * (TABLE_W + 16), position_y: 20 + row * (TABLE_H + 16) };
  });

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sticky top section */}
      <div className="flex-shrink-0 p-3 sm:p-6 pb-0 sm:pb-0 overflow-x-hidden">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-semibold">Mapa de Comandas</h1>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Sistema Desenvolvido por Fábio Júnior</p>
        </div>
        <div className="flex gap-2">
          {!isWaiter && (
            <button
              onClick={() => navigate("/relatorios")}
              className="flex items-center gap-1.5 rounded-md border bg-card px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium hover:bg-secondary transition-colors"
              title="Relatórios"
            >
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="hidden sm:inline">Relatórios</span>
            </button>
          )}
          {!isWaiter && (
            <button
              onClick={() => navigate("/usuarios")}
              className="flex items-center gap-1.5 rounded-md border bg-card px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium hover:bg-secondary transition-colors"
              title="Usuários"
            >
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="hidden sm:inline">Usuários</span>
            </button>
          )}
          <div className="hidden sm:flex rounded-md border bg-card overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === "grid" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"}`}
            >
              <Grid3X3 className="h-4 w-4" />
              Grade
            </button>
          </div>
          {!isWaiter && (
            <Popover open={tableCountOpen} onOpenChange={(open) => {
              setTableCountOpen(open);
              if (open) setTableCountValue(String(allTables.length));
            }}>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-1.5 sm:gap-2 rounded-md border bg-card px-2 sm:px-3 py-2 text-xs sm:text-sm font-medium hover:bg-secondary transition-colors">
                  <Plus className="h-4 w-4 text-muted-foreground" />
                  <span className="hidden sm:inline">Qtd. Comandas</span>
                  <span className="sm:hidden">Qtd.</span>
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
          )}
        </div>
      </div>

      {/* Summary Bar - compact horizontal scroll on mobile, grid on desktop */}
      <div className="flex sm:grid sm:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4 overflow-x-auto scrollbar-hide">
        <div className="flex items-center gap-2 sm:gap-3 rounded-xl border bg-card p-1.5 sm:p-3 min-w-[120px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
          <div className="flex h-6 w-6 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-primary/15">
            <Clock className="h-3 w-3 sm:h-4.5 sm:w-4.5 text-primary" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-bold leading-none">{avgServiceTime !== null ? `${avgServiceTime}` : "--"}</p>
            <p className="text-[8px] sm:text-[11px] text-muted-foreground mt-0.5">Média <span className="hidden sm:inline">(min)</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 rounded-xl border bg-card p-1.5 sm:p-3 min-w-[120px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
          <div className="flex h-6 w-6 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-status-occupied/15">
            <Users className="h-3 w-3 sm:h-4.5 sm:w-4.5 text-status-occupied" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-bold leading-none">{occupied}</p>
            <p className="text-[8px] sm:text-[11px] text-muted-foreground mt-0.5">Mesas Ocupadas</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 rounded-xl border bg-card p-1.5 sm:p-3 min-w-[120px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
          <div className="flex h-6 w-6 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-status-free/15">
            <UtensilsCrossed className="h-3 w-3 sm:h-4.5 sm:w-4.5 text-status-free" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-bold leading-none">{free}</p>
            <p className="text-[8px] sm:text-[11px] text-muted-foreground mt-0.5">Mesas Livres</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 rounded-xl border bg-card p-1.5 sm:p-3 min-w-[120px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
          <div className="flex h-6 w-6 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-accent/15">
            <CheckCircle2 className="h-3 w-3 sm:h-4.5 sm:w-4.5 text-accent" />
          </div>
          <div>
            <p className="text-base sm:text-xl font-bold leading-none">{todayStats.clients}</p>
            <p className="text-[8px] sm:text-[11px] text-muted-foreground mt-0.5">Clientes Atendidos</p>
          </div>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative mb-3 sm:mb-4">
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
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 min-h-0 overflow-auto px-3 sm:px-6 pb-3 sm:pb-6">

      {viewMode === "floor" && (
        <div className="mb-3 sm:mb-4">
          <span className="text-xs text-muted-foreground italic">Arraste as comandas para reorganizar o layout</span>
        </div>
      )}

      {/* Grid View */}
      {viewMode === "grid" && (
        <LayoutGroup>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2 sm:gap-3">
          {filteredTables.map((table) => {
            const order = ordersByTable[table.id];
            
            const effectiveStatus: TableStatus = order
              ? (order.status === "billing_in_progress" ? "bill"
                : (table.status === "delivered" && !tableHasPendingItems(table.id) ? "delivered" : "occupied"))
              : (table.status as TableStatus);
            const useInlineOccupied = effectiveStatus === "occupied";
            const useInlineDelivered = effectiveStatus === "delivered";
            const lock = locksByTable[table.id];
            const isLockedByOther = lock && lock.userId !== user?.id;
            return (
              <motion.div
                layout
                layoutId={`comanda-${table.id}`}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                key={table.id}
                className={`${!useInlineOccupied && !useInlineDelivered ? `table-status-${effectiveStatus}` : ""} relative flex flex-col rounded-xl border-2 p-4 sm:p-4 min-h-[160px] sm:min-h-[140px] cursor-pointer group touch-manipulation ${isLockedByOther ? "ring-2 ring-orange-400/70 ring-offset-1 ring-offset-background" : ""}`}
                style={useInlineOccupied ? { backgroundColor: "#ece8fb", borderColor: isLockedByOther ? "#fb923c" : "#c7b8f0", color: "#3730a3" } : useInlineDelivered ? { backgroundColor: "#bbf7d6", borderColor: isLockedByOther ? "#fb923c" : "#bbf7d6", color: "#166534" } : isLockedByOther ? { borderColor: "#fb923c" } : undefined}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => order ? openTable(table.id) : handleQuickEdit(table)}
              >

                {/* Lock indicator */}
                {isLockedByOther && (
                  <div className="absolute top-1.5 right-1.5 z-20 flex items-center gap-1 rounded-full bg-orange-500 text-white px-2 py-0.5 animate-pulse">
                    <Lock className="h-2.5 w-2.5" />
                    <span className="text-[8px] font-bold uppercase leading-none truncate max-w-[60px]">{lock.userName}</span>
                  </div>
                )}



                {/* Unviewed items badge */}
                {order && (unviewedCounts[order.id] || 0) > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 z-20 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-black px-1 leading-none animate-pulse">
                    {unviewedCounts[order.id]}
                  </span>
                )}

                {/* Preview popover for occupied tables — shows ALL orders */}
                {order && (
                  <Popover
                    open={previewTableId === table.id}
                    onOpenChange={(open) => setPreviewTableId(open ? table.id : null)}
                  >
                    <PopoverTrigger asChild>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewTableId((prev) => (prev === table.id ? null : table.id));
                        }}
                        onPointerEnter={(e) => { if (e.pointerType === 'mouse') { e.stopPropagation(); setPreviewTableId(table.id); } }}
                        onPointerLeave={(e) => { if (e.pointerType === 'mouse') { e.stopPropagation(); setPreviewTableId(null); } }}
                        className={`absolute top-1.5 left-1.5 rounded p-1 transition-opacity z-10 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${previewTableId === table.id ? "bg-accent/20" : ""} hover:bg-secondary/80`}
                      >
                        <Eye className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      side="right"
                      align="start"
                      sideOffset={8}
                      className="w-56 p-0 shadow-md max-h-[400px] overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setPreviewTableId(table.id); }}
                      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setPreviewTableId(null); }}
                    >
                      {previewItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic p-2.5">Carregando...</p>
                      ) : (() => {
                        const tableOrders = allOrdersByTable[table.id] || [order];
                        return (
                          <div className="divide-y divide-border">
                            {tableOrders.map((ord) => {
                              const ordItems = previewItems.filter((i) => (i as any).order_id === ord.id);
                              const newItems = ordItems.filter((i) => !(i as any).delivered_at);
                              const completedItems = ordItems.filter((i) => !!(i as any).delivered_at);
                              if (ordItems.length === 0) return null;
                              const isOrderDelivered = !!(ord as any).delivered_at;
                              return (
                                <div key={ord.id} className="p-2">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <p className="text-[10px] font-bold text-foreground flex items-center gap-1 flex-wrap">
                                      👤 {ord.customer_name || ord.waiter_name || "Cliente"}
                                      <span className="text-muted-foreground font-normal">· {ordItems.length} {ordItems.length === 1 ? "item" : "itens"}</span>
                                      <span className="text-muted-foreground font-normal">
                                        <TableDuration createdAt={ord.created_at} />
                                      </span>
                                    </p>
                                    {/* Per-order delivery status badge */}
                                    <span
                                      className={`text-[8px] font-bold uppercase rounded-full px-1.5 py-0.5 ${isOrderDelivered ? "bg-[hsl(var(--status-free)/0.15)] text-[hsl(var(--status-free))]" : "bg-[#7c6bc4]/15 text-[#7c6bc4]"}`}
                                    >
                                      {isOrderDelivered ? "ENTREGUE" : "PENDENTE"}
                                    </span>
                                  </div>
                                  {/* Per-order delivery toggle */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleOrderDelivered.mutate({ orderId: ord.id, tableId: table.id, isDelivered: isOrderDelivered });
                                    }}
                                    className="w-full flex items-center justify-center gap-1 rounded py-1 mb-1.5 text-[9px] font-bold uppercase transition-colors"
                                    style={{
                                      backgroundColor: isOrderDelivered ? "#166534" : "#7c6bc4",
                                      color: isOrderDelivered ? "#bbf7d6" : "white",
                                    }}
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    {isOrderDelivered ? "Entregue ✓" : "Marcar entregue"}
                                  </button>
                                  {newItems.length > 0 && (
                                    <div className="bg-accent/15 rounded-md p-2 ring-1 ring-accent/20 mb-1">
                                      <div className="space-y-1">
                                        {newItems.map((item) => (
                                          <div key={item.id}>
                                            <div className="flex items-center justify-between text-xs gap-1">
                                              <span className="truncate flex-1 mr-1 font-semibold">{item.product_name}</span>
                                              {!(item as any).viewed_at && (
                                                <span className="flex-shrink-0 text-[8px] font-black uppercase bg-destructive text-destructive-foreground rounded px-1 py-0.5 leading-none">NOVO</span>
                                              )}
                                              <span className="text-accent flex-shrink-0 tabular-nums font-bold">×{item.quantity}</span>
                                            </div>
                                            {(item as any).order_item_complements?.length > 0 && (
                                              <div className="ml-2 mt-0.5 space-y-0.5">
                                                {(item as any).order_item_complements.map((c: any, ci: number) => (
                                                  <span key={ci} className="block text-[10px] text-muted-foreground">+ {c.complement_name}{c.quantity > 1 ? ` ×${c.quantity}` : ""}</span>
                                                ))}
                                              </div>
                                            )}
                                            {item.notes && (
                                              <p className="ml-2 mt-0.5 text-[10px] text-muted-foreground italic">📝 {item.notes}</p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {completedItems.length > 0 && (
                                    <div className="bg-[hsl(var(--status-free)/0.08)] rounded-md p-2 ring-1 ring-[hsl(var(--status-free)/0.18)]">
                                      <div className="space-y-1">
                                        {completedItems.map((item) => (
                                          <div key={item.id}>
                                            <div className="flex items-center justify-between text-xs gap-1">
                                              <span className="truncate flex-1 mr-1 line-through opacity-70">{item.product_name}</span>
                                              <span className="text-muted-foreground flex-shrink-0 tabular-nums">×{item.quantity}</span>
                                            </div>
                                            {(item as any).order_item_complements?.length > 0 && (
                                              <div className="ml-2 mt-0.5 space-y-0.5">
                                                {(item as any).order_item_complements.map((c: any, ci: number) => (
                                                  <span key={ci} className="block text-[10px] text-muted-foreground opacity-70">+ {c.complement_name}{c.quantity > 1 ? ` ×${c.quantity}` : ""}</span>
                                                ))}
                                              </div>
                                            )}
                                            {item.notes && (
                                              <p className="ml-2 mt-0.5 text-[10px] text-muted-foreground italic opacity-70">📝 {item.notes}</p>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {/* "Entregar todos" button for multi-order tables */}
                            {(() => {
                              const tableOrders2 = allOrdersByTable[table.id] || [];
                              if (tableOrders2.length <= 1) return null;
                              const allDone = tableOrders2.every(o => !!(o as any).delivered_at);
                              return (
                                <div className="p-2 border-t border-border">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleAllOrdersDelivered.mutate({ tableId: table.id, markDelivered: !allDone });
                                    }}
                                    className="w-full flex items-center justify-center gap-1.5 rounded py-1.5 text-[10px] font-bold uppercase transition-colors"
                                    style={{
                                      backgroundColor: allDone ? "#166534" : "#7c6bc4",
                                      color: allDone ? "#bbf7d6" : "white",
                                    }}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    {allDone ? "Todos entregues ✓" : "Entregar todos"}
                                  </button>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}
                    </PopoverContent>
                  </Popover>
                )}

                {/* Table header */}
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display text-base sm:text-lg leading-tight truncate">
                    {order?.customer_name || visualLabels[table.id] || table.name}
                  </span>
                  {order && <TableDuration createdAt={order.created_at} />}
                </div>

                {/* Comanda N badge — always visible when there's an order, for filtering by number */}
                {order && order.customer_name && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <span
                      className="text-[9px] bg-foreground/10 rounded-full px-1.5 py-0.5 font-semibold uppercase tracking-wide"
                      style={useInlineOccupied ? { backgroundColor: "#d4c8f5", color: "#3730a3" } : useInlineDelivered ? { backgroundColor: "#86efac", color: "#15803d" } : undefined}
                    >
                      {visualLabels[table.id]}
                    </span>
                  </div>
                )}

                {order && ((table as any).sector || (table as any).internal_number) && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] bg-accent/20 rounded-full px-1.5 py-0.5 font-medium" style={useInlineDelivered ? { color: "#15803d" } : undefined}>
                      📍 {(table as any).sector || (table as any).internal_number}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-1.5 mt-1.5">
                  {/* Aggregated delivery status for multi-order tables */}
                  {(() => {
                    const tableOrders = allOrdersByTable[table.id] || [];
                    if (tableOrders.length > 1 && order) {
                      const deliveredCount = tableOrders.filter(o => !!(o as any).delivered_at).length;
                      const allDone = deliveredCount === tableOrders.length;
                      const partial = deliveredCount > 0 && !allDone;
                      const aggregatedLabel = allDone ? "ENTREGUE" : partial ? "PARCIAL" : statusLabels[effectiveStatus];
                      const aggregatedStyle = allDone
                        ? badgeStyles.delivered
                        : partial
                          ? { bg: "hsl(40 90% 50% / 0.15)", color: "hsl(40 90% 30%)" }
                          : (badgeStyles[effectiveStatus] ?? badgeStyles.free);
                      return (
                        <span
                          className="inline-block text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                          style={{ backgroundColor: aggregatedStyle.bg, color: aggregatedStyle.color }}
                        >
                          {aggregatedLabel}
                        </span>
                      );
                    }
                    return (
                      <span
                        className="inline-block text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                        style={{ backgroundColor: (badgeStyles[effectiveStatus] ?? badgeStyles.free).bg, color: (badgeStyles[effectiveStatus] ?? badgeStyles.free).color }}
                      >
                        {statusLabels[effectiveStatus]}
                      </span>
                    );
                  })()}
                  {/* Multi-order badge */}
                  {(() => {
                    const tableOrders = allOrdersByTable[table.id] || [];
                    if (tableOrders.length <= 1) return null;
                    const deliveredCount = tableOrders.filter(o => !!(o as any).delivered_at).length;
                    return (
                      <span className="text-[9px] font-bold bg-accent/20 text-accent rounded-full px-1.5 py-0.5">
                        {tableOrders.length} clientes · {deliveredCount}/{tableOrders.length}
                      </span>
                    );
                  })()}
                </div>

                {/* "Contém: Cliente X" indicator when search matches an internal customer */}
                {searchMatchedCustomers[table.id] && (
                  <p className="text-[9px] text-accent font-medium mt-1 truncate">
                    Contém: {searchMatchedCustomers[table.id].join(", ")}
                  </p>
                )}

{/* Order details — aggregated across all orders */}
                {order && (() => {
                  const tableOrders = allOrdersByTable[table.id] || [order];
                  const totalValue = tableOrders.reduce((sum, o) => sum + Number(o.total), 0);
                  const totalItems = tableOrders.reduce((sum, o) => sum + (orderItemCounts[o.id] || 0), 0);
                  const customerNames = tableOrders.length > 1
                    ? tableOrders.map(o => o.customer_name || o.waiter_name).filter(Boolean)
                    : [];
                  return (
                    <div className="mt-auto pt-2 border-t border-border/50 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold tabular-nums">R$ {totalValue.toFixed(2)}</span>
                        <span className="text-[10px]" style={useInlineDelivered ? { color: "#15803d" } : undefined}>
                          {totalItems} {totalItems === 1 ? "item" : "itens"}
                        </span>
                      </div>
                      {tableOrders.length > 1 && customerNames.length > 0 && (
                        <p className="text-[9px] text-muted-foreground truncate">
                          {customerNames.slice(0, 3).join(", ")}{customerNames.length > 3 ? ` +${customerNames.length - 3}` : ""}
                        </p>
                      )}
                      {tableOrders.length === 1 && order?.waiter_name && (
                        <p className="text-[10px] truncate" style={{ color: useInlineOccupied ? "#4f46e5" : useInlineDelivered ? "#15803d" : undefined }}>{order.waiter_name}</p>
                      )}
                    </div>
                  );
                })()}

                {/* Delivery toggle - multi-order aware */}
                {(effectiveStatus === "occupied" || effectiveStatus === "delivered") && (() => {
                  const tableOrders = allOrdersByTable[table.id] || [];
                  const isMulti = tableOrders.length > 1;
                  if (isMulti) {
                    const allDone = tableOrders.every(o => !!(o as any).delivered_at);
                    return (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          toggleAllOrdersDelivered.mutate({ tableId: table.id, markDelivered: !allDone });
                        }}
                        className="mt-2 flex items-center justify-center gap-1.5 w-full rounded-lg py-2.5 sm:py-1.5 text-[11px] sm:text-[10px] font-bold uppercase tracking-wider transition-transform hover:scale-[1.02] active:scale-[0.97] touch-manipulation"
                        style={{
                          backgroundColor: allDone ? "#166534" : "#7c6bc4",
                          color: allDone ? "#bbf7d6" : "white",
                        }}
                        title={allDone ? "Desmarcar todos" : "Entregar todos"}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {allDone ? "Todos entregues ✓" : "Entregar todos"}
                      </button>
                    );
                  }
                  // Single order — use legacy toggle
                  return (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        toggleDelivered.mutate({ id: table.id, currentStatus: table.status });
                      }}
                      className="mt-2 flex items-center justify-center gap-1.5 w-full rounded-lg py-2.5 sm:py-1.5 text-[11px] sm:text-[10px] font-bold uppercase tracking-wider transition-transform hover:scale-[1.02] active:scale-[0.97] touch-manipulation"
                      style={{
                        backgroundColor: effectiveStatus === "delivered" ? "#166534" : "#7c6bc4",
                        color: effectiveStatus === "delivered" ? "#bbf7d6" : "white",
                      }}
                      title={effectiveStatus === "delivered" ? "Desmarcar entregue" : "Marcar como entregue"}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {effectiveStatus === "delivered" ? "Entregue ✓" : "Marcar entregue"}
                    </button>
                  );
                })()}
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
                  ? (order.status === "billing_in_progress" ? "bill"
                    : (table.status === "delivered" && !tableHasPendingItems(table.id) ? "delivered" : "occupied"))
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


                <span className="font-display text-sm">{visualLabels[table.id] || table.name}</span>
                
                {order && ((table as any).sector || (table as any).internal_number) && (
                  <span className="text-[8px] bg-accent/30 rounded px-1 mt-0.5" style={floorInlineDelivered ? { color: "#15803d" } : undefined}>📍 {(table as any).sector || (table as any).internal_number}</span>
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
              <h3 className="text-sm font-semibold">Abrir Comanda</h3>
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
              <p className="text-xs text-muted-foreground">
                A comanda será identificada pelo número e pelo nome do cliente (se informado).
              </p>
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
    </div>
  );
}
