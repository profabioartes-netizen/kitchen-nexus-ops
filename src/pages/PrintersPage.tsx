import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Printer, Plus, Edit2, Trash2, X, Lock, CheckCircle2 } from "lucide-react";
import LoadingScreen from "@/components/LoadingScreen";
import { useSecurityPin } from "@/hooks/useSecurityPinEnabled";
import { printViaBrowser } from "@/lib/browserPrint";
import { setPrintMode } from "@/lib/printPreference";

const DELETE_PIN = "9774";

export default function PrintersPage() {
  const queryClient = useQueryClient();
  const { pin: PAGE_PIN, pinEnabled } = useSecurityPin();
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  useEffect(() => { if (!pinEnabled) setUnlocked(true); }, [pinEnabled]);

  // Garante que o terminal use sempre impressão pelo navegador (sem perguntar).
  useEffect(() => { setPrintMode("native"); }, []);

  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    station: "Caixa",
    model: "",
    auto_print: true,
  });
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletePinInput, setDeletePinInput] = useState("");

  const handleBrowserPrintTest = () => {
    const ok = printViaBrowser({
      type: "test",
      title: "TESTE DE IMPRESSÃO",
      business_name: "HuskyPDV",
      message: "Se este cupom saiu corretamente, sua impressão está pronta para uso.",
      paper: "80mm",
    });
    if (ok) toast.success("Janela de impressão aberta.");
  };

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
        connection_type: "network" as const,
        ip: "",
        port: 9100,
        usb_device: null,
        auto_print: form.auto_print,
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
    setForm({ name: "", station: "Caixa", model: "", auto_print: true });
    setEditing(null);
    setShowForm(true);
  };

  const openEdit = (p: any) => {
    setForm({
      name: p.name ?? "",
      station: p.station ?? "Caixa",
      model: p.model ?? "",
      auto_print: p.auto_print ?? true,
    });
    setEditing(p);
    setShowForm(true);
  };

  const handleDeleteConfirm = () => {
    if (deletePinInput !== DELETE_PIN) {
      toast.error("PIN incorreto!");
      setDeletePinInput("");
      return;
    }
    if (deleteTargetId) {
      removeMutation.mutate(deleteTargetId);
      setDeleteTargetId(null);
      setDeletePinInput("");
    }
  };

  if (isLoading) return <LoadingScreen />;

  if (!unlocked) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="rounded-lg border bg-card p-6 w-full max-w-xs space-y-4 shadow-lg text-center">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
          <h2 className="font-semibold text-lg">Área Restrita</h2>
          <p className="text-sm text-muted-foreground">Digite o PIN de administrador</p>
          <input
            type="password"
            autoFocus
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              setPinInput(val);
              if (val === PAGE_PIN) setUnlocked(true);
            }}
            placeholder="••••"
            className="w-full rounded-md border bg-background px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => window.history.back()}
            className="w-full rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto">
      {/* Delete PIN dialog */}
      {deleteTargetId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border bg-card p-6 w-full max-w-sm mx-4 space-y-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-destructive/15 text-destructive">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Confirmar exclusão</h3>
                <p className="text-xs text-muted-foreground">Remover esta impressora</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Digite o PIN de exclusão para confirmar:</p>
            <input
              type="password"
              autoFocus
              inputMode="numeric"
              maxLength={4}
              value={deletePinInput}
              onChange={(e) => setDeletePinInput(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") handleDeleteConfirm(); }}
              placeholder="••••"
              className="w-full rounded-md border bg-background px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setDeleteTargetId(null); setDeletePinInput(""); }}
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deletePinInput.length < 4 || removeMutation.isPending}
                className="rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {removeMutation.isPending ? "Removendo..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto space-y-8">
        {/* HERO */}
        <header className="text-center space-y-2 pt-4">
          <h1 className="text-3xl font-semibold tracking-tight">🖨️ Impressão Rápida</h1>
          <p className="text-muted-foreground">
            Imprima pedidos diretamente pela impressora do computador.
          </p>
        </header>

        {/* CTA principal */}
        <section className="rounded-2xl border bg-card p-8 text-center space-y-5 shadow-sm">
          <button
            onClick={handleBrowserPrintTest}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-foreground px-8 py-4 text-base font-semibold hover:opacity-90 transition-opacity shadow-sm"
          >
            <Printer className="h-5 w-5" />
            Testar Impressão
          </button>
          <p className="text-xs text-muted-foreground">
            Compatível com impressoras térmicas 58mm e 80mm.
          </p>
          <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--status-free)/0.12)] text-[hsl(var(--status-free))] px-3 py-1 text-xs font-medium">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Impressão pelo navegador ativada
          </div>
        </section>

        {/* Como funciona */}
        <section className="rounded-2xl border bg-card/40 p-6">
          <h2 className="text-sm font-semibold mb-4 text-muted-foreground tracking-wide uppercase">
            Como funciona
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { n: "1", t: "Conecte sua impressora ao computador" },
              { n: "2", t: "Clique em “Testar Impressão”" },
              { n: "3", t: "Escolha sua impressora" },
              { n: "4", t: "Pronto ✅" },
            ].map((s) => (
              <div key={s.n} className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent text-sm font-bold">
                  {s.n}
                </div>
                <p className="text-sm text-foreground/90 leading-snug">{s.t}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Impressoras adicionais */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-muted-foreground tracking-wide uppercase">
              Impressoras adicionais
            </h2>
            <button
              onClick={openNew}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-secondary transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nova Impressora
            </button>
          </div>

          {printers.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                📄 Nenhuma impressora adicional configurada.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-secondary/40">
                    <th className="text-left px-4 py-2.5 font-medium">Nome</th>
                    <th className="text-left px-4 py-2.5 font-medium">Setor</th>
                    <th className="px-4 py-2.5 w-32"></th>
                  </tr>
                </thead>
                <tbody>
                  {printers.map((p: any) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-secondary/20">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <Printer className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div>{p.name}</div>
                            {p.model && <div className="text-xs text-muted-foreground font-normal">{p.model}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.station}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openEdit(p)} className="rounded p-1.5 hover:bg-secondary" title="Editar">
                            <Edit2 className="h-4 w-4 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => { setDeleteTargetId(p.id); setDeletePinInput(""); }}
                            className="rounded p-1.5 hover:bg-destructive/10 text-destructive"
                            title="Remover"
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
          )}
        </section>
      </div>

      {/* Form dialog */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editing ? "Editar Impressora" : "Nova Impressora"}</h2>
              <button onClick={() => setShowForm(false)} className="rounded p-1 hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Nome</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ex: Impressora Cozinha"
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Setor</label>
                <input
                  type="text"
                  value={form.station}
                  onChange={(e) => setForm({ ...form, station: e.target.value })}
                  placeholder="Ex: Caixa, Cozinha, Bar"
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Esse setor aparecerá como destino de impressão no cadastro de produtos.
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Modelo (opcional)</label>
                <input
                  type="text"
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  placeholder="Ex: Elgin i9"
                  className="mt-1 w-full rounded-md border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
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
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
