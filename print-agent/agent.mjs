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
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";

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

/**
 * Safely resolve location name, ensuring customer_name never leaks into location.
 * Returns the real physical location or "Sem local".
 */
function safeLocation(payload) {
  const loc = payload.location || payload.table_name || null;
  const cust = payload.customer_name || payload.customerName || null;
  // SAFETY: if location equals customer name, it's a data leak — reject it
  if (!loc || loc === "—" || loc === "") return null;
  if (cust && loc.trim().toLowerCase() === cust.trim().toLowerCase()) {
    console.warn(`[PRINT SAFETY] location "${loc}" matches customer_name "${cust}" — rejecting as data leak`);
    return null;
  }
  return loc;
}

/** Log print debug info before generating ticket */
function logPrintDebug(jobId, payload, ticketType) {
  const loc = safeLocation(payload);
  console.log(`[PRINT DEBUG] type=${ticketType} job=${jobId?.slice(0,8)} order=${payload.order_id?.slice(0,8) || "?"} location="${loc || "Sem local"}" customer="${payload.customer_name || "?"}" table_name="${payload.table_name || "?"}" origin="${payload.origin || "?"}"`);
}

/** Resolve "Lançado por" label based on order origin */
function resolveOriginLabel(payload) {
  const origin = (payload.origin || "").toLowerCase();
  if (origin === "self_service" || origin === "qr" || payload.selfService) return "Autoatendimento (QR)";
  if (origin === "cashier") return "Caixa";
  if (origin === "waiter") {
    const waiter = payload.waiter_name || "Garçom";
    return `Garçom (${waiter})`;
  }
  // Fallback: use waiter_name if available
  if (payload.waiter_name) {
    if (payload.waiter_name.toLowerCase().includes("auto")) return "Autoatendimento (QR)";
    return `Garçom (${payload.waiter_name})`;
  }
  return "Sistema";
}

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
  strikethrough: (on) => Buffer.from([ESC, 0x2D, on ? 1 : 0]), // ESC '-' 1/0 underline-style strike
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

  // Customer + Location + Lançado por
  logPrintDebug(job.id, p, "bill");
  const customerName = p.customer_name || p.customerName || null;
  if (customerName) {
    parts.push(cmd.text("CLIENTE: " + upperPt(customerName)));
  } else {
    parts.push(cmd.text("CONSUMIDOR NAO IDENTIFICADO"));
  }
  const locationName = safeLocation(p);
  if (locationName) {
    parts.push(cmd.bold(true));
    parts.push(cmd.text("LOCAL: " + upperPt(locationName)));
    parts.push(cmd.bold(false));
  }
  parts.push(cmd.text("LANCADO POR: " + upperPt(resolveOriginLabel(p))));
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
  if (p.pix_confirmed) {
    parts.push(cmd.text(`PIX APROVADO : R$ ${totalVal.toFixed(2).replace(".", ",")}`));
  } else {
    parts.push(cmd.text(`VALOR A PAGAR : R$ ${totalVal.toFixed(2).replace(".", ",")}`));
  }
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));

  // Payment method / PIX confirmation
  if (p.pix_confirmed) {
    parts.push(cmd.separator());
    parts.push(cmd.alignCenter);
    parts.push(cmd.bold(true));
    parts.push(cmd.doubleSize(true));
    parts.push(cmd.text("PAGAMENTO CONFIRMADO!"));
    parts.push(cmd.doubleSize(false));
    parts.push(cmd.text(""));
    parts.push(cmd.text("PAGAMENTO EFETUADO EM PIX AUTOMATICO!"));
    parts.push(cmd.text(""));
    parts.push(cmd.text("PIX CONFIRMADO"));
    parts.push(cmd.bold(false));
    parts.push(cmd.text("Pagamento: PIX (Mercado Pago)"));
    if (p.pix_payment_id) {
      parts.push(cmd.text(`ID: ${p.pix_payment_id}`));
    }
    parts.push(cmd.text(""));
  } else if (p.payment_method) {
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
    cmd.alignCenter,
    cmd.text(""),
    cmd.bold(true),
    cmd.text(`* ${upperPt(job.station)} *`),
    cmd.bold(false),
    cmd.text(""),
    cmd.separator(),
    cmd.text(""),
  ];

  // Customer + Location + Lançado por
  logPrintDebug(job.id, p, "production");
  const customerName = p.customer_name || p.customerName || null;
  if (customerName) {
    parts.push(cmd.text("CLIENTE: " + upperPt(customerName)));
  }
  const locationName = safeLocation(p);
  if (locationName) {
    parts.push(cmd.bold(true));
    parts.push(cmd.text("LOCAL: " + upperPt(locationName)));
    parts.push(cmd.bold(false));
  }
  parts.push(cmd.text("LANCADO POR: " + upperPt(resolveOriginLabel(p))));
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
  const productName = upperPt(p.product_name || p.name || "Item");

  const qtyCol = 6;

  const parts = [
    cmd.init,
    cmd.codepage,
    cmd.alignCenter,
    cmd.text(""),
    cmd.bold(true),
    cmd.text("** CANCELAMENTO **"),
    cmd.bold(false),
    cmd.text(upperPt(job.station)),
    cmd.text(""),
    cmd.separator(),
    cmd.text(""),
  ];

  // Customer + Location + Lançado por
  logPrintDebug(job.id, p, "cancellation");
  const customerName = p.customer_name || p.customerName || null;
  if (customerName) {
    parts.push(cmd.text("CLIENTE: " + upperPt(customerName)));
  }
  const locationName = safeLocation(p);
  if (locationName) {
    parts.push(cmd.bold(true));
    parts.push(cmd.text("LOCAL: " + upperPt(locationName)));
    parts.push(cmd.bold(false));
  }
  parts.push(cmd.text("LANCADO POR: " + upperPt(resolveOriginLabel(p))));
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

  // Item — print name then a strike-through line underneath
  const nameMaxCols = COLS - qtyCol;
  const wrappedName = wordWrap(productName, nameMaxCols);
  // Print item line(s)
  parts.push(cmd.text(String(p.quantity || 1).padEnd(qtyCol) + wrappedName[0]));
  for (let i = 1; i < wrappedName.length; i++) {
    parts.push(cmd.text(" ".repeat(qtyCol) + wrappedName[i]));
  }
  // Horizontal line under the item to visually "cross it out"
  const strikeLine = "-".repeat(nameMaxCols);
  parts.push(cmd.text(" ".repeat(qtyCol) + strikeLine));

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

