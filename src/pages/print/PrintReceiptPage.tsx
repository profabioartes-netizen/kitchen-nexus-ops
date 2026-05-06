import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Página dedicada de impressão térmica.
 * - Layout limpo, fundo branco, sem menus/botões.
 * - Dispara window.print() automaticamente ao carregar.
 * - Em Chrome/Edge com --kiosk-printing, imprime sem popup.
 * - Após imprimir, fecha a janela (se foi aberta como popup) ou volta para o PDV.
 *
 * Aceita ?paper=58mm|80mm (default 80mm) e ?type=bill|kitchen.
 */
export default function PrintReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const paper = (params.get("paper") as "58mm" | "80mm") || "80mm";
  const widthMm = paper === "58mm" ? 54 : 72;

  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      // Busca pedido + itens + complementos.
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
      let complByItem: Record<string, string[]> = {};
      if (itemIds.length) {
        const { data: compl } = await supabase
          .from("order_item_complements")
          .select("order_item_id, complement_name")
          .in("order_item_id", itemIds);
        for (const c of compl || []) {
          (complByItem[c.order_item_id] ||= []).push(c.complement_name);
        }
      }

      const { data: settings } = await supabase
        .from("restaurant_settings")
        .select("key, value")
        .in("key", ["business_name", "business_phone"]);
      const settingsMap: Record<string, string> = {};
      for (const s of settings || []) settingsMap[s.key] = s.value;

      setData({
        order,
        items: items || [],
        complByItem,
        business_name: settingsMap.business_name || "HuskyPDV",
        business_phone: settingsMap.business_phone || "",
      });
    })();
  }, [id]);

  // Dispara impressão automática ao terminar de carregar.
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      try { window.focus(); window.print(); } catch {}
    }, 150);
    const onAfter = () => {
      setTimeout(() => {
        if (window.opener) window.close();
        else window.history.length > 1 ? window.history.back() : (window.location.href = "/");
      }, 200);
    };
    window.addEventListener("afterprint", onAfter);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", onAfter); };
  }, [data]);

  if (error) return <div style={{ padding: 24, fontFamily: "sans-serif" }}>{error}</div>;
  if (!data) return <div style={{ padding: 24, fontFamily: "sans-serif" }}>Carregando…</div>;

  const { order, items, complByItem, business_name, business_phone } = data;
  const productsTotal = items.reduce(
    (s: number, it: any) => s + Number(it.price) * Number(it.quantity), 0,
  );
  const total = Number(order.total ?? productsTotal);
  const dashes = "-".repeat(paper === "58mm" ? 32 : 42);
  const tableLabel = order.restaurant_tables?.internal_number ?? order.restaurant_tables?.name ?? "";
  const brl = (n: number) => `R$ ${(Number(n) || 0).toFixed(2).replace(".", ",")}`;

  return (
    <>
      <style>{`
        @page { size: ${widthMm}mm auto; margin: 0; }
        html, body { background: #fff !important; margin: 0; padding: 0; }
        body * { visibility: hidden; }
        .receipt, .receipt * { visibility: visible; }
        .receipt {
          position: absolute; left: 0; top: 0;
          width: ${widthMm}mm;
          font-family: 'Courier New', Consolas, monospace;
          font-size: 12px; line-height: 1.0; color: #000;
          padding: 1mm 0;
          font-variant-numeric: tabular-nums;
        }
        .receipt div, .receipt p { margin: 0; padding: 0; line-height: 1.0; }
        .receipt .center { text-align: center; }
        .receipt .bold { font-weight: 700; }
        .receipt .upper { text-transform: uppercase; }
        .receipt .big { font-size: 14px; }
        .receipt .xl { font-size: 16px; }
        .receipt table.items { width: 100%; border-collapse: collapse; font-size: 12px; line-height: 1.0; }
        .receipt table.items td, .receipt table.items th { padding: 0; vertical-align: top; line-height: 1.0; }
        .receipt table.items th { font-weight: 700; text-align: left; }
        .receipt td.prod, .receipt th.prod { text-align: left; word-break: break-word; }
        .receipt td.qnt, .receipt th.qnt { text-align: center; width: 7mm; padding-left: 1mm; }
        .receipt td.unit, .receipt th.unit { text-align: right; width: 13mm; padding-left: 1mm; }
        .receipt td.tot, .receipt th.tot { text-align: right; width: 14mm; padding-left: 1mm; }
        .receipt tr.compl td { font-size: 11px; font-style: italic; padding-left: 2mm; }
        .receipt .totals .row { display: flex; justify-content: space-between; }
        .receipt .totals .grand { font-size: 16px; font-weight: 700; margin-top: 1mm; }
        @media print {
          body * { visibility: hidden; }
          .receipt, .receipt * { visibility: visible; }
        }
      `}</style>
      <div className="receipt">
        <div className="center bold upper big">{business_name}</div>
        {business_phone && <div className="center">{business_phone}</div>}
        <div className="center bold upper big">CONTA{tableLabel ? ` / MESA ${tableLabel}` : ""}</div>
        <div className="center">{dashes}</div>
        <div className="center">NAO E DOCUMENTO FISCAL</div>
        <div className="center">{dashes}</div>
        {order.customer_name && <div>Cliente: {order.customer_name}</div>}
        <div>{new Date().toLocaleString("pt-BR")}</div>
        <div className="center">{dashes}</div>

        <table className="items">
          <thead>
            <tr>
              <th className="prod">PRODUTO</th>
              <th className="qnt">QNT</th>
              <th className="unit">UNIT</th>
              <th className="tot">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it: any) => {
              const unit = Number(it.price);
              const sub = unit * Number(it.quantity);
              const compl = complByItem[it.id] || [];
              return (
                <>
                  <tr key={it.id}>
                    <td className="prod">{it.product_name}</td>
                    <td className="qnt">{it.quantity}</td>
                    <td className="unit">{unit.toFixed(2).replace(".", ",")}</td>
                    <td className="tot">{sub.toFixed(2).replace(".", ",")}</td>
                  </tr>
                  {compl.length > 0 && (
                    <tr className="compl" key={it.id + "-c"}>
                      <td colSpan={4}>+ {compl.join(", ")}</td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
        <div className="center">{dashes}</div>
        <div className="totals">
          <div className="row"><span>PRODUTOS:</span><span>{brl(productsTotal)}</span></div>
          <div className="row grand"><span>TOTAL:</span><span>{brl(total)}</span></div>
        </div>
        <div className="center">{dashes}</div>
        <div className="center bold">Volte sempre!!!</div>
        <div style={{ height: "6mm" }} />
      </div>
    </>
  );
}
