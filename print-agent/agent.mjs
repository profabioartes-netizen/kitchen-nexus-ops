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

const COLS = 48; // Elgin i9 — 48 cols at font A on 80mm paper
const SEP_CHAR = "-";
const CNPJ = "00.000.000/0001-00"; // TODO: Replace with real CNPJ

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
    cmd.separator(),
    cmd.bold(true),
    cmd.doubleW(true),
    cmd.text("REGISTRO DA COMANDA"),
    cmd.doubleW(false),
    cmd.bold(false),
    cmd.separator(),
    cmd.alignLeft,
  ];

  if (p.customer_name) parts.push(cmd.text(`Cliente: ${p.customer_name}`));
  if (p.comanda_number) parts.push(cmd.text(`Comanda: #${p.comanda_number}`));
  if (p.table_name) parts.push(cmd.text(`Mesa: ${p.table_name}`));
  if (p.waiter_name) parts.push(cmd.text(`Garcom: ${p.waiter_name}`));
  parts.push(cmd.text(`Data: ${date}  Hora: ${time}`));
  parts.push(cmd.separator());

  // Items
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

    // Complements below parent
    if (item.complements && item.complements.length > 0) {
      for (const c of item.complements) {
        const cName = typeof c === "string" ? c : c.name;
        const cPrice = typeof c === "object" && c.price ? ` R$${Number(c.price).toFixed(2)}` : "";
        parts.push(cmd.text(`   + ${cName}${cPrice}`));
      }
    }
    if (item.notes) {
      parts.push(cmd.text(`   Obs: ${item.notes}`));
    }
  }

  parts.push(cmd.separator());
  parts.push(cmd.padRow("Subtotal:", `R$ ${(p.subtotal || subtotal).toFixed(2)}`));
  parts.push(cmd.bold(true));
  parts.push(cmd.doubleW(true));
  parts.push(cmd.alignCenter);
  parts.push(cmd.text(`TOTAL: R$ ${Number(p.total || subtotal).toFixed(2)}`));
  parts.push(cmd.doubleW(false));
  parts.push(cmd.bold(false));

  if (p.payment_method) {
    const methods = { credit: "Credito", debit: "Debito", cash: "Dinheiro", pix: "Pix" };
    parts.push(cmd.alignLeft);
    parts.push(cmd.text(`Pagamento: ${methods[p.payment_method] || p.payment_method}`));
    if (p.change && Number(p.change) > 0) {
      parts.push(cmd.text(`Troco: R$ ${Number(p.change).toFixed(2)}`));
    }
  }

  parts.push(cmd.separator());
  parts.push(cmd.alignCenter);
  parts.push(cmd.text("DOCUMENTO SEM VALOR FISCAL"));
  parts.push(cmd.separator());
  parts.push(cmd.bold(true));
  parts.push(cmd.text("Que seu cafe seja forte"));
  parts.push(cmd.text("e sua jornada gloriosa!"));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));
  parts.push(cmd.text("Volte sempre!"));
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

  if (p.table_name) parts.push(cmd.text(`Mesa: ${p.table_name}`));
  if (p.comanda_number) parts.push(cmd.text(`Comanda: #${p.comanda_number}`));
  if (p.waiter_name) parts.push(cmd.text(`Garcom: ${p.waiter_name}`));
  parts.push(cmd.text(`Hora: ${time}  ${date}`));
  parts.push(cmd.separator());

  // Item(s)
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
    parts.push(cmd.text(`Obs: ${p.notes}`));
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

  if (p.table_name) parts.push(cmd.text(`Mesa: ${p.table_name}`));
  if (p.comanda_number) parts.push(cmd.text(`Comanda: #${p.comanda_number}`));
  if (p.waiter_name) parts.push(cmd.text(`Garcom: ${p.waiter_name}`));
  parts.push(cmd.text(`Hora: ${time}  ${date}`));
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
    parts.push(cmd.text(`Motivo: ${p.notes}`));
  } else {
    parts.push(cmd.text(""));
    parts.push(cmd.text("Item removido da comanda"));
  }

  parts.push(cmd.doubleSep());
  parts.push(cmd.text(`Ticket #${job.id.slice(0, 8)}`));
  parts.push(cmd.text(""));
  parts.push(cmd.feedLines(3));
  parts.push(cmd.cut);

  return Buffer.concat(parts);
}

// ── Dispatcher ──────────────────────────────────────────────────────
function buildTicket(job, printer) {
  const p = job.payload || {};
  if (p.type === "cancellation") return buildCancellationTicket(job);
  if (p.type === "bill") return buildBillTicket(job);
  return buildProductionTicket(job);
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
