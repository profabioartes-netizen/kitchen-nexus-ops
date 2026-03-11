#!/usr/bin/env node
/**
 * ☕ Coffee Thrones — Agente Local de Impressão ESC/POS
 *
 * Rode este script no notebook do caixa:
 *   cd print-agent && npm install && npm start
 *
 * Variáveis de ambiente (ou edite CONFIG abaixo):
 *   SUPABASE_URL        — URL do projeto
 *   SUPABASE_ANON_KEY   — chave anon/publishable
 *   POLL_INTERVAL_MS    — intervalo de polling fallback (padrão 5000)
 *   PRINT_MODE          — "spooler" (Windows, padrão) ou "tcp" (rede direta)
 */

import { createClient } from "@supabase/supabase-js";
import net from "node:net";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

// ── Station → Windows Printer Name mapping ──────────────────────────
const STATION_PRINTER_MAP = {
  "Caixa":     process.env.PRINTER_CAIXA     || "ELGIN i9 CAIXA",
  "Cozinha":   process.env.PRINTER_COZINHA   || "ELGIN i9 COZINHAOFC",
  "Bebidas":   process.env.PRINTER_BEBIDAS   || "ELGIN i9 BEBIDAS",
  "Sobremesa": process.env.PRINTER_SOBREMESA || "ELGIN i9 SOBREMESAS",
};

// ── All stations auto-print ─────────────────────────────────────────
const AUTO_PRINT_STATIONS = Object.keys(STATION_PRINTER_MAP);

// ── Config ──────────────────────────────────────────────────────────
const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || "https://hzjplccmbjvvbinaqmny.supabase.co",
  supabaseKey: process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6anBsY2NtYmp2dmJpbmFxbW55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTQ1OTgsImV4cCI6MjA4ODY3MDU5OH0.oNkFASofgqJDoFFth1PNK3rKSQvllXSoysCZlo4azB0",
  pollInterval: parseInt(process.env.POLL_INTERVAL_MS || "5000"),
  printMode: process.env.PRINT_MODE || "spooler", // "spooler" or "tcp"
};

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// ── ESC/POS helpers ─────────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;

const COLS = 48;
const SEP_CHAR = "-";
const CNPJ = "00.000.000/0001-00";

const cmd = {
  init:       Buffer.from([ESC, 0x40]),
  cut:        Buffer.from([GS, 0x56, 0x00]),
  feedLines:  (n) => Buffer.from([ESC, 0x64, n]),
  alignCenter: Buffer.from([ESC, 0x61, 0x01]),
  alignLeft:  Buffer.from([ESC, 0x61, 0x00]),
  alignRight: Buffer.from([ESC, 0x61, 0x02]),
  bold:       (on) => Buffer.from([ESC, 0x45, on ? 1 : 0]),
  doubleSize: (on) => Buffer.from([GS, 0x21, on ? 0x11 : 0x00]),
  doubleW:    (on) => Buffer.from([GS, 0x21, on ? 0x10 : 0x00]),
  separator:  () => Buffer.from(SEP_CHAR.repeat(COLS) + "\n"),
  doubleSep:  () => Buffer.from("=".repeat(COLS) + "\n"),
  text:       (s) => Buffer.from(s + "\n", "utf-8"),
  padRow:     (left, right) => {
    const pad = COLS - left.length - right.length;
    return Buffer.from(left + " ".repeat(Math.max(1, pad)) + right + "\n", "utf-8");
  },
};

// ── Medieval header shared by all templates ─────────────────────────
function buildHeader() {
  return [
    cmd.alignCenter,
    cmd.doubleSep(),
    cmd.doubleSize(true),
    cmd.text("REINO"),
    cmd.text("COFFEE THRONES"),
    cmd.doubleSize(false),
    cmd.doubleSep(),
  ];
}

