// Preferência de impressão por terminal (persistida em localStorage).
// "native"  → imprime sempre pelo navegador (window.print) sem perguntar
// "agent"   → envia sempre para o HuskyPDV Agent
// "ask"     → comportamento padrão (tenta agent, oferece fallback)

export type PrintMode = "native" | "agent" | "ask";

const KEY = "huskypdv:printMode";

export function getPrintMode(): PrintMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "native" || v === "agent" || v === "ask") return v;
  } catch {}
  return "native";
}

export function setPrintMode(mode: PrintMode) {
  try {
    localStorage.setItem(KEY, mode);
  } catch {}
}
