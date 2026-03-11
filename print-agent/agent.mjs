#!/usr/bin/env node
/**
 * ☕ Coffee Thrones — Agente Local de Impressão ESC/POS (TCP)
 *
 * Rode este script no notebook do caixa:
 *   cd print-agent && npm install && npm start
 *
 * Variáveis de ambiente (ou edite CONFIG abaixo):
 *   SUPABASE_URL        — URL do projeto
 *   SUPABASE_ANON_KEY   — chave anon/publishable
 *   POLL_INTERVAL_MS    — intervalo de polling fallback (padrão 5000)
 */

import { createClient } from "@supabase/supabase-js";
import net from "node:net";

// ── Config ──────────────────────────────────────────────────────────
const CONFIG = {
  supabaseUrl: process.env.SUPABASE_URL || "https://hzjplccmbjvvbinaqmny.supabase.co",
  supabaseKey: process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6anBsY2NtYmp2dmJpbmFxbW55Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTQ1OTgsImV4cCI6MjA4ODY3MDU5OH0.oNkFASofgqJDoFFth1PNK3rKSQvllXSoysCZlo4azB0",
  pollInterval: parseInt(process.env.POLL_INTERVAL_MS || "5000"),
};

const supabase = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

// ── ESC/POS helpers ─────────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;

const COLS = 42;
const SEP_CHAR = ".";
const CNPJ = "59.132.954/0001-09";

// ── PC860 (Portuguese) codepage mapping ─────────────────────────────
// Maps Unicode codepoints to PC860 byte values
const PC860_MAP = {
  0x00C7: 0x80, // Ç
  0x00FC: 0x81, // ü
  0x00E9: 0x82, // é
  0x00E2: 0x83, // â
  0x00E3: 0x84, // ã
  0x00E0: 0x85, // à
  0x00C1: 0x86, // Á (mapped to available slot)
  0x00E7: 0x87, // ç
  0x00EA: 0x88, // ê
  0x00CA: 0x89, // Ê
  0x00E8: 0x8A, // è
  0x00CD: 0x8B, // Í
  0x00D4: 0x8C, // Ô
  0x00EC: 0x8D, // ì
  0x00C3: 0x8E, // Ã
  0x00C2: 0x8F, // Â
  0x00C9: 0x90, // É
  0x00C0: 0x91, // À
  0x00C8: 0x92, // È
  0x00F4: 0x93, // ô
  0x00F5: 0x94, // õ
  0x00F2: 0x95, // ò
  0x00DA: 0x96, // Ú
  0x00F9: 0x97, // ù
  0x00CC: 0x98, // Ì
  0x00D5: 0x99, // Õ
  0x00DC: 0x9A, // Ü
  0x00A2: 0x9B, // ¢
  0x00A3: 0x9C, // £
  0x00D9: 0x9D, // Ù
  0x20A7: 0x9E, // ₧
  0x00D3: 0x9F, // Ó
  0x00E1: 0xA0, // á
  0x00ED: 0xA1, // í
  0x00F3: 0xA2, // ó
  0x00FA: 0xA3, // ú
  0x00F1: 0xA4, // ñ
  0x00D1: 0xA5, // Ñ
  0x00AA: 0xA6, // ª
  0x00BA: 0xA7, // º
  0x00BF: 0xA8, // ¿
  0x00AE: 0xA9, // ®
  0x00AC: 0xAA, // ¬
  0x00BD: 0xAB, // ½
  0x00BC: 0xAC, // ¼
  0x00A1: 0xAD, // ¡
  0x00AB: 0xAE, // «
  0x00BB: 0xAF, // »
};

/** Convert a JS string to a PC860 Buffer, with pt-BR normalization and ASCII fallback */
function toPC860(input) {
  const text = String(input ?? "")
    .normalize("NFC")
    .replace(/\u00A0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-");

  const bytes = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) {
      bytes.push(cp); // ASCII passthrough
    } else if (PC860_MAP[cp] !== undefined) {
      bytes.push(PC860_MAP[cp]);
    } else {
      // Fallback: remove diacritics and keep base ASCII char when possible
      const base = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (base.length === 1 && base.charCodeAt(0) < 0x80) {
        bytes.push(base.charCodeAt(0));
      } else {
        bytes.push(0x3F); // '?' for truly unmapped chars
      }
    }
  }
  return Buffer.from(bytes);
}

