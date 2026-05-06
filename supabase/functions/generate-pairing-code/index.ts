// Gera um código de 6 dígitos para parear um novo HuskyPDV Agent.
// Auth: usuário do tenant precisa estar logado (JWT). O código é guardado
// como hash sha256 e expira em 10 minutos.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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

function generate6DigitCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Resolve tenant: profile.tenant_id -> first active user_tenants link.
    // Super admin can pass x-tenant-id (impersonation) and we validate access.
    const headerTenantId = req.headers.get("x-tenant-id");

    const { data: profile } = await admin
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();

    let resolvedTenantId: string | null = profile?.tenant_id ?? null;

    const { data: links } = await admin
      .from("user_tenants")
      .select("tenant_id, role, active")
      .eq("user_id", userId)
      .eq("active", true);

    const isSuperAdmin = (links ?? []).some((l) => l.role === "super_admin");

    if (headerTenantId) {
      const allowed =
        isSuperAdmin ||
        (links ?? []).some((l) => l.tenant_id === headerTenantId);
      if (allowed) resolvedTenantId = headerTenantId;
    }

    if (!resolvedTenantId) {
      const firstLink = (links ?? []).find((l) => l.role !== "super_admin");
      if (firstLink) resolvedTenantId = firstLink.tenant_id;
    }

    if (!resolvedTenantId) {
      return new Response(
        JSON.stringify({ error: "Usuário sem tenant vinculado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let station = "Caixa";
    let suggestedName: string | null = null;
    try {
      const body = await req.json();
      if (typeof body?.station === "string" && body.station.trim()) station = body.station.trim();
      if (typeof body?.suggested_name === "string" && body.suggested_name.trim()) {
        suggestedName = body.suggested_name.trim();
      }
    } catch (_) { /* sem body */ }

    const code = generate6DigitCode();
    const codeHash = await sha256Hex(code);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    const { error: insErr } = await admin.from("agent_pairing_codes").insert({
      tenant_id: profile.tenant_id,
      code_hash: codeHash,
      station,
      suggested_name: suggestedName,
      created_by_user_id: userId,
      expires_at: expiresAt,
    });

    if (insErr) {
      return new Response(
        JSON.stringify({ error: insErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ code, expires_at: expiresAt, station, suggested_name: suggestedName }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[generate-pairing-code]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
