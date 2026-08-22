import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fonte ÚNICA de saldo da comanda.
 * Saldo = total bruto atual (itens) − pagamentos/abatimentos válidos (cancelados excluídos).
 * O cálculo é feito no servidor pela função get_order_balance.
 */
export type OrderBalance = {
  total: number;
  paid: number;
  remaining: number;
};

export const orderBalanceKey = (orderId?: string | null) => ["order_balance", orderId] as const;

export async function fetchOrderBalance(orderId: string): Promise<OrderBalance> {
  const { data, error } = await supabase.rpc("get_order_balance" as any, { p_order_id: orderId });
  if (error) throw error;
  const row = Array.isArray(data) ? (data[0] as any) : (data as any);
  return {
    total: Number(row?.total ?? 0),
    paid: Number(row?.paid ?? 0),
    remaining: Number(row?.remaining ?? 0),
  };
}

export function useOrderBalance(orderId?: string | null) {
  return useQuery({
    queryKey: orderBalanceKey(orderId),
    queryFn: () => fetchOrderBalance(orderId!),
    enabled: !!orderId,
  });
}

/** Mensagens de erro do servidor traduzidas para o operador. */
export function translateBalanceError(err: unknown): string {
  const msg = String((err as any)?.message ?? err ?? "");
  if (msg.includes("AMOUNT_EXCEEDS_BALANCE")) return "Valor maior que o saldo restante da comanda.";
  if (msg.includes("AMOUNT_INVALID")) return "Informe um valor maior que zero.";
  if (msg.includes("NO_BALANCE_DUE")) return "Esta comanda não possui saldo em aberto.";
  if (msg.includes("ALREADY_VOIDED")) return "Este abatimento já foi cancelado.";
  if (msg.includes("REASON_REQUIRED")) return "Informe o motivo do cancelamento.";
  if (msg.includes("PAYMENT_NOT_FOUND")) return "Lançamento não encontrado.";
  return msg || "Erro inesperado";
}
