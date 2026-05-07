import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Recibo térmico — rota dedicada, sem layout do app.
 * - 80mm (default) ou ?paper=58mm
 * - Auto-print on load; com Chrome/Edge --kiosk-printing imprime sem popup.
 */
export default function PrintReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const paper = (params.get("paper") as "58mm" | "80mm") || "80mm";
  const widthMm = paper === "58mm" ? 54 : 72;
  const pageMm = paper === "58mm" ? 58 : 80;
  const dashCount = paper === "58mm" ? 32 : 42;

  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: order, error: e1 } = await supabase
        .from("orders")
        .select("*, restaurant_tables(name, internal_number)")
        .eq("id", id)
        .maybeSingle();
      if (e1 || !order) { setError("Pedido não encontrado"); return; }

      const { data: items } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", id)
        .order("created_at");

      const itemIds = (items || []).map((i: any) => i.id);
      const complByItem: Record<string, { name: string; qty: number; price: number }[]> = {};
      if (itemIds.length) {
        const { data: compl } = await supabase
          .from("order_item_complements")
          .select("order_item_id, complement_name, quantity, price")
          .in("order_item_id", itemIds);
        for (const c of compl || []) {
          (complByItem[c.order_item_id] ||= []).push({
            name: c.complement_name, qty: c.quantity, price: Number(c.price),
          });
        }
      }

      // Carrega sale_type/price_per_kg para identificar itens vendidos por peso
      const productIds = Array.from(new Set((items || []).map((i: any) => i.product_id).filter(Boolean)));
      const productMeta: Record<string, { sale_type?: string | null; price_per_kg?: number | null }> = {};
      if (productIds.length) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, sale_type, price_per_kg")
          .in("id", productIds);
        for (const p of prods || []) {
          productMeta[p.id] = { sale_type: (p as any).sale_type, price_per_kg: (p as any).price_per_kg };
        }
      }

      const { data: payments } = await supabase
        .from("payments")
        .select("method, amount")
        .eq("order_id", id);

      const { data: tenant } = await supabase
        .from("tenants")
        .select("nome_comercio")
        .eq("id", order.tenant_id)
        .maybeSingle();

      const { data: settings } = await supabase
        .from("restaurant_settings")
        .select("key, value")
        .in("key", ["business_phone", "business_address"]);
      const sMap: Record<string, string> = {};
      for (const s of settings || []) sMap[s.key] = s.value;

      setData({
        order,
        items: items || [],
        complByItem,
        productMeta,
        payments: payments || [],
        business_name: tenant?.nome_comercio || "HuskyPDV",
        business_phone: sMap.business_phone || "",
        business_address: sMap.business_address || "",
      });
    })();
  }, [id]);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => { try { window.focus(); window.print(); } catch {} }, 200);
    const onAfter = () => {
      setTimeout(() => {
        if (window.opener) window.close();
        else window.history.length > 1 ? window.history.back() : (window.location.href = "/caixa");
      }, 200);
    };
    window.addEventListener("afterprint", onAfter);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", onAfter); };
  }, [data]);

  if (error) return <div style={{ padding: 24, fontFamily: "sans-serif", color: "#000", background: "#fff" }}>{error}</div>;
  if (!data) return <div style={{ padding: 24, fontFamily: "sans-serif", color: "#000", background: "#fff" }}>Carregando…</div>;

  const { order, items, complByItem, productMeta, payments, business_name, business_phone, business_address } = data;
  const productsTotal = items.reduce(
    (s: number, it: any) => s + Number(it.price) * Number(it.quantity), 0,
  );
  const total = Number(order.total ?? productsTotal);
  const tableLabel = order.restaurant_tables?.internal_number ?? order.restaurant_tables?.name ?? "";
  const dashes = "-".repeat(dashCount);
  const fmt = (n: number) => (Number(n) || 0).toFixed(2).replace(".", ",");
  const brl = (n: number) => `R$ ${fmt(n)}`;
  const dateFmt = (d: string | Date) =>
    new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  // Número do recibo: últimos 5 dígitos do id em decimal
  const receiptNumber = parseInt(order.id.replace(/\D/g, "").slice(-6), 10) || 0;

  return (
    <>
      <style>{`
        html, body { background: #ffffff !important; color: #000000 !important; margin: 0; padding: 0; }
        body {
          font-family: 'Courier New', Courier, monospace;
          font-size: 12px;
          font-weight: 700 !important;
          color: #000000 !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .receipt {
          width: ${widthMm}mm;
          padding: 3mm;
          margin: 0 auto;
          box-sizing: border-box;
          color: #000000 !important;
          font-variant-numeric: tabular-nums;
          line-height: 1.2;
          font-weight: 700;
        }
        .receipt *, .receipt *::before, .receipt *::after {
          box-sizing: border-box;
          color: #000000 !important;
          opacity: 1 !important;
          text-shadow: none !important;
          font-weight: 700;
        }
        .center { text-align: center; }
        .right  { text-align: right; }
        .bold   { font-weight: 800 !important; }
        .upper  { text-transform: uppercase; }
        .big    { font-size: 15px; font-weight: 800 !important; }
        .xl     { font-size: 18px; font-weight: 800 !important; }
        .separator { border-top: 2px dashed #000000; margin: 4px 0; }

        .meta-row { display: flex; justify-content: space-between; gap: 6px; }

        .items-header, .item-row {
          display: grid;
          grid-template-columns: 1fr 24px 42px 48px;
          column-gap: 2px;
          align-items: start;
        }
        .items-header { font-weight: 800 !important; }
        .item-name { word-break: break-word; }
        .item-row .qnt  { text-align: center; }
        .item-row .unit { text-align: right; }
        .item-row .tot  { text-align: right; }
        .compl { padding-left: 4mm; font-size: 11px; font-style: italic; font-weight: 700 !important; }

        .totals-row { display: flex; justify-content: space-between; font-weight: 700; }
        .total-row {
          display: flex; justify-content: space-between;
          font-size: 17px; font-weight: 800 !important; margin-top: 8px;
          color: #000000 !important;
        }

        @page { size: ${pageMm}mm auto; margin: 0; }
        @media print {
          html, body { background: #ffffff !important; color: #000000 !important; }
          .receipt, .receipt * { color: #000000 !important; opacity: 1 !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="receipt">
        {/* Cabeçalho */}
        <div className="center bold upper big">{business_name}</div>
        {business_phone && <div className="center">{business_phone}</div>}
        {business_address && <div className="center">{business_address}</div>}
        <div className="center bold upper big" style={{ marginTop: 2 }}>
          CONTA/MESA {tableLabel || "—"}
        </div>
        <div className="center">NÃO É DOCUMENTO FISCAL</div>

        <div className="separator" />

        {/* Meta */}
        {order.waiter_name && <div>Atendente: {order.waiter_name}</div>}
        <div className="meta-row">
          <span>Abertura: {dateFmt(order.created_at)}</span>
        </div>
        <div className="meta-row">
          <span>Impressão: {dateFmt(new Date())}</span>
          <span>Nº {receiptNumber}</span>
        </div>

        <div className="separator" />

        {/* Itens */}
        <div className="items-header">
          <span>PRODUTO</span>
          <span style={{ textAlign: "center" }}>QNT</span>
          <span style={{ textAlign: "right" }}>UNIT</span>
          <span style={{ textAlign: "right" }}>TOTAL</span>
        </div>

        {items.map((it: any) => {
          const unit = Number(it.price);
          const qty = Number(it.quantity);
          const sub = unit * qty;
          const compl = complByItem[it.id] || [];
          return (
            <div key={it.id}>
              <div className="item-row">
                <span className="item-name upper">{it.product_name}</span>
                <span className="qnt">{qty % 1 === 0 ? qty : qty.toFixed(3).replace(".", ",")}</span>
                <span className="unit">{fmt(unit)}</span>
                <span className="tot">{fmt(sub)}</span>
              </div>
              {compl.length > 0 && (
                <div className="compl">+ {compl.map(c => c.name).join(", ")}</div>
              )}
            </div>
          );
        })}

        <div className="separator" />

        {/* Totais */}
        <div className="totals-row">
          <span>PRODUTOS:</span><span>{brl(productsTotal)}</span>
        </div>
        {total !== productsTotal && (
          <div className="totals-row">
            <span>{total < productsTotal ? "DESCONTO:" : "ACRÉSCIMO:"}</span>
            <span>{brl(Math.abs(total - productsTotal))}</span>
          </div>
        )}
        <div className="total-row">
          <span>TOTAL:</span><span>{brl(total)}</span>
        </div>

        {payments.length > 0 && (
          <>
            <div className="separator" />
            {payments.map((p: any, i: number) => (
              <div className="totals-row" key={i}>
                <span className="upper">{p.method}</span><span>{brl(Number(p.amount))}</span>
              </div>
            ))}
          </>
        )}

        <div className="separator" />
        <div className="center bold">Volte sempre!!!</div>
        <div style={{ height: "6mm" }} />
      </div>
    </>
  );
}
