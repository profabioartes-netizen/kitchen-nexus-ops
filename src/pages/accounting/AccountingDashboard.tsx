import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Receipt, CreditCard } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useGoLiveDate } from "@/hooks/useGoLiveDate";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import LoadingScreen from "@/components/LoadingScreen";

type QuickPeriod = "today" | "7" | "30" | "custom";

const methodLabels: Record<string, string> = {
  cash: "Dinheiro", debit: "Débito", credit: "Crédito", pix: "Pix", card: "Cartão",
};

export default function AccountingDashboard() {
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>("today");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const { goLiveAt } = useGoLiveDate();

  const effectiveDateFrom = quickPeriod === "today" ? new Date() : quickPeriod === "7" ? subDays(new Date(), 7) : quickPeriod === "30" ? subDays(new Date(), 30) : dateFrom;
  const effectiveDateTo = quickPeriod === "custom" ? dateTo : new Date();

  const periodFilter = useMemo(() => {
    const from = effectiveDateFrom ? startOfDay(effectiveDateFrom).toISOString() : undefined;
    const to = effectiveDateTo ? endOfDay(effectiveDateTo).toISOString() : undefined;
    return { from, to };
  }, [effectiveDateFrom, effectiveDateTo]);

  const { data: orders = [], isLoading: lo } = useQuery({
    queryKey: ["acc_orders", goLiveAt, periodFilter],
    queryFn: async () => {
      let q = supabase.from("orders").select("id, total, status, created_at, waiter_name").in("status", ["closed", "finalized"]).gte("created_at", "2026-04-01T00:00:00.000Z");
      if (goLiveAt) q = q.gte("created_at", goLiveAt);
      if (periodFilter.from) q = q.gte("created_at", periodFilter.from);
      if (periodFilter.to) q = q.lte("created_at", periodFilter.to);
      const { data } = await q.order("created_at", { ascending: false });
      return data || [];
    },
  });

  const orderIds = orders.map((o: any) => o.id);

  const { data: payments = [], isLoading: lp } = useQuery({
    queryKey: ["acc_payments", orderIds],
    queryFn: async () => {
      if (!orderIds.length) return [];
      const { data } = await supabase.from("payments").select("order_id, method, amount").in("order_id", orderIds).is("voided_at", null);
      return data || [];
    },
    enabled: orderIds.length > 0,
  });

  const loading = lo || lp;

  const stats = useMemo(() => {
    const totalSales = orders.length;
    const totalRevenue = orders.reduce((s: number, o: any) => s + Number(o.total), 0);

    const byMethod: Record<string, number> = {};
    payments.forEach((p: any) => {
      const label = methodLabels[p.method] || p.method;
      byMethod[label] = (byMethod[label] || 0) + Number(p.amount);
    });

    return { totalSales, totalRevenue, byMethod };
  }, [orders, payments]);

  if (loading) return <LoadingScreen mode="inline" />;

  const kpis = [
    { label: "Vendas", value: stats.totalSales, icon: Receipt, color: "text-blue-500" },
    { label: "Faturamento", value: `R$ ${stats.totalRevenue.toFixed(2)}`, icon: DollarSign, color: "text-green-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard Contábil</h1>
        <div className="flex flex-wrap gap-1.5">
          {([["today", "Hoje"], ["7", "7 dias"], ["30", "30 dias"], ["custom", "Personalizado"]] as const).map(([k, l]) => (
            <Button
              key={k}
              size="sm"
              variant={quickPeriod === k ? "default" : "outline"}
              onClick={() => setQuickPeriod(k)}
              className="text-xs h-8"
            >
              {l}
            </Button>
          ))}
        </div>
      </div>

      {quickPeriod === "custom" && (
        <div className="flex flex-wrap gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">
                De: {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "..."}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} /></PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">
                Até: {dateTo ? format(dateTo, "dd/MM/yyyy") : "..."}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} /></PopoverContent>
          </Popover>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border bg-card p-4 space-y-1">
            <div className="flex items-center gap-1.5">
              <k.icon className={`h-4 w-4 ${k.color}`} />
              <span className="text-[11px] text-muted-foreground">{k.label}</span>
            </div>
            <p className="text-lg font-semibold">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Payment breakdown */}
      <div className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-medium mb-3 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          Total por Forma de Pagamento
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(stats.byMethod).map(([method, amount]) => (
            <div key={method} className="rounded-md bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">{method}</p>
              <p className="text-sm font-semibold">R$ {amount.toFixed(2)}</p>
            </div>
          ))}
          {Object.keys(stats.byMethod).length === 0 && (
            <p className="text-xs text-muted-foreground col-span-full">Nenhum pagamento no período</p>
          )}
        </div>
      </div>
    </div>
  );
}
