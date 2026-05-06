// Impressão térmica via navegador (window.print) — fallback que não depende do HuskyPDV Agent.
// Útil quando o Agent ainda não está instalado, está offline, ou a impressão pela fila falha.

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

function buildHtml(p: BrowserPrintPayload): string {
  // Largura útil: 72mm para papel 80mm (evita corte nas bordas), 54mm para 58mm.
  const paper = p.paper ?? "80mm";
  const widthMm = paper === "58mm" ? 54 : 72;
  const items = p.items ?? [];
  const itemsHtml = items
    .map((it) => {
      const sub = (it.price ?? 0) * (it.quantity ?? 1);
      const compl =
        it.complements && it.complements.length
          ? `<tr class="compl-row"><td></td><td colspan="2">+ ${it.complements.map(escape).join(", ")}</td></tr>`
          : "";
      return `<tr class="item">
        <td class="qty">${it.quantity}x</td>
        <td class="name">${escape(it.product_name)}</td>
        <td class="price">${sub.toFixed(2)}</td>
      </tr>${compl}`;
    })
    .join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escape(p.title ?? "Cupom")}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    line-height: 1.25;
    color: #000;
    width: ${widthMm}mm;
    padding: 1mm 0;
    -webkit-font-smoothing: none;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: 700; }
  .big    { font-size: 14px; }
  .muted  { font-size: 10px; }
  .sep    { border-top: 1px dashed #000; margin: 3px 0; }

  /* Tabela de itens — garante colunas alinhadas verticalmente */
  table.items {
    width: 100%;
    border-collapse: collapse;
    font-family: 'Courier New', Courier, monospace;
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }
  table.items td {
    padding: 1px 0;
    vertical-align: top;
  }
  table.items td.qty   { width: 9mm;  text-align: left; }
  table.items td.name  { text-align: left; word-break: break-word; }
  table.items td.price { width: 18mm; text-align: right; white-space: nowrap; }
  table.items tr.compl-row td {
    font-size: 11px;
    font-style: italic;
    padding-left: 2mm;
    padding-bottom: 2px;
  }

  .total {
    display: flex;
    justify-content: space-between;
    font-size: 14px;
    font-weight: 700;
    margin-top: 4px;
    font-variant-numeric: tabular-nums;
  }

  @media print {
    body { width: ${widthMm}mm; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  <div class="center bold big">${escape(p.business_name ?? "HuskyPDV")}</div>
  ${p.business_phone ? `<div class="center muted">${escape(p.business_phone)}</div>` : ""}
  <div class="sep"></div>
  <div class="center bold">${escape(p.title ?? (p.type === "bill" ? "CONTA" : p.type === "kitchen" ? "PEDIDO COZINHA" : "TESTE DE IMPRESSÃO"))}</div>
  ${p.table_name ? `<div>Mesa/Local: <b>${escape(p.table_name)}</b></div>` : ""}
  ${p.customer_name ? `<div>Cliente: ${escape(p.customer_name)}</div>` : ""}
  ${p.waiter_name ? `<div>Atendente: ${escape(p.waiter_name)}</div>` : ""}
  <div class="muted">${new Date().toLocaleString("pt-BR")}</div>
  <div class="sep"></div>
  ${items.length ? itemsHtml : `<div>${escape(p.message ?? "Cupom de teste — impressão pelo navegador OK.")}</div>`}
  ${typeof p.total === "number" ? `<div class="sep"></div><div class="total"><span>TOTAL</span><span>R$ ${p.total.toFixed(2)}</span></div>` : ""}
  ${p.payment_method ? `<div>Pagto: ${escape(p.payment_method)}</div>` : ""}
  ${typeof p.change === "number" && p.change > 0 ? `<div>Troco: R$ ${p.change.toFixed(2)}</div>` : ""}
  <div class="sep"></div>
  <div class="center muted">${escape(p.footer_message ?? "Obrigado!")}</div>
  <div class="center muted">Impresso via navegador</div>
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => { try { window.focus(); window.print(); } catch(_) {} }, 100);
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
