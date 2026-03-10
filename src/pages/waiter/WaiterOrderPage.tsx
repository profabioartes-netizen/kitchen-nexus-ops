import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, Search, Plus, Minus, Trash2, Loader2, Send, StickyNote, X, ShoppingBag, UtensilsCrossed,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import AddItemDialog, { type AddItemPayload } from "@/components/AddItemDialog";

type TableStatus = "free" | "occupied" | "reserved" | "bill";
const statusLabels: Record<TableStatus, string> = {
  free: "Livre", occupied: "Ocupada", reserved: "Reservada", bill: "Conta",
};

async function logActivity(tableId: string, action: string, description: string, orderId?: string | null, userName?: string | null) {
  await supabase.from("table_activity_log").insert({
    table_id: tableId, order_id: orderId ?? null, action, description, user_name: userName ?? null,
  });
}

export default function WaiterOrderPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"menu" | "order">("menu");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [noteItemId, setNoteItemId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const autoCreatedRef = useRef(false);

  // Fetch table
  const { data: table, isLoading: tableLoading } = useQuery({
    queryKey: ["table", tableId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurant_tables").select("*").eq("id", tableId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!tableId,
  });

  // Fetch open order
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["table_order", tableId],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").eq("table_id", tableId!).eq("status", "open").maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tableId,
  });

  // Fetch order items
  const { data: orderItems = [] } = useQuery({
    queryKey: ["order_items", order?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_items").select("*").eq("order_id", order!.id).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!order?.id,
  });

  // Item complements
  const orderItemIds = orderItems.map((i) => i.id);
  const { data: itemComplements = [] } = useQuery({
    queryKey: ["order_item_complements", orderItemIds.join(",")],
    queryFn: async () => {
      if (orderItemIds.length === 0) return [];
      const { data, error } = await supabase.from("order_item_complements").select("*").in("order_item_id", orderItemIds);
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
      const { data, error } = await supabase.from("products").select("*, categories(name)").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  if (!activeCategory && categories.length > 0) {
    setActiveCategory(categories[0].id);
  }

  // Create order
  const createOrder = useMutation({
    mutationFn: async () => {
      const waiterLabel = profile?.full_name || null;
      const { data, error } = await supabase.from("orders").insert({ table_id: tableId!, status: "open", total: 0, waiter_name: waiterLabel }).select().single();
      if (error) throw error;
      await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", tableId!);
      await logActivity(tableId!, "table_opened", `Mesa ${table?.name ?? ""} aberta — Garçom: ${waiterLabel ?? "—"}`, data.id, waiterLabel);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
    },
  });

  // Auto-create order
  useEffect(() => {
    if (!tableLoading && !orderLoading && !order && tableId && !autoCreatedRef.current && !createOrder.isPending) {
      autoCreatedRef.current = true;
      createOrder.mutate();
    }
  }, [tableLoading, orderLoading, order, tableId, createOrder.isPending]);

  // Add item
  const addItem = useMutation({
    mutationFn: async (payload: AddItemPayload) => {
      const { product, quantity, notes, complements, complementsTotal } = payload;
      let currentOrder = order;
      if (!currentOrder) {
        currentOrder = await createOrder.mutateAsync();
      }
      const unitPrice = Number(product.price) + complementsTotal;
      const { data: insertedItem, error: itemError } = await supabase.from("order_items").insert({
        order_id: currentOrder.id, product_id: product.id, product_name: product.name, price: unitPrice, quantity,
        notes: notes || null, sent_to_kitchen: true, preparation_status: "sent", sent_at: new Date().toISOString(),
      } as any).select().single();
      if (itemError) throw itemError;

      if (complements.length > 0) {
        await supabase.from("order_item_complements").insert(
          complements.map((c) => ({ order_item_id: insertedItem.id, complement_id: c.id, complement_name: c.name, price: c.price, quantity: c.quantity }))
        );
      }

      // Print job
      const station = (product as any).station || "Cozinha";
      await supabase.from("print_jobs").insert({
        station, status: "pending",
        payload: {
          product_name: product.name, quantity, table_name: table?.name || "—",
          waiter_name: currentOrder.waiter_name || profile?.full_name || null,
          notes: notes || null,
          complements: complements.map((c) => `${c.name}${c.price > 0 ? ` (+R$${c.price.toFixed(2)})` : ""}`),
          order_id: currentOrder.id,
        },
      });

      const newTotal = [...orderItems, { price: unitPrice, quantity }].reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      await supabase.from("orders").update({ total: newTotal }).eq("id", currentOrder.id);
      await logActivity(tableId!, "item_added", `${product.name} ×${quantity} (R$ ${(unitPrice * quantity).toFixed(2)})`, currentOrder.id, profile?.full_name);
    },
    onSuccess: () => {
      setSelectedProduct(null);
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["order_item_complements"] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["kitchen_items"] });
      toast.success("Item adicionado!");
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
        await logActivity(tableId!, "item_removed", `Removido: ${item.product_name}`, order?.id, profile?.full_name);
      } else {
        await supabase.from("order_items").update({ quantity: newQty }).eq("id", itemId);
      }
      const remaining = orderItems.map((i) => (i.id === itemId ? { ...i, quantity: newQty } : i)).filter((i) => i.quantity > 0);
      const newTotal = remaining.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      await supabase.from("orders").update({ total: newTotal }).eq("id", order!.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
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
      if (item) await logActivity(tableId!, "item_removed", `Removido: ${item.product_name} ×${item.quantity}`, order?.id, profile?.full_name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
    },
  });

  // Save note
  const saveNote = useMutation({
    mutationFn: async ({ itemId, notes }: { itemId: string; notes: string }) => {
      await supabase.from("order_items").update({ notes: notes || null }).eq("id", itemId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      setNoteItemId(null);
      setNoteText("");
      toast.success("Observação salva!");
    },
  });

  const filtered = products.filter(
    (p) => p.category_id === activeCategory && p.name.toLowerCase().includes(search.toLowerCase())
  );

  const total = orderItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0);

  if (tableLoading || orderLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order && !orderLoading && !tableLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Abrindo comanda...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 p-3 border-b bg-card">
        <button onClick={() => navigate("/garcom")} className="rounded-lg border p-2.5 active:bg-secondary">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold truncate">{table?.name ?? "Mesa"}</h1>
          <p className="text-xs text-muted-foreground">
            {statusLabels[table?.status as TableStatus] ?? ""} · R$ {total.toFixed(2)}
          </p>
        </div>
        {order?.waiter_name && (
          <span className="text-[10px] text-muted-foreground bg-secondary rounded-full px-2 py-1">{order.waiter_name}</span>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex border-b bg-card">
        <button
          onClick={() => setTab("menu")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors border-b-2 ${
            tab === "menu" ? "border-accent text-accent" : "border-transparent text-muted-foreground"
          }`}
        >
          <UtensilsCrossed className="h-4 w-4" />
          Cardápio
        </button>
        <button
          onClick={() => setTab("order")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors border-b-2 relative ${
            tab === "order" ? "border-accent text-accent" : "border-transparent text-muted-foreground"
          }`}
        >
          <ShoppingBag className="h-4 w-4" />
          Pedido
          {orderItems.length > 0 && (
            <span className="absolute top-2 right-[calc(50%-30px)] bg-accent text-accent-foreground text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
              {orderItems.length}
            </span>
          )}
        </button>
      </div>

      {/* MENU TAB */}
      {tab === "menu" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search */}
          <div className="p-3 pb-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar produto..."
                className="w-full rounded-xl border bg-card pl-10 pr-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Categories */}
          <div className="flex gap-2 px-3 py-3 overflow-x-auto flex-shrink-0">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`flex-shrink-0 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
                  activeCategory === cat.id
                    ? "bg-accent text-accent-foreground"
                    : "bg-card border text-muted-foreground"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product list */}
          <div className="flex-1 overflow-auto px-3 pb-3 space-y-2">
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-8">Nenhum produto encontrado</p>
            )}
            {filtered.map((product) => (
              <button
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className="w-full flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-all active:scale-[0.98]"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{product.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{(product as any).categories?.name ?? ""}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className="text-sm font-semibold text-accent">R$ {Number(product.price).toFixed(2)}</span>
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ORDER TAB */}
      {tab === "order" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {orderItems.length === 0 && (
              <div className="text-center py-12">
                <ShoppingBag className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum item no pedido</p>
                <button onClick={() => setTab("menu")} className="mt-3 text-sm text-accent font-medium">
                  Adicionar itens
                </button>
              </div>
            )}
            {orderItems.map((item) => {
              const comps = itemComplements.filter((c) => c.order_item_id === item.id);
              return (
                <div key={item.id} className="rounded-xl border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{item.product_name}</p>
                      {comps.length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {comps.map((c) => c.complement_name).join(", ")}
                        </p>
                      )}
                      {item.notes && (
                        <p className="text-[10px] text-accent mt-0.5 italic">📝 {item.notes}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        R$ {Number(item.price).toFixed(2)} × {item.quantity} = R$ {(Number(item.price) * item.quantity).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => {
                          setNoteItemId(item.id);
                          setNoteText(item.notes ?? "");
                        }}
                        className="rounded-lg border p-2 active:bg-secondary"
                      >
                        <StickyNote className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => removeItem.mutate(item.id)}
                        className="rounded-lg border p-2 active:bg-secondary"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                  {/* Qty controls */}
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => updateQty.mutate({ itemId: item.id, delta: -1 })}
                      className="rounded-lg border p-2.5 active:bg-secondary"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="text-base font-semibold w-8 text-center">{item.quantity}</span>
                    <button
                      onClick={() => updateQty.mutate({ itemId: item.id, delta: 1 })}
                      className="rounded-lg border p-2.5 active:bg-secondary"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Order footer */}
          {orderItems.length > 0 && (
            <div className="border-t bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-lg font-bold">R$ {total.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Note modal */}
      {noteItemId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30">
          <div className="w-full max-w-lg rounded-t-2xl border bg-background p-4 shadow-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">Observação</h3>
              <button onClick={() => setNoteItemId(null)} className="rounded p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Ex: Sem cebola, bem passado..."
              rows={3}
              autoFocus
              className="w-full rounded-xl border bg-card px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <button
              onClick={() => saveNote.mutate({ itemId: noteItemId, notes: noteText })}
              disabled={saveNote.isPending}
              className="w-full mt-3 rounded-xl bg-accent text-accent-foreground py-3.5 font-medium active:opacity-90 disabled:opacity-50"
            >
              {saveNote.isPending ? "Salvando..." : "Salvar"}
            </button>
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
    </div>
  );
}
