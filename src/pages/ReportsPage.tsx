import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Receipt,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const weeklyData = [
  { day: "Seg", revenue: 1240 },
  { day: "Ter", revenue: 980 },
  { day: "Qua", revenue: 1560 },
  { day: "Qui", revenue: 1380 },
  { day: "Sex", revenue: 2100 },
  { day: "Sáb", revenue: 2850 },
  { day: "Dom", revenue: 1920 },
];

const hourlyData = [
  { hour: "10h", orders: 4 },
  { hour: "11h", orders: 8 },
  { hour: "12h", orders: 22 },
  { hour: "13h", orders: 18 },
  { hour: "14h", orders: 10 },
  { hour: "15h", orders: 6 },
  { hour: "16h", orders: 5 },
  { hour: "17h", orders: 7 },
  { hour: "18h", orders: 12 },
  { hour: "19h", orders: 28 },
  { hour: "20h", orders: 32 },
  { hour: "21h", orders: 24 },
  { hour: "22h", orders: 14 },
];

const topProducts = [
  { name: "Cappuccino", qty: 48, revenue: 456.0 },
  { name: "Filé com Fritas", qty: 22, revenue: 990.0 },
  { name: "Cerveja Artesanal", qty: 35, revenue: 630.0 },
  { name: "Panini Caprese", qty: 28, revenue: 616.0 },
  { name: "Tiramisù", qty: 19, revenue: 342.0 },
];

const stats = [
  { label: "Faturamento Hoje", value: "R$ 3.240", icon: DollarSign, trend: "+12%", up: true },
  { label: "Pedidos Hoje", value: "87", icon: ShoppingBag, trend: "+8%", up: true },
  { label: "Ticket Médio", value: "R$ 37,24", icon: Receipt, trend: "-3%", up: false },
  { label: "Clientes Hoje", value: "64", icon: Users, trend: "+15%", up: true },
];

export default function ReportsPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Relatórios</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <stat.icon className="h-5 w-5 text-muted-foreground" />
              <span
                className={`flex items-center gap-0.5 text-xs font-medium ${
                  stat.up ? "text-status-free" : "text-destructive"
                }`}
              >
                {stat.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {stat.trend}
              </span>
            </div>
            <p className="font-display text-2xl">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Weekly Revenue */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold mb-4">Faturamento Semanal</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(30 10% 82%)" />
              <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="hsl(0 0% 45%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(0 0% 45%)" />
              <Tooltip
                contentStyle={{
                  background: "hsl(30 20% 96%)",
                  border: "1px solid hsl(30 10% 82%)",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="revenue" fill="hsl(36 90% 44%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly Orders */}
        <div className="rounded-lg border bg-card p-4">
          <h3 className="font-semibold mb-4">Pedidos por Hora (Hoje)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(30 10% 82%)" />
              <XAxis dataKey="hour" tick={{ fontSize: 12 }} stroke="hsl(0 0% 45%)" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(0 0% 45%)" />
              <Tooltip
                contentStyle={{
                  background: "hsl(30 20% 96%)",
                  border: "1px solid hsl(30 10% 82%)",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
              />
              <Line
                type="monotone"
                dataKey="orders"
                stroke="hsl(36 90% 44%)"
                strokeWidth={2}
                dot={{ fill: "hsl(36 90% 44%)", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top Products */}
      <div className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold mb-4">Produtos Mais Vendidos (Semana)</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 font-medium">Produto</th>
              <th className="text-right py-2 font-medium">Qtd</th>
              <th className="text-right py-2 font-medium">Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {topProducts.map((p, i) => (
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
    </div>
  );
}
