import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Printer, Plus, Edit2, Trash2, X, Loader2, Trash, Power, AlertTriangle, RotateCcw, XCircle } from "lucide-react";

export default function PrintersPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", station: "Caixa", model: "", ip: "", port: "9100" });
  const [agentActive, setAgentActive] = useState(true);

  const { data: printers = [], isLoading } = useQuery({
    queryKey: ["printers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("printers").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

  // Fetch all non-printed jobs for queue display
  const { data: activeJobs = [] } = useQuery({
    queryKey: ["print_jobs_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("print_jobs")
        .select("*")
        .in("status", ["pending", "processing", "error"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
    refetchInterval: 3000,
  });

  const pendingCount = activeJobs.filter((j) => j.status === "pending" || j.status === "processing").length;
  const errorCount = activeJobs.filter((j) => j.status === "error").length;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        station: form.station,
        model: form.model,
        ip: form.ip,
        port: parseInt(form.port) || 9100,
      };
      if (editing) {
        const { error } = await supabase.from("printers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("printers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printers"] });
      setShowForm(false);
      toast.success("Impressora salva");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const toggleActive = useMutation({
    mutationFn: async (p: any) => {
      const { error } = await supabase.from("printers").update({ active: !p.active }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["printers"] }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("printers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printers"] });
      toast.success("Impressora removida");
    },
  });

  const clearQueueMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("print_jobs")
        .delete()
        .in("status", ["pending", "processing", "error"]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print_jobs_active"] });
      toast.success("Fila de impressão limpa com sucesso");
    },
    onError: () => toast.error("Erro ao limpar fila de impressão"),
  });

  const reprintMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from("print_jobs")
        .update({ status: "pending", printed_at: null })
        .eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print_jobs_active"] });
      toast.success("Job reenviado para impressão");
    },
    onError: () => toast.error("Erro ao reenviar job"),
  });

  const cancelJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from("print_jobs")
        .update({ status: "canceled" })
        .eq("id", jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["print_jobs_active"] });
      toast.success("Job cancelado");
    },
    onError: () => toast.error("Erro ao cancelar job"),
  });

  const openNew = () => {
    setForm({ name: "", station: "Caixa", model: "", ip: "", port: "9100" });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (p: any) => {
    setForm({ name: p.name, station: p.station, model: p.model, ip: p.ip, port: String(p.port) });
    setEditing(p);
    setShowForm(true);
  };

  const remove = (id: string) => {
    if (confirm("Remover esta impressora?")) removeMutation.mutate(id);
  };

  const statusLabel: Record<string, string> = {
    pending: "Pendente",
    processing: "Processando",
    printed: "Impresso",
    error: "Erro",
    canceled: "Cancelado",
  };

  const statusColor: Record<string, string> = {
    pending: "bg-yellow-500/15 text-yellow-600",
    processing: "bg-blue-500/15 text-blue-600",
    printed: "bg-[hsl(var(--status-free)/0.12)] text-[hsl(var(--status-free))]",
    error: "bg-destructive/15 text-destructive",
    canceled: "bg-muted text-muted-foreground",
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Impressoras & Estações</h1>
        <button onClick={openNew} className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90">
          <Plus className="h-4 w-4" />
          Nova Impressora
        </button>
      </div>

      {/* Action bar: Queue controls */}
      <div className="flex flex-wrap items-center gap-4 mb-4 p-4 rounded-lg border bg-card">
        <button
          onClick={() => clearQueueMutation.mutate()}
          disabled={(pendingCount + errorCount) === 0 || clearQueueMutation.isPending}
          className="flex items-center gap-2 rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Trash className="h-4 w-4" />
          Limpar fila de impressão
        </button>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Fila atual:</span>
          <span className="font-semibold text-foreground">{pendingCount} pedido{pendingCount !== 1 ? "s" : ""}</span>
        </div>

        {errorCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-destructive font-medium">
            <AlertTriangle className="h-4 w-4" />
            {errorCount} com erro
          </div>
        )}

        <button
          onClick={() => setAgentActive(!agentActive)}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ml-auto ${
            agentActive
              ? "bg-[hsl(var(--status-free)/0.15)] text-[hsl(var(--status-free))]"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          <Power className="h-4 w-4" />
          Agente: {agentActive ? "Ativo" : "Pausado"}
        </button>
      </div>

      {/* Error alert banner */}
      {errorCount > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>
            ⚠ Existem <strong>{errorCount} pedido{errorCount !== 1 ? "s" : ""}</strong> com erro de impressão.
            Verifique a impressora e use <strong>Reimprimir</strong> para reenviar manualmente.
          </span>
        </div>
      )}

      {/* Print queue table — always visible */}
      <div className="rounded-lg border bg-card overflow-hidden mb-6">
        <div className="px-4 py-3 border-b bg-secondary/30">
          <h3 className="text-sm font-semibold">Fila de Impressão</h3>
        </div>
        {activeJobs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum job na fila. Todos os pedidos foram processados.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-secondary/20">
                <th className="text-left px-4 py-2 font-medium">ID</th>
                <th className="text-left px-4 py-2 font-medium">Estação</th>
                <th className="text-left px-4 py-2 font-medium">Pedido / Mesa</th>
                <th className="text-center px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Criado em</th>
                <th className="px-4 py-2 w-28 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {activeJobs.map((job) => {
                const payload = job.payload as any;
                const createdAt = new Date(job.created_at).toLocaleString("pt-BR", {
                  day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                });
                const orderInfo = [
                  payload?.product_name,
                  payload?.table_name ? `Mesa ${payload.table_name}` : null,
                  payload?.comanda_number ? `#${payload.comanda_number}` : null,
                ].filter(Boolean).join(" · ") || "—";

                return (
                  <tr key={job.id} className={`border-b last:border-0 ${job.status === "error" ? "bg-destructive/5" : "hover:bg-secondary/30"}`}>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{job.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{job.station}</td>
                    <td className="px-4 py-3">{orderInfo}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColor[job.status] || ""}`}>
                        {statusLabel[job.status] || job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{createdAt}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          title="Reimprimir"
                          onClick={() => {
                            if (confirm("Reimprimir este job?")) reprintMutation.mutate(job.id);
                          }}
                          disabled={reprintMutation.isPending}
                          className="rounded p-1.5 hover:bg-accent/10 text-accent"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                        <button
                          title="Cancelar job"
                          onClick={() => cancelJobMutation.mutate(job.id)}
                          disabled={cancelJobMutation.isPending}
                          className="rounded p-1.5 hover:bg-destructive/10 text-destructive"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        Configure o roteamento de impressoras térmicas por estação. Jobs com erro <strong>não</strong> são reimpressos automaticamente — use o botão Reimprimir.
      </p>

      {/* Routing diagram */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {["Caixa", "Cozinha", "Bebidas", "Sobremesa"].map((station) => {
          const stationPrinters = printers.filter((p) => p.station === station && p.active);
          return (
            <div key={station} className="rounded-lg border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Printer className="h-4 w-4 text-accent" />
                <h3 className="font-semibold text-sm">{station}</h3>
              </div>
              {stationPrinters.length > 0 ? (
                stationPrinters.map((p) => (
                  <div key={p.id} className="text-xs text-muted-foreground mb-1">
                    {p.name} — {p.model} ({p.ip})
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground italic">Nenhuma impressora</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Printers list */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-secondary/50">
              <th className="text-left px-4 py-2 font-medium">Nome</th>
              <th className="text-left px-4 py-2 font-medium">Estação</th>
              <th className="text-left px-4 py-2 font-medium">Modelo</th>
              <th className="text-left px-4 py-2 font-medium">IP</th>
              <th className="text-center px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {printers.map((p) => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-secondary/30">
                <td className="px-4 py-3 font-medium flex items-center gap-2">
                  <Printer className="h-4 w-4 text-muted-foreground" />
                  {p.name}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{p.station}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.model}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.ip}:{p.port}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleActive.mutate(p)}
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer ${
                      p.active ? "bg-[hsl(var(--status-free)/0.12)] text-[hsl(var(--status-free))]" : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {p.active ? "Ativa" : "Inativa"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(p)} className="rounded p-1 hover:bg-secondary">
                      <Edit2 className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button onClick={() => remove(p.id)} className="rounded p-1 hover:bg-destructive/10 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form dialog */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editing ? "Editar Impressora" : "Nova Impressora"}</h2>
              <button onClick={() => setShowForm(false)} className="rounded p-1 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Nome</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Impressora Cozinha" className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Estação</label>
                <select value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                  <option value="Caixa">Caixa</option>
                  <option value="Cozinha">Cozinha</option>
                  <option value="Bebidas">Bebidas</option>
                  <option value="Sobremesa">Sobremesa</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Modelo</label>
                <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Ex: Epson TM-T20" className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">IP</label>
                  <input type="text" value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })} placeholder="192.168.1.100" className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Porta</label>
                  <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary">Cancelar</button>
              <button disabled={!form.name.trim()} onClick={() => saveMutation.mutate()} className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
