import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  AGENT_VERSION,
  HEARTBEAT_INTERVAL_MS,
  POLL_INTERVAL_MS,
  POLL_BATCH,
} from "./config";
import { heartbeat, pollJobs, sha256Hex, updateJobStatus, type PrintJob } from "./api";
import { renderJob } from "./render";

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

  if (loading) return <div className="app"><p className="muted">Carregando…</p></div>;

  return (
    <div className="app">
      <h1>HuskyPDV Agent</h1>
      <p className="subtitle">Agente de impressão para Windows · v{AGENT_VERSION}</p>
      {config ? (
        <Paired config={config} store={store!} onUnpair={() => setConfig(null)} setConfig={setConfig} />
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
      <button onClick={submit} disabled={busy}>{busy ? "Pareando…" : "Parear agora"}</button>
    </div>
  );
}

function Paired({
  config, store, onUnpair, setConfig,
}: {
  config: AgentConfig;
  store: Store;
  onUnpair: () => void;
  setConfig: (c: AgentConfig) => void;
}) {
  const [printers, setPrinters] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>(config.printer_name ?? "");
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [online, setOnline] = useState(true);
  const [stats, setStats] = useState({ printed: 0, failed: 0, lastJobAt: null as Date | null });
  const [lastError, setLastError] = useState<string | null>(null);
  const runningRef = useRef(false);

  // Lista impressoras
  useEffect(() => {
    invoke<string[]>("list_printers")
      .then((p) => { setPrinters(p); if (!selected && p[0]) setSelected(p[0]); })
      .catch(() => setPrinters([]));
  }, []);

  // Online/offline browser
  useEffect(() => {
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, []);

  // Heartbeat
  useEffect(() => {
    let alive = true;
    const beat = async () => {
      try {
        const host = await invoke<string>("get_hostname").catch(() => "windows");
        const hash = await sha256Hex(config.agent_token);
        await heartbeat(hash, host, AGENT_VERSION);
      } catch {/* ignore — polling tbm atualiza last_seen_at */}
      if (alive) setTimeout(beat, HEARTBEAT_INTERVAL_MS);
    };
    beat();
    return () => { alive = false; };
  }, [config.agent_token]);

  // Polling de jobs
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      if (!selected) { // sem impressora escolhida, não puxa nada
        if (alive) setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      if (runningRef.current) {
        if (alive) setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      runningRef.current = true;
      try {
        const jobs = await pollJobs(config.agent_token, POLL_BATCH);
        for (const job of jobs) {
          await processJob(job);
        }
      } catch (e: any) {
        setLastError(e?.message ?? String(e));
      } finally {
        runningRef.current = false;
        if (alive) setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    tick();
    return () => { alive = false; };
  }, [config.agent_token, selected, config.tenant_name]);

  const processJob = async (job: PrintJob) => {
    try {
      const text = renderJob(job.payload, config.tenant_name);
      await invoke("print_raw", { printer: selected, text });
      await updateJobStatus(config.agent_token, job.id, "printed");
      setStats((s) => ({ printed: s.printed + 1, failed: s.failed, lastJobAt: new Date() }));
      setLastError(null);
    } catch (e: any) {
      const msg = typeof e === "string" ? e : (e?.message ?? "Erro de impressão");
      setStats((s) => ({ printed: s.printed, failed: s.failed + 1, lastJobAt: new Date() }));
      setLastError(msg);
      try {
        await updateJobStatus(config.agent_token, job.id, "error", msg);
      } catch {/* ignore */}
    }
  };

  const savePrinter = async (name: string) => {
    setSelected(name);
    const updated = { ...config, printer_name: name };
    await store.set(STORE_KEY, updated);
    await store.save();
    setConfig(updated);
  };

  const test = async () => {
    if (!selected) { setMsg({ ok: false, text: "Escolha uma impressora primeiro." }); return; }
    setTesting(true); setMsg(null);
    try {
      const text = renderJob({ type: "test" }, config.tenant_name);
      await invoke("print_raw", { printer: selected, text });
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
            Nenhuma impressora detectada. Instale o driver e clique em recarregar.
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
        <h2 style={{ marginTop: 0, fontSize: 16 }}>Atividade</h2>
        <p className="muted" style={{ margin: "4px 0" }}>
          Impressos: <strong>{stats.printed}</strong> · Erros: <strong>{stats.failed}</strong>
        </p>
        <p className="muted" style={{ margin: "4px 0" }}>
          Último job: {stats.lastJobAt ? stats.lastJobAt.toLocaleTimeString("pt-BR") : "—"}
        </p>
        {lastError && <div className="error">Último erro: {lastError}</div>}
      </div>

      <div className="card">
        <button className="secondary" onClick={unpair}>Remover pareamento</button>
      </div>
    </>
  );
}
