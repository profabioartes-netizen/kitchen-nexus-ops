import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id, amount, description, payer_email } = await req.json();

    if (!order_id || !amount || amount <= 0) {
      return new Response(JSON.stringify({ error: "order_id e amount são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get MP access token from restaurant_settings
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: setting } = await supabase
      .from("restaurant_settings")
      .select("value")
      .eq("key", "mercado_pago_access_token")
      .single();

    if (!setting?.value) {
      return new Response(JSON.stringify({ error: "Mercado Pago não configurado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = setting.value;

    // Create PIX payment via Mercado Pago API
    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Idempotency-Key": `pix-${order_id}-${Date.now()}`,
      },
      body: JSON.stringify({
        transaction_amount: Number(amount),
        description: description || "Pagamento do pedido",
        payment_method_id: "pix",
        payer: {
          email: payer_email || "cliente@email.com",
        },
        external_reference: order_id,
      }),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error("MP create payment error:", JSON.stringify(mpData));
      return new Response(
        JSON.stringify({ error: mpData.message || "Erro ao criar pagamento Pix" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract QR code data
    const pixData = mpData.point_of_interaction?.transaction_data;

    return new Response(
      JSON.stringify({
        payment_id: mpData.id,
        status: mpData.status,
        qr_code: pixData?.qr_code || "",
        qr_code_base64: pixData?.qr_code_base64 || "",
        ticket_url: pixData?.ticket_url || "",
        expiration_date: mpData.date_of_expiration || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("create-pix-payment error:", e);
    return new Response(
      JSON.stringify({ error: "Erro interno ao criar pagamento" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
