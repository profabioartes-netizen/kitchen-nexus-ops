import { supabase } from "@/integrations/supabase/client";

type GetOrCreateOpenOrderParams = {
  tableId: string;
  waiterName?: string | null;
  customerName?: string | null;
  whatsappPhone?: string | null;
  guests?: number;
  location?: string | null;
};

export async function getOrCreateOpenOrder({
  tableId,
  waiterName = null,
  customerName = null,
  whatsappPhone = null,
  guests = 1,
  location = null,
}: GetOrCreateOpenOrderParams) {
  const { data, error } = await supabase.rpc("get_or_create_open_order" as any, {
    p_table_id: tableId,
    p_waiter_name: waiterName,
    p_customer_name: customerName,
    p_whatsapp_phone: whatsappPhone,
    p_guests: guests,
    p_location: location,
  });

  if (error) throw error;
  if (!data) throw new Error("Não foi possível criar a comanda");

  return data as any;
}
