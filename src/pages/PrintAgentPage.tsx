import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Printer, CheckCircle2, Loader2, Volume2, VolumeX, Coffee, Wifi, WifiOff, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Stations that auto-print (production only) ──────────────────────
const AUTO_PRINT_STATIONS = ["Cozinha", "Bebidas", "Sobremesa"];

const CNPJ = "00.000.000/0001-00"; // TODO: Replace with real CNPJ

const THERMAL_CSS = `
  @page { margin: 0; size: 80mm auto; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 4mm; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .sep-double { border-top: 2px solid #000; margin: 6px 0; }
  .title { font-size: 18px; font-weight: bold; letter-spacing: 2px; }
  .subtitle { font-size: 14px; font-weight: bold; letter-spacing: 1px; }
  .item-big { font-size: 16px; font-weight: bold; }
  .row { display: flex; justify-content: space-between; font-size: 12px; }
  .complement { font-size: 11px; margin-left: 12px; }
  .notes { font-style: italic; font-size: 11px; margin-left: 12px; }
  .total { font-size: 16px; font-weight: bold; }
  .footer-msg { font-size: 11px; font-style: italic; margin-top: 4px; }
  .small { font-size: 10px; color: #555; }
`;

function buildMedievalHeader(stationLine?: string) {
  return `
    <div class="center">
      <div class="sep-double"></div>
      <div class="title">REINO</div>
      <div class="title">COFFEE THRONES</div>
      <div class="sep-double"></div>
      ${stationLine ? `<div class="subtitle">${stationLine}</div>` : ""}
    </div>`;
}