const upperPt = (value) => String(value ?? "").toLocaleUpperCase("pt-BR").normalize("NFC");

/** Word-wrap a string to fit within maxCols */
function wordWrap(str, maxCols = COLS) {
  if (str.length <= maxCols) return [str];
  const lines = [];
  let remaining = str;
  while (remaining.length > maxCols) {
    let breakAt = remaining.lastIndexOf(" ", maxCols);
    if (breakAt <= 0) breakAt = maxCols;
    lines.push(remaining.slice(0, breakAt));
    remaining = remaining.slice(breakAt).trimStart();
  }
  if (remaining.length > 0) lines.push(remaining);
  return lines;
}

const cmd = {
  init:       Buffer.from([ESC, 0x40]),
  codepage:   Buffer.from([ESC, 0x74, 0x03]), // ESC t 3 → PC860 Portuguese
  cut:        Buffer.from([GS, 0x56, 0x00]),
  feedLines:  (n) => Buffer.from([ESC, 0x64, n]),
  alignCenter: Buffer.from([ESC, 0x61, 0x01]),
  alignLeft:  Buffer.from([ESC, 0x61, 0x00]),
  alignRight: Buffer.from([ESC, 0x61, 0x02]),
  bold:       (on) => Buffer.from([ESC, 0x45, on ? 1 : 0]),
  doubleSize: (on) => Buffer.from([GS, 0x21, on ? 0x11 : 0x00]),
  doubleW:    (on) => Buffer.from([GS, 0x21, on ? 0x10 : 0x00]),
  separator:  () => Buffer.concat([toPC860(SEP_CHAR.repeat(COLS)), Buffer.from([0x0A])]),
  text:       (s) => Buffer.concat([toPC860(s), Buffer.from([0x0A])]),
  /** Print text with automatic word-wrap */
  wrappedText: (s) => {
    const lines = wordWrap(s, COLS);
    return Buffer.concat(lines.map(l => Buffer.concat([toPC860(l), Buffer.from([0x0A])])));
  },
  padRow:     (left, right) => {
    const pad = COLS - left.length - right.length;
    const line = left + " ".repeat(Math.max(1, pad)) + right;
    return Buffer.concat([toPC860(line), Buffer.from([0x0A])]);
  },
};

// ── Compact header — brand small and centered ───────────────────────
function buildHeader() {
  return [
    cmd.alignCenter,
    cmd.text("COFFEE THRONES"),
  ];
}