// ── 4) DANFE NFC-e ticket (fiscal receipt on thermal printer) ───────
function buildDanfeTicket(job) {
  const p = job.payload || {};
  // Use order_created_at for the sale date, fallback to job created_at
  const saleDate = p.order_created_at ? new Date(p.order_created_at) : new Date(job.created_at);
  const time = saleDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = saleDate.toLocaleDateString("pt-BR");
  const items = p.items || [];

  const qtyCol = 4;
  const priceCol = 10;
  const totalCol = 10;
  const itemsCol = COLS - qtyCol - priceCol - totalCol;

  const parts = [
    cmd.init,
    cmd.codepage,
    cmd.alignCenter,
    cmd.text(""),
    // ── Brand header ──
    cmd.bold(true),
    cmd.doubleSize(true),
    cmd.text("COFFEE THRONES"),
    cmd.doubleSize(false),
    cmd.bold(false),
    cmd.text(""),
    cmd.text(`CNPJ: ${CNPJ}`),
    cmd.text(""),
    cmd.separator(),
    // ── DANFE title ──
    cmd.bold(true),
    cmd.text("DANFE NFC-e"),
    cmd.bold(false),
    cmd.text("DOCUMENTO AUXILIAR DA NOTA FISCAL"),
    cmd.text("DE CONSUMIDOR ELETRONICA"),
    cmd.separator(),
    cmd.text(""),
  ];

  // ── Sale info block ──
  logPrintDebug(job.id, p, "danfe");
  parts.push(cmd.alignLeft);
  const comanda = p.comanda_number || null;
  const customer = p.customer_name || null;
  const danfeLocation = safeLocation(p);

  if (customer) {
    parts.push(cmd.padRow("CLIENTE:", upperPt(customer)));
  } else {
    parts.push(cmd.text("CONSUMIDOR NAO IDENTIFICADO"));
  }
  if (danfeLocation) {
    parts.push(cmd.padRow("LOCAL:", upperPt(danfeLocation)));
  }
  if (comanda) {
    parts.push(cmd.padRow("COMANDA:", comanda));
  }
  parts.push(cmd.padRow("LANCADO POR:", upperPt(resolveOriginLabel(p))));
  parts.push(cmd.padRow("DATA:", `${date}  ${time}`));
  parts.push(cmd.text(""));
  parts.push(cmd.separator());

  // ── Column headers ──
  parts.push(cmd.alignLeft);
  parts.push(cmd.bold(true));
  const hdrLine = "QTD".padEnd(qtyCol) + "PRODUTO".padEnd(itemsCol) + "UNIT".padStart(priceCol) + "TOTAL".padStart(totalCol);
  parts.push(cmd.text(hdrLine));
  parts.push(cmd.bold(false));
  parts.push(cmd.separator());

  // ── Items ──
  let subtotal = 0;
  for (const item of items) {
    const qty = item.quantity || 1;
    const price = Number(item.price || 0);
    const itemTotal = price * qty;
    subtotal += itemTotal;
    const name = upperPt(item.product_name || item.name || "ITEM");
    const unitStr = price.toFixed(2).replace(".", ",");
    const totalStr = itemTotal.toFixed(2).replace(".", ",");

    const wrappedName = wordWrap(name, itemsCol);
    // First line with all columns
    const firstLine = String(qty).padEnd(qtyCol)
      + wrappedName[0].padEnd(itemsCol)
      + unitStr.padStart(priceCol)
      + totalStr.padStart(totalCol);
    parts.push(cmd.text(firstLine));
    // Continuation lines (name only, indented)
    for (let i = 1; i < wrappedName.length; i++) {
      parts.push(cmd.text(" ".repeat(qtyCol) + wrappedName[i]));
    }
  }

  parts.push(cmd.text(""));
  parts.push(cmd.separator());

  // ── Subtotal + Total ──
  const totalVal = Number(p.total || subtotal);
  parts.push(cmd.alignRight);
  if (items.length > 1) {
    parts.push(cmd.text(`SUBTOTAL:  R$ ${subtotal.toFixed(2).replace(".", ",")}`));
  }
  parts.push(cmd.text(""));
  parts.push(cmd.bold(true));
  parts.push(cmd.doubleW(true));
  parts.push(cmd.text(`TOTAL: R$ ${totalVal.toFixed(2).replace(".", ",")}`));
  parts.push(cmd.doubleW(false));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));

  // ── Payment section ──
  parts.push(cmd.separator());
  parts.push(cmd.alignLeft);
  if (p.payment_method) {
    const payLabel = p.payment_method;
    const payAmount = p.payment_amount ? Number(p.payment_amount) : totalVal;
    parts.push(cmd.bold(true));
    parts.push(cmd.padRow("FORMA PGTO:", payLabel));
    parts.push(cmd.padRow("VALOR PAGO:", `R$ ${payAmount.toFixed(2).replace(".", ",")}`));
    parts.push(cmd.bold(false));
    // Show change if cash and overpaid
    if ((payLabel === "DINHEIRO" || payLabel === "cash") && payAmount > totalVal) {
      const change = payAmount - totalVal;
      parts.push(cmd.padRow("TROCO:", `R$ ${change.toFixed(2).replace(".", ",")}`));
    }
  }
  parts.push(cmd.text(""));

  // ── Access key ──
  parts.push(cmd.separator());
  parts.push(cmd.alignCenter);
  if (p.chave_acesso) {
    parts.push(cmd.text(""));
    parts.push(cmd.bold(true));
    parts.push(cmd.text("CHAVE DE ACESSO"));
    parts.push(cmd.bold(false));
    // Format chave in groups of 4 for readability
    const chave = String(p.chave_acesso).replace(/\s/g, "");
    const groups = chave.match(/.{1,4}/g) || [chave];
    parts.push(cmd.wrappedText(groups.join(" ")));
    parts.push(cmd.text(""));
  }

  // ── QR Code for NFC-e consultation ──
  const consultUrl = p.danfe_url || (p.chave_acesso
    ? `https://www.nfce.fazenda.gov.br/portal/consultarNFCe.aspx?chNFe=${p.chave_acesso}`
    : null);
  if (consultUrl) {
    // ESC/POS QR Code commands (GS ( k)
    const urlBuf = toPC860(consultUrl);
    const storeLen = urlBuf.length + 3;
    const pL = storeLen & 0xFF;
    const pH = (storeLen >> 8) & 0xFF;
    parts.push(
      // QR model 2
      Buffer.from([GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]),
      // QR size (module size 4)
      Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x04]),
      // QR error correction L
      Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30]),
      // Store data
      Buffer.from([GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]),
      urlBuf,
      // Print QR
      Buffer.from([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]),
    );
    parts.push(cmd.text(""));
    parts.push(cmd.text("Consulte via QR Code acima"));
    parts.push(cmd.text(""));
  }

  // ── Authorization ──
  parts.push(cmd.separator());
  parts.push(cmd.alignCenter);
  parts.push(cmd.bold(true));
  parts.push(cmd.text("NFC-e AUTORIZADA"));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));

  // ── Footer message ──
  parts.push(cmd.separator());
  parts.push(cmd.text(""));
  parts.push(cmd.bold(true));
  parts.push(cmd.text("Obrigado pela preferencia!"));
  parts.push(cmd.text("Volte sempre ao Reino"));
  parts.push(cmd.text("Coffee Thrones!"));
  parts.push(cmd.bold(false));
  parts.push(cmd.text(""));
  parts.push(cmd.text("@coffeethrones"));
  parts.push(cmd.text(""));

  parts.push(cmd.feedLines(3));
  parts.push(cmd.cut);

  return Buffer.concat(parts);
}

