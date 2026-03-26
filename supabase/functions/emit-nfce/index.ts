import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id } = await req.json();
    if (!order_id) {
      return new Response(JSON.stringify({ error: "order_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const focusToken = Deno.env.get("FOCUS_NFE_TOKEN");
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!focusToken) {
      return new Response(JSON.stringify({ error: "Token Focus NFe não configurado" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, total, customer_name, status")
      .eq("id", order_id)
      .single();

    if (orderErr || !order) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get order items
    const { data: items } = await supabase
      .from("order_items")
      .select("product_id, product_name, quantity, price")
      .eq("order_id", order_id);

    // Get payment method
    const { data: payments } = await supabase
      .from("payments")
      .select("method, amount")
      .eq("order_id", order_id)
      .order("created_at", { ascending: false })
      .limit(1);

    const payment = payments?.[0];

    // Map payment method to NFC-e code
    const paymentTypeMap: Record<string, string> = {
      cash: "01",      // Dinheiro
      pix: "17",       // Pix
      card: "03",      // Cartão de crédito
      credit: "03",    // Cartão de crédito
      debit: "04",     // Cartão de débito
    };

    const reference = `pedido_${order_id}_${Date.now()}`;

    // Build NFC-e payload
    const nfcePayload: Record<string, unknown> = {
      natureza_operacao: "Venda",
      forma_pagamento: "0",
      data_emissao: new Date().toISOString(),
      modalidade_frete: 9,
      local_destino: 1,
      consumidor_final: 1,
      presenca_comprador: 1,
      cnpj_emitente: "59132954000109",
      nome_emitente: "CAFETERIA COFFEE THRONES LTDA",
      nome_fantasia_emitente: "Cafeteria Coffee Thrones",
      inscricao_estadual_emitente: "0051004120010",
      logradouro_emitente: "Sítio Vila do Sossego",
      numero_emitente: "S/N",
      bairro_emitente: "Rural",
      cep_emitente: "35557000",
      municipio_emitente: "Carmo do Cajuru",
      uf_emitente: "MG",
      items: (items || []).map((item, idx) => ({
        numero_item: idx + 1,
        codigo_produto: item.product_id,
        descricao: item.product_name,
        cfop: "5102",
        unidade_comercial: "UN",
        quantidade_comercial: item.quantity,
        valor_unitario_comercial: Number(item.price).toFixed(2),
        valor_bruto: (Number(item.price) * item.quantity).toFixed(2),
        unidade_tributavel: "UN",
        codigo_ncm: "21069090",
        quantidade_tributavel: item.quantity,
        valor_unitario_tributavel: Number(item.price).toFixed(2),
        origem: "0",
        icms_situacao_tributaria: "102",
        pis_situacao_tributaria: "99",
        pis_aliquota_porcentual: "0.00",
        pis_base_calculo: "0.00",
        cofins_situacao_tributaria: "99",
        cofins_aliquota_porcentual: "0.00",
        cofins_base_calculo: "0.00",
      })),
      formas_pagamento: [{
        forma_pagamento: paymentTypeMap[payment?.method || "cash"] || "01",
        valor_pagamento: Number(order.total).toFixed(2),
      }],
    };

    // Save initial record
    const { error: insertErr } = await supabase.from("nfce_records").insert({
      order_id,
      reference,
      status: "pending",
    });

    if (insertErr) {
      console.error("Error inserting nfce_records:", insertErr);
    }

    // Call Focus NFe API
    const basicAuth = btoa(`${focusToken}:`);
    const focusRes = await fetch(
      `https://api.focusnfe.com.br/v2/nfce?ref=${encodeURIComponent(reference)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(nfcePayload),
      }
    );

    const focusData = await focusRes.json();
    console.log("Focus NFe response:", JSON.stringify(focusData));

    const isError = !focusRes.ok
      || focusData.erros
      || focusData.codigo === "erro_validacao"
      || focusData.codigo === "erro_validacao_schema"
      || focusData.status === "erro_autorizacao"
      || focusData.status === "erro_assinatura"
      || (focusData.status_sefaz && focusData.status_sefaz !== "100");

    if (isError) {
      const errorMsg = focusData.mensagem_sefaz
        || focusData.mensagem
        || (focusData.erros ? JSON.stringify(focusData.erros) : "Erro ao emitir NFC-e");

      await supabase.from("nfce_records")
        .update({
          status: "erro",
          error_message: errorMsg.substring(0, 1000),
          raw_response: focusData,
          updated_at: new Date().toISOString(),
        })
        .eq("reference", reference);

      return new Response(JSON.stringify({ error: errorMsg, reference }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Success — update record
    await supabase.from("nfce_records")
      .update({
        status: "emitida",
        chave_acesso: focusData.chave_nfe || focusData.chave || null,
        url_danfe: focusData.caminho_danfe || focusData.url_danfe || null,
        raw_response: focusData,
        updated_at: new Date().toISOString(),
      })
      .eq("reference", reference);

    return new Response(JSON.stringify({
      success: true,
      reference,
      status: "emitida",
      chave_acesso: focusData.chave_nfe || focusData.chave || null,
      url_danfe: focusData.caminho_danfe || focusData.url_danfe || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("emit-nfce error:", e);
    return new Response(JSON.stringify({ error: "Erro interno ao emitir NFC-e" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
