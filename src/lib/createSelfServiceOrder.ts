import { supabase } from "@/integrations/supabase/client";

type CreateSelfServiceOrderParams = {
  tableId: string;
  customerName?: string | null;
  whatsappPhone?: string | null;
  waiterName?: string | null;
};

export async function createSelfServiceOrder({
  tableId,
  customerName = null,
  whatsappPhone = null,
  waiterName = "Auto-atendimento",
}: CreateSelfServiceOrderParams) {
  const { data, error } = await supabase
    .from("orders")
    .insert({
      table_id: tableId,
      status: "open",
      total: 0,
      waiter_name: waiterName,
      customer_name: customerName,
      whatsapp_phone: whatsappPhone,
      guests: 1,
    })
    .select("*")
    .single();

  if (error) throw error;
  if (!data) throw new Error("Não foi possível criar a comanda de autoatendimento");

  await supabase
    .from("restaurant_tables")
    .update({ status: "occupied" })
    .eq("id", tableId);

  return data;
}
