// Cliente para o Agente Local de impressão (HTTP em http://127.0.0.1:8080).
// Uso: tenta enviar o payload ao agente; se offline/erro, faz fallback para
// impressão nativa (printViaBrowser ou window.print()).

import { printViaBrowser, type BrowserPrintPayload } from "./browserPrint";

export const LOCAL_AGENT_URL = "http://127.0.0.1:8080";
const PRINT_ENDPOINT = `${LOCAL_AGENT_URL}/print`;
const PING_ENDPOINT = `${LOCAL_AGENT_URL}/ping`;

export type LocalAgentResult =
  | { ok: true; via: "agent" }
  | { ok: true; via: "browser" }
  | { ok: false; via: "browser"; error: string };

/**
 * Tenta enviar o payload de impressão para o Agente Local.
 * Se o agente estiver offline (erro de conexão), faz fallback para impressão
 * nativa via printViaBrowser (que dispara o window.print do iframe).
 */
export async function printViaLocalAgent(
  payload: BrowserPrintPayload,
  timeoutMs = 2500,
): Promise<LocalAgentResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const r = await fetch(PRINT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      mode: "cors",
    });
    clearTimeout(timer);
    if (r.ok) return { ok: true, via: "agent" };
    // Status != 200 → considera falha e cai no fallback nativo
    const ok = printViaBrowser(payload);
    return ok
      ? { ok: true, via: "browser" }
      : { ok: false, via: "browser", error: `HTTP ${r.status}` };
  } catch (e) {
    clearTimeout(timer);
    // Erro de conexão (agente offline) → fallback nativo
    const ok = printViaBrowser(payload);
    return ok
      ? { ok: true, via: "browser" }
      : { ok: false, via: "browser", error: (e as Error).message };
  }
}

/**
 * Verifica se o agente local está online. Tenta /ping primeiro; se não houver,
 * cai para uma chamada HEAD em /. Qualquer resposta HTTP conta como "online".
 */
export async function pingLocalAgent(timeoutMs = 1500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(PING_ENDPOINT, {
      method: "GET",
      signal: controller.signal,
      mode: "cors",
      cache: "no-store",
    });
    clearTimeout(timer);
    return r.ok;
  } catch {
    clearTimeout(timer);
    // Fallback: tenta a raiz
    try {
      const controller2 = new AbortController();
      const t2 = setTimeout(() => controller2.abort(), timeoutMs);
      const r2 = await fetch(LOCAL_AGENT_URL, {
        method: "GET",
        signal: controller2.signal,
        mode: "no-cors",
        cache: "no-store",
      });
      clearTimeout(t2);
      // no-cors retorna opaque; se chegou aqui sem throw, o socket respondeu.
      return true;
    } catch {
      return false;
    }
  }
}
