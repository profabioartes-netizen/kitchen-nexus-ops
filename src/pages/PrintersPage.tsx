import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Printer, Plus, Edit2, Trash2, X, Loader2 } from "lucide-react";

export default function PrintersPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", station: "Caixa", model: "", ip: "", port: "9100" });

  const { data: printers = [], isLoading } = useQuery({
    queryKey: ["printers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("printers").select("*").order("created_at");
      if (error) throw error;
      return data;
    },
  });

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

      <p className="text-sm text-muted-foreground mb-6">
        Configure o roteamento de impressoras térmicas por estação. O agente de impressão (<code>/impressoras/agente</code>) consome a fila de jobs automaticamente.
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
