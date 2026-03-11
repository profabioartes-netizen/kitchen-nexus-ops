import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Printer, CheckCircle2, Loader2, Volume2, VolumeX, Coffee, Wifi, WifiOff } from "lucide-react";

// ── Stations that auto-print (production only) ──────────────────────
const AUTO_PRINT_STATIONS = ["Cozinha", "Bebidas", "Sobremesa"];

// ── Ticket HTML Builder (thermal 80mm format) ───────────────────────
function buildTicketHTML(job: any) {
  const p = job.payload as any;
  const time = new Date(job.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = new Date(job.created_at).toLocaleDateString("pt-BR");
  const isCaixa = job.station === "Caixa";

  // For Caixa, payload may contain multiple items (full bill)
  const items = p.items as any[] | undefined;
  const singleItem = !items;

  const complementsHtml = (complements: string[]) =>
    complements?.length ? complements.map((c: string) => `<div class="complement">  + ${c}</div>`).join("") : "";

  const itemsHtml = singleItem
    ? `<div class="item">
         <div class="item-name">${p.quantity || 1}× ${p.product_name}</div>
         ${complementsHtml(p.complements || [])}
         ${p.notes ? `<div class="notes">Obs: ${p.notes}</div>` : ""}
       </div>`
    : (items || []).map((item: any) =>
        `<div class="item">
           <div class="item-row">
             <span>${item.quantity || 1}× ${item.product_name}</span>
             <span>R$ ${((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
           </div>
           ${item.complements?.length ? item.complements.map((c: any) =>
             `<div class="complement">  + ${typeof c === "string" ? c : c.name}${c.price ? ` R$${c.price.toFixed(2)}` : ""}</div>`
           ).join("") : ""}
           ${item.notes ? `<div class="notes">Obs: ${item.notes}</div>` : ""}
         </div>`
      ).join("");

  const totalHtml = p.total != null
    ? `<div class="separator"></div>
       <div class="total-row"><span class="bold">TOTAL</span><span class="bold">R$ ${Number(p.total).toFixed(2)}</span></div>`
    : "";

  return `<!DOCTYPE html>
<html><head><style>
  @page { margin: 0; size: 80mm auto; }
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 4mm; padding: 0; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .separator { border-top: 1px dashed #000; margin: 6px 0; }
  .item { margin: 4px 0; }
  .item-name { font-size: 14px; font-weight: bold; }
  .item-row { display: flex; justify-content: space-between; font-size: 12px; }
  .notes { font-style: italic; font-size: 11px; margin-top: 1px; color: #333; }
  .complement { font-size: 11px; margin-top: 1px; }
  .total-row { display: flex; justify-content: space-between; font-size: 14px; font-weight: bold; margin: 4px 0; }
  h2 { font-size: 16px; margin: 0 0 2px 0; }
  h3 { font-size: 13px; margin: 0; font-weight: normal; letter-spacing: 1px; }
</style></head><body>
  <div class="center">
    <h2>☕ COFFEE THRONES</h2>
    ${isCaixa ? "" : `<h3>${job.station.toUpperCase()}</h3>`}
    <div class="separator"></div>
  </div>
  <div>
    <div><span class="bold">Mesa:</span> ${p.table_name || "Balcão"}</div>
    ${p.waiter_name ? `<div><span class="bold">Garçom:</span> ${p.waiter_name}</div>` : ""}
    ${p.customer_name ? `<div><span class="bold">Cliente:</span> ${p.customer_name}</div>` : ""}
    <div><span class="bold">Data:</span> ${date}  ${time}</div>
  </div>
  <div class="separator"></div>
  ${itemsHtml}
  ${totalHtml}
  <div class="separator"></div>
  <div class="center" style="font-size:10px; margin-top:4px;">
    Ticket #${job.id?.slice(0, 8)}
  </div>
  <div style="height:16px;"></div>
</body></html>`;
}

// ── Ticket Preview (thermal-style card) ─────────────────────────────
function TicketPreview({ job }: { job: any }) {
  const p = job.payload as any;
  const time = new Date(job.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const items = p.items as any[] | undefined;
  const isCaixa = job.station === "Caixa";

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Thermal header */}
      <div className="bg-foreground/5 px-4 py-3 text-center border-b">
        <p className="text-xs font-bold tracking-widest">☕ COFFEE THRONES</p>
        {!isCaixa && <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{job.station}</p>}
      </div>

      <div className="px-4 py-3 space-y-2 text-sm font-mono">
        {/* Meta */}
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Mesa: <span className="text-foreground font-medium">{p.table_name || "Balcão"}</span></span>
          <span>{time}</span>
        </div>
        {p.waiter_name && (
          <p className="text-xs text-muted-foreground">Garçom: <span className="text-foreground">{p.waiter_name}</span></p>
        )}

        <div className="border-t border-dashed border-muted-foreground/30 my-1" />

        {/* Items */}
        {items ? (
          items.map((item: any, i: number) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="font-medium">{item.quantity || 1}× {item.product_name}</span>
              <span className="text-muted-foreground">R$ {((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
            </div>
          ))
        ) : (
          <div>
            <p className="font-semibold">{p.quantity || 1}× {p.product_name}</p>
            {p.complements?.length > 0 && p.complements.map((c: string, i: number) => (
              <p key={i} className="text-xs text-muted-foreground ml-2">+ {c}</p>
            ))}
            {p.notes && <p className="text-xs italic text-muted-foreground">Obs: {p.notes}</p>}
          </div>
        )}

        {p.total != null && (
          <>
            <div className="border-t border-dashed border-muted-foreground/30 my-1" />
            <div className="flex justify-between font-bold text-sm">
              <span>TOTAL</span>
              <span>R$ {Number(p.total).toFixed(2)}</span>
            </div>
          </>
        )}

        <div className="border-t border-dashed border-muted-foreground/30 my-1" />
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
