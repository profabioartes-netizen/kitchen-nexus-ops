import { useEffect, useState } from "react";
import { Hash, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import CustomerPicker, { PickedCustomer } from "./CustomerPicker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: { number: string; customer: PickedCustomer | null }) => void;
  isPending?: boolean;
}

export default function NewComandaDialog({ open, onOpenChange, onConfirm, isPending }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [number, setNumber] = useState("");

  useEffect(() => {
    if (open) {
      setStep(1);
      setNumber("");
    }
  }, [open]);

  const goNext = () => {
    if (!number.trim()) return;
    setStep(2);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isPending) onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? "Nova Comanda" : `Comanda nº ${number} — Cliente`}
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4 pt-1">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
                <Hash className="h-3.5 w-3.5" />
                Número da comanda
              </label>
              <input
                autoFocus
                inputMode="numeric"
                value={number}
                onChange={(e) => setNumber(e.target.value.replace(/[^\w-]/g, "").slice(0, 10))}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); goNext(); } }}
                placeholder="Ex: 12"
                className="w-full rounded-md border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Será aberta na próxima mesa livre disponível.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onOpenChange(false)}
                className="flex-1 rounded-md border py-2.5 text-sm font-medium hover:bg-secondary"
              >
                Cancelar
              </button>
              <button
                disabled={!number.trim()}
                onClick={goNext}
                className="flex-1 rounded-md bg-accent text-accent-foreground py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
              >
                Avançar <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <CustomerPicker
            onSelect={(c) => onConfirm({ number: number.trim(), customer: c })}
            onSkip={() => onConfirm({ number: number.trim(), customer: null })}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
