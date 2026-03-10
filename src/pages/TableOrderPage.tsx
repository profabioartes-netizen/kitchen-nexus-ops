import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Search, Plus, Minus, Trash2, ArrowLeft, Loader2, Send, CreditCard, Banknote, Smartphone,
} from "lucide-react";

type TableStatus = "free" | "occupied" | "reserved" | "bill";

const statusLabels: Record<TableStatus, string> = {
  free: "Livre",
  occupied: "Ocupada",
  reserved: "Reservada",
  bill: "Conta",
};

export default function TableOrderPage() {
  const { tableId } = useParams<{ tableId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);

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

  // Fetch or identify open order for this table
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

  if (!activeCategory && categories.length > 0) {
    setActiveCategory(categories[0].id);
  }

  // Create order if none exists
  const createOrder = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .insert({ table_id: tableId!, status: "open", total: 0 })
        .select()
        .single();
      if (error) throw error;
      // Set table to occupied
      await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", tableId!);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
    },
  });

  // Add item to order
  const addItem = useMutation({
    mutationFn: async (product: (typeof products)[0]) => {
      let currentOrder = order;
      if (!currentOrder) {
        currentOrder = await createOrder.mutateAsync();
      }

      // Check if item already in order (not yet sent)
      const existing = orderItems.find(
        (i) => i.product_id === product.id && !i.sent_to_kitchen
      );
      if (existing) {
        const { error } = await supabase
          .from("order_items")
          .update({ quantity: existing.quantity + 1 })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("order_items").insert({
          order_id: currentOrder.id,
          product_id: product.id,
          product_name: product.name,
          price: product.price,
          quantity: 1,
        });
        if (error) throw error;
      }

      // Update order total
      const newTotal = [...orderItems, { price: product.price, quantity: 1 }].reduce(
        (s, i) => s + Number(i.price) * i.quantity, 0
      );
      await supabase.from("orders").update({ total: newTotal }).eq("id", currentOrder.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
    },
  });

  // Update item quantity
  const updateQty = useMutation({
    mutationFn: async ({ itemId, delta }: { itemId: string; delta: number }) => {
      const item = orderItems.find((i) => i.id === itemId);
      if (!item) return;
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        await supabase.from("order_items").delete().eq("id", itemId);
      } else {
        await supabase.from("order_items").update({ quantity: newQty }).eq("id", itemId);
      }
      // Recalculate total
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
    },
  });

  // Remove item
  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      await supabase.from("order_items").delete().eq("id", itemId);
      const remaining = orderItems.filter((i) => i.id !== itemId);
      const newTotal = remaining.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      await supabase.from("orders").update({ total: newTotal }).eq("id", order!.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
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
        .update({ sent_to_kitchen: true })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      toast.success("Pedido enviado à cozinha!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Close & pay
  const payMutation = useMutation({
    mutationFn: async (method: "cash" | "card" | "pix") => {
      if (!order) throw new Error("Sem pedido aberto");
      const total = orderItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      // Mark all sent
      await supabase
        .from("order_items")
        .update({ sent_to_kitchen: true })
        .eq("order_id", order.id);
      // Insert payment
      await supabase.from("payments").insert({ order_id: order.id, method, amount: total });
      // Close order
      await supabase.from("orders").update({ status: "closed", total }).eq("id", order.id);
      // Free table
      await supabase.from("restaurant_tables").update({ status: "free" }).eq("id", tableId!);
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

  return (
    <div className="flex h-full">
      {/* Left: Product selection */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => navigate("/")}
            className="rounded-md border bg-card p-2 hover:bg-secondary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{table?.name ?? "Mesa"}</h1>
            {table && (
              <span className={`table-status-${table.status} rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider border`}>
                {statusLabels[table.status as TableStatus] ?? table.status}
              </span>
            )}
          </div>
        </div>

        {/* Search */}
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

        {/* Categories */}
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

        {/* Products grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-auto flex-1">
          {filtered.map((product) => (
            <button
              key={product.id}
              onClick={() => addItem.mutate(product)}
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
          {order?.waiter_name && (
            <p className="text-xs text-muted-foreground">Garçom: {order.waiter_name}</p>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-1">
          {orderItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Toque num produto para adicionar
            </p>
          )}
          {orderItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center justify-between rounded-md border p-2 ${
                item.sent_to_kitchen ? "bg-muted/50 border-muted" : "bg-background"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">{item.product_name}</p>
                  {item.sent_to_kitchen && (
                    <span className="text-[9px] bg-accent/20 text-accent rounded px-1 py-0.5 font-medium whitespace-nowrap">
                      ENVIADO
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  R$ {Number(item.price).toFixed(2)} × {item.quantity}
                </p>
              </div>
              <div className="flex items-center gap-1 ml-2">
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
          ))}
        </div>

        {/* Footer */}
        <div className="border-t p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-xl">TOTAL</span>
            <span className="font-display text-xl">R$ {total.toFixed(2)}</span>
          </div>

          {!showPayment ? (
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
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center">Forma de pagamento</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  disabled={payMutation.isPending}
                  onClick={() => payMutation.mutate("card")}
                  className="flex flex-col items-center justify-center gap-1 rounded-md bg-accent text-accent-foreground py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="text-xs">Cartão</span>
                </button>
                <button
                  disabled={payMutation.isPending}
                  onClick={() => payMutation.mutate("cash")}
                  className="flex flex-col items-center justify-center gap-1 rounded-md bg-primary text-primary-foreground py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Banknote className="h-4 w-4" />
                  <span className="text-xs">Dinheiro</span>
                </button>
                <button
                  disabled={payMutation.isPending}
                  onClick={() => payMutation.mutate("pix")}
                  className="flex flex-col items-center justify-center gap-1 rounded-md bg-secondary text-secondary-foreground py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  <Smartphone className="h-4 w-4" />
                  <span className="text-xs">Pix</span>
                </button>
              </div>
              <button
                onClick={() => setShowPayment(false)}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
