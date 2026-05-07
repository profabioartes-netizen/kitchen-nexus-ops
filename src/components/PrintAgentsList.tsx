import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Wifi, WifiOff, Trash2, Pencil, Send, Plus } from "lucide-react";
import { listKnownStations, DEFAULT_STATIONS } from "@/lib/stations";

type Agent = {
  id: string;
  name: string;
  station: string;
  stations: string[] | null;
  agent_host: string | null;
  agent_version: string | null;
  printer_name: string | null;
  active: boolean;
  last_seen_at: string | null;
  paired_at: string;
};

const ONLINE_THRESHOLD_MS = 90_000;

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

function effectiveStations(a: Agent): string[] {
  const arr = (a.stations ?? []).filter((s) => s && s.trim());
  if (arr.length > 0) return arr;
  return a.station ? [a.station] : [];
}

export function PrintAgentsList() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStations, setEditStations] = useState<string[]>([]);
  const [newStation, setNewStation] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["print_agents"],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("print_agents") as any)
        .select("id,name,station,stations,agent_host,agent_version,printer_name,active,last_seen_at,paired_at")
        .order("paired_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Agent[];
    },
    refetchInterval: 15_000,
  });

  const { data: knownStations = [...DEFAULT_STATIONS] } = useQuery({
    queryKey: ["known_stations"],
    queryFn: listKnownStations,
    staleTime: 60_000,
  });

  const revokeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("print_agents").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente revogado.");
      qc.invalidateQueries({ queryKey: ["print_agents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao revogar"),
  });

  const updateMut = useMutation({
    mutationFn: async (vars: { id: string; name: string; stations: string[] }) => {
      const stations = vars.stations.filter((s) => s && s.trim());
      const primary = stations[0] ?? "Caixa";
      const { error } = await supabase
        .from("print_agents")
        .update({ name: vars.name, station: primary, stations } as any)
        .eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente atualizado.");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["print_agents"] });
      qc.invalidateQueries({ queryKey: ["known_stations"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });

  const enqueueTest = async (agent: Agent) => {
    setTestingId(agent.id);
    try {
      const stations = effectiveStations(agent);
      const target = stations[0] ?? "Caixa";
      const { error } = await supabase.from("print_jobs").insert({
        station: target,
        status: "pending",
        payload: { type: "test", agent_id: agent.id, requested_at: new Date().toISOString() },
      });
      if (error) throw error;
      toast.success(`Teste enviado para "${agent.name}" (${target}).`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enfileirar teste");
    } finally {
      setTestingId(null);
    }
  };

  const startEdit = (a: Agent) => {
    setEditing(a.id);
    setEditName(a.name);
    setEditStations(effectiveStations(a));
    setNewStation("");
  };

  const toggleStation = (s: string) => {
    setEditStations((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const addCustomStation = () => {
    const v = newStation.trim();
    if (!v) return;
    setEditStations((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setNewStation("");
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

  // União para mostrar checkboxes de setores conhecidos + custom já adicionados
  const stationOptions = (active: string[]) => {
    const set = new Set<string>([...knownStations, ...active]);
    return Array.from(set);
  };

  return (
    <div className="rounded-lg border bg-card mb-4 overflow-hidden">
      <div className="p-4 border-b">
        <h3 className="text-sm font-semibold">HuskyPDV Agents pareados</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Cada agente é um computador rodando o HuskyPDV Agent. Marque <strong>quais setores</strong> ele deve imprimir —
          é assim que pedidos da Cozinha saem na impressora da cozinha e do Bar saem no bar.
        </p>
      </div>
      <div className="divide-y">
        {agents.map((a) => {
          const online = isOnline(a);
          const isEditing = editing === a.id;
          const stations = effectiveStations(a);
          return (
            <div key={a.id} className={`p-4 ${!a.active ? "opacity-60" : ""}`}>
              {isEditing ? (
                <div className="space-y-3">
                  <input
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nome do agente (ex: PC do Caixa)"
                  />
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1.5">
                      Setores que esta impressora vai imprimir
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {stationOptions(editStations).map((s) => {
                        const checked = editStations.includes(s);
                        return (
                          <button
                            type="button"
                            key={s}
                            onClick={() => toggleStation(s)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              checked
                                ? "bg-accent text-accent-foreground border-accent"
                                : "bg-background hover:bg-secondary"
                            }`}
                          >
                            <span className={`inline-block h-2 w-2 rounded-full ${checked ? "bg-current" : "bg-muted-foreground/40"}`} />
                            {s}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={newStation}
                        onChange={(e) => setNewStation(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomStation(); } }}
                        placeholder="Novo setor (ex: Padaria)"
                        className="flex-1 rounded-md border bg-background px-3 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={addCustomStation}
                        className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-secondary"
                      >
                        <Plus className="h-3 w-3" /> Adicionar
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      Dica: para um único PC com uma impressora, marque <strong>todos</strong> os setores que ele deve cobrir.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => updateMut.mutate({ id: a.id, name: editName.trim() || a.name, stations: editStations })}
                      disabled={updateMut.isPending || editStations.length === 0}
                      className="rounded-md bg-accent text-accent-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50"
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
                      {stations.map((s) => (
                        <span key={s} className="text-[11px] rounded bg-secondary px-1.5 py-0.5 text-secondary-foreground">
                          {s}
                        </span>
                      ))}
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
                      Setores
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
