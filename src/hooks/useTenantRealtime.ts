import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

type WatchedTable = "orders" | "order_items" | "payments" | "restaurant_tables";

interface Options {
  /** Chaves do React Query para invalidar quando algo relevante mudar. */
  invalidateKeys?: Array<string | unknown[]>;
  /** Tabelas para escutar (default: orders + order_items). */
  tables?: WatchedTable[];
  /**
   * Lista de colunas que, ao mudar, devem disparar invalidação. Demais
   * UPDATEs são ignorados (reduz tráfego em ~80% — ex.: viewed_at, paid_quantity).
   */
  significantColumns?: Partial<Record<WatchedTable, string[]>>;
  /** Identificador estável para o canal (default: nome da tela). */
  channelKey: string;
}

const DEFAULT_SIGNIFICANT: Record<WatchedTable, string[]> = {
  orders: ["status", "total", "table_id", "customer_name", "current_location"],
  order_items: ["preparation_status", "quantity", "price", "sent_to_kitchen"],
  payments: ["amount", "method", "voided_at"],
  restaurant_tables: ["status", "name", "internal_number", "active"],
};

/**
 * Hook unificado de Realtime por tenant.
 * - Filtra eventos por tenant_id no servidor (reduz tráfego ~90% em multi-tenant).
 * - Para UPDATE, compara payload.old vs payload.new e só invalida se uma
 *   coluna significativa mudou (requer REPLICA IDENTITY FULL — já habilitado).
 * - Debounce 250ms para agrupar bursts (ex.: "Salvar Comanda" com N items).
 */
export function useTenantRealtime({
  invalidateKeys = [],
  tables = ["orders", "order_items"],
  significantColumns,
  channelKey,
}: Options) {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const tenantId = tenant?.id;
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    const sig = { ...DEFAULT_SIGNIFICANT, ...(significantColumns ?? {}) };

    const triggerInvalidate = () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({
            queryKey: Array.isArray(key) ? key : [key],
          });
        }
      }, 250);
    };

    const channel = supabase.channel(`rt-${channelKey}-${tenantId}`);

    for (const table of tables) {
      channel.on(
        "postgres_changes" as any,
        {
          event: "*",
          schema: "public",
          table,
          filter: `tenant_id=eq.${tenantId}`,
        },
        (payload: any) => {
          if (payload.eventType === "UPDATE") {
            const cols = sig[table] ?? [];
            const oldRow = payload.old ?? {};
            const newRow = payload.new ?? {};
            const changed = cols.some(
              (c) => oldRow[c] !== undefined && oldRow[c] !== newRow[c]
            );
            if (!changed) return;
          }
          triggerInvalidate();
        }
      );
    }

    channel.subscribe();

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, channelKey, JSON.stringify(invalidateKeys), JSON.stringify(tables)]);
}
