import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Download, ChevronDown, ChevronUp, Copy, Printer, RefreshCw, FileText,
  Loader2, CheckCircle, AlertCircle, Clock, Filter,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useGoLiveDate } from "@/hooks/useGoLiveDate";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import LoadingScreen from "@/components/LoadingScreen";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type QuickPeriod = "today" | "yesterday" | "7" | "30" | "month" | "custom";
type NfceFilter = "all" | "emitida" | "erro" | "pending" | "none";

const methodLabels: Record<string, string> = {
  cash: "Dinheiro", debit: "Débito", credit: "Crédito", pix: "Pix", card: "Cartão",
};

const PAGE_SIZE = 50;

export default function AccountingSalesPage() {
  const [quickPeriod, setQuickPeriod] = useState<QuickPeriod>("today");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(new Date());
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());
  const [nfceFilter, setNfceFilter] = useState<NfceFilter>("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [emittingId, setEmittingId] = useState<string | null>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const { goLiveAt } = useGoLiveDate();
  const queryClient = useQueryClient();

  const effectiveDateFrom = useMemo(() => {
    if (quickPeriod === "today") return new Date();
    if (quickPeriod === "yesterday") return subDays(new Date(), 1);
    if (quickPeriod === "7") return subDays(new Date(), 7);
    if (quickPeriod === "30") return subDays(new Date(), 30);
    if (quickPeriod === "month") return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return dateFrom;
  }, [quickPeriod, dateFrom]);

  const effectiveDateTo = useMemo(() => {
    if (quickPeriod === "yesterday") return subDays(new Date(), 1);
    if (quickPeriod === "custom") return dateTo;
    return new Date();
  }, [quickPeriod, dateTo]);

  const periodFilter = useMemo(() => ({
    from: effectiveDateFrom ? startOfDay(effectiveDateFrom).toISOString() : undefined,
    to: effectiveDateTo ? endOfDay(effectiveDateTo).toISOString() : undefined,
  }), [effectiveDateFrom, effectiveDateTo]);

  // Fetch orders
  const { data: orders = [], isLoading: lo } = useQuery({
    queryKey: ["accsales_orders", goLiveAt, periodFilter],
    queryFn: async () => {
      let q = supabase.from("orders")
        .select("id, total, status, created_at, waiter_name, customer_name, table_id")
        .eq("status", "closed");
      if (goLiveAt) q = q.gte("created_at", goLiveAt);
      if (periodFilter.from) q = q.gte("created_at", periodFilter.from);
      if (periodFilter.to) q = q.lte("created_at", periodFilter.to);
      const { data } = await q.order("created_at", { ascending: false });
      return data || [];
    },
  });

  const orderIds = orders.map((o: any) => o.id);

  // Fetch payments
  const { data: payments = [] } = useQuery({
    queryKey: ["accsales_payments", orderIds],
    queryFn: async () => {
      if (!orderIds.length) return [];
      const { data } = await supabase.from("payments").select("order_id, method, amount").in("order_id", orderIds);
      return data || [];
    },
    enabled: orderIds.length > 0,
  });

  // Fetch NFC-e records
  const { data: nfceRecords = [] } = useQuery({
    queryKey: ["accsales_nfce", orderIds],
    queryFn: async () => {
      if (!orderIds.length) return [];
      const { data } = await supabase.from("nfce_records" as any).select("*").in("order_id", orderIds);
      return (data || []) as any[];
    },
    enabled: orderIds.length > 0,
  });

  // Fetch tables for names
  const tableIds = [...new Set(orders.filter((o: any) => o.table_id).map((o: any) => o.table_id))];
  const { data: tables = [] } = useQuery({
    queryKey: ["accsales_tables", tableIds],
    queryFn: async () => {
      if (!tableIds.length) return [];
      const { data } = await supabase.from("restaurant_tables").select("id, name, internal_number").in("id", tableIds);
      return data || [];
    },
    enabled: tableIds.length > 0,
  });

  // Maps
  const paymentMap = useMemo(() => {
    const m = new Map<string, any[]>();
    payments.forEach((p: any) => {
      if (!m.has(p.order_id)) m.set(p.order_id, []);
      m.get(p.order_id)!.push(p);
    });
    return m;
  }, [payments]);

  const nfceMap = useMemo(() => {
    const m = new Map<string, any>();
    nfceRecords.forEach((n: any) => {
      if (!m.has(n.order_id)) m.set(n.order_id, n);
    });
    return m;
  }, [nfceRecords]);

  const tableMap = useMemo(() => {
    const m = new Map<string, any>();
    tables.forEach((t: any) => m.set(t.id, t));
    return m;
  }, [tables]);

  // Unique payment methods in data
  const allMethods = useMemo(() => {
    const s = new Set<string>();
    payments.forEach((p: any) => s.add(p.method));
    return Array.from(s);
  }, [payments]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    let result = orders;

    if (methodFilter !== "all") {
      const orderIdsWithMethod = new Set(
        payments.filter((p: any) => p.method === methodFilter).map((p: any) => p.order_id)
      );
      result = result.filter((o: any) => orderIdsWithMethod.has(o.id));
    }

    if (nfceFilter !== "all") {
      result = result.filter((o: any) => {
        const nfce = nfceMap.get(o.id);
        if (nfceFilter === "none") return !nfce;
        if (nfceFilter === "pending") return nfce?.status === "pending";
        if (nfceFilter === "emitida") return nfce?.status === "emitida";
        if (nfceFilter === "erro") return nfce?.status === "erro";
        return true;
      });
    }

    return result;
  }, [orders, methodFilter, nfceFilter, payments, nfceMap]);

  // Pagination
  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
  const pageOrders = filteredOrders.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Actions
  const handleEmit = useCallback(async (orderId: string) => {
    setEmittingId(orderId);
    try {
      const { data, error } = await supabase.functions.invoke("emit-nfce", { body: { order_id: orderId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("NFC-e emitida!");
      queryClient.invalidateQueries({ queryKey: ["accsales_nfce"] });
    } catch (err) {
      toast.error("Erro: " + (err as Error).message);
    } finally {
      setEmittingId(null);
    }
  }, [queryClient]);

  const handlePrint = useCallback(async (orderId: string) => {
    const nfce = nfceMap.get(orderId);
    if (!nfce) return;

    setPrintingId(orderId);
    try {
      let danfeUrl = nfce.url_danfe || `https://api.focusnfe.com.br/v2/nfce/${encodeURIComponent(nfce.reference)}.html`;
      if (!danfeUrl.startsWith("http")) danfeUrl = `https://api.focusnfe.com.br${danfeUrl}`;

      const { data: orderItems } = await supabase.from("order_items").select("product_name, quantity, price").eq("order_id", orderId);
      const { data: order } = await supabase.from("orders").select("total, customer_name, created_at, waiter_name, table_id").eq("id", orderId).single();

      let tableName: string | null = null;
      let internalNumber: string | null = null;
      if (order?.table_id) {
        const t = tableMap.get(order.table_id);
        tableName = t?.name || null;
        internalNumber = t?.internal_number || null;
      }

      const { data: pmts } = await supabase.from("payments").select("method, amount").eq("order_id", orderId);
      const methodMap: Record<string, string> = { cash: "DINHEIRO", card: "CARTAO", pix: "PIX" };
      const paymentMethod = pmts?.[0]?.method ? methodMap[pmts[0].method] || pmts[0].method.toUpperCase() : null;

      await supabase.from("print_jobs").insert({
        station: "Caixa",
        status: "pending",
        payload: {
          type: "danfe",
          danfe_url: danfeUrl,
          chave_acesso: nfce.chave_acesso || null,
          customer_name: order?.customer_name || null,
          waiter_name: order?.waiter_name || null,
          table_name: tableName,
          comanda_number: internalNumber,
          items: (orderItems || []).map((i: any) => ({ product_name: i.product_name, quantity: i.quantity, price: Number(i.price) })),
          total: Number(order?.total || 0),
          payment_method: paymentMethod,
          payment_amount: pmts?.[0] ? Number(pmts[0].amount) : null,
          order_created_at: order?.created_at || null,
        },
      });
      toast.success("DANFE enviado para impressão!");
    } catch (err) {
      toast.error("Erro: " + (err as Error).message);
    } finally {
      setPrintingId(null);
    }
  }, [nfceMap, tableMap]);

  const copyKey = useCallback((key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("Chave copiada!");
  }, []);

  // Export
  const handleExport = useCallback((type: "xlsx" | "csv") => {
    const rows = filteredOrders.map((o: any) => {
      const nfce = nfceMap.get(o.id);
      const pmts = paymentMap.get(o.id) || [];
      const table = o.table_id ? tableMap.get(o.table_id) : null;
      return {
        "Data/Hora": format(new Date(o.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        "Nº Venda": o.id.slice(0, 8),
        "Mesa/Comanda": table ? `${table.name} (${table.internal_number || "-"})` : "-",
        "Atendente": o.waiter_name || "-",
        "Valor Total": Number(o.total).toFixed(2),
        "Forma de Pagamento": pmts.map((p: any) => `${methodLabels[p.method] || p.method}: R$${Number(p.amount).toFixed(2)}`).join("; "),
        "Status NFC-e": nfce ? (nfce.status === "emitida" ? "Autorizada" : nfce.status === "erro" ? "Erro" : "Pendente") : "Sem nota",
        "Chave de Acesso": nfce?.chave_acesso || "-",
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Vendas");

    if (type === "xlsx") {
      XLSX.writeFile(wb, `vendas_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
    } else {
      XLSX.writeFile(wb, `vendas_${format(new Date(), "yyyyMMdd_HHmm")}.csv`, { bookType: "csv" });
    }
    toast.success(`Exportação ${type.toUpperCase()} concluída!`);
  }, [filteredOrders, nfceMap, paymentMap, tableMap]);

  if (lo) return <LoadingScreen mode="inline" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Vendas Finalizadas</h1>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => handleExport("xlsx")}>
            <Download className="h-3 w-3 mr-1" /> XLSX
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => handleExport("csv")}>
            <Download className="h-3 w-3 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {([["today", "Hoje"], ["yesterday", "Ontem"], ["7", "7 dias"], ["30", "30 dias"], ["month", "Mês"], ["custom", "Período"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={quickPeriod === k ? "default" : "outline"} onClick={() => { setQuickPeriod(k); setPage(0); }} className="text-xs h-7">
            {l}
          </Button>
        ))}
      </div>

      {quickPeriod === "custom" && (
        <div className="flex flex-wrap gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">De: {dateFrom ? format(dateFrom, "dd/MM/yyyy") : "..."}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} locale={ptBR} /></PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="text-xs">Até: {dateTo ? format(dateTo, "dd/MM/yyyy") : "..."}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={dateTo} onSelect={setDateTo} locale={ptBR} /></PopoverContent>
          </Popover>
        </div>
      )}

      {/* Extra filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <select
          value={methodFilter}
          onChange={(e) => { setMethodFilter(e.target.value); setPage(0); }}
          className="text-xs rounded-md border bg-background px-2 py-1.5"
        >
          <option value="all">Pagamento: Todos</option>
          {allMethods.map((m) => (
            <option key={m} value={m}>{methodLabels[m] || m}</option>
          ))}
        </select>
        <select
          value={nfceFilter}
          onChange={(e) => { setNfceFilter(e.target.value as NfceFilter); setPage(0); }}
          className="text-xs rounded-md border bg-background px-2 py-1.5"
        >
          <option value="all">NFC-e: Todas</option>
          <option value="emitida">Autorizadas</option>
          <option value="erro">Com Erro</option>
          <option value="pending">Pendentes</option>
          <option value="none">Sem Nota</option>
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filteredOrders.length} vendas</span>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="text-left p-3">Data/Hora</th>
                <th className="text-left p-3">Nº Venda</th>
                <th className="text-left p-3 hidden md:table-cell">Mesa</th>
                <th className="text-left p-3 hidden md:table-cell">Atendente</th>
                <th className="text-right p-3">Total</th>
                <th className="text-left p-3 hidden md:table-cell">Pagamento</th>
                <th className="text-center p-3">NFC-e</th>
                <th className="text-center p-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {pageOrders.map((o: any) => {
                const nfce = nfceMap.get(o.id);
                const pmts = paymentMap.get(o.id) || [];
                const table = o.table_id ? tableMap.get(o.table_id) : null;
                const expanded = expandedId === o.id;

                return (
                  <OrderRow
                    key={o.id}
                    order={o}
                    nfce={nfce}
                    payments={pmts}
                    table={table}
                    expanded={expanded}
                    onToggle={() => setExpandedId(expanded ? null : o.id)}
                    onEmit={handleEmit}
                    onPrint={handlePrint}
                    onCopyKey={copyKey}
                    emitting={emittingId === o.id}
                    printing={printingId === o.id}
                  />
                );
              })}
              {pageOrders.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">Nenhuma venda encontrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}

// ── Order Row ──

interface OrderRowProps {
  order: any;
  nfce: any;
  payments: any[];
  table: any;
  expanded: boolean;
  onToggle: () => void;
  onEmit: (id: string) => void;
  onPrint: (id: string) => void;
  onCopyKey: (key: string) => void;
  emitting: boolean;
  printing: boolean;
}

function OrderRow({ order, nfce, payments, table, expanded, onToggle, onEmit, onPrint, onCopyKey, emitting, printing }: OrderRowProps) {
  const nfceStatus = nfce ? nfce.status : "none";

  const statusBadge = {
    emitida: <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-medium"><CheckCircle className="h-3 w-3" />Autorizada</span>,
    erro: <span className="inline-flex items-center gap-1 text-[10px] text-red-500 font-medium"><AlertCircle className="h-3 w-3" />Erro</span>,
    pending: <span className="inline-flex items-center gap-1 text-[10px] text-yellow-500 font-medium"><Clock className="h-3 w-3" />Pendente</span>,
    none: <span className="text-[10px] text-muted-foreground">Sem nota</span>,
  }[nfceStatus];

  return (
    <>
      <tr className="border-b hover:bg-muted/20 cursor-pointer" onClick={onToggle}>
        <td className="p-3 text-xs">{format(new Date(order.created_at), "dd/MM HH:mm")}</td>
        <td className="p-3 text-xs font-mono">{order.id.slice(0, 8)}</td>
        <td className="p-3 text-xs hidden md:table-cell">{table ? table.name : "-"}</td>
        <td className="p-3 text-xs hidden md:table-cell">{order.waiter_name || "-"}</td>
        <td className="p-3 text-xs text-right font-medium">R$ {Number(order.total).toFixed(2)}</td>
        <td className="p-3 text-xs hidden md:table-cell">
          {payments.map((p: any) => methodLabels[p.method] || p.method).join(", ") || "-"}
        </td>
        <td className="p-3 text-center">{statusBadge}</td>
        <td className="p-3 text-center">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={8} className="p-0">
            <ExpandedDetails
              orderId={order.id}
              order={order}
              nfce={nfce}
              payments={payments}
              table={table}
              onEmit={onEmit}
              onPrint={onPrint}
              onCopyKey={onCopyKey}
              emitting={emitting}
              printing={printing}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Expanded Details ──

function ExpandedDetails({ orderId, order, nfce, payments, table, onEmit, onPrint, onCopyKey, emitting, printing }: any) {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["accsales_items", orderId],
    queryFn: async () => {
      const { data } = await supabase.from("order_items").select("product_name, quantity, price").eq("order_id", orderId);
      return data || [];
    },
  });

  return (
    <div className="bg-muted/10 border-t px-4 py-4 space-y-4">
      {/* Sale info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground">Data/Hora</span>
          <p className="font-medium">{format(new Date(order.created_at), "dd/MM/yyyy HH:mm:ss")}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Cliente</span>
          <p className="font-medium">{order.customer_name || "-"}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Atendente</span>
          <p className="font-medium">{order.waiter_name || "-"}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Mesa</span>
          <p className="font-medium">{table ? `${table.name} (${table.internal_number || "-"})` : "-"}</p>
        </div>
      </div>

      {/* Items */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Itens</h4>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <div className="rounded border overflow-hidden">
            <table className="w-full text-xs">
              <thead><tr className="bg-muted/30 text-muted-foreground"><th className="text-left p-2">Produto</th><th className="text-center p-2">Qtd</th><th className="text-right p-2">Unit.</th><th className="text-right p-2">Total</th></tr></thead>
              <tbody>
                {items.map((i: any, idx: number) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{i.product_name}</td>
                    <td className="p-2 text-center">{i.quantity}</td>
                    <td className="p-2 text-right">R$ {Number(i.price).toFixed(2)}</td>
                    <td className="p-2 text-right font-medium">R$ {(Number(i.price) * i.quantity).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payments */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">Pagamentos</h4>
        <div className="flex flex-wrap gap-2">
          {payments.map((p: any, idx: number) => (
            <div key={idx} className="rounded bg-muted/50 px-3 py-1.5 text-xs">
              {methodLabels[p.method] || p.method}: <span className="font-medium">R$ {Number(p.amount).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* NFC-e details */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-2">NFC-e</h4>
        {nfce ? (
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Status:</span>
              <span className="font-medium">{nfce.status === "emitida" ? "Autorizada" : nfce.status === "erro" ? "Erro" : "Pendente"}</span>
            </div>
            {nfce.chave_acesso && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Chave:</span>
                <span className="font-mono text-[10px] break-all">{nfce.chave_acesso}</span>
                <button onClick={() => onCopyKey(nfce.chave_acesso)} className="text-accent hover:underline"><Copy className="h-3 w-3" /></button>
              </div>
            )}
            {nfce.error_message && (
              <div className="text-red-500 text-[10px] break-words">{nfce.error_message}</div>
            )}
            {nfce.raw_response && (
              <details className="text-[10px]">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver resposta SEFAZ/Focus</summary>
                <pre className="mt-1 p-2 rounded bg-muted/50 overflow-x-auto max-h-40 whitespace-pre-wrap">
                  {JSON.stringify(nfce.raw_response, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhuma NFC-e vinculada</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        {(!nfce || nfce.status === "erro") && (
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onEmit(orderId)} disabled={emitting}>
            {emitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
            {nfce?.status === "erro" ? "Tentar Novamente" : "Emitir NFC-e"}
          </Button>
        )}
        {nfce?.status === "emitida" && (
          <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => onPrint(orderId)} disabled={printing}>
            {printing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Printer className="h-3 w-3 mr-1" />}
            Imprimir DANFE
          </Button>
        )}
        {nfce?.chave_acesso && (
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => onCopyKey(nfce.chave_acesso)}>
            <Copy className="h-3 w-3 mr-1" /> Copiar Chave
          </Button>
        )}
      </div>
    </div>
  );
}
