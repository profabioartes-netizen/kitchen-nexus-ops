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
 *   POLL_INTERVAL_MS    — intervalo de polling (padrão 3000)
 */

import { createClient } from "@supabase/supabase-js";
import net from "node:net";

// ── Stations that auto-print (production only, NOT Caixa) ───────────
const AUTO_PRINT_STATIONS = ["Cozinha", "Bebidas", "Sobremesa"];

// ── Config ──────────────────────────────────────────────────────────
const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || "https://hzjplccmbjvvbinaqmny.supabase.co",
  supabaseKey: process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6anBsY2NtYmp2dmJpbmFxbW55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTQ1OTgsImV4cCI6MjA4ODY3MDU5OH0.oNkFASofgqJDoFFth1PNK3rKSQvllXSoysCZlo4azB0",
  pollInterval: parseInt(process.env.POLL_INTERVAL_MS || "3000"),
};

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// ── ESC/POS helpers ─────────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;

const cmd = {
  init:       Buffer.from([ESC, 0x40]),                    // Initialize printer
  cut:        Buffer.from([GS, 0x56, 0x00]),               // Full cut
  feedLines:  (n) => Buffer.from([ESC, 0x64, n]),          // Feed n lines
  alignCenter: Buffer.from([ESC, 0x61, 0x01]),
  alignLeft:  Buffer.from([ESC, 0x61, 0x00]),
  bold:       (on) => Buffer.from([ESC, 0x45, on ? 1 : 0]),
  doubleSize: (on) => Buffer.from([GS, 0x21, on ? 0x11 : 0x00]),
  separator:  () => Buffer.from("-".repeat(32) + "\n"),
  text:       (s) => Buffer.from(s + "\n", "utf-8"),
};

function buildTicket(job, printer) {
  const p = job.payload || {};
  const now = new Date(job.created_at);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");
  const isCancellation = p.type === "cancellation";

  if (isCancellation) {
    return Buffer.concat([
      cmd.init,
      cmd.alignCenter,
      cmd.doubleSize(true),
      cmd.text("COFFEE THRONES"),
      cmd.doubleSize(false),
      cmd.separator(),
      cmd.bold(true),
      cmd.doubleSize(true),
      cmd.text("*** CANCELAMENTO ***"),
      cmd.doubleSize(false),
      cmd.bold(false),
      cmd.separator(),
      cmd.alignLeft,
      cmd.text(`Mesa: ${p.table_name || "---"}`),
      cmd.text(`Garcom: ${p.waiter_name || "---"}`),
      cmd.text(`Hora: ${date}  ${time}`),
      cmd.separator(),
      cmd.alignCenter,
      cmd.bold(true),
      cmd.text("CANCELAR:"),
      cmd.doubleSize(true),
      cmd.text(`${p.quantity || 1}x ${p.product_name || "Item"}`),
      cmd.doubleSize(false),
      cmd.bold(false),
      ...(p.notes ? [cmd.text(`${p.notes}`)] : []),
      cmd.separator(),
      cmd.text(`Ticket #${job.id.slice(0, 8)}`),
      cmd.text(""),
      cmd.feedLines(3),
      cmd.cut,
    ]);
  }

  const parts = [
    cmd.init,
    cmd.alignCenter,
    cmd.doubleSize(true),
    cmd.text("COFFEE THRONES"),
    cmd.doubleSize(false),
    cmd.text(job.station.toUpperCase()),
    cmd.separator(),
    cmd.alignLeft,
    cmd.text(`Mesa: ${p.table_name || "---"}`),
    cmd.text(`Garcom: ${p.waiter_name || "---"}`),
    cmd.text(`Data: ${date}  ${time}`),
    cmd.separator(),
    cmd.bold(true),
    cmd.doubleSize(true),
    cmd.text(`${p.quantity || 1}x ${p.product_name || "Item"}`),
    cmd.doubleSize(false),
    cmd.bold(false),
  ];

  if (p.complements && p.complements.length > 0) {
    for (const c of p.complements) {
      parts.push(cmd.text(`  + ${c}`));
    }
  }

  if (p.notes) {
    parts.push(cmd.text(`Obs: ${p.notes}`));
  }

  parts.push(
    cmd.separator(),
    cmd.alignCenter,
    cmd.text(`Ticket #${job.id.slice(0, 8)}`),
    cmd.text(""),
    cmd.feedLines(3),
    cmd.cut,
  );

  return Buffer.concat(parts);
}

// ── TCP send ────────────────────────────────────────────────────────
function sendToPrinter(ip, port, data) {
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

// ── Main loop ───────────────────────────────────────────────────────
const processedIds = new Set();
let running = true;
let jobsProcessed = 0;

async function pollAndPrint() {
  try {
    const { data: jobs, error } = await supabase
      .from("print_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) {
      console.error("❌ Erro ao buscar jobs:", error.message);
      return;
    }

    if (!jobs || jobs.length === 0) return;

    const printers = await getPrinters();

    for (const job of jobs) {
      if (processedIds.has(job.id)) continue;

      // Skip Caixa — only production stations auto-print
      if (!AUTO_PRINT_STATIONS.includes(job.station)) {
        continue;
      }

      processedIds.add(job.id);

      const printer = findPrinterForStation(printers, job.station);
      if (!printer) {
        console.warn(`⚠️  Sem impressora para estação "${job.station}" — job ${job.id.slice(0, 8)} ignorado`);
        continue;
      }

      try {
        const ticket = buildTicket(job, printer);
        await sendToPrinter(printer.ip, printer.port, ticket);

        await supabase
          .from("print_jobs")
          .update({ status: "printed", printed_at: new Date().toISOString() })
          .eq("id", job.id);

        jobsProcessed++;
        console.log(`✅ Impresso: ${(job.payload)?.product_name || "item"} → ${printer.name} (${printer.ip}:${printer.port}) [#${job.id.slice(0, 8)}]`);
      } catch (err) {
        processedIds.delete(job.id); // retry next cycle
        console.error(`❌ Falha ao imprimir job ${job.id.slice(0, 8)} em ${printer.ip}:${printer.port} —`, err.message);
      }
    }
  } catch (err) {
    console.error("❌ Erro no ciclo de polling:", err.message);
  }
}

// ── Startup ─────────────────────────────────────────────────────────
console.log("");
console.log("  ☕ Coffee Thrones — Agente de Impressão ESC/POS");
console.log("  ────────────────────────────────────────────────");
console.log(`  Supabase: ${CONFIG.supabaseUrl}`);
console.log(`  Polling:  ${CONFIG.pollInterval}ms`);
console.log("");

// Initial printers fetch
getPrinters().then((printers) => {
  if (printers.length === 0) {
    console.warn("⚠️  Nenhuma impressora ativa encontrada. Configure em /impressoras");
  } else {
    console.log("  Impressoras ativas:");
    for (const p of printers) {
      console.log(`    → ${p.station}: ${p.name} (${p.ip}:${p.port})`);
    }
  }
  console.log("");
  console.log("  Aguardando jobs de impressão... (Ctrl+C para sair)");
  console.log("");
});

// Realtime subscription for instant reaction
supabase
  .channel("print_jobs_agent")
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "print_jobs" }, () => {
    // Trigger immediate poll on new job
    pollAndPrint();
  })
  .subscribe();

// Fallback polling
const interval = setInterval(pollAndPrint, CONFIG.pollInterval);

// Graceful shutdown
process.on("SIGINT", () => {
  running = false;
  clearInterval(interval);
  console.log(`\n  🛑 Agente encerrado. ${jobsProcessed} tickets impressos nesta sessão.\n`);
  process.exit(0);
});
