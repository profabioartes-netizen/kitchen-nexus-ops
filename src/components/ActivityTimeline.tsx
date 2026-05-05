import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Clock, ShoppingCart, Trash2, Send, CreditCard, DoorOpen, DoorClosed,
  StickyNote, Tag, PlusCircle, MinusCircle,
} from "lucide-react";

const actionIcons: Record<string, typeof Clock> = {
  table_opened: DoorOpen,
  item_added: ShoppingCart,
  item_removed: Trash2,
  item_qty_changed: PlusCircle,
  sent_to_kitchen: Send,
  payment_added: CreditCard,
  table_closed: DoorClosed,
  note_added: StickyNote,
  complement_added: Tag,
  discount_applied: MinusCircle,
  extra_charge: PlusCircle,
  comanda_created: PlusCircle,
};

const actionColors: Record<string, string> = {
  table_opened: "text-[hsl(var(--status-free))] bg-[hsl(var(--status-free)/0.12)]",
  item_added: "text-accent bg-accent/10",
  item_removed: "text-destructive bg-destructive/10",
  item_qty_changed: "text-muted-foreground bg-muted",
  sent_to_kitchen: "text-[hsl(var(--status-occupied))] bg-[hsl(var(--status-occupied)/0.12)]",
  payment_added: "text-[hsl(var(--status-free))] bg-[hsl(var(--status-free)/0.12)]",
  table_closed: "text-primary bg-primary/10",
  note_added: "text-[hsl(var(--status-reserved))] bg-[hsl(var(--status-reserved)/0.12)]",
  complement_added: "text-accent bg-accent/10",
  discount_applied: "text-destructive bg-destructive/10",
  extra_charge: "text-accent bg-accent/10",
  comanda_created: "text-[hsl(var(--status-free))] bg-[hsl(var(--status-free)/0.12)]",
};

interface Props {
  tableId: string;
}

export default function ActivityTimeline({ tableId }: Props) {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["activity_log", tableId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("table_activity_log")
        .select("*")
        .eq("table_id", tableId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="p-4 text-center text-xs text-muted-foreground">Carregando...</div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        Nenhuma atividade registrada
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {logs.map((log, idx) => {
        const Icon = actionIcons[log.action] || Clock;
        const colorClass = actionColors[log.action] || "text-muted-foreground bg-muted";
        const date = new Date(log.created_at);

        return (
          <div key={log.id} className="flex gap-3 px-4 py-2.5 group">
            {/* Timeline line + icon */}
            <div className="flex flex-col items-center">
              <div className={`rounded-full p-1.5 ${colorClass}`}>
                <Icon className="h-3 w-3" />
              </div>
              {idx < logs.length - 1 && (
                <div className="w-px flex-1 bg-border mt-1" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pb-1">
              <p className="text-sm leading-snug">{log.description}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-muted-foreground">
                  {format(date, "dd/MM HH:mm", { locale: ptBR })}
                </span>
                {log.user_name && (
                  <span className="text-[10px] text-muted-foreground">
                    · {log.user_name}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