// ── Dispatcher ──────────────────────────────────────────────────────
function buildTicket(job) {
  const p = job.payload || {};
  if (p.type === "cancellation") return buildCancellationTicket(job);
  if (p.type === "danfe") return buildDanfeTicket(job);
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

// ── Windows Spooler: list installed printers via PowerShell ─────────
function listWindowsPrinters() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") return resolve([]);
    const ps = `Get-Printer | Select-Object Name,Default,PrinterStatus,PortName | ConvertTo-Json -Compress`;
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve([]);
      try {
        const raw = JSON.parse(stdout || "[]");
        const arr = Array.isArray(raw) ? raw : [raw];
        resolve(arr.map((p) => ({
          name: p.Name,
          isDefault: !!p.Default,
          status: String(p.PrinterStatus || ""),
          port: p.PortName || "",
        })));
      } catch {
        resolve([]);
      }
    });
  });
}

// ── CUPS: list installed printers (Linux/macOS fallback) ────────────
function listCupsPrinters() {
  return new Promise((resolve) => {
    if (process.platform === "win32") return resolve([]);
    execFile("lpstat", ["-p", "-d"], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve([]);
      const printers = [];
      let defaultName = null;
      for (const line of String(stdout).split(/\r?\n/)) {
        const m = line.match(/^printer\s+(\S+)\s+(.+)$/i);
        if (m) printers.push({ name: m[1], isDefault: false, status: m[2] || "", port: "" });
        const d = line.match(/^system default destination:\s+(\S+)/i);
        if (d) defaultName = d[1];
      }
      if (defaultName) printers.forEach((p) => { if (p.name === defaultName) p.isDefault = true; });
      resolve(printers);
    });
  });
}

