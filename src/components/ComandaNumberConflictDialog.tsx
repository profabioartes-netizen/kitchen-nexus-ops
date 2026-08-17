import { AlertTriangle, ArrowRight, Hash } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  number: string;
  customerName?: string | null;
  onViewOrder: () => void;
  onChooseAnother: () => void;
}

export default function ComandaNumberConflictDialog({
  open,
  number,
  customerName,
  onViewOrder,
  onChooseAnother,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onChooseAnother(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-destructive/10 p-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <DialogTitle className="text-base">
              Comanda {number} já está em uso
            </DialogTitle>
          </div>
          <DialogDescription className="pt-1">
            {customerName
              ? `Este número já possui uma comanda aberta para ${customerName}.`
              : "Este número já possui uma comanda aberta."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          <Hash className="h-3.5 w-3.5 shrink-0" />
          O número volta a ficar livre quando a comanda for finalizada ou cancelada.
        </div>

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row">
          <button
            onClick={onChooseAnother}
            className="flex-1 rounded-md border py-2.5 text-sm font-medium hover:bg-secondary transition-colors"
          >
            Escolher outro número
          </button>
          <button
            onClick={onViewOrder}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-accent text-accent-foreground py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Ver comanda <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
