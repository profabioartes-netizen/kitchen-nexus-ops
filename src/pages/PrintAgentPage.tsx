import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Printer, CheckCircle2, Loader2, Volume2, VolumeX, Coffee, Wifi, WifiOff, RefreshCw } from "lucide-react";

// ── Ticket Builder ──────────────────────────────────────────────────
function buildTicketHTML(job: any) {
  const p = job.payload as any;
  const time = new Date(job.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = new Date(job.created_at).toLocaleDateString("pt-BR");
  const complements = p.complements?.length
    ? p.complements.map((c: string) => `<div class="complement">  + ${c}</div>`).join("")
    : "";

  return `<!DOCTYPE html>
<html><head><style>
  @page { margin: 0; size: 80mm auto; }
  body { font-family: 'Courier New', monospace; font-size: 12px; width: 72mm; margin: 4mm; padding: 0; color: #000; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .separator { border-top: 1px dashed #000; margin: 6px 0; }
  .item-name { font-size: 14px; font-weight: bold; }
  .notes { font-style: italic; font-size: 11px; margin-top: 2px; }
  .complement { font-size: 11px; margin-top: 1px; }
  h2 { font-size: 16px; margin: 0 0 2px 0; }
  h3 { font-size: 13px; margin: 0; font-weight: normal; }
</style></head><body>
  <div class="center">
    <h2>☕ COFFEE THRONES</h2>
    <h3>${job.station.toUpperCase()}</h3>
    <div class="separator"></div>
  </div>
  <div>
    <div><span class="bold">Mesa:</span> ${p.table_name || "—"}</div>
    <div><span class="bold">Garçom:</span> ${p.waiter_name || "—"}</div>
    <div><span class="bold">Data:</span> ${date} ${time}</div>
  </div>
  <div class="separator"></div>
  <div>
    <div class="item-name">${p.quantity || 1}× ${p.product_name}</div>
    ${complements}
    ${p.notes ? `<div class="notes">Obs: ${p.notes}</div>` : ""}
  </div>
  <div class="separator"></div>
  <div class="center" style="font-size:10px; margin-top:4px;">Ticket #${job.id?.slice(0, 8)}</div>
</body></html>`;
}

// ── Pending Job Card ────────────────────────────────────────────────
function PendingJobCard({ job, printerName, onPrint }: { job: any; printerName: string; onPrint: () => void }) {
  const p = job.payload as any;
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-accent">{job.station}</span>
        <span className="text-[10px] text-muted-foreground">
          {new Date(job.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <p className="font-medium text-sm">{p?.quantity || 1}× {p?.product_name}</p>
      {p?.complements?.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {p.complements.map((c: string, i: number) => <div key={i}>+ {c}</div>)}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Mesa: {p?.table_name || "—"}</p>
      {p?.notes && <p className="text-xs italic text-muted-foreground">Obs: {p.notes}</p>}
      <div className="text-[10px] text-muted-foreground">→ {printerName}</div>
      <button
        onClick={onPrint}
        className="mt-auto flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground py-2 text-sm font-medium hover:opacity-90"
      >
        <Printer className="h-4 w-4" />
        Imprimir
      </button>
    </div>
  );
}

// ── Recent Job Row ──────────────────────────────────────────────────
function RecentJobRow({ job }: { job: any }) {
  const p = job.payload as any;
  return (
    <div className="flex items-center gap-3 rounded-md bg-card px-3 py-2 text-sm">
      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--status-free))] shrink-0" />
      <span className="font-medium">{p?.product_name}</span>
      <span className="text-muted-foreground">— {job.station}</span>
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
        .limit(20);
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

  const printJob = useCallback((job: any) => {
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

  // Auto-print
  useEffect(() => {
    if (!autoprint || jobs.length === 0) return;
    for (const job of jobs) {
      if (!processedIds.current.has(job.id)) {
        processedIds.current.add(job.id);
        if (soundEnabled) {
          try {
            const audio = new Audio("data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Lk42GfHN3gIyUkIZ8c3R9i5aTjYJ4cHV/jJiUjIF3bnN8i5mWjoR6cHR8ipqYkIN5bnJ6iJmZkoV7cXN6h5eYk4Z8c3V7h5WVkYR7c3d9iZSSkIJ6c3l/i5STj4F5cnl/jJWUj4B3cHh+jJeVkIF4cHd8i5aVkoN7cnZ6iJSUk4V+dXl8h5KRkIR9d3t/iJGPjYJ8eX2Ci5GPjIF7eHuAipKRjoF6d3p+iZORj4N8eHt+h5CQjoN9en2Ah4+OjIF7en6Ch4+NjIB6eX2Ch5CPjYF6eHuAhpCQj4N8eXuAhY6OjYJ8eXyBho6NjIB6eXyChpCPjYF7eXuAhY+PjoJ8eXyBhY6NjIF7eXyBh4+PjYJ7eHqAhY+QkIR9eXuAhI2MjIF8enyChpCPjYB6eHqAhpGRkIR8eXuAhI2MjIJ9e32Ch5CQjoB6eHqAhpGRkYV9enyBhIyLi4F8fH6DiZKRj4F6eHmAhZGSkYV+e3yBhIuKioF8fH+EipOTkYJ7eXmAhJCSkoZ/fH2Cg4qJiYB8foCFi5WVk4N8eXmAg4+RkoaAfn6Dg4mIh398f4GGjZaXlYR9eXl/go6QkYaAf3+EhImIh357foGGjpmbl4Z/enl/gYyOjoSAf4GGhomKiX99f4KHj5qcmIaAe3l/gIuMjYOAfYGGh4qLin9+f4OIkJudmYeBfHp/gIqLjIOAfYGHiIuMi4B+f4OJkZyemYiCfXuAgIqKi4J/fIGHiYyNjIB/f4OJkp2fmomDfnyBgImJioF+e4CHioyOjYGAf4SKk56gmomEf32BgIiIiIF+e4CIi42PjoGAgISKk5+hmomFf32BgYeHh4B9eoCIi46QkIKBgISKlKCimoqFgH6BgoeHhn97eoCIjI+QkYOCgIWLlKGjm4uGgH6CgoaGhX96eX+Ij5GSkoPCgIWLlKKkm4yHgX+CgoeGhH55eX6Ij5OUlITDgYaLlaOlnI2IgoGDg4aFg315eH6IkJSWloXEgoeLlaSlnY6Jg4KEhIaEgnt4eH6IkZaYmIbFg4eLlqWmnY+KhIOFhoaFgnp3d36JkpeamojGhIiMl6alnpCLhYOGh4eFgXl2dn6Jk5mcm4nHhYmNmKenn5KMhoSIiYiFgHh1dn+KlZqem4nIhomOmqqwoJONh4WIiomFf3d0dX+KlpygnYrJh4qPm6yxoZSOiIaKjIqFfnZzdX+LmJ6ioIvKiIqQnK2zopWQiYeKjYuFfXVyc3+Lmp+io4zLiYuRnq+1o5aSioiMj4yFenJwcn+Nnq");
            audio.volume = 0.5;
            audio.play().catch(() => {});
          } catch {}
        }
        printJob(job);
        break;
      }
    }
  }, [jobs, autoprint, soundEnabled, printJob]);

  const getPrinterName = (station: string) => {
    const printer = printers.find((p) => p.station === station);
    return printer ? `${printer.name} (${printer.ip})` : "Sem impressora";
  };

  const todayPrintedCount = recentJobs.length;

  return (
    <div className="p-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
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
              Mantenha esta página aberta no computador conectado às impressoras térmicas.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              soundEnabled ? "bg-accent/10 text-accent" : "bg-card text-muted-foreground"
            }`}
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
            {autoprint ? "Ativo" : "Pausado"}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{jobs.length}</p>
          <p className="text-xs text-muted-foreground">Na fila</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold text-[hsl(var(--status-free))]">{todayPrintedCount}</p>
          <p className="text-xs text-muted-foreground">Impressos recentes</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold">{printers.length}</p>
          <p className="text-xs text-muted-foreground">Impressoras</p>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <p className="text-2xl font-bold">
            {printers.map((p) => p.station).filter((v, i, a) => a.indexOf(v) === i).length}
          </p>
          <p className="text-xs text-muted-foreground">Estações</p>
        </div>
      </div>

      {/* Printers status */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {printers.map((p) => (
          <div key={p.id} className="flex items-center gap-1.5 rounded-full bg-card border px-3 py-1 text-xs">
            <Printer className="h-3 w-3 text-accent" />
            <span className="font-medium">{p.station}</span>
            <span className="text-muted-foreground">— {p.name} ({p.ip})</span>
          </div>
        ))}
        {printers.length === 0 && (
          <p className="text-xs text-muted-foreground italic">Nenhuma impressora ativa. Configure em /impressoras</p>
        )}
      </div>

      {/* Pending jobs */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-2">
          Fila ({jobs.length} pendente{jobs.length !== 1 ? "s" : ""})
          {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
        </h2>
        {jobs.length === 0 ? (
          <div className="rounded-lg border bg-card p-8 flex flex-col items-center gap-2">
            <CheckCircle2 className="h-8 w-8 text-[hsl(var(--status-free))]" />
            <p className="text-sm text-muted-foreground">Nenhum ticket pendente</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {jobs.map((job) => (
              <PendingJobCard
                key={job.id}
                job={job}
                printerName={getPrinterName(job.station)}
                onPrint={() => printJob(job)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Recent printed */}
      <div className="flex-1 overflow-auto">
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

      {/* Desktop agent info */}
      <div className="mt-4 rounded-lg border border-dashed border-muted-foreground/30 p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Agente Desktop (ESC/POS)</h3>
        <p className="text-xs text-muted-foreground">
          Para impressão direta via rede TCP, instale o agente Node.js no notebook do caixa:{" "}
          <code className="bg-secondary px-1 py-0.5 rounded text-[11px]">cd print-agent && npm install && npm start</code>
        </p>
      </div>

      <iframe ref={printFrameRef} className="hidden" title="print-frame" />
    </div>
  );
}
