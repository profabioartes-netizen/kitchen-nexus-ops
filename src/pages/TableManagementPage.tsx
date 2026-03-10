import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit2, Trash2, ArrowUp, ArrowDown, X, Loader2, Settings } from "lucide-react";

interface TableForm {
  name: string;
  seats: string;
  active: boolean;
  internal_number: string;
  sector: string;
}

const emptyForm: TableForm = { name: "", seats: "4", active: true, internal_number: "", sector: "" };

export default function TableManagementPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TableForm>(emptyForm);

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["restaurant_tables_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const openEdit = (t: typeof tables[0]) => {
    setForm({ name: t.name, seats: String(t.seats), active: t.active });
    setEditingId(t.id);
    setShowForm(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        seats: parseInt(form.seats) || 4,
        active: form.active,
      };

      if (editingId) {
        const { error } = await supabase.from("restaurant_tables").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const maxOrder = tables.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0);
        const { error } = await supabase.from("restaurant_tables").insert({
          ...payload,
          sort_order: maxOrder + 1,
          status: "free",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables_admin"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      toast.success(editingId ? "Mesa atualizada!" : "Mesa criada!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables_admin"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
      toast.success("Mesa removida!");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("restaurant_tables").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables_admin"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
    },
  });

  const reorder = useMutation({
    mutationFn: async ({ id, direction }: { id: string; direction: "up" | "down" }) => {
      const idx = tables.findIndex((t) => t.id === id);
      if (idx === -1) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= tables.length) return;

      const current = tables[idx];
      const swap = tables[swapIdx];

      await Promise.all([
        supabase.from("restaurant_tables").update({ sort_order: swap.sort_order }).eq("id", current.id),
        supabase.from("restaurant_tables").update({ sort_order: current.sort_order }).eq("id", swap.id),
      ]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables_admin"] });
      queryClient.invalidateQueries({ queryKey: ["restaurant_tables"] });
    },
  });

  const activeCount = tables.filter((t) => t.active).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Gerenciar Mesas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeCount} ativa(s) de {tables.length} total
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Nova Mesa
        </button>
      </div>

      {/* Preview grid */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Prévia do Mapa
        </h2>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {tables.filter(t => t.active).map((t) => (
            <div
              key={t.id}
              className="table-status-free flex flex-col items-center justify-center rounded-lg border-2 p-2 min-h-[60px]"
            >
              <span className="font-display text-xs">{t.name}</span>
              <span className="text-[10px] text-muted-foreground">{t.seats}lug</span>
            </div>
          ))}
        </div>
      </div>

      {/* Table list */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-secondary/50">
              <th className="px-4 py-2 w-16 font-medium text-center">Ordem</th>
              <th className="text-left px-4 py-2 font-medium">Nome</th>
              <th className="text-center px-4 py-2 font-medium">Lugares</th>
              <th className="text-center px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {tables.map((table, idx) => (
              <tr key={table.id} className={`border-b last:border-0 hover:bg-secondary/30 ${!table.active ? "opacity-50" : ""}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-0.5">
                    <button
                      disabled={idx === 0 || reorder.isPending}
                      onClick={() => reorder.mutate({ id: table.id, direction: "up" })}
                      className="rounded p-0.5 hover:bg-secondary disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-5 text-center text-xs text-muted-foreground">{(table.sort_order ?? idx) + 1}</span>
                    <button
                      disabled={idx === tables.length - 1 || reorder.isPending}
                      onClick={() => reorder.mutate({ id: table.id, direction: "down" })}
                      className="rounded p-0.5 hover:bg-secondary disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3 font-medium">{table.name}</td>
                <td className="px-4 py-3 text-center">{table.seats}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleActive.mutate({ id: table.id, active: !table.active })}
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer ${
                      table.active ? "bg-status-free/10 text-status-free" : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {table.active ? "Ativa" : "Inativa"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(table)} className="rounded p-1 hover:bg-secondary">
                      <Edit2 className="h-4 w-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Remover "${table.name}"? Esta ação é irreversível.`)) {
                          deleteMutation.mutate(table.id);
                        }
                      }}
                      className="rounded p-1 hover:bg-destructive/10 text-destructive"
                    >
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
              <h2 className="text-lg font-semibold">{editingId ? "Editar Mesa" : "Nova Mesa"}</h2>
              <button onClick={() => setShowForm(false)} className="rounded p-1 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Nome / Número</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Mesa 13"
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Número de Lugares</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={form.seats}
                  onChange={(e) => setForm({ ...form, seats: e.target.value })}
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="rounded border-input h-4 w-4 accent-accent"
                />
                <span className="text-sm font-medium">Mesa ativa (visível no mapa)</span>
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-secondary">
                Cancelar
              </button>
              <button
                disabled={!form.name.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saveMutation.isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
