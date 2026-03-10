import { useState, useMemo } from "react";
import {
  CreditCard, Banknote, Smartphone, Users, SplitSquareHorizontal, ArrowLeft,
  Check, Minus, Plus, Percent, DollarSign, X, Trash2, Receipt,
} from "lucide-react";

type OrderItem = {
  id: string;
  product_name: string;
  price: number;
  quantity: number;
};

type PaymentEntry = {
  method: string;
  amount: number;
};

type SplitMode = "full" | "people" | "items";

interface PaymentPanelProps {
  total: number;
  orderItems: OrderItem[];
  serviceFeeEnabled: boolean;
  onToggleServiceFee: (enabled: boolean) => void;
  onPay: (payments: PaymentEntry[]) => void;
  onCancel: () => void;
  isPending: boolean;
}

const methodLabels: Record<string, string> = {
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  pix: "Pix",
};

const methodIcons: Record<string, typeof CreditCard> = {
  pix: Smartphone,
  debit: CreditCard,
  credit: CreditCard,
  cash: Banknote,
};

const METHODS = ["pix", "debit", "credit", "cash"] as const;

export default function PaymentPanel({
  total,
  orderItems,
  serviceFeeEnabled,
  onToggleServiceFee,
  onPay,
  onCancel,
  isPending,
}: PaymentPanelProps) {
  // ── Adjustments ──
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState(0);
  const [extraCharge, setExtraCharge] = useState(0);
  const [serviceFeePct, setServiceFeePct] = useState(10);

  // ── Split ──
  const [splitMode, setSplitMode] = useState<SplitMode>("full");
  const [splitCount, setSplitCount] = useState(2);
  const [itemAssignment, setItemAssignment] = useState<Record<string, number>>({});

  // ── Payments ──
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [customAmount, setCustomAmount] = useState("");

  // ── Calculations ──
  const discount = useMemo(
    () => (discountType === "percent" ? total * (discountValue / 100) : discountValue),
    [total, discountType, discountValue]
  );
  const serviceFee = serviceFeeEnabled ? (total - discount) * (serviceFeePct / 100) : 0;
  const grandTotal = Math.max(0, total - discount + extraCharge + serviceFee);
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, Number((grandTotal - paidTotal).toFixed(2)));

  // ── Split calculations ──
  const splitAmounts = useMemo(() => {
    if (splitMode === "people") {
      const per = grandTotal / splitCount;
      return Array.from({ length: splitCount }, () => Number(per.toFixed(2)));
    }
    if (splitMode === "items") {
      const amounts = Array(splitCount).fill(0);
      for (const item of orderItems) {
        const idx = itemAssignment[item.id];
        if (idx !== undefined) {
          amounts[idx] += Number(item.price) * item.quantity;
        }
      }
      // Apply proportional adjustments
      const rawTotal = amounts.reduce((s: number, a: number) => s + a, 0);
      if (rawTotal > 0) {
        return amounts.map((a: number) => Number(((a / rawTotal) * grandTotal).toFixed(2)));
      }
      return amounts;
    }
    return [grandTotal];
  }, [splitMode, splitCount, grandTotal, orderItems, itemAssignment]);

  // Track which splits are paid
  const [splitPayments, setSplitPayments] = useState<(PaymentEntry | null)[]>([]);

  const addPayment = (method: string, amount?: number) => {
    const amt = amount ?? remaining;
    if (amt <= 0) return;
    const finalAmt = Math.min(amt, remaining);
    setPayments((prev) => [...prev, { method, amount: Number(finalAmt.toFixed(2)) }]);
  };

  const removePayment = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFinalize = () => {
    if (splitMode !== "full") {
      // Collect split payments
      const allPayments = splitPayments.filter(Boolean) as PaymentEntry[];
      if (allPayments.length < splitCount) return;
      onPay(allPayments);
    } else {
      if (remaining > 0.01 && payments.length === 0) return;
      onPay(payments.length > 0 ? payments : []);
    }
  };

  const paySplit = (index: number, method: string) => {
    const newSplitPayments = [...splitPayments];
    newSplitPayments[index] = { method, amount: splitAmounts[index] };
    setSplitPayments(newSplitPayments);

    // Auto-finalize if all splits paid
    const filled = newSplitPayments.filter(Boolean) as PaymentEntry[];
    if (filled.length === splitCount) {
      onPay(filled);
    }
  };

  const resetSplitPayments = (count?: number) => {
    setSplitPayments(Array(count ?? splitCount).fill(null));
  };

  const updateSplitCount = (c: number) => {
    const val = Math.max(2, Math.min(20, c));
    setSplitCount(val);
    resetSplitPayments(val);
  };

  const assignItem = (itemId: string, personIdx: number) => {
    setItemAssignment((prev) => {
      const next = { ...prev };
      if (next[itemId] === personIdx) delete next[itemId];
      else next[itemId] = personIdx;
      return next;
    });
  };

  const initSplit = (mode: SplitMode) => {
    setSplitMode(mode);
    setPayments([]);
    resetSplitPayments(splitCount);
    if (mode === "items") setItemAssignment({});
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="rounded-md border p-2 hover:bg-secondary transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-semibold">Fechamento de Conta</h1>
            <p className="text-xs text-muted-foreground">{orderItems.length} itens na comanda</p>
          </div>
        </div>
        <button onClick={onCancel} className="rounded-md p-2 hover:bg-secondary">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Items + Adjustments */}
        <div className="flex-1 border-r overflow-auto p-6 space-y-6">
          {/* Order items summary */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Itens do Pedido</h2>
            <div className="space-y-1">
              {orderItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-6 text-right">{item.quantity}×</span>
                    <span>{item.product_name}</span>
                  </div>
                  <span className="font-medium">R$ {(Number(item.price) * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Adjustments */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Ajustes</h2>
            <div className="space-y-3">
              {/* Service fee */}
              <div className="flex items-center justify-between rounded-md border p-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={serviceFeeEnabled}
                    onChange={(e) => onToggleServiceFee(e.target.checked)}
                    className="rounded"
                  />
                  Taxa de serviço
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    value={serviceFeePct}
                    onChange={(e) => setServiceFeePct(Math.max(0, Math.min(100, Number(e.target.value))))}
                    disabled={!serviceFeeEnabled}
                    className="w-14 rounded border bg-card px-2 py-1 text-sm text-right outline-none focus:ring-1 focus:ring-ring disabled:opacity-40"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                  {serviceFeeEnabled && (
                    <span className="text-sm font-medium ml-2">R$ {serviceFee.toFixed(2)}</span>
                  )}
                </div>
              </div>

              {/* Discount */}
              <div className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <Percent className="h-4 w-4 text-muted-foreground" />
                    <span>Desconto</span>
                  </div>
                  <div className="flex rounded-md border overflow-hidden">
                    <button
                      onClick={() => setDiscountType("percent")}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${discountType === "percent" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"}`}
                    >
                      %
                    </button>
                    <button
                      onClick={() => setDiscountType("fixed")}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors ${discountType === "fixed" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"}`}
                    >
                      R$
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step={discountType === "percent" ? "1" : "0.01"}
                    max={discountType === "percent" ? "100" : total}
                    value={discountValue || ""}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    placeholder="0"
                    className="flex-1 rounded border bg-card px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                  {discount > 0 && (
                    <span className="text-sm text-destructive font-medium">-R$ {discount.toFixed(2)}</span>
                  )}
                </div>
              </div>

              {/* Extra charge */}
              <div className="rounded-md border p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>Acréscimo</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={extraCharge || ""}
                    onChange={(e) => setExtraCharge(Number(e.target.value))}
                    placeholder="0,00"
                    className="flex-1 rounded border bg-card px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
                  />
                  {extraCharge > 0 && (
                    <span className="text-sm font-medium text-accent">+R$ {extraCharge.toFixed(2)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Split mode selection */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">Modo de Pagamento</h2>
            <div className="grid grid-cols-3 gap-2">
              {([
                { mode: "full" as const, icon: Receipt, label: "Conta Inteira" },
                { mode: "people" as const, icon: Users, label: "Dividir Igual" },
                { mode: "items" as const, icon: SplitSquareHorizontal, label: "Dividir Itens" },
              ]).map(({ mode, icon: Icon, label }) => (
                <button
                  key={mode}
                  onClick={() => initSplit(mode)}
                  className={`flex flex-col items-center gap-1.5 rounded-md border py-3 px-2 text-xs font-medium transition-colors ${
                    splitMode === mode
                      ? "border-accent bg-accent/10 text-accent"
                      : "hover:bg-secondary"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Split by people config */}
          {splitMode === "people" && (
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Número de pessoas</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => updateSplitCount(splitCount - 1)} className="rounded-md border p-1.5 hover:bg-secondary">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-lg font-semibold w-8 text-center">{splitCount}</span>
                  <button onClick={() => updateSplitCount(splitCount + 1)} className="rounded-md border p-1.5 hover:bg-secondary">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground flex justify-between border-t pt-2">
                <span>Valor por pessoa</span>
                <span className="font-semibold text-foreground">R$ {(grandTotal / splitCount).toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Split by items config */}
          {splitMode === "items" && (
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Número de pessoas</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => updateSplitCount(splitCount - 1)} className="rounded-md border p-1.5 hover:bg-secondary">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-lg font-semibold w-8 text-center">{splitCount}</span>
                  <button onClick={() => updateSplitCount(splitCount + 1)} className="rounded-md border p-1.5 hover:bg-secondary">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="border-t pt-3 space-y-1.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Atribuir itens</p>
                {orderItems.map((item) => {
                  const assignedTo = itemAssignment[item.id];
                  return (
                    <div key={item.id} className="flex items-center gap-2 py-1">
                      <span className="text-sm flex-1 truncate">
                        {item.quantity}× {item.product_name}
                        <span className="text-muted-foreground ml-1">R$ {(Number(item.price) * item.quantity).toFixed(2)}</span>
                      </span>
                      <div className="flex gap-1">
                        {Array.from({ length: splitCount }, (_, pi) => (
                          <button
                            key={pi}
                            onClick={() => assignItem(item.id, pi)}
                            className={`rounded-md px-2 py-1 text-xs font-medium border transition-colors ${
                              assignedTo === pi
                                ? "bg-accent text-accent-foreground border-accent"
                                : "hover:bg-secondary border-border"
                            }`}
                          >
                            P{pi + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Payment panel */}
        <div className="w-96 flex flex-col bg-card">
          {/* Totals breakdown */}
          <div className="p-6 space-y-2 border-b">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>R$ {total.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-destructive">Desconto</span>
                <span className="text-destructive">-R$ {discount.toFixed(2)}</span>
              </div>
            )}
            {serviceFeeEnabled && serviceFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Taxa de serviço ({serviceFeePct}%)</span>
                <span>R$ {serviceFee.toFixed(2)}</span>
              </div>
            )}
            {extraCharge > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-accent">Acréscimo</span>
                <span className="text-accent">+R$ {extraCharge.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between text-lg font-semibold">
              <span>Total</span>
              <span>R$ {grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Full payment mode */}
          {splitMode === "full" && (
            <div className="flex-1 overflow-auto p-6 space-y-4">
              {/* Payments added */}
              {payments.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Pagamentos adicionados</p>
                  {payments.map((p, i) => {
                    const Icon = methodIcons[p.method] ?? CreditCard;
                    return (
                      <div key={i} className="flex items-center justify-between rounded-md border bg-background p-2.5">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">{methodLabels[p.method]}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">R$ {p.amount.toFixed(2)}</span>
                          <button onClick={() => removePayment(i)} className="rounded p-1 hover:bg-destructive/10 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Remaining */}
              <div className={`rounded-md p-4 text-center ${remaining <= 0.01 ? "bg-accent/10 border border-accent" : "bg-muted"}`}>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  {remaining <= 0.01 ? "Pago" : "Restante"}
                </p>
                <p className={`text-2xl font-display ${remaining <= 0.01 ? "text-accent" : ""}`}>
                  R$ {remaining.toFixed(2)}
                </p>
              </div>

              {/* Custom amount input */}
              {remaining > 0.01 && (
                <>
                  <div>
                    <label className="text-xs text-muted-foreground">Valor parcial (ou deixe vazio para o restante)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={remaining}
                      value={customAmount}
                      onChange={(e) => setCustomAmount(e.target.value)}
                      placeholder={remaining.toFixed(2)}
                      className="w-full mt-1 rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  {/* Payment method buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    {METHODS.map((method) => {
                      const Icon = methodIcons[method];
                      return (
                        <button
                          key={method}
                          disabled={isPending}
                          onClick={() => {
                            const amt = customAmount ? Number(customAmount) : remaining;
                            addPayment(method, amt);
                            setCustomAmount("");
                          }}
                          className="flex items-center justify-center gap-2 rounded-md border bg-background py-3 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
                        >
                          <Icon className="h-4 w-4" />
                          {methodLabels[method]}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Finalize */}
              {remaining <= 0.01 && payments.length > 0 && (
                <button
                  onClick={handleFinalize}
                  disabled={isPending}
                  className="w-full rounded-md bg-accent text-accent-foreground py-3.5 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isPending ? "Finalizando..." : (
                    <>
                      <Check className="h-5 w-5" />
                      Finalizar Pagamento
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Split payment mode */}
          {splitMode !== "full" && (
            <div className="flex-1 overflow-auto p-6 space-y-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {splitMode === "people" ? "Pagamento por pessoa" : "Pagamento por grupo"}
              </p>
              {splitAmounts.map((amount, i) => {
                const sp = splitPayments[i];
                return (
                  <div key={i} className={`rounded-md border p-3 ${sp ? "bg-muted/50 border-muted" : ""}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Pessoa {i + 1}</span>
                      <span className="text-sm font-semibold">R$ {amount.toFixed(2)}</span>
                    </div>
                    {sp ? (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Check className="h-4 w-4 text-accent" />
                        Pago — {methodLabels[sp.method]}
                      </div>
                    ) : amount > 0 ? (
                      <div className="grid grid-cols-4 gap-1.5">
                        {METHODS.map((method) => {
                          const Icon = methodIcons[method];
                          return (
                            <button
                              key={method}
                              disabled={isPending}
                              onClick={() => paySplit(i, method)}
                              className="flex flex-col items-center gap-0.5 rounded-md border bg-background py-2 text-[10px] font-medium hover:bg-secondary transition-colors disabled:opacity-50"
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {methodLabels[method]}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted-foreground">Nenhum item atribuído</p>
                    )}
                  </div>
                );
              })}

              {/* Progress */}
              {(() => {
                const paidSplits = splitPayments.filter(Boolean).length;
                return paidSplits > 0 && paidSplits < splitCount ? (
                  <div className="rounded-md bg-muted p-3 text-center">
                    <p className="text-xs text-muted-foreground">{paidSplits}/{splitCount} pagamentos realizados</p>
                    <p className="text-sm font-semibold mt-0.5">
                      Restante: R$ {splitAmounts.slice(paidSplits).reduce((s, a) => s + a, 0).toFixed(2)}
                    </p>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* Bottom cancel */}
          <div className="border-t p-4">
            <button
              onClick={onCancel}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-2 transition-colors"
            >
              Cancelar e voltar à comanda
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
