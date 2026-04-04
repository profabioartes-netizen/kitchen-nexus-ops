import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Minus, Trash2, CreditCard, Banknote, Loader2, Smartphone, Printer } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import NfceStatus from "@/components/NfceStatus";
import { normalize } from "@/lib/normalize";
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
  const [selectedMethod, setSelectedMethod] = useState<"credit" | "debit" | "cash" | "pix" | null>(null);
  const [cashGiven, setCashGiven] = useState("");
  const [lastFinalizedOrderId, setLastFinalizedOrderId] = useState<string | null>(null);
  const [lastOrderSnapshot, setLastOrderSnapshot] = useState<{
    items: OrderItem[];
    total: number;
    method: string;
    change: number;
  } | null>(null);

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

  // Cash change calculation
  const cashGivenNum = Number(cashGiven.replace(",", ".")) || 0;
  const cashChange = selectedMethod === "cash" && cashGivenNum > subtotal
    ? Number((cashGivenNum - subtotal).toFixed(2))
    : 0;

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

      // Insert payment (DB constraint allows: cash, card, pix)
      const dbMethod = method === "credit" || method === "debit" ? "card" : method;
      const { error: payError } = await supabase.from("payments").insert({
        order_id: newOrder.id,
        method: dbMethod,
        amount: subtotal,
      });
      if (payError) throw payError;

      return newOrder;
    },
    onSuccess: (newOrder, method) => {
      setLastOrderSnapshot({
        items: [...order],
        total: subtotal,
        method: methodLabels[method] || method,
        change: method === "cash" ? cashChange : 0,
      });
      setLastFinalizedOrderId(newOrder.id);
      setOrder([]);
      setSelectedMethod(null);
      setCashGiven("");
      queryClient.invalidateQueries({ queryKey: ["open_orders"] });
      toast.success("Pagamento registrado com sucesso!");

      // Fire-and-forget NFC-e emission (non-blocking)
      supabase.functions.invoke("emit-nfce", {
        body: { order_id: newOrder.id },
      }).then(({ data, error }) => {
        if (error || data?.error) {
          toast.error("Erro ao emitir NFC-e: " + (data?.error || (error as Error).message));
        } else {
          toast.success("NFC-e emitida automaticamente!");
        }
      }).catch((e) => {
        console.error("NFC-e auto-emit error:", e);
        toast.error("Falha ao emitir NFC-e automaticamente.");
      });
    },
    onError: (err) => {
      toast.error("Erro ao registrar pagamento: " + (err as Error).message);
    },
  });

  // Print bill to Caixa station
  const printBill = async () => {
    if (order.length === 0) return;
    await supabase.from("print_jobs").insert({
      station: "Caixa",
      status: "pending",
      payload: {
        type: "bill",
        customer_name: null,
        comanda_number: null,
        location: "Balcão",
        table_name: "Balcão",
        waiter_name: null,
        origin: "cashier",
        items: order.map((o) => ({
          product_name: o.name,
          quantity: o.qty,
          price: o.price,
          subtotal: o.price * o.qty,
        })),
        subtotal,
        total: subtotal,
        payment_method: selectedMethod || null,
        change: selectedMethod === "cash" ? cashChange : null,
      },
    });
    toast.success("Nota enviada para impressão!");
  };

  // Print non-fiscal receipt after finalization
  const printReceipt = async () => {
    if (!lastOrderSnapshot) return;
    const now = new Date();
    await supabase.from("print_jobs").insert({
      station: "Caixa",
      status: "pending",
      payload: {
        type: "receipt",
        business_name: "COFFEE THRONES",
        location: "Balcão",
        table_name: "Balcão",
        customer_name: null,
        origin: "cashier",
        items: lastOrderSnapshot.items.map((o) => ({
          product_name: o.name,
          quantity: o.qty,
          price: o.price,
          subtotal: o.price * o.qty,
        })),
        total: lastOrderSnapshot.total,
        payment_method: lastOrderSnapshot.method,
        change: lastOrderSnapshot.change > 0 ? lastOrderSnapshot.change : null,
        date: now.toLocaleDateString("pt-BR"),
        time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        footer_message: "👑 Obrigado pela preferência! Volte sempre ao Reino Coffee Thrones!",
      },
    });
    toast.success("Comprovante enviado para impressão!");
  };

  // Finalize + Print in one action
  const handleFinalizeAndPrint = () => {
    if (!selectedMethod || order.length === 0) return;
    // Store snapshot before mutation clears order
    const snapshot = {
      items: [...order],
      total: subtotal,
      method: methodLabels[selectedMethod] || selectedMethod,
      change: selectedMethod === "cash" ? cashChange : 0,
    };
    payMutation.mutate(selectedMethod, {
      onSuccess: () => {
        // Print receipt from snapshot
        const now = new Date();
        supabase.from("print_jobs").insert({
          station: "Caixa",
          status: "pending",
          payload: {
            type: "receipt",
            business_name: "COFFEE THRONES",
            table_name: "Balcão",
            customer_name: null,
            items: snapshot.items.map((o) => ({
              product_name: o.name,
              quantity: o.qty,
              price: o.price,
              subtotal: o.price * o.qty,
            })),
            total: snapshot.total,
            payment_method: snapshot.method,
            change: snapshot.change > 0 ? snapshot.change : null,
            date: now.toLocaleDateString("pt-BR"),
            time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
            footer_message: "👑 Obrigado pela preferência! Volte sempre ao Reino Coffee Thrones!",
          },
        });
        toast.success("Comprovante enviado para impressão!");
      },
    });
  };

  const filtered = products.filter(
    (p) =>
      p.category_id === activeCategory &&
      normalize(p.name).includes(normalize(search))
  );

  const methodLabels: Record<string, string> = {
    credit: "Crédito",
    debit: "Débito",
    cash: "Dinheiro",
    pix: "Pix",
  };

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

        <div className="flex gap-2 mb-4 overflow-x-auto flex-shrink-0 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
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
          <LoadingScreen />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-auto flex-1 items-start content-start">
            {filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => addItem(item)}
                className="flex flex-col rounded-lg border bg-card text-left transition-all hover:border-accent active:scale-[0.97] overflow-hidden"
              >
              {/* No image in operational view */}
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
      <div className="w-80 border-l bg-card flex flex-col overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-semibold text-lg">Comanda</h2>
          <button
            disabled={order.length === 0}
            onClick={printBill}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            title="Imprimir nota"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </button>
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

        <div className="border-t p-4 space-y-3 flex-shrink-0 max-h-[50vh] overflow-auto">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Subtotal</span>
            <span className="font-semibold">R$ {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-display text-xl">TOTAL</span>
            <span className="font-display text-xl">R$ {subtotal.toFixed(2)}</span>
          </div>

          {/* Payment method selection */}
          <div className="grid grid-cols-4 gap-2">
            {(["credit", "debit", "cash", "pix"] as const).map((method) => {
              const icons = { credit: CreditCard, debit: CreditCard, cash: Banknote, pix: Smartphone };
              const Icon = icons[method];
              const isSelected = selectedMethod === method;
              return (
                <button
                  key={method}
                  disabled={order.length === 0}
                  onClick={() => {
                    setSelectedMethod(method);
                    if (method !== "cash") setCashGiven("");
                  }}
                  className={`flex flex-col items-center justify-center gap-1 rounded-md py-3 font-medium transition-all disabled:opacity-50 ${
                    isSelected
                      ? "bg-accent text-accent-foreground ring-2 ring-accent ring-offset-1 ring-offset-card"
                      : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs">{methodLabels[method]}</span>
                </button>
              );
            })}
          </div>

          {/* Cash change calculator */}
          {selectedMethod === "cash" && (
            <div className="space-y-2 rounded-md border bg-background p-3">
              <label className="text-xs font-medium text-muted-foreground">Troco para:</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0,00"
                value={cashGiven}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  const cents = parseInt(digits, 10) || 0;
                  const formatted = (cents / 100).toFixed(2).replace(".", ",");
                  setCashGiven(formatted);
                }}
                className="w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              {cashGivenNum > 0 && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">Troco</span>
                  <span className={`text-sm font-bold ${cashChange > 0 ? "text-green-500" : "text-destructive"}`}>
                    R$ {cashChange.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Confirm payment buttons */}
          {selectedMethod && (
            <div className="flex gap-2">
              <button
                disabled={order.length === 0 || payMutation.isPending}
                onClick={() => payMutation.mutate(selectedMethod)}
                className="flex-1 rounded-md bg-accent text-accent-foreground py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {payMutation.isPending ? "Processando..." : `✅ Finalizar`}
              </button>
              <button
                disabled={order.length === 0 || payMutation.isPending}
                onClick={handleFinalizeAndPrint}
                className="flex-1 rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                🧾 Finalizar + Imprimir
              </button>
            </div>
          )}

          {/* Post-payment: receipt print + NFC-e */}
          {lastFinalizedOrderId && (
            <div className="space-y-2">
              {lastOrderSnapshot && (
                <button
                  onClick={printReceipt}
                  className="w-full rounded-md border border-border bg-secondary text-secondary-foreground py-2 text-sm font-medium hover:bg-secondary/80 transition-colors"
                >
                  🧾 Imprimir Comprovante
                </button>
              )}
              <NfceStatus
                orderId={lastFinalizedOrderId}
                onClose={() => {
                  setLastFinalizedOrderId(null);
                  setLastOrderSnapshot(null);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
