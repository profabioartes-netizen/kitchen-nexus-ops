import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign,
  ShoppingBag,
  Receipt,
  Loader2,
  CalendarDays,
  Lock,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { format, subDays, startOfDay, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

const COLORS = [
  "hsl(36 90% 44%)",
  "hsl(220 60% 50%)",
  "hsl(142 60% 40%)",
  "hsl(0 73% 42%)",
  "hsl(280 60% 50%)",
  "hsl(180 50% 40%)",
  "hsl(45 80% 50%)",
  "hsl(330 60% 50%)",
];

const chartTooltipStyle = {
  background: "hsl(30 20% 96%)",
  border: "1px solid hsl(30 10% 82%)",
  borderRadius: "6px",
  fontSize: "12px",
};

const ADMIN_PIN = "9135";

type Period = "7" | "14" | "30" | "all";

export default function ReportsPage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [period, setPeriod] = useState<Period>("7");

  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ["payments_report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, orders!inner(status, created_at)")
        .eq("orders.status", "finalized")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: unlocked,
  });

  const { data: orderItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ["order_items_report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("product_name, price, quantity, orders!inner(status, created_at), product_id, products(category_id, categories(name))")
        .eq("orders.status", "finalized");
      if (error) throw error;
      return data;
    },
    enabled: unlocked,
  });

  const isLoading = loadingPayments || loadingItems;
  const cutoff = period === "all" ? null : startOfDay(subDays(new Date(), parseInt(period)));

  const filteredPayments = useMemo(() => {
    if (!cutoff) return payments;
    return payments.filter((p) => isAfter(new Date(p.created_at), cutoff));
  }, [payments, cutoff]);

  const filteredItems = useMemo(() => {
    if (!cutoff) return orderItems;
    return orderItems.filter((i) => {
      const orderDate = (i.orders as any)?.created_at;
      return orderDate && isAfter(new Date(orderDate), cutoff);
    });
  }, [orderItems, cutoff]);

  const totalRevenue = filteredPayments.reduce((s, p) => s + Number(p.amount), 0);
  const totalOrders = filteredPayments.length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalItemsSold = filteredItems.reduce((s, i) => s + i.quantity, 0);

  const dailyRevenue = useMemo(() => {
    const map = new Map<string, number>();
    filteredPayments.forEach((p) => {
      const day = format(new Date(p.created_at), "dd/MM", { locale: ptBR });
      map.set(day, (map.get(day) || 0) + Number(p.amount));
    });
    return Array.from(map.entries()).map(([day, revenue]) => ({ day, revenue }));
  }, [filteredPayments]);

  const byProduct = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    filteredItems.forEach((i) => {
      const existing = map.get(i.product_name) || { name: i.product_name, qty: 0, revenue: 0 };
      existing.qty += i.quantity;
      existing.revenue += Number(i.price) * i.quantity;
      map.set(i.product_name, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filteredItems]);

  const byCategory = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    filteredItems.forEach((i) => {
      const catName = (i.products as any)?.categories?.name || "Sem categoria";
      const existing = map.get(catName) || { name: catName, qty: 0, revenue: 0 };
      existing.qty += i.quantity;
      existing.revenue += Number(i.price) * i.quantity;
      map.set(catName, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [filteredItems]);

  const byMethod = useMemo(() => {
    const map = new Map<string, { method: string; amount: number; count: number }>();
    filteredPayments.forEach((p) => {
      const label = p.method === "cash" ? "Dinheiro" : p.method === "card" ? "Cartão" : "Pix";
      const existing = map.get(label) || { method: label, amount: 0, count: 0 };
      existing.amount += Number(p.amount);
      existing.count += 1;
      map.set(label, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredPayments]);

  if (!unlocked) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="rounded-lg border bg-card p-6 w-full max-w-xs space-y-4 shadow-lg text-center">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
          <h2 className="font-semibold text-lg">Área Restrita</h2>
          <p className="text-sm text-muted-foreground">Digite o PIN de administrador</p>
          <input
            type="password"
            autoFocus
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              setPinInput(val);
              if (val === ADMIN_PIN) setUnlocked(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (pinInput === ADMIN_PIN) setUnlocked(true);
                else { setPinInput(""); toast.error("PIN incorreto!"); }
              }
            }}
            placeholder="••••"
            className="w-full rounded-md border bg-background px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    { label: "Faturamento", value: `R$ ${totalRevenue.toFixed(2)}`, icon: DollarSign },
    { label: "Pedidos", value: String(totalOrders), icon: ShoppingBag },
    { label: "Ticket Médio", value: `R$ ${avgTicket.toFixed(2)}`, icon: Receipt },
    { label: "Itens Vendidos", value: String(totalItemsSold), icon: CalendarDays },
  ];

  const periods: { key: Period; label: string }[] = [
    { key: "7", label: "7 dias" },
    { key: "14", label: "14 dias" },
    { key: "30", label: "30 dias" },
    { key: "all", label: "Tudo" },
  ];

  const hasData = filteredPayments.length > 0 || filteredItems.length > 0;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <div className="flex gap-1 rounded-md border bg-card p-1">
          {periods.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                period === p.key
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-display text-2xl">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {!hasData && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhum dado para o período selecionado.</p>
          <p className="text-sm mt-1">Use o Caixa para registrar vendas.</p>
        </div>
      )}

      {hasData && (
        <>
          {dailyRevenue.length > 0 && (
            <div className="rounded-lg border bg-card p-4 mb-6">
              <h3 className="font-semibold mb-4">Faturamento Diário</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(30 10% 82%)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(0 0% 45%)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(0 0% 45%)" />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`R$ ${v.toFixed(2)}`, "Faturamento"]} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(36 90% 44%)" strokeWidth={2} dot={{ fill: "hsl(36 90% 44%)", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {byMethod.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-4">Vendas por Método de Pagamento</h3>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={byMethod} dataKey="amount" nameKey="method" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                        {byMethod.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`R$ ${v.toFixed(2)}`]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {byMethod.map((m, i) => (
                      <div key={m.method} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span>{m.method}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium">R$ {m.amount.toFixed(2)}</span>
                          <span className="text-muted-foreground ml-2 text-xs">({m.count}x)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {byCategory.length > 0 && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-semibold mb-4">Vendas por Categoria</h3>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={180} height={180}>
                    <PieChart>
                      <Pie data={byCategory} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
                        {byCategory.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`R$ ${v.toFixed(2)}`]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {byCategory.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="h-3 w-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                          <span>{c.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-medium">R$ {c.revenue.toFixed(2)}</span>
                          <span className="text-muted-foreground ml-2 text-xs">({c.qty}un)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {byProduct.length > 0 && (
            <div className="rounded-lg border bg-card p-4 mb-6">
              <h3 className="font-semibold mb-4">Vendas por Produto</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byProduct.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(30 10% 82%)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(0 0% 45%)" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} stroke="hsl(0 0% 45%)" width={110} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`R$ ${v.toFixed(2)}`, "Faturamento"]} />
                    <Bar dataKey="revenue" fill="hsl(36 90% 44%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                <div className="overflow-auto max-h-[280px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium">#</th>
                        <th className="text-left py-2 font-medium">Produto</th>
                        <th className="text-right py-2 font-medium">Qtd</th>
                        <th className="text-right py-2 font-medium">Faturamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byProduct.map((p, i) => (
                        <tr key={p.name} className="border-b last:border-0">
                          <td className="py-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-accent text-xs font-bold">
                              {i + 1}
                            </span>
                          </td>
                          <td className="py-2">{p.name}</td>
                          <td className="py-2 text-right text-muted-foreground">{p.qty}</td>
                          <td className="py-2 text-right font-medium">R$ {p.revenue.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
