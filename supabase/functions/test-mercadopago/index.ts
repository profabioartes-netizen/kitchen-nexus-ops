import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { access_token } = await req.json();
    if (!access_token) {
      return new Response(JSON.stringify({ ok: false, message: "Access Token não informado." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://api.mercadopago.com/v1/payment_methods", {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (res.ok) {
      return new Response(JSON.stringify({ ok: true, message: "Conexão OK! Token válido." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await res.json().catch(() => ({}));
    return new Response(
      JSON.stringify({ ok: false, message: body.message || `Erro ${res.status}: Token inválido ou expirado.` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("test-mercadopago error:", e);
    return new Response(
      JSON.stringify({ ok: false, message: "Erro ao testar conexão." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
