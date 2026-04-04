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
}: {
  item: { id: string; product_id: string; product_name: string; quantity: number; sent_to_kitchen: boolean; notes?: string | null };
  products: { id: string; station?: string }[];
  table?: { name?: string; default_name?: string; sector?: string | null } | null;
  order?: { id: string; customer_name?: string | null; waiter_name?: string | null } | null;
  waiterName?: string | null;
}) {
  if (!item.sent_to_kitchen) return;

  const product = products.find((p) => p.id === item.product_id);
  const station = (product as any)?.station || "Cozinha";

  // Don't print cancellation for Caixa station (manual only)
  if (station === "Caixa") return;

  await supabase.from("print_jobs").insert({
    station,
    status: "pending",
    payload: {
      type: "cancellation",
      product_name: item.product_name,
      quantity: item.quantity,
      table_name: table?.name || "—",
      location: (order as any)?.current_location || (order as any)?.origin_location || table?.name || null,
      customer_name: order?.customer_name || null,
      waiter_name: waiterName || order?.waiter_name || null,
      origin: (order as any)?.origin || "waiter",
      order_id: order?.id || null,
    },
  });
}
