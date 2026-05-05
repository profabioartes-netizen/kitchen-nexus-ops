import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { X, Upload, Loader2, Trash2 } from "lucide-react";

interface ProductFormData {
  name: string;
  category_id: string;
  price: string;
  station: string;
  stock: string;
  active: boolean;
  visible_on_menu: boolean;
  featured_on_menu: boolean;
  prep_time_minutes: string;
  image_url: string;
  sale_type: "unit" | "weight";
  price_per_kg: string;
}

const emptyForm: ProductFormData = {
  name: "",
  category_id: "",
  price: "0,00",
  station: "",
  stock: "-1",
  active: true,
  visible_on_menu: true,
  featured_on_menu: false,
  prep_time_minutes: "15",
  image_url: "",
  sale_type: "unit",
  price_per_kg: "0,00",
};

interface Props {
  productId: string | null;
  onClose: () => void;
}

export function ProductFormDialog({ productId, onClose }: Props) {
  const queryClient = useQueryClient();
  const isEditing = !!productId;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ProductFormData>(emptyForm);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  // Initialize form when editing
  if (isEditing && existingProduct && !initialized) {
    const priceWithComma = Number(existingProduct.price).toFixed(2).replace('.', ',');
    const ppk = (existingProduct as any).price_per_kg;
    const ppkWithComma = ppk != null ? Number(ppk).toFixed(2).replace('.', ',') : "0,00";
    setForm({
      name: existingProduct.name,
      category_id: existingProduct.category_id || "",
      price: priceWithComma,
      station: existingProduct.station,
      stock: String(existingProduct.stock ?? -1),
      active: existingProduct.active,
      visible_on_menu: (existingProduct as any).visible_on_menu ?? true,
      featured_on_menu: (existingProduct as any).featured_on_menu ?? false,
      prep_time_minutes: String((existingProduct as any).prep_time_minutes ?? 15),
      image_url: (existingProduct as any).image_url || "",
      sale_type: ((existingProduct as any).sale_type === "weight" ? "weight" : "unit"),
      price_per_kg: ppkWithComma,
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png"];
    if (!validTypes.includes(file.type)) {
      toast.error("Formato inválido. Use JPEG, JPG ou PNG.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Arquivo muito grande. Máximo 5MB.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${ext}`;
      const filePath = `products/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      setForm((prev) => ({ ...prev, image_url: urlData.publicUrl }));
      toast.success("Imagem enviada!");
    } catch (err) {
      toast.error("Erro ao enviar imagem: " + (err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = () => {
    setForm((prev) => ({ ...prev, image_url: "" }));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const priceValue = parseFloat(form.price.replace(',', '.')) || 0;
      const ppkValue = parseFloat(form.price_per_kg.replace(',', '.')) || 0;
      const isWeight = form.sale_type === "weight";

      const payload: any = {
        name: form.name.trim(),
        category_id: form.category_id || null,
        // For weight products, store price_per_kg in `price` as fallback so any
        // legacy code reading `price` still has a meaningful value (per kg).
        price: isWeight ? ppkValue : priceValue,
        station: form.station,
        stock: parseInt(form.stock) || -1,
        active: form.active,
        visible_on_menu: form.visible_on_menu,
        featured_on_menu: form.featured_on_menu,
        prep_time_minutes: parseInt(form.prep_time_minutes) || 15,
        image_url: form.image_url || null,
        sale_type: form.sale_type,
        price_per_kg: isWeight ? ppkValue : null,
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
      <div className="w-full max-w-2xl rounded-lg border bg-background p-6 shadow-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            {isEditing ? "Editar Produto" : "Novo Produto"}
          </h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr,200px] gap-6">
          {/* Left: Form fields */}
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

            {/* Sale type */}
            <div>
              <label className="text-sm font-medium text-muted-foreground">Tipo de venda</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, sale_type: "unit" })}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    form.sale_type === "unit"
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-card hover:bg-secondary"
                  }`}
                >
                  Unidade
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, sale_type: "weight" })}
                  className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    form.sale_type === "weight"
                      ? "bg-accent text-accent-foreground border-accent"
                      : "bg-card hover:bg-secondary"
                  }`}
                >
                  Peso (gramas)
                </button>
              </div>
            </div>

            {/* Price & Station */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  {form.sale_type === "weight" ? "Valor por kg (R$)" : "Preço (R$)"}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.sale_type === "weight" ? form.price_per_kg : form.price}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    const cents = parseInt(digits, 10) || 0;
                    const formatted = (cents / 100).toFixed(2).replace('.', ',');
                    if (form.sale_type === "weight") {
                      setForm({ ...form, price_per_kg: formatted });
                    } else {
                      setForm({ ...form, price: formatted });
                    }
                  }}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="0,00"
                />
                {form.sale_type === "weight" && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Ex: 69,90 / kg. O peso é informado no PDV ao lançar.
                  </p>
                )}
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Categoria de Impressão</label>
                <select
                  value={form.station}
                  onChange={(e) => setForm({ ...form, station: e.target.value })}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Nenhuma (não imprime)</option>
                  <option value="Cozinha">Cozinha</option>
                  <option value="Bebidas">Bebidas</option>
                  <option value="Sobremesa">Sobremesa</option>
                  <option value="Caixa">Caixa</option>
                </select>
              </div>
            </div>

            {/* Stock, Prep Time & Active */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Estoque (-1 = ilimitado)</label>
                <input
                  type="number"
                  value={form.stock}
                  onChange={(e) => setForm({ ...form, stock: e.target.value })}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Tempo preparo (min)</label>
                <input
                  type="number"
                  min="1"
                  value={form.prep_time_minutes}
                  onChange={(e) => setForm({ ...form, prep_time_minutes: e.target.value })}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex flex-col gap-2 pb-1">
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
          </div>

          {/* Right: Product Image */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">Foto do Produto</label>
            <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-card overflow-hidden aspect-square flex items-center justify-center relative">
              {form.image_url ? (
                <>
                  <img
                    src={form.image_url}
                    alt="Produto"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="absolute top-1.5 right-1.5 rounded-full bg-destructive/90 text-destructive-foreground p-1 hover:bg-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <div className="text-center p-4">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                  <p className="text-xs text-muted-foreground">Sem foto</p>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full flex items-center justify-center gap-2 rounded-md border bg-card px-3 py-2 text-xs font-medium hover:bg-secondary disabled:opacity-50"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading ? "Enviando..." : "Enviar imagem"}
            </button>

            <p className="text-[10px] text-muted-foreground text-center leading-tight">
              Formatos: JPEG, JPG e PNG<br />
              Resolução ideal: <strong>400x400</strong> ou <strong>800x800</strong>
            </p>
          </div>
        </div>

        {/* Complement Groups */}
        {complementGroups.length > 0 && (
          <div className="mt-4 border-t pt-4">
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
