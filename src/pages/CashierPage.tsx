import { useState } from "react";
import { Search, Plus, Minus, Trash2, CreditCard, Banknote } from "lucide-react";

interface OrderItem {
  id: string;
  name: string;
  price: number;
  qty: number;
}

const menuItems = [
  { id: "esp", name: "Espresso", price: 6.0, category: "Bebidas" },
  { id: "cap", name: "Cappuccino", price: 9.5, category: "Bebidas" },
  { id: "lat", name: "Café Latte", price: 10.0, category: "Bebidas" },
  { id: "suc", name: "Suco Natural", price: 12.0, category: "Bebidas" },
  { id: "agua", name: "Água Mineral", price: 4.0, category: "Bebidas" },
  { id: "cer", name: "Cerveja Artesanal", price: 18.0, category: "Bebidas" },
  { id: "cro", name: "Croissant", price: 8.5, category: "Lanches" },
  { id: "pan", name: "Panini Caprese", price: 22.0, category: "Lanches" },
  { id: "sal", name: "Salada Caesar", price: 28.0, category: "Pratos" },
  { id: "fil", name: "Filé com Fritas", price: 45.0, category: "Pratos" },
  { id: "ris", name: "Risoto de Cogumelos", price: 38.0, category: "Pratos" },
  { id: "tir", name: "Tiramisù", price: 18.0, category: "Sobremesas" },
  { id: "che", name: "Cheesecake", price: 16.0, category: "Sobremesas" },
  { id: "bro", name: "Brownie", price: 14.0, category: "Sobremesas" },
];

const categories = [...new Set(menuItems.map((i) => i.category))];

export default function CashierPage() {
  const [order, setOrder] = useState<OrderItem[]>([]);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]);

  const addItem = (item: (typeof menuItems)[0]) => {
    setOrder((prev) => {
      const existing = prev.find((o) => o.id === item.id);
      if (existing) {
        return prev.map((o) =>
          o.id === item.id ? { ...o, qty: o.qty + 1 } : o
        );
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setOrder((prev) =>
      prev
        .map((o) => (o.id === id ? { ...o, qty: o.qty + delta } : o))
        .filter((o) => o.qty > 0)
    );
  };

  const removeItem = (id: string) => {
    setOrder((prev) => prev.filter((o) => o.id !== id));
  };

  const subtotal = order.reduce((sum, o) => sum + o.price * o.qty, 0);

  const filtered = menuItems.filter(
    (i) =>
      i.category === activeCategory &&
      i.name.toLowerCase().includes(search.toLowerCase())
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

        {/* Category tabs */}
        <div className="flex gap-2 mb-4">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? "bg-accent text-accent-foreground"
                  : "bg-card text-foreground hover:bg-secondary"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Items grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 overflow-auto flex-1">
          {filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => addItem(item)}
              className="flex flex-col items-start rounded-lg border bg-card p-3 text-left transition-all hover:border-accent active:scale-[0.97]"
            >
              <span className="font-medium text-sm">{item.name}</span>
              <span className="text-accent font-semibold mt-1">
                R$ {item.price.toFixed(2)}
              </span>
            </button>
          ))}
        </div>
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
            <div
              key={item.id}
              className="flex items-center justify-between rounded-md border bg-background p-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  R$ {item.price.toFixed(2)} × {item.qty}
                </p>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={() => updateQty(item.id, -1)}
                  className="rounded p-1 hover:bg-secondary"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-6 text-center text-sm font-medium">
                  {item.qty}
                </span>
                <button
                  onClick={() => updateQty(item.id, 1)}
                  className="rounded p-1 hover:bg-secondary"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => removeItem(item.id)}
                  className="rounded p-1 hover:bg-destructive/10 text-destructive ml-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Total & pay */}
        <div className="border-t p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Subtotal</span>
            <span className="font-semibold">R$ {subtotal.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-display text-xl">TOTAL</span>
            <span className="font-display text-xl">
              R$ {subtotal.toFixed(2)}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button className="flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground py-3 font-medium hover:opacity-90 transition-opacity">
              <CreditCard className="h-4 w-4" />
              Cartão
            </button>
            <button className="flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground py-3 font-medium hover:opacity-90 transition-opacity">
              <Banknote className="h-4 w-4" />
              Dinheiro
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
