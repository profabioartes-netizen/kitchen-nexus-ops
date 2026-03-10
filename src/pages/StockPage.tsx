import { Search, AlertTriangle } from "lucide-react";
import { useState } from "react";

interface StockItem {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  minStock: number;
  unit: string;
  lastUpdated: string;
}

const mockStock: StockItem[] = [
  { id: "1", name: "Café em Grãos", category: "Insumos", currentStock: 5, minStock: 3, unit: "kg", lastUpdated: "Hoje" },
  { id: "2", name: "Leite Integral", category: "Insumos", currentStock: 8, minStock: 10, unit: "L", lastUpdated: "Hoje" },
  { id: "3", name: "Farinha de Trigo", category: "Insumos", currentStock: 12, minStock: 5, unit: "kg", lastUpdated: "Ontem" },
  { id: "4", name: "Manteiga", category: "Insumos", currentStock: 2, minStock: 3, unit: "kg", lastUpdated: "Hoje" },
  { id: "5", name: "Cerveja Artesanal IPA", category: "Bebidas", currentStock: 24, minStock: 12, unit: "un", lastUpdated: "Ontem" },
  { id: "6", name: "Vinho Tinto Reserva", category: "Bebidas", currentStock: 6, minStock: 4, unit: "un", lastUpdated: "3 dias" },
  { id: "7", name: "Água Mineral 500ml", category: "Bebidas", currentStock: 48, minStock: 24, unit: "un", lastUpdated: "Hoje" },
  { id: "8", name: "Filé Mignon", category: "Proteínas", currentStock: 3, minStock: 5, unit: "kg", lastUpdated: "Hoje" },
  { id: "9", name: "Peito de Frango", category: "Proteínas", currentStock: 7, minStock: 4, unit: "kg", lastUpdated: "Ontem" },
  { id: "10", name: "Cogumelos Frescos", category: "Hortifruti", currentStock: 1, minStock: 2, unit: "kg", lastUpdated: "Hoje" },
];

export default function StockPage() {
  const [search, setSearch] = useState("");

  const filtered = mockStock.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const lowStock = mockStock.filter((i) => i.currentStock <= i.minStock);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Controle de Estoque</h1>
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-lg border border-accent bg-accent/5 p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-accent" />
            <span className="text-sm font-semibold text-accent">
              {lowStock.length} item(s) abaixo do estoque mínimo
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map((item) => (
              <span key={item.id} className="rounded-md bg-accent/10 px-2 py-1 text-xs font-medium">
                {item.name} ({item.currentStock}{item.unit})
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-secondary/50">
              <th className="text-left px-4 py-2 font-medium">Item</th>
              <th className="text-left px-4 py-2 font-medium">Categoria</th>
              <th className="text-right px-4 py-2 font-medium">Estoque</th>
              <th className="text-right px-4 py-2 font-medium">Mínimo</th>
              <th className="text-left px-4 py-2 font-medium">Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const isLow = item.currentStock <= item.minStock;
              return (
                <tr key={item.id} className="border-b last:border-0 hover:bg-secondary/30">
                  <td className="px-4 py-3 font-medium flex items-center gap-2">
                    {isLow && <AlertTriangle className="h-3.5 w-3.5 text-accent" />}
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${isLow ? "text-accent" : ""}`}>
                    {item.currentStock} {item.unit}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {item.minStock} {item.unit}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.lastUpdated}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