// ── 1) Cashier receipt (bill) ───────────────────────────────────────
function buildBillHTML(job: any) {
  const p = job.payload as any;
  const now = new Date(job.created_at);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");
  const items = (p.items || []) as any[];
  const methods: Record<string, string> = { credit: "Crédito", debit: "Débito", cash: "Dinheiro", pix: "Pix" };

  let subtotal = 0;
  const itemsHtml = items.map((item: any) => {
    const qty = item.quantity || 1;
    const itemTotal = (item.price || 0) * qty;
    subtotal += itemTotal;
    const compHtml = (item.complements || []).map((c: any) =>
      `<div class="complement">+ ${typeof c === "string" ? c : c.name}${c.price ? ` R$${Number(c.price).toFixed(2)}` : ""}</div>`
    ).join("");
    const notesHtml = item.notes ? `<div class="notes">OBS: ${item.notes}</div>` : "";
    return `<div class="row"><span>${qty}x ${item.product_name}</span><span>R$ ${itemTotal.toFixed(2)}</span></div>${compHtml}${notesHtml}`;
  }).join("");

  return `<!DOCTYPE html><html><head><style>${THERMAL_CSS}</style></head><body>
    ${buildMedievalHeader()}
    <div class="center small">CNPJ: ${CNPJ}</div>
    <div class="center small">São José dos Salgados - MG</div>
    <div class="sep"></div>
    <div class="center subtitle">REGISTRO DA COMANDA</div>
    <div class="sep"></div>
    <div>
      ${p.customer_name ? `<div>CLIENTE: ${p.customer_name}</div>` : ""}
      ${p.comanda_number ? `<div>COMANDA: #${p.comanda_number}</div>` : ""}
      ${p.table_name ? `<div>MESA: ${p.table_name}</div>` : ""}
      ${p.waiter_name ? `<div>ATENDENTE: ${p.waiter_name}</div>` : ""}
      <div>DATA: ${date}  HORA: ${time}</div>
    </div>
    <div class="sep"></div>
    <div class="row bold"><span>ITEM</span><span>TOTAL</span></div>
    <div class="sep"></div>
    ${itemsHtml}
    <div class="sep"></div>
    <div class="row"><span>SUBTOTAL:</span><span>R$ ${(p.subtotal || subtotal).toFixed(2)}</span></div>
    <div class="sep-double"></div>
    <div class="center total" style="margin:6px 0;"><b>TOTAL A PAGAR: R$ ${Number(p.total || subtotal).toFixed(2)}</b></div>
    <div class="sep-double"></div>
    ${p.payment_method ? `<div>PAGAMENTO: ${methods[p.payment_method] || p.payment_method}</div>` : ""}
    ${p.change && Number(p.change) > 0 ? `<div>TROCO: R$ ${Number(p.change).toFixed(2)}</div>` : ""}
    <div class="sep"></div>
    <div class="center small">DOCUMENTO SEM VALOR FISCAL</div>
    <div class="sep"></div>
    <div style="margin-top:12px;"></div>
    <div class="center" style="font-size:12px;">⚜ ⚔ ⚜</div>
    <div style="margin-top:6px;"></div>
    <div class="center" style="font-size:11px;">Obrigado por visitar o</div>
    <div class="center bold subtitle">REINO COFFEE THRONES</div>
    <div style="margin-top:6px;"></div>
    <div class="center" style="font-size:11px;">⚔ No Reino Coffee Thrones</div>
    <div class="center" style="font-size:11px;">cada xícara conta</div>
    <div class="center" style="font-size:11px;">uma nova história. ⚔</div>
    <div style="margin-top:6px;"></div>
    <div class="center bold" style="font-size:11px;">Retorne ao Reino</div>
    <div class="center bold" style="font-size:11px;">em breve!</div>
    <div style="margin-top:6px;"></div>
    <div class="center" style="font-size:11px;">Compartilhe sua visita</div>
    <div class="center bold" style="font-size:11px;">@coffeethrones</div>
    <div style="margin-top:6px;"></div>
    <div class="center" style="font-size:12px;">⚔ ☕ ⚔</div>
    <div style="margin-top:4px;"></div>
    <div class="center" style="font-size:12px;">⚜ ⚔ ⚜</div>
    <div class="sep"></div>
    <div class="center small">Ticket #${job.id?.slice(0, 8)}</div>
    <div style="height:16px;"></div>
  </body></html>`;
}

// ── 2) Production ticket ────────────────────────────────────────────
function buildProductionHTML(job: any) {
  const p = job.payload as any;
  const now = new Date(job.created_at);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  const compHtml = (p.complements || []).map((c: string) => `<div class="complement">+ ${c}</div>`).join("");

  return `<!DOCTYPE html><html><head><style>${THERMAL_CSS}</style></head><body>
    ${buildMedievalHeader(job.station.toUpperCase())}
    <div class="sep"></div>
    <div>
      ${p.table_name ? `<div>MESA: ${p.table_name}</div>` : ""}
      ${p.comanda_number ? `<div>COMANDA: #${p.comanda_number}</div>` : ""}
      ${p.waiter_name ? `<div>GARÇOM: ${p.waiter_name}</div>` : ""}
      <div>HORA: ${time}  ${date}</div>
    </div>
    <div class="sep"></div>
    <div class="center item-big">${p.quantity || 1}× ${p.product_name || "Item"}</div>
    ${compHtml}
    ${p.notes ? `<div class="bold" style="margin-left:0;">OBS: ${p.notes}</div>` : ""}
    <div class="sep"></div>
    <div class="center small">Ticket #${job.id?.slice(0, 8)}</div>
    <div style="height:16px;"></div>
  </body></html>`;
}

// ── 3) Cancellation ticket ──────────────────────────────────────────
function buildCancellationHTML(job: any) {
  const p = job.payload as any;
  const now = new Date(job.created_at);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  return `<!DOCTYPE html><html><head><style>${THERMAL_CSS}</style></head><body>
    ${buildMedievalHeader(job.station.toUpperCase())}
    <div class="sep-double"></div>
    <div class="center" style="margin:6px 0;">
      <div class="title" style="letter-spacing:3px;"><b>*** CANCELAMENTO ***</b></div>
    </div>
    <div class="sep-double"></div>
    <div>
      ${p.table_name ? `<div>MESA: ${p.table_name}</div>` : ""}
      ${p.comanda_number ? `<div>COMANDA: #${p.comanda_number}</div>` : ""}
      ${p.waiter_name ? `<div>GARÇOM: ${p.waiter_name}</div>` : ""}
      <div>HORA: ${time}  ${date}</div>
    </div>
    <div class="sep-double"></div>
    <div class="center bold" style="font-size:14px;">CANCELAR:</div>
    <div class="center item-big">${p.quantity || 1}× ${p.product_name || "Item"}</div>
    ${p.notes ? `<div class="center" style="margin-top:4px;">MOTIVO: ${p.notes}</div>` : `<div class="center" style="margin-top:4px;">ITEM REMOVIDO DA COMANDA</div>`}
    <div class="sep-double"></div>
    <div class="center small">Ticket #${job.id?.slice(0, 8)}</div>
    <div style="height:16px;"></div>
  </body></html>`;
}

// ── HTML Dispatcher ─────────────────────────────────────────────────
function buildTicketHTML(job: any) {
  const p = job.payload as any;
  if (p.type === "cancellation") return buildCancellationHTML(job);
  if (p.type === "bill") return buildBillHTML(job);
  return buildProductionHTML(job);
}

// ── Ticket Preview (thermal-style card) ─────────────────────────────
function TicketPreview({ job }: { job: any }) {
  const p = job.payload as any;
  const time = new Date(job.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = new Date(job.created_at).toLocaleDateString("pt-BR");
  const isCaixa = job.station === "Caixa";
  const isCancellation = p.type === "cancellation";
  const isBill = p.type === "bill";
  const items = p.items as any[] | undefined;

  return (
    <div className={`rounded-lg border overflow-hidden font-mono text-xs ${isCancellation ? "border-destructive/50 bg-destructive/5" : "bg-card"}`}>
      {/* Medieval header */}
      <div className={`px-4 py-3 text-center ${isCancellation ? "bg-destructive/10 border-b-2 border-destructive/30" : "bg-foreground/5 border-b-2 border-foreground/20"}`}>
        <p className="text-[10px] font-bold tracking-[0.3em]">═══════════════════</p>
        <p className="text-sm font-bold tracking-[0.2em]">REINO</p>
        <p className="text-sm font-bold tracking-[0.15em]">COFFEE THRONES</p>
        <p className="text-[10px] font-bold tracking-[0.3em]">═══════════════════</p>
        {isCancellation && (
          <p className="text-xs font-bold text-destructive tracking-widest mt-1">*** CANCELAMENTO ***</p>
        )}
        {isBill && (
          <>
            <p className="text-[10px] text-muted-foreground mt-0.5">CNPJ: {CNPJ}</p>
            <p className="text-[10px] text-muted-foreground">São José dos Salgados - MG</p>
          </>
        )}
        {!isCaixa && !isCancellation && !isBill && (
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{job.station}</p>
        )}
        {isCancellation && (
          <p className="text-[10px] text-destructive uppercase tracking-wider mt-0.5">{job.station}</p>
        )}
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {/* Bill subtitle */}
        {isBill && (
          <>
            <p className="text-center font-bold text-xs tracking-wide uppercase">REGISTRO DA COMANDA</p>
            <div className="border-t border-dashed border-muted-foreground/30" />
          </>
        )}

        {/* Meta info — uppercase labels */}
        {p.customer_name && <p className="text-muted-foreground uppercase">CLIENTE: <span className="text-foreground font-medium">{p.customer_name}</span></p>}
        {p.comanda_number && <p className="text-muted-foreground uppercase">COMANDA: <span className="text-foreground font-medium">#{p.comanda_number}</span></p>}
        <div className="flex justify-between text-muted-foreground uppercase">
          <span>MESA: <span className="text-foreground font-medium">{p.table_name || "Balcão"}</span></span>
          <span className="normal-case">{time}</span>
        </div>
        {p.waiter_name && <p className="text-muted-foreground uppercase">ATENDENTE: <span className="text-foreground font-medium">{p.waiter_name}</span></p>}
        <p className="text-muted-foreground text-[10px]">{date}</p>

        <div className="border-t border-dashed border-muted-foreground/30" />

        {/* Cancellation content */}
        {isCancellation ? (
          <div className="text-center py-2">
            <div className="border-b-2 border-destructive/40 pb-1 mb-2">
              <p className="font-bold text-destructive text-sm uppercase tracking-wider">CANCELAR:</p>
            </div>
            <p className="font-bold text-destructive text-base">{p.quantity || 1}× {p.product_name?.toUpperCase()}</p>
            <div className="border-t border-dashed border-destructive/30 mt-2 pt-1">
              <p className="text-[10px] italic text-muted-foreground">{p.notes || "ITEM REMOVIDO DA COMANDA"}</p>
            </div>
          </div>
        ) : items ? (
          /* Bill items list */
          <>
            <div className="flex justify-between font-bold uppercase">
              <span>ITEM</span><span>TOTAL</span>
            </div>
            <div className="border-t border-dashed border-muted-foreground/30" />
            {items.map((item: any, i: number) => (
              <div key={i}>
                <div className="flex justify-between">
                  <span className="font-medium">{item.quantity || 1}× {item.product_name}</span>
                  <span className="text-muted-foreground">R$ {((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
                </div>
                {item.complements?.map((c: any, ci: number) => (
                  <p key={ci} className="text-[10px] text-muted-foreground ml-2">+ {typeof c === "string" ? c : c.name}</p>
                ))}
                {item.notes && <p className="text-[10px] italic text-muted-foreground ml-2 uppercase">OBS: {item.notes}</p>}
              </div>
            ))}
          </>
        ) : (
          /* Production single item */
          <div className="text-center py-1">
            <p className="font-bold text-sm uppercase">{p.quantity || 1}× {p.product_name}</p>
            {p.complements?.length > 0 && p.complements.map((c: string, i: number) => (
              <p key={i} className="text-[10px] text-muted-foreground">+ {c}</p>
            ))}
            {p.notes && <p className="text-[10px] italic text-muted-foreground font-bold uppercase">OBS: {p.notes}</p>}
          </div>
        )}

        {/* Totals for bills — bold emphasis */}
        {p.total != null && (
          <>
            <div className="border-t-2 border-foreground/30" />
            <div className="flex justify-between font-bold text-sm py-1">
              <span className="uppercase">TOTAL A PAGAR</span>
              <span className="text-base">R$ {Number(p.total).toFixed(2)}</span>
            </div>
            <div className="border-t-2 border-foreground/30" />
          </>
        )}

        <div className="border-t border-dashed border-muted-foreground/30" />

        {/* Bill footer */}
        {isBill && (
          <>
            <p className="text-center text-[10px] text-muted-foreground uppercase tracking-wide">DOCUMENTO SEM VALOR FISCAL</p>
            <div className="border-t border-dashed border-muted-foreground/30" />
            <div className="mt-4 mb-1 text-center space-y-0.5">
              <p className="text-xs">⚜ ⚔ ⚜</p>
              <p className="text-[10px] text-muted-foreground mt-1">Obrigado por visitar o</p>
              <p className="text-xs font-bold tracking-wide">REINO COFFEE THRONES</p>
              <p className="text-[10px] text-muted-foreground mt-1.5">⚔ No Reino Coffee Thrones</p>
              <p className="text-[10px] text-muted-foreground">cada xícara conta</p>
              <p className="text-[10px] text-muted-foreground">uma nova história. ⚔</p>
              <p className="text-[10px] font-bold mt-1.5">Retorne ao Reino</p>
              <p className="text-[10px] font-bold">em breve!</p>
              <p className="text-[10px] text-muted-foreground mt-1.5">Compartilhe sua visita</p>
              <p className="text-[10px] font-bold">@coffeethrones</p>
              <p className="text-xs mt-1.5">⚔ ☕ ⚔</p>
              <p className="text-xs mt-0.5">⚜ ⚔ ⚜</p>
            </div>
            <div className="border-t border-dashed border-muted-foreground/30" />
          </>
        )}

        <p className="text-center text-[10px] text-muted-foreground">#{job.id?.slice(0, 8)}</p>
      </div>
    </div>
  );
}

// ── Recent Job Row ──────────────────────────────────────────────────
function RecentJobRow({ job }: { job: any }) {
  const p = job.payload as any;
  const isCaixa = job.station === "Caixa";
  return (
    <div className="flex items-center gap-3 rounded-md bg-card px-3 py-2 text-sm">
      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-free))] shrink-0" />
      <span className="font-medium">{isCaixa ? (p.table_name || "Balcão") : (p?.product_name || "Ticket")}</span>
      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
        isCaixa ? "bg-accent/10 text-accent" : "bg-secondary text-muted-foreground"
      }`}>{job.station}</span>
      <span className="text-xs text-muted-foreground ml-auto">
        {job.printed_at && new Date(job.printed_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
      </span>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────
export default function PrintAgentPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [autoprint, setAutoprint] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const processedIds = useRef<Set<string>>(new Set());

  // Printers
  const { data: printers = [] } = useQuery({
    queryKey: ["printers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("printers").select("*").eq("active", true);
      if (error) throw error;
      return data;
    },
  });

  // Pending jobs
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["print_jobs_pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("print_jobs")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
    refetchInterval: 3000,
  });

  // Recent printed
  const { data: recentJobs = [] } = useQuery({
    queryKey: ["print_jobs_recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("print_jobs")
        .select("*")
        .eq("status", "printed")
        .order("printed_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("print_jobs_realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "print_jobs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["print_jobs_pending"] });
      })
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const markPrinted = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("print_jobs")
        .update({ status: "printed", printed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print_jobs_pending"] });
      queryClient.invalidateQueries({ queryKey: ["print_jobs_recent"] });
    },
  });

  const clearQueue = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("print_jobs")
        .delete()
        .in("status", ["pending", "processing"]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print_jobs_pending"] });
      queryClient.invalidateQueries({ queryKey: ["print_jobs_recent"] });
      toast({
        title: "Fila de impressão limpa com sucesso",
        description: "Todos os pedidos pendentes foram removidos.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao limpar fila",
        description: "Não foi possível limpar a fila de impressão.",
        variant: "destructive",
      });
    },
  });

  const doPrint = useCallback((job: any) => {
    const html = buildTicketHTML(job);
    const iframe = printFrameRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    setTimeout(() => {
      iframe.contentWindow?.print();
      markPrinted.mutate(job.id);
    }, 300);
  }, [markPrinted]);

  // Auto-print: ONLY production stations (not Caixa)
  useEffect(() => {
    if (!autoprint || jobs.length === 0) return;
    for (const job of jobs) {
      if (!processedIds.current.has(job.id)) {
        // Skip Caixa — it requires manual action
        if (!AUTO_PRINT_STATIONS.includes(job.station)) {
          continue;
        }
        processedIds.current.add(job.id);
        if (soundEnabled) {
          try {
            const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Lk42GfHN3gIyUkIZ8c3R9i5aTjYJ4cHV/jJiUjIF3bnN8i5mWjoR6cHR8ipqYkIN5bnJ6iJmZkoV7cXN6h5eYk4Z8c3V7h5WVkYR7c3d9iZSSkIJ6c3l/i5STj4F5cnl/jJWUj4B3cHh+jJeVkIF4cHd8i5aVkoN7cnZ6iJSUk4V+dXl8h5KRkIR9d3t/iJGPjYJ8eX2Ci5GPjIF7eHuAipKRjoF6d3p+iZORj4N8eHt+h5CQjoN9en2Ah4+OjIF7en6Ch4+NjIB6eX2Ch5CPjYF6eHuAhpCQj4N8eXuAhY6OjYJ8eXyBho6NjIB6eXyChpCPjYF7eXuAhY+PjoJ8eXyBhY6NjIF7eXyBh4+PjYJ7eHqAhY+QkIR9eXuAhI2MjIF8enyChpCPjYB6eHqAhpGRkIR8eXuAhI2MjIJ9e32Ch5CQjoB6eHqAhpGRkYV9enyBhIyLi4F8fH6DiZKRj4F6eHmAhZGSkYV+e3yBhIuKioF8fH+EipOTkYJ7eXmAhJCSkoZ/fH2Cg4qJiYB8foCFi5WVk4N8eXmAg4+RkoaAfn6Dg4mIh398f4GGjZaXlYR9eXl/go6QkYaAf3+EhImIh357foGGjpmbl4Z/enl/gYyOjoSAf4GGhomKiX99f4KHj5qcmIaAe3l/gIuMjYOAfYGGh4qLin9+f4OIkJudmYeBfHp/gIqLjIOAfYGHiIuMi4B+f4OJkZyemYiCfXuAgIqKi4J/fIGHiYyNjIB/f4OJkp2fmomDfnyBgImJioF+e4CHioyOjYGAf4SKk56gmomEf32BgIiIiIF+e4CIi42PjoGAgISKk5+hmomFf32BgYeHh4B9eoCIi46QkIKBgISKlKCimoqFgH6BgoeHhn97eoCIjI+QkYOCgIWLlKGjm4uGgH6CgoaGhX96eX+Ij5GSkoPCgIWLlKKkm4yHgX+CgoeGhH55eX6Ij5OUlITDgYaLlaOlnI2IgoGDg4aFg315eH6IkJSWloXEgoeLlaSlnY6Jg4KEhIaEgnt4eH6IkZaYmIbFg4eLlqWmnY+KhIOFhoaFgnp3d36JkpeamojGhIiMl6alnpCLhYOGh4eFgXl2dn6Jk5mcm4nHhYmNmKenn5KMhoSIiYiFgHh1dn+KlZqem4nIhomOmqqwoJONh4WIiomFf3d0dX+KlpygnYrJh4qPm6yxoZSOiIaKjIqFfnZzdX+LmJ6ioIvKiIqQnK2zopWQiYeKjYuFfXVyc3+Lmp+io4zLiYuRnq+1o5aSioiMj4yFenJwcn+Nnq");
            audio.volume = 0.5;
            audio.play().catch(() => {});
          } catch {}
        }
        doPrint(job);
        break;
      }
    }
  }, [jobs, autoprint, soundEnabled, doPrint]);

  const getPrinterName = (station: string) => {
    const printer = printers.find((p) => p.station === station);
    return printer ? printer.name : "Sem impressora";
  };

  // Split jobs
  const productionJobs = jobs.filter((j) => AUTO_PRINT_STATIONS.includes(j.station));
  const caixaJobs = jobs.filter((j) => j.station === "Caixa");
  const pendingCount = jobs.length;

  return (
    <div className="p-6 h-full flex flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
            <Coffee className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              Agente de Impressão
              <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                {realtimeConnected ? (
                  <><Wifi className="h-3 w-3 text-[hsl(var(--status-free))]" /> Conectado</>
                ) : (
                  <><WifiOff className="h-3 w-3 text-destructive" /> Desconectado</>
                )}
              </span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Produção imprime automaticamente · Caixa imprime sob demanda
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              soundEnabled ? "bg-accent/10 text-accent" : "bg-card text-muted-foreground"
            }`}
            title={soundEnabled ? "Som ligado" : "Som desligado"}
          >
            {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setAutoprint(!autoprint)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              autoprint ? "bg-[hsl(var(--status-free)/0.15)] text-[hsl(var(--status-free))]" : "bg-destructive/10 text-destructive"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${autoprint ? "bg-[hsl(var(--status-free))] animate-pulse" : "bg-destructive"}`} />
            {autoprint ? "Auto (Produção)" : "Pausado"}
          </button>
        </div>
      </div>

      {/* Printers strip */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {printers.map((p) => {
          const isProduction = AUTO_PRINT_STATIONS.includes(p.station);
          return (
            <div key={p.id} className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs bg-card">
              <Printer className="h-3 w-3 text-accent" />
              <span className="font-medium">{p.station}</span>
              <span className="text-muted-foreground">— {p.name}</span>
              <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                isProduction
                  ? "bg-[hsl(var(--status-free)/0.12)] text-[hsl(var(--status-free))]"
                  : "bg-accent/10 text-accent"
              }`}>
                {isProduction ? "Auto" : "Manual"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{productionJobs.length}</p>
          <p className="text-xs text-muted-foreground">Produção</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-accent">{caixaJobs.length}</p>
          <p className="text-xs text-muted-foreground">Caixa (manual)</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-[hsl(var(--status-free))]">{recentJobs.length}</p>
          <p className="text-xs text-muted-foreground">Impressos</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{printers.length}</p>
          <p className="text-xs text-muted-foreground">Impressoras</p>
        </div>
      </div>

      {/* Production queue (auto-print) */}
      {productionJobs.length > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-2">
            🔥 Produção — {productionJobs.length} pendente{productionJobs.length !== 1 ? "s" : ""}
            {autoprint && <span className="text-[10px] text-[hsl(var(--status-free))] font-normal">(auto-imprimindo)</span>}
            {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {productionJobs.map((job) => (
              <div key={job.id} className="relative">
                <TicketPreview job={job} />
                <div className="px-4 pb-3">
                  <div className="text-[10px] text-muted-foreground mb-2">→ {getPrinterName(job.station)}</div>
                  <button
                    onClick={() => doPrint(job)}
                    className="w-full flex items-center justify-center gap-2 rounded-md bg-secondary text-secondary-foreground py-1.5 text-xs font-medium hover:opacity-90"
                  >
                    <Printer className="h-3 w-3" />
                    Reimprimir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Caixa queue (manual only) */}
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-2">
          🧾 Caixa — {caixaJobs.length} pendente{caixaJobs.length !== 1 ? "s" : ""}
          <span className="text-[10px] text-accent font-normal">(impressão manual)</span>
        </h2>
        {caixaJobs.length === 0 ? (
          <div className="rounded-lg border bg-card p-6 flex flex-col items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-[hsl(var(--status-free))]" />
            <p className="text-sm text-muted-foreground">Nenhum recibo pendente</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {caixaJobs.map((job) => (
              <div key={job.id}>
                <TicketPreview job={job} />
                <div className="px-4 pb-3 pt-2">
                  <div className="text-[10px] text-muted-foreground mb-2">→ {getPrinterName(job.station)}</div>
                  <button
                    onClick={() => doPrint(job)}
                    className="w-full flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground py-2 text-sm font-medium hover:opacity-90"
                  >
                    <Printer className="h-4 w-4" />
                    Imprimir Recibo
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Empty production state */}
      {productionJobs.length === 0 && (
        <div className="rounded-lg border bg-card p-6 flex flex-col items-center gap-2 mb-5">
          <CheckCircle2 className="h-6 w-6 text-[hsl(var(--status-free))]" />
          <p className="text-sm text-muted-foreground">Nenhum ticket de produção pendente</p>
        </div>
      )}

      {/* Recent printed */}
      <div className="flex-1 min-h-0">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
          Impressos recentes
        </h2>
        <div className="space-y-1">
          {recentJobs.map((job) => (
            <RecentJobRow key={job.id} job={job} />
          ))}
          {recentJobs.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-4 text-center">Nenhum ticket impresso ainda</p>
          )}
        </div>
      </div>

      <iframe ref={printFrameRef} className="hidden" title="print-frame" />
    </div>
  );
}
