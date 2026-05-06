// agent-update-job-status
// Chamada PELO AGENT (sem JWT). Auth via header `x-agent-token`.
//
// Body: { job_id: uuid, status: "printed" | "error" | "pending", error_message?: string }
// Resposta: { ok: true }

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
    const jobId = String(body?.job_id ?? "");
    const status = String(body?.status ?? "");
    const errorMessage = body?.error_message != null
      ? String(body.error_message).slice(0, 1000)
      : null;

    if (!jobId || !["printed", "error", "pending"].includes(status)) {
      return new Response(JSON.stringify({ error: "Parâmetros inválidos" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokenHash = await sha256Hex(token);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await admin.rpc("update_print_job_status", {
      p_token_hash: tokenHash,
      p_job_id: jobId,
      p_status: status,
      p_error_message: errorMessage,
    });

    if (error) {
      const msg = error.message ?? "Falha ao atualizar job";
      const httpStatus = /token/i.test(msg) ? 401 : 400;
      return new Response(JSON.stringify({ error: msg }), {
        status: httpStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[agent-update-job-status]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
