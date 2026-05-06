// agent-poll-jobs
// Chamada PELO AGENT desktop (sem JWT de usuário). Auth via header `x-agent-token`.
// Reserva atômica de jobs pendentes da estação do agente via RPC.
//
// Body: { limit?: number }  (default 5, max 20)
// Resposta: { jobs: PrintJob[] }

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-token",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = req.headers.get("x-agent-token") ?? "";
    if (!token || token.length < 32) {
      return new Response(JSON.stringify({ error: "Token de agente ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const requested = Number.isFinite(body?.limit) ? Number(body.limit) : 5;
    const limit = Math.max(1, Math.min(20, requested));

    const tokenHash = await sha256Hex(token);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await admin.rpc("claim_print_jobs_for_agent", {
      p_token_hash: tokenHash,
      p_limit: limit,
    });

    if (error) {
      const msg = error.message ?? "Falha ao buscar jobs";
      const status = /token/i.test(msg) ? 401 : 400;
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ jobs: data ?? [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[agent-poll-jobs]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
