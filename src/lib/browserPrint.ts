// Impressão térmica via navegador (window.print) — fallback que não depende do HuskyPDV Agent.
// Layout otimizado para impressoras térmicas 80mm (ex: Elgin i9). Largura útil 72mm.

export type BrowserPrintItem = {
  product_name: string;
  quantity: number;
  price?: number;
  complements?: string[];
  sale_type?: "unit" | "weight";
  price_per_kg?: number | null;
  grams?: number | null;
};

export type BrowserPrintPayload = {
  type?: "test" | "bill" | "kitchen";
  title?: string;
  business_name?: string;
  business_phone?: string | null;
  table_name?: string | null;
  customer_name?: string | null;
  waiter_name?: string | null;
  items?: BrowserPrintItem[];
  total?: number;
  payment_method?: string;
  change?: number | null;
  footer_message?: string;
  message?: string;
  paper?: "80mm" | "58mm";
};

const escape = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const brl = (n: number) =>
  `R$ ${(Number(n) || 0).toFixed(2).replace(".", ",")}`;

function buildHtml(p: BrowserPrintPayload): string {
  const paper = p.paper ?? "80mm";
  const widthMm = paper === "58mm" ? 54 : 72;
  const items = p.items ?? [];

  const productsTotal = items.reduce(
    (acc, it) => acc + (it.price ?? 0) * (it.quantity ?? 1),
    0,
  );
  const total = typeof p.total === "number" ? p.total : productsTotal;

  const dashes = "-".repeat(paper === "58mm" ? 32 : 42);

  const itemsHtml = items
    .map((it) => {
      const isWeight = it.sale_type === "weight" && (it.grams ?? 0) > 0 && (it.price_per_kg ?? 0) > 0;
      const unit = isWeight ? Number(it.price_per_kg) : (it.price ?? 0);
      const sub = (it.price ?? 0) * (it.quantity ?? 1);
      // Para venda por peso: QNT vira "0,378 kg" e o nome perde o sufixo "- 378g"
      const qntCell = isWeight
        ? `${(Number(it.grams) / 1000).toFixed(3).replace(".", ",")} kg`
        : String(it.quantity);
      const displayName = isWeight
        ? String(it.product_name).replace(/\s*-\s*\d+(?:[.,]\d+)?\s*g\s*$/i, "")
        : it.product_name;
      const compl =
        it.complements && it.complements.length
          ? `<tr class="compl"><td colspan="4">+ ${it.complements.map(escape).join(", ")}</td></tr>`
          : "";
      return `<tr>
        <td class="prod">${escape(displayName)}</td>
        <td class="qnt">${escape(qntCell)}</td>
        <td class="unit">${unit.toFixed(2).replace(".", ",")}</td>
        <td class="tot">${sub.toFixed(2).replace(".", ",")}</td>
      </tr>${compl}`;
    })
    .join("");

  const title =
    p.title ??
    (p.type === "bill"
      ? "CONTA"
      : p.type === "kitchen"
        ? "PEDIDO COZINHA"
        : "TESTE DE IMPRESSAO");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escape(title)}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { margin: 0; padding: 0; background: #fff !important; color: #000 !important; }
  body {
    font-family: 'Courier New', Consolas, monospace;
    font-size: 13px;
    line-height: 1.25;
    color: #000;
    font-weight: 700;
    width: ${widthMm}mm;
    padding: 1mm 0;
    -webkit-font-smoothing: none;
    font-variant-numeric: tabular-nums;
    text-rendering: geometricPrecision;
  }
  .receipt, .receipt * {
    color: #000 !important;
    opacity: 1 !important;
    font-weight: 700 !important;
    background: transparent !important;
    text-shadow: 0 0 0 #000;
  }
  div, p { margin: 0; padding: 0; line-height: 1.25; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 900 !important; }
  .upper  { text-transform: uppercase; }
  .big    { font-size: 14px; font-weight: 900 !important; }
  .xl     { font-size: 16px; font-weight: 900 !important; }
  .dashes { letter-spacing: 0; white-space: nowrap; overflow: hidden; }

  .separator { border: 0; border-top: 2px dashed #000; margin: 1mm 0; }

  table.items {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Courier New', Consolas, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
    line-height: 1.25;
    color: #000 !important;
    font-weight: 700 !important;
  }
  table.items th, table.items td {
    padding: 0;
    vertical-align: top;
    line-height: 1.25;
    color: #000 !important;
  }
  table.items th { font-weight: 900 !important; text-align: left; }
  table.items td.prod, table.items th.prod { text-align: left;  word-break: break-word; }
  table.items td.qnt,  table.items th.qnt  { text-align: center; width: 7mm;  white-space: nowrap; padding-left: 1mm; }
  table.items td.unit, table.items th.unit { text-align: right;  width: 13mm; white-space: nowrap; padding-left: 1mm; }
  table.items td.tot,  table.items th.tot  { text-align: right;  width: 14mm; white-space: nowrap; padding-left: 1mm; }
  table.items tr.compl td {
    font-size: 12px;
    font-style: italic;
    font-weight: 700 !important;
    padding-left: 2mm;
  }

  .totals { margin-top: 1mm; }
  .totals .row {
    display: flex;
    justify-content: space-between;
    line-height: 1.25;
    font-weight: 900 !important;
  }
  .totals .grand {
    font-size: 16px;
    font-weight: 900 !important;
    margin-top: 1mm;
  }

  .controls {
    position: fixed;
    top: 8px; right: 8px;
    display: flex; gap: 6px;
    font-family: system-ui, sans-serif;
  }
  .controls button {
    padding: 6px 10px; border: 1px solid #333; background: #fff;
    cursor: pointer; font-size: 12px;
  }

  @media print {
    .controls, .no-print { display: none !important; }
    html, body {
      background: #fff !important;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body { width: ${widthMm}mm; margin: 0; padding: 0; }
    .receipt, .receipt * {
      color: #000 !important;
      opacity: 1 !important;
      font-weight: 700 !important;
      filter: contrast(180%) brightness(80%);
      text-shadow: 0 0 0 #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      text-rendering: geometricPrecision;
    }
    .receipt .bold,
    .receipt .big,
    .receipt .xl,
    .receipt table.items th,
    .receipt .totals .row,
    .receipt .totals .grand { font-weight: 900 !important; }
  }
</style>
</head>
<body>
  <div class="controls no-print">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Fechar</button>
  </div>

  <div class="receipt">
  <div class="center bold upper big">${escape(p.business_name ?? "HuskyPDV")}</div>
  ${p.business_phone ? `<div class="center">${escape(p.business_phone)}</div>` : ""}
  <div class="center bold upper big">${escape(title)}${p.table_name ? ` / MESA ${escape(p.table_name)}` : ""}</div>
  <hr class="separator" />
  <div class="center bold">NAO E DOCUMENTO FISCAL</div>
  <hr class="separator" />
  ${p.customer_name ? `<div>Cliente: ${escape(p.customer_name)}</div>` : ""}
  ${p.waiter_name ? `<div>Atendente: ${escape(p.waiter_name)}</div>` : ""}
  <div>${new Date().toLocaleString("pt-BR")}</div>
  <hr class="separator" />

  ${
    items.length
      ? `<table class="items">
          <thead>
            <tr>
              <th class="prod">PRODUTO</th>
              <th class="qnt">QNT</th>
              <th class="unit">UNIT</th>
              <th class="tot">TOTAL</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <hr class="separator" />
        <div class="totals">
          <div class="row"><span>PRODUTOS:</span><span>${brl(productsTotal)}</span></div>
          <div class="row grand"><span>TOTAL:</span><span>${brl(total)}</span></div>
        </div>`
      : `<div>${escape(p.message ?? "Cupom de teste — impressao pelo navegador OK.")}</div>`
  }

  ${p.payment_method ? `<div>Pagto: ${escape(p.payment_method)}</div>` : ""}
  ${typeof p.change === "number" && p.change > 0 ? `<div>Troco: ${brl(p.change)}</div>` : ""}

  <hr class="separator" />
  <div class="center bold">Volte sempre!!!</div>
  <div style="height:6mm"></div>
  </div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { try { window.focus(); window.print(); } catch(_) {} }, 80);
    });
    window.addEventListener('afterprint', () => { setTimeout(() => window.close(), 150); });
  </script>
