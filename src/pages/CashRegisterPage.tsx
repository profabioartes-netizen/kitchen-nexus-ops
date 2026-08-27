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
  Receipt,
  CreditCard,
  Smartphone,
  Wallet,
  Undo2,
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
  session_id: string | null;
  type: string;
  amount: number;
  description: string;
  created_by_name: string;
  created_at: string;
  method: string | null;
  source: string | null;
  voided_at: string | null;
  payment_id: string | null;
}

interface SessionSummary {
  session_id: string;
  opening_amount: number;
  cash_sales: number;
  pix: number;
  debit: number;
  credit: number;
  card_legacy: number;
  supplies: number;
  withdrawals: number;
  expenses: number;
  voided_sales: number;
  electronic_total: number;
  total_sales: number;
  expected_cash: number;
}

/* ────────── helpers ────────── */
function formatCurrency(v: number) {
  return `R$ ${Number(v || 0).toFixed(2).replace(".", ",")}`;
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
  sale: "Recebimento",
  withdraw: "Sangria",
  supply: "Suprimento",
  expense: "Despesa/Retirada",
};

const methodLabels: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  debit: "Débito",
  credit: "Crédito",
  card: "Cartão",
};

const typeIcons: Record<string, typeof Banknote> = {
  opening: DoorOpen,
  sale: Receipt,
  withdraw: ArrowUpCircle,
  supply: ArrowDownCircle,
  expense: ArrowUpCircle,
};

const methodIcons: Record<string, typeof Banknote> = {
  cash: Banknote,
  pix: Smartphone,
  debit: CreditCard,
  credit: CreditCard,
  card: CreditCard,
};

const sourceLabels: Record<string, string> = {
  cashier: "Balcão",
  waiter: "Comanda",
  self_service: "Auto-atendimento",
  manual: "Manual",
};