// ── 1) Cashier receipt (bill) ───────────────────────────────────────
function buildBillTicket(job) {
  const p = job.payload || {};
  const now = new Date(job.created_at);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");
  const items = p.items || [];

  const parts = [
    cmd.init,
    ...buildHeader(),
    cmd.text(`CNPJ: ${CNPJ}`),
    cmd.text("Sao Jose dos Salgados - MG"),
    cmd.separator(),
    cmd.bold(true),
    cmd.doubleW(true),
    cmd.text("REGISTRO DA COMANDA"),
    cmd.doubleW(false),
    cmd.bold(false),
    cmd.separator(),
    cmd.alignLeft,
  ];

  if (p.customer_name) parts.push(cmd.text(`CLIENTE: ${p.customer_name}`));
  if (p.comanda_number) parts.push(cmd.text(`COMANDA: #${p.comanda_number}`));
  if (p.table_name) parts.push(cmd.text(`MESA: ${p.table_name}`));
  if (p.waiter_name) parts.push(cmd.text(`ATENDENTE: ${p.waiter_name}`));
  parts.push(cmd.text(`DATA: ${date}  HORA: ${time}`));
  parts.push(cmd.separator());

  parts.push(cmd.bold(true));
  parts.push(cmd.padRow("ITEM", "TOTAL"));
  parts.push(cmd.bold(false));
  parts.push(cmd.separator());

  let subtotal = 0;
  for (const item of items) {
    const qty = item.quantity || 1;
    const itemTotal = (item.price || 0) * qty;
    subtotal += itemTotal;
    const left = `${qty}x ${item.product_name}`;
    const right = `R$ ${itemTotal.toFixed(2)}`;
    parts.push(cmd.padRow(left, right));

    if (item.complements && item.complements.length > 0) {
      for (const c of item.complements) {
        const cName = typeof c === "string" ? c : c.name;
        const cPrice = typeof c === "object" && c.price ? ` R$${Number(c.price).toFixed(2)}` : "";
        parts.push(cmd.text(`   + ${cName}${cPrice}`));
      }
    }
    if (item.notes) {
      parts.push(cmd.text(`   OBS: ${item.notes}`));
    }
  }

  parts.push(cmd.separator());
  parts.push(cmd.padRow("SUBTOTAL:", `R$ ${(p.subtotal || subtotal).toFixed(2)}`));
  parts.push(cmd.doubleSep());
  parts.push(cmd.bold(true));
  parts.push(cmd.doubleW(true));
  parts.push(cmd.alignCenter);
  parts.push(cmd.text(`TOTAL A PAGAR: R$ ${Number(p.total || subtotal).toFixed(2)}`));
  parts.push(cmd.doubleW(false));
  parts.push(cmd.bold(false));
  parts.push(cmd.doubleSep());

  if (p.payment_method) {
    const methods = { credit: "CREDITO", debit: "DEBITO", cash: "DINHEIRO", pix: "PIX" };
    parts.push(cmd.alignLeft);
    parts.push(cmd.text(`PAGAMENTO: ${methods[p.payment_method] || p.payment_method}`));
    if (p.change && Number(p.change) > 0) {
      parts.push(cmd.text(`TROCO: R$ ${Number(p.change).toFixed(2)}`));
    }
  }

  parts.push(cmd.separator());
  parts.push(cmd.alignCenter);
  parts.push(cmd.text("DOCUMENTO SEM VALOR FISCAL"));
  parts.push(cmd.separator());
  parts.push(cmd.text(""));
  parts.push(cmd.text("⚜ ⚔ ⚜"));
  parts.push(cmd.text(""));
  parts.push(cmd.text("Obrigado por visitar o"));
  parts.push(cmd.bold(true));
  parts.push(cmd.doubleW(true));
  parts.push(cmd.text("REINO COFFEE THRONES"));
  parts.push(cmd.doubleW(false));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));
  parts.push(cmd.text("No Reino Coffee Thrones"));
  parts.push(cmd.text("cada xicara conta"));
  parts.push(cmd.text("uma nova historia."));
  parts.push(cmd.text(""));
  parts.push(cmd.bold(true));
  parts.push(cmd.text("Retorne ao Reino"));
  parts.push(cmd.text("em breve!"));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));
  parts.push(cmd.text("Compartilhe sua visita"));
  parts.push(cmd.bold(true));
  parts.push(cmd.text("@coffeethrones"));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));
  parts.push(cmd.text("⚔ ☕ ⚔"));
  parts.push(cmd.text(""));
  parts.push(cmd.text("⚜ ⚔ ⚜"));
  parts.push(cmd.separator());
  parts.push(cmd.text(`Ticket #${job.id.slice(0, 8)}`));
  parts.push(cmd.text(""));
  parts.push(cmd.feedLines(3));
  parts.push(cmd.cut);

  return Buffer.concat(parts);
}

