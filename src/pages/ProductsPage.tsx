import { useState } from "react";
import { Search, Plus, Edit2, Package } from "lucide-react";

interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  station: string;
  active: boolean;
}

const mockProducts: Product[] = [
  { id: "1", name: "Espresso", category: "Bebidas", price: 6.0, stock: -1, station: "Bar", active: true },
  { id: "2", name: "Cappuccino", category: "Bebidas", price: 9.5, stock: -1, station: "Bar", active: true },
  { id: "3", name: "Café Latte", category: "Bebidas", price: 10.0, stock: -1, station: "Bar", active: true },
  { id: "4", name: "Suco Natural", category: "Bebidas", price: 12.0, stock: 20, station: "Bar", active: true },
  { id: "5", name: "Croissant", category: "Lanches", price: 8.5, stock: 15, station: "Cozinha", active: true },
  { id: "6", name: "Panini Caprese", category: "Lanches", price: 22.0, stock: 10, station: "Cozinha", active: true },
  { id: "7", name: "Filé com Fritas", category: "Pratos", price: 45.0, stock: 8, station: "Cozinha", active: true },
  { id: "8", name: "Risoto de Cogumelos", category: "Pratos", price: 38.0, stock: 5, station: "Cozinha", active: true },
  { id: "9", name: "Tiramisù", category: "Sobremesas", price: 18.0, stock: 12, station: "Cozinha", active: true },
  { id: "10", name: "Brownie", category: "Sobremesas", price: 14.0, stock: 18, station: "Cozinha", active: false },
];

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [products] = useState<Product[]>(mockProducts);

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const categories = [...new Set(products.map((p) => p.category))];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Produtos</h1>
        <button className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90">
          <Plus className="h-4 w-4" />
          Novo Produto
        </button>
      </div>

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {categories.map((cat) => {
        const items = filtered.filter((p) => p.category === cat);
        if (items.length === 0) return null;
        return (
          <div key={cat} className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              {cat}
            </h2>
            <div className="rounded-lg border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/50">
                    <th className="text-left px-4 py-2 font-medium">Produto</th>
                    <th className="text-left px-4 py-2 font-medium">Estação</th>
                    <th className="text-right px-4 py-2 font-medium">Preço</th>
                    <th className="text-right px-4 py-2 font-medium">Estoque</th>
                    <th className="text-center px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((product) => (
                    <tr key={product.id} className="border-b last:border-0 hover:bg-secondary/30">
                      <td className="px-4 py-3 flex items-center gap-2">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{product.name}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{product.station}</td>
                      <td className="px-4 py-3 text-right">R$ {product.price.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        {product.stock === -1 ? "∞" : product.stock}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            product.active
                              ? "bg-status-free/10 text-status-free"
                              : "bg-destructive/10 text-destructive"
                          }`}
                        >
                          {product.active ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button className="rounded p-1 hover:bg-secondary">
                          <Edit2 className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
