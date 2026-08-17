import { supabase } from "@/integrations/supabase/client";

type GetOrCreateOpenOrderParams = {
  tableId: string;
  waiterName?: string | null;
  customerName?: string | null;
  whatsappPhone?: string | null;
  guests?: number;
  location?: string | null;
  customerId?: string | null;
};

export type ComandaNumberConflict = {
  number: string;
  orderId: string;
  tableId: string | null;
  customerName: string | null;
};

/** Erro lançado quando o número da comanda já está em uso por uma comanda ativa. */
export class ComandaNumberInUseError extends Error {
  conflict: ComandaNumberConflict;
  constructor(conflict: ComandaNumberConflict) {
    super(`Comanda ${conflict.number} já está em uso`);
    this.name = "ComandaNumberInUseError";
    this.conflict = conflict;
  }
}

function parseConflict(error: any): ComandaNumberConflict | null {
  const raw = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.hint ?? ""}`;
  if (!raw.includes("COMANDA_NUMBER_IN_USE")) return null;
  try {
    const match = (error?.details ?? "").toString().match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        number: String(parsed.number ?? ""),
        orderId: String(parsed.order_id ?? ""),
        tableId: parsed.table_id ?? null,
        customerName: parsed.customer_name ?? null,
      };
    }
  } catch {
    // fallthrough
  }
  return { number: "", orderId: "", tableId: null, customerName: null };
}

export async function getOrCreateOpenOrder({
  tableId,
  waiterName = null,
  customerName = null,
  whatsappPhone = null,
  guests = 1,
  location = null,
  customerId = null,
}: GetOrCreateOpenOrderParams) {
  const { data, error } = await supabase.rpc("get_or_create_open_order" as any, {
    p_table_id: tableId,
    p_waiter_name: waiterName,
    p_customer_name: customerName,
    p_whatsapp_phone: whatsappPhone,
    p_guests: guests,
    p_location: location,
    p_customer_id: customerId,
  });

  if (error) {
    const conflict = parseConflict(error);
    if (conflict) {
      throw new ComandaNumberInUseError({
        ...conflict,
        number: conflict.number || String(location ?? ""),
      });
    }
    throw error;
  }
  if (!data) throw new Error("Não foi possível criar a comanda");

  return data as any;
}
