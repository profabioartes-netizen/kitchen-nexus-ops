import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { normalize } from "@/lib/normalize";
import {
  ArrowLeft, Search, Plus, Minus, Trash2, Loader2, StickyNote, X, ShoppingBag,
  ChevronUp, ChevronDown, Zap, RotateCcw, Star, Clock, Repeat,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { printCancellationIfNeeded } from "@/lib/printCancellation";
import AddItemDialog, { type AddItemPayload } from "@/components/AddItemDialog";
import TableOpenDialog from "@/components/TableOpenDialog";

type TableStatus = "free" | "occupied" | "bill";
const statusLabels: Record<TableStatus, string> = {
  free: "Livre", occupied: "Pendente", bill: "Conta",
};

async function logActivity(tableId: string, action: string, description: string, orderId?: string | null, userName?: string | null) {
  await supabase.from("table_activity_log").insert({
    table_id: tableId, order_id: orderId ?? null, action, description, user_name: userName ?? null,
  });
}

type ShortcutTab = "popular" | "recent" | "repeat";

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
  const [shortcutTab, setShortcutTab] = useState<ShortcutTab>("popular");
  const [showShortcuts, setShowShortcuts] = useState(true);
  const autoCreatedRef = useRef(false);
  const [showOpenDialog, setShowOpenDialog] = useState(false);

  // Realtime: sync order data instantly
  useEffect(() => {
    const channel = supabase
      .channel(`waiter-order-${tableId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
        queryClient.invalidateQueries({ queryKey: ["order_items"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
        queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'restaurant_tables' }, () => {
        queryClient.invalidateQueries({ queryKey: ["table", tableId] });
        queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient, tableId]);

  // ── Data queries ──

  const { data: table, isLoading: tableLoading } = useQuery({
    queryKey: ["table", tableId],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurant_tables").select("*").eq("id", tableId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!tableId,
  });

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["table_order", tableId],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*").eq("table_id", tableId!).eq("status", "open").maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tableId,
  });

  const { data: orderItems = [] } = useQuery({
    queryKey: ["order_items", order?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("order_items").select("*").eq("order_id", order!.id).order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!order?.id,
  });

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

  const { data: productComplementLinks = [] } = useQuery({
    queryKey: ["product_complement_groups_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_complement_groups").select("product_id");
      if (error) throw error;
      return data;
    },
  });

  const productsWithComplements = new Set(productComplementLinks.map((l) => l.product_id));

  // ── Shortcuts data ──

  // Most ordered products (top 10 across all orders)
  const { data: popularItems = [] } = useQuery({
    queryKey: ["popular_order_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("product_id, product_name")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      // Count frequency
      const counts: Record<string, { product_id: string; product_name: string; count: number }> = {};
      for (const item of data) {
        if (!counts[item.product_id]) {
          counts[item.product_id] = { product_id: item.product_id, product_name: item.product_name, count: 0 };
        }
        counts[item.product_id].count++;
      }
      return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 10);
    },
    staleTime: 60000,
  });

  // Previous closed order for this table (for "repeat order")
  const { data: previousOrder } = useQuery({
    queryKey: ["previous_order", tableId],
    queryFn: async () => {
      const { data: prevOrder, error } = await supabase
        .from("orders")
        .select("id, total, created_at")
        .eq("table_id", tableId!)
        .eq("status", "finalized")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !prevOrder) return null;
      const { data: items, error: itemsErr } = await supabase
        .from("order_items")
        .select("product_id, product_name, price, quantity")
        .eq("order_id", prevOrder.id);
      if (itemsErr) return null;
      return { ...prevOrder, items: items || [] };
    },
    enabled: !!tableId,
    staleTime: 60000,
  });

  // Recently added items in this session (derived from current orderItems, most recent first)
  const recentItems = useMemo(() => {
    const seen = new Set<string>();
    return [...orderItems].reverse().filter((i) => {
      if (seen.has(i.product_id)) return false;
      seen.add(i.product_id);
      return true;
    }).slice(0, 8);
  }, [orderItems]);

  // Last added item
  const lastItem = orderItems.length > 0 ? orderItems[orderItems.length - 1] : null;

  if (!activeCategory && categories.length > 0) {
    setActiveCategory(categories[0].id);
  }

  // ── Mutations ──

  const createOrder = useMutation({
    mutationFn: async (params?: { customerName?: string; guests?: number; notes?: string }) => {
      const waiterLabel = profile?.full_name || null;
      const customerName = params?.customerName || null;
      const guests = params?.guests || 1;
      const defaultName = (table as any)?.default_name || "Comanda";
      const { data, error } = await supabase.from("orders").insert({
        table_id: tableId!, status: "open", total: 0, waiter_name: waiterLabel,
        customer_name: customerName, guests,
      } as any).select().single();
      if (error) throw error;
      const tableName = customerName || defaultName;
      await supabase.from("restaurant_tables").update({ status: "occupied", name: tableName }).eq("id", tableId!);
      const desc = `Mesa ${table?.name ?? ""} aberta — Garçom: ${waiterLabel ?? "—"}${customerName ? ` | Cliente: ${customerName}` : ""} | ${guests} pessoa(s)${params?.notes ? ` | Obs: ${params.notes}` : ""}`;
      await logActivity(tableId!, "table_opened", desc, data.id, waiterLabel);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      setShowOpenDialog(false);
    },
  });

  // Show dialog for free tables, auto-skip for tables with existing orders
  useEffect(() => {
    if (!tableLoading && !orderLoading && !order && tableId && !autoCreatedRef.current && !createOrder.isPending) {
      autoCreatedRef.current = true;
      setShowOpenDialog(true);
    }
  }, [tableLoading, orderLoading, order, tableId, createOrder.isPending]);

  const quickAddByProductId = async (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) { toast.error("Produto não encontrado"); return; }
    if (productsWithComplements.has(productId)) {
      setSelectedProduct(product);
      return;
    }
    quickAdd.mutate(product);
  };

  const quickAdd = useMutation({
    mutationFn: async (product: any) => {
      let currentOrder = order;
      if (!currentOrder) currentOrder = await createOrder.mutateAsync({});
      const unitPrice = Number(product.price);
      const { error: itemError } = await supabase.from("order_items").insert({
        order_id: currentOrder.id, product_id: product.id, product_name: product.name, price: unitPrice, quantity: 1,
        sent_to_kitchen: false, preparation_status: "pending",
      } as any);
      if (itemError) throw itemError;

      const newTotal = [...orderItems, { price: unitPrice, quantity: 1 }].reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      await supabase.from("orders").update({ total: newTotal }).eq("id", currentOrder.id);
      if (table?.status === "delivered") {
        await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", tableId!);
      }
      await logActivity(tableId!, "item_added", `${product.name} ×1 (R$ ${unitPrice.toFixed(2)})`, currentOrder.id, profile?.full_name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["table", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      toast.success("Adicionado!", { duration: 1500 });
    },
  });

  const repeatOrder = useMutation({
    mutationFn: async () => {
      if (!previousOrder?.items?.length) throw new Error("Sem pedido anterior");
      let currentOrder = order;
      if (!currentOrder) currentOrder = await createOrder.mutateAsync({});

      const orderItemRows = [];
      for (const prevItem of previousOrder.items) {
        const product = products.find((p) => p.id === prevItem.product_id);
        if (!product) continue;
        orderItemRows.push({
          order_id: currentOrder.id, product_id: prevItem.product_id, product_name: prevItem.product_name,
          price: Number(prevItem.price), quantity: prevItem.quantity,
          sent_to_kitchen: false, preparation_status: "pending",
        });
      }

      await supabase.from("order_items").insert(orderItemRows as any);

      const addedTotal = previousOrder.items.reduce((s: number, i: any) => s + Number(i.price) * i.quantity, 0);
      const newTotal = orderItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0) + addedTotal;
      await supabase.from("orders").update({ total: newTotal }).eq("id", currentOrder.id);
      if (table?.status === "delivered") {
        await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", tableId!);
      }
      await logActivity(tableId!, "order_repeated", `Pedido anterior repetido (${previousOrder.items.length} itens, R$ ${addedTotal.toFixed(2)})`, currentOrder.id, profile?.full_name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["table", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      toast.success("Pedido anterior repetido!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const addItem = useMutation({
    mutationFn: async (payload: AddItemPayload) => {
      const { product, quantity, notes, complements, complementsTotal } = payload;
      let currentOrder = order;
      if (!currentOrder) currentOrder = await createOrder.mutateAsync({});
      const unitPrice = Number(product.price) + complementsTotal;
      const { data: insertedItem, error: itemError } = await supabase.from("order_items").insert({
        order_id: currentOrder.id, product_id: product.id, product_name: product.name, price: unitPrice, quantity,
        notes: notes || null, sent_to_kitchen: false, preparation_status: "pending",
      } as any).select().single();
      if (itemError) throw itemError;

      if (complements.length > 0) {
        await supabase.from("order_item_complements").insert(
          complements.map((c) => ({ order_item_id: insertedItem.id, complement_id: c.id, complement_name: c.name, price: c.price, quantity: c.quantity }))
        );
      }

      const newTotal = [...orderItems, { price: unitPrice, quantity }].reduce((s, i) => s + Number(i.price) * i.quantity, 0);
      await supabase.from("orders").update({ total: newTotal }).eq("id", currentOrder.id);
      if (table?.status === "delivered") {
        await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", tableId!);
      }
      await logActivity(tableId!, "item_added", `${product.name} ×${quantity} (R$ ${(unitPrice * quantity).toFixed(2)})`, currentOrder.id, profile?.full_name);
    },
    onSuccess: () => {
      setSelectedProduct(null);
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["order_item_complements"] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["table", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      toast.success("Item adicionado!");
    },
  });

  // Save order — sends unsent items to production printers
  const saveOrder = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error("Sem pedido aberto");
      const unsent = orderItems.filter((i) => !i.sent_to_kitchen);

      if (unsent.length > 0) {
        // Fetch complements for unsent items
        const unsentIds = unsent.map((i) => i.id);
        const { data: complementsData } = await supabase
          .from("order_item_complements")
          .select("order_item_id, complement_name, price")
          .in("order_item_id", unsentIds);
        const complementsByItem: Record<string, { name: string; price: number }[]> = {};
        for (const c of complementsData || []) {
          if (!complementsByItem[c.order_item_id]) complementsByItem[c.order_item_id] = [];
          complementsByItem[c.order_item_id].push({ name: c.complement_name, price: Number(c.price) });
        }

        // Group unsent items by station into one print job per station
        const itemsByStation: Record<string, any[]> = {};
        for (const item of unsent) {
          const product = products.find((p) => p.id === item.product_id);
          const station = (product as any)?.station || "";
          if (!station) continue;
          if (!itemsByStation[station]) itemsByStation[station] = [];
          const itemComplements = complementsByItem[item.id] || [];
          itemsByStation[station].push({
            product_name: item.product_name,
            quantity: item.quantity,
            notes: item.notes || null,
            complements: itemComplements.map((c) => c.name),
          });
        }

        const printJobRows: any[] = [];
        for (const [station, stationItems] of Object.entries(itemsByStation)) {
          printJobRows.push({
            station,
            status: "pending",
            payload: {
              items: stationItems,
              table_name: table?.name || "—",
              mesa_name: table?.default_name || null,
              mesa_sector: table?.sector || null,
              customer_name: order.customer_name || null,
              waiter_name: order.waiter_name || profile?.full_name || null,
              order_id: order.id,
            },
          });
        }
        if (printJobRows.length > 0) {
          await supabase.from("print_jobs").insert(printJobRows);
        }

        // Mark as sent
        await supabase
          .from("order_items")
          .update({ sent_to_kitchen: true, preparation_status: "sent", sent_at: new Date().toISOString() } as any)
          .in("id", unsentIds);

        await logActivity(tableId!, "order_saved", `Pedido salvo — ${unsent.length} item(ns) enviado(s)`, order.id, profile?.full_name);
      } else {
        await logActivity(tableId!, "order_saved", `Pedido salvo (sem novos itens)`, order.id, profile?.full_name);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["order_items", order?.id] });
      queryClient.invalidateQueries({ queryKey: ["table_order", tableId] });
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      queryClient.invalidateQueries({ queryKey: ["kitchen_items"] });
      toast.success("Pedido salvo e enviado!");
      navigate(-1);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const updateQty = useMutation({
    mutationFn: async ({ itemId, delta }: { itemId: string; delta: number }) => {
      const item = orderItems.find((i) => i.id === itemId);
      if (!item) return;
      const newQty = item.quantity + delta;


      if (newQty <= 0) {
        await printCancellationIfNeeded({ item, products, table, order, waiterName: profile?.full_name });
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

  const removeItem = useMutation({
    mutationFn: async (itemId: string) => {
      const item = orderItems.find((i) => i.id === itemId);

      if (item) {
        await printCancellationIfNeeded({ item, products, table, order, waiterName: profile?.full_name });
      }
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
    if (productsWithComplements.has(product.id)) {
      setSelectedProduct(product);
    } else {
      quickAdd.mutate(product);
    }
  };

  const filtered = products.filter((p) => {
    if (search) return normalize(p.name).includes(normalize(search));
    return p.category_id === activeCategory;
  });

  const total = orderItems.reduce((s, i) => s + Number(i.price) * i.quantity, 0);

  // ── Render ──

  if (tableLoading || orderLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order && !orderLoading && !tableLoading) {
    return (
      <>
        <TableOpenDialog
          open={showOpenDialog}
          tableName={table?.name ?? "Comanda"}
          onConfirm={(data) => createOrder.mutate(data)}
          onCancel={() => navigate("/garcom/mesas")}
          isPending={createOrder.isPending}
        />
        <div className="flex items-center justify-center h-full p-12">
          {createOrder.isPending ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Abrindo comanda...</span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Aguardando abertura da mesa...</span>
          )}
        </div>
      </>
    );
  }

  const shortcutTabs: { key: ShortcutTab; label: string; icon: typeof Zap }[] = [
    { key: "popular", label: "Populares", icon: Star },
    { key: "recent", label: "Recentes", icon: Clock },
    { key: "repeat", label: "Repetir", icon: Repeat },
  ];

  return (
    <div className="flex flex-col h-full relative">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-card flex-shrink-0">
        <button onClick={() => navigate("/garcom")} className="rounded-xl border p-3 active:bg-secondary transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
          <div className="flex flex-col flex-1 min-w-0">
            <h1 className="text-lg font-bold leading-tight truncate">
              {order?.customer_name || (table as any)?.default_name || table?.name || "Comanda"}
            </h1>
            {order?.customer_name && (
              <span className="text-[10px] text-muted-foreground">{(table as any)?.default_name || table?.name}</span>
            )}
          <input
            type="text"
            defaultValue={(table as any)?.sector ?? ""}
            key={`sector-${table?.id}`}
            placeholder="Mesa (ex: Mesa 1, Quiosque)"
            onBlur={async (e) => {
              const newSector = e.target.value.trim();
              if (table && newSector !== ((table as any)?.sector ?? "")) {
                await supabase.from("restaurant_tables").update({ sector: newSector || null } as any).eq("id", table.id);
                queryClient.invalidateQueries({ queryKey: ["table", tableId] });
                queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
              }
            }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="text-[11px] text-muted-foreground bg-transparent border-b border-transparent hover:border-border focus:border-ring outline-none py-0.5 w-full truncate"
          />
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <span className="text-lg font-bold text-accent">R$ {total.toFixed(2)}</span>
          <span className="text-[10px] text-muted-foreground">{orderItems.length} {orderItems.length === 1 ? "item" : "itens"}</span>
        </div>
      </div>

      {/* ── Quick Shortcuts Section ── */}
      <div className="flex-shrink-0 border-b bg-card/50">
        {/* Shortcut toggle + tabs */}
        <div className="flex items-center gap-1 px-3 pt-2 pb-1">
          <button
            onClick={() => setShowShortcuts(!showShortcuts)}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-accent active:bg-secondary"
          >
            <Zap className="h-3.5 w-3.5" />
            Atalhos
            {showShortcuts ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showShortcuts && (
            <div className="flex gap-1 ml-auto">
              {shortcutTabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setShortcutTab(t.key)}
                  className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${
                    shortcutTab === t.key
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground active:bg-secondary"
                  }`}
                >
                  <t.icon className="h-3 w-3" />
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {showShortcuts && (
          <div className="px-3 pb-2.5">
            {/* Popular items */}
            {shortcutTab === "popular" && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {popularItems.length === 0 && (
                  <p className="text-[10px] text-muted-foreground py-2">Sem dados de popularidade ainda</p>
                )}
                {popularItems.map((item) => (
                  <button
                    key={item.product_id}
                    onClick={() => quickAddByProductId(item.product_id)}
                    disabled={quickAdd.isPending}
                    className="flex-shrink-0 flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 active:scale-[0.96] active:bg-secondary/50 transition-all"
                  >
                    <Star className="h-3.5 w-3.5 text-accent flex-shrink-0" />
                    <span className="text-xs font-medium whitespace-nowrap">{item.product_name}</span>
                    <span className="text-[10px] text-muted-foreground">×{item.count}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Recent items in this order */}
            {shortcutTab === "recent" && (
              <div className="space-y-1.5">
                {/* Repeat last item button */}
                {lastItem && (
                  <button
                    onClick={() => quickAddByProductId(lastItem.product_id)}
                    disabled={quickAdd.isPending}
                    className="w-full flex items-center gap-3 rounded-xl border-2 border-accent/30 bg-accent/5 px-3 py-3 active:scale-[0.98] transition-all"
                  >
                    <RotateCcw className="h-5 w-5 text-accent flex-shrink-0" />
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-xs font-semibold truncate">Repetir último: {lastItem.product_name}</p>
                      <p className="text-[10px] text-muted-foreground">R$ {Number(lastItem.price).toFixed(2)}</p>
                    </div>
                    <Plus className="h-5 w-5 text-accent flex-shrink-0" />
                  </button>
                )}
                {/* Scrollable recent items */}
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {recentItems.length === 0 && (
                    <p className="text-[10px] text-muted-foreground py-2">Adicione itens para ver recentes</p>
                  )}
                  {recentItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => quickAddByProductId(item.product_id)}
                      disabled={quickAdd.isPending}
                      className="flex-shrink-0 flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5 active:scale-[0.96] active:bg-secondary/50 transition-all"
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs font-medium whitespace-nowrap">{item.product_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Repeat previous order */}
            {shortcutTab === "repeat" && (
              <div>
                {previousOrder?.items?.length ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => repeatOrder.mutate()}
                      disabled={repeatOrder.isPending}
                      className="w-full flex items-center gap-3 rounded-xl border-2 border-accent/30 bg-accent/5 px-3 py-3.5 active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                      <Repeat className="h-6 w-6 text-accent flex-shrink-0" />
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold">Repetir pedido anterior</p>
                        <p className="text-[10px] text-muted-foreground">
                          {previousOrder.items.length} itens · R$ {Number(previousOrder.total).toFixed(2)}
                        </p>
                      </div>
                      {repeatOrder.isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin text-accent" />
                      ) : (
                        <Plus className="h-5 w-5 text-accent" />
                      )}
                    </button>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar">
                      {previousOrder.items.map((item: any, idx: number) => (
                        <span key={idx} className="flex-shrink-0 text-[10px] bg-secondary rounded-full px-2.5 py-1 text-muted-foreground whitespace-nowrap">
                          {item.product_name} ×{item.quantity}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground py-3">Nenhum pedido anterior nesta mesa</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-3 pt-2 pb-1 flex-shrink-0">
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

      {/* Categories */}
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
                  <span className="text-base font-bold text-accent">R$ {Number(product.price).toFixed(2)}</span>
                  <div className={`rounded-full p-1.5 ${hasComplements ? "bg-secondary" : "bg-accent/15"}`}>
                    <Plus className={`h-5 w-5 ${hasComplements ? "text-muted-foreground" : "text-accent"}`} />
                  </div>
                </div>
                {hasComplements && (
                  <span className="absolute top-2 right-2 text-[8px] bg-secondary rounded-full px-1.5 py-0.5 text-muted-foreground font-medium">+opções</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom order drawer */}
      {orderItems.length > 0 && (
        <div className={`fixed bottom-0 left-0 right-0 z-40 bg-card border-t shadow-[0_-4px_20px_rgba(0,0,0,0.08)] rounded-t-2xl transition-all duration-300 ${drawerOpen ? "max-h-[70vh]" : "max-h-[76px]"}`}>
          <button onClick={() => setDrawerOpen(!drawerOpen)} className="w-full flex items-center justify-between px-4 py-4 active:bg-secondary/30">
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
            {drawerOpen ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronUp className="h-5 w-5 text-muted-foreground" />}
          </button>

          {drawerOpen && (
            <div className="overflow-auto px-3 pb-4 max-h-[calc(70vh-76px)]">
              <div className="space-y-2">
                {orderItems.map((item) => {
                  const comps = itemComplements.filter((c) => c.order_item_id === item.id);
                  return (
                    <div key={item.id} className="flex items-center gap-2 rounded-xl border bg-background p-2.5">
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => updateQty.mutate({ itemId: item.id, delta: -1 })} className="rounded-xl border p-2.5 active:bg-secondary">
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="text-base font-bold w-7 text-center">{item.quantity}</span>
                        <button onClick={() => updateQty.mutate({ itemId: item.id, delta: 1 })} className="rounded-xl border p-2.5 active:bg-secondary">
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xs truncate">{item.product_name}</p>
                        {comps.length > 0 && <p className="text-[9px] text-muted-foreground truncate">{comps.map((c) => c.complement_name).join(", ")}</p>}
                        {item.notes && <p className="text-[9px] text-accent truncate">📝 {item.notes}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs font-semibold mr-1">R$ {(Number(item.price) * item.quantity).toFixed(2)}</span>
                        <button onClick={() => { setNoteItemId(item.id); setNoteText(item.notes ?? ""); }} className="rounded-lg p-2 active:bg-secondary">
                          <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        <button onClick={() => removeItem.mutate(item.id)} className="rounded-lg p-2 active:bg-secondary">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Save button */}
              {orderItems.some((i) => !i.sent_to_kitchen) && (
                <button
                  onClick={() => saveOrder.mutate()}
                  disabled={saveOrder.isPending}
                  className="w-full mt-3 rounded-xl bg-accent text-accent-foreground py-4 text-base font-semibold active:opacity-90 disabled:opacity-50"
                >
                  {saveOrder.isPending ? "Enviando..." : `Salvar Pedido (${orderItems.filter((i) => !i.sent_to_kitchen).length} novo${orderItems.filter((i) => !i.sent_to_kitchen).length > 1 ? "s" : ""})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Note modal */}
      {noteItemId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30" onClick={() => setNoteItemId(null)}>
          <div className="w-full rounded-t-2xl border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-muted mx-auto mb-3" />
            <h3 className="text-sm font-semibold mb-2">Observação</h3>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Ex: Sem cebola, bem passado..." rows={3} autoFocus className="w-full rounded-xl border bg-card px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
            <button onClick={() => saveNote.mutate({ itemId: noteItemId, notes: noteText })} disabled={saveNote.isPending} className="w-full mt-3 rounded-xl bg-accent text-accent-foreground py-4 text-base font-semibold active:opacity-90 disabled:opacity-50">
              {saveNote.isPending ? "Salvando..." : "Salvar observação"}
            </button>
          </div>
        </div>
      )}

      <AddItemDialog product={selectedProduct} onClose={() => setSelectedProduct(null)} onAdd={(payload) => addItem.mutate(payload)} isPending={addItem.isPending} />
    </div>
  );
}
