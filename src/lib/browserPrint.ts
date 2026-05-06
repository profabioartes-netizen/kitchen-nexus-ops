// Impressão térmica via navegador (window.print) — fallback que não depende do HuskyPDV Agent.
// Layout otimizado para impressoras térmicas 80mm (ex: Elgin i9). Largura útil 72mm.

export type BrowserPrintItem = {
  product_name: string;
  quantity: number;
  price?: number;
  complements?: string[];
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
      const unit = it.price ?? 0;
      const sub = unit * (it.quantity ?? 1);
      const compl =
        it.complements && it.complements.length
          ? `<tr class="compl"><td colspan="4">+ ${it.complements.map(escape).join(", ")}</td></tr>`
          : "";
      return `<tr>
        <td class="prod">${escape(it.product_name)}</td>
        <td class="qnt">${it.quantity}</td>
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
  html, body { margin: 0; padding: 0; background: #fff; }
  body {
    font-family: 'Courier New', Consolas, monospace;
    font-size: 12px;
    line-height: 1.0;
    color: #000;
    width: ${widthMm}mm;
    padding: 1mm 0;
    -webkit-font-smoothing: none;
    font-variant-numeric: tabular-nums;
  }
  div, p { margin: 0; padding: 0; line-height: 1.0; }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .upper  { text-transform: uppercase; }
  .big    { font-size: 14px; }
  .xl     { font-size: 16px; }
  .dashes { letter-spacing: 0; white-space: nowrap; overflow: hidden; }

  table.items {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Courier New', Consolas, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
    line-height: 1.0;
  }
  table.items th, table.items td {
    padding: 0;
    vertical-align: top;
    line-height: 1.0;
  }
  table.items th { font-weight: 700; text-align: left; }
  table.items td.prod, table.items th.prod { text-align: left;  word-break: break-word; }
  table.items td.qnt,  table.items th.qnt  { text-align: center; width: 7mm;  white-space: nowrap; padding-left: 1mm; }
  table.items td.unit, table.items th.unit { text-align: right;  width: 13mm; white-space: nowrap; padding-left: 1mm; }
  table.items td.tot,  table.items th.tot  { text-align: right;  width: 14mm; white-space: nowrap; padding-left: 1mm; }
  table.items tr.compl td {
    font-size: 11px;
    font-style: italic;
    padding-left: 2mm;
  }

  .totals { margin-top: 1mm; }
  .totals .row {
    display: flex;
    justify-content: space-between;
    line-height: 1.0;
  }
  .totals .grand {
    font-size: 16px;
    font-weight: 700;
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
    body { width: ${widthMm}mm; margin: 0; padding: 0; }
  }
</style>
</head>
<body>
  <div class="controls no-print">
    <button onclick="window.print()">Imprimir</button>
    <button onclick="window.close()">Fechar</button>
  </div>

  <div class="center bold upper big">${escape(p.business_name ?? "HuskyPDV")}</div>
  ${p.business_phone ? `<div class="center">${escape(p.business_phone)}</div>` : ""}
  <div class="center bold upper big">${escape(title)}${p.table_name ? ` / MESA ${escape(p.table_name)}` : ""}</div>
  <div class="center dashes">${dashes}</div>
  <div class="center">NAO E DOCUMENTO FISCAL</div>
  <div class="center dashes">${dashes}</div>
  ${p.customer_name ? `<div>Cliente: ${escape(p.customer_name)}</div>` : ""}
  ${p.waiter_name ? `<div>Atendente: ${escape(p.waiter_name)}</div>` : ""}
  <div>${new Date().toLocaleString("pt-BR")}</div>
  <div class="center dashes">${dashes}</div>

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
        <div class="center dashes">${dashes}</div>
        <div class="totals">
          <div class="row"><span>PRODUTOS:</span><span>${brl(productsTotal)}</span></div>
          <div class="row grand"><span>TOTAL:</span><span>${brl(total)}</span></div>
        </div>`
      : `<div>${escape(p.message ?? "Cupom de teste — impressao pelo navegador OK.")}</div>`
  }

  ${p.payment_method ? `<div>Pagto: ${escape(p.payment_method)}</div>` : ""}
  ${typeof p.change === "number" && p.change > 0 ? `<div>Troco: ${brl(p.change)}</div>` : ""}

  <div class="center dashes">${dashes}</div>
  <div class="center bold">Volte sempre!!!</div>
  <div style="height:6mm"></div>

  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { try { window.focus(); window.print(); } catch(_) {} }, 120);
    });
    window.addEventListener('afterprint', () => { setTimeout(() => window.close(), 200); });
  </script>
</body>
</html>`;
}

export function printViaBrowser(payload: BrowserPrintPayload): boolean {
  try {
    const html = buildHtml(payload);
    const w = window.open("", "_blank", "width=400,height=700");
    if (!w) {
      alert("Pop-up bloqueado pelo navegador. Permita pop-ups para imprimir pelo navegador.");
      return false;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    return true;
  } catch (e) {
    console.error("[browserPrint] erro:", e);
    return false;
  }
}
