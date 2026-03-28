import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { normalize } from "@/lib/normalize";
import { getOrCreateSelfServiceOrder } from "@/lib/getOrCreateSelfServiceOrder";
import { recalculateOrderTotal } from "@/lib/recalculateOrderTotal";
import { Search, ShoppingBag, X, Trash2, Flame } from "lucide-react";
import AddItemDialog, { type AddItemPayload } from "@/components/AddItemDialog";

type CartItem = {
  product: { id: string; name: string; price: number; station: string; category_id: string | null };
  quantity: number;
  notes: string;
  complements: { id: string; name: string; price: number; quantity: number }[];
  complementsTotal: number;
};

interface Props {
  tableId: string;
  sessionId: string | null;
  customerName: string;
  table: any;
  whatsappPhone?: string;
  orderId: string | null;
  onOrderCreated: (orderId: string) => void;
}

export default function SelfServiceMenu({ tableId, sessionId, customerName, table, whatsappPhone, orderId, onOrderCreated }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>("__trending__");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products_active_menu"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      // Filter to only menu-visible products (client-side since column is new)
      return data.filter((p: any) => p.visible_on_menu !== false);
    },
  });

  // Check approval setting
  const { data: requiresApproval } = useQuery({
    queryKey: ["self_service_requires_approval"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("value")
        .eq("key", "self_service_requires_approval")
        .single();
      return data?.value === "true";
    },
  });

  // Fetch trending product IDs (top sellers last 15 days, R$15+ only, with featured fallback)
  const { data: trendingIds = [] } = useQuery({
    queryKey: ["trending_products_15d"],
    queryFn: async () => {
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

      // Get active + visible products with price >= 15
      const { data: activeProducts } = await supabase
        .from("products")
        .select("*")
        .eq("active", true);

      const visibleProducts = (activeProducts || []).filter((p: any) => p.visible_on_menu !== false);

      const eligibleIds = new Set(
        visibleProducts
          .filter((p: any) => p.price >= 15)
          .map((p: any) => p.id)
      );

      // Get manually featured products as fallback
      const featuredIds = visibleProducts
        .filter((p: any) => (p as any).featured_on_menu === true)
        .map((p: any) => p.id);

      if (eligibleIds.size === 0) return featuredIds.slice(0, 10);

      const { data, error } = await supabase
        .from("order_items")
        .select("product_id, quantity, order_id")
        .gte("created_at", fifteenDaysAgo.toISOString());
      if (error) throw error;

      const orderIds = [...new Set((data || []).map(i => i.order_id))];
      if (orderIds.length === 0) return featuredIds.slice(0, 10);

      const { data: closedOrders } = await supabase
        .from("orders")
        .select("id")
        .in("id", orderIds)
        .eq("status", "closed");

      const closedSet = new Set((closedOrders || []).map(o => o.id));

      const counts = new Map<string, number>();
      for (const item of data || []) {
        if (!closedSet.has(item.order_id)) continue;
        if (!eligibleIds.has(item.product_id)) continue;
        counts.set(item.product_id, (counts.get(item.product_id) || 0) + item.quantity);
      }

      let result = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id]) => id);

      // Fallback: fill remaining slots with featured products
      if (result.length < 10) {
        const resultSet = new Set(result);
        for (const fid of featuredIds) {
          if (result.length >= 10) break;
          if (!resultSet.has(fid)) {
            result.push(fid);
            resultSet.add(fid);
          }
        }
      }

      return result;
    },
    staleTime: 5 * 60 * 1000,
  });

  const TRENDING_ID = "__trending__";

  const filtered = useMemo(() => {
    let list = products;
    if (activeCategory === TRENDING_ID) {
      if (trendingIds.length === 0) return list; // fallback: show all
      const idxMap = new Map(trendingIds.map((id, i) => [id, i]));
      list = list.filter(p => idxMap.has(p.id));
      list.sort((a, b) => (idxMap.get(a.id) ?? 99) - (idxMap.get(b.id) ?? 99));
      return list;
    }
    if (activeCategory) list = list.filter((p) => p.category_id === activeCategory);
    if (search.trim()) {
      const q = normalize(search);
      list = list.filter((p) => normalize(p.name).includes(q));
    }
    return list;
  }, [products, activeCategory, search, trendingIds]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (Number(item.product.price) + item.complementsTotal) * item.quantity, 0);
  }, [cart]);

  const cartCount = useMemo(() => cart.reduce((s, i) => s + i.quantity, 0), [cart]);

  const handleAddItem = (payload: AddItemPayload) => {
    setCart((prev) => [...prev, payload]);
    setSelectedProduct(null);
    toast.success(`${payload.product.name} adicionado ao carrinho`);
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const submitOrder = async () => {
    if (cart.length === 0) return;
    setSubmitting(true);

    try {
      if (!sessionId) {
        throw new Error("Sessão de autoatendimento inválida");
      }

      const ensuredOrder = await getOrCreateSelfServiceOrder({
        tableId,
        sessionId,
        customerName,
        whatsappPhone: whatsappPhone || null,
      });

      const currentOrderId = ensuredOrder.id;

      if (currentOrderId !== orderId) {
        onOrderCreated(currentOrderId);
      }

      // Insert items
      for (const item of cart) {
        const { data: inserted, error: itemErr } = await supabase
          .from("order_items")
          .insert({
            order_id: currentOrderId,
            product_id: item.product.id,
            product_name: item.product.name,
            price: Number(item.product.price) + item.complementsTotal,
            quantity: item.quantity,
            notes: item.notes || null,
            sent_to_kitchen: !requiresApproval,
            sent_at: !requiresApproval ? new Date().toISOString() : null,
            preparation_status: !requiresApproval ? "pending" : "pending",
          })
          .select("id")
          .single();

        if (itemErr) throw itemErr;

        // Insert complements
        if (item.complements.length > 0 && inserted) {
          const compInserts = item.complements.map((c) => ({
            order_item_id: inserted.id,
            complement_id: c.id,
            complement_name: c.name,
            price: c.price,
            quantity: c.quantity,
          }));
          await supabase.from("order_item_complements").insert(compInserts);
        }
      }

      // Create print jobs for kitchen if auto-approved
      if (!requiresApproval) {
        const stations = new Map<string, any[]>();
        for (const item of cart) {
          const station = item.product.station || "Cozinha";
          if (!stations.has(station)) stations.set(station, []);
          stations.get(station)!.push({
            name: item.product.name,
            qty: item.quantity,
            notes: item.notes || "",
            complements: item.complements.map((c) => `${c.name}${c.quantity > 1 ? ` x${c.quantity}` : ""}`),
          });
        }

        for (const [station, items] of stations) {
          await supabase.from("print_jobs").insert({
            station,
            payload: {
              type: "production",
              table: table.name || "Mesa",
              location: table.internal_number || table.name || "Mesa",
              customerName,
              customer_name: customerName,
              items,
              selfService: true,
            },
          });
        }
      }

      // Log activity
      await supabase.from("table_activity_log").insert({
        table_id: tableId,
        order_id: currentOrderId,
        action: "self_service_order",
        description: `Pedido feito via auto-atendimento por ${customerName} (${cart.length} itens)`,
        user_name: customerName,
      });

      // Sync total server-side (safe for concurrent writes)
      await recalculateOrderTotal(currentOrderId);

      setCart([]);
      setShowCart(false);
      queryClient.invalidateQueries({ queryKey: ["self_service_order"] });
      queryClient.invalidateQueries({ queryKey: ["self_service_items"] });
      toast.success(
        requiresApproval
          ? "Pedido enviado! Aguarde a confirmação da Cafeteria Coffee Thrones."
          : "Pedido enviado para a cozinha!",
      );
    } catch (err: any) {
      console.error("Erro ao enviar pedido:", err);
      toast.error("Erro ao enviar pedido. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no cardápio..."
            className="w-full rounded-lg border border-input bg-card pl-9 pr-4 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-accent placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => setActiveCategory(TRENDING_ID)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1 ${
            activeCategory === TRENDING_ID ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"
          }`}
        >
          <Flame className="h-3 w-3" />
          Em Alta no Reino
        </button>
        <button
          onClick={() => setActiveCategory(null)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !activeCategory ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"
          }`}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              activeCategory === cat.id ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Products grid */}
      <div className="flex-1 overflow-auto px-4 pb-24">
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((product) => {
            const isOutOfStock = product.stock !== null && product.stock === 0;
            return (
              <button
                key={product.id}
                onClick={() => !isOutOfStock && setSelectedProduct(product)}
                disabled={isOutOfStock}
                className={`rounded-lg border border-border bg-card p-3 text-left transition-colors ${
                  isOutOfStock
                    ? "opacity-60 cursor-not-allowed"
                    : "hover:border-accent/40"
                }`}
              >
                {(product as any).menu_image_url && (
                  <img
                    src={(product as any).menu_image_url}
                    alt={product.name}
                    className="w-full h-24 object-cover rounded-md mb-2"
                    loading="lazy"
                  />
                )}
              <h3 className="text-sm font-medium text-foreground line-clamp-2">{product.name}</h3>
              {(product as any).description && (
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                  {(product as any).description}
                </p>
              )}
              <p className="text-sm font-semibold text-accent mt-1">
                R$ {Number(product.price).toFixed(2)}
              </p>
              {product.stock !== null && product.stock >= 0 && product.stock <= 5 && (
                <p className={`text-[10px] mt-0.5 ${product.stock === 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                  {product.stock === 0 ? "Esgotado" : `Restam ${product.stock}`}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground mt-8">Nenhum produto encontrado</p>
        )}
      </div>

      {/* Cart FAB */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent">
          <button
            onClick={() => setShowCart(true)}
            className="w-full rounded-lg bg-accent text-accent-foreground py-3.5 font-semibold flex items-center justify-center gap-2 shadow-lg"
          >
            <ShoppingBag className="h-5 w-5" />
            Ver Carrinho ({cartCount}) · R$ {cartTotal.toFixed(2)}
          </button>
        </div>
      )}

      {/* Cart Sheet */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Seu Pedido</h2>
            <button onClick={() => setShowCart(false)} className="p-1.5 rounded hover:bg-secondary">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-3">
            {cart.map((item, i) => (
              <div key={i} className="rounded-lg border border-border bg-card p-3 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity}x R$ {(Number(item.product.price) + item.complementsTotal).toFixed(2)}
                  </p>
                  {item.complements.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      + {item.complements.map((c) => c.name).join(", ")}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-[10px] text-muted-foreground italic mt-0.5">"{item.notes}"</p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-sm font-semibold text-foreground">
                    R$ {((Number(item.product.price) + item.complementsTotal) * item.quantity).toFixed(2)}
                  </span>
                  <button onClick={() => removeFromCart(i)} className="p-1 rounded hover:bg-secondary text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-foreground">R$ {cartTotal.toFixed(2)}</span>
            </div>
            <button
              onClick={submitOrder}
              disabled={submitting || cart.length === 0}
              className="w-full rounded-lg bg-accent text-accent-foreground py-3.5 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? "Enviando..." : "Confirmar Pedido"}
            </button>
          </div>
        </div>
      )}

      {/* Add Item Dialog */}
      <AddItemDialog
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAdd={handleAddItem}
      />
    </div>
  );
}
