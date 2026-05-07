// Cliente para o HuskyPDV Print Agent (Python/Flask em http://127.0.0.1:8080).
// Envia o cupom já formatado como texto monoespaçado (RAW) para o agente.
// Se o agente estiver offline, faz fallback para impressão nativa pelo navegador.

import { printViaBrowser, type BrowserPrintPayload } from "./browserPrint";
import { formatReceiptText } from "./receiptText";

export const LOCAL_AGENT_URL = "http://127.0.0.1:8080";
const PRINT_ENDPOINT = `${LOCAL_AGENT_URL}/print`;
const PING_ENDPOINT = `${LOCAL_AGENT_URL}/ping`;

export type LocalAgentResult =
  | { ok: true; via: "agent" }
  | { ok: true; via: "browser" }
  | { ok: false; via: "browser"; error: string };

export type AgentPingInfo = {
  online: boolean;
  printer?: string;
  version?: string;
};

/**
 * Tenta enviar o cupom para o Print Agent. Em caso de erro/timeout,
 * cai para `printViaBrowser` (window.print via iframe oculto).
 */
export async function printViaLocalAgent(
  payload: BrowserPrintPayload,
  timeoutMs = 2500,
): Promise<LocalAgentResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const content = formatReceiptText(payload);
    console.info("[PrintAgent] POST", PRINT_ENDPOINT, { bytes: content.length });
    const r = await fetch(PRINT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, copies: 1 }),
      signal: controller.signal,
      mode: "cors",
    });
    clearTimeout(timer);
    const respText = await r.text().catch(() => "");
    if (r.ok) {
      console.info("[PrintAgent] OK", r.status, respText);
      return { ok: true, via: "agent" };
    }
    console.error("[PrintAgent] HTTP error", r.status, r.statusText, respText);
    const ok = printViaBrowser(payload);
    return ok
      ? { ok: true, via: "browser" }
      : { ok: false, via: "browser", error: `HTTP ${r.status} ${respText}` };
  } catch (e) {
    clearTimeout(timer);
    console.error("[PrintAgent] fetch failed", PRINT_ENDPOINT, e);
    const ok = printViaBrowser(payload);
    return ok
      ? { ok: true, via: "browser" }
      : { ok: false, via: "browser", error: (e as Error).message };
  }
}

/**
 * Verifica se o agente local está online e retorna nome da impressora padrão.
 */
export async function pingLocalAgent(timeoutMs = 1500): Promise<AgentPingInfo> {
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
    if (!r.ok) return { online: false };
    const data = await r.json().catch(() => ({}));
    return {
      online: true,
      printer: data?.printer || undefined,
      version: data?.version || undefined,
    };
  } catch {
    clearTimeout(timer);
    return { online: false };
  }
}
