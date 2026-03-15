import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Receipt, Clock, CheckCircle2, UtensilsCrossed, QrCode, Copy, Check, RefreshCw, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { generatePixBrCode } from "@/lib/pixBrCode";
import { toast } from "sonner";
import coffeeLogo from "@/assets/coffee-thrones-logo.png";

const PIX_EXPIRY_SECONDS = 10 * 60; // 10 minutes
const POLL_INTERVAL_MS = 5000; // poll every 5 seconds

interface Props {
  tableId: string;
  customerName: string;
}

function usePixCountdown(active: boolean) {
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const reset = useCallback(() => {
    setExpiresAt(Date.now() + PIX_EXPIRY_SECONDS * 1000);
    setSecondsLeft(PIX_EXPIRY_SECONDS);
  }, []);

  useEffect(() => {
    if (!active || !expiresAt) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) clearInterval(interval);
    }, 1000);
    return () => clearInterval(interval);
  }, [active, expiresAt]);

  const expired = expiresAt !== null && secondsLeft <= 0;
  const formatted = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return { secondsLeft, expired, formatted, reset, started: expiresAt !== null };
}

export default function SelfServiceBill({ tableId, customerName }: Props) {
  const queryClient = useQueryClient();
  const [showPix, setShowPix] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pixPaid, setPixPaid] = useState(false);
  const countdown = usePixCountdown(showPix && !pixPaid);

  // Mercado Pago dynamic PIX state
  const [mpPaymentId, setMpPaymentId] = useState<number | null>(null);
  const [mpQrCode, setMpQrCode] = useState<string>("");
  const [creatingPix, setCreatingPix] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Check if MP is configured
  const { data: mpConfigured } = useQuery({
    queryKey: ["mp_configured"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("value")
        .eq("key", "mercado_pago_access_token")
        .single();
      return !!(data?.value);
    },
  });

  // Fallback: static PIX settings
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

  const staticPixConfigured = !!(pixSettings?.pix_key && pixSettings?.pix_recipient_name);
  const useDynamicPix = !!mpConfigured;

  const total = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);

  // Create dynamic PIX via Mercado Pago
  const createDynamicPix = useCallback(async () => {
    if (!order || total <= 0) return;
    setCreatingPix(true);
    setPixPaid(false);
    setMpPaymentId(null);
    setMpQrCode("");
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-pix-payment`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order_id: order.id,
            amount: total,
            description: `Pedido ${customerName || "Cliente"}`,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao criar Pix");
      setMpPaymentId(data.payment_id);
      setMpQrCode(data.qr_code || "");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar QR Code Pix");
    } finally {
      setCreatingPix(false);
    }
  }, [order, total, customerName]);

  // Poll for payment confirmation
  useEffect(() => {
    if (!mpPaymentId || pixPaid) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    const checkPayment = async () => {
      try {
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-pix-payment`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_id: mpPaymentId }),
          }
        );
        const data = await res.json();
        if (data.status === "approved") {
          setPixPaid(true);
          if (pollingRef.current) clearInterval(pollingRef.current);
          toast.success("Pagamento Pix confirmado! ✅");

          // Record payment in DB
          if (order) {
            await supabase.from("payments").insert({
              order_id: order.id,
              method: "pix",
              amount: total,
            });

            // Mark items as paid
            for (const item of items) {
              await supabase.from("order_items").update({ paid_quantity: item.quantity }).eq("id", item.id);
            }

            // Update order status
            await supabase.from("orders").update({
              status: "finalized",
              total,
            }).eq("id", order.id);

            // Free the table since payment is complete
            await supabase.from("restaurant_tables").update({ status: "free" }).eq("id", tableId);

            // Clear self-service session
            await supabase.from("self_service_sessions").delete().eq("table_id", tableId);

            // Get table info for print
            const { data: tableData } = await supabase
              .from("restaurant_tables")
              .select("*")
              .eq("id", tableId)
              .single();

            // Get complements for print
            const complementsByItem: Record<string, string[]> = {};
            for (const item of items) {
              const comps = (item as any).order_item_complements || [];
              if (comps.length > 0) {
                complementsByItem[item.id] = comps.map((c: any) => c.complement_name);
              }
            }

            // Print PIX confirmation receipt to Caixa
            await supabase.from("print_jobs").insert({
              station: "Caixa",
              status: "pending",
              payload: {
                type: "bill",
                table_name: tableData?.name || "—",
                mesa_name: tableData?.default_name || null,
                mesa_sector: tableData?.sector || null,
                customer_name: order.customer_name || customerName || null,
                waiter_name: "Auto-atendimento",
                order_id: order.id,
                pix_confirmed: true,
                pix_payment_id: String(mpPaymentId),
                items: items.map((i) => ({
                  product_name: i.product_name,
                  quantity: i.quantity,
                  price: Number(i.price),
                  complements: complementsByItem[i.id] || [],
                })),
                total,
              },
            });

            // Log activity
            await supabase.from("table_activity_log").insert({
              table_id: tableId,
              order_id: order.id,
              action: "pix_payment_confirmed",
              description: `Pagamento Pix confirmado via Mercado Pago — R$ ${total.toFixed(2)}`,
              user_name: customerName || "Cliente",
            });

            queryClient.invalidateQueries({ queryKey: ["self_service_order", tableId] });
            queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
            queryClient.invalidateQueries({ queryKey: ["open_orders"] });
          }
        }
      } catch (e) {
        console.error("Error checking PIX payment:", e);
      }
    };

    // Initial check
    checkPayment();
    pollingRef.current = setInterval(checkPayment, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [mpPaymentId, pixPaid, order, items, total, tableId, customerName, queryClient]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

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

  const staticPixBrCode = staticPixConfigured
    ? generatePixBrCode({
        pixKey: pixSettings!.pix_key,
        recipientName: pixSettings!.pix_recipient_name,
        city: pixSettings!.pix_city || "SAO PAULO",
        amount: total,
        txId: order.id.substring(0, 25).replace(/-/g, ""),
      })
    : "";

  const pixAvailable = useDynamicPix || staticPixConfigured;

  const handleCopyPix = async () => {
    if (countdown.expired && !useDynamicPix) return;
    const code = useDynamicPix ? mpQrCode : staticPixBrCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Código Pix copiado!");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const handleOpenPix = async () => {
    if (pixPaid) return;
    const next = !showPix;
    setShowPix(next);
    if (next) {
      if (useDynamicPix) {
        await createDynamicPix();
      }
      if (!countdown.started) {
        countdown.reset();
      }
    }
  };

  const handleRefreshPix = async () => {
    if (useDynamicPix) {
      await createDynamicPix();
    }
    countdown.reset();
    setCopied(false);
    toast.success("QR Code Pix renovado por mais 10 minutos!");
  };

  const qrValue = useDynamicPix ? mpQrCode : staticPixBrCode;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-accent" />
        <h2 className="text-base font-semibold text-foreground">Sua Conta</h2>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          // Derive effective status for the customer view:
          // - delivered_at → "delivered"
          // - ready_at or preparation_status=ready → "ready"
          // - sent_to_kitchen (waiter approved) or preparation_status=preparing → "preparing"
          // - else → "pending" (awaiting waiter approval)
          const effectiveStatus = item.delivered_at
            ? "delivered"
            : item.ready_at || item.preparation_status === "ready"
              ? "ready"
              : item.sent_to_kitchen || item.preparation_status === "preparing"
                ? "preparing"
                : "pending";
          const status = statusLabels[effectiveStatus] || statusLabels.pending;
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

          {/* PIX paid — full-screen thank you */}
          {pixPaid && (
            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-6 animate-in fade-in">
              <img src={coffeeLogo} alt="Coffee Thrones" className="h-32 object-contain drop-shadow-md mb-8" />
              <h2 className="text-2xl font-display font-bold text-foreground text-center mb-2">
                Obrigado pela preferência!
              </h2>
              <p className="text-lg text-muted-foreground text-center mb-10">Volte Sempre!</p>
              <button
                onClick={() => {
                  localStorage.removeItem(`ss_session_${tableId}`);
                  window.location.reload();
                }}
                className="rounded-md bg-accent text-accent-foreground px-8 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
              >
                SAIR
              </button>
            </div>
          )}

          {pixAvailable && total > 0 && !pixPaid && (
            <div className="space-y-3">
              <button
                onClick={handleOpenPix}
                disabled={creatingPix}
                className="w-full rounded-lg border border-accent/30 bg-card p-3 flex items-center justify-center gap-2 text-sm font-medium text-foreground hover:bg-accent/5 transition-colors disabled:opacity-50"
              >
                {creatingPix ? (
                  <Loader2 className="h-5 w-5 animate-spin text-accent" />
                ) : (
                  <QrCode className="h-5 w-5 text-accent" />
                )}
                {creatingPix ? "Gerando Pix..." : showPix ? "Fechar Pix" : "Pagar com Pix"}
              </button>

              {showPix && !creatingPix && qrValue && (
                <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  {countdown.expired && !useDynamicPix ? (
                    <>
                      <div className="flex flex-col items-center gap-3 py-4">
                        <Clock className="h-8 w-8 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground text-center">
                          QR Code expirado
                        </p>
                        <p className="text-xs text-muted-foreground text-center">
                          O código Pix expirou após 10 minutos. Gere um novo para continuar.
                        </p>
                        <button
                          onClick={handleRefreshPix}
                          className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                          <RefreshCw className="h-4 w-4" />
                          Gerar novo QR Code
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground text-center">
                        Escaneie o QR Code ou copie o código Pix abaixo
                      </p>

                      {/* Countdown */}
                      <div className={`flex items-center gap-1.5 text-xs font-medium ${countdown.secondsLeft <= 60 ? "text-destructive" : "text-muted-foreground"}`}>
                        <Clock className="h-3.5 w-3.5" />
                        <span>Expira em {countdown.formatted}</span>
                      </div>

                      {useDynamicPix && (
                        <div className="flex items-center gap-1.5 text-[10px] text-green-600 font-medium">
                          <CheckCircle2 className="h-3 w-3" />
                          Confirmação automática via Mercado Pago
                        </div>
                      )}

                      <div className="bg-white p-3 rounded-lg">
                        <QRCodeSVG value={qrValue} size={200} level="M" />
                      </div>

                      <div className="w-full space-y-2">
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

                      <button
                        onClick={handleRefreshPix}
                        disabled={creatingPix}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        {creatingPix ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Renovar tempo
                      </button>

                      {!useDynamicPix && (
                        <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                          Após o pagamento, informe à Cafeteria Coffee Thrones para confirmação.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
