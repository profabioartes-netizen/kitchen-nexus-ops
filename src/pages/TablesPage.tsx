import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, CircleDollarSign, Loader2, Settings, Grid3X3, Move } from "lucide-react";
import { useNavigate } from "react-router-dom";

type TableStatus = "free" | "occupied" | "reserved" | "bill";

const statusLabels: Record<TableStatus, string> = {
  free: "Livre",
  occupied: "Ocupada",
  reserved: "Reservada",
  bill: "Conta",
};

const statusCycle: TableStatus[] = ["free", "occupied", "reserved", "bill"];

const TABLE_W = 130;
const TABLE_H = 120;

export default function TablesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<"grid" | "floor">("floor");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [didDrag, setDidDrag] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

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
        .eq("status", "open");
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("restaurant_tables")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
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

  const openTable = (id: string) => {
    navigate(`/mesas/${id}/pedido`);
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, tableId: string, tableX: number, tableY: number) => {
      if (viewMode !== "floor") return;
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
    [viewMode]
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
  const ordersByTable = openOrders.reduce<Record<string, (typeof openOrders)[0]>>((acc, o) => {
    if (o.table_id) acc[o.table_id] = o;
    return acc;
  }, {});

  // Auto-assign positions for tables that have no position set (both 0,0)
  const tablesWithPositions = tables.map((t, i) => {
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
        <h1 className="text-2xl font-semibold">Mapa de Mesas</h1>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{occupied}/{tables.length} ocupadas</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2">
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              R$ {openOrders.reduce((s, o) => s + Number(o.total), 0).toFixed(2)}
            </span>
          </div>
          <div className="flex rounded-md border bg-card overflow-hidden">
            <button
              onClick={() => setViewMode("floor")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === "floor" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"}`}
            >
              <Move className="h-4 w-4" />
              Planta
            </button>
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
        </div>
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
          <span className="text-xs text-muted-foreground ml-auto italic">Arraste as mesas para reorganizar o layout</span>
        )}
      </div>

      {/* Grid View */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {tables.map((table) => {
            const order = ordersByTable[table.id];
            return (
              <button
                key={table.id}
                onClick={() => cycleStatus(table.id, table.status)}
                className={`table-status-${table.status} relative flex flex-col items-center justify-center rounded-lg border-2 p-4 min-h-[120px] cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]`}
              >
                <span className="font-display text-lg">{table.name}</span>
                <span className="text-xs text-muted-foreground mt-1">{table.seats} lugares</span>
                <span className="text-[10px] font-medium uppercase tracking-wider mt-2 text-muted-foreground">
                  {statusLabels[table.status as TableStatus]}
                </span>
                {order && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="font-semibold">R$ {Number(order.total).toFixed(2)}</span>
                  </div>
                )}
                {order?.waiter_name && (
                  <span className="text-[10px] text-muted-foreground mt-1">{order.waiter_name}</span>
                )}
              </button>
            );
          })}
        </div>
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

            return (
              <div
                key={table.id}
                onPointerDown={(e) => handlePointerDown(e, table.id, x, y)}
                onClick={() => {
                  if (!isDragging) cycleStatus(table.id, table.status);
                }}
                className={`table-status-${table.status} absolute flex flex-col items-center justify-center rounded-lg border-2 cursor-grab active:cursor-grabbing select-none transition-shadow ${isDragging ? "shadow-lg z-50 scale-105" : "hover:shadow-md"}`}
                style={{
                  left: x,
                  top: y,
                  width: TABLE_W,
                  height: TABLE_H,
                  transition: isDragging ? "none" : "box-shadow 0.2s, transform 0.2s",
                }}
              >
                <span className="font-display text-sm">{table.name}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">{table.seats} lug</span>
                <span className="text-[9px] font-medium uppercase tracking-wider mt-1 text-muted-foreground">
                  {statusLabels[table.status as TableStatus]}
                </span>
                {order && (
                  <span className="text-[10px] font-semibold mt-1">R$ {Number(order.total).toFixed(2)}</span>
                )}
                {order?.waiter_name && (
                  <span className="text-[9px] text-muted-foreground">{order.waiter_name}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
