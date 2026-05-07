import { supabase } from "@/integrations/supabase/client";

/**
 * Prints a cancellation ticket to the station printer when a previously-saved item is removed.
 * Only triggers if the item was already sent to kitchen (sent_to_kitchen: true).
 */
export async function printCancellationIfNeeded({
  item,
  products,
  table,
  order,
  waiterName,
  businessName,
  businessPhone,
}: {
  item: { id: string; product_id: string; product_name: string; quantity: number; sent_to_kitchen: boolean; notes?: string | null };
  products: { id: string; station?: string }[];
  table?: { name?: string; default_name?: string; sector?: string | null; internal_number?: string | null } | null;
  order?: { id: string; customer_name?: string | null; waiter_name?: string | null } | null;
  waiterName?: string | null;
  businessName?: string | null;
  businessPhone?: string | null;
}) {
  if (!item.sent_to_kitchen) return;

  const product = products.find((p) => p.id === item.product_id);
  const station = (product as any)?.station;

  // Skip cancellation print for products without a production station or with "Caixa" station
  if (!station || station === "Caixa") {
    console.log("[CANCEL-PRINT] Ignorado (sem setor de produção)", {
      product_id: item.product_id,
      product_name: item.product_name,
      station: station || null,
      action: "print_job ignorado",
    });
    return;
  }

  console.log("[CANCEL-PRINT] Criando print_job de cancelamento", {
    product_id: item.product_id,
    product_name: item.product_name,
    station,
    action: "print_job criado",
  });

  await supabase.from("print_jobs").insert({
    station,
    status: "pending",
    payload: {
      type: "cancellation",
      business_name: businessName || null,
      business_phone: businessPhone || null,
      product_name: item.product_name,
      quantity: item.quantity,
      table_name: table?.sector || (order as any)?.current_location || table?.internal_number || table?.default_name || (order as any)?.origin_location || "—",
      location: table?.sector || (order as any)?.current_location || table?.internal_number || table?.default_name || (order as any)?.origin_location || null,
      customer_name: order?.customer_name || null,
      waiter_name: waiterName || order?.waiter_name || null,
      origin: (order as any)?.origin || "waiter",
      order_id: order?.id || null,
    },
  });
}
