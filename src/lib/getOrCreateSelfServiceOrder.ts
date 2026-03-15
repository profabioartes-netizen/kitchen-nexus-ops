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

  if (error) throw error;
  if (!data) throw new Error("Não foi possível criar ou recuperar a comanda da sessão");

  return data as any;
}
