import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { payment_id } = await req.json();

    if (!payment_id) {
      return new Response(JSON.stringify({ error: "payment_id é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
      headers: { Authorization: `Bearer ${setting.value}` },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("MP check payment error:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: data.message || "Erro ao verificar pagamento" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If payment is approved, finalize the order server-side
    if (data.status === "approved" && data.external_reference) {
      const orderId = data.external_reference;

      try {
        // Check if order is still open (avoid double-processing)
        const { data: order } = await supabase
          .from("orders")
          .select("id, status, table_id, customer_name, total")
          .eq("id", orderId)
          .single();

        if (order && order.status !== "finalized" && order.status !== "closed" && order.status !== "finished") {
          console.log(`Finalizing order ${orderId} after PIX approval`);

          // Get order items
          const { data: items } = await supabase
            .from("order_items")
            .select("id, quantity, price, product_name")
            .eq("order_id", orderId);

          const total = (items || []).reduce((s: number, i: any) => s + Number(i.price) * i.quantity, 0);

          // Record payment
          await supabase.from("payments").insert({
            order_id: orderId,
            method: "pix",
            amount: total,
          });

          // Mark items as paid
          for (const item of (items || [])) {
            await supabase.from("order_items").update({ paid_quantity: item.quantity }).eq("id", item.id);
          }

          // Update order status to finalized
          await supabase.from("orders").update({
            status: "finalized",
            total,
            updated_at: new Date().toISOString(),
          }).eq("id", orderId);

          // Get table info
          if (order.table_id) {
            const { data: tableData } = await supabase
              .from("restaurant_tables")
              .select("id, name, default_name, sector")
              .eq("id", order.table_id)
              .single();

            // Print receipt to Caixa
            await supabase.from("print_jobs").insert({
              station: "Caixa",
              status: "pending",
              payload: {
                type: "bill",
                location: tableData?.name || "—",
                table_name: tableData?.name || "—",
                customer_name: order.customer_name || null,
                waiter_name: "Auto-atendimento",
                origin: "self_service",
                order_id: orderId,
                pix_confirmed: true,
                pix_payment_id: String(payment_id),
                items: (items || []).map((i: any) => ({
                  product_name: i.product_name,
                  quantity: i.quantity,
                  price: Number(i.price),
                })),
                total,
              },
            });

            // Log activity
            await supabase.from("table_activity_log").insert({
              table_id: order.table_id,
              order_id: orderId,
              action: "pix_payment_confirmed",
              description: `Pagamento Pix confirmado via Mercado Pago — R$ ${total.toFixed(2)}`,
              user_name: order.customer_name || "Cliente",
            });

            // Check if other open orders remain on this table
            const { data: remainingOrders } = await supabase
              .from("orders")
              .select("id")
              .eq("table_id", order.table_id)
              .not("status", "in", '("closed","finished","finalized","canceled","merged")')
              .neq("id", orderId)
              .limit(1);

            if (!remainingOrders || remainingOrders.length === 0) {
              await supabase.from("restaurant_tables").update({ status: "free", updated_at: new Date().toISOString() }).eq("id", order.table_id);
            }
          }
        }
      } catch (finErr) {
        console.error("Error finalizing order after PIX approval:", finErr);
        // Still return approved status to client even if finalization had issues
      }
    }

    return new Response(
      JSON.stringify({
        payment_id: data.id,
        status: data.status,
        status_detail: data.status_detail || null,
        date_approved: data.date_approved || null,
        transaction_amount: data.transaction_amount,
        external_reference: data.external_reference,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("check-pix-payment error:", e);
    return new Response(
      JSON.stringify({ error: "Erro interno ao verificar pagamento" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
