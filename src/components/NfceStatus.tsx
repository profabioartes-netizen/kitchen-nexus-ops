import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Printer, RefreshCw, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface NfceStatusProps {
  orderId: string;
  onClose?: () => void;
}

export default function NfceStatus({ orderId, onClose }: NfceStatusProps) {
  const queryClient = useQueryClient();

  const { data: nfce, isLoading } = useQuery({
    queryKey: ["nfce", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nfce_records" as any)
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data as any)?.[0] || null;
    },
    refetchInterval: (query) => {
      const d = query.state.data;
      // Keep polling while pending OR while no record yet (auto-emit may be in progress)
      if (!d) return 2000;
      return d?.status === "pending" ? 3000 : false;
    },
  });

  const emitMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("emit-nfce", {
        body: { order_id: orderId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nfce", orderId] });
      toast.success("NFC-e emitida com sucesso!");
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ["nfce", orderId] });
      toast.error("Erro ao emitir NFC-e: " + (err as Error).message);
    },
  });

  const getDanfeUrl = () => {
    if (nfce?.url_danfe) {
      const url = nfce.url_danfe as string;
      // Fix relative paths from Focus NFe
      if (url.startsWith("http")) return url;
      return `https://api.focusnfe.com.br${url}`;
    }
    if (nfce?.reference) return `https://api.focusnfe.com.br/v2/nfce/${encodeURIComponent(nfce.reference)}.html`;
    return null;
  };

  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = async () => {
    const danfeUrl = getDanfeUrl();
    if (!danfeUrl) {
      toast.error("URL da DANFE não disponível.");
      return;
    }

    setIsPrinting(true);
    try {
      // Fetch order items for the DANFE ticket
      const { data: orderItems } = await supabase
        .from("order_items")
        .select("product_name, quantity, price")
        .eq("order_id", orderId);

      const { data: order } = await supabase
        .from("orders")
        .select("total, customer_name, created_at")
        .eq("id", orderId)
        .single();

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
          items: (orderItems || []).map((i: any) => ({
            product_name: i.product_name,
            quantity: i.quantity,
            price: Number(i.price),
          })),
          total: Number(order?.total || 0),
          payment_method: paymentMethod,
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

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando nota fiscal...
      </div>
    );
  }

  // No record yet — auto-emit is likely in progress, show waiting state
  if (!nfce) {
    return (
      <div className="rounded-md border bg-background p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Aguardando emissão da NFC-e...
        </div>
      </div>
    );
  }

  // Has record
  return (
    <div className="rounded-md border bg-background p-3 space-y-2">
      {nfce.status === "emitida" && (
        <>
          <div className="flex items-center gap-2 text-sm text-green-500 font-medium">
            <CheckCircle className="h-4 w-4" />
            Nota emitida
          </div>
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            className="w-full rounded-md bg-accent text-accent-foreground py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isPrinting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
            ) : (
              <><Printer className="h-4 w-4" /> Imprimir DANFE</>
            )}
          </button>
        </>
      )}

      {nfce.status === "erro" && (
        <>
          <div className="flex items-center gap-2 text-sm text-destructive font-medium">
            <AlertCircle className="h-4 w-4" />
            Erro na emissão
          </div>
          {nfce.error_message && (
            <p className="text-xs text-muted-foreground break-words">{nfce.error_message}</p>
          )}
          <button
            onClick={() => emitMutation.mutate()}
            disabled={emitMutation.isPending}
            className="w-full rounded-md bg-accent text-accent-foreground py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {emitMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Reemitindo...</>
            ) : (
              <><RefreshCw className="h-4 w-4" /> Tentar novamente</>
            )}
          </button>
        </>
      )}

      {nfce.status === "pending" && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Processando NFC-e...
        </div>
      )}
    </div>
  );
}