// ── 2) Production ticket ────────────────────────────────────────────
function buildProductionTicket(job) {
  const p = job.payload || {};
  const now = new Date(job.created_at);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  const parts = [
    cmd.init,
    ...buildHeader(),
    cmd.bold(true),
    cmd.doubleW(true),
    cmd.text(job.station.toUpperCase()),
    cmd.doubleW(false),
    cmd.bold(false),
    cmd.separator(),
    cmd.alignLeft,
  ];

  if (p.table_name) parts.push(cmd.text(`MESA: ${p.table_name}`));
  if (p.comanda_number) parts.push(cmd.text(`COMANDA: #${p.comanda_number}`));
  if (p.waiter_name) parts.push(cmd.text(`GARCOM: ${p.waiter_name}`));
  parts.push(cmd.text(`HORA: ${time}  ${date}`));
  parts.push(cmd.separator());

  parts.push(cmd.bold(true));
  parts.push(cmd.doubleSize(true));
  parts.push(cmd.text(`${p.quantity || 1}x ${p.product_name || "Item"}`));
  parts.push(cmd.doubleSize(false));
  parts.push(cmd.bold(false));

  if (p.complements && p.complements.length > 0) {
    for (const c of p.complements) {
      parts.push(cmd.text(`  + ${c}`));
    }
  }

  if (p.notes) {
    parts.push(cmd.bold(true));
    parts.push(cmd.text(`OBS: ${p.notes}`));
    parts.push(cmd.bold(false));
  }

  parts.push(cmd.separator());
  parts.push(cmd.alignCenter);
  parts.push(cmd.text(`Ticket #${job.id.slice(0, 8)}`));
  parts.push(cmd.text(""));
  parts.push(cmd.feedLines(3));
  parts.push(cmd.cut);

  return Buffer.concat(parts);
}

// ── 3) Cancellation ticket ──────────────────────────────────────────
function buildCancellationTicket(job) {
  const p = job.payload || {};
  const now = new Date(job.created_at);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  const parts = [
    cmd.init,
    ...buildHeader(),
    cmd.bold(true),
    cmd.doubleSize(true),
    cmd.text("*** CANCELAMENTO ***"),
    cmd.doubleSize(false),
    cmd.bold(false),
    cmd.text(job.station.toUpperCase()),
    cmd.separator(),
    cmd.alignLeft,
  ];

  if (p.table_name) parts.push(cmd.text(`MESA: ${p.table_name}`));
  if (p.comanda_number) parts.push(cmd.text(`COMANDA: #${p.comanda_number}`));
  if (p.waiter_name) parts.push(cmd.text(`GARCOM: ${p.waiter_name}`));
  parts.push(cmd.text(`HORA: ${time}  ${date}`));
  parts.push(cmd.doubleSep());

  parts.push(cmd.alignCenter);
  parts.push(cmd.bold(true));
  parts.push(cmd.text("CANCELAR:"));
  parts.push(cmd.doubleSize(true));
  parts.push(cmd.text(`${p.quantity || 1}x ${p.product_name || "Item"}`));
  parts.push(cmd.doubleSize(false));
  parts.push(cmd.bold(false));

  if (p.notes) {
    parts.push(cmd.text(""));
    parts.push(cmd.bold(true));
    parts.push(cmd.text(`MOTIVO: ${p.notes}`));
    parts.push(cmd.bold(false));
  } else {
    parts.push(cmd.text(""));
    parts.push(cmd.text("ITEM REMOVIDO DA COMANDA"));
  }

  parts.push(cmd.doubleSep());
  parts.push(cmd.text(`Ticket #${job.id.slice(0, 8)}`));
  parts.push(cmd.text(""));
  parts.push(cmd.feedLines(3));
  parts.push(cmd.cut);

  return Buffer.concat(parts);
}

