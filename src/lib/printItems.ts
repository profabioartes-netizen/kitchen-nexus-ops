// Helpers para enriquecer items de impressão com metadados de venda por peso.
// Quando um produto é vendido por peso, na impressão queremos:
//   QNT  -> "0,378 kg"
//   UNIT -> R$/kg configurado no produto
//   TOTAL -> price * quantity (mantido)
import { supabase } from "@/integrations/supabase/client";

export type EnrichedPrintItem = {
  product_name: string;
  quantity: number;
  price: number;
  complements?: string[];
  notes?: string | null;
  sale_type?: "unit" | "weight";
  price_per_kg?: number | null;
  grams?: number | null;
};

type RawItem = {
  product_id?: string | null;
  product_name: string;
  quantity: number;
  price: number;
  complements?: string[];
  notes?: string | null;
};

/** Extrai gramas do nome no padrão "Nome - 378g" ou "Nome - 0,378kg". */
export function extractGramsFromName(name: string): number | null {
  const s = String(name || "");
  // Tenta "0,348 kg" / "0.348kg"
  const mKg = s.match(/(\d+(?:[.,]\d+)?)\s*kg\s*$/i);
  if (mKg) {
    const n = parseFloat(mKg[1].replace(",", "."));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 1000);
  }
  // Fallback "378g"
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*g\s*$/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** Carrega sale_type/price_per_kg dos produtos referenciados e devolve uma versão enriquecida. */
export async function enrichItemsWithWeightInfo(items: RawItem[]): Promise<EnrichedPrintItem[]> {
  const ids = Array.from(new Set(items.map((i) => i.product_id).filter(Boolean))) as string[];
  let map: Record<string, { sale_type?: string | null; price_per_kg?: number | null }> = {};
  if (ids.length > 0) {
    try {
      const { data } = await supabase
        .from("products")
        .select("id, sale_type, price_per_kg")
        .in("id", ids);
      for (const p of data || []) {
        map[p.id] = { sale_type: (p as any).sale_type, price_per_kg: (p as any).price_per_kg };
      }
    } catch {
      // ignore — fallback sem enriquecimento
    }
  }

  return items.map((it) => {
    const meta = it.product_id ? map[it.product_id] : undefined;
    const isWeight = meta?.sale_type === "weight";
    if (!isWeight) {
      return {
        product_name: it.product_name,
        quantity: it.quantity,
        price: it.price,
        complements: it.complements,
        notes: it.notes ?? null,
        sale_type: "unit",
      };
    }
    const ppk = Number(meta?.price_per_kg ?? 0) || null;
    let grams = extractGramsFromName(it.product_name);
    if (!grams && ppk && ppk > 0) {
      grams = Math.round((Number(it.price) / ppk) * 1000);
    }
    return {
      product_name: it.product_name,
      quantity: it.quantity,
      price: it.price,
      complements: it.complements,
      notes: it.notes ?? null,
      sale_type: "weight",
      price_per_kg: ppk,
      grams,
    };
  });
}
