import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  CreditCard, Banknote, Smartphone, ArrowLeft,
  Check, Minus, Plus, Percent, DollarSign, X, Trash2, Users, Hash, Coins, ListChecks, ChevronDown, Zap, Printer,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTenant } from "@/contexts/TenantContext";
import { printViaLocalAgent } from "@/lib/localAgentPrint";
import { enrichItemsWithWeightInfo } from "@/lib/printItems";
import { getPrintMode } from "@/lib/printPreference";
import { FinanceUtils } from "@/lib/finance";

type OrderItemComplement = {
  id: string;
  order_item_id: string;
  complement_name: string;
  price: number;
  quantity: number;
};

type OrderItem = {
  id: string;
  product_id?: string;
  product_name: string;
  price: number;
  quantity: number;
  paid_quantity?: number;
};

type PaymentEntry = {
  method: string;
  amount: number;
};

export type PaymentResult = {
  payments: PaymentEntry[];
  paidItems?: Record<string, number>;
};

interface PaymentPanelProps {
  total: number;
  orderItems: OrderItem[];
  serviceFeeEnabled: boolean;
  onToggleServiceFee: (enabled: boolean) => void;
  onPay: (result: PaymentResult) => void;
  onCancel: () => void;
  isPending: boolean;
  itemComplements?: OrderItemComplement[];
  onAddQuickItem?: (product: { id: string; name: string; price: number }, quantity: number) => void;
  onRemoveQuickItem?: (productId: string) => void;
  onRemoveItem?: (itemId: string) => void;
  onUpdateItemQty?: (itemId: string, delta: number) => void;
  /** Context for full bill printing */
  orderContext?: {
    orderId: string;
    customerName: string | null;
    waiterName: string | null;
    origin: string;
    location: string;
    tableName: string;
  };
}

const methodLabels: Record<string, string> = {
  cash: "Dinheiro",
  debit: "Cartão Débito",
  credit: "Cartão Crédito",
  pix: "Pix",
};

const methodColors: Record<string, string> = {
  cash: "bg-accent text-accent-foreground",
  debit: "bg-primary text-primary-foreground",
  credit: "bg-[hsl(var(--status-reserved))] text-white",
  pix: "bg-[hsl(var(--status-free))] text-white",
};

const METHODS = ["cash", "debit", "credit", "pix"] as const;