// ── Dispatcher ──────────────────────────────────────────────────────
function buildTicket(job) {
  const p = job.payload || {};
  if (p.type === "cancellation") return buildCancellationTicket(job);
  if (p.type === "bill") return buildBillTicket(job);
  return buildProductionTicket(job);
}

// ── Windows Spooler: send raw ESC/POS to named printer ──────────────
// Uses PowerShell + winspool.drv to bypass the driver and send raw bytes
const RAW_PRINT_PS1 = `
param([string]$PrinterName, [string]$FilePath)
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrint {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct DOCINFOW {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDatatype;
    }
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
    [DllImport("winspool.drv", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, ref DOCINFOW pDocInfo);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBuf, int cbBuf, out int pcWritten);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    public static void SendRaw(string printerName, byte[] data) {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new Exception("OpenPrinter failed for: " + printerName);
        try {
            var di = new DOCINFOW { pDocName = "CoffeeThrones", pDatatype = "RAW" };
            if (!StartDocPrinter(hPrinter, 1, ref di))
                throw new Exception("StartDocPrinter failed");
            try {
                StartPagePrinter(hPrinter);
                int written;
                WritePrinter(hPrinter, data, data.Length, out written);
                EndPagePrinter(hPrinter);
            } finally { EndDocPrinter(hPrinter); }
        } finally { ClosePrinter(hPrinter); }
    }
}
"@
[RawPrint]::SendRaw($PrinterName, [System.IO.File]::ReadAllBytes($FilePath))
`;

function sendToWindowsSpooler(printerName, data) {
  const id = randomBytes(6).toString("hex");
  const tempFile = join(tmpdir(), `ct_print_${id}.bin`);
  const ps1File = join(tmpdir(), `ct_rawprint_${id}.ps1`);

  return new Promise((resolve, reject) => {
    try {
      writeFileSync(tempFile, data);
      writeFileSync(ps1File, RAW_PRINT_PS1, "utf-8");

      execSync(
        `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${ps1File}" -PrinterName "${printerName}" -FilePath "${tempFile}"`,
        { timeout: 15000, windowsHide: true, stdio: "pipe" }
      );

      resolve();
    } catch (err) {
      const msg = err.stderr ? err.stderr.toString().trim() : err.message;
      reject(new Error(`Windows spooler error (${printerName}): ${msg}`));
    } finally {
      try { unlinkSync(tempFile); } catch {}
      try { unlinkSync(ps1File); } catch {}
    }
  });
}

