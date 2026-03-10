import { useState, useMemo } from "react";
import {
  CreditCard, Banknote, Smartphone, ArrowLeft,
  Check, Minus, Plus, Percent, DollarSign, X, Trash2, Users, Hash, Coins, ListChecks,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

  // ── Payments ──
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [customAmount, setCustomAmount] = useState("");
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [cashReceived, setCashReceived] = useState("");

  // ── Split modal ──
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitTab, setSplitTab] = useState<"quantity" | "value">("quantity");
  const [splitPeople, setSplitPeople] = useState(2);
  const [splitCustomValue, setSplitCustomValue] = useState("");

  // ── Calculations ──
  const discount = useMemo(
    () => (discountType === "percent" ? total * (discountValue / 100) : discountValue),
    [total, discountType, discountValue]
  );
  const serviceFee = serviceFeeEnabled ? (total - discount) * (serviceFeePct / 100) : 0;
  const grandTotal = Math.max(0, total - discount + extraCharge + serviceFee);
  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, Number((grandTotal - paidTotal).toFixed(2)));

  // ── Cash change ──
  const paymentAmount = customAmount ? Number(customAmount) : remaining;
  const cashReceivedNum = Number(cashReceived) || 0;
  const cashChange = selectedMethod === "cash" && cashReceivedNum > paymentAmount
    ? Number((cashReceivedNum - paymentAmount).toFixed(2))
    : 0;

  // ── Split computed values ──
  const splitPerPerson = splitTab === "quantity" ? Number((remaining / splitPeople).toFixed(2)) : 0;
  const splitValue = splitTab === "value" ? Math.min(Number(splitCustomValue) || 0, remaining) : splitPerPerson;

  const addPayment = (method: string, amount?: number) => {
    const amt = amount ?? remaining;
    if (amt <= 0) return;
    const finalAmt = Math.min(amt, remaining);
    setPayments((prev) => [...prev, { method, amount: Number(finalAmt.toFixed(2)) }]);
    setSelectedMethod(null);
    setCashReceived("");
    setCustomAmount("");
  };

  const removePayment = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleFinalize = () => {
    if (remaining > 0.01 && payments.length === 0) return;
    onPay(payments.length > 0 ? payments : []);
  };

  const handleMethodSelect = (method: string) => {
    if (method === "cash") {
      setSelectedMethod("cash");
      setCashReceived("");
    } else {
      const amt = customAmount ? Number(customAmount) : remaining;
      addPayment(method, amt);
    }
  };

  const confirmCashPayment = () => {
    const amt = customAmount ? Number(customAmount) : remaining;
    if (amt <= 0) return;
    addPayment("cash", amt);
  };

  const handleSplitConfirm = (method: string) => {
    if (splitValue <= 0 || splitValue > remaining) return;
    addPayment(method, splitValue);
    if (splitTab === "quantity") {
      const newPaid = paidTotal + splitValue;
      const newRemaining = Math.max(0, Number((grandTotal - newPaid).toFixed(2)));
      if (newRemaining <= 0.01) {
        setSplitOpen(false);
      }
    } else {
      setSplitCustomValue("");
    }
  };

  const openSplitModal = () => {
    setSplitPeople(2);
    setSplitCustomValue("");
    setSplitTab("quantity");
    setSplitOpen(true);
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

          {/* Payment area */}
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
              <p className={`text-2xl font-semibold ${remaining <= 0.01 ? "text-accent" : ""}`}>
                R$ {remaining.toFixed(2)}
              </p>
              {payments.length > 0 && remaining > 0.01 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Pago: R$ {paidTotal.toFixed(2)} de R$ {grandTotal.toFixed(2)}
                </p>
              )}
            </div>

            {remaining > 0.01 && (
              <>
                {/* Cash payment flow */}
                {selectedMethod === "cash" ? (
                  <div className="space-y-3 rounded-md border-2 border-accent/30 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Banknote className="h-4 w-4 text-accent" />
                        <span className="text-sm font-semibold">Pagamento em Dinheiro</span>
                      </div>
                      <button
                        onClick={() => { setSelectedMethod(null); setCashReceived(""); }}
                        className="rounded p-1 hover:bg-secondary"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="text-center text-sm text-muted-foreground">
                      Valor a pagar: <span className="font-semibold text-foreground">R$ {paymentAmount.toFixed(2)}</span>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground">Valor recebido do cliente</label>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        placeholder={paymentAmount.toFixed(2)}
                        autoFocus
                        className="w-full mt-1 rounded-md border bg-background px-3 py-2.5 text-lg text-center font-semibold outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    {/* Change display */}
                    {cashChange > 0 && (
                      <div className="rounded-md bg-accent/10 border border-accent p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <Coins className="h-4 w-4 text-accent" />
                          <span className="text-xs text-accent uppercase tracking-wider font-semibold">Troco</span>
                        </div>
                        <p className="text-2xl font-bold text-accent">R$ {cashChange.toFixed(2)}</p>
                      </div>
                    )}

                    {/* Quick cash values */}
                    <div className="grid grid-cols-4 gap-1.5">
                      {[5, 10, 20, 50, 100, 200].filter(v => v >= paymentAmount).slice(0, 4).map((val) => (
                        <button
                          key={val}
                          onClick={() => setCashReceived(String(val))}
                          className="rounded-md border bg-background py-2 text-xs font-medium hover:bg-secondary transition-colors"
                        >
                          R$ {val}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={confirmCashPayment}
                      disabled={isPending || (cashReceivedNum > 0 && cashReceivedNum < paymentAmount)}
                      className="w-full rounded-md bg-accent text-accent-foreground py-3 font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <Check className="h-5 w-5" />
                      Confirmar Dinheiro
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Custom amount input */}
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
                            onClick={() => handleMethodSelect(method)}
                            className="flex items-center justify-center gap-2 rounded-md border bg-background py-3 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-50"
                          >
                            <Icon className="h-4 w-4" />
                            {methodLabels[method]}
                          </button>
                        );
                      })}
                    </div>

                    {/* Split bill button */}
                    <button
                      onClick={openSplitModal}
                      className="w-full flex items-center justify-center gap-2 rounded-md border-2 border-dashed border-border py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                    >
                      <Users className="h-4 w-4" />
                      Dividir Conta
                    </button>
                  </>
                )}
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

      {/* ── Split Modal ── */}
      <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Dividir Conta
            </DialogTitle>
          </DialogHeader>

          {/* Summary bar */}
          <div className="grid grid-cols-3 gap-3 rounded-md bg-muted p-3">
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
              <p className="text-sm font-semibold">R$ {grandTotal.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Pago</p>
              <p className="text-sm font-semibold text-accent">R$ {paidTotal.toFixed(2)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Restante</p>
              <p className="text-sm font-semibold">R$ {remaining.toFixed(2)}</p>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setSplitTab("quantity")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
                splitTab === "quantity" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"
              }`}
            >
              <Hash className="h-4 w-4" />
              Por Quantidade
            </button>
            <button
              onClick={() => setSplitTab("value")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
                splitTab === "value" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"
              }`}
            >
              <DollarSign className="h-4 w-4" />
              Por Valor
            </button>
          </div>

          {/* Tab content */}
          {splitTab === "quantity" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Número de pessoas</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSplitPeople(Math.max(2, splitPeople - 1))}
                    className="rounded-md border p-1.5 hover:bg-secondary transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-lg font-semibold w-8 text-center">{splitPeople}</span>
                  <button
                    onClick={() => setSplitPeople(Math.min(20, splitPeople + 1))}
                    className="rounded-md border p-1.5 hover:bg-secondary transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="rounded-md bg-muted p-4 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Valor por pessoa</p>
                <p className="text-2xl font-semibold">R$ {splitPerPerson.toFixed(2)}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Valor desta parcela</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={remaining}
                  value={splitCustomValue}
                  onChange={(e) => setSplitCustomValue(e.target.value)}
                  placeholder={remaining.toFixed(2)}
                  className="w-full mt-1 rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
              </div>
              {Number(splitCustomValue) > 0 && Number(splitCustomValue) <= remaining && (
                <div className="text-xs text-muted-foreground text-center">
                  Após esta parcela, restará: R$ {(remaining - Number(splitCustomValue)).toFixed(2)}
                </div>
              )}
            </div>
          )}

          {/* Payment method buttons inside modal */}
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Forma de pagamento</p>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((method) => {
                const Icon = methodIcons[method];
                const disabled = isPending || splitValue <= 0 || splitValue > remaining;
                return (
                  <button
                    key={method}
                    disabled={disabled}
                    onClick={() => handleSplitConfirm(method)}
                    className="flex items-center justify-center gap-2 rounded-md border bg-background py-3 text-sm font-medium hover:bg-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Icon className="h-4 w-4" />
                    {methodLabels[method]}
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
