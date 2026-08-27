import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign, ShoppingBag, Receipt, CalendarDays, Lock, Store, Users, TrendingUp,
  Filter, Clock,
} from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { format, subDays, startOfDay, endOfDay, isAfter, isBefore, isEqual } from "date-fns";
import { useGoLiveDate } from "@/hooks/useGoLiveDate";
import { useSecurityPin } from "@/hooks/useSecurityPinEnabled";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const COLORS = [
  "hsl(36 90% 44%)", "hsl(220 60% 50%)", "hsl(142 60% 40%)", "hsl(0 73% 42%)",
  "hsl(280 60% 50%)", "hsl(180 50% 40%)", "hsl(45 80% 50%)", "hsl(330 60% 50%)",
];

const chartTooltipStyle = {
  background: "hsl(20 12% 14%)",
  border: "1px solid hsl(20 8% 22%)",
  borderRadius: "6px",
  fontSize: "12px",
  color: "hsl(36 15% 90%)",
};

const methodLabels: Record<string, string> = {
  cash: "Dinheiro", debit: "Débito", credit: "Crédito", pix: "Pix", card: "Cartão",
};

type Channel = "all" | "balcao" | "mesa";
type QuickPeriod = "today" | "7" | "14" | "30" | "custom";
type SortMode = "revenue" | "qty";