// ── TCP send (fallback for network printers) ────────────────────────
function sendToPrinterTcp(ip, port, data) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    socket.setTimeout(5000);

    socket.connect(port, ip, () => {
      socket.write(data, () => {
        socket.end();
        resolve();
      });
    });

    socket.on("error", (err) => reject(err));
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Timeout connecting to ${ip}:${port}`));
    });
  });
}

// ── Unified send: Windows spooler first, TCP fallback ───────────────
async function sendToPrinter(station, printer, data) {
  const windowsPrinterName = STATION_PRINTER_MAP[station];

  if (CONFIG.printMode === "spooler" && windowsPrinterName) {
    await sendToWindowsSpooler(windowsPrinterName, data);
    return windowsPrinterName;
  }

  // TCP fallback
  if (printer?.ip) {
    await sendToPrinterTcp(printer.ip, printer.port, data);
    return `${printer.ip}:${printer.port}`;
  }

  throw new Error(`Sem destino de impressão para estação "${station}" (sem nome Windows nem IP configurado)`);
}

// ── Printers cache ──────────────────────────────────────────────────
let printersCache = [];
let printersCacheTime = 0;

async function getPrinters() {
  if (Date.now() - printersCacheTime < 30000 && printersCache.length > 0) {
    return printersCache;
  }
  const { data, error } = await supabase.from("printers").select("*").eq("active", true);
  if (error) {
    console.error("❌ Erro ao buscar impressoras:", error.message);
    return printersCache;
  }
  printersCache = data || [];
  printersCacheTime = Date.now();
  return printersCache;
}

function findPrinterForStation(printers, station) {
  return printers.find((p) => p.station === station);
}

// ── State ───────────────────────────────────────────────────────────
const MAX_QUEUE_SIZE = 30;
const processedIds = new Set();
let agentPaused = false;
let jobsProcessed = 0;
let realtimeConnected = false;

// ── Process a single job ────────────────────────────────────────────
async function processJob(job, printers) {
  if (processedIds.has(job.id)) return;

  if (!AUTO_PRINT_STATIONS.includes(job.station)) return;

  processedIds.add(job.id);

  const printer = findPrinterForStation(printers, job.station);

  // For spooler mode, we don't strictly need a DB printer record
  if (CONFIG.printMode === "tcp" && !printer) {
    console.warn(`⚠️  Sem impressora para estação "${job.station}" — job ${job.id.slice(0, 8)} ignorado`);
    return;
  }

  try {
    // Fire-and-forget status update
    supabase
      .from("print_jobs")
      .update({ status: "processing" })
      .eq("id", job.id)
      .then(() => {});

    const ticket = buildTicket(job);
    const dest = await sendToPrinter(job.station, printer, ticket);

    await supabase
      .from("print_jobs")
      .update({ status: "printed", printed_at: new Date().toISOString() })
      .eq("id", job.id);

    jobsProcessed++;
    console.log(`✅ Impresso: ${(job.payload)?.product_name || "item"} → ${dest} [#${job.id.slice(0, 8)}]`);
  } catch (err) {
    await supabase
      .from("print_jobs")
      .update({ status: "error" })
      .eq("id", job.id)
      .catch(() => {});
    console.error(`❌ Falha ao imprimir job ${job.id.slice(0, 8)} — marcado como erro.`, err.message);
  }
}

// ── Process job directly from Realtime payload (zero re-fetch) ──────
async function processJobDirect(job) {
  if (agentPaused) return;
  if (processedIds.has(job.id)) return;
  if (job.status !== "pending") return;

  const printers = printersCache.length > 0 ? printersCache : await getPrinters();
  await processJob(job, printers);
}

// ── Poll all pending jobs (fallback) ────────────────────────────────
async function pollAndPrint() {
  if (agentPaused) return;

  try {
    const { data: jobs, error } = await supabase
      .from("print_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      console.error("❌ Erro ao buscar jobs:", error.message);
      return;
    }

    if (!jobs || jobs.length === 0) return;

    if (jobs.length > MAX_QUEUE_SIZE) {
      agentPaused = true;
      console.warn(`⚠️  Fila muito grande detectada (${jobs.length} jobs). Agente pausado para evitar desperdício de papel. Retome manualmente.`);
      return;
    }

    const printers = await getPrinters();

    for (const job of jobs) {
      await processJob(job, printers);
    }
  } catch (err) {
    console.error("❌ Erro no ciclo de polling:", err.message);
  }
}

// ── Health check ────────────────────────────────────────────────────
// TCP health check (used only in tcp mode)
function checkPrinterHealthTcp(ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.connect(port, ip, () => { socket.destroy(); resolve(true); });
    socket.on("error", () => { socket.destroy(); resolve(false); });
    socket.on("timeout", () => { socket.destroy(); resolve(false); });
  });
}

async function healthCheckLoop() {
  try {
    const printers = await getPrinters();
    const now = new Date().toISOString();

    for (const printer of printers) {
      let online = false;

      // Spooler mode: assume printer is online if a mapping exists for its station
      if (CONFIG.printMode === "spooler") {
        const winName = STATION_PRINTER_MAP[printer.station];
        if (winName) {
          online = true;
        }
      }

      // TCP mode: actually probe the printer
      if (!online && printer.ip) {
        online = await checkPrinterHealthTcp(printer.ip, printer.port);
      }

      if (online) {
        await supabase
          .from("printers")
          .update({ last_seen_at: now })
          .eq("id", printer.id);
      }
    }
  } catch (err) {
    console.error("❌ Erro no health check:", err.message);
  }
}

