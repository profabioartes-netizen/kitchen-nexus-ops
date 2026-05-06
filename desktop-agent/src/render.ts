// Renderiza o payload de um print_job em texto monoespaçado pra ESC/POS via Out-Printer.
// Suporta os tipos atuais do HuskyPDV: production, payment_receipt, test, cancellation.
// Genérico — se o tipo não for conhecido, faz dump JSON formatado.

const W = 48;

function line(ch = "-") { return ch.repeat(W); }
function center(s: string) {
  const t = s.slice(0, W);
  const pad = Math.max(0, Math.floor((W - t.length) / 2));
  return " ".repeat(pad) + t;
}
function row(left: string, right: string) {
  const r = right.toString();
  const space = Math.max(1, W - left.length - r.length);
  return (left + " ".repeat(space) + r).slice(0, W);
}
function brl(n: any): string {
  const v = Number(n) || 0;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function renderJob(payload: any, tenantName: string): string {
  const type = String(payload?.type ?? "");
  const out: string[] = [];

  out.push(line("="));
  out.push(center(tenantName || "HuskyPDV"));
  out.push(line("="));

  if (type === "test") {
    out.push(center("CUPOM DE TESTE"));
    out.push("");
    out.push(`Data: ${new Date().toLocaleString("pt-BR")}`);
    out.push("");
    out.push("Se voce esta vendo este cupom,");
    out.push("a impressora esta funcionando!");
  } else if (type === "cancellation") {
    out.push(center("** CANCELAMENTO **"));
    out.push("");
    out.push(`Mesa/Local: ${payload.location ?? "-"}`);
    out.push(`Cliente: ${payload.customer_name ?? "-"}`);
    out.push(`Motivo: ${payload.reason ?? "-"}`);
    if (Array.isArray(payload.items)) {
      out.push(line());
      for (const it of payload.items) {
        out.push(`${it.quantity ?? 1}x ${it.product_name ?? ""}`);
      }
    }
  } else if (type === "production" || Array.isArray(payload?.items)) {
    out.push(center(payload.station ?? "PRODUCAO"));
    out.push("");
    out.push(`Local: ${payload.location ?? payload.table_name ?? "-"}`);
    if (payload.customer_name) out.push(`Cliente: ${payload.customer_name}`);
    if (payload.waiter_name) out.push(`Atendente: ${payload.waiter_name}`);
    out.push(`Hora: ${new Date().toLocaleTimeString("pt-BR")}`);
    out.push(line());
    for (const it of payload.items ?? []) {
      out.push(`${it.quantity ?? 1}x ${it.product_name ?? ""}`);
      if (Array.isArray(it.complements)) {
        for (const c of it.complements) {
          out.push(`   + ${c.quantity ?? 1}x ${c.complement_name ?? c.name ?? ""}`);
        }
      }
      if (it.notes) out.push(`   Obs: ${it.notes}`);
    }
  } else if (type === "payment_receipt" || payload?.total != null) {
    out.push(center("RECIBO"));
    out.push("");
    if (payload.customer_name) out.push(`Cliente: ${payload.customer_name}`);
    if (payload.location) out.push(`Local: ${payload.location}`);
    out.push(line());
    for (const it of payload.items ?? []) {
      out.push(row(`${it.quantity ?? 1}x ${it.product_name ?? ""}`, brl((it.price ?? 0) * (it.quantity ?? 1))));
    }
    out.push(line());
    out.push(row("TOTAL", brl(payload.total)));
    if (Array.isArray(payload.payments)) {
      out.push(line());
      for (const p of payload.payments) {
        out.push(row(p.method ?? "-", brl(p.amount)));
      }
    }
  } else {
    // Fallback: dump JSON
    out.push("Job desconhecido:");
    out.push(JSON.stringify(payload, null, 2).slice(0, 600));
  }

  out.push("");
  out.push(line("="));
  out.push("");
  out.push("");
  out.push("");
  return out.join("\r\n");
}
