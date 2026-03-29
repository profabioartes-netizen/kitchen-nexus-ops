import { supabase } from "@/integrations/supabase/client";

type GetOrCreateSelfServiceOrderParams = {
  tableId: string;
  sessionId: string;
  customerName?: string | null;
  whatsappPhone?: string | null;
  guests?: number;
};

export async function getOrCreateSelfServiceOrder({
  tableId,
  sessionId,
  customerName = null,
  whatsappPhone = null,
  guests = 1,
}: GetOrCreateSelfServiceOrderParams) {
  const { data, error } = await supabase.rpc("get_or_create_self_service_order" as any, {
    p_table_id: tableId,
    p_session_id: sessionId,
    p_customer_name: customerName,
    p_whatsapp_phone: whatsappPhone,
    p_guests: guests,
  });

  if (error) {
    console.error("[SS] get_or_create_self_service_order ERRO:", { tableId, sessionId, error });
    throw error;
  }
  if (!data) throw new Error("Não foi possível criar ou recuperar a comanda da sessão");

  // SAFETY: validate returned order belongs to the requested table
  const order = data as any;
  if (order.table_id && order.table_id !== tableId) {
    const msg = `CRÍTICO: comanda ${order.id} retornada para mesa errada (${order.table_id} ≠ ${tableId})`;
    console.error("[SS]", msg);
    throw new Error(msg);
  }

  console.log("[SS] Comanda obtida:", { orderId: order.id, tableId, sessionId, orderTableId: order.table_id });
  return order;
}