// ── 1) Cashier receipt (bill) ───────────────────────────────────────
function buildBillTicket(job) {
  const p = job.payload || {};
  const now = new Date(job.created_at);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");
  const items = p.items || [];

  // Column layout: QTD(4) + ITENS(middle) + TOTAL(8)
  const qtyCol = 6;
  const totalCol = 10;
  const itemsCol = COLS - qtyCol - totalCol;

  const parts = [
    cmd.init,
    cmd.codepage,
    // Header
    cmd.alignCenter,
    cmd.text(""),
    cmd.bold(true),
    cmd.text("COFFEE THRONES"),
    cmd.bold(false),
    cmd.text(`CNPJ : ${CNPJ}`),
    cmd.text(""),
    cmd.separator(),
    cmd.text(""),
    cmd.bold(true),
    cmd.text("RESUMO DA CONTA"),
    cmd.bold(false),
    cmd.text(""),
    cmd.separator(),
    cmd.text(""),
  ];

  // Table/customer info centered
  if (p.mesa_name) {
    parts.push(cmd.bold(true));
    parts.push(cmd.text(upperPt(p.mesa_name)));
    parts.push(cmd.bold(false));
  }
  if (p.table_name && p.table_name !== "—") {
    parts.push(cmd.text(`CLIENTE : ${upperPt(p.table_name)}`));
  } else {
    const customerLabel = p.customer_name || "CONSUMIDOR NÃO IDENTIFICADO";
    parts.push(cmd.text(`CLIENTE : ${upperPt(customerLabel)}`));
  }
  parts.push(cmd.text(""));
  parts.push(cmd.separator());
  parts.push(cmd.text(""));

  // Column headers
  parts.push(cmd.alignLeft);
  parts.push(cmd.bold(true));
  const headerLine = "QTD".padEnd(qtyCol) + "ITENS".padEnd(itemsCol) + "TOTAL".padStart(totalCol);
  parts.push(cmd.text(headerLine));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));
  parts.push(cmd.separator());
  parts.push(cmd.text(""));

  // Items
  let subtotal = 0;
  for (const item of items) {
    const qty = item.quantity || 1;
    const itemPrice = item.price ?? item.unit_price ?? 0;
    const itemTotal = item.total != null ? item.total : itemPrice * qty;
    subtotal += itemTotal;
    const name = upperPt(item.product_name || item.name || "Item");
    const totalStr = itemTotal.toFixed(2).replace(".", ",");

    const wrappedName = wordWrap(name, itemsCol);
    // First line: qty + first name segment + total
    const firstLine = String(qty).padEnd(qtyCol) + wrappedName[0].padEnd(itemsCol) + totalStr.padStart(totalCol);
    parts.push(cmd.text(firstLine));
    // Continuation lines (name only, indented)
    for (let i = 1; i < wrappedName.length; i++) {
      parts.push(cmd.text(" ".repeat(qtyCol) + wrappedName[i]));
    }

    // Complements with ">" prefix
    if (item.complements && item.complements.length > 0) {
      for (const c of item.complements) {
        const cName = typeof c === "string" ? c : c.name;
        const cQty = typeof c === "object" && c.quantity ? c.quantity : 1;
        const cPrice = typeof c === "object" && c.price ? Number(c.price) * cQty : 0;
        const cLabel = `> ${cQty}x ${cName}`.toLocaleLowerCase("pt-BR").normalize("NFC");
        const cTotal = cPrice > 0 ? cPrice.toFixed(2).replace(".", ",") : "";
        subtotal += cPrice;
        const cLine = " ".repeat(qtyCol) + cLabel.padEnd(itemsCol) + cTotal.padStart(totalCol);
        parts.push(cmd.text(cLine));
      }
    }

    if (item.notes) {
      parts.push(cmd.wrappedText(" ".repeat(qtyCol) + `OBS: ${item.notes}`));
    }
  }

  parts.push(cmd.text(""));
  parts.push(cmd.separator());
  parts.push(cmd.text(""));

  // Subtotal & Total
  const totalVal = Number(p.total || subtotal);
  parts.push(cmd.alignRight);
  parts.push(cmd.text(`SUBTOTAL : R$ ${subtotal.toFixed(2).replace(".", ",")}`));
  parts.push(cmd.text(""));
  parts.push(cmd.bold(true));
  parts.push(cmd.text(`VALOR A PAGAR : R$ ${totalVal.toFixed(2).replace(".", ",")}`));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));

  // Payment method
  if (p.payment_method) {
    const methods = { credit: "CRÉDITO", debit: "DÉBITO", cash: "DINHEIRO", pix: "PIX" };
    parts.push(cmd.alignCenter);
    parts.push(cmd.text(`Pagamento: ${methods[p.payment_method] || p.payment_method}`));
    if (p.change && Number(p.change) > 0) {
      parts.push(cmd.text(`Troco: R$ ${Number(p.change).toFixed(2).replace(".", ",")}`));
    }
    parts.push(cmd.text(""));
  }

  parts.push(cmd.separator());
  parts.push(cmd.text(""));
  parts.push(cmd.alignCenter);
  parts.push(cmd.bold(true));
  parts.push(cmd.text("* DOCUMENTO SEM VALOR FISCAL *"));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));

  // Footer
  parts.push(cmd.text(`Data e Hora: ${date} - ${time}`));
  parts.push(cmd.bold(true));
  parts.push(cmd.text("OBRIGADO PELA PREFERÊNCIA."));
  parts.push(cmd.text("VOLTE SEMPRE!"));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));
  parts.push(cmd.text("@coffeethrones"));

  parts.push(cmd.feedLines(2));
  parts.push(cmd.cut);

  return Buffer.concat(parts);
}

