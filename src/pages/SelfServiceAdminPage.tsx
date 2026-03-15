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
  ChevronDown,
  ChevronRight,
  Minus,
  Plus,
  Infinity,
  Pencil,
  X,
  Upload,
  Trash2,
} from "lucide-react";

type Product = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  stock: number | null;
  image_url: string | null;
  description?: string | null;
  sort_order: number | null;
  categories?: { name: string; sort_order: number | null } | null;
};

export default function SelfServiceAdminPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editImage, setEditImage] = useState("");
  const [uploading, setUploading] = useState(false);

  const [activeSection, setActiveSection] = useState<"produtos" | "complementos">("produtos");
  const [expandedCompGroup, setExpandedCompGroup] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, categories(name, sort_order)")
        .order("sort_order", { ascending: true })
        .order("name");
      if (error) throw error;
      return data as unknown as Product[];
    },
  });

  const { data: compGroups = [] } = useQuery({
    queryKey: ["complement_groups_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("complement_groups")
        .select("*, complements(*)")
        .order("name");
      if (error) throw error;
      return data.map((g: any) => ({
        ...g,
        complements: [...(g.complements || [])].sort(
          (a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        ),
      }));
    },
  });

  const toggleCompMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("complements").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["complement_groups_admin"] });
      queryClient.invalidateQueries({ queryKey: ["complement_groups"] });
    },
    onError: (err) => toast.error((err as Error).message),
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

  const updateMutation = useMutation({
    mutationFn: async ({ id, description, image_url }: { id: string; description: string; image_url: string }) => {
      const { error } = await supabase
        .from("products")
        .update({ description, image_url: image_url || null } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products_all"] });
      queryClient.invalidateQueries({ queryKey: ["products_active"] });
      setEditingId(null);
      toast.success("Produto atualizado!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const handleStartEdit = (product: Product) => {
    setEditingId(product.id);
    setEditDesc((product as any).description || "");
    setEditImage(product.image_url || "");
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);
      setEditImage(urlData.publicUrl);
      toast.success("Imagem enviada!");
    } catch (err) {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  const filtered = products.filter((p) =>
    normalize(p.name).includes(normalize(search))
  );

  const grouped = filtered.reduce<Record<string, Product[]>>((acc, p) => {
    const cat = p.categories?.name || "Sem categoria";
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
        Gerencie visibilidade, estoque, imagens e descrições dos produtos no autoatendimento.
      </p>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 rounded-lg bg-secondary/50 p-1 w-fit">
        <button
          onClick={() => setActiveSection("produtos")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeSection === "produtos"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package className="h-4 w-4" />
          Produtos
        </button>
        <button
          onClick={() => setActiveSection("complementos")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeSection === "complementos"
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Complementos
        </button>
      </div>

      {activeSection === "produtos" && (
        <>
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
            const orderA = itemsA[0]?.categories?.sort_order ?? 999;
            const orderB = itemsB[0]?.categories?.sort_order ?? 999;
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
                  const isEditing = editingId === product.id;

                  return (
                    <div
                      key={product.id}
                      className={`rounded-lg border bg-card transition-opacity ${
                        !product.active ? "opacity-50" : ""
                      }`}
                    >
                      {/* Main row */}
                      <div className="p-4 flex items-center gap-4">
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
                          {(product as any).description && (
                            <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                              {(product as any).description}
                            </p>
                          )}
                          {isOutOfStock && (
                            <span className="text-[10px] font-medium text-destructive">
                              Esgotado
                            </span>
                          )}
                        </div>

                        {/* Edit button */}
                        <button
                          onClick={() => isEditing ? setEditingId(null) : handleStartEdit(product)}
                          className="h-8 w-8 rounded-md border flex items-center justify-center hover:bg-secondary transition-colors flex-shrink-0"
                          title="Editar imagem e descrição"
                        >
                          {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5 text-muted-foreground" />}
                        </button>

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

                      {/* Edit panel (expandable) */}
                      {isEditing && (
                        <div className="border-t px-4 py-4 space-y-4 bg-secondary/30">
                          {/* Image */}
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Imagem</label>
                            <div className="flex items-start gap-3">
                              {editImage ? (
                                <div className="relative">
                                  <img src={editImage} alt="" className="h-20 w-20 rounded-md object-cover" />
                                  <button
                                    onClick={() => setEditImage("")}
                                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="h-20 w-20 rounded-md bg-secondary border-2 border-dashed border-border flex items-center justify-center">
                                  <Package className="h-6 w-6 text-muted-foreground" />
                                </div>
                              )}
                              <div className="flex flex-col gap-2">
                                <label className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer border rounded-md px-3 py-1.5 transition-colors">
                                  <Upload className="h-3.5 w-3.5" />
                                  {uploading ? "Enviando..." : "Enviar imagem"}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleImageUpload(file);
                                    }}
                                  />
                                </label>
                                <input
                                  type="text"
                                  value={editImage}
                                  onChange={(e) => setEditImage(e.target.value)}
                                  placeholder="Ou cole uma URL de imagem..."
                                  className="rounded-md border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring w-64"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Description */}
                          <div>
                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                              Descrição (visível no cardápio do cliente)
                            </label>
                            <textarea
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              rows={2}
                              maxLength={200}
                              placeholder="Ex: Pão brioche, hambúrguer artesanal 180g, queijo cheddar, alface e tomate..."
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">{editDesc.length}/200</p>
                          </div>

                          {/* Save */}
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1.5 text-xs rounded-md border hover:bg-secondary transition-colors"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() =>
                                updateMutation.mutate({
                                  id: product.id,
                                  description: editDesc,
                                  image_url: editImage,
                                })
                              }
                              disabled={updateMutation.isPending}
                              className="px-4 py-1.5 text-xs rounded-md bg-accent text-accent-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                              {updateMutation.isPending ? "Salvando..." : "Salvar"}
                            </button>
                          </div>
                        </div>
                      )}
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
