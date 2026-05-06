// Cliente HTTP do agente — todas as chamadas à API HuskyPDV passam por aqui.
// Sempre injeta `x-agent-token` no header. NUNCA usa service_role.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";

export type PrintJob = {
  id: string;
  tenant_id: string;
  station: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  created_at: string;
};

async function call<T>(path: string, token: string, body: unknown): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      "x-agent-token": token,
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* noop */ }
  if (!r.ok) {
    const msg = parsed?.error || `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return parsed as T;
}

export async function pollJobs(token: string, limit = 5): Promise<PrintJob[]> {
  const data = await call<{ jobs: PrintJob[] }>("agent-poll-jobs", token, { limit });
  return data.jobs ?? [];
}

export async function updateJobStatus(
  token: string,
  jobId: string,
  status: "printed" | "error" | "pending",
  errorMessage?: string,
): Promise<void> {
  await call<{ ok: true }>("agent-update-job-status", token, {
    job_id: jobId,
    status,
    error_message: errorMessage ?? null,
  });
}

// Heartbeat usa RPC direta (mais leve que edge function).
export async function heartbeat(tokenHashHex: string, host: string, version: string) {
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/agent_heartbeat`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_token_hash: tokenHashHex,
      p_agent_host: host,
      p_agent_version: version,
    }),
  });
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
