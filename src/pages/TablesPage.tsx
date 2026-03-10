import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, CircleDollarSign, Loader2, Settings, Grid3X3, Move, Edit2, X, Check, Eye } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

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

interface QuickEditForm {
  id: string;
  name: string;
  seats: string;
  sector: string;
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

  // Fetch items for the previewed order
  const { data: previewItems = [] } = useQuery({
    queryKey: ["preview_order_items", previewOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, product_name, quantity")
        .eq("order_id", previewOrderId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!previewOrderId,
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
      const { error } = await supabase
        .from("restaurant_tables")
        .update({
          name: form.name.trim(),
          seats: parseInt(form.seats) || 4,
          sector: form.sector.trim() || null,
        } as any)
        .eq("id", form.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables_admin"] });
      setQuickEdit(null);
      toast.success("Mesa atualizada!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const openTable = (id: string) => {
    navigate(`/mesas/${id}/pedido`);
  };

  const handleQuickEdit = (e: React.MouseEvent, table: any) => {
    e.stopPropagation();
    e.preventDefault();
    setQuickEdit({
      id: table.id,
      name: table.name,
      seats: String(table.seats),
      sector: (table as any).sector || "",
    });
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, tableId: string, tableX: number, tableY: number) => {
      if (viewMode !== "floor") return;
      if (quickEdit) return; // Don't drag while editing
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
  const ordersByTable = openOrders.reduce<Record<string, (typeof openOrders)[0]>>((acc, o) => {
    if (o.table_id) acc[o.table_id] = o;
    return acc;
  }, {});

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
              onClick={() => setViewMode("grid")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === "grid" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"}`}
            >
              <Grid3X3 className="h-4 w-4" />
              Grade
            </button>
            <button
              onClick={() => setViewMode("floor")}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === "floor" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"}`}
            >
              <Move className="h-4 w-4" />
              Planta
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
            const isPreviewOpen = previewOrderId === order?.id;
            return (
              <div
                key={table.id}
                className={`table-status-${table.status} relative flex flex-col items-center justify-center rounded-lg border-2 p-4 min-h-[120px] cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] group`}
                onClick={() => openTable(table.id)}
              >
                {/* Quick edit button */}
                <button
                  onClick={(e) => handleQuickEdit(e, table)}
                  className="absolute top-1.5 right-1.5 rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-secondary/80 transition-opacity z-10"
                  title="Editar mesa"
                >
                  <Edit2 className="h-3 w-3 text-muted-foreground" />
                </button>

                {/* Preview button for occupied tables */}
                {order && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPreviewOrderId(isPreviewOpen ? null : order.id);
                    }}
                    className={`absolute top-1.5 left-1.5 rounded p-1 transition-opacity z-10 ${isPreviewOpen ? "opacity-100 bg-accent/20" : "opacity-0 group-hover:opacity-100"} hover:bg-secondary/80`}
                    title="Prévia do pedido"
                  >
                    <Eye className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}

                <span className="font-display text-lg">{table.name}</span>
                {(table as any).internal_number && (
                  <span className="text-[10px] text-muted-foreground">#{(table as any).internal_number}</span>
                )}
                <span className="text-xs text-muted-foreground mt-1">{table.seats} lugares</span>
                {(table as any).sector && (
                  <span className="text-[9px] bg-accent/30 rounded-full px-1.5 py-0.5 mt-1 font-medium text-muted-foreground">{(table as any).sector}</span>
                )}
                <span className="text-[10px] font-medium uppercase tracking-wider mt-2 text-muted-foreground">
                  {statusLabels[table.status as TableStatus]}
                </span>
                {order && (
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="font-semibold">R$ {Number(order.total).toFixed(2)}</span>
                    {(order as any).guests > 1 && (
                      <span className="text-muted-foreground">{(order as any).guests}p</span>
                    )}
                  </div>
                )}
                {(order as any)?.customer_name && (
                  <span className="text-[10px] text-accent font-medium mt-0.5">{(order as any).customer_name}</span>
                )}
                {order?.waiter_name && (
                  <span className="text-[10px] text-muted-foreground mt-0.5">{order.waiter_name}</span>
                )}

                {/* Order preview popup */}
                {isPreviewOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 right-0 top-full mt-1 z-30 rounded-md border bg-background shadow-lg p-2.5 min-w-[160px]"
                  >
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">Pedido</p>
                    {previewItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Carregando...</p>
                    ) : (
                      <div className="space-y-0.5">
                        {previewItems.slice(0, 6).map((item) => (
                          <div key={item.id} className="flex items-center justify-between text-xs">
                            <span className="truncate flex-1 mr-2">{item.product_name}</span>
                            <span className="text-muted-foreground flex-shrink-0">×{item.quantity}</span>
                          </div>
                        ))}
                        {previewItems.length > 6 && (
                          <p className="text-[10px] text-muted-foreground text-center pt-1">
                            +{previewItems.length - 6} itens...
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
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
                className={`table-status-${table.status} absolute flex flex-col items-center justify-center rounded-lg border-2 cursor-grab active:cursor-grabbing select-none transition-shadow group ${isDragging ? "shadow-lg z-50 scale-105" : "hover:shadow-md"}`}
                style={{
                  left: x,
                  top: y,
                  width: TABLE_W,
                  height: TABLE_H,
                  transition: isDragging ? "none" : "box-shadow 0.2s, transform 0.2s",
                }}
              >
                {/* Quick edit button on floor plan */}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => handleQuickEdit(e, table)}
                  className="absolute top-1 right-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-secondary/80 transition-opacity z-10"
                  title="Editar mesa"
                >
                  <Edit2 className="h-2.5 w-2.5 text-muted-foreground" />
                </button>

                <span className="font-display text-sm">{table.name}</span>
                {(table as any).internal_number && (
                  <span className="text-[8px] text-muted-foreground">#{(table as any).internal_number}</span>
                )}
                <span className="text-[10px] text-muted-foreground mt-0.5">{table.seats} lug</span>
                {(table as any).sector && (
                  <span className="text-[8px] bg-accent/30 rounded px-1 mt-0.5 text-muted-foreground">{(table as any).sector}</span>
                )}
                <span className="text-[9px] font-medium uppercase tracking-wider mt-1 text-muted-foreground">
                  {statusLabels[table.status as TableStatus]}
                </span>
                {order && (
                  <span className="text-[10px] font-semibold mt-0.5">R$ {Number(order.total).toFixed(2)}{(order as any).guests > 1 ? ` · ${(order as any).guests}p` : ""}</span>
                )}
                {(order as any)?.customer_name && (
                  <span className="text-[8px] text-accent font-medium truncate max-w-[110px]">{(order as any).customer_name}</span>
                )}
                {order?.waiter_name && (
                  <span className="text-[9px] text-muted-foreground">{order.waiter_name}</span>
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
              <h3 className="text-sm font-semibold">Edição Rápida</h3>
              <button onClick={() => setQuickEdit(null)} className="rounded p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nome de Exibição</label>
                <input
                  type="text"
                  value={quickEdit.name}
                  onChange={(e) => setQuickEdit({ ...quickEdit, name: e.target.value })}
                  autoFocus
                  className="mt-1 w-full rounded-md border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Lugares</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={quickEdit.seats}
                    onChange={(e) => setQuickEdit({ ...quickEdit, seats: e.target.value })}
                    className="mt-1 w-full rounded-md border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Setor</label>
                  <input
                    type="text"
                    value={quickEdit.sector}
                    onChange={(e) => setQuickEdit({ ...quickEdit, sector: e.target.value })}
                    placeholder="Ex: Varanda"
                    className="mt-1 w-full rounded-md border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setQuickEdit(null)} className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary">
                Cancelar
              </button>
              <button
                disabled={!quickEdit.name.trim() || quickEditMutation.isPending}
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
