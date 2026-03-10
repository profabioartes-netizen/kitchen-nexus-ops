import { useState } from "react";
import {
  CreditCard, Banknote, Smartphone, Users, SplitSquareHorizontal, ArrowLeft, Check, Minus, Plus,
} from "lucide-react";

type OrderItem = {
  id: string;
  product_name: string;
  price: number;
  quantity: number;
};

type SplitMode = "none" | "people" | "items";

type SplitPayment = {
  label: string;
  amount: number;
  paid: boolean;
  method?: string;
  itemIds?: string[]; // for item-based split
};

interface PaymentPanelProps {
  total: number;
  orderItems: OrderItem[];
  serviceFeeEnabled: boolean;
  onToggleServiceFee: (enabled: boolean) => void;
  onPay: (payments: { method: string; amount: number }[]) => void;
  onCancel: () => void;
  isPending: boolean;
}

const methodLabels: Record<string, string> = {
  cash: "Dinheiro",
  debit: "Débito",
  credit: "Crédito",
  pix: "Pix",
};

function PaymentMethodButtons({
  onSelect,
  disabled,
}: {
  onSelect: (method: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {[
        { method: "pix", icon: Smartphone, label: "Pix" },
        { method: "debit", icon: CreditCard, label: "Débito" },
        { method: "credit", icon: CreditCard, label: "Crédito" },
        { method: "cash", icon: Banknote, label: "Dinheiro" },
      ].map(({ method, icon: Icon, label }) => (
        <button
          key={method}
          disabled={disabled}
          onClick={() => onSelect(method)}
          className="flex flex-col items-center justify-center gap-0.5 rounded-md border bg-background py-2 text-xs font-medium hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="text-[10px]">{label}</span>
        </button>
      ))}
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
}: PaymentPanelProps) {
  const [splitMode, setSplitMode] = useState<SplitMode>("none");
  const [splitCount, setSplitCount] = useState(2);
  const [splits, setSplits] = useState<SplitPayment[]>([]);
  const [itemAssignment, setItemAssignment] = useState<Record<string, number>>({}); // itemId -> personIndex

  const serviceFee = serviceFeeEnabled ? total * 0.1 : 0;
  const grandTotal = total + serviceFee;

  // ── No split: pay full amount ──
  const handleFullPay = (method: string) => {
    onPay([{ method, amount: grandTotal }]);
  };

  // ── Split by people ──
  const initSplitByPeople = () => {
    setSplitMode("people");
    const perPerson = grandTotal / splitCount;
    setSplits(
      Array.from({ length: splitCount }, (_, i) => ({
        label: `Pessoa ${i + 1}`,
        amount: Number(perPerson.toFixed(2)),
        paid: false,
      }))
    );
  };

  const updatePeopleCount = (count: number) => {
    const c = Math.max(2, Math.min(20, count));
    setSplitCount(c);
    const perPerson = grandTotal / c;
    setSplits(
      Array.from({ length: c }, (_, i) => ({
        label: `Pessoa ${i + 1}`,
        amount: Number(perPerson.toFixed(2)),
        paid: false,
      }))
    );
  };

  // ── Split by items ──
  const initSplitByItems = () => {
    setSplitMode("items");
    setSplitCount(2);
    setItemAssignment({});
    setSplits(
      Array.from({ length: 2 }, (_, i) => ({
        label: `Pessoa ${i + 1}`,
        amount: 0,
        paid: false,
        itemIds: [],
      }))
    );
  };

  const updateItemPersonCount = (count: number) => {
    const c = Math.max(2, Math.min(20, count));
    setSplitCount(c);
    // Keep assignments that are still valid
    const newAssignment: Record<string, number> = {};
    for (const [itemId, personIdx] of Object.entries(itemAssignment)) {
      if (personIdx < c) newAssignment[itemId] = personIdx;
    }
    setItemAssignment(newAssignment);
    recalcItemSplits(c, newAssignment);
  };

  const assignItemToPerson = (itemId: string, personIdx: number) => {
    const newAssignment = { ...itemAssignment };
    if (newAssignment[itemId] === personIdx) {
      delete newAssignment[itemId]; // unassign
    } else {
      newAssignment[itemId] = personIdx;
    }
    setItemAssignment(newAssignment);
    recalcItemSplits(splitCount, newAssignment);
  };

  const recalcItemSplits = (count: number, assignment: Record<string, number>) => {
    const amounts = Array(count).fill(0);
    const itemIds: string[][] = Array.from({ length: count }, () => []);
    for (const item of orderItems) {
      const personIdx = assignment[item.id];
      if (personIdx !== undefined) {
        amounts[personIdx] += Number(item.price) * item.quantity;
        itemIds[personIdx].push(item.id);
      }
    }
    // Add proportional service fee
    const assignedSubtotal = amounts.reduce((s, a) => s + a, 0);
    setSplits(
      Array.from({ length: count }, (_, i) => ({
        label: `Pessoa ${i + 1}`,
        amount: Number((amounts[i] + (serviceFeeEnabled && assignedSubtotal > 0 ? amounts[i] / assignedSubtotal * serviceFee : 0)).toFixed(2)),
        paid: splits[i]?.paid ?? false,
        itemIds: itemIds[i],
      }))
    );
  };

  const paySplit = (index: number, method: string) => {
    const newSplits = [...splits];
    newSplits[index] = { ...newSplits[index], paid: true, method };
    setSplits(newSplits);

    // Check if all splits are paid
    if (newSplits.every((s) => s.paid)) {
      onPay(newSplits.map((s) => ({ method: s.method!, amount: s.amount })));
    }
  };

  const paidTotal = splits.filter((s) => s.paid).reduce((s, sp) => s + sp.amount, 0);
  const allPaid = splits.length > 0 && splits.every((s) => s.paid);

  // ── Choose split mode ──
  if (splitMode === "none") {
    return (
      <div className="space-y-3">
        {/* Breakdown */}
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>R$ {total.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={serviceFeeEnabled}
                onChange={(e) => onToggleServiceFee(e.target.checked)}
                className="rounded border-muted-foreground/30"
              />
              Taxa de serviço (10%)
            </label>
            <span>{serviceFeeEnabled ? `R$ ${serviceFee.toFixed(2)}` : "—"}</span>
          </div>
          <div className="border-t pt-1.5 flex justify-between font-semibold text-base">
            <span>Total</span>
            <span>R$ {grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Split options */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={initSplitByPeople}
            className="flex items-center justify-center gap-1.5 rounded-md border bg-background py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <Users className="h-4 w-4" />
            <span className="text-xs">Dividir por pessoas</span>
          </button>
          <button
            onClick={initSplitByItems}
            className="flex items-center justify-center gap-1.5 rounded-md border bg-background py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
          >
            <SplitSquareHorizontal className="h-4 w-4" />
            <span className="text-xs">Dividir por itens</span>
          </button>
        </div>

        {/* Full payment */}
        <p className="text-xs text-muted-foreground text-center">Pagar valor integral</p>
        <PaymentMethodButtons onSelect={handleFullPay} disabled={isPending} />

        <button
          onClick={onCancel}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
        >
          Cancelar
        </button>
      </div>
    );
  }

  // ── Split by people ──
  if (splitMode === "people") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setSplitMode("none")} className="rounded p-1 hover:bg-secondary">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold flex-1">Dividir por pessoas</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Número de pessoas</span>
          <div className="flex items-center gap-2">
            <button onClick={() => updatePeopleCount(splitCount - 1)} className="rounded border p-1 hover:bg-secondary">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="text-sm font-semibold w-6 text-center">{splitCount}</span>
            <button onClick={() => updatePeopleCount(splitCount + 1)} className="rounded border p-1 hover:bg-secondary">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="text-xs text-muted-foreground flex justify-between">
          <span>Total: R$ {grandTotal.toFixed(2)}</span>
          <span>R$ {(grandTotal / splitCount).toFixed(2)} / pessoa</span>
        </div>

        <div className="space-y-2 max-h-40 overflow-auto">
          {splits.map((split, i) => (
            <div key={i} className={`rounded-md border p-2 ${split.paid ? "bg-muted/50 border-muted" : ""}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">{split.label}</span>
                <span className="text-sm font-semibold">R$ {split.amount.toFixed(2)}</span>
              </div>
              {split.paid ? (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  Pago ({methodLabels[split.method!] ?? split.method})
                </div>
              ) : (
                <PaymentMethodButtons onSelect={(m) => paySplit(i, m)} disabled={isPending} />
              )}
            </div>
          ))}
        </div>

        {paidTotal > 0 && !allPaid && (
          <p className="text-xs text-muted-foreground text-center">
            Pago: R$ {paidTotal.toFixed(2)} — Restante: R$ {(grandTotal - paidTotal).toFixed(2)}
          </p>
        )}

        <button
          onClick={() => setSplitMode("none")}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
        >
          Voltar
        </button>
      </div>
    );
  }

  // ── Split by items ──
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <button onClick={() => setSplitMode("none")} className="rounded p-1 hover:bg-secondary">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold flex-1">Dividir por itens</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Número de pessoas</span>
        <div className="flex items-center gap-2">
          <button onClick={() => updateItemPersonCount(splitCount - 1)} className="rounded border p-1 hover:bg-secondary">
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-semibold w-6 text-center">{splitCount}</span>
          <button onClick={() => updateItemPersonCount(splitCount + 1)} className="rounded border p-1 hover:bg-secondary">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Item assignment */}
      <div className="space-y-1 max-h-32 overflow-auto">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Atribuir itens às pessoas</p>
        {orderItems.map((item) => {
          const assignedTo = itemAssignment[item.id];
          return (
            <div key={item.id} className="flex items-center gap-1.5 text-xs">
              <span className="flex-1 truncate">{item.product_name} ×{item.quantity}</span>
              <div className="flex gap-1">
                {Array.from({ length: splitCount }, (_, pi) => (
                  <button
                    key={pi}
                    onClick={() => assignItemToPerson(item.id, pi)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors ${
                      assignedTo === pi
                        ? "bg-accent text-accent-foreground border-accent"
                        : "hover:bg-secondary border-transparent"
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

      {/* Person totals & payment */}
      <div className="space-y-2 max-h-40 overflow-auto">
        {splits.map((split, i) => (
          <div key={i} className={`rounded-md border p-2 ${split.paid ? "bg-muted/50 border-muted" : ""}`}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium">{split.label}</span>
              <span className="text-sm font-semibold">R$ {split.amount.toFixed(2)}</span>
            </div>
            {split.amount === 0 && !split.paid ? (
              <p className="text-[10px] text-muted-foreground">Nenhum item atribuído</p>
            ) : split.paid ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-green-500" />
                Pago ({methodLabels[split.method!] ?? split.method})
              </div>
            ) : (
              <PaymentMethodButtons onSelect={(m) => paySplit(i, m)} disabled={isPending} />
            )}
          </div>
        ))}
      </div>

      {paidTotal > 0 && !allPaid && (
        <p className="text-xs text-muted-foreground text-center">
          Pago: R$ {paidTotal.toFixed(2)} — Restante: R$ {(grandTotal - paidTotal).toFixed(2)}
        </p>
      )}

      <button
        onClick={() => setSplitMode("none")}
        className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1"
      >
        Voltar
      </button>
    </div>
  );
}