export default function ReportsPage() {
  const { pin: ADMIN_PIN, pinEnabled } = useSecurityPin();
  const { tenant, loading: loadingTenant } = useTenant();
  const tenantId = tenant?.id ?? null;
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  useEffect(() => { if (!pinEnabled) setUnlocked(true); }, [pinEnabled]);
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>("today");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const [channel, setChannel] = useState<Channel>("all");
  const [productSort, setProductSort] = useState<SortMode>("revenue");

  const { goLiveAt, isLoading: loadingGoLive } = useGoLiveDate();

  // ── Quick period → date range sync (local browser timezone) ──
  const effectiveDateFrom = useMemo(() => {
    if (quickPeriod === "custom") return dateFrom ? startOfDay(dateFrom) : null;
    if (quickPeriod === "today") return startOfDay(new Date());
    return startOfDay(subDays(new Date(), parseInt(quickPeriod)));
  }, [quickPeriod, dateFrom]);

  const effectiveDateTo = useMemo(() => {
    if (quickPeriod === "custom") return dateTo ? endOfDay(dateTo) : null;
    return endOfDay(new Date());
  }, [quickPeriod, dateTo]);

  // Lower bound applied in the database: respects go-live milestone + selected period
  const rangeFromIso = useMemo(() => {
    const candidates: number[] = [];
    if (effectiveDateFrom) candidates.push(effectiveDateFrom.getTime());
    if (goLiveAt) candidates.push(new Date(goLiveAt).getTime());
    if (!candidates.length) return null;
    return new Date(Math.max(...candidates)).toISOString();
  }, [effectiveDateFrom, goLiveAt]);

  const rangeToIso = useMemo(
    () => (effectiveDateTo ? effectiveDateTo.toISOString() : null),
    [effectiveDateTo]
  );

  const queriesEnabled = unlocked && !loadingGoLive && !loadingTenant && !!tenantId;

  // ── Data fetching (same tenant + same date range for orders, payments and items) ──
  const { data: orders = [], isLoading: loadingOrders } = useQuery({
    queryKey: ["report_orders", tenantId, rangeFromIso, rangeToIso],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, status, created_at, total, customer_name, whatsapp_phone, table_id, waiter_name")
        .eq("tenant_id", tenantId!)
        .eq("status", "finalized")
        .order("created_at", { ascending: true });
      if (rangeFromIso) q = q.gte("created_at", rangeFromIso);
      if (rangeToIso) q = q.lte("created_at", rangeToIso);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: queriesEnabled,
  });

  const { data: payments = [], isLoading: loadingPayments } = useQuery({
    queryKey: ["payments_report", tenantId, rangeFromIso, rangeToIso],
    queryFn: async () => {
      let q = supabase
        .from("payments")
        .select("*, orders!inner(status, created_at, whatsapp_phone, customer_name, table_id)")
        .eq("tenant_id", tenantId!)
        .eq("orders.status", "finalized")
        .is("voided_at", null)
        .order("created_at", { ascending: true });
      if (rangeFromIso) q = q.gte("orders.created_at", rangeFromIso);
      if (rangeToIso) q = q.lte("orders.created_at", rangeToIso);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: queriesEnabled,
  });

  const { data: orderItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ["order_items_report", tenantId, rangeFromIso, rangeToIso],
    queryFn: async () => {
      let q = supabase
        .from("order_items")
        .select("product_name, price, quantity, order_id, orders!inner(status, created_at, whatsapp_phone, customer_name, table_id), product_id, products(category_id, categories(name))")
        .eq("tenant_id", tenantId!)
        .eq("orders.status", "finalized");
      if (rangeFromIso) q = q.gte("orders.created_at", rangeFromIso);
      if (rangeToIso) q = q.lte("orders.created_at", rangeToIso);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: queriesEnabled,
  });

  const isLoading = loadingTenant || loadingPayments || loadingItems || loadingOrders;

  // ── Channel classification ──
  const getChannel = (o: any): Channel => {
    if (!o.customer_name || !o.customer_name.trim()) return "balcao";
    return "mesa";
  };

  // ── Filter helpers ──
  const inDateRange = (dateStr: string) => {
    const d = new Date(dateStr);
    if (effectiveDateFrom && isBefore(d, effectiveDateFrom)) return false;
    if (effectiveDateTo && isAfter(d, effectiveDateTo)) return false;
    return true;
  };

  const matchesChannel = (o: any) => channel === "all" || getChannel(o) === channel;

  // ── Filtered data ──
  const filteredOrders = useMemo(
    () => orders.filter((o) => inDateRange(o.created_at) && matchesChannel(o)),
    [orders, effectiveDateFrom, effectiveDateTo, channel]
  );

  const filteredOrderIds = useMemo(() => new Set(filteredOrders.map((o) => o.id)), [filteredOrders]);

  // Pagamentos e itens são sempre derivados do MESMO conjunto de pedidos filtrados
  const filteredPayments = useMemo(
    () => payments.filter((p) => filteredOrderIds.has(p.order_id)),
    [payments, filteredOrderIds]
  );

  const filteredItems = useMemo(
    () => orderItems.filter((i) => filteredOrderIds.has(i.order_id)),
    [orderItems, filteredOrderIds]
  );


  // ── KPIs ──
  const totalRevenue = filteredOrders.reduce((s, o) => s + Number(o.total), 0);
  const totalOrdersCount = filteredOrders.length;
  const avgTicket = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;
  const totalItemsSold = filteredItems.reduce((s, i) => s + i.quantity, 0);

  // ── Channel breakdown ──
  const channelBreakdown = useMemo(() => {
    const map: Record<string, { label: string; count: number; revenue: number; icon: any }> = {
      mesa: { label: "Mesa (garçom)", count: 0, revenue: 0, icon: Users },
      balcao: { label: "Balcão", count: 0, revenue: 0, icon: Store },
    };
    filteredOrders.forEach((o) => {
      const ch = getChannel(o);
      map[ch].count += 1;
      map[ch].revenue += Number(o.total);
    });
    return Object.values(map).filter((c) => c.count > 0);
  }, [filteredOrders]);

  // ── Daily revenue ──
  const dailyRevenue = useMemo(() => {
    const map = new Map<string, number>();
    filteredOrders.forEach((o) => {
      const day = format(new Date(o.created_at), "dd/MM", { locale: ptBR });
      map.set(day, (map.get(day) || 0) + Number(o.total));
    });
    return Array.from(map.entries()).map(([day, revenue]) => ({ day, revenue }));
  }, [filteredOrders]);

  // ── Hourly distribution ──
  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: `${String(i).padStart(2, "0")}h`, count: 0, revenue: 0 }));
    filteredOrders.forEach((o) => {
      const h = new Date(o.created_at).getHours();
      hours[h].count += 1;
      hours[h].revenue += Number(o.total);
    });
    return hours.filter((h) => h.count > 0);
  }, [filteredOrders]);

  // ── By product ──
  const byProduct = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number }>();
    filteredItems.forEach((i) => {
      const existing = map.get(i.product_name) || { name: i.product_name, qty: 0, revenue: 0 };
      existing.qty += i.quantity;
      existing.revenue += Number(i.price) * i.quantity;
      map.set(i.product_name, existing);
    });
    const arr = Array.from(map.values());
    return productSort === "revenue"
      ? arr.sort((a, b) => b.revenue - a.revenue)
      : arr.sort((a, b) => b.qty - a.qty);
  }, [filteredItems, productSort]);

  // ── By category ──
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

  // ── By payment method ──
  const byMethod = useMemo(() => {
    const map = new Map<string, { method: string; amount: number; count: number }>();
    filteredPayments.forEach((p) => {
      const label = methodLabels[p.method] || p.method;
      const existing = map.get(label) || { method: label, amount: 0, count: 0 };
      existing.amount += Number(p.amount);
      existing.count += 1;
      map.set(label, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.amount - a.amount);
  }, [filteredPayments]);

  // ── PIN screen ──
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
          <button
            onClick={() => window.history.back()}
            className="w-full rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) return <LoadingScreen />;

  const stats = [
    { label: "Faturamento", value: `R$ ${totalRevenue.toFixed(2)}`, icon: DollarSign },
    { label: "Pedidos", value: String(totalOrdersCount), icon: ShoppingBag },
    { label: "Ticket Médio", value: `R$ ${avgTicket.toFixed(2)}`, icon: Receipt },
    { label: "Itens Vendidos", value: String(totalItemsSold), icon: CalendarDays },
  ];

  const quickPeriods: { key: QuickPeriod; label: string }[] = [
    { key: "today", label: "Hoje" },
    { key: "7", label: "7 dias" },
    { key: "14", label: "14 dias" },
    { key: "30", label: "30 dias" },
    { key: "custom", label: "Personalizado" },
  ];

  const channels: { key: Channel; label: string; icon: any }[] = [
    { key: "all", label: "Todos", icon: TrendingUp },
    { key: "mesa", label: "Mesa", icon: Users },
    { key: "balcao", label: "Balcão", icon: Store },
  ];

  const hasData = filteredOrders.length > 0;

  return (
    <div className="p-4 md:p-6 h-full overflow-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">Relatórios</h1>

        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Quick period */}
          <div className="flex gap-1 rounded-md border bg-card p-1">
            {quickPeriods.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setQuickPeriod(p.key);
                  if (p.key !== "custom") {
                    setDateFrom(p.key === "today" ? new Date() : subDays(new Date(), parseInt(p.key)));
                    setDateTo(new Date());
                  }
                }}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  quickPeriod === p.key
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date pickers (always visible for custom, compact for others) */}
          {quickPeriod === "custom" && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "De"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">até</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {dateTo ? format(dateTo, "dd/MM/yyyy") : "Até"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Channel filter */}
          <div className="flex gap-1 rounded-md border bg-card p-1">
            {channels.map((c) => (
              <button
                key={c.key}
                onClick={() => setChannel(c.key)}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  channel === c.key
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <c.icon className="h-3 w-3" />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
          <p>Nenhum dado para os filtros selecionados.</p>
          <p className="text-sm mt-1">Ajuste o período ou canal de vendas.</p>
        </div>
      )}

      {hasData && (
        <>
          {/* Channel breakdown (only when "all") */}
          {channel === "all" && channelBreakdown.length > 1 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {channelBreakdown.map((ch) => (
                <div key={ch.label} className="rounded-lg border bg-card p-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent flex-shrink-0">
                    <ch.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{ch.label}</p>
                    <p className="font-semibold">R$ {ch.revenue.toFixed(2)}</p>
                    <p className="text-[10px] text-muted-foreground">{ch.count} pedido{ch.count !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Daily revenue chart */}
          {dailyRevenue.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="font-semibold mb-4">Faturamento Diário</h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(20 8% 22%)" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "hsl(36 10% 55%)" }} stroke="hsl(20 8% 22%)" />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(36 10% 55%)" }} stroke="hsl(20 8% 22%)" />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`R$ ${v.toFixed(2)}`, "Faturamento"]} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(38 80% 52%)" strokeWidth={2} dot={{ fill: "hsl(38 80% 52%)", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Hourly distribution */}
          {hourlyData.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Vendas por Horário
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(20 8% 22%)" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "hsl(36 10% 55%)" }} stroke="hsl(20 8% 22%)" />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(36 10% 55%)" }} stroke="hsl(20 8% 22%)" />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    formatter={(v: number, name: string) => [
                      name === "count" ? `${v} pedidos` : `R$ ${v.toFixed(2)}`,
                      name === "count" ? "Pedidos" : "Faturamento",
                    ]}
                  />
                  <Bar dataKey="count" fill="hsl(220 60% 50%)" radius={[4, 4, 0, 0]} name="count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Payment method + Category side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

          {/* Products ranking */}
          {byProduct.length > 0 && (
            <div className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Vendas por Produto</h3>
                <div className="flex gap-1 rounded-md border bg-secondary/50 p-0.5">
                  <button
                    onClick={() => setProductSort("revenue")}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      productSort === "revenue" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                    }`}
                  >
                    R$ Faturamento
                  </button>
                  <button
                    onClick={() => setProductSort("qty")}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
                      productSort === "qty" ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                    }`}
                  >
                    Quantidade
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ResponsiveContainer width="100%" height={Math.max(280, Math.min(byProduct.length * 35, 500))}>
                  <BarChart data={byProduct.slice(0, 12)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(20 8% 22%)" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: "hsl(36 10% 55%)" }}
                      stroke="hsl(20 8% 22%)"
                      tickFormatter={productSort === "revenue" ? (v) => `R$${v}` : undefined}
                    />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "hsl(36 10% 55%)" }} stroke="hsl(20 8% 22%)" width={110} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      formatter={(v: number) => [
                        productSort === "revenue" ? `R$ ${v.toFixed(2)}` : `${v} un`,
                        productSort === "revenue" ? "Faturamento" : "Quantidade",
                      ]}
                    />
                    <Bar dataKey={productSort === "revenue" ? "revenue" : "qty"} fill="hsl(38 80% 52%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>

                <div className="overflow-auto max-h-[500px]">
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
