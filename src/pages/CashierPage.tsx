import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";

interface OrderItem {
  id: string;
  product_id: string;
  name: string;
  price: number;
  qty: number;
}

export default function CashierPage() {
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<OrderItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: products = [], isLoading } = useQuery({
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

  // Set default active category
  if (!activeCategory && categories.length > 0) {
    setActiveCategory(categories[0].id);
  }

  const addItem = (product: (typeof products)[0]) => {
    setOrder((prev) => {
      const existing = prev.find((o) => o.product_id === product.id);
      if (existing) {
        return prev.map((o) =>
          o.product_id === product.id ? { ...o, qty: o.qty + 1 } : o
        );
      }
      return [...prev, {
        id: crypto.randomUUID(),
        product_id: product.id,
        name: product.name,
        price: Number(product.price),
        qty: 1,
      }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setOrder((prev) =>
      prev.map((o) => (o.id === id ? { ...o, qty: o.qty + delta } : o)).filter((o) => o.qty > 0)
    );
  };

  const removeItem = (id: string) => setOrder((prev) => prev.filter((o) => o.id !== id));

  const subtotal = order.reduce((sum, o) => sum + o.price * o.qty, 0);

  const payMutation = useMutation({
    mutationFn: async (method: "cash" | "credit" | "debit" | "pix") => {
      // Create order
      const { data: newOrder, error: orderError } = await supabase
        .from("orders")
        .insert({ status: "finalized", total: subtotal })
        .select()
        .single();
      if (orderError) throw orderError;

      // Insert items
      const items = order.map((o) => ({
        order_id: newOrder.id,
        product_id: o.product_id,
        product_name: o.name,
        price: o.price,
        quantity: o.qty,
      }));
      const { error: itemsError } = await supabase.from("order_items").insert(items);
      if (itemsError) throw itemsError;

      // Insert payment
      const { error: payError } = await supabase.from("payments").insert({
        order_id: newOrder.id,
        method,
        amount: subtotal,
      });
      if (payError) throw payError;

      return newOrder;
    },
    onSuccess: () => {
      setOrder([]);
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      toast.success("Pagamento registrado com sucesso!");
    },
    onError: (err) => {
      toast.error("Erro ao registrar pagamento: " + (err as Error).message);
    },
  });

  const filtered = products.filter(
    (p) =>
      p.category_id === activeCategory &&
      p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-screen">
      {/* Product grid */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
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

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-auto flex-1 items-start content-start">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => addItem(item)}
                className="flex flex-col rounded-lg border bg-card text-left transition-all hover:border-accent active:scale-[0.97] overflow-hidden"
              >
                {item.image_url && (
                  <div className="w-full aspect-[4/3] bg-secondary">
                    <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-3">
                  <span className="font-medium text-sm">{item.name}</span>
                  <span className="text-accent font-semibold mt-1 block">
                    R$ {Number(item.price).toFixed(2)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Order panel */}
      <div className="w-80 border-l bg-card flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg">Comanda</h2>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-2">
          {order.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhum item adicionado
            </p>
          )}
          {order.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-md border bg-background p-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  R$ {item.price.toFixed(2)} × {item.qty}
                </p>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button onClick={() => updateQty(item.id, -1)} className="rounded p-1 hover:bg-secondary">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-sm font-medium">{item.qty}</span>
                <button onClick={() => updateQty(item.id, 1)} className="rounded p-1 hover:bg-secondary">
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => removeItem(item.id)} className="rounded p-1 hover:bg-destructive/10 text-destructive ml-1">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Subtotal</span>
            <span className="font-semibold">R$ {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-display text-xl">TOTAL</span>
            <span className="font-display text-xl">R$ {subtotal.toFixed(2)}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              disabled={order.length === 0 || payMutation.isPending}
              onClick={() => payMutation.mutate("card")}
              className="flex flex-col items-center justify-center gap-1 rounded-md bg-accent text-accent-foreground py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              <span className="text-xs">Cartão</span>
            </button>
            <button
              disabled={order.length === 0 || payMutation.isPending}
              onClick={() => payMutation.mutate("cash")}
              className="flex flex-col items-center justify-center gap-1 rounded-md bg-primary text-primary-foreground py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Banknote className="h-4 w-4" />
              <span className="text-xs">Dinheiro</span>
            </button>
            <button
              disabled={order.length === 0 || payMutation.isPending}
              onClick={() => payMutation.mutate("pix")}
              className="flex flex-col items-center justify-center gap-1 rounded-md bg-secondary text-secondary-foreground py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Smartphone className="h-4 w-4" />
              <span className="text-xs">Pix</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
