// Formata um BrowserPrintPayload em texto monoespaçado pronto para impressão
// RAW em impressoras térmicas (80mm = 48 colunas, 58mm = 32 colunas).
// Inclui no final o comando ESC/POS de corte (\x1d\x56\x00) que impressoras
// que não suportam ignoram silenciosamente.

import type { BrowserPrintPayload } from "./browserPrint";

const ESC_CUT = "\x1d\x56\x00"; // GS V 0 — corte total

const brl = (n: number) =>
  `R$ ${(Number(n) || 0).toFixed(2).replace(".", ",")}`;

function center(text: string, width: number): string {
  const t = text.slice(0, width);
  const pad = Math.max(0, Math.floor((width - t.length) / 2));
  return " ".repeat(pad) + t;
}

function rule(width: number): string {
  return "-".repeat(width);
}

function pad(s: string, len: number, align: "left" | "right" = "left"): string {
  const t = String(s ?? "");
  if (t.length >= len) return t.slice(0, len);
  const fill = " ".repeat(len - t.length);
  return align === "right" ? fill + t : t + fill;
}

// Quebra um nome de produto em múltiplas linhas respeitando a largura da coluna
function wrapName(name: string, width: number): string[] {
  const words = name.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if (!current.length) {
      current = w.length > width ? w.slice(0, width) : w;
      if (w.length > width) {
        lines.push(current);
        current = w.slice(width);
      }
    } else if (current.length + 1 + w.length <= width) {
      current += " " + w;
    } else {
      lines.push(current);
      current = w.length > width ? w.slice(0, width) : w;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function formatReceiptText(p: BrowserPrintPayload): string {
  const paper = p.paper ?? "80mm";
  const W = paper === "58mm" ? 32 : 48;

  // Larguras das colunas (qnt 5, unit 8, total 9 → ajusta sobra para o nome)
  const COL_QNT = paper === "58mm" ? 4 : 5;
  const COL_UNIT = paper === "58mm" ? 6 : 8;
  const COL_TOT = paper === "58mm" ? 7 : 9;
  const COL_NAME = W - COL_QNT - COL_UNIT - COL_TOT - 3; // 3 espaços de gap

  const out: string[] = [];

  const title =
    p.title ??
    (p.type === "bill"
      ? "CONTA"
      : p.type === "kitchen"
        ? "PEDIDO COZINHA"
        : "TESTE DE IMPRESSAO");

  out.push(center((p.business_name ?? "HuskyPDV").toUpperCase(), W));
  if (p.business_phone) out.push(center(p.business_phone, W));
  out.push(center(`${title}${p.table_name ? ` / MESA ${p.table_name}` : ""}`, W));
  out.push(rule(W));
  out.push(center("NAO E DOCUMENTO FISCAL", W));
  out.push(rule(W));
  if (p.customer_name) out.push(`Cliente: ${p.customer_name}`);
  if (p.waiter_name) out.push(`Atendente: ${p.waiter_name}`);
  out.push(new Date().toLocaleString("pt-BR"));
  out.push(rule(W));

  const items = p.items ?? [];

  if (items.length) {
    // Cabeçalho de colunas
    out.push(
      pad("PRODUTO", COL_NAME) +
        " " +
        pad("QNT", COL_QNT, "right") +
        " " +
        pad("UNIT", COL_UNIT, "right") +
        " " +
        pad("TOTAL", COL_TOT, "right"),
    );
    out.push(rule(W));

    let productsTotal = 0;
    for (const it of items) {
      const isWeight =
        it.sale_type === "weight" &&
        (it.grams ?? 0) > 0 &&
        (it.price_per_kg ?? 0) > 0;
      const unit = isWeight ? Number(it.price_per_kg) : it.price ?? 0;
      const qty = it.quantity ?? 1;
      const sub = (it.price ?? 0) * qty;
      productsTotal += sub;

      const qntCell = isWeight
        ? `${(Number(it.grams) / 1000).toFixed(3).replace(".", ",")}kg`
        : String(qty);
      const displayName = isWeight
        ? String(it.product_name).replace(/\s*-\s*\d+(?:[.,]\d+)?\s*g\s*$/i, "")
        : it.product_name;

      const nameLines = wrapName(displayName.toUpperCase(), COL_NAME);

      // Primeira linha leva qnt/unit/total
      out.push(
        pad(nameLines[0] ?? "", COL_NAME) +
          " " +
          pad(qntCell, COL_QNT, "right") +
          " " +
          pad(unit.toFixed(2).replace(".", ","), COL_UNIT, "right") +
          " " +
          pad(sub.toFixed(2).replace(".", ","), COL_TOT, "right"),
      );
      // Demais linhas só com nome
      for (let i = 1; i < nameLines.length; i++) {
        out.push(pad(nameLines[i], COL_NAME));
      }
      // Complementos
      if (it.complements && it.complements.length) {
        const compl = `+ ${it.complements.join(", ")}`;
        for (const ln of wrapName(compl, W - 2)) {
          out.push("  " + ln);
        }
      }
    }

    out.push(rule(W));
    const total = typeof p.total === "number" ? p.total : productsTotal;
    const totalsLine = (label: string, value: string) =>
      pad(label, W - value.length) + value;
    out.push(totalsLine("PRODUTOS:", brl(productsTotal)));
    out.push(totalsLine("TOTAL:", brl(total)));
  } else {
    out.push(p.message ?? "Cupom de teste — impressao OK.");
  }

  if (p.payment_method) out.push(`Pagto: ${p.payment_method}`);
  if (typeof p.change === "number" && p.change > 0) {
    out.push(`Troco: ${brl(p.change)}`);
  }

  out.push(rule(W));
  out.push(center("Volte sempre!!!", W));
  out.push("");
  out.push("");
  out.push("");
  out.push("");
  out.push("");

  // CR/LF para máxima compatibilidade + corte ESC/POS no fim
  return out.join("\r\n") + "\r\n" + ESC_CUT;
}
