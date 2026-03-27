import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildNfcePayload(
  order: { id: string; total: number; customer_name: string | null },
  items: { product_id: string; product_name: string; quantity: number; price: number }[],
  paymentMethod: string,
) {
  // Focus NFe: use UTC time directly, API handles timezone
  const dataEmissao = new Date().toISOString().replace("Z", "-0300");

  // Payment method mapping
  const paymentTypeMap: Record<string, string> = {
    cash: "01", pix: "17", card: "03", credit: "03", debit: "04",
  };

  // Filter and validate items
  const validItems = items.filter((item) => {
    const price = Number(item.price);
    const qty = Number(item.quantity);
    const valid = item.product_name?.trim() && price > 0 && qty >= 1;
    if (!valid) console.warn("Item filtrado (inválido):", JSON.stringify(item));
    return valid;
  });

  if (validItems.length === 0) {
    throw new Error("Nenhum item válido para emissão de NFC-e");
  }

  // Calculate totals from items
  let totalProdutos = 0;
  const nfceItems = validItems.map((item, idx) => {
    const qty = Number(item.quantity);
    const unitPrice = Math.round(Number(item.price) * 100) / 100;
    const gross = Math.round(unitPrice * qty * 100) / 100;
    totalProdutos += gross;

    return {
      numero_item: idx + 1,
      codigo_produto: item.product_id || String(idx + 1),
      descricao: item.product_name.trim().substring(0, 120),
      cfop: "5102",
      unidade_comercial: "UN",
      quantidade_comercial: qty.toFixed(4),
      valor_unitario_comercial: unitPrice.toFixed(2),
      valor_bruto: gross.toFixed(2),
      unidade_tributavel: "UN",
      quantidade_tributavel: qty.toFixed(4),
      valor_unitario_tributavel: unitPrice.toFixed(2),
      codigo_ncm: "21069090",
      origem: "0",
      icms_situacao_tributaria: "102",
      pis_situacao_tributaria: "99",
      pis_aliquota_porcentual: "0.00",
      pis_base_calculo: "0.00",
      cofins_situacao_tributaria: "99",
      cofins_aliquota_porcentual: "0.00",
      cofins_base_calculo: "0.00",
    };
  });

  const totalNota = Math.round(totalProdutos * 100) / 100;

  const payload: Record<string, unknown> = {
    // --- Identificação ---
    natureza_operacao: "VENDA",
    forma_pagamento: "0",              // 0 = à vista
    tipo_documento: 1,                 // 1 = saída
    finalidade_emissao: 1,             // 1 = normal
    consumidor_final: 1,               // 1 = sim
    presenca_comprador: 1,             // 1 = presencial
    local_destino: 1,                  // 1 = interna
    modalidade_frete: 9,               // 9 = sem frete
    data_emissao: dataEmissao,

    // --- Emitente ---
    cnpj_emitente: "59132954000109",
    nome_emitente: "CAFETERIA COFFEE THRONES LTDA",
    nome_fantasia_emitente: "Cafeteria Coffee Thrones",
    inscricao_estadual_emitente: "0051004120010",
    regime_tributario_emitente: 1,     // 1 = Simples Nacional
    logradouro_emitente: "Sitio Vila do Sossego",
    numero_emitente: "SN",
    bairro_emitente: "Rural",
    cep_emitente: "35557000",
    municipio_emitente: "Carmo do Cajuru",
    uf_emitente: "MG",
    codigo_municipio_emitente: "3114303",
    telefone_emitente: "",

    // --- Destinatário (consumidor final não identificado) ---
    // NFC-e permite omitir destinatário para valores <= R$10.000

    // --- Itens ---
    items: nfceItems,

    // --- Totais (calculados automaticamente pela API, mas informamos para segurança) ---
    valor_produtos: totalNota.toFixed(2),
    valor_total: totalNota.toFixed(2),
    icms_base_calculo: "0.00",
    icms_valor_total: "0.00",
    valor_pis: "0.00",
    valor_cofins: "0.00",

    // --- Pagamento ---
    formas_pagamento: [{
      forma_pagamento: paymentTypeMap[paymentMethod] || "01",
      valor_pagamento: totalNota.toFixed(2),
    }],

    // --- Informações complementares ---
    informacoes_adicionais_contribuinte: "Documento emitido por ME/EPP optante pelo Simples Nacional.",
  };

  return { payload, totalNota };
}

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

    const paymentMethod = payments?.[0]?.method || "cash";

    // Build payload
    let nfcePayload: Record<string, unknown>;
    try {
      const result = buildNfcePayload(order, items || [], paymentMethod);
      nfcePayload = result.payload;
    } catch (validationErr) {
      return new Response(JSON.stringify({ error: (validationErr as Error).message }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reference = `pedido_${order_id}_${Date.now()}`;

    // Log full payload
    console.log("=== PAYLOAD NFC-e COMPLETO ===");
    console.log(JSON.stringify(nfcePayload, null, 2));
    console.log("=== FIM PAYLOAD ===");

    // Save initial record
    const { error: insertErr } = await supabase.from("nfce_records").insert({
      order_id,
      reference,
      status: "pending",
    });
    if (insertErr) console.error("Error inserting nfce_records:", insertErr);

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
      },
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

    // Success
    const danfeUrl = focusData.caminho_danfe
      || focusData.url_danfe
      || `https://api.focusnfe.com.br/v2/nfce/${encodeURIComponent(reference)}.html`;

    await supabase.from("nfce_records")
      .update({
        status: "emitida",
        chave_acesso: focusData.chave_nfe || focusData.chave || null,
        url_danfe: danfeUrl,
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