async function listInstalledPrinters() {
  if (process.platform === "win32") return listWindowsPrinters();
  return listCupsPrinters();
}

// ── Windows: send RAW ESC/POS bytes to spooler via P/Invoke ─────────
function sendToWindowsSpooler(printerName, data) {
  return new Promise((resolve, reject) => {
    const tmpData = path.join(os.tmpdir(), `cprint_${Date.now()}_${Math.random().toString(36).slice(2)}.bin`);
    try { fs.writeFileSync(tmpData, data); } catch (e) { return reject(e); }

    const psScript = `
$ErrorActionPreference = 'Stop'
$printerName = $args[0]
$filePath = $args[1]
$bytes = [System.IO.File]::ReadAllBytes($filePath)
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DOCINFOW { [MarshalAs(UnmanagedType.LPWStr)] public string pDocName; [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile; [MarshalAs(UnmanagedType.LPWStr)] public string pDataType; }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPWStr)] string p, out IntPtr h, IntPtr d);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool StartDocPrinter(IntPtr h, int l, [In] ref DOCINFOW di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, IntPtr buf, int n, out int written);
  public static bool Send(string name, byte[] bytes) {
    IntPtr h; if (!OpenPrinter(name, out h, IntPtr.Zero)) return false;
    DOCINFOW di = new DOCINFOW(); di.pDocName = "HuskyPDV Ticket"; di.pDataType = "RAW";
    if (!StartDocPrinter(h, 1, ref di)) { ClosePrinter(h); return false; }
    if (!StartPagePrinter(h)) { EndDocPrinter(h); ClosePrinter(h); return false; }
    IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
    Marshal.Copy(bytes, 0, p, bytes.Length);
    int written; bool ok = WritePrinter(h, p, bytes.Length, out written);
    Marshal.FreeCoTaskMem(p);
    EndPagePrinter(h); EndDocPrinter(h); ClosePrinter(h);
    return ok;
  }
}
"@ -Language CSharp
$ok = [RawPrinter]::Send($printerName, $bytes)
if (-not $ok) { Write-Error "WritePrinter failed"; exit 2 }
Write-Host "OK"
`;
    const tmpPs = path.join(os.tmpdir(), `cprint_${Date.now()}.ps1`);
    try { fs.writeFileSync(tmpPs, psScript); } catch (e) { return reject(e); }

    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", tmpPs, printerName, tmpData], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (e) => { try { fs.unlinkSync(tmpData); } catch {} try { fs.unlinkSync(tmpPs); } catch {} reject(e); });
    child.on("close", (code) => {
      try { fs.unlinkSync(tmpData); } catch {}
      try { fs.unlinkSync(tmpPs); } catch {}
      if (code === 0) resolve();
      else reject(new Error(`PowerShell RawPrint falhou (code=${code}): ${stderr.trim()}`));
    });
  });
}

