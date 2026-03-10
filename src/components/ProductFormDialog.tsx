import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X } from "lucide-react";

interface ProductFormData {
  name: string;
  category_id: string;
  price: string;
  station: string;
  stock: string;
  active: boolean;
  prep_time_minutes: string;
}

const emptyForm: ProductFormData = {
  name: "",
  category_id: "",
  price: "",
  station: "Cozinha",
  stock: "-1",
  active: true,
  prep_time_minutes: "15",
};

interface Props {
  productId: string | null; // null = create new
  onClose: () => void;
}

export function ProductFormDialog({ productId, onClose }: Props) {
  const queryClient = useQueryClient();
  const isEditing = !!productId;

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: complementGroups = [] } = useQuery({
    queryKey: ["complement_groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("complement_groups").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: linkedGroups = [] } = useQuery({
    queryKey: ["product_complement_groups", productId],
    enabled: isEditing,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_complement_groups")
        .select("group_id")
        .eq("product_id", productId!);
      if (error) throw error;
      return data.map((d) => d.group_id);
    },
  });

  const { data: existingProduct } = useQuery({
    queryKey: ["product_detail", productId],
    enabled: isEditing,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  // Initialize form when editing
  if (isEditing && existingProduct && !initialized) {
    setForm({
      name: existingProduct.name,
      category_id: existingProduct.category_id || "",
      price: String(existingProduct.price),
      station: existingProduct.station,
      stock: String(existingProduct.stock ?? -1),
      active: existingProduct.active,
      prep_time_minutes: String((existingProduct as any).prep_time_minutes ?? 15),
    });
    setSelectedGroups(linkedGroups);
    setInitialized(true);
  }

  if (!isEditing && !initialized) {
    setInitialized(true);
  }

  const toggleGroup = (gid: string) => {
    setSelectedGroups((prev) =>
      prev.includes(gid) ? prev.filter((g) => g !== gid) : [...prev, gid]
    );
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        category_id: form.category_id || null,
        price: parseFloat(form.price) || 0,
        station: form.station,
        stock: parseInt(form.stock) || -1,
        active: form.active,
      };

      let pid = productId;

      if (isEditing) {
        const { error } = await supabase.from("products").update(payload).eq("id", productId!);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select().single();
        if (error) throw error;
        pid = data.id;
      }

      // Sync complement groups
      if (pid) {
        await supabase.from("product_complement_groups").delete().eq("product_id", pid);
        if (selectedGroups.length > 0) {
          const links = selectedGroups.map((group_id) => ({ product_id: pid!, group_id }));
          const { error } = await supabase.from("product_complement_groups").insert(links);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products_all"] });
      queryClient.invalidateQueries({ queryKey: ["products_active"] });
      toast.success(isEditing ? "Produto atualizado!" : "Produto criado!");
      onClose();
    },
    onError: (err) => {
      toast.error("Erro: " + (err as Error).message);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
      <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {isEditing ? "Editar Produto" : "Novo Produto"}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Nome</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Nome do produto"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">Categoria</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Price & Station */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Preço (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Estação</label>
              <select
                value={form.station}
                onChange={(e) => setForm({ ...form, station: e.target.value })}
                className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="Cozinha">Cozinha</option>
                <option value="Bar">Bar</option>
              </select>
            </div>
          </div>

          {/* Stock & Active */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Estoque (-1 = ilimitado)</label>
              <input
                type="number"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: e.target.value })}
                className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="rounded border-input h-4 w-4 accent-accent"
                />
                <span className="text-sm font-medium">Ativo</span>
              </label>
            </div>
          </div>

          {/* Complement Groups */}
          {complementGroups.length > 0 && (
            <div>
              <label className="text-sm font-medium text-muted-foreground">Grupos de Complementos</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {complementGroups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGroup(g.id)}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                      selectedGroups.includes(g.id)
                        ? "bg-accent text-accent-foreground border-accent"
                        : "bg-card text-foreground hover:bg-secondary"
                    }`}
                  >
                    {g.name}
                    {g.required && <span className="text-[10px] ml-1 opacity-70">*</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary"
          >
            Cancelar
          </button>
          <button
            disabled={!form.name.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
