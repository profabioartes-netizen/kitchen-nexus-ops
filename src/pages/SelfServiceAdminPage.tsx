import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalize } from "@/lib/normalize";
import { toast } from "sonner";
import {
  Search,
  Eye,
  EyeOff,
  Package,
  Loader2,
  Smartphone,
  Minus,
  Plus,
  Infinity,
} from "lucide-react";

export default function SelfServiceAdminPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name, sort_order)")
        .order("sort_order", { ascending: true })
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("products").update({ active } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products_all"] });
      queryClient.invalidateQueries({ queryKey: ["products_active"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const stockMutation = useMutation({
    mutationFn: async ({ id, stock }: { id: string; stock: number }) => {
      const { error } = await supabase.from("products").update({ stock } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products_all"] });
      queryClient.invalidateQueries({ queryKey: ["products_active"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const filtered = products.filter((p) =>
    normalize(p.name).includes(normalize(search))
  );

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, p) => {
    const cat = (p as any).categories?.name || "Sem categoria";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  const activeCount = products.filter((p) => p.active).length;
  const outOfStockCount = products.filter((p) => p.stock !== null && p.stock === 0).length;

  return (
    <div className="p-6 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Smartphone className="h-5 w-5 text-accent" />
        <h1 className="text-lg font-semibold text-foreground">Cardápio do Cliente</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Gerencie quais produtos aparecem no autoatendimento e controle o estoque.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Total</p>
          <p className="text-xl font-bold text-foreground">{products.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Visíveis</p>
          <p className="text-xl font-bold text-status-free">{activeCount}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Esgotados</p>
          <p className="text-xl font-bold text-destructive">{outOfStockCount}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border bg-card pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Products by category */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        Object.entries(grouped)
          .sort(([catA, itemsA], [catB, itemsB]) => {
            if (catA === "Sem categoria") return 1;
            if (catB === "Sem categoria") return -1;
            const orderA = (itemsA[0] as any)?.categories?.sort_order ?? 999;
            const orderB = (itemsB[0] as any)?.categories?.sort_order ?? 999;
            return orderA - orderB;
          })
          .map(([cat, items]) => (
            <div key={cat} className="mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {cat}
              </h2>
              <div className="space-y-2">
                {items.map((product) => {
                  const isOutOfStock = product.stock !== null && product.stock === 0;
                  const stockValue = product.stock ?? -1;
                  const isUnlimited = stockValue === -1;

                  return (
                    <div
                      key={product.id}
                      className={`rounded-lg border bg-card p-4 flex items-center gap-4 transition-opacity ${
                        !product.active ? "opacity-50" : ""
                      }`}
                    >
                      {/* Product image or icon */}
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-12 w-12 rounded-md object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="h-12 w-12 rounded-md bg-secondary flex items-center justify-center flex-shrink-0">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {product.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          R$ {Number(product.price).toFixed(2)}
                        </p>
                        {isOutOfStock && (
                          <span className="text-[10px] font-medium text-destructive">
                            Esgotado
                          </span>
                        )}
                      </div>

                      {/* Stock controls */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isUnlimited ? (
                          <button
                            onClick={() => {
                              stockMutation.mutate({ id: product.id, stock: 10 });
                              toast.info("Estoque definido como 10. Ajuste conforme necessário.");
                            }}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border rounded px-2 py-1 transition-colors"
                            title="Clique para definir estoque limitado"
                          >
                            <Infinity className="h-3.5 w-3.5" />
                            <span>∞</span>
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() =>
                                stockMutation.mutate({
                                  id: product.id,
                                  stock: Math.max(0, stockValue - 1),
                                })
                              }
                              className="h-7 w-7 rounded border flex items-center justify-center hover:bg-secondary transition-colors"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="text-sm font-medium w-8 text-center text-foreground">
                              {stockValue}
                            </span>
                            <button
                              onClick={() =>
                                stockMutation.mutate({
                                  id: product.id,
                                  stock: stockValue + 1,
                                })
                              }
                              className="h-7 w-7 rounded border flex items-center justify-center hover:bg-secondary transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => {
                                stockMutation.mutate({ id: product.id, stock: -1 });
                                toast.info("Estoque ilimitado.");
                              }}
                              className="text-[10px] text-muted-foreground hover:text-foreground ml-1"
                              title="Voltar para estoque ilimitado"
                            >
                              <Infinity className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Visibility toggle */}
                      <button
                        onClick={() => {
                          toggleMutation.mutate({ id: product.id, active: !product.active });
                          toast.success(
                            product.active ? "Produto ocultado do cardápio" : "Produto visível no cardápio"
                          );
                        }}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors flex-shrink-0 ${
                          product.active
                            ? "bg-status-free/10 text-status-free hover:bg-status-free/20"
                            : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                        }`}
                      >
                        {product.active ? (
                          <>
                            <Eye className="h-3.5 w-3.5" />
                            Visível
                          </>
                        ) : (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            Oculto
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
      )}

      {!isLoading && filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Nenhum produto encontrado
        </p>
      )}
    </div>
  );
}