// ── Unix CUPS: send RAW via lp -o raw ───────────────────────────────
function sendToCupsPrinter(printerName, data) {
  return new Promise((resolve, reject) => {
    const child = spawn("lp", ["-d", printerName, "-o", "raw"], { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`lp falhou (code=${code}): ${stderr.trim()}`)));
    child.stdin.end(data);
  });
}

// ── Send to printer: spooler (Windows/CUPS) or TCP ──────────────────
async function sendToPrinter(printer, data) {
  const isSpooler = printer?.connection_type === "usb" || (!!printer?.usb_device && !printer?.ip);
  if (isSpooler) {
    const name = printer.usb_device || printer.name;
    if (!name) throw new Error(`Impressora "${printer?.name || "?"}" sem nome de spooler configurado`);
    if (process.platform === "win32") {
      await sendToWindowsSpooler(name, data);
    } else {
      await sendToCupsPrinter(name, data);
    }
    return `spooler:${name}`;
  }
  if (!printer?.ip) {
    throw new Error(`Impressora "${printer?.name || "?"}" sem IP nem spooler configurado`);
  }
  await sendToPrinterTcp(printer.ip, printer.port || 9100, data);
  return `${printer.ip}:${printer.port || 9100}`;
}

// ── Handle discovery jobs (list installed Windows/CUPS printers) ────
async function handleDiscoveryJob(job) {
  console.log(`  🔎 Discovery: listando impressoras instaladas no sistema...`);
  const printers = await listInstalledPrinters();
  const tenantId = job.tenant_id;

  if (!printers.length) {
    console.warn("  ⚠️  Nenhuma impressora instalada encontrada no sistema.");
  }

  // Limpa descobertas antigas deste tenant (>10 min)
  try {
    const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
    await supabase.from("usb_printer_discoveries").delete().lt("reported_at", cutoff).eq("tenant_id", tenantId);
  } catch {}

  for (const p of printers) {
    const display = `${p.name}${p.isDefault ? " (padrão)" : ""}${p.status && p.status !== "Normal" ? " — " + p.status : ""}`;
    try {
      await supabase.from("usb_printer_discoveries").upsert({
        tenant_id: tenantId,
        device_id: p.name,
        display_name: display,
        reported_at: new Date().toISOString(),
        agent_host: os.hostname(),
      }, { onConflict: "tenant_id,device_id" });
    } catch (e) {
      console.error("  ❌ erro upsert discovery:", e.message);
    }
  }

  await supabase.from("print_jobs").update({ status: "printed", printed_at: new Date().toISOString() }).eq("id", job.id);
  console.log(`  ✅ Discovery: ${printers.length} impressora(s) reportada(s)`);
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
const PRODUCTION_STATIONS = ["Cozinha", "Bebidas", "Sobremesa"];

function isGroupedProductionJob(job) {
  if (!PRODUCTION_STATIONS.includes(job.station)) return true;
  const payload = job.payload || {};
  if (payload.type === "cancellation" || payload.type === "danfe") return true;
  return Array.isArray(payload.items) && payload.items.length > 0;
}

// ── Process a single job ────────────────────────────────────────────
async function processJob(job, printers) {
  if (processedIds.has(job.id)) return;

  // Discovery jobs: list installed printers (qualquer estação)
  const payloadType = job.payload?.type;
  if (payloadType === "discover_usb" || payloadType === "discover_printers" || payloadType === "discover_windows") {
    processedIds.add(job.id);
    try { await handleDiscoveryJob(job); }
    catch (e) {
      console.error("❌ erro discovery:", e.message);
      try { await supabase.from("print_jobs").update({ status: "error" }).eq("id", job.id); } catch {}
    }
    return;
  }

  if (!AUTO_PRINT_STATIONS.includes(job.station)) return;

  if (!isGroupedProductionJob(job)) {
    processedIds.add(job.id);
    console.warn(`⚠️  Job ignorado (fora da regra de impressão no salvar): ${job.id.slice(0, 8)} (${job.station})`);
    try {
      await supabase
        .from("print_jobs")
        .update({ status: "canceled" })
        .eq("id", job.id);
    } catch (_) {
      // ignore
    }
    return;
  }

  processedIds.add(job.id);

  const printer = findPrinterForStation(printers, job.station);

  if (!printer) {
    console.warn(`⚠️  Sem impressora para estação "${job.station}" — job ${job.id.slice(0, 8)} ignorado`);
    return;
  }

  const hasSpooler = !!printer.usb_device || printer.connection_type === "usb";
  if (!printer.ip && !hasSpooler) {
    console.warn(`⚠️  Impressora "${printer.name}" sem IP nem spooler — job ${job.id.slice(0, 8)} ignorado`);
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
let safetyInterval = null;
const SAFETY_POLL_MS = 15_000; // always-on safety net poll every 15s

function startFallbackPolling() {
  if (fallbackInterval) return;
  console.log(`  ⏱  Fallback polling ativo (${CONFIG.pollInterval}ms)`);
  fallbackInterval = setInterval(pollAndPrint, CONFIG.pollInterval);
}

function stopFallbackPolling() {
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
    console.log("  ⏱  Fallback polling rápido desativado (Realtime conectado)");
  }
}

function startSafetyPolling() {
  if (safetyInterval) return;
  console.log(`  🛡️  Safety polling ativo (${SAFETY_POLL_MS}ms) — sempre ligado`);
  safetyInterval = setInterval(pollAndPrint, SAFETY_POLL_MS);
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

// Always-on safety polling to catch silently missed Realtime events
startSafetyPolling();

// Initial poll to catch any pending jobs from before agent started
setTimeout(pollAndPrint, 1000);

// Health check every 10 seconds
const healthInterval = setInterval(healthCheckLoop, 10000);

// Graceful shutdown
process.on("SIGINT", () => {
  stopFallbackPolling();
  if (safetyInterval) clearInterval(safetyInterval);
  clearInterval(healthInterval);
  supabase.removeChannel(realtimeChannel);
  console.log(`\n  🛑 Agente encerrado. ${jobsProcessed} tickets impressos nesta sessão.\n`);
  process.exit(0);
});
