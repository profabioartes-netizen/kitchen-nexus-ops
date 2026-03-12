import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Search, Loader2, Users, ChevronDown, ChevronUp,
  CreditCard, Clock, CalendarDays, Receipt, Package, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { normalize } from "@/lib/normalize";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const methodLabels: Record<string, string> = {
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  pix: "Pix",
  card: "Cartão",
};

export default function CustomerSalesPage() {
  const [search, setSearch] = useState("");
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);

  const reprintOrder = async (order: any, items: any[]) => {
    if (printingOrderId) return;
    setPrintingOrderId(order.id);
    try {
      await supabase.from("print_jobs").insert({
        station: "Caixa",
        status: "pending",
        payload: {
          type: "bill",
          table_name: order.customer_name || "Balcão",
          customer_name: order.customer_name || null,
          waiter_name: order.waiter_name || null,
          order_id: order.id,
          items: items.map((i) => ({
            product_name: i.product_name,
            quantity: i.quantity,
            price: Number(i.price),
          })),
          total: Number(order.total),
        },
      });
      toast.success("Reimpressão enviada para o Caixa!");
    } catch {
      toast.error("Erro ao reimprimir.");
    } finally {
      setPrintingOrderId(null);
    }
  };

  // Fetch all finalized orders (including cashier/anonymous sales)
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["customer_sales_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "finalized")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Assign "Venda Balcão" to orders without customer_name
      return data.map((o) => ({
        ...o,
        customer_name: o.customer_name && o.customer_name.trim() !== "" ? o.customer_name : "Venda Balcão",
      }));
    },
  });

  // Fetch all order items for finalized orders
  const orderIds = orders.map((o) => o.id);
  const { data: allItems = [] } = useQuery({
    queryKey: ["customer_sales_items", orderIds.join(",")],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      // Batch in chunks of 50
      const chunks: string[][] = [];
      for (let i = 0; i < orderIds.length; i += 50) {
        chunks.push(orderIds.slice(i, i + 50));
      }
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          const { data, error } = await supabase
            .from("order_items")
            .select("*")
            .in("order_id", chunk);
          if (error) throw error;
          return data;
        })
      );
      return results.flat();
    },
    enabled: orderIds.length > 0,
  });

  // Fetch all payments for finalized orders
  const { data: allPayments = [] } = useQuery({
    queryKey: ["customer_sales_payments", orderIds.join(",")],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const chunks: string[][] = [];
      for (let i = 0; i < orderIds.length; i += 50) {
        chunks.push(orderIds.slice(i, i + 50));
      }
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          const { data, error } = await supabase
            .from("payments")
            .select("*")
            .in("order_id", chunk);
          if (error) throw error;
          return data;
        })
      );
      return results.flat();
    },
    enabled: orderIds.length > 0,
  });

  // Fetch activity logs for finalized orders
  const { data: allLogs = [] } = useQuery({
    queryKey: ["customer_sales_logs", orderIds.join(",")],
    queryFn: async () => {
      if (orderIds.length === 0) return [];
      const chunks: string[][] = [];
      for (let i = 0; i < orderIds.length; i += 50) {
        chunks.push(orderIds.slice(i, i + 50));
      }
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          const { data, error } = await supabase
            .from("table_activity_log")
            .select("*")
            .in("order_id", chunk)
            .order("created_at", { ascending: true });
          if (error) throw error;
          return data;
        })
      );
      return results.flat();
    },
    enabled: orderIds.length > 0,
  });

  // Index items, payments, logs by order_id
  const itemsByOrder = useMemo(() => {
    const map: Record<string, typeof allItems> = {};
    allItems.forEach((i) => {
      if (!map[i.order_id]) map[i.order_id] = [];
      map[i.order_id].push(i);
    });
    return map;
  }, [allItems]);

  const paymentsByOrder = useMemo(() => {
    const map: Record<string, typeof allPayments> = {};
    allPayments.forEach((p) => {
      if (!map[p.order_id]) map[p.order_id] = [];
      map[p.order_id].push(p);
    });
    return map;
  }, [allPayments]);

  const logsByOrder = useMemo(() => {
    const map: Record<string, typeof allLogs> = {};
    allLogs.forEach((l) => {
      if (l.order_id) {
        if (!map[l.order_id]) map[l.order_id] = [];
        map[l.order_id].push(l);
      }
    });
    return map;
  }, [allLogs]);

  // Group orders by customer
  const customerData = useMemo(() => {
    const map: Record<string, { name: string; orders: typeof orders; totalSpent: number; lastVisit: string }> = {};
    orders.forEach((o) => {
      const name = o.customer_name!.trim();
      if (!map[name]) {
        map[name] = { name, orders: [], totalSpent: 0, lastVisit: o.created_at };
      }
      map[name].orders.push(o);
      map[name].totalSpent += Number(o.total);
      if (o.created_at > map[name].lastVisit) map[name].lastVisit = o.created_at;
    });
    return Object.values(map).sort((a, b) => b.lastVisit.localeCompare(a.lastVisit));
  }, [orders]);

  const filtered = customerData.filter((c) =>
    normalize(c.name).includes(normalize(search))
  );

  if (loadingOrders) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-accent" />
          <h1 className="text-2xl font-semibold">Vendas por Cliente</h1>
        </div>
        <span className="text-sm text-muted-foreground">{customerData.length} clientes</span>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum cliente encontrado.</p>
          <p className="text-xs mt-1">As vendas aparecem aqui após a finalização de comandas com nome do cliente.</p>
        </div>
      )}

      {/* Customer list */}
      <div className="space-y-3">
        {filtered.map((customer) => {
          const isExpanded = expandedCustomer === customer.name;
          return (
            <div key={customer.name} className="rounded-xl border bg-card overflow-hidden">
              {/* Customer header */}
              <button
                onClick={() => setExpandedCustomer(isExpanded ? null : customer.name)}
                className="w-full flex items-center gap-4 p-4 text-left hover:bg-secondary/30 transition-colors"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent font-bold text-sm flex-shrink-0">
                  {customer.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{customer.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">{customer.orders.length} pedido{customer.orders.length !== 1 ? "s" : ""}</span>
                    <span className="text-xs text-muted-foreground">
                      Última visita: {format(new Date(customer.lastVisit), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right">
                    <p className="text-sm font-bold">R$ {customer.totalSpent.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground">Total gasto</p>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {/* Expanded: order list */}
              {isExpanded && (
                <div className="border-t px-4 pb-4 pt-2 space-y-3">
                  {customer.orders.map((order) => {
                    const items = itemsByOrder[order.id] || [];
                    const payments = paymentsByOrder[order.id] || [];
                    const logs = logsByOrder[order.id] || [];

                    return (
                      <div key={order.id} className="rounded-lg border bg-secondary/20 overflow-hidden p-3 space-y-3">
                        {/* Order header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Receipt className="h-4 w-4 text-accent flex-shrink-0" />
                            <span className="text-sm font-medium">
                              {format(new Date(order.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                            {order.waiter_name && (
                              <span className="text-[10px] bg-secondary rounded-full px-2 py-0.5 text-muted-foreground">
                                {order.waiter_name}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-bold">R$ {Number(order.total).toFixed(2)}</span>
                        </div>

                        {/* Products */}
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                            <Package className="h-3 w-3" /> Produtos
                          </h4>
                          <div className="space-y-1">
                            {items.map((item) => (
                              <div key={item.id} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-accent font-semibold text-xs">×{item.quantity}</span>
                                  <span className="truncate">{item.product_name}</span>
                                </div>
                                <span className="text-muted-foreground flex-shrink-0 ml-2">
                                  R$ {(Number(item.price) * item.quantity).toFixed(2)}
                                </span>
                              </div>
                            ))}
                            {items.length === 0 && (
                              <p className="text-xs text-muted-foreground italic">Sem itens registrados</p>
                            )}
                          </div>
                        </div>

                        {/* Payments */}
                        {payments.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                              <CreditCard className="h-3 w-3" /> Pagamentos
                            </h4>
                            <div className="space-y-1">
                              {payments.map((payment) => (
                                <div key={payment.id} className="flex items-center justify-between text-sm">
                                  <div className="flex items-center gap-2">
                                    <span className="bg-accent/10 text-accent rounded-full px-2 py-0.5 text-[10px] font-medium">
                                      {methodLabels[payment.method] || payment.method}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(payment.created_at), "HH:mm", { locale: ptBR })}
                                    </span>
                                  </div>
                                  <span className="font-medium">R$ {Number(payment.amount).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Activity log */}
                        {logs.length > 0 && (
                          <div>
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
                              <Clock className="h-3 w-3" /> Histórico
                            </h4>
                            <div className="space-y-1">
                              {logs.map((log) => (
                                <div key={log.id} className="flex gap-2 text-xs">
                                  <span className="text-muted-foreground flex-shrink-0 tabular-nums">
                                    {format(new Date(log.created_at), "HH:mm")}
                                  </span>
                                  <span className="text-foreground/80">{log.description}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Order metadata */}
                        <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1 border-t border-border/50">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {format(new Date(order.created_at), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                          </span>
                          {order.guests && order.guests > 1 && (
                            <span>{order.guests} pessoas</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
