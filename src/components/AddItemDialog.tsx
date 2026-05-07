import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { X, Plus, Minus, StickyNote, Check } from "lucide-react";

type Product = {
  id: string;
  name: string;
  price: number;
  station: string;
  category_id: string | null;
  sale_type?: "unit" | "weight" | null;
  price_per_kg?: number | null;
};

type SelectedComplement = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

export type AddItemPayload = {
  product: Product;
  quantity: number;
  notes: string;
  complements: SelectedComplement[];
  complementsTotal: number;
  // Weight-sale overrides
  grams?: number;
  unitPriceOverride?: number;
  productNameOverride?: string;
};

interface AddItemDialogProps {
  product: Product | null;
  onClose: () => void;
  onAdd: (payload: AddItemPayload) => void;
  isPending?: boolean;
}

export default function AddItemDialog({ product, onClose, onAdd, isPending }: AddItemDialogProps) {
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [selectedComplements, setSelectedComplements] = useState<SelectedComplement[]>([]);
  // Peso em KG (string para preservar formatação local com vírgula/ponto)
  const [weightKg, setWeightKg] = useState<string>("");

  const isWeight = product?.sale_type === "weight";
  const pricePerKg = Number(product?.price_per_kg ?? product?.price ?? 0);

  useEffect(() => {
    if (product) {
      setQuantity(1);
      setNotes("");
      setSelectedComplements([]);
      setWeightKg("");
    }
  }, [product]);

  // Fetch complement groups linked to this product
  const { data: productGroups = [] } = useQuery({
    queryKey: ["product_complement_groups", product?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_complement_groups")
        .select("group_id")
        .eq("product_id", product!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!product?.id,
  });

  const groupIds = productGroups.map((pg) => pg.group_id);

  const { data: complementGroups = [] } = useQuery({
    queryKey: ["complement_groups_for_product", groupIds.join(",")],
    queryFn: async () => {
      if (groupIds.length === 0) return [];
      const { data, error } = await supabase
        .from("complement_groups")
        .select("*")
        .in("id", groupIds)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: groupIds.length > 0,
  });

  const { data: allComplements = [] } = useQuery({
    queryKey: ["complements_for_groups", groupIds.join(",")],
    queryFn: async () => {
      if (groupIds.length === 0) return [];
      const { data, error } = await supabase
        .from("complements")
        .select("*")
        .in("group_id", groupIds)
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: groupIds.length > 0,
  });

  if (!product) return null;

  const hasComplements = complementGroups.length > 0;

  const toggleComplement = (comp: { id: string; name: string; price: number }, groupId: string) => {
    const group = complementGroups.find((g) => g.id === groupId);
    const maxSelect = group?.max_select ?? 1;
    const existing = selectedComplements.find((c) => c.id === comp.id);

    if (existing) {
      setSelectedComplements((prev) => prev.filter((c) => c.id !== comp.id));
    } else {
      // Count how many from this group are already selected
      const groupComplements = allComplements.filter((c) => c.group_id === groupId);
      const groupSelectedCount = selectedComplements.filter((sc) =>
        groupComplements.some((gc) => gc.id === sc.id)
      ).length;

      if (groupSelectedCount >= maxSelect) {
        // Replace the first selected from this group
        const firstFromGroup = selectedComplements.find((sc) =>
          groupComplements.some((gc) => gc.id === sc.id)
        );
        setSelectedComplements((prev) => [
          ...prev.filter((c) => c.id !== firstFromGroup?.id),
          { id: comp.id, name: comp.name, price: Number(comp.price), quantity: 1 },
        ]);
      } else {
        setSelectedComplements((prev) => [
          ...prev,
          { id: comp.id, name: comp.name, price: Number(comp.price), quantity: 1 },
        ]);
      }
    }
  };

  // Aceita vírgula ou ponto como separador decimal
  const weightKgNum = parseFloat((weightKg || "").replace(",", ".")) || 0;
  const gramsNum = Math.round(weightKgNum * 1000);
  const weightTotal = isWeight ? weightKgNum * pricePerKg : 0;
  const weightTotalRounded = Number(weightTotal.toFixed(2));

  const complementsTotal = selectedComplements.reduce((s, c) => s + c.price * c.quantity, 0);
  const itemTotal = isWeight
    ? weightTotalRounded
    : (Number(product.price) + complementsTotal) * quantity;

  const handleAdd = () => {
    if (isWeight) {
      if (gramsNum <= 0) return;
      const kgLabel = weightKgNum.toFixed(3).replace(".", ",");
      onAdd({
        product,
        quantity: 1,
        notes: notes.trim(),
        complements: [],
        complementsTotal: 0,
        grams: gramsNum,
        unitPriceOverride: weightTotalRounded,
        productNameOverride: `${product.name} - ${kgLabel}kg`,
      });
      return;
    }
    onAdd({
      product,
      quantity,
      notes: notes.trim(),
      complements: selectedComplements,
      complementsTotal,
    });
  };

  // Check if required groups are satisfied
  const requiredGroupsSatisfied = complementGroups
    .filter((g) => g.required)
    .every((g) => {
      const groupComps = allComplements.filter((c) => c.group_id === g.id);
      const selected = selectedComplements.filter((sc) => groupComps.some((gc) => gc.id === sc.id));
      return selected.length >= g.min_select;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
      <div className="w-full max-w-md rounded-lg border bg-background shadow-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="font-semibold text-base">{product.name}</h3>
            <p className="text-sm text-accent font-medium">
              {isWeight
                ? `R$ ${pricePerKg.toFixed(2)} / kg`
                : `R$ ${Number(product.price).toFixed(2)}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          {/* Quantity OR Weight */}
          {isWeight ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Peso (gramas)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={grams}
                  onChange={(e) => setGrams(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Ex: 450"
                  className="mt-1.5 w-full rounded-md border bg-card px-3 py-2.5 text-base font-semibold outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border bg-muted/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Valor por kg</p>
                  <p className="font-semibold">R$ {pricePerKg.toFixed(2)}</p>
                </div>
                <div className="rounded-md border bg-accent/10 border-accent/30 px-3 py-2">
                  <p className="text-[10px] text-muted-foreground uppercase">Total</p>
                  <p className="font-semibold text-accent">R$ {weightTotalRounded.toFixed(2)}</p>
                </div>
              </div>
              {gramsNum > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  ({gramsNum}g ÷ 1000) × R$ {pricePerKg.toFixed(2)} = R$ {weightTotalRounded.toFixed(2)}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quantidade</label>
              <div className="flex items-center gap-3 mt-1.5">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="rounded-md border p-2 hover:bg-secondary"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-lg font-semibold w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => q + 1)}
                  className="rounded-md border p-2 hover:bg-secondary"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Complements */}
          {!isWeight && hasComplements && complementGroups.map((group) => {
            const groupComps = allComplements.filter((c) => c.group_id === group.id);
            if (groupComps.length === 0) return null;
            return (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {group.name}
                  </label>
                  {group.required && (
                    <span className="text-[10px] bg-destructive/10 text-destructive rounded px-1.5 py-0.5 font-medium">
                      Obrigatório
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {group.min_select > 0 ? `Mín: ${group.min_select}` : ""}{" "}
                    Máx: {group.max_select}
                  </span>
                </div>
                <div className="space-y-1">
                  {groupComps.map((comp) => {
                    const isSelected = selectedComplements.some((c) => c.id === comp.id);
                    return (
                      <button
                        key={comp.id}
                        onClick={() => toggleComplement(comp, group.id)}
                        className={`w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors ${
                          isSelected
                            ? "border-accent bg-accent/10"
                            : "hover:bg-secondary"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`h-4 w-4 rounded border flex items-center justify-center ${
                              isSelected ? "bg-accent border-accent" : "border-muted-foreground/30"
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3 text-accent-foreground" />}
                          </div>
                          <span>{comp.name}</span>
                        </div>
                        {Number(comp.price) > 0 && (
                          <span className="text-xs text-muted-foreground">
                            + R$ {Number(comp.price).toFixed(2)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" />
              Observações
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: Sem cebola, bem passado..."
              rows={2}
              className="w-full mt-1.5 rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-semibold">R$ {itemTotal.toFixed(2)}</span>
          </div>
          {complementsTotal > 0 && (
            <p className="text-[10px] text-muted-foreground">
              (Produto R$ {Number(product.price).toFixed(2)} + Complementos R$ {complementsTotal.toFixed(2)}) × {quantity}
            </p>
          )}
          <button
            onClick={handleAdd}
            disabled={isPending || (isWeight ? gramsNum <= 0 : (hasComplements && !requiredGroupsSatisfied))}
            className="w-full rounded-md bg-accent text-accent-foreground py-3 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? "Adicionando..." : `Adicionar · R$ ${itemTotal.toFixed(2)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
