import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Receipt,
  Loader2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export default function ReportsPage() {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["payments_report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, orders(status, created_at)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: topItems = [] } = useQuery({
    queryKey: ["top_items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("product_name, price, quantity");
      if (error) throw error;
      // Aggregate
      const map = new Map<string, { name: string; qty: number; revenue: number }>();
      data.forEach((i) => {
        const existing = map.get(i.product_name) || { name: i.product_name, qty: 0, revenue: 0 };
        existing.qty += i.quantity;
        existing.revenue += Number(i.price) * i.quantity;
        map.set(i.product_name, existing);
      });
      return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
    },
  });

  const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);
  const totalOrders = payments.length;
  const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Group by method for bar chart
  const byMethod = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] || 0) + Number(p.amount);
    return acc;
  }, {});
  const methodChart = Object.entries(byMethod).map(([method, amount]) => ({
    method: method === "cash" ? "Dinheiro" : method === "card" ? "Cartão" : "Pix",
    amount,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    { label: "Faturamento Total", value: `R$ ${totalRevenue.toFixed(2)}`, icon: DollarSign },
    { label: "Total de Pedidos", value: String(totalOrders), icon: ShoppingBag },
    { label: "Ticket Médio", value: `R$ ${avgTicket.toFixed(2)}`, icon: Receipt },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Relatórios</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {methodChart.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold mb-4">Faturamento por Método</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={methodChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(30 10% 82%)" />
                <XAxis dataKey="method" tick={{ fontSize: 12 }} stroke="hsl(0 0% 45%)" />
                <YAxis tick={{ fontSize: 12 }} stroke="hsl(0 0% 45%)" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(30 20% 96%)",
                    border: "1px solid hsl(30 10% 82%)",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="amount" fill="hsl(36 90% 44%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {topItems.length > 0 && (
          <div className="rounded-lg border bg-card p-4">
            <h3 className="font-semibold mb-4">Produtos Mais Vendidos</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Produto</th>
                  <th className="text-right py-2 font-medium">Qtd</th>
                  <th className="text-right py-2 font-medium">Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((p, i) => (
                  <tr key={p.name} className="border-b last:border-0">
                    <td className="py-2.5 flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-accent text-xs font-bold">
                        {i + 1}
                      </span>
                      {p.name}
                    </td>
                    <td className="py-2.5 text-right text-muted-foreground">{p.qty}</td>
                    <td className="py-2.5 text-right font-medium">R$ {p.revenue.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payments.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>Nenhum pagamento registrado ainda.</p>
          <p className="text-sm mt-1">Use o Caixa para registrar vendas.</p>
        </div>
      )}
    </div>
  );
}
