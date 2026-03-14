import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  DoorOpen,
  DoorClosed,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  Banknote,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

/* ────────── types ────────── */
interface CashSession {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  closing_amount: number | null;
  opened_by_name: string;
  closed_by_name: string | null;
  notes: string | null;
  status: string;
}

interface CashMovement {
  id: string;
  session_id: string;
  type: string;
  amount: number;
  description: string;
  created_by_name: string;
  created_at: string;
}

/* ────────── helpers ────────── */
function formatCurrency(v: number) {
  return `R$ ${v.toFixed(2).replace(".", ",")}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const typeLabels: Record<string, string> = {
  opening: "Abertura",
  sale: "Venda Dinheiro",
  withdraw: "Sangria",
  supply: "Suprimento",
};

const typeIcons: Record<string, typeof Banknote> = {
  opening: DoorOpen,
  sale: Banknote,
  withdraw: ArrowUpCircle,
  supply: ArrowDownCircle,
};

/* ────────── component ────────── */
export default function CashRegisterPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const userName = profile?.full_name || "Operador";

  const [openDialog, setOpenDialog] = useState<
    null | "open" | "close" | "withdraw" | "supply"
  >(null);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  /* ── queries ── */
  const { data: activeSession } = useQuery<CashSession | null>({
    queryKey: ["cash_session_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_register_sessions")
        .select("*")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as CashSession | null;
    },
  });

  const { data: movements = [] } = useQuery<CashMovement[]>({
    queryKey: ["cash_movements", activeSession?.id],
    enabled: !!activeSession,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("*")
        .eq("session_id", activeSession!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CashMovement[];
    },
  });

  const { data: recentSessions = [] } = useQuery<CashSession[]>({
    queryKey: ["cash_sessions_recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_register_sessions")
        .select("*")
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as CashSession[];
    },
  });

  /* ── computed ── */
  const cashBalance = movements.reduce((sum, m) => {
    if (m.type === "withdraw") return sum - m.amount;
    return sum + m.amount;
  }, 0);

  /* ── mutations ── */
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["cash_session_active"] });
    qc.invalidateQueries({ queryKey: ["cash_movements"] });
    qc.invalidateQueries({ queryKey: ["cash_sessions_recent"] });
  };

  const openMutation = useMutation({
    mutationFn: async (openingAmount: number) => {
      const { data, error } = await supabase
        .from("cash_register_sessions")
        .insert({ opening_amount: openingAmount, opened_by_name: userName })
        .select()
        .single();
      if (error) throw error;
      // Insert opening movement
      await supabase.from("cash_movements").insert({
        session_id: data.id,
        type: "opening",
        amount: openingAmount,
        description: "Abertura de caixa",
        created_by_name: userName,
      });
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Caixa aberto!");
      resetDialog();
    },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });

  const closeMutation = useMutation({
    mutationFn: async (closingAmount: number) => {
      await supabase
        .from("cash_register_sessions")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closing_amount: closingAmount,
          closed_by_name: userName,
          notes: description || null,
        })
        .eq("id", activeSession!.id);
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Caixa fechado!");
      resetDialog();
    },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });

  const movementMutation = useMutation({
    mutationFn: async ({
      type,
      amt,
      desc,
    }: {
      type: string;
      amt: number;
      desc: string;
    }) => {
      await supabase.from("cash_movements").insert({
        session_id: activeSession!.id,
        type,
        amount: amt,
        description: desc,
        created_by_name: userName,
      });
    },
    onSuccess: () => {
      invalidateAll();
      toast.success("Movimento registrado!");
      resetDialog();
    },
    onError: (e) => toast.error("Erro: " + (e as Error).message),
  });

  /* ── helpers ── */
  const resetDialog = () => {
    setOpenDialog(null);
    setAmount("");
    setDescription("");
  };

  const parsedAmount = Number(amount.replace(",", ".")) || 0;

  const handleConfirm = () => {
    if (openDialog === "open") openMutation.mutate(parsedAmount);
    else if (openDialog === "close") closeMutation.mutate(parsedAmount);
    else if (openDialog === "withdraw")
      movementMutation.mutate({
        type: "withdraw",
        amt: parsedAmount,
        desc: description || "Sangria",
      });
    else if (openDialog === "supply")
      movementMutation.mutate({
        type: "supply",
        amt: parsedAmount,
        desc: description || "Suprimento",
      });
  };

  const dialogTitles: Record<string, string> = {
    open: "Abrir Caixa",
    close: "Fechar Caixa",
    withdraw: "Registrar Sangria",
    supply: "Registrar Suprimento",
  };

  const isPending =
    openMutation.isPending ||
    closeMutation.isPending ||
    movementMutation.isPending;

  /* ── difference on close ── */
  const closeDiff =
    openDialog === "close" ? parsedAmount - cashBalance : 0;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-display font-bold">Controle de Caixa</h1>

      {/* ── Status card ── */}
      {activeSession ? (
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
              <span className="font-semibold text-lg">Caixa Aberto</span>
            </div>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDateTime(activeSession.opened_at)} — {activeSession.opened_by_name}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Abertura"
              value={formatCurrency(Number(activeSession.opening_amount))}
            />
            <StatCard label="Saldo Atual" value={formatCurrency(cashBalance)} highlight />
            <StatCard
              label="Entradas"
              value={formatCurrency(
                movements
                  .filter((m) => m.type !== "withdraw")
                  .reduce((s, m) => s + m.amount, 0)
              )}
            />
            <StatCard
              label="Sangrias"
              value={formatCurrency(
                movements
                  .filter((m) => m.type === "withdraw")
                  .reduce((s, m) => s + m.amount, 0)
              )}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setOpenDialog("supply")}
              className="gap-1.5"
            >
              <ArrowDownCircle className="h-4 w-4" />
              Suprimento
            </Button>
            <Button
              variant="outline"
              onClick={() => setOpenDialog("withdraw")}
              className="gap-1.5"
            >
              <ArrowUpCircle className="h-4 w-4" />
              Sangria
            </Button>
            <Button
              variant="destructive"
              onClick={() => setOpenDialog("close")}
              className="gap-1.5 ml-auto"
            >
              <DoorClosed className="h-4 w-4" />
              Fechar Caixa
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-8 flex flex-col items-center gap-4">
          <DoorClosed className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">Nenhum caixa aberto no momento</p>
          <Button onClick={() => setOpenDialog("open")} className="gap-1.5" size="lg">
            <DoorOpen className="h-5 w-5" />
            Abrir Caixa
          </Button>
        </div>
      )}

      {/* ── Movements list ── */}
      {activeSession && movements.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-lg">Movimentos da Sessão</h2>
          <div className="rounded-xl border bg-card divide-y">
            {movements.map((m) => {
              const Icon = typeIcons[m.type] || Banknote;
              const isNeg = m.type === "withdraw";
              return (
                <div key={m.id} className="flex items-center gap-3 p-3">
                  <Icon className={`h-4 w-4 ${isNeg ? "text-destructive" : "text-green-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {typeLabels[m.type] || m.type}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.description} — {m.created_by_name}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${isNeg ? "text-destructive" : "text-green-500"}`}
                  >
                    {isNeg ? "−" : "+"} {formatCurrency(m.amount)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(m.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Recent closed sessions ── */}
      {recentSessions.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold text-lg">Sessões Anteriores</h2>
          <div className="rounded-xl border bg-card divide-y">
            {recentSessions.map((s) => {
              const diff =
                s.closing_amount != null
                  ? Number(s.closing_amount) -
                    Number(s.opening_amount)
                  : null;
              return (
                <div key={s.id} className="flex items-center gap-3 p-3">
                  <DoorClosed className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">
                      {s.opened_by_name}
                      {s.closed_by_name && s.closed_by_name !== s.opened_by_name
                        ? ` → ${s.closed_by_name}`
                        : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(s.opened_at)}
                      {s.closed_at ? ` — ${formatDateTime(s.closed_at)}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      Abertura: {formatCurrency(Number(s.opening_amount))}
                    </p>
                    {s.closing_amount != null && (
                      <p className="text-xs text-muted-foreground">
                        Fechamento: {formatCurrency(Number(s.closing_amount))}
                      </p>
                    )}
                  </div>
                  {s.notes && (
                    <p className="text-xs text-muted-foreground italic max-w-[120px] truncate">
                      {s.notes}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Dialog ── */}
      <Dialog open={!!openDialog} onOpenChange={(v) => !v && resetDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{openDialog && dialogTitles[openDialog]}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>
                {openDialog === "close" ? "Valor em caixa (contado)" : "Valor (R$)"}
              </Label>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  const cents = parseInt(digits, 10) || 0;
                  setAmount((cents / 100).toFixed(2).replace(".", ","));
                }}
                autoFocus
              />
            </div>

            {openDialog === "close" && parsedAmount > 0 && (
              <div className="rounded-md border bg-secondary/50 p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Saldo esperado</span>
                  <span>{formatCurrency(cashBalance)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Contado</span>
                  <span>{formatCurrency(parsedAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-semibold">
                  <span>Diferença</span>
                  <span
                    className={
                      closeDiff === 0
                        ? ""
                        : closeDiff > 0
                          ? "text-green-500"
                          : "text-destructive"
                    }
                  >
                    {closeDiff > 0 ? "+" : ""}
                    {formatCurrency(closeDiff)}
                  </span>
                </div>
              </div>
            )}

            {(openDialog === "withdraw" ||
              openDialog === "supply" ||
              openDialog === "close") && (
              <div className="space-y-2">
                <Label>Observação</Label>
                <Input
                  placeholder="Motivo (opcional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={resetDialog}>
              Cancelar
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={parsedAmount <= 0 || isPending}
            >
              {isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── small stat card ── */
function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${highlight ? "bg-accent/10 border-accent" : "bg-background"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold ${highlight ? "text-accent" : ""}`}>{value}</p>
    </div>
  );
}