/* ────────── component ────────── */
export default function CashRegisterPage() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const userName = profile?.full_name || "Operador";

  const [openDialog, setOpenDialog] = useState<
    null | "open" | "close" | "withdraw" | "supply" | "expense"
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
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_movements")
        .select("*")
        .eq("session_id", activeSession!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as CashMovement[];
    },
  });

  // Fonte única do fechamento (calculada no servidor)
  const { data: summary } = useQuery<SessionSummary | null>({
    queryKey: ["cash_session_summary", activeSession?.id],
    enabled: !!activeSession,
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cash_session_summary" as any, {
        p_session_id: activeSession!.id,
      });
      if (error) throw error;
      return (data as unknown as SessionSummary) ?? null;
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
  const expectedCash = Number(summary?.expected_cash ?? 0);
  const otherMethods = Number(summary?.card_legacy ?? 0);

  /* ── mutations ── */
  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["cash_session_active"] });
    qc.invalidateQueries({ queryKey: ["cash_movements"] });
    qc.invalidateQueries({ queryKey: ["cash_session_summary"] });
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
      // Movimento informativo de abertura (o saldo de abertura vem da sessão)
      await supabase.from("cash_movements").insert({
        session_id: data.id,
        type: "opening",
        amount: openingAmount,
        method: "cash",
        source: "manual",
        description: "Abertura de caixa",
        created_by_name: userName,
      } as any);
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
        method: "cash",
        source: "manual",
        description: desc,
        created_by_name: userName,
      } as any);
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
    else if (openDialog === "expense")
      movementMutation.mutate({
        type: "expense",
        amt: parsedAmount,
        desc: description || "Despesa/Retirada",
      });
  };

  const dialogTitles: Record<string, string> = {
    open: "Abrir Caixa",
    close: "Fechar Caixa",
    withdraw: "Registrar Sangria",
    supply: "Registrar Suprimento",
    expense: "Registrar Despesa/Retirada",
  };

  const isPending =
    openMutation.isPending ||
    closeMutation.isPending ||
    movementMutation.isPending;

  /* ── difference on close ── */
  const closeDiff = openDialog === "close" ? parsedAmount - expectedCash : 0;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
      <h1 className="text-2xl font-display font-bold">Controle de Caixa</h1>

      {/* ── Status card ── */}
      {activeSession ? (
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5 space-y-5">
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

            {/* ── Dinheiro físico (gaveta) ── */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Banknote className="h-4 w-4 text-green-500" />
                Dinheiro físico na gaveta
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Abertura" value={formatCurrency(Number(activeSession.opening_amount))} />
                <StatCard label="Vendas em dinheiro" value={formatCurrency(Number(summary?.cash_sales ?? 0))} />
                <StatCard label="Suprimentos" value={formatCurrency(Number(summary?.supplies ?? 0))} />
                <StatCard
                  label="Sangrias + Despesas"
                  value={`− ${formatCurrency(Number(summary?.withdrawals ?? 0) + Number(summary?.expenses ?? 0))}`}
                  negative
                />
                <StatCard label="Esperado na gaveta" value={formatCurrency(expectedCash)} highlight />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Abertura + vendas em dinheiro + suprimentos − sangrias − despesas/retiradas.
                Pix e cartão não entram na gaveta.
              </p>
            </section>

            {/* ── Eletrônico ── */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-blue-400" />
                Recebimentos eletrônicos (não estão na gaveta)
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Pix" value={formatCurrency(Number(summary?.pix ?? 0))} />
                <StatCard label="Débito" value={formatCurrency(Number(summary?.debit ?? 0))} />
                <StatCard label="Crédito" value={formatCurrency(Number(summary?.credit ?? 0))} />
                <StatCard label="Outros meios" value={formatCurrency(otherMethods)} />
                <StatCard label="Total eletrônico" value={formatCurrency(Number(summary?.electronic_total ?? 0))} />
              </div>
            </section>

            {/* ── Consolidado ── */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Wallet className="h-4 w-4 text-accent" />
                Consolidado financeiro do período
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="Total vendido/recebido" value={formatCurrency(Number(summary?.total_sales ?? 0))} highlight />
                <StatCard label="Dinheiro" value={formatCurrency(Number(summary?.cash_sales ?? 0))} />
                <StatCard label="Eletrônico" value={formatCurrency(Number(summary?.electronic_total ?? 0))} />
                <StatCard
                  label="Estornos/cancelamentos"
                  value={`− ${formatCurrency(Number(summary?.voided_sales ?? 0))}`}
                  negative
                />
              </div>
            </section>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setOpenDialog("supply")} className="gap-1.5">
                <ArrowDownCircle className="h-4 w-4" />
                Suprimento
              </Button>
              <Button variant="outline" onClick={() => setOpenDialog("withdraw")} className="gap-1.5">
                <ArrowUpCircle className="h-4 w-4" />
                Sangria
              </Button>
              <Button variant="outline" onClick={() => setOpenDialog("expense")} className="gap-1.5">
                <Undo2 className="h-4 w-4" />
                Despesa/Retirada
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
              const Icon =
                m.type === "sale"
                  ? methodIcons[m.method ?? "cash"] || Receipt
                  : typeIcons[m.type] || Banknote;
              const isNeg = m.type === "withdraw" || m.type === "expense";
              const isVoided = !!m.voided_at;
              return (
                <div key={m.id} className={`flex items-center gap-3 p-3 ${isVoided ? "opacity-50" : ""}`}>
                  <Icon className={`h-4 w-4 ${isNeg ? "text-destructive" : "text-green-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {typeLabels[m.type] || m.type}
                      {m.type === "sale" && m.method ? ` · ${methodLabels[m.method] ?? m.method}` : ""}
                      {m.source && m.source !== "manual" ? ` · ${sourceLabels[m.source] ?? m.source}` : ""}
                      {isVoided ? " · ESTORNADO" : ""}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.description} — {m.created_by_name || "Sistema"}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${
                      isVoided ? "line-through" : isNeg ? "text-destructive" : "text-green-500"
                    }`}
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
            {recentSessions.map((s) => (
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
            ))}
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
                {openDialog === "close" ? "Dinheiro contado na gaveta" : "Valor (R$)"}
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

            {openDialog === "close" && (
              <div className="rounded-md border bg-secondary/50 p-3 space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Conferência do dinheiro físico
                </p>
                <Row label="Abertura" value={formatCurrency(Number(activeSession?.opening_amount ?? 0))} />
                <Row label="Vendas em dinheiro" value={formatCurrency(Number(summary?.cash_sales ?? 0))} />
                <Row label="Suprimentos" value={formatCurrency(Number(summary?.supplies ?? 0))} />
                <Row label="Sangrias" value={`− ${formatCurrency(Number(summary?.withdrawals ?? 0))}`} />
                <Row label="Despesas/Retiradas" value={`− ${formatCurrency(Number(summary?.expenses ?? 0))}`} />
                <div className="flex justify-between text-sm font-semibold border-t pt-2">
                  <span>Esperado na gaveta</span>
                  <span>{formatCurrency(expectedCash)}</span>
                </div>
                <Row label="Contado" value={formatCurrency(parsedAmount)} />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Diferença</span>
                  <span
                    className={
                      closeDiff === 0 ? "" : closeDiff > 0 ? "text-green-500" : "text-destructive"
                    }
                  >
                    {closeDiff > 0 ? "+" : ""}
                    {formatCurrency(closeDiff)}
                  </span>
                </div>

                <p className="text-xs font-semibold uppercase text-muted-foreground pt-2 border-t">
                  Eletrônico (fora da gaveta)
                </p>
                <Row label="Pix" value={formatCurrency(Number(summary?.pix ?? 0))} />
                <Row label="Débito" value={formatCurrency(Number(summary?.debit ?? 0))} />
                <Row label="Crédito" value={formatCurrency(Number(summary?.credit ?? 0))} />
                {otherMethods > 0 && <Row label="Outros meios" value={formatCurrency(otherMethods)} />}
                <Row label="Estornos/cancelamentos" value={`− ${formatCurrency(Number(summary?.voided_sales ?? 0))}`} />
                <div className="flex justify-between text-sm font-semibold border-t pt-2">
                  <span>Total recebido no período</span>
                  <span>{formatCurrency(Number(summary?.total_sales ?? 0))}</span>
                </div>
              </div>
            )}

            {(openDialog === "withdraw" ||
              openDialog === "supply" ||
              openDialog === "expense" ||
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
            <Button onClick={handleConfirm} disabled={parsedAmount <= 0 || isPending}>
              {isPending ? "Salvando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── small rows/cards ── */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
  negative,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  negative?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${highlight ? "bg-accent/10 border-accent" : "bg-background"}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-lg font-semibold ${
          highlight ? "text-accent" : negative ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
