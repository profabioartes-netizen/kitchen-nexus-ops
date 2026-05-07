// Chamada PELO AGENTE (sem JWT de usuário) para trocar um código de 6 dígitos
// por um token permanente do agente.
//
// Body: { code: "482913", agent_name?, agent_host?, agent_version? }
// Resposta: { agent_id, agent_token, tenant_id, tenant_name, station }
//
// O agent_token bruto é retornado UMA ÚNICA VEZ aqui. O banco guarda só o hash.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function genToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const rawCode = String(body?.code ?? "").replace(/\D/g, "");
    if (rawCode.length !== 6) {
      return new Response(
        JSON.stringify({ error: "Código deve ter 6 dígitos numéricos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const agentName = String(body?.agent_name ?? "").trim() || null;
    const agentHost = String(body?.agent_host ?? "").trim() || null;
    const agentVersion = String(body?.agent_version ?? "").trim() || null;

    const codeHash = await sha256Hex(rawCode);
    const rawToken = genToken();
    const tokenHash = await sha256Hex(rawToken);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.rpc("consume_pairing_code", {
      p_code_hash: codeHash,
      p_token_hash: tokenHash,
      p_agent_name: agentName,
      p_agent_host: agentHost,
      p_agent_version: agentVersion,
    });

    if (error) {
      const msg = error.message || "Falha no pareamento";
      const userMsg =
        msg.includes("inválido") ? "Código inválido" :
        msg.includes("utilizado") ? "Este código já foi usado" :
        msg.includes("expirado") ? "Código expirado, gere um novo no painel" :
        msg;
      return new Response(
        JSON.stringify({ error: userMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.agent_id) {
      return new Response(
        JSON.stringify({ error: "Resposta inesperada do servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        agent_id: row.agent_id,
        agent_token: rawToken,
        tenant_id: row.tenant_id,
        tenant_name: row.tenant_name,
        station: row.station,
        stations: row.stations ?? [row.station],
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[pair-print-agent]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
