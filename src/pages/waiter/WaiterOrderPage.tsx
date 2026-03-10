import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft, Search, Plus, Minus, Trash2, Loader2, Send, StickyNote, X, ShoppingBag,
  ChevronUp, ChevronDown,
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
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [noteItemId, setNoteItemId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  // Check which products have complement groups
  const { data: productComplementLinks = [] } = useQuery({
    queryKey: ["product_complement_groups_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_complement_groups").select("product_id");
      if (error) throw error;
      return data;
    },
  });

  const productsWithComplements = new Set(productComplementLinks.map((l) => l.product_id));

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

  // Quick add (no complements) — adds 1x directly
  const quickAdd = useMutation({
    mutationFn: async (product: any) => {
      let currentOrder = order;
      if (!currentOrder) {
        currentOrder = await createOrder.mutateAsync();
      }
      const unitPrice = Number(product.price);
      const { error: itemError } = await supabase.from("order_items").insert({
        order_id: currentOrder.id, product_id: product.id, product_name: product.name, price: unitPrice, quantity: 1,
        sent_to_kitchen: true, preparation_status: "sent", sent_at: new Date().toISOString(),
      } as any);
      if (itemError) throw itemError;

      const station = (product as any).station || "Cozinha";
      await supabase.from("print_jobs").insert({
        station, status: "pending",
        payload: {
          product_name: product.name, quantity: 1, table_name: table?.name || "—",
          waiter_name: currentOrder.waiter_name || profile?.full_name || null,
          notes: null, complements: [], order_id: currentOrder.id,
        },
      });

      const newTotal = [...orderItems, { price: unitPrice, quantity: 1 }].reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      await supabase.from("orders").update({ total: newTotal }).eq("id", currentOrder.id);
      await logActivity(tableId!, "item_added", `${product.name} ×1 (R$ ${unitPrice.toFixed(2)})`, currentOrder.id, profile?.full_name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["kitchen_items"] });
      toast.success("Adicionado!", { duration: 1500 });
    },
  });

  // Add item (with complements/notes via dialog)
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

  const handleProductTap = (product: any) => {
    // If product has complements, open the full dialog
    if (productsWithComplements.has(product.id)) {
      setSelectedProduct(product);
    } else {
      // Quick add 1x directly — no dialog
      quickAdd.mutate(product);
    }
  };

  const filtered = products.filter(
    (p) => {
      if (search) return p.name.toLowerCase().includes(search.toLowerCase());
      return p.category_id === activeCategory;
    }
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
    <div className="flex flex-col h-full relative">
      {/* Top bar — compact & sticky */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-card flex-shrink-0">
        <button onClick={() => navigate("/garcom")} className="rounded-xl border p-3 active:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold truncate">{table?.name ?? "Mesa"}</h1>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <span className="text-lg font-bold text-accent">R$ {total.toFixed(2)}</span>
          <span className="text-[10px] text-muted-foreground">{orderItems.length} {orderItems.length === 1 ? "item" : "itens"}</span>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pt-2.5 pb-1 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full rounded-xl border bg-card pl-10 pr-9 py-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Categories — scrollable pills */}
      {!search && (
        <div className="flex gap-2 px-3 py-2 overflow-x-auto flex-shrink-0 no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex-shrink-0 rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${
                activeCategory === cat.id
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "bg-card border text-muted-foreground active:bg-secondary"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Product GRID */}
      <div className="flex-1 overflow-auto px-3 pb-3"
        style={{ paddingBottom: orderItems.length > 0 ? (drawerOpen ? "340px" : "80px") : "12px" }}
      >
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhum produto encontrado</p>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          {filtered.map((product) => {
            const hasComplements = productsWithComplements.has(product.id);
            return (
              <button
                key={product.id}
                onClick={() => handleProductTap(product)}
                disabled={quickAdd.isPending}
                className="flex flex-col items-start rounded-2xl border bg-card p-4 text-left transition-all active:scale-[0.96] active:bg-secondary/50 min-h-[100px] relative"
              >
                <p className="font-semibold text-sm leading-tight line-clamp-2">{product.name}</p>
                <div className="mt-auto pt-2 w-full flex items-end justify-between">
                  <span className="text-base font-bold text-accent">
                    R$ {Number(product.price).toFixed(2)}
                  </span>
                  <div className={`rounded-full p-1.5 ${hasComplements ? "bg-secondary" : "bg-accent/15"}`}>
                    <Plus className={`h-5 w-5 ${hasComplements ? "text-muted-foreground" : "text-accent"}`} />
                  </div>
                </div>
                {hasComplements && (
                  <span className="absolute top-2 right-2 text-[8px] bg-secondary rounded-full px-1.5 py-0.5 text-muted-foreground font-medium">
                    +opções
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom order drawer — always visible when items exist */}
      {orderItems.length > 0 && (
        <div
          className={`fixed bottom-0 left-0 right-0 z-40 bg-card border-t shadow-[0_-4px_20px_rgba(0,0,0,0.08)] rounded-t-2xl transition-all duration-300 ${
            drawerOpen ? "max-h-[70vh]" : "max-h-[76px]"
          }`}
        >
          {/* Drawer handle — tap to toggle */}
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="w-full flex items-center justify-between px-4 py-4 active:bg-secondary/30"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag className="h-6 w-6 text-accent" />
                <span className="absolute -top-1.5 -right-1.5 bg-accent text-accent-foreground text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-0.5">
                  {orderItems.reduce((s, i) => s + i.quantity, 0)}
                </span>
              </div>
              <div className="text-left">
                <p className="text-xs text-muted-foreground">Pedido</p>
                <p className="text-lg font-bold leading-tight">R$ {total.toFixed(2)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {drawerOpen ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
          </button>

          {/* Expanded drawer content */}
          {drawerOpen && (
            <div className="overflow-auto px-3 pb-4 max-h-[calc(70vh-76px)]">
              <div className="space-y-2">
                {orderItems.map((item) => {
                  const comps = itemComplements.filter((c) => c.order_item_id === item.id);
                  return (
                    <div key={item.id} className="flex items-center gap-2 rounded-xl border bg-background p-2.5">
                      {/* Qty controls — large touch */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => updateQty.mutate({ itemId: item.id, delta: -1 })}
                          className="rounded-xl border p-2.5 active:bg-secondary"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="text-base font-bold w-7 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQty.mutate({ itemId: item.id, delta: 1 })}
                          className="rounded-xl border p-2.5 active:bg-secondary"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>

                      {/* Item info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">{item.product_name}</p>
                        {comps.length > 0 && (
                          <p className="text-[9px] text-muted-foreground truncate">
                            {comps.map((c) => c.complement_name).join(", ")}
                          </p>
                        )}
                        {item.notes && (
                          <p className="text-[9px] text-accent truncate">📝 {item.notes}</p>
                        )}
                      </div>

                      {/* Price + actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs font-semibold mr-1">
                          R$ {(Number(item.price) * item.quantity).toFixed(2)}
                        </span>
                        <button
                          onClick={() => {
                            setNoteItemId(item.id);
                            setNoteText(item.notes ?? "");
                          }}
                          className="rounded-lg p-2 active:bg-secondary"
                        >
                          <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => removeItem.mutate(item.id)}
                          className="rounded-lg p-2 active:bg-secondary"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Note modal — slides from bottom */}
      {noteItemId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30" onClick={() => setNoteItemId(null)}>
          <div className="w-full rounded-t-2xl border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-3" />
            <h3 className="text-sm font-semibold mb-2">Observação</h3>
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
              className="w-full mt-3 rounded-xl bg-accent text-accent-foreground py-4 text-base font-semibold active:opacity-90 disabled:opacity-50"
            >
              {saveNote.isPending ? "Salvando..." : "Salvar observação"}
            </button>
          </div>
        </div>
      )}

      {/* Add item dialog (for products with complements) */}
      <AddItemDialog
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAdd={(payload) => addItem.mutate(payload)}
        isPending={addItem.isPending}
      />
    </div>
  );
}
