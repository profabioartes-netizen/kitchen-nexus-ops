import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  AGENT_VERSION,
  HEARTBEAT_INTERVAL_MS,
} from "./config";

type AgentConfig = {
  agent_id: string;
  agent_token: string;
  tenant_id: string;
  tenant_name: string;
  station: string;
  printer_name?: string;
};

const STORE_FILE = "agent.json";
const STORE_KEY = "config";

export function App() {
  const [store, setStore] = useState<Store | null>(null);
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const s = await Store.load(STORE_FILE);
      setStore(s);
      const saved = (await s.get<AgentConfig>(STORE_KEY)) ?? null;
      setConfig(saved);
      setLoading(false);
    })();
  }, []);

  // Heartbeat enquanto pareado
  useEffect(() => {
    if (!config) return;
    let alive = true;
    const beat = async () => {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/agent_heartbeat`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            p_token_hash: await sha256(config.agent_token),
            p_agent_host: await invoke<string>("get_hostname").catch(() => "windows"),
            p_agent_version: AGENT_VERSION,
          }),
        });
      } catch (e) {
        console.warn("heartbeat failed", e);
      }
      if (alive) setTimeout(beat, HEARTBEAT_INTERVAL_MS);
    };
    beat();
    return () => {
      alive = false;
    };
  }, [config]);

  if (loading) return <div className="app"><p className="muted">Carregando…</p></div>;

  return (
    <div className="app">
      <h1>HuskyPDV Agent</h1>
      <p className="subtitle">Agente de impressão para Windows · v{AGENT_VERSION}</p>
      {config ? (
        <Paired config={config} store={store!} onUnpair={() => setConfig(null)} />
      ) : (
        <Pair onPaired={async (c) => { await store!.set(STORE_KEY, c); await store!.save(); setConfig(c); }} />
      )}
    </div>
  );
}

function Pair({ onPaired }: { onPaired: (c: AgentConfig) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    const clean = code.replace(/\D/g, "");
    if (clean.length !== 6) { setErr("Digite os 6 dígitos do código."); return; }
    setBusy(true);
    try {
      const host = await invoke<string>("get_hostname").catch(() => "windows");
      const r = await fetch(`${SUPABASE_URL}/functions/v1/pair-print-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({
          code: clean,
          agent_name: name.trim() || `Agente ${host}`,
          agent_host: host,
          agent_version: AGENT_VERSION,
        }),
      });
      const data = await r.json();
      if (!r.ok) { setErr(data.error ?? "Falha no pareamento"); return; }
      onPaired(data as AgentConfig);
    } catch (e: any) {
      setErr(e?.message ?? "Erro de conexão");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Parear este computador</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        No painel HuskyPDV abra <strong>Impressoras → Gerar código</strong> e digite os 6 dígitos abaixo.
      </p>
      <label>Código de pareamento</label>
      <input
        className="code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="000000"
        autoFocus
      />
      <div style={{ height: 12 }} />
      <label>Apelido deste computador (opcional)</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Notebook do Caixa" />
      {err && <div className="error">{err}</div>}
      <div style={{ height: 16 }} />
      <button onClick={submit} disabled={busy}>{busy ? "Parearndo…" : "Parear agora"}</button>
    </div>
  );
}

function Paired({ config, store, onUnpair }: { config: AgentConfig; store: Store; onUnpair: () => void }) {
  const [printers, setPrinters] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>(config.printer_name ?? "");
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    invoke<string[]>("list_printers")
      .then((p) => { setPrinters(p); if (!selected && p[0]) setSelected(p[0]); })
      .catch(() => setPrinters([]));
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const savePrinter = async (name: string) => {
    setSelected(name);
    const updated = { ...config, printer_name: name };
    await store.set(STORE_KEY, updated);
    await store.save();
  };

  const test = async () => {
    if (!selected) { setMsg({ ok: false, text: "Escolha uma impressora primeiro." }); return; }
    setTesting(true); setMsg(null);
    try {
      await invoke("print_test", { printer: selected, station: config.station, tenant: config.tenant_name });
      setMsg({ ok: true, text: "Cupom de teste enviado para a impressora." });
    } catch (e: any) {
      setMsg({ ok: false, text: typeof e === "string" ? e : "Falha ao imprimir." });
    } finally {
      setTesting(false);
    }
  };

  const unpair = async () => {
    if (!confirm("Remover o pareamento deste computador?")) return;
    await store.delete(STORE_KEY);
    await store.save();
    onUnpair();
  };

  return (
    <>
      <div className="card">
        <div className="status">
          <span className={`dot ${online ? "online" : "offline"}`} />
          <strong>{online ? "Online" : "Sem internet"}</strong>
        </div>
        <p className="muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Estabelecimento: <strong>{config.tenant_name}</strong><br />
          Estação: <strong>{config.station}</strong>
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Impressora</h2>
        <label>Selecione a impressora instalada no Windows</label>
        <select value={selected} onChange={(e) => savePrinter(e.target.value)}>
          <option value="">— escolher —</option>
          {printers.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {printers.length === 0 && (
          <p className="muted" style={{ marginTop: 8 }}>
            Nenhuma impressora detectada. Instale o driver da sua impressora térmica e clique em recarregar.
          </p>
        )}
        <div className="row">
          <button onClick={test} disabled={testing || !selected}>
            {testing ? "Imprimindo…" : "Teste de impressão"}
          </button>
          <button className="secondary" onClick={() => invoke<string[]>("list_printers").then(setPrinters)}>
            Recarregar
          </button>
        </div>
        {msg && <div className={msg.ok ? "success" : "error"}>{msg.text}</div>}
      </div>

      <div className="card">
        <button className="secondary" onClick={unpair}>Remover pareamento</button>
      </div>
    </>
  );
}

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
