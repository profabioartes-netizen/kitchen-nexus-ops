import { supabase } from "@/integrations/supabase/client";

export async function recalculateOrderTotal(orderId: string) {
  const { error } = await supabase.rpc("recalculate_order_total" as any, {
    p_order_id: orderId,
  });

  if (error) throw error;
}
