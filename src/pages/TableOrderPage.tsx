import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search, Plus, Minus, Trash2, ArrowLeft, Loader2, Send, CreditCard, Banknote, Smartphone, Clock, StickyNote, User, X, ArrowRightLeft, Merge,
} from "lucide-react";
import ActivityTimeline from "@/components/ActivityTimeline";
import AddItemDialog, { type AddItemPayload } from "@/components/AddItemDialog";
import PaymentPanel from "@/components/PaymentPanel";
import { useAuth } from "@/contexts/AuthContext";

type TableStatus = "free" | "occupied" | "reserved" | "bill";

const statusLabels: Record<TableStatus, string> = {
  free: "Livre",
  occupied: "Ocupada",
  reserved: "Reservada",
  bill: "Conta",
};

const methodLabels: Record<string, string> = {
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  pix: "Pix",
};

// Helper to log activity
async function logActivity(
  tableId: string,
  action: string,
  description: string,
  orderId?: string | null,
  userName?: string | null,
) {
  await supabase.from("table_activity_log").insert({
    table_id: tableId,
    order_id: orderId ?? null,
    action,
    description,
    user_name: userName ?? null,
  });
}

export default function TableOrderPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [waiterName, setWaiterName] = useState("");
  const [showWaiterPrompt, setShowWaiterPrompt] = useState(false);
  const [noteItemId, setNoteItemId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [serviceFeeEnabled, setServiceFeeEnabled] = useState(false);
  const autoCreatedRef = useRef(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | null>(null);
  const [mergeConfirm, setMergeConfirm] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);

  const invalidateLog = () => queryClient.invalidateQueries({ queryKey: ["activity_log", tableId] });

  // Fetch table
  const { data: table, isLoading: tableLoading } = useQuery({
    queryKey: ["table", tableId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("id", tableId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!tableId,
  });

  // Fetch open order for this table
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["table_order", tableId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("table_id", tableId!)
        .eq("status", "open")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tableId,
  });

  // Fetch order items
  const { data: orderItems = [] } = useQuery({
    queryKey: ["order_items", order?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", order!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!order?.id,
  });

  // Fetch complements for all order items
  const orderItemIds = orderItems.map((i) => i.id);
  const { data: itemComplements = [] } = useQuery({
    queryKey: ["order_item_complements", orderItemIds.join(",")],
    queryFn: async () => {
      if (orderItemIds.length === 0) return [];
      const { data, error } = await supabase
        .from("order_item_complements")
        .select("*")
        .in("order_item_id", orderItemIds);
      if (error) throw error;
      return data;
    },
    enabled: orderItemIds.length > 0,
  });

  // Products & categories
  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name)")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // All active tables (for transfer dialog)
  const { data: allTables = [] } = useQuery({
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

  // Open orders for all tables (to detect conflicts)
  const { data: allOpenOrders = [] } = useQuery({
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

  if (!activeCategory && categories.length > 0) {
    setActiveCategory(categories[0].id);
  }

  // Transfer order mutation
  const transferOrder = useMutation({
    mutationFn: async ({ targetTableId, merge }: { targetTableId: string; merge: boolean }) => {
      if (!order) throw new Error("Sem pedido aberto");
      const targetTable = allTables.find((t) => t.id === targetTableId);
      const targetOrder = allOpenOrders.find((o) => o.table_id === targetTableId);

      if (targetOrder && !merge) {
        throw new Error("MERGE_REQUIRED");
      }

      if (targetOrder && merge) {
        // Move all items to target order
        await supabase.from("order_items").update({ order_id: targetOrder.id }).eq("order_id", order.id);
        // Move payments
        await supabase.from("payments").update({ order_id: targetOrder.id }).eq("order_id", order.id);
        // Update target order total
        const newTotal = Number(order.total) + Number(targetOrder.total);
        await supabase.from("orders").update({ total: newTotal }).eq("id", targetOrder.id);
        // Close source order
        await supabase.from("orders").update({ status: "merged" }).eq("id", order.id);
        // Copy activity logs to target table
        await logActivity(targetTableId, "order_merged", `Pedido da ${table?.name ?? "mesa"} mesclado — R$ ${Number(order.total).toFixed(2)}`, targetOrder.id, profile?.full_name);
      } else {
        // Simply reassign the order to the target table
        await supabase.from("orders").update({ table_id: targetTableId }).eq("id", order.id);
        // Copy activity logs referencing this table to the new one
        await logActivity(targetTableId, "order_received", `Pedido transferido da ${table?.name ?? "mesa"} — R$ ${Number(order.total).toFixed(2)}`, order.id, profile?.full_name);
      }

      // Source table becomes free
      await supabase.from("restaurant_tables").update({ status: "free" }).eq("id", tableId!);
      // Target table becomes occupied
      await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", targetTableId);

      // Log on source table
      await logActivity(tableId!, "table_transferred", `Pedido transferido para ${targetTable?.name ?? "outra mesa"}${merge ? " (mesclado)" : ""}`, order.id, profile?.full_name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      toast.success("Pedido transferido com sucesso!");
      navigate("/");
    },
    onError: (err) => {
      if ((err as Error).message === "MERGE_REQUIRED") {
        setMergeConfirm(true);
      } else {
        toast.error((err as Error).message);
      }
    },
  });

  // Create order
  const createOrder = useMutation({
    mutationFn: async (waiter?: string) => {
      const waiterLabel = waiter || profile?.full_name || null;
      const { data, error } = await supabase
        .from("orders")
        .insert({ table_id: tableId!, status: "open", total: 0, waiter_name: waiterLabel })
        .select()
        .single();
      if (error) throw error;
      await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", tableId!);
      await logActivity(tableId!, "table_opened", `Mesa ${table?.name ?? ""} aberta${waiterLabel ? ` — Garçom: ${waiterLabel}` : ""}`, data.id, waiterLabel);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      invalidateLog();
    },
  });

  // Auto-create order if table has no active order
  useEffect(() => {
    if (!tableLoading && !orderLoading && !order && tableId && !autoCreatedRef.current && !createOrder.isPending) {
      autoCreatedRef.current = true;
      createOrder.mutate(undefined);
    }
  }, [tableLoading, orderLoading, order, tableId, createOrder.isPending]);


  const addItem = useMutation({
    mutationFn: async (payload: AddItemPayload) => {
      const { product, quantity, notes, complements, complementsTotal } = payload;
      let currentOrder = order;
      if (!currentOrder) {
        currentOrder = await createOrder.mutateAsync(waiterName || undefined);
      }

      const unitPrice = Number(product.price) + complementsTotal;
      const { data: insertedItem, error: itemError } = await supabase.from("order_items").insert({
        order_id: currentOrder.id,
        product_id: product.id,
        product_name: product.name,
        price: unitPrice,
        quantity,
        notes: notes || null,
        sent_to_kitchen: true,
        preparation_status: "sent",
        sent_at: new Date().toISOString(),
      } as any).select().single();
      if (itemError) throw itemError;

      // Insert complements for this item
      if (complements.length > 0) {
        await supabase.from("order_item_complements").insert(
          complements.map((c) => ({
            order_item_id: insertedItem.id,
            complement_id: c.id,
            complement_name: c.name,
            price: c.price,
            quantity: c.quantity,
          }))
        );
      }

      // Create print job for the product's station
      const station = (product as any).station || "Cozinha";
      await supabase.from("print_jobs").insert({
        station,
        status: "pending",
        payload: {
          product_name: product.name,
          quantity,
          table_name: table?.name || "—",
          waiter_name: currentOrder.waiter_name || waiterName || null,
          notes: notes || null,
          complements: complements.map((c) => `${c.name}${c.price > 0 ? ` (+R$${c.price.toFixed(2)})` : ""}`),
          order_id: currentOrder.id,
        },
      });

      const newTotal = [...orderItems, { price: unitPrice, quantity }].reduce(
        (s, i) => s + Number(i.price) * i.quantity, 0
      );
      await supabase.from("orders").update({ total: newTotal }).eq("id", currentOrder.id);

      const compDesc = complements.length > 0 ? ` [${complements.map(c => c.name).join(", ")}]` : "";
      await logActivity(tableId!, "item_added", `Adicionado e enviado à produção: ${product.name} ×${quantity}${compDesc} (R$ ${(unitPrice * quantity).toFixed(2)})`, currentOrder.id);
    },
    onSuccess: () => {
      setSelectedProduct(null);
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["order_item_complements"] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["kitchen_items"] });
      invalidateLog();
    },
  });

  // Update qty
  const updateQty = useMutation({
    mutationFn: async ({ itemId, delta }: { itemId: string; delta: number }) => {
      const item = orderItems.find((i) => i.id === itemId);
      if (!item) return;
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        await supabase.from("order_items").delete().eq("id", itemId);
        await logActivity(tableId!, "item_removed", `Removido: ${item.product_name}`, order?.id);
      } else {
        await supabase.from("order_items").update({ quantity: newQty }).eq("id", itemId);
        await logActivity(
          tableId!,
          "item_qty_changed",
          `${item.product_name}: ${item.quantity} → ${newQty}`,
          order?.id
        );
      }
      const remaining = orderItems
        .map((i) => (i.id === itemId ? { ...i, quantity: newQty } : i))
        .filter((i) => i.quantity > 0);
      const newTotal = remaining.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      await supabase.from("orders").update({ total: newTotal }).eq("id", order!.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      invalidateLog();
    },
  });

  // Remove item
  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const item = orderItems.find((i) => i.id === itemId);
      await supabase.from("order_items").delete().eq("id", itemId);
      const remaining = orderItems.filter((i) => i.id !== itemId);
      const newTotal = remaining.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      await supabase.from("orders").update({ total: newTotal }).eq("id", order!.id);
      if (item) {
        await logActivity(tableId!, "item_removed", `Removido: ${item.product_name} (×${item.quantity})`, order?.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      invalidateLog();
    },
  });

  // Save note on item
  const saveNote = useMutation({
    mutationFn: async ({ itemId, notes }: { itemId: string; notes: string }) => {
      const { error } = await supabase
        .from("order_items")
        .update({ notes: notes || null })
        .eq("id", itemId);
      if (error) throw error;
      const item = orderItems.find((i) => i.id === itemId);
      if (notes && item) {
        await logActivity(tableId!, "note_added", `Obs em ${item.product_name}: "${notes}"`, order?.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      setNoteItemId(null);
      setNoteText("");
      invalidateLog();
      toast.success("Observação salva!");
    },
  });

  // Send to kitchen
  const sendToKitchen = useMutation({
    mutationFn: async () => {
      const unsent = orderItems.filter((i) => !i.sent_to_kitchen);
      if (unsent.length === 0) throw new Error("Nenhum item novo para enviar");
      const ids = unsent.map((i) => i.id);
      const { error } = await supabase
        .from("order_items")
        .update({ sent_to_kitchen: true, preparation_status: "sent" } as any)
        .in("id", ids);
      if (error) throw error;
      const desc = unsent.map((i) => `${i.product_name} ×${i.quantity}`).join(", ");
      await logActivity(tableId!, "sent_to_kitchen", `Enviado à cozinha: ${desc}`, order?.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      toast.success("Pedido enviado à cozinha!");
      invalidateLog();
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Pay & close
  const payMutation = useMutation({
    mutationFn: async (payments: { method: string; amount: number }[]) => {
      if (!order) throw new Error("Sem pedido aberto");
      await supabase
        .from("order_items")
        .update({ sent_to_kitchen: true })
        .eq("order_id", order.id);

      // Insert all payments
      for (const p of payments) {
        await supabase.from("payments").insert({ order_id: order.id, method: p.method, amount: p.amount });
      }

      const totalVal = payments.reduce((s, p) => s + p.amount, 0);
      const desc = payments.length === 1
        ? `Pagamento: R$ ${totalVal.toFixed(2)} (${methodLabels[payments[0].method] ?? payments[0].method})`
        : `Pagamento dividido (${payments.length}×): R$ ${totalVal.toFixed(2)} — ${payments.map(p => `${methodLabels[p.method] ?? p.method}: R$ ${p.amount.toFixed(2)}`).join(", ")}`;
      await logActivity(tableId!, "payment_added", desc, order.id);

      await supabase.from("orders").update({ status: "closed", total: totalVal }).eq("id", order.id);
      await supabase.from("restaurant_tables").update({ status: "free" }).eq("id", tableId!);
      await logActivity(tableId!, "table_closed", `Mesa ${table?.name ?? ""} fechada`, order.id);

      // Create receipt print job
      await supabase.from("print_jobs").insert({
        station: "Caixa",
        status: "pending",
        payload: {
          type: "receipt",
          table_name: table?.name || "—",
          waiter_name: order.waiter_name || null,
          order_id: order.id,
          items: orderItems.map((i) => ({
            name: i.product_name,
            quantity: i.quantity,
            unit_price: Number(i.price),
            total: Number(i.price) * i.quantity,
          })),
          subtotal: orderItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0),
          total: totalVal,
          payments: payments.map((p) => ({
            method: methodLabels[p.method] ?? p.method,
            amount: p.amount,
          })),
          closed_at: new Date().toISOString(),
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      toast.success("Pagamento registrado! Mesa liberada.");
      navigate("/");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const filtered = products.filter(
    (p) =>
      p.category_id === activeCategory &&
      p.name.toLowerCase().includes(search.toLowerCase())
  );

  const total = orderItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
  const unsentCount = orderItems.filter((i) => !i.sent_to_kitchen).length;

  if (tableLoading || orderLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show loading while auto-creating order
  if (!order && !orderLoading && !tableLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Abrindo comanda...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Product selection */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate("/")}
            className="rounded-md border bg-card p-2 hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <h1 className="text-xl font-semibold">{table?.name ?? "Mesa"}</h1>
            {table && (
              <span className={`table-status-${table.status} rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider border`}>
                {statusLabels[table.status as TableStatus] ?? table.status}
              </span>
            )}
          </div>
          <button
            onClick={() => { setShowTransfer(true); setTransferTarget(null); setMergeConfirm(false); }}
            disabled={!order || orderItems.length === 0}
            className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors bg-card hover:bg-secondary disabled:opacity-50"
          >
            <ArrowRightLeft className="h-4 w-4" />
            Transferir
          </button>
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              showTimeline ? "bg-accent text-accent-foreground" : "bg-card hover:bg-secondary"
            }`}
          >
            <Clock className="h-4 w-4" />
            Histórico
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex gap-2 mb-3 flex-wrap">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat.id
                  ? "bg-accent text-accent-foreground"
                  : "bg-card text-foreground hover:bg-secondary"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-auto flex-1">
          {filtered.map((product) => (
            <button
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              disabled={addItem.isPending}
              className="flex flex-col items-start rounded-lg border bg-card p-3 text-left transition-all hover:border-accent active:scale-[0.97]"
            >
              <span className="font-medium text-sm">{product.name}</span>
              <span className="text-accent font-semibold mt-1">
                R$ {Number(product.price).toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: Order panel */}
      <div className="w-80 border-l bg-card flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">Comanda</h2>
          <div className="flex items-center gap-1.5 mt-1">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={waiterName || order?.waiter_name || ""}
              onChange={(e) => setWaiterName(e.target.value)}
              onBlur={async () => {
                if (order && waiterName && waiterName !== order.waiter_name) {
                  await supabase.from("orders").update({ waiter_name: waiterName }).eq("id", order.id);
                  queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
                }
              }}
              placeholder="Nome do garçom..."
              className="text-xs bg-transparent border-b border-transparent hover:border-border focus:border-ring outline-none py-0.5 flex-1 text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-1">
          {orderItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Toque num produto para adicionar
            </p>
          )}
          {orderItems.map((item) => {
            const prepStatus = (item as any).preparation_status ?? "pending";
            const prepColors: Record<string, string> = {
              pending: "text-muted-foreground bg-muted",
              sent: "text-[hsl(var(--status-reserved))] bg-[hsl(var(--status-reserved)/0.12)]",
              preparing: "text-[hsl(var(--status-occupied))] bg-[hsl(var(--status-occupied)/0.12)]",
              ready: "text-[hsl(var(--status-free))] bg-[hsl(var(--status-free)/0.12)]",
              delivered: "text-primary bg-primary/10",
            };
            const prepLabels: Record<string, string> = {
              pending: "PENDENTE",
              sent: "ENVIADO",
              preparing: "PREPARANDO",
              ready: "PRONTO",
              delivered: "ENTREGUE",
            };
            return (
              <div
                key={item.id}
                className={`flex items-center justify-between rounded-md border p-2 ${
                  item.sent_to_kitchen ? "bg-muted/50 border-muted" : "bg-background"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium truncate">{item.product_name}</p>
                    {item.sent_to_kitchen && (
                      <span className={`text-[9px] rounded px-1 py-0.5 font-medium whitespace-nowrap ${prepColors[prepStatus] ?? prepColors.pending}`}>
                        {prepLabels[prepStatus] ?? "PENDENTE"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    R$ {Number(item.price).toFixed(2)} × {item.quantity}
                  </p>
                  {/* Complements */}
                  {(() => {
                    const comps = itemComplements.filter((c) => c.order_item_id === item.id);
                    if (comps.length === 0) return null;
                    return (
                      <div className="mt-0.5 space-y-0">
                        {comps.map((c) => (
                          <p key={c.id} className="text-[10px] text-muted-foreground">
                            + {c.complement_name}{Number(c.price) > 0 ? ` (R$ ${Number(c.price).toFixed(2)})` : ""}
                          </p>
                        ))}
                      </div>
                    );
                  })()}
                  {item.notes && (
                    <p className="text-[10px] text-muted-foreground italic mt-0.5 truncate">📝 {item.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <button
                    onClick={() => { setNoteItemId(item.id); setNoteText(item.notes ?? ""); }}
                    className="rounded p-1 hover:bg-secondary"
                    title="Observação"
                  >
                    <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => updateQty.mutate({ itemId: item.id, delta: -1 })}
                    disabled={item.sent_to_kitchen}
                    className="rounded p-1 hover:bg-secondary disabled:opacity-30"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-6 text-center text-sm font-medium">{item.quantity}</span>
                  <button
                    onClick={() => updateQty.mutate({ itemId: item.id, delta: 1 })}
                    disabled={item.sent_to_kitchen}
                    className="rounded p-1 hover:bg-secondary disabled:opacity-30"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => removeItem.mutate(item.id)}
                    disabled={item.sent_to_kitchen}
                    className="rounded p-1 hover:bg-destructive/10 text-destructive ml-1 disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t p-4 space-y-3">
          {!showPayment ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-display text-xl">TOTAL</span>
                <span className="font-display text-xl">R$ {total.toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={unsentCount === 0 || sendToKitchen.isPending}
                  onClick={() => sendToKitchen.mutate()}
                  className="flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  <span className="text-sm">Enviar ({unsentCount})</span>
                </button>
                <button
                  disabled={orderItems.length === 0}
                  onClick={() => setShowPayment(true)}
                  className="flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="text-sm">Fechar Conta</span>
                </button>
              </div>
            </>
          ) : (
            <PaymentPanel
              total={total}
              orderItems={orderItems}
              serviceFeeEnabled={serviceFeeEnabled}
              onToggleServiceFee={setServiceFeeEnabled}
              onPay={(payments) => payMutation.mutate(payments)}
              onCancel={() => setShowPayment(false)}
              isPending={payMutation.isPending}
            />
          )}
        </div>
      </div>

      {/* Timeline panel */}
      {showTimeline && tableId && (
        <div className="w-72 border-l bg-background flex flex-col">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-sm">Histórico de Atividades</h2>
          </div>
          <div className="flex-1 overflow-auto">
            <ActivityTimeline tableId={tableId} />
          </div>
        </div>
      )}
      {/* Note dialog */}
      {noteItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
          <div className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Observação do Item</h3>
              <button onClick={() => { setNoteItemId(null); setNoteText(""); }} className="rounded p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Ex: Sem cebola, bem passado..."
              rows={3}
              autoFocus
              className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => { setNoteItemId(null); setNoteText(""); }}
                className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={() => saveNote.mutate({ itemId: noteItemId, notes: noteText.trim() })}
                disabled={saveNote.isPending}
                className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add item dialog */}
      <AddItemDialog
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAdd={(payload) => addItem.mutate(payload)}
        isPending={addItem.isPending}
      />

      {/* Transfer dialog */}
      {showTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
          <div className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4" />
                Transferir Pedido
              </h3>
              <button onClick={() => setShowTransfer(false)} className="rounded p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!mergeConfirm ? (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  Selecione a mesa de destino para transferir o pedido da <strong>{table?.name}</strong>:
                </p>
                <div className="grid grid-cols-3 gap-2 max-h-64 overflow-auto">
                  {allTables
                    .filter((t) => t.id !== tableId)
                    .map((t) => {
                      const hasOrder = allOpenOrders.some((o) => o.table_id === t.id);
                      return (
                        <button
                          key={t.id}
                          onClick={() => {
                            setTransferTarget(t.id);
                            transferOrder.mutate({ targetTableId: t.id, merge: false });
                          }}
                          disabled={transferOrder.isPending}
                          className={`table-status-${t.status} relative flex flex-col items-center rounded-lg border-2 p-3 transition-all hover:scale-[1.02] active:scale-[0.98] ${
                            transferTarget === t.id ? "ring-2 ring-ring" : ""
                          }`}
                        >
                          <span className="font-medium text-sm">{t.name}</span>
                          <span className="text-[10px] text-muted-foreground">{t.seats} lug</span>
                          <span className="text-[9px] font-medium uppercase tracking-wider mt-1 text-muted-foreground">
                            {statusLabels[t.status as TableStatus]}
                          </span>
                          {hasOrder && (
                            <span className="text-[9px] text-[hsl(var(--status-occupied))] font-medium mt-0.5">
                              Com pedido
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  A <strong>{allTables.find((t) => t.id === transferTarget)?.name}</strong> já possui um pedido aberto.
                </p>
                <p className="text-sm font-medium">
                  Deseja mesclar os dois pedidos?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setMergeConfirm(false); setTransferTarget(null); }}
                    className="flex-1 rounded-md border px-3 py-2 text-sm font-medium hover:bg-secondary"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (transferTarget) {
                        transferOrder.mutate({ targetTableId: transferTarget, merge: true });
                      }
                    }}
                    disabled={transferOrder.isPending}
                    className="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {transferOrder.isPending ? "Mesclando..." : "Mesclar Pedidos"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
