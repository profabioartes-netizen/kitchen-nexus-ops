import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Printer, RefreshCw, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface NfceStatusProps {
  orderId: string;
  onClose?: () => void;
}

export default function NfceStatus({ orderId, onClose }: NfceStatusProps) {
  const queryClient = useQueryClient();
  const [nfce, setNfce] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [emitting, setEmitting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Initial fetch + realtime subscription — no polling
  useEffect(() => {
    let cancelled = false;

    const fetchOnce = async () => {
      const { data } = await supabase
        .from("nfce_records" as any)
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!cancelled) {
        setNfce((data as any)?.[0] || null);
        setLoaded(true);
      }
    };

    fetchOnce();

    // Subscribe to realtime changes on nfce_records for this order
    const channel = supabase
      .channel(`nfce-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "nfce_records",
          filter: `order_id=eq.${orderId}`,
        },
        (payload: any) => {
          if (payload.new) {
            setNfce(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  const handleEmit = async () => {
    setEmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("emit-nfce", {
        body: { order_id: orderId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ["nfce", orderId] });
      toast.success("NFC-e emitida com sucesso!");
    } catch (err) {
      toast.error("Erro ao emitir NFC-e: " + (err as Error).message);
    } finally {
      setEmitting(false);
    }
  };

  const getDanfeUrl = () => {
    if (nfce?.url_danfe) {
      const url = nfce.url_danfe as string;
      if (url.startsWith("http")) return url;
      return `https://api.focusnfe.com.br${url}`;
    }
    if (nfce?.reference) return `https://api.focusnfe.com.br/v2/nfce/${encodeURIComponent(nfce.reference)}.html`;
    return null;
  };

  const handlePrint = async () => {
    const danfeUrl = getDanfeUrl();
    if (!danfeUrl) {
      toast.error("URL da DANFE não disponível.");
      return;
    }

    setIsPrinting(true);
    try {
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("product_name, quantity, price")
        .eq("order_id", orderId);

      const { data: order } = await supabase
        .from("orders")
        .select("total, customer_name, created_at, waiter_name, table_id")
        .eq("id", orderId)
        .single();

      let tableName: string | null = null;
      let internalNumber: string | null = null;
      if (order?.table_id) {
        const { data: table } = await supabase
          .from("restaurant_tables")
          .select("name, internal_number, default_name")
          .eq("id", order.table_id)
          .single();
        tableName = table?.internal_number || table?.default_name || null;
        internalNumber = table?.internal_number || null;
      }

      const { data: payments } = await supabase
        .from("payments")
        .select("method, amount")
        .eq("order_id", orderId);

      const methodMap: Record<string, string> = { cash: "DINHEIRO", card: "CARTAO", pix: "PIX" };
      const paymentMethod = payments?.[0]?.method
        ? methodMap[payments[0].method] || payments[0].method.toUpperCase()
        : null;

      const { error } = await supabase.from("print_jobs").insert({
        station: "Caixa",
        status: "pending",
        payload: {
          type: "danfe",
          danfe_url: danfeUrl,
          chave_acesso: nfce.chave_acesso || null,
          customer_name: order?.customer_name || null,
          waiter_name: order?.waiter_name || null,
          location: tableName || null,
          table_name: tableName,
          comanda_number: internalNumber,
          origin: (order as any)?.origin || "waiter",
          items: (orderItems || []).map((i: any) => ({
            product_name: i.product_name,
            quantity: i.quantity,
            price: Number(i.price),
          })),
          total: Number(order?.total || 0),
          payment_method: paymentMethod,
          payment_amount: payments?.[0] ? Number(payments[0].amount) : null,
          order_created_at: order?.created_at || null,
        },
      });

      if (error) throw error;
      toast.success("DANFE enviado para impressão!");
    } catch (err) {
      toast.error("Erro ao enviar DANFE para impressão: " + (err as Error).message);
    } finally {
      setIsPrinting(false);
    }
  };

  // Compact non-blocking display
  if (!loaded) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-xs py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        NFC-e...
      </div>
    );
  }

  // No record yet — background emission in progress
  if (!nfce) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          NFC-e emitindo em segundo plano...
        </div>
        <button
          onClick={handleEmit}
          disabled={emitting}
          className="text-xs text-accent hover:underline disabled:opacity-50"
        >
          {emitting ? "Emitindo..." : "Reemitir"}
        </button>
      </div>
    );
  }

  if (nfce.status === "emitida") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
          <CheckCircle className="h-3.5 w-3.5" />
          Nota emitida
        </div>
        <button
          onClick={handlePrint}
          disabled={isPrinting}
          className="flex items-center gap-1 rounded bg-accent text-accent-foreground px-3 py-1 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isPrinting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Printer className="h-3 w-3" />}
          DANFE
        </button>
      </div>
    );
  }

  if (nfce.status === "erro") {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs text-destructive font-medium">
            <AlertCircle className="h-3.5 w-3.5" />
            Erro na NFC-e
          </div>
          <button
            onClick={handleEmit}
            disabled={emitting}
            className="flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-50"
          >
            {emitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Tentar novamente
          </button>
        </div>
        {nfce.error_message && (
          <p className="text-[10px] text-muted-foreground break-words line-clamp-2">{nfce.error_message}</p>
        )}
      </div>
    );
  }

  // pending
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Processando NFC-e...</span>
    </div>
  );
}