// ── 2) Production ticket (same style as cashier) ────────────────────
function buildProductionTicket(job) {
  const p = job.payload || {};
  const now = new Date(job.created_at);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  const qtyCol = 6;

  const parts = [
    cmd.init,
    cmd.codepage,
    // Header — same as cashier
    cmd.alignCenter,
    cmd.text(""),
    cmd.bold(true),
    cmd.text("COFFEE THRONES"),
    cmd.bold(false),
    cmd.text(`CNPJ : ${CNPJ}`),
    cmd.text(""),
    cmd.separator(),
    cmd.text(""),
    // Station name instead of "RESUMO DA CONTA"
    cmd.bold(true),
    cmd.text(`* ${upperPt(job.station)} *`),
    cmd.bold(false),
    cmd.text(""),
    cmd.separator(),
    cmd.text(""),
  ];

  // Mesa / Garçom info centered — same as cashier
  if (p.mesa_name) {
    parts.push(cmd.bold(true));
    parts.push(cmd.text(upperPt(p.mesa_name)));
    parts.push(cmd.bold(false));
  }
  if (p.table_name && p.table_name !== "—") {
    parts.push(cmd.text(`CLIENTE : ${upperPt(p.table_name)}`));
  }
  if (p.waiter_name) {
    parts.push(cmd.text(`LANÇADO POR : ${upperPt(p.waiter_name)}`));
  }
  parts.push(cmd.text(""));
  parts.push(cmd.separator());
  parts.push(cmd.text(""));

  // Column headers — same as cashier
  parts.push(cmd.alignLeft);
  parts.push(cmd.bold(true));
  parts.push(cmd.text("QTD".padEnd(qtyCol) + "DESCRIÇÃO"));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));
  parts.push(cmd.separator());
  parts.push(cmd.text(""));

  // Items
  const items = p.items || [{ product_name: p.product_name || p.name || "Item", quantity: p.quantity || 1, notes: p.notes, complements: p.complements }];
  const nameMaxCols = COLS - qtyCol;

  for (const item of items) {
    const qty = String(item.quantity || 1);
    const name = upperPt(item.product_name || item.name || "Item");
    const wrappedName = wordWrap(name, nameMaxCols);

    parts.push(cmd.text(qty.padEnd(qtyCol) + wrappedName[0]));
    for (let i = 1; i < wrappedName.length; i++) {
      parts.push(cmd.text(" ".repeat(qtyCol) + wrappedName[i]));
    }

    if (item.complements && item.complements.length > 0) {
      for (const c of item.complements) {
        const cName = typeof c === "string" ? c : c.name;
        parts.push(cmd.wrappedText(" ".repeat(qtyCol) + `> ${cName}`));
      }
    }

    if (item.notes) {
      parts.push(cmd.bold(true));
      parts.push(cmd.wrappedText(" ".repeat(qtyCol) + `OBS: ${item.notes}`));
      parts.push(cmd.bold(false));
    }

    parts.push(cmd.text(""));
  }

  parts.push(cmd.separator());
  parts.push(cmd.text(""));

  // Footer — same style as cashier
  parts.push(cmd.alignCenter);
  parts.push(cmd.bold(true));
  parts.push(cmd.text(`DATA E HORA : ${date} - ${time}`));
  parts.push(cmd.bold(false));

  parts.push(cmd.feedLines(2));
  parts.push(cmd.cut);

  return Buffer.concat(parts);
}

// ── 3) Cancellation ticket (same style as cashier) ──────────────────
function buildCancellationTicket(job) {
  const p = job.payload || {};
  const now = new Date(job.created_at);
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");
  const productName = upperPt(p.product_name || "Item");

  const qtyCol = 6;

  const parts = [
    cmd.init,
    cmd.codepage,
    // Header — same as cashier
    cmd.alignCenter,
    cmd.text(""),
    cmd.bold(true),
    cmd.text("COFFEE THRONES"),
    cmd.bold(false),
    cmd.text(`CNPJ : ${CNPJ}`),
    cmd.text(""),
    cmd.separator(),
    cmd.text(""),
    cmd.bold(true),
    cmd.text("** CANCELAMENTO **"),
    cmd.bold(false),
    cmd.text(upperPt(job.station)),
    cmd.text(""),
    cmd.separator(),
    cmd.text(""),
  ];

  // Mesa / Garçom centered
  if (p.table_name) {
    parts.push(cmd.bold(true));
    parts.push(cmd.text(upperPt(p.table_name)));
    parts.push(cmd.bold(false));
  }
  if (p.waiter_name) {
    parts.push(cmd.text(`LANÇADO POR : ${upperPt(p.waiter_name)}`));
  }
  parts.push(cmd.text(""));
  parts.push(cmd.separator());
  parts.push(cmd.text(""));

  // Column headers
  parts.push(cmd.alignLeft);
  parts.push(cmd.bold(true));
  parts.push(cmd.text("QTD".padEnd(qtyCol) + "DESCRIÇÃO"));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));
  parts.push(cmd.separator());
  parts.push(cmd.text(""));

  // Item
  const wrappedName = wordWrap(productName, COLS - qtyCol);
  parts.push(cmd.text(String(p.quantity || 1).padEnd(qtyCol) + wrappedName[0]));
  for (let i = 1; i < wrappedName.length; i++) {
    parts.push(cmd.text(" ".repeat(qtyCol) + wrappedName[i]));
  }

  if (p.notes) {
    parts.push(cmd.text(""));
    parts.push(cmd.bold(true));
    parts.push(cmd.wrappedText(" ".repeat(qtyCol) + `MOTIVO: ${p.notes}`));
    parts.push(cmd.bold(false));
  }

  parts.push(cmd.text(""));
  parts.push(cmd.separator());
  parts.push(cmd.text(""));

  // Footer
  parts.push(cmd.alignCenter);
  parts.push(cmd.bold(true));
  parts.push(cmd.text(`DATA E HORA : ${date} - ${time}`));
  parts.push(cmd.bold(false));

  parts.push(cmd.feedLines(2));
  parts.push(cmd.cut);

  return Buffer.concat(parts);
}

