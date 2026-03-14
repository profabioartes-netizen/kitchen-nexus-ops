import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, Clock, CheckCircle2, UtensilsCrossed } from "lucide-react";

interface Props {
  tableId: string;
  customerName: string;
}

export default function SelfServiceBill({ tableId, customerName }: Props) {
  const { data: order, isLoading } = useQuery({
    queryKey: ["self_service_order", tableId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("table_id", tableId)
        .in("status", ["open", "bill_requested", "delivered"])
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
    refetchInterval: 10_000,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["self_service_items", order?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("*, order_item_complements(*)")
        .eq("order_id", order!.id)
        .order("created_at");
      if (error) throw error;
      return data;
    },
    enabled: !!order?.id,
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-accent" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
        <UtensilsCrossed className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Você ainda não tem pedidos nesta mesa.</p>
        <p className="text-xs text-muted-foreground">Acesse o Cardápio para fazer seu primeiro pedido!</p>
      </div>
    );
  }

  const statusLabels: Record<string, { label: string; icon: any; color: string }> = {
    pending: { label: "Aguardando", icon: Clock, color: "text-muted-foreground" },
    preparing: { label: "Preparando", icon: UtensilsCrossed, color: "text-accent" },
    ready: { label: "Pronto!", icon: CheckCircle2, color: "text-green-500" },
    delivered: { label: "Entregue", icon: CheckCircle2, color: "text-green-400" },
  };

  const total = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-accent" />
        <h2 className="text-base font-semibold text-foreground">Sua Conta</h2>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const status = statusLabels[item.preparation_status] || statusLabels.pending;
          const StatusIcon = status.icon;
          const complements = (item as any).order_item_complements || [];

          return (
            <div key={item.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{item.product_name}</p>
                    <div className={`flex items-center gap-1 ${status.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      <span className="text-[10px] font-medium">{status.label}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity}x R$ {Number(item.price).toFixed(2)}
                  </p>
                  {complements.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      + {complements.map((c: any) => c.complement_name).join(", ")}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-[10px] text-muted-foreground italic mt-0.5">"{item.notes}"</p>
                  )}
                </div>
                <span className="text-sm font-semibold text-foreground ml-2">
                  R$ {(Number(item.price) * item.quantity).toFixed(2)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {items.length > 0 && (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Total</span>
          <span className="text-xl font-bold text-accent">R$ {total.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
