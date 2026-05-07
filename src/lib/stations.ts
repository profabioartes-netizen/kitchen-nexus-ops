// Catálogo de setores de impressão por tenant.
// Setores canônicos sempre disponíveis + os já existentes nas tabelas
// `printers` e `products`. Útil para alimentar checkboxes/selects.

import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_STATIONS = ["Caixa", "Cozinha", "Bar", "Sobremesa"] as const;

function normalize(s: string | null | undefined): string {
  return (s ?? "").trim();
}

export async function listKnownStations(): Promise<string[]> {
  const set = new Set<string>(DEFAULT_STATIONS as readonly string[]);
  const [{ data: pr }, { data: pd }, { data: ag }] = await Promise.all([
    supabase.from("printers").select("station").eq("active", true),
    supabase.from("products").select("station").eq("active", true),
    (supabase.from("print_agents") as any).select("station,stations").eq("active", true),
  ]);
  for (const r of pr ?? []) {
    const v = normalize((r as any).station);
    if (v) set.add(v);
  }
  for (const r of pd ?? []) {
    const v = normalize((r as any).station);
    if (v) set.add(v);
  }
  for (const r of ag ?? []) {
    const v = normalize((r as any).station);
    if (v) set.add(v);
    for (const s of ((r as any).stations as string[] | null) ?? []) {
      const vv = normalize(s);
      if (vv) set.add(vv);
    }
  }
  // ordena: Caixa primeiro, demais alfabéticas
  return Array.from(set).sort((a, b) => {
    if (a === "Caixa") return -1;
    if (b === "Caixa") return 1;
    return a.localeCompare(b, "pt-BR");
  });
}