function QuickSaleRow({ product, onAdd, onRemove, addedQty }: {
  product: { id: string; name: string; price: number };
  onAdd: (product: { id: string; name: string; price: number }, quantity: number) => void;
  onRemove?: (productId: string) => void;
  addedQty: number;
}) {
  const [qty, setQty] = useState(1);
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
      <span className="text-sm font-medium flex-1">{product.name}</span>
      <span className="text-xs text-muted-foreground">R$ {Number(product.price).toFixed(2)}</span>
      {addedQty > 0 && (
        <span className="text-[10px] bg-accent/15 text-accent rounded-full px-1.5 py-0.5 font-bold">{addedQty}×</span>
      )}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setQty(Math.max(1, qty - 1))}
          className="rounded p-0.5 hover:bg-secondary"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="text-sm font-bold w-6 text-center tabular-nums">{qty}</span>
        <button
          onClick={() => setQty(qty + 1)}
          className="rounded p-0.5 hover:bg-secondary"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        onClick={() => { onAdd({ id: product.id, name: product.name, price: Number(product.price) }, qty); setQty(1); }}
        className="rounded-md bg-accent text-accent-foreground px-2.5 py-1 text-[11px] font-bold hover:opacity-90 transition-opacity"
      >
        ADD
      </button>
      {addedQty > 0 && onRemove && (
        <button
          onClick={() => onRemove(product.id)}
          className="rounded-md bg-destructive/15 text-destructive px-2 py-1 text-[11px] font-bold hover:bg-destructive/25 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function PaymentPanel({
  total,
  orderItems,
  serviceFeeEnabled,
  onToggleServiceFee,
  onPay,
  onCancel,
  isPending,
  itemComplements = [],
  onAddQuickItem,
  onRemoveQuickItem,
  onRemoveItem,
  onUpdateItemQty,
  orderContext,
}: PaymentPanelProps) {
  const { tenant } = useTenant();
  const businessName = (tenant?.nome_comercio || "ESTABELECIMENTO").toUpperCase();
  const { data: phoneSetting } = useQuery({
    queryKey: ["restaurant_settings", "phone"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("value")
        .eq("key", "phone")
        .maybeSingle();
      return (data?.value as any) ?? null;
    },
  });
  const businessPhone = typeof phoneSetting === "string" ? phoneSetting : (phoneSetting?.value ?? "");

  // ── Adjustments ──
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [extraCharge, setExtraCharge] = useState(0);
  const [serviceFeePct, setServiceFeePct] = useState(10);

  // ── Payments ──
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [customAmount, setCustomAmount] = useState("");
  const [cashGiven, setCashGiven] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<string>("cash");

  // ── Items added to current payment session ──
  const [paymentItems, setPaymentItems] = useState<Record<string, number>>({});
  const [accumulatedPaidItems, setAccumulatedPaidItems] = useState<Record<string, number>>({});

  // ── Split item dialog ──
  const [splitItemDialog, setSplitItemDialog] = useState<OrderItem | null>(null);
  const [splitMode, setSplitMode] = useState<"quantity" | "value">("quantity");
  const [splitQtyDivisor, setSplitQtyDivisor] = useState(2);

  // ── Split payment entries (fractioned items shown in summary without consuming from left) ──
  type SplitEntry = { uid: string; itemId: string; productName: string; fractionedPrice: number; divisor: number };
  const [splitEntries, setSplitEntries] = useState<SplitEntry[]>([]);

  // ── "Dividir Tudo" dialog ──
  const [showSplitAllDialog, setShowSplitAllDialog] = useState(false);
  const [splitAllDivisor, setSplitAllDivisor] = useState(2);
  const [splitAllStep, setSplitAllStep] = useState<"count" | "methods">("count");
  const [splitAllMethods, setSplitAllMethods] = useState<string[]>([]);

  // ── Quick-sale products ──
  const { data: quickSaleProducts = [] } = useQuery({
    queryKey: ["quick_sale_products"],
    queryFn: async () => {
      // Find the "Venda Rápida" category
      const { data: cats } = await supabase
        .from("categories")
        .select("id")
        .eq("name", "Venda Rápida")
        .limit(1);
      if (!cats || cats.length === 0) return [];
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, price")
        .eq("category_id", cats[0].id)
        .eq("active", true)
        .order("sort_order");
      return prods || [];
    },
  });

  // ── Show more methods ──
  const [showAllMethods, setShowAllMethods] = useState(true);

  // ── Unpaid items ──
  const unpaidItems = useMemo(() => {
    return orderItems.map((item) => {
      const paidQty = (item.paid_quantity ?? 0) + (accumulatedPaidItems[item.id] ?? 0);
      const remainingQty = item.quantity - paidQty;
      return { ...item, remainingQty, paidQty };
    }).filter((item) => item.remainingQty > 0);
  }, [orderItems, accumulatedPaidItems]);

  // ── Available items (not yet added to current payment) ──
  const availableItems = useMemo(() => {
    return unpaidItems.map((item) => {
      const inPayment = paymentItems[item.id] ?? 0;
      return { ...item, availableQty: item.remainingQty - inPayment };
    }).filter((item) => item.availableQty > 0);
  }, [unpaidItems, paymentItems]);

  // ── Calculations ──
  const discount = useMemo(
    () => (discountType === "percent" ? FinanceUtils.multiply(total, discountValue / 100) : discountValue),
    [total, discountType, discountValue]
  );
  const serviceFee = serviceFeeEnabled ? FinanceUtils.multiply(FinanceUtils.sum([total, -discount]), serviceFeePct / 100) : 0;
  const grandTotal = Math.max(0, FinanceUtils.sum([total, -discount, extraCharge, serviceFee]));
  const paidTotal = FinanceUtils.sum(payments.map((p) => p.amount));
  const remaining = Math.max(0, FinanceUtils.sum([grandTotal, -paidTotal]));

  // ── Payment items total ──
  const splitEntriesTotal = useMemo(() => {
    return FinanceUtils.sum(splitEntries.map((e) => e.fractionedPrice));
  }, [splitEntries]);

  const paymentItemsTotal = useMemo(() => {
    const itemsSum = FinanceUtils.sum(
      Object.entries(paymentItems).map(([id, qty]) => {
        const item = orderItems.find((i) => i.id === id);
        return item ? FinanceUtils.multiply(item.price, qty) : 0;
      })
    );
    return FinanceUtils.sum([itemsSum, splitEntriesTotal]);
  }, [paymentItems, orderItems, splitEntriesTotal]);

  // Amount to pay = custom or payment items total or remaining
  const amountToPay = customAmount
    ? FinanceUtils.parseDecimal(customAmount) || 0
    : (Object.keys(paymentItems).length > 0 || splitEntries.length > 0)
      ? Math.min(paymentItemsTotal, remaining)
      : remaining;

  // Cash change
  const cashGivenNum = FinanceUtils.parseDecimal(cashGiven) || 0;
  const amountToPayNum = typeof customAmount === "string" && customAmount.includes(",")
    ? FinanceUtils.parseDecimal(customAmount) || amountToPay
    : amountToPay;
  const cashChange = selectedMethod === "cash" && cashGivenNum > amountToPayNum
    ? FinanceUtils.sum([cashGivenNum, -amountToPayNum])
    : 0;

  // ── Actions ──
  const addItemToPayment = (itemId: string, qty: number) => {
    // If customAmount is set (e.g. from a split), accumulate the item price
    if (customAmount) {
      const item = orderItems.find((i) => i.id === itemId);
      if (item) {
        const existingAmount = FinanceUtils.parseDecimal(customAmount) || 0;
        const addedValue = FinanceUtils.multiply(item.price, qty);
        setCustomAmount(FinanceUtils.sum([existingAmount, addedValue]).toFixed(2));
      }
    }
    setPaymentItems((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] ?? 0) + qty,
    }));
  };

  const removeItemFromPayment = (itemId: string, qty: number) => {
    // If customAmount is set, subtract the item price
    if (customAmount) {
      const item = orderItems.find((i) => i.id === itemId);
      if (item) {
        const existingAmount = FinanceUtils.parseDecimal(customAmount) || 0;
        const removedValue = FinanceUtils.multiply(item.price, qty);
        const newAmount = Math.max(0, FinanceUtils.sum([existingAmount, -removedValue]));
        setCustomAmount(newAmount > 0 ? newAmount.toFixed(2) : "");
      }
    }
    setPaymentItems((prev) => {
      const current = prev[itemId] ?? 0;
      const next = current - qty;
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const removeAllItemFromPayment = (itemId: string) => {
    // If customAmount is set, subtract all of this item's value
    if (customAmount) {
      const item = orderItems.find((i) => i.id === itemId);
      const qty = paymentItems[itemId] ?? 0;
      if (item && qty > 0) {
        const existingAmount = FinanceUtils.parseDecimal(customAmount) || 0;
        const removedValue = FinanceUtils.multiply(item.price, qty);
        const newAmount = Math.max(0, FinanceUtils.sum([existingAmount, -removedValue]));
        setCustomAmount(newAmount > 0 ? newAmount.toFixed(2) : "");
      }
    }
    setPaymentItems((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
  };

  const addAllItems = (divisor: number = 1) => {
    if (divisor <= 1) {
      // Original behavior: add all remaining items at full qty
      const items: Record<string, number> = {};
      for (const item of unpaidItems) {
        const inPayment = paymentItems[item.id] ?? 0;
        const avail = item.remainingQty - inPayment;
        if (avail > 0) items[item.id] = (paymentItems[item.id] ?? 0) + avail;
      }
      setPaymentItems((prev) => ({ ...prev, ...items }));
    } else {
      // Split: add fractioned entries for each item ÷ divisor
      const newEntries: SplitEntry[] = [];
      for (const item of unpaidItems) {
        const inPayment = paymentItems[item.id] ?? 0;
        const avail = item.remainingQty - inPayment;
        if (avail <= 0) continue;
        const fractionedPrice = FinanceUtils.round(FinanceUtils.multiply(item.price, avail) / divisor, 2);
        newEntries.push({
          uid: crypto.randomUUID(),
          itemId: item.id,
          productName: item.product_name,
          fractionedPrice,
          divisor,
        });
      }
      setSplitEntries((prev) => [...prev, ...newEntries]);
      // Set custom amount to total of new split entries
      const splitTotal = newEntries.reduce((s, e) => s + e.fractionedPrice, 0);
      setCustomAmount(splitTotal.toFixed(2));
    }
  };

  const payRemaining = () => {
    // Add all unpaid items and pay the remaining balance
    addAllItems();
    setCustomAmount(remaining.toFixed(2));
  };

  const addPayment = () => {
    if (amountToPay <= 0 || amountToPay > remaining + 0.01) return;
    const finalAmt = Math.min(amountToPay, remaining);
    setPayments((prev) => [...prev, { method: selectedMethod, amount: Number(finalAmt.toFixed(2)) }]);

    // Track paid items
    if (Object.keys(paymentItems).length > 0) {
      setAccumulatedPaidItems((prev) => {
        const next = { ...prev };
        for (const [id, qty] of Object.entries(paymentItems)) {
          next[id] = (next[id] || 0) + qty;
        }
        return next;
      });
    }

    // Track split entries as fractional paid quantities
    if (splitEntries.length > 0) {
      setAccumulatedPaidItems((prev) => {
        const next = { ...prev };
        for (const entry of splitEntries) {
          const item = orderItems.find((i) => i.id === entry.itemId);
          if (item) {
            // Track as fractional quantity paid (fractionedPrice / item.price)
            const fracQty = Number(item.price) > 0 ? entry.fractionedPrice / Number(item.price) : 0;
            next[entry.itemId] = (next[entry.itemId] || 0) + fracQty;
          }
        }
        return next;
      });
    }

    setPaymentItems({});
    setSplitEntries([]);
    setCustomAmount("");
    setCashGiven("");
  };

  const removePayment = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFinalize = () => {
    if (remaining > 0.01 && payments.length === 0) return;
    const hasPaidItems = Object.keys(accumulatedPaidItems).length > 0;
    onPay({
      payments: payments.length > 0 ? payments : [],
      paidItems: hasPaidItems ? accumulatedPaidItems : undefined,
    });
  };

  // Split item confirm
  const confirmSplitItem = () => {
    if (!splitItemDialog) return;
    const item = unpaidItems.find((i) => i.id === splitItemDialog.id);
    if (!item) return;
    if (splitMode === "quantity") {
      const totalItemValue = FinanceUtils.multiply(item.price, item.remainingQty);
      const fractionedValue = FinanceUtils.round(totalItemValue / splitQtyDivisor, 2);
      // Add a split entry to the summary (does NOT consume from left panel)
      setSplitEntries((prev) => [
        ...prev,
        {
          uid: crypto.randomUUID(),
          itemId: item.id,
          productName: item.product_name,
          fractionedPrice: fractionedValue,
          divisor: splitQtyDivisor,
        },
      ]);
    }
    setSplitItemDialog(null);
  };

  const isMobile = useIsMobile();
  const [mobilePayTab, setMobilePayTab] = useState<"items" | "summary" | "pay">("items");

  // ── Shared UI fragments ──
  const renderItemCard = (item: typeof unpaidItems[0]) => {
    const inPayment = paymentItems[item.id] ?? 0;
    const canAdd = item.remainingQty - inPayment;
    return (
      <div key={item.id} className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.product_name}</p>
            {itemComplements.filter(c => c.order_item_id === item.id).map(c => (
              <p key={c.id} className="text-[10px] text-muted-foreground">+ {c.complement_name}</p>
            ))}
          </div>
          <span className="text-sm font-bold tabular-nums ml-2">R$ {(Number(item.price) * item.remainingQty).toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between">
          {onUpdateItemQty ? (
            <div className="flex items-center gap-1.5">
              <button onClick={() => onUpdateItemQty(item.id, -1)} className="rounded border p-1.5 hover:bg-secondary text-destructive touch-manipulation">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm font-bold w-8 text-center tabular-nums">
                {item.remainingQty < item.quantity ? item.remainingQty.toFixed(item.remainingQty % 1 ? 2 : 0) : item.quantity.toFixed(item.quantity % 1 ? 2 : 0)}
              </span>
              <button onClick={() => onUpdateItemQty(item.id, 1)} className="rounded border p-1.5 hover:bg-secondary text-accent touch-manipulation">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Qtd: {item.remainingQty}</span>
          )}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setSplitItemDialog(item); setSplitMode("quantity"); setSplitQtyDivisor(2); }}
              disabled={canAdd <= 0}
              className="rounded-md px-3 py-2 text-[11px] font-bold bg-[hsl(var(--status-reserved))] text-white hover:opacity-90 disabled:opacity-30 transition-opacity touch-manipulation"
            >
              DIVIDIR
            </button>
            <button
              onClick={() => addItemToPayment(item.id, 1)}
              disabled={canAdd <= 0}
              className="rounded-md px-3 py-2 text-[11px] font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 transition-opacity touch-manipulation"
            >
              +1
            </button>
            <button
              onClick={() => addItemToPayment(item.id, canAdd)}
              disabled={canAdd <= 0}
              className="rounded-md px-3 py-2 text-[11px] font-bold bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-30 transition-opacity touch-manipulation"
            >
              TODOS
            </button>
          </div>
        </div>
        {inPayment > 0 && (
          <div className="flex items-center justify-between bg-accent/10 rounded px-2 py-1">
            <span className="text-[10px] text-accent font-medium">{inPayment}× selecionado</span>
            <button onClick={() => removeAllItemFromPayment(item.id)} className="text-[10px] text-destructive font-bold touch-manipulation">REMOVER</button>
          </div>
        )}
      </div>
    );
  };

  const renderItemsTable = (item: typeof unpaidItems[0]) => {
    const inPayment = paymentItems[item.id] ?? 0;
    const canAdd = item.remainingQty - inPayment;
    return (
      <tr key={item.id} className="border-b border-border/50">
        <td className="py-2">
          {onUpdateItemQty ? (
            <div className="flex items-center gap-1">
              <button onClick={() => onUpdateItemQty(item.id, -1)} className="rounded p-0.5 hover:bg-secondary text-destructive"><Minus className="h-3 w-3" /></button>
              <span className="text-xs font-bold w-6 text-center tabular-nums">
                {item.remainingQty < item.quantity ? item.remainingQty.toFixed(item.remainingQty % 1 ? 2 : 0) : item.quantity.toFixed(item.quantity % 1 ? 2 : 0)}
              </span>
              <button onClick={() => onUpdateItemQty(item.id, 1)} className="rounded p-0.5 hover:bg-secondary text-accent"><Plus className="h-3 w-3" /></button>
            </div>
          ) : (
            <span className="text-xs tabular-nums">
              {item.remainingQty < item.quantity ? item.remainingQty.toFixed(item.remainingQty % 1 ? 2 : 0) : item.quantity.toFixed(item.quantity % 1 ? 2 : 0)}
            </span>
          )}
        </td>
        <td className="py-2">
          <span className="text-xs font-medium">{item.product_name}</span>
          {itemComplements.filter(c => c.order_item_id === item.id).map(c => (
            <p key={c.id} className="text-[10px] text-muted-foreground">+ {c.complement_name}</p>
          ))}
        </td>
        <td className="py-2 text-xs font-semibold text-right tabular-nums">R$ {(Number(item.price) * item.remainingQty).toFixed(2)}</td>
        <td className="py-2 pl-2">
          <div className="flex items-center gap-1 justify-end">
            <button onClick={() => { setSplitItemDialog(item); setSplitMode("quantity"); setSplitQtyDivisor(2); }} disabled={canAdd <= 0} className="rounded px-2 py-1 text-[10px] font-bold bg-[hsl(var(--status-reserved))] text-white hover:opacity-90 disabled:opacity-30 transition-opacity">DIVIDIR</button>
            <button onClick={() => addItemToPayment(item.id, 1)} disabled={canAdd <= 0} className="rounded px-2 py-1 text-[10px] font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 transition-opacity">+1</button>
            <button onClick={() => addItemToPayment(item.id, canAdd)} disabled={canAdd <= 0} className="rounded px-2 py-1 text-[10px] font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 transition-opacity">TODOS</button>
          </div>
        </td>
      </tr>
    );
  };

  const renderPaymentMethodAndAmount = () => (
    <>
      <div className={`grid ${isMobile ? "grid-cols-4" : "grid-cols-1"} gap-1.5 mb-3`}>
        {METHODS.map((method) => (
          <button
            key={method}
            onClick={() => setSelectedMethod(method)}
            className={`w-full rounded-md py-2 text-xs font-bold transition-all touch-manipulation ${
              selectedMethod === method
                ? `${methodColors[method]} ring-2 ring-ring ring-offset-1 ring-offset-card`
                : `${methodColors[method]} opacity-70 hover:opacity-100`
            }`}
          >
            {methodLabels[method].toUpperCase()}
          </button>
        ))}
      </div>
      <div className="space-y-2 flex-1">
        <div>
          <label className="text-[11px] text-muted-foreground">Valor a pagar</label>
          <input
            type="text"
            inputMode="decimal"
            value={customAmount ? customAmount : amountToPay > 0 ? amountToPay.toFixed(2).replace(".", ",") : ""}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "");
              const cents = parseInt(digits, 10) || 0;
              const formatted = (cents / 100).toFixed(2).replace(".", ",");
              setCustomAmount(formatted);
            }}
            className="w-full mt-0.5 rounded-md border bg-background px-3 py-2 text-base text-right font-semibold outline-none focus:ring-2 focus:ring-ring tabular-nums"
          />
        </div>
        {selectedMethod === "cash" && (
          <div>
            <label className="text-[11px] text-muted-foreground">Troco para</label>
            <input
              type="text"
              inputMode="decimal"
              value={cashGiven}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                const cents = parseInt(digits, 10) || 0;
                const formatted = (cents / 100).toFixed(2).replace(".", ",");
                setCashGiven(formatted);
              }}
              placeholder="0,00"
              className="w-full mt-0.5 rounded-md border bg-background px-3 py-2 text-base text-right font-semibold outline-none focus:ring-2 focus:ring-ring tabular-nums"
            />
            {cashChange > 0 && (
              <div className="mt-1.5 rounded-md bg-accent/15 border border-accent/30 p-2 text-center">
                <p className="text-[10px] text-accent uppercase tracking-wider font-semibold">Troco</p>
                <p className="text-lg font-bold text-accent tabular-nums">R$ {cashChange.toFixed(2).replace(".", ",")}</p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-1 mt-1.5">
              {[10, 20, 50, 100, 200].filter(v => v >= amountToPay).slice(0, 3).map((val) => (
                <button
                  key={val}
                  onClick={() => setCashGiven(String(val))}
                  className="rounded border bg-background py-1.5 text-[11px] font-medium hover:bg-secondary transition-colors touch-manipulation"
                >
                  R$ {val}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <button
        onClick={addPayment}
        disabled={isPending || amountToPay <= 0 || amountToPay > remaining + 0.01}
        className="w-full rounded-md bg-[hsl(var(--status-free))] text-white py-2.5 font-bold text-xs hover:opacity-90 disabled:opacity-40 transition-opacity mt-3 touch-manipulation"
      >
        ADICIONAR
      </button>
    </>
  );

  const hasSummaryItems = Object.keys(paymentItems).length > 0 || splitEntries.length > 0;

  const renderSummaryContent = () => (
    <>
      <div className="text-center mb-2">
        <p className="text-xl font-bold tabular-nums">R$ {amountToPay.toFixed(2)}</p>
      </div>
      {hasSummaryItems ? (
        <div className="space-y-1">
          <div className="space-y-1.5">
            {Object.entries(paymentItems).map(([id, qty]) => {
              const item = orderItems.find((i) => i.id === id);
              if (!item) return null;
              return (
                <div key={id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm">{item.product_name}</span>
                    {itemComplements.filter(c => c.order_item_id === id).map(c => (
                      <p key={c.id} className="text-[10px] text-muted-foreground">+ {c.complement_name}</p>
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground mx-2">{qty.toFixed(qty % 1 ? 2 : 0)}×</span>
                  <span className="text-sm font-semibold tabular-nums">R$ {(Number(item.price) * qty).toFixed(2)}</span>
                </div>
              );
            })}
            {splitEntries.map((entry) => (
              <div key={entry.uid} className="flex items-center justify-between rounded-lg border border-[hsl(var(--status-reserved))]/40 bg-[hsl(var(--status-reserved))]/5 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <span className="text-sm">{entry.productName}</span>
                  <p className="text-[10px] text-muted-foreground">÷ {entry.divisor} (dividido)</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">R$ {entry.fractionedPrice.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                if (splitEntries.length > 0) {
                  setSplitEntries((prev) => prev.slice(0, -1));
                } else {
                  const entries = Object.entries(paymentItems);
                  if (entries.length > 0) {
                    const [lastId] = entries[entries.length - 1];
                    removeItemFromPayment(lastId, 1);
                  }
                }
              }}
              className="flex-1 rounded-md bg-destructive/15 text-destructive py-2.5 text-xs font-bold hover:bg-destructive/25 transition-colors touch-manipulation"
            >
              REMOVER 1
            </button>
            <button
              onClick={() => { setPaymentItems({}); setSplitEntries([]); setCustomAmount(""); }}
              className="flex-1 rounded-md bg-destructive/15 text-destructive py-2.5 text-xs font-bold hover:bg-destructive/25 transition-colors touch-manipulation"
            >
              REMOVER TODOS
            </button>
          </div>
        </div>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhum item adicionado</p>
      )}
      {payments.length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Pagamentos parciais</h3>
          <div className="space-y-2">
            {payments.map((p, i) => (
              <div key={i} className="rounded-md border p-2.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{methodLabels[p.method]}</span>
                  <button onClick={() => removePayment(i)} className="rounded p-0.5 hover:bg-destructive/10 text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor pago:</span>
                  <span className="font-semibold">R$ {p.amount.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {remaining <= 0.01 && payments.length > 0 && !isMobile && (
        <div className="mt-4 pt-4 border-t">
          <p className="text-center text-sm text-accent font-semibold">✓ Pagamento completo — finalize abaixo</p>
        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 md:px-5 py-1.5">
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="rounded-md border p-1.5 hover:bg-secondary transition-colors touch-manipulation">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-sm md:text-base font-semibold leading-tight">Fechamento de Conta</h1>
            <div className="flex items-center gap-2 md:gap-3 text-[10px] md:text-[11px] text-muted-foreground">
              <span>{orderItems.length} itens</span>
              <span>R$ {total.toFixed(2)}</span>
              {paidTotal > 0 && <span className="text-accent">Pago: R$ {paidTotal.toFixed(2)}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg md:text-xl font-bold tabular-nums">R$ {grandTotal.toFixed(2)}</span>
          <button onClick={onCancel} className="rounded-md p-1.5 hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Top action bar */}
      <div className="flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-1.5 border-b bg-card overflow-x-auto flex-shrink-0">
        <button onClick={payRemaining} disabled={remaining <= 0.01} className="rounded-md bg-accent text-accent-foreground px-2.5 md:px-3 py-1.5 text-[11px] md:text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap touch-manipulation">PAGAR RESTANTE</button>
        <button onClick={() => { setSplitAllDivisor(2); setSplitAllStep("count"); setShowSplitAllDialog(true); }} disabled={availableItems.length === 0} className="rounded-md bg-primary text-primary-foreground px-2.5 md:px-3 py-1.5 text-[11px] md:text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap touch-manipulation">DIVIDIR TUDO</button>
        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <button onClick={() => setDiscountValue(discountValue > 0 ? 0 : 10)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap touch-manipulation ${discountValue > 0 ? "bg-destructive text-destructive-foreground" : "border hover:bg-secondary"}`}>DESCONTO</button>
          {!isMobile && (
            <>
              <button onClick={() => setExtraCharge(extraCharge > 0 ? 0 : 5)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${extraCharge > 0 ? "bg-accent text-accent-foreground" : "border hover:bg-secondary"}`}>ACRÉSCIMO</button>
              <button onClick={() => onToggleServiceFee(!serviceFeeEnabled)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${serviceFeeEnabled ? "bg-[hsl(var(--status-reserved))] text-white" : "border hover:bg-secondary"}`}>T. SERVIÇO</button>
            </>
          )}
        </div>
      </div>

      {/* Adjustment inputs (shown conditionally) */}
      {(discountValue > 0 || extraCharge > 0) && (
        <div className="flex items-center gap-3 px-3 md:px-5 py-1.5 border-b bg-muted/50 text-xs flex-wrap flex-shrink-0">
          {discountValue > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Desconto:</span>
              <div className="flex rounded border overflow-hidden">
                <button onClick={() => setDiscountType("percent")} className={`px-2 py-0.5 text-xs font-medium ${discountType === "percent" ? "bg-accent text-accent-foreground" : ""}`}>%</button>
                <button onClick={() => setDiscountType("fixed")} className={`px-2 py-0.5 text-xs font-medium ${discountType === "fixed" ? "bg-accent text-accent-foreground" : ""}`}>R$</button>
              </div>
              <input type="number" min="0" value={discountValue || ""} onChange={(e) => setDiscountValue(Number(e.target.value))} className="w-16 rounded border bg-card px-2 py-1 text-sm text-right outline-none focus:ring-1 focus:ring-ring" />
              <span className="text-destructive font-medium">-R$ {discount.toFixed(2)}</span>
            </div>
          )}
          {extraCharge > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Acréscimo:</span>
              <input type="number" min="0" step="0.01" value={extraCharge || ""} onChange={(e) => setExtraCharge(Number(e.target.value))} className="w-20 rounded border bg-card px-2 py-1 text-sm text-right outline-none focus:ring-1 focus:ring-ring" />
              <span className="text-accent font-medium">+R$ {extraCharge.toFixed(2)}</span>
            </div>
          )}
        </div>
      )}

      {/* MOBILE: Tabbed layout */}
      {isMobile ? (
        <>
          {/* Tab bar */}
          <div className="flex border-b bg-card">
            {([
              { key: "items" as const, label: "Itens", badge: unpaidItems.length },
              { key: "summary" as const, label: "Resumo", badge: Object.keys(paymentItems).length + splitEntries.length + payments.length },
              { key: "pay" as const, label: "Pagar", badge: 0 },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setMobilePayTab(tab.key)}
                className={`flex-1 py-3 text-sm font-semibold relative transition-colors touch-manipulation ${
                  mobilePayTab === tab.key ? "text-accent border-b-2 border-accent" : "text-muted-foreground"
                }`}
              >
                {tab.label}
                {tab.badge > 0 && (
                  <span className="absolute -top-0.5 right-1/4 bg-accent text-accent-foreground text-[9px] font-bold rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-3">
            {mobilePayTab === "items" && (
              <div className="space-y-2">
                {unpaidItems.map(renderItemCard)}
                {unpaidItems.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">Todos os itens foram pagos</p>
                )}
                {/* Quick-sale */}
                {onAddQuickItem && quickSaleProducts.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border/50">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5"><Zap className="h-3 w-3" /> Venda Rápida</h3>
                    <div className="space-y-1.5">
                      {quickSaleProducts.map((p) => {
                        const added = orderItems.find((i) => i.product_id === p.id);
                        return <QuickSaleRow key={p.id} product={p} onAdd={onAddQuickItem} onRemove={onRemoveQuickItem} addedQty={added ? added.quantity : 0} />;
                      })}
                    </div>
                  </div>
                )}
                {orderItems.some((i) => (i.paid_quantity ?? 0) > 0) && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Itens pagos 🔒</h3>
                    {orderItems.filter((i) => (i.paid_quantity ?? 0) > 0).map((item) => (
                      <div key={item.id} className="flex justify-between text-sm py-1.5 text-muted-foreground opacity-60">
                        <span className="line-through">{item.paid_quantity}× {item.product_name}</span>
                        <span>R$ {(Number(item.price) * (item.paid_quantity ?? 0)).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {mobilePayTab === "summary" && renderSummaryContent()}
            {mobilePayTab === "pay" && (
              <div className="flex flex-col h-full">
                {renderPaymentMethodAndAmount()}
              </div>
            )}
          </div>
        </>
      ) : (
        /* DESKTOP: 3-column layout */
        <div className="flex-1 flex flex-row overflow-hidden min-h-0">
          {/* LEFT: Items list */}
          <div className="flex-1 overflow-auto p-3 border-r">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Itens do Pedido</h2>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b">
                  <th className="text-left py-1.5 font-medium w-14">Qtd.</th>
                  <th className="text-left py-1.5 font-medium">Item</th>
                  <th className="text-right py-1.5 font-medium">Valor</th>
                  <th className="py-1.5 w-64"></th>
                </tr>
              </thead>
              <tbody>
                {unpaidItems.map(renderItemsTable)}
                {unpaidItems.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">Todos os itens foram pagos</td></tr>
                )}
              </tbody>
            </table>
            {onAddQuickItem && quickSaleProducts.length > 0 && (
              <div className="mt-3 pt-2 border-t border-border/50">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5"><Zap className="h-3 w-3" /> Venda Rápida</h3>
                <div className="space-y-1">
                  {quickSaleProducts.map((p) => {
                    const added = orderItems.find((i) => i.product_id === p.id);
                    return <QuickSaleRow key={p.id} product={p} onAdd={onAddQuickItem} onRemove={onRemoveQuickItem} addedQty={added ? added.quantity : 0} />;
                  })}
                </div>
              </div>
            )}
            {orderItems.some((i) => (i.paid_quantity ?? 0) > 0) && (
              <div className="mt-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Itens pagos 🔒</h3>
                {orderItems.filter((i) => (i.paid_quantity ?? 0) > 0).map((item) => (
                  <div key={item.id} className="flex justify-between text-xs py-1 text-muted-foreground opacity-60">
                    <span className="line-through">{item.paid_quantity}× {item.product_name}</span>
                    <span>R$ {(Number(item.price) * (item.paid_quantity ?? 0)).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CENTER: Summary */}
          <div className="w-72 flex flex-col border-r overflow-auto">
            <div className="p-3 flex-1">{renderSummaryContent()}</div>
          </div>

          {/* RIGHT: Payment */}
          <div className="w-60 flex flex-col bg-card p-3">
            {renderPaymentMethodAndAmount()}
          </div>
        </div>
      )}

      {/* Bottom bar — always visible */}
      <div className="border-t flex items-center justify-between px-3 md:px-5 py-2 bg-card gap-2 flex-shrink-0">
        <button onClick={onCancel} className="rounded-md bg-destructive/15 text-destructive px-4 md:px-5 py-2 text-[11px] md:text-xs font-bold hover:bg-destructive/25 transition-colors touch-manipulation">VOLTAR</button>
        <div className="flex items-center gap-2 md:gap-3 text-[11px] md:text-xs">
          {paidTotal > 0 && (
            <span className="text-muted-foreground">Pago: <span className="font-bold text-accent">R$ {paidTotal.toFixed(2)}</span></span>
          )}
          <span className="text-muted-foreground">Restante: <span className="font-bold text-foreground">R$ {remaining.toFixed(2)}</span></span>
        </div>
        {remaining <= 0.01 && payments.length > 0 ? (
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                // Build complements map
                const complementsByItem: Record<string, { name: string }[]> = {};
                for (const c of itemComplements) {
                  if (!complementsByItem[c.order_item_id]) complementsByItem[c.order_item_id] = [];
                  complementsByItem[c.order_item_id].push({ name: c.complement_name });
                }

                const enrichedBillItems = await enrichItemsWithWeightInfo(
                  orderItems.map((o) => ({
                    product_id: (o as any).product_id ?? null,
                    product_name: o.product_name,
                    quantity: o.quantity,
                    price: Number(o.price),
                    complements: (complementsByItem[o.id] || []).map((c) => c.name),
                  })),
                );

                const billPayload = {
                  type: "bill" as const,
                  compact: true,
                  business_name: businessName,
                  business_phone: businessPhone || null,
                  location: orderContext?.location || "Caixa",
                  table_name: orderContext?.tableName || "Comanda",
                  customer_name: orderContext?.customerName || null,
                  waiter_name: orderContext?.waiterName || null,
                  origin: orderContext?.origin || "waiter",
                  order_id: orderContext?.orderId || null,
                  items: enrichedBillItems,
                  total: grandTotal,
                  payment_method: payments.map((p) => methodLabels[p.method] || p.method).join(", "),
                  change: payments.find(p => p.method === "cash") ?
                    Math.max(0, FinanceUtils.sum([FinanceUtils.sum(payments.filter(p => p.method === "cash").map(p => p.amount)), -grandTotal])) : null,
                  footer_message: "Volte sempre!!!",
                };

                // Tenta Agente Local; se offline, fallback nativo (window.print via iframe).
                const result = await printViaLocalAgent({ ...billPayload, paper: "80mm" });
                if (result.ok && result.via === "agent") {
                  toast.success("Impressão enviada");
                } else if (result.ok) {
                  toast.success("Imprimindo conta...");
                } else {
                  toast.error("Não foi possível abrir a impressão.");
                }
              }}
              className="rounded-md border bg-secondary text-secondary-foreground px-3 py-2 text-xs font-bold hover:bg-secondary/80 transition-colors flex items-center gap-1.5 touch-manipulation"
            >
              <Printer className="h-3.5 w-3.5" />🧾
            </button>
            <button
              onClick={handleFinalize}
              disabled={isPending}
              className="rounded-md bg-accent text-accent-foreground px-5 py-2 text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2 touch-manipulation animate-pulse"
            >
              {isPending ? "Finalizando..." : (<><Check className="h-4 w-4" />FINALIZAR</>)}
            </button>
          </div>
        ) : !isMobile && payments.length > 0 ? (
          <button className="rounded-md border bg-card px-5 py-2 text-xs font-bold hover:bg-secondary transition-colors">PAGAMENTOS ({payments.length})</button>
        ) : null}
      </div>

      {/* Split item dialog */}
      <Dialog open={!!splitItemDialog} onOpenChange={(v) => !v && setSplitItemDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Dividir Item</DialogTitle>
          </DialogHeader>
          {splitItemDialog && (() => {
            const item = unpaidItems.find((i) => i.id === splitItemDialog.id);
            if (!item) return null;
            const itemTotal = FinanceUtils.multiply(item.price, item.remainingQty);
            const splitResult = splitMode === "quantity" ? FinanceUtils.round(itemTotal / splitQtyDivisor, 2) : 0;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 rounded-md bg-muted p-3">
                  <div className="text-center"><p className="text-[10px] text-muted-foreground uppercase">Valor total</p><p className="text-sm font-bold">R$ {itemTotal.toFixed(2)}</p></div>
                  <div className="text-center"><p className="text-[10px] text-muted-foreground uppercase">Valor pago</p><p className="text-sm font-bold">R$ 0,00</p></div>
                  <div className="text-center"><p className="text-[10px] text-muted-foreground uppercase">Saldo</p><p className="text-sm font-bold">R$ {itemTotal.toFixed(2)}</p></div>
                </div>
                <div className="flex rounded-md border overflow-hidden">
                  <button onClick={() => setSplitMode("quantity")} className={`flex-1 py-2.5 text-sm font-bold ${splitMode === "quantity" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>QUANTIDADE</button>
                  <button onClick={() => setSplitMode("value")} className={`flex-1 py-2.5 text-sm font-bold ${splitMode === "value" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"}`}>VALOR</button>
                </div>
                {splitMode === "quantity" && (
                  <div className="flex items-center justify-center gap-4">
                    <span className="text-sm text-muted-foreground">Dividir R$ {itemTotal.toFixed(2)} por:</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSplitQtyDivisor(Math.max(2, splitQtyDivisor - 1))} className="rounded border p-1.5 hover:bg-secondary touch-manipulation"><Minus className="h-4 w-4" /></button>
                      <span className="text-lg font-bold w-8 text-center">{splitQtyDivisor}</span>
                      <button onClick={() => setSplitQtyDivisor(Math.min(20, splitQtyDivisor + 1))} className="rounded border p-1.5 hover:bg-secondary touch-manipulation"><Plus className="h-4 w-4" /></button>
                    </div>
                  </div>
                )}
                {splitMode === "quantity" && (
                  <div className="text-center text-sm text-muted-foreground">Valor a pagar: <span className="font-bold text-foreground">R$ {splitResult.toFixed(2)}</span></div>
                )}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setSplitItemDialog(null)} className="flex-1 rounded-md bg-destructive/15 text-destructive py-3 font-bold text-sm touch-manipulation">VOLTAR</button>
                  <button onClick={confirmSplitItem} className="flex-1 rounded-md bg-accent text-accent-foreground py-3 font-bold text-sm hover:opacity-90 touch-manipulation">CONFIRMAR</button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Dividir Tudo dialog */}
      {showSplitAllDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30">
          <div className="w-full max-w-sm rounded-lg border bg-background p-5 shadow-lg">
            <h3 className="font-semibold text-base mb-1">Dividir Tudo</h3>

            {splitAllStep === "count" ? (
              <>
                <p className="text-xs text-muted-foreground mb-4">Em quantas partes deseja dividir a conta?</p>
                <div className="flex items-center justify-center gap-4 mb-5">
                  <button
                    onClick={() => setSplitAllDivisor(Math.max(2, splitAllDivisor - 1))}
                    className="rounded-full border h-10 w-10 flex items-center justify-center hover:bg-secondary transition-colors touch-manipulation"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <div className="flex flex-col items-center">
                    <span className="text-3xl font-bold tabular-nums">{splitAllDivisor}</span>
                    <span className="text-[10px] text-muted-foreground">pessoas</span>
                  </div>
                  <button
                    onClick={() => setSplitAllDivisor(splitAllDivisor + 1)}
                    className="rounded-full border h-10 w-10 flex items-center justify-center hover:bg-secondary transition-colors touch-manipulation"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-center text-sm text-muted-foreground mb-4">
                  Cada parte: <strong className="text-foreground">R$ {(grandTotal / splitAllDivisor).toFixed(2)}</strong>
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowSplitAllDialog(false); setSplitAllStep("count"); }}
                    className="flex-1 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors touch-manipulation"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      setSplitAllMethods(Array(splitAllDivisor).fill("cash"));
                      setSplitAllStep("methods");
                    }}
                    className="flex-1 rounded-md bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity touch-manipulation"
                  >
                    Próximo
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground mb-4">Escolha a forma de pagamento de cada parte:</p>
                <div className="space-y-3 max-h-[50vh] overflow-auto mb-4">
                  {splitAllMethods.map((method, idx) => (
                    <div key={idx} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Parte {idx + 1}</span>
                        <span className="text-sm font-bold tabular-nums">R$ {(grandTotal / splitAllDivisor).toFixed(2)}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {METHODS.map((m) => (
                          <button
                            key={m}
                            onClick={() => setSplitAllMethods((prev) => prev.map((v, i) => i === idx ? m : v))}
                            className={`rounded-md py-2 text-[10px] font-bold transition-all touch-manipulation ${
                              method === m
                                ? `${methodColors[m]} ring-2 ring-ring ring-offset-1 ring-offset-background`
                                : `${methodColors[m]} opacity-50 hover:opacity-80`
                            }`}
                          >
                            {methodLabels[m].split(" ").pop()?.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSplitAllStep("count")}
                    className="flex-1 rounded-md border px-4 py-2.5 text-sm font-medium hover:bg-secondary transition-colors touch-manipulation"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={() => {
                      // Add split entries for each fraction
                      addAllItems(splitAllDivisor);
                      // Create a payment for each fraction with its chosen method
                      const fractionAmount = FinanceUtils.round(grandTotal / splitAllDivisor, 2);
                      const newPayments: PaymentEntry[] = splitAllMethods.map((m) => ({
                        method: m,
                        amount: fractionAmount,
                      }));
                      // Adjust last payment for rounding
                      const totalPaid = FinanceUtils.multiply(fractionAmount, splitAllDivisor - 1);
                      newPayments[newPayments.length - 1].amount = FinanceUtils.sum([grandTotal, -totalPaid]);
                      setPayments((prev) => [...prev, ...newPayments]);

                      // Track all items as paid
                      setAccumulatedPaidItems((prev) => {
                        const next = { ...prev };
                        for (const item of unpaidItems) {
                          next[item.id] = (next[item.id] || 0) + item.remainingQty;
                        }
                        return next;
                      });

                      setPaymentItems({});
                      setSplitEntries([]);
                      setCustomAmount("");
                      setShowSplitAllDialog(false);
                      setSplitAllStep("count");
                    }}
                    className="flex-1 rounded-md bg-accent text-accent-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity touch-manipulation"
                  >
                    Confirmar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