</body>
</html>`;
}

/**
 * Impressão silenciosa via <iframe> oculto.
 * Combinado com Chrome/Edge em modo --kiosk-printing,
 * a impressão sai direto na impressora padrão sem popup.
 * Sem kiosk-printing, o navegador exibe o diálogo padrão (fallback nativo).
 */
export function printViaBrowser(payload: BrowserPrintPayload): boolean {
  try {
    const html = buildHtml(payload);

    // Remove iframes anteriores ainda presentes
    document.querySelectorAll("iframe[data-husky-print]").forEach((el) => el.remove());

    const iframe = document.createElement("iframe");
    iframe.setAttribute("data-husky-print", "1");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      iframe.remove();
      return false;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const cw = iframe.contentWindow!;
    const cleanup = () => setTimeout(() => iframe.remove(), 1000);

    cw.addEventListener("afterprint", cleanup);

    // Dispara print após o conteúdo carregar.
    const trigger = () => {
      try {
        cw.focus();
        cw.print();
      } catch (e) {
        console.error("[browserPrint] print error:", e);
      }
    };

    if (doc.readyState === "complete") {
      setTimeout(trigger, 80);
    } else {
      cw.addEventListener("load", () => setTimeout(trigger, 80));
    }

    // Fallback de cleanup caso afterprint não dispare (ex: cancelamento)
    setTimeout(() => {
      if (document.body.contains(iframe)) iframe.remove();
    }, 30000);

    return true;
  } catch (e) {
    console.error("[browserPrint] erro:", e);
    return false;
  }
}
