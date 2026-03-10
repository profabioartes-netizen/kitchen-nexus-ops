import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, CircleDollarSign, Loader2, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

type TableStatus = "free" | "occupied" | "reserved" | "bill";

const statusLabels: Record<TableStatus, string> = {
  free: "Livre",
  occupied: "Ocupada",
  reserved: "Reservada",
  bill: "Conta",
};

const statusCycle: TableStatus[] = ["free", "occupied", "reserved", "bill"];

export default function TablesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["restaurant_tables"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: openOrders = [] } = useQuery({
    queryKey: ["open_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("status", "open");
      if (error) throw error;
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("restaurant_tables")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
    },
  });

  const cycleStatus = (id: string, currentStatus: string) => {
    const idx = statusCycle.indexOf(currentStatus as TableStatus);
    const next = statusCycle[(idx + 1) % statusCycle.length];
    updateStatus.mutate({ id, status: next });
  };

  const occupied = tables.filter((t) => t.status === "occupied").length;
  const ordersByTable = openOrders.reduce<Record<string, typeof openOrders[0]>>((acc, o) => {
    if (o.table_id) acc[o.table_id] = o;
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Mapa de Mesas</h1>
        <div className="flex gap-3">
          <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{occupied}/{tables.length} ocupadas</span>
          </div>
          <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2">
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              R$ {openOrders.reduce((s, o) => s + Number(o.total), 0).toFixed(2)}
            </span>
          </div>
          <button
            onClick={() => navigate("/mesas/gerenciar")}
            className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
            Gerenciar
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        {statusCycle.map((s) => (
          <div key={s} className="flex items-center gap-2 text-xs">
            <div className={`h-3 w-3 rounded-full border-2 table-status-${s}`} />
            <span className="text-muted-foreground">{statusLabels[s]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {tables.map((table) => {
          const order = ordersByTable[table.id];
          return (
            <button
              key={table.id}
              onClick={() => cycleStatus(table.id, table.status)}
              className={`table-status-${table.status} relative flex flex-col items-center justify-center rounded-lg border-2 p-4 min-h-[120px] cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98]`}
            >
              <span className="font-display text-lg">{table.name}</span>
              <span className="text-xs text-muted-foreground mt-1">{table.seats} lugares</span>
              <span className="text-[10px] font-medium uppercase tracking-wider mt-2 text-muted-foreground">
                {statusLabels[table.status as TableStatus]}
              </span>
              {order && (
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <span className="font-semibold">R$ {Number(order.total).toFixed(2)}</span>
                </div>
              )}
              {order?.waiter_name && (
                <span className="text-[10px] text-muted-foreground mt-1">{order.waiter_name}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
