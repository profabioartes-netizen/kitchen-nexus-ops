import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Edit2, Trash2, Package, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ProductFormDialog } from "@/components/ProductFormDialog";
import { CategoriesManager } from "@/components/CategoriesManager";
import { ComplementsManager } from "@/components/ComplementsManager";

type Tab = "products" | "categories" | "complements";

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("products");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name)")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products_all"] });
      queryClient.invalidateQueries({ queryKey: ["products_active"] });
      toast.success("Produto removido!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, p) => {
    const cat = p.categories?.name || "Sem categoria";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const tabs: { key: Tab; label: string }[] = [
    { key: "products", label: "Produtos" },
    { key: "categories", label: "Categorias" },
    { key: "complements", label: "Complementos" },
  ];

  return (
    <div className="p-6">
      {/* Tab bar */}
      <div className="flex items-center gap-6 mb-6 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "categories" && <CategoriesManager />}
      {activeTab === "complements" && <ComplementsManager />}

      {activeTab === "products" && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar produto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={() => {
                setEditingProductId(null);
                setFormOpen(true);
              }}
              className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 ml-4"
            >
              <Plus className="h-4 w-4" />
              Novo Produto
            </button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            Object.entries(grouped).map(([cat, items]) => (
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
                        <th className="px-4 py-2 w-24"></th>
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
                          <td className="px-4 py-3 text-right">R$ {Number(product.price).toFixed(2)}</td>
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
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setEditingProductId(product.id);
                                  setFormOpen(true);
                                }}
                                className="rounded p-1 hover:bg-secondary"
                              >
                                <Edit2 className="h-4 w-4 text-muted-foreground" />
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Remover "${product.name}"?`)) {
                                    deleteMutation.mutate(product.id);
                                  }
                                }}
                                className="rounded p-1 hover:bg-destructive/10 text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}

          {!isLoading && filtered.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhum produto encontrado
            </p>
          )}
        </>
      )}

      {/* Product form dialog */}
      {formOpen && (
        <ProductFormDialog
          productId={editingProductId}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