// ── Realtime subscription ───────────────────────────────────────────
let fallbackInterval = null;

function startFallbackPolling() {
  if (fallbackInterval) return;
  console.log(`  ⏱  Fallback polling ativo (${CONFIG.pollInterval}ms)`);
  fallbackInterval = setInterval(pollAndPrint, CONFIG.pollInterval);
}

function stopFallbackPolling() {
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
    console.log("  ⏱  Fallback polling desativado (Realtime conectado)");
  }
}

function setupRealtime() {
  const channel = supabase
    .channel("print_jobs_realtime")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "print_jobs" },
      (payload) => {
        const newJob = payload.new;
        if (newJob && newJob.status === "pending") {
          console.log(`  ⚡ Realtime: novo job ${newJob.id.slice(0, 8)} (${newJob.station})`);
          processJobDirect(newJob);
        }
      }
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "print_jobs" },
      (payload) => {
        const updated = payload.new;
        if (updated && updated.status === "pending") {
          processedIds.delete(updated.id);
          console.log(`  🔄 Realtime: reimpressão job ${updated.id.slice(0, 8)}`);
          processJobDirect(updated);
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        realtimeConnected = true;
        console.log("  🟢 WebSocket: conectado (Realtime ativo)");
        stopFallbackPolling();
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        realtimeConnected = false;
        console.warn("  🔴 WebSocket: desconectado — ativando fallback polling");
        startFallbackPolling();
      } else if (status === "TIMED_OUT") {
        realtimeConnected = false;
        console.warn("  🟡 WebSocket: timeout — ativando fallback polling");
        startFallbackPolling();
      }
    });

  return channel;
}

// ── Startup ─────────────────────────────────────────────────────────
console.log("");
console.log("  ☕ Coffee Thrones — Agente de Impressão ESC/POS");
console.log("  ────────────────────────────────────────────────");
console.log(`  Supabase:  ${CONFIG.supabaseUrl}`);
console.log(`  Modo:      ${CONFIG.printMode === "spooler" ? "Windows Spooler (RAW)" : "TCP direto"}`);
console.log(`  Realtime:  WebSocket + fallback polling ${CONFIG.pollInterval}ms`);
console.log(`  Health:    10s`);
console.log("");
console.log("  Mapeamento estação → impressora Windows:");
for (const [station, name] of Object.entries(STATION_PRINTER_MAP)) {
  console.log(`    ${station.padEnd(10)} → ${name}`);
}
console.log("");

// Initial printers fetch + health check
getPrinters().then((printers) => {
  if (printers.length === 0 && CONFIG.printMode === "tcp") {
    console.warn("⚠️  Nenhuma impressora ativa encontrada. Configure em /impressoras");
  } else if (printers.length > 0) {
    console.log("  Impressoras no banco:");
    for (const p of printers) {
      console.log(`    → ${p.station}: ${p.name} (${p.ip}:${p.port})`);
    }
  }
  console.log("");
  console.log("  Conectando ao Realtime...");
  console.log("");
  healthCheckLoop();
});

// Setup realtime as primary channel
const realtimeChannel = setupRealtime();

// Start fallback polling immediately (will be stopped once Realtime connects)
startFallbackPolling();

// Initial poll to catch any pending jobs from before agent started
setTimeout(pollAndPrint, 1000);

// Health check every 10 seconds
const healthInterval = setInterval(healthCheckLoop, 10000);

// Graceful shutdown
process.on("SIGINT", () => {
  stopFallbackPolling();
  clearInterval(healthInterval);
  supabase.removeChannel(realtimeChannel);
  console.log(`\n  🛑 Agente encerrado. ${jobsProcessed} tickets impressos nesta sessão.\n`);
  process.exit(0);
});
