import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, Clock, CheckCircle2, UtensilsCrossed, QrCode, Copy, Check } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { generatePixBrCode } from "@/lib/pixBrCode";
import { toast } from "sonner";

interface Props {
  tableId: string;
  customerName: string;
}

export default function SelfServiceBill({ tableId, customerName }: Props) {
  const [showPix, setShowPix] = useState(false);
  const [copied, setCopied] = useState(false);

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

  // Fetch Pix settings
  const { data: pixSettings } = useQuery({
    queryKey: ["pix_settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("key, value")
        .in("key", ["pix_key", "pix_recipient_name", "pix_city"]);
      const map: Record<string, string> = {};
      (data || []).forEach((r) => (map[r.key] = r.value));
      return map;
    },
  });

  const pixConfigured = !!(pixSettings?.pix_key && pixSettings?.pix_recipient_name);

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

  const pixBrCode = pixConfigured
    ? generatePixBrCode({
        pixKey: pixSettings!.pix_key,
        recipientName: pixSettings!.pix_recipient_name,
        city: pixSettings!.pix_city || "SAO PAULO",
        amount: total,
        txId: order.id.substring(0, 25).replace(/-/g, ""),
      })
    : "";

  const handleCopyPix = async () => {
    try {
      await navigator.clipboard.writeText(pixBrCode);
      setCopied(true);
      toast.success("Código Pix copiado!");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

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
        <>
          <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">Total</span>
            <span className="text-xl font-bold text-accent">R$ {total.toFixed(2)}</span>
          </div>

          {/* Pix Payment */}
          {pixConfigured && total > 0 && (
            <div className="space-y-3">
              <button
                onClick={() => setShowPix(!showPix)}
                className="w-full rounded-lg border border-accent/30 bg-card p-3 flex items-center justify-center gap-2 text-sm font-medium text-foreground hover:bg-accent/5 transition-colors"
              >
                <QrCode className="h-5 w-5 text-accent" />
                {showPix ? "Fechar Pix" : "Pagar com Pix"}
              </button>

              {showPix && (
                <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <p className="text-xs text-muted-foreground text-center">
                    Escaneie o QR Code ou copie o código Pix abaixo
                  </p>

                  <div className="bg-white p-3 rounded-lg">
                    <QRCodeSVG value={pixBrCode} size={200} level="M" />
                  </div>

                  <div className="w-full space-y-2">
                    <p className="text-[11px] text-muted-foreground text-center font-medium">
                      {pixSettings!.pix_recipient_name}
                    </p>
                    <p className="text-lg font-bold text-center text-foreground">
                      R$ {total.toFixed(2)}
                    </p>
                  </div>

                  <button
                    onClick={handleCopyPix}
                    className="w-full flex items-center justify-center gap-2 rounded-md border bg-secondary text-secondary-foreground py-2.5 text-sm font-medium hover:bg-secondary/80 transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 text-green-500" />
                        Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Copiar Pix Copia e Cola
                      </>
                    )}
                  </button>

                  <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                    Após o pagamento, informe ao restaurante para confirmação.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
