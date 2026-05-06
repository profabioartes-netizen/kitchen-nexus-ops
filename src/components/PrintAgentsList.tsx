import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Wifi, WifiOff, Trash2, Pencil, Send } from "lucide-react";

type Agent = {
  id: string;
  name: string;
  station: string;
  agent_host: string | null;
  agent_version: string | null;
  printer_name: string | null;
  active: boolean;
  last_seen_at: string | null;
  paired_at: string;
};

const ONLINE_THRESHOLD_MS = 90_000; // 90s sem heartbeat = offline

function isOnline(a: Agent) {
  if (!a.active || !a.last_seen_at) return false;
  return Date.now() - new Date(a.last_seen_at).getTime() < ONLINE_THRESHOLD_MS;
}

function timeAgo(iso: string | null) {
  if (!iso) return "nunca";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s atrás`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}min atrás`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h atrás`;
  return `${Math.floor(ms / 86_400_000)}d atrás`;
}

export function PrintAgentsList() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStation, setEditStation] = useState("Caixa");
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["print_agents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("print_agents")
        .select("id,name,station,agent_host,agent_version,printer_name,active,last_seen_at,paired_at")
        .order("paired_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Agent[];
    },
    refetchInterval: 15_000,
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("print_agents")
        .update({ active: false })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente revogado.");
      qc.invalidateQueries({ queryKey: ["print_agents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao revogar"),
  });

  const updateMut = useMutation({
    mutationFn: async (vars: { id: string; name: string; station: string }) => {
      const { error } = await supabase
        .from("print_agents")
        .update({ name: vars.name, station: vars.station })
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente atualizado.");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["print_agents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });

  const enqueueTest = async (agent: Agent) => {
    setTestingId(agent.id);
    try {
      const { error } = await supabase.from("print_jobs").insert({
        station: agent.station,
        status: "pending",
        payload: {
          type: "test",
          agent_id: agent.id,
          requested_at: new Date().toISOString(),
        },
      });
      if (error) throw error;
      toast.success(`Teste enviado para "${agent.name}". O cupom deve sair em segundos.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enfileirar teste");
    } finally {
      setTestingId(null);
    }
  };

  const startEdit = (a: Agent) => {
    setEditing(a.id);
    setEditName(a.name);
    setEditStation(a.station);
  };

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 mb-4 text-sm text-muted-foreground">
        Carregando agentes…
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 mb-4 text-sm text-muted-foreground">
        Nenhum HuskyPDV Agent pareado ainda. Use o cartão acima para gerar um código e instalar o app no computador da impressora.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card mb-4 overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="text-sm font-semibold">HuskyPDV Agents pareados</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Cada agente é um computador rodando o app HuskyPDV Agent conectado a uma impressora.
        </p>
      </div>
      <div className="divide-y">
        {agents.map((a) => {
          const online = isOnline(a);
          const isEditing = editing === a.id;
          return (
            <div key={a.id} className={`p-4 ${!a.active ? "opacity-60" : ""}`}>
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Nome do agente"
                    />
                    <select
                      value={editStation}
                      onChange={(e) => setEditStation(e.target.value)}
                      className="rounded-md border bg-background px-3 py-2 text-sm"
                    >
                      <option value="Caixa">Caixa</option>
                      <option value="Cozinha">Cozinha</option>
                      <option value="Bebidas">Bebidas</option>
                      <option value="Sobremesa">Sobremesa</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateMut.mutate({ id: a.id, name: editName.trim() || a.name, station: editStation })}
                      disabled={updateMut.isPending}
                      className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="rounded-md border px-3 py-1.5 text-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {online ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 dark:text-green-400">
                          <Wifi className="h-3.5 w-3.5" /> Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground">
                          <WifiOff className="h-3.5 w-3.5" /> Offline
                        </span>
                      )}
                      <span className="font-medium text-sm truncate">{a.name}</span>
                      <span className="text-[11px] rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                        {a.station}
                      </span>
                      {!a.active && (
                        <span className="text-[11px] rounded bg-destructive/15 text-destructive px-1.5 py-0.5">
                          revogado
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3">
                      {a.printer_name && <span>Impressora: <strong>{a.printer_name}</strong></span>}
                      {a.agent_host && <span>Host: {a.agent_host}</span>}
                      {a.agent_version && <span>v{a.agent_version}</span>}
                      <span>Visto: {timeAgo(a.last_seen_at)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => enqueueTest(a)}
                      disabled={testingId === a.id || !a.active}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
                      title="Enviar cupom de teste para este agente"
                    >
                      {testingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Testar
                    </button>
                    <button
                      onClick={() => startEdit(a)}
                      disabled={!a.active}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-xs font-medium hover:bg-secondary disabled:opacity-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Renomear
                    </button>
                    {a.active && (
                      <button
                        onClick={() => {
                          if (confirm(`Revogar o agente "${a.name}"? Ele vai parar de imprimir até reparear.`)) {
                            revokeMut.mutate(a.id);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 text-destructive px-3 py-1.5 text-xs font-medium hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Revogar
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
