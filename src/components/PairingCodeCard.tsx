import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, Loader2, Copy, Plus } from "lucide-react";
import { listKnownStations, DEFAULT_STATIONS } from "@/lib/stations";

type GenResponse = {
  code: string;
  expires_at: string;
  station: string;
  stations?: string[];
  suggested_name: string | null;
};

export function PairingCodeCard() {
  const [stations, setStations] = useState<string[]>(["Caixa"]);
  const [newStation, setNewStation] = useState("");
  const [suggestedName, setSuggestedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<GenResponse | null>(null);

  const { data: knownStations = [...DEFAULT_STATIONS] } = useQuery({
    queryKey: ["known_stations"],
    queryFn: listKnownStations,
    staleTime: 60_000,
  });

  const allOptions = (() => {
    const set = new Set<string>([...knownStations, ...stations]);
    return Array.from(set);
  })();

  const toggle = (s: string) => {
    setStations((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  const addCustom = () => {
    const v = newStation.trim();
    if (!v) return;
    setStations((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setNewStation("");
  };

  const generate = async () => {
    if (stations.length === 0) {
      toast.error("Escolha pelo menos um setor.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-pairing-code", {
        body: {
          stations,
          station: stations[0], // compat
          suggested_name: suggestedName.trim() || null,
        },
      });
      if (error) throw error;
      setResult(data as GenResponse);
      toast.success("Código gerado. Válido por 10 minutos.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar código");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border bg-card/40 p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground inline-flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Parear novo HuskyPDV Agent
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Gere um código de 6 dígitos e digite-o no app HuskyPDV Agent instalado no computador da impressora.
          Marque os <strong>setores</strong> que essa impressora deve cobrir (ex: <em>Caixa</em> para recibos, <em>Cozinha</em> para tickets de produção).
        </p>
      </div>

      <div>
        <div className="text-xs font-medium text-muted-foreground mb-1.5">Setores</div>
        <div className="flex flex-wrap gap-2">
          {allOptions.map((s) => {
            const checked = stations.includes(s);
            return (
              <button
                type="button"
                key={s}
                onClick={() => toggle(s)}
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
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
            placeholder="Novo setor (ex: Padaria, Confeitaria)"
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-xs"
          />
          <button
            type="button"
            onClick={addCustom}
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-secondary"
          >
            <Plus className="h-3 w-3" /> Adicionar
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Apelido sugerido (opcional)</label>
        <input
          value={suggestedName}
          onChange={(e) => setSuggestedName(e.target.value)}
          placeholder="Ex: PC do Caixa"
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
        />
      </div>

      <button
        onClick={generate}
        disabled={busy || stations.length === 0}
        className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        Gerar código de pareamento
      </button>

      {result && (
        <div className="rounded-lg border bg-background p-4 space-y-2">
          <div className="text-xs text-muted-foreground">Código de pareamento (válido por 10 min):</div>
          <div className="flex items-center gap-3">
            <div className="font-mono text-3xl tracking-[0.4em] font-bold">{result.code}</div>
            <button
              onClick={() => { navigator.clipboard.writeText(result.code); toast.success("Copiado"); }}
              className="rounded-md border p-2 hover:bg-secondary"
              title="Copiar"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            Setores: <strong>{(result.stations ?? [result.station]).join(", ")}</strong>
          </div>
          <p className="text-xs text-muted-foreground">
            Abra o HuskyPDV Agent no PC, digite esse código e o computador passará a imprimir os setores selecionados.
          </p>
        </div>
      )}
    </section>
  );
}