// ── Dispatcher ──────────────────────────────────────────────────────
function buildTicket(job) {
  const p = job.payload || {};
  if (p.type === "cancellation") return buildCancellationTicket(job);
  if (p.type === "bill" || p.type === "full_bill") return buildBillTicket(job);
  return buildProductionTicket(job);
}

// ── TCP send: direct ESC/POS to printer via socket ──────────────────
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

// ── Send to printer using IP from DB ────────────────────────────────
async function sendToPrinter(printer, data) {
  if (!printer?.ip) {
    throw new Error(`Impressora "${printer?.name || "?"}" sem IP configurado`);
  }
  await sendToPrinterTcp(printer.ip, printer.port || 9100, data);
  return `${printer.ip}:${printer.port || 9100}`;
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

// ── All stations auto-print ─────────────────────────────────────────
const AUTO_PRINT_STATIONS = ["Caixa", "Cozinha", "Bebidas", "Sobremesa"];

// ── Process a single job ────────────────────────────────────────────
async function processJob(job, printers) {
  if (processedIds.has(job.id)) return;

  if (!AUTO_PRINT_STATIONS.includes(job.station)) return;

  processedIds.add(job.id);

  const printer = findPrinterForStation(printers, job.station);

  if (!printer) {
    console.warn(`⚠️  Sem impressora para estação "${job.station}" — job ${job.id.slice(0, 8)} ignorado`);
    return;
  }

  if (!printer.ip) {
    console.warn(`⚠️  Impressora "${printer.name}" sem IP — job ${job.id.slice(0, 8)} ignorado`);
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
    const dest = await sendToPrinter(printer, ticket);

    await supabase
      .from("print_jobs")
      .update({ status: "printed", printed_at: new Date().toISOString() })
      .eq("id", job.id);

    jobsProcessed++;
    console.log(`✅ Impresso: ${(job.payload)?.product_name || "item"} → ${dest} [#${job.id.slice(0, 8)}]`);
  } catch (err) {
    try {
      await supabase
        .from("print_jobs")
        .update({ status: "error" })
        .eq("id", job.id);
    } catch (_) { /* ignore */ }
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

// ── Health check: TCP probe to each printer ─────────────────────────
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
      if (!printer.ip) continue;

      const online = await checkPrinterHealthTcp(printer.ip, printer.port || 9100);

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
console.log("  ☕ Coffee Thrones — Agente de Impressão ESC/POS (TCP)");
console.log("  ────────────────────────────────────────────────");
console.log(`  Supabase:  ${CONFIG.supabaseUrl}`);
console.log(`  Modo:      TCP direto (ESC/POS via socket)`);
console.log(`  Realtime:  WebSocket + fallback polling ${CONFIG.pollInterval}ms`);
console.log(`  Health:    TCP probe a cada 10s`);
console.log("");

// Initial printers fetch + health check
getPrinters().then((printers) => {
  if (printers.length === 0) {
    console.warn("⚠️  Nenhuma impressora ativa encontrada. Configure em /impressoras");
  } else {
    console.log("  Impressoras configuradas:");
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
