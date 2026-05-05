import { useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TableOpenDialogProps {
  open: boolean;
  /** Mantido por compatibilidade; não exibido na UI simplificada. */
  tableName?: string;
  onConfirm: (data: { customerName: string; guests: number; notes: string; location: string }) => void;
  onCancel: () => void;
  isPending?: boolean;
}

export default function TableOpenDialog({
  open,
  onConfirm,
  onCancel,
  isPending,
}: TableOpenDialogProps) {
  const [customerName, setCustomerName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCustomerName("");
      // Foco imediato para fluxo rápido
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleConfirm = () => {
    if (isPending) return;
    onConfirm({
      customerName: customerName.trim(),
      // Defaults internos para compatibilidade com o restante do sistema
      guests: 1,
      notes: "",
      location: "",
    });
    setCustomerName("");
  };

  const handleCancel = () => {
    setCustomerName("");
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg">Abrir Comanda</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
              <User className="h-3.5 w-3.5" />
              Nome do cliente
              <span className="text-xs font-normal">(opcional)</span>
            </label>
            <input
              ref={inputRef}
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              placeholder="Ex: João Silva"
              className="w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Pressione Enter para abrir rapidamente.
            </p>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleCancel}
            className="flex-1 rounded-md border py-3 text-sm font-medium hover:bg-secondary transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending}
            className="flex-1 rounded-md bg-accent text-accent-foreground py-3 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? "Abrindo..." : "Abrir Comanda"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
