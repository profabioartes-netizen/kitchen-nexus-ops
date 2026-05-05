// ============================================================
// HuskyPDV — Renderers ESC/POS
// Gera buffers binários para impressoras térmicas (POS-58/POS-80).
// ============================================================

const ESC = "\x1B";
const GS = "\x1D";
const INIT = `${ESC}@`;
const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;
const BIG_ON = `${GS}!\x11`;
const BIG_OFF = `${GS}!\x00`;
const CUT = `${GS}V\x42\x00`;
const NL = "\n";

function center(text, w) {
  const t = String(text).slice(0, w);
  const pad = Math.max(0, Math.floor((w - t.length) / 2));
  return " ".repeat(pad) + t;
}

function line(char, w) {
  return char.repeat(w);
}

function row(left, right, w) {
  const l = String(left);
  const r = String(right);
  const space = Math.max(1, w - l.length - r.length);
  return l + " ".repeat(space) + r;
}

function money(n) {
  return `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
}

function fmtDate(d = new Date()) {
  return d.toLocaleString("pt-BR", { hour12: false });
}

// ------------------------------------------------------------
// Ticket de comanda / caixa (compact: true)
// ------------------------------------------------------------
function renderBillCompact(payload, width) {
  const W = width || 48;
  const {
    business_name = "ESTABELECIMENTO",
    business_phone,
    items = [],
    total = 0,
    subtotal,
    discount,
    service_fee,
    payments = [],
    change,
    table_label,
    customer_name,
    waiter_name,
    order_id,
    footer_message = "Volte sempre!!!",
  } = payload;

  let out = INIT;
  out += BOLD_ON + BIG_ON + center(business_name, Math.floor(W / 2)) + BIG_OFF + BOLD_OFF + NL;
  if (business_phone) out += center(`Tel: ${business_phone}`, W) + NL;
  out += center(fmtDate(), W) + NL;
  out += line("=", W) + NL;

  if (table_label) out += `Mesa: ${table_label}` + NL;
  if (customer_name) out += `Cliente: ${customer_name}` + NL;
  if (waiter_name) out += `Atendente: ${waiter_name}` + NL;
  if (order_id) out += `Comanda: ${String(order_id).slice(0, 8)}` + NL;
  if (table_label || customer_name || waiter_name || order_id) {
    out += line("-", W) + NL;
  }

  for (const it of items) {
    const qty = it.quantity || 1;
    const name = (it.product_name || it.name || "").slice(0, W - 12);
    const lineTotal = (it.price || 0) * qty;
    out += row(`${qty}x ${name}`, money(lineTotal), W) + NL;
  }

  out += line("-", W) + NL;

  if (subtotal != null && subtotal !== total) {
    out += row("Subtotal", money(subtotal), W) + NL;
  }
  if (discount && discount > 0) {
    out += row("Desconto", `-${money(discount)}`, W) + NL;
  }
  if (service_fee && service_fee > 0) {
    out += row("Taxa servico", money(service_fee), W) + NL;
  }

  out += BOLD_ON + row("TOTAL", money(total), W) + BOLD_OFF + NL;

  if (payments.length > 0) {
    out += line("-", W) + NL;
    for (const p of payments) {
      out += row(p.method || "Pagamento", money(p.amount), W) + NL;
    }
    if (change && change > 0) {
      out += row("Troco", money(change), W) + NL;
    }
  }

  out += line("=", W) + NL;
  out += center(footer_message, W) + NL;
  out += NL + NL + CUT;
  return out;
}

// ------------------------------------------------------------
// Ticket de produção (cozinha / bar) — agrupado
// ------------------------------------------------------------
function renderProduction(payload, width) {
  const W = width || 48;
  const {
    station = "PRODUCAO",
    table_label,
    customer_name,
    waiter_name,
    items = [],
  } = payload;

  let out = INIT;
  out += BOLD_ON + BIG_ON + center(String(station).toUpperCase(), Math.floor(W / 2)) + BIG_OFF + BOLD_OFF + NL;
  out += center(fmtDate(), W) + NL;
  out += line("=", W) + NL;

  if (table_label) out += BOLD_ON + `MESA: ${table_label}` + BOLD_OFF + NL;
  if (customer_name) out += `Cliente: ${customer_name}` + NL;
  if (waiter_name) out += `Atendente: ${waiter_name}` + NL;
  out += line("-", W) + NL;

  for (const it of items) {
    const qty = it.quantity || 1;
    const name = (it.product_name || it.name || "").slice(0, W - 4);
    out += BOLD_ON + `${qty}x ${name}` + BOLD_OFF + NL;
    if (it.notes) {
      out += `   >> ${String(it.notes).slice(0, W - 6)}` + NL;
    }
    if (Array.isArray(it.complements)) {
      for (const c of it.complements) {
        out += `   + ${c.complement_name || c.name}` + NL;
      }
    }
  }

  out += line("=", W) + NL;
  out += NL + NL + CUT;
  return out;
}

// ------------------------------------------------------------
// Ticket de teste
// ------------------------------------------------------------
function renderTest(payload, width) {
  const W = width || 48;
  const {
    title = "TESTE DE IMPRESSAO",
    printer_name,
    station,
    message = "Se voce consegue ler este ticket, a impressora esta OK.",
  } = payload;

  let out = INIT;
  out += BOLD_ON + BIG_ON + center(title, Math.floor(W / 2)) + BIG_OFF + BOLD_OFF + NL;
  out += center(fmtDate(), W) + NL;
  out += line("=", W) + NL;
  if (printer_name) out += `Impressora: ${printer_name}` + NL;
  if (station) out += `Estacao: ${station}` + NL;
  out += line("-", W) + NL;
  out += message + NL;
  out += line("=", W) + NL;
  out += NL + NL + CUT;
  return out;
}

// ------------------------------------------------------------
// Ticket de cancelamento
// ------------------------------------------------------------
function renderCancellation(payload, width) {
  const W = width || 48;
  const { table_label, item_name, quantity, reason, canceled_by } = payload;

  let out = INIT;
  out += BOLD_ON + BIG_ON + center("** CANCELAMENTO **", Math.floor(W / 2)) + BIG_OFF + BOLD_OFF + NL;
  out += center(fmtDate(), W) + NL;
  out += line("=", W) + NL;
  if (table_label) out += `Mesa: ${table_label}` + NL;
  if (item_name) out += BOLD_ON + `${quantity || 1}x ${item_name}` + BOLD_OFF + NL;
  if (reason) out += `Motivo: ${reason}` + NL;
  if (canceled_by) out += `Por: ${canceled_by}` + NL;
  out += line("=", W) + NL;
  out += NL + NL + CUT;
  return out;
}

// ------------------------------------------------------------
// Roteador principal
// ------------------------------------------------------------
function renderJob(job, width) {
  const payload = job.payload || {};
  const type = payload.type || "bill";

  switch (type) {
    case "bill":
      return renderBillCompact(payload, width);
    case "production":
      return renderProduction(payload, width);
    case "test":
      return renderTest(payload, width);
    case "cancellation":
      return renderCancellation(payload, width);
    case "discover_usb":
      // Tipo especial: tratado fora do renderer
      return null;
    default:
      // Fallback genérico
      return renderTest({ title: `TIPO: ${type}`, message: JSON.stringify(payload).slice(0, 200) }, width);
  }
}

module.exports = { renderJob, renderBillCompact, renderProduction, renderTest, renderCancellation };
