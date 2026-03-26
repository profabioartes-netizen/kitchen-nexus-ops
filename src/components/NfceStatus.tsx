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
    if (nfce?.url_danfe) return nfce.url_danfe;
    if (nfce?.reference) return `https://api.focusnfe.com.br/v2/nfce/${encodeURIComponent(nfce.reference)}.html`;
    return null;
  };

  const handlePrint = () => {
    const url = getDanfeUrl();
    if (url) window.open(url, "_blank");
    else toast.error("URL da DANFE não disponível.");
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando nota fiscal...
      </div>
    );
  }

  // No record yet — show emit button
  if (!nfce) {
    return (
      <div className="rounded-md border bg-background p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          NFC-e não emitida
        </div>
        <button
          onClick={() => emitMutation.mutate()}
          disabled={emitMutation.isPending}
          className="w-full rounded-md bg-accent text-accent-foreground py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {emitMutation.isPending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Emitindo...</>
          ) : (
            <><FileText className="h-4 w-4" /> Emitir NFC-e</>
          )}
        </button>
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
            className="w-full rounded-md bg-accent text-accent-foreground py-2 text-sm font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            <Printer className="h-4 w-4" />
            Imprimir DANFE
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
