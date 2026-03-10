import { useState } from "react";
import { Users, User, StickyNote, Plus, Minus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TableOpenDialogProps {
  open: boolean;
  tableName: string;
  onConfirm: (data: { customerName: string; guests: number; notes: string }) => void;
  onCancel: () => void;
  isPending?: boolean;
}

export default function TableOpenDialog({
  open,
  tableName,
  onConfirm,
  onCancel,
  isPending,
}: TableOpenDialogProps) {
  const [customerName, setCustomerName] = useState("");
  const [guests, setGuests] = useState(1);
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    onConfirm({ customerName: customerName.trim(), guests, notes: notes.trim() });
    setCustomerName("");
    setGuests(1);
    setNotes("");
  };

  const handleCancel = () => {
    setCustomerName("");
    setGuests(1);
    setNotes("");
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleCancel(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            Abrir {tableName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Customer name */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
              <User className="h-3.5 w-3.5" />
              Nome do cliente
              <span className="text-xs font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ex: João Silva"
              autoFocus
              className="w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Number of guests */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
              <Users className="h-3.5 w-3.5" />
              Número de pessoas
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setGuests(Math.max(1, guests - 1))}
                className="rounded-md border p-2 hover:bg-secondary transition-colors active:scale-95"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="text-2xl font-semibold w-12 text-center">{guests}</span>
              <button
                onClick={() => setGuests(Math.min(30, guests + 1))}
                className="rounded-md border p-2 hover:bg-secondary transition-colors active:scale-95"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground mb-1.5">
              <StickyNote className="h-3.5 w-3.5" />
              Observações
              <span className="text-xs font-normal">(opcional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: aniversário, alergia, preferência..."
              rows={2}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>

        {/* Actions */}
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
            {isPending ? "Abrindo..." : "Abrir Mesa"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
