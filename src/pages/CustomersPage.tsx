import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { Search, UserPlus, Pencil, Trash2, Phone, Cake, User as UserIcon, Loader2, Crown, DollarSign, CalendarIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  birthday: string | null;
  notes: string | null;
  visit_count: number;
  last_visit_at: string | null;
  created_at: string;
  is_vip: boolean;
}

const PAGE_SIZE = 50;

const customerSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(100),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  birthday: z.string().optional().or(z.literal("")),
  is_vip: z.boolean().optional(),
});

function formatDate(d: string | null) {
  if (!d) return "—";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  try { return new Date(d).toLocaleDateString("pt-BR"); } catch { return "—"; }
}

function formatRelative(d: string | null) {
  if (!d) return "Nunca";
  const diff = Date.now() - new Date(d).getTime();
  const day = 1000 * 60 * 60 * 24;
  const days = Math.floor(diff / day);
  if (days <= 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 30) return `${days}d atrás`;
  if (days < 365) return `${Math.floor(days / 30)}mês atrás`;
  return `${Math.floor(days / 365)}a atrás`;
}

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type PeriodKey = "all" | "today" | "7d" | "30d" | "this_month" | "last_month" | "custom";

function periodRange(period: PeriodKey, customStart?: Date, customEnd?: Date): { start: Date | null; end: Date | null } {
  const now = new Date();
  const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
  switch (period) {
    case "all": return { start: null, end: null };
    case "today": return { start: startOfDay(now), end: endOfDay(now) };
    case "7d": {
      const s = startOfDay(now); s.setDate(s.getDate() - 6);
      return { start: s, end: endOfDay(now) };
    }
    case "30d": {
      const s = startOfDay(now); s.setDate(s.getDate() - 29);
      return { start: s, end: endOfDay(now) };
    }
    case "this_month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: s, end: endOfDay(now) };
    }
    case "last_month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start: s, end: e };
    }
    case "custom": {
      return {
        start: customStart ? startOfDay(customStart) : null,
        end: customEnd ? endOfDay(customEnd) : null,
      };
    }
  }
}

const PERIOD_LABELS: Record<PeriodKey, string> = {
  all: "Total (desde o início)",
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  this_month: "Este mês",
  last_month: "Mês passado",
  custom: "Período personalizado",
};

export default function CustomersPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [vipOnly, setVipOnly] = useState(false);
  const [period, setPeriod] = useState<PeriodKey>(() => {
    try { return (localStorage.getItem("customers_revenue_period") as PeriodKey) || "all"; } catch { return "all"; }
  });
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();

  useEffect(() => {
    try { localStorage.setItem("customers_revenue_period", period); } catch {}
  }, [period]);

  const range = useMemo(() => periodRange(period, customStart, customEnd), [period, customStart, customEnd]);
  const rangeKey = `${range.start?.toISOString() ?? "-"}_${range.end?.toISOString() ?? "-"}`;

  const [editing, setEditing] = useState<Customer | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [notes, setNotes] = useState("");
  const [isVip, setIsVip] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(query.trim()); setPage(0); }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data, isLoading } = useQuery({
    queryKey: ["customers_list", debounced, page, vipOnly],
    queryFn: async () => {
      let q = supabase
        .from("customers" as any)
        .select("id, name, phone, birthday, notes, visit_count, last_visit_at, created_at, is_vip", { count: "exact" })
        .order("name", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (debounced) q = q.or(`name.ilike.%${debounced}%,phone.ilike.%${debounced}%`);
      if (vipOnly) q = q.eq("is_vip", true);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: ((data ?? []) as unknown) as Customer[], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // Per-customer revenue for current page
  const { data: revenueMap = {} } = useQuery({
    queryKey: ["customer_revenue", rangeKey, pageIds],
    enabled: pageIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_customers_revenue", {
        p_customer_ids: pageIds,
        p_start: range.start?.toISOString() ?? null,
        p_end: range.end ? new Date(range.end.getTime() + 1).toISOString() : null,
      });
      if (error) throw error;
      const map: Record<string, { total: number; count: number }> = {};
      for (const row of (data ?? []) as any[]) {
        map[row.customer_id] = { total: Number(row.total_revenue) || 0, count: Number(row.payment_count) || 0 };
      }
      return map;
    },
  });

  // Tenant-wide summary
  const { data: summary } = useQuery({
    queryKey: ["customer_revenue_summary", rangeKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_customers_revenue_summary", {
        p_start: range.start?.toISOString() ?? null,
        p_end: range.end ? new Date(range.end.getTime() + 1).toISOString() : null,
      });
      if (error) throw error;
      const row = (data ?? [])[0] ?? {};
      return {
        total: Number(row.total_revenue) || 0,
        customers: Number(row.customers_count) || 0,
        payments: Number(row.payments_count) || 0,
      };
    },
  });

  function openCreate() {
    setEditing(null); setName(""); setPhone(""); setBirthday(""); setNotes(""); setIsVip(false); setDialogOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c); setName(c.name ?? ""); setPhone(c.phone ?? ""); setBirthday(c.birthday ?? "");
    setNotes(c.notes ?? ""); setIsVip(!!c.is_vip); setDialogOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsed = customerSchema.safeParse({ name, phone, notes, birthday, is_vip: isVip });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      const payload: any = {
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        notes: parsed.data.notes || null,
        birthday: parsed.data.birthday || null,
        is_vip: !!isVip,
      };
      if (editing) {
        const { error } = await supabase.from("customers" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Cliente atualizado" : "Cliente cadastrado");
      qc.invalidateQueries({ queryKey: ["customers_list"] });
      qc.invalidateQueries({ queryKey: ["customers_search"] });
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cliente excluído");
      qc.invalidateQueries({ queryKey: ["customers_list"] });
      qc.invalidateQueries({ queryKey: ["customers_search"] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir"),
  });

  const empty = !isLoading && rows.length === 0;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-6xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "cliente cadastrado" : "clientes cadastrados"}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <UserPlus className="h-4 w-4" /> Novo Cliente
        </Button>
      </div>

      {/* Revenue summary + period filter */}
      <div className="mb-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 md:p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-amber-500/15 p-2">
              <DollarSign className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">
                Faturamento — {PERIOD_LABELS[period]}
              </p>
              <p className="text-xl md:text-2xl font-bold tabular-nums">
                {formatBRL(summary?.total ?? 0)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {summary?.customers ?? 0} {(summary?.customers ?? 0) === 1 ? "cliente pagante" : "clientes pagantes"} · {summary?.payments ?? 0} pagamentos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Total (desde o início)</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="this_month">Este mês</SelectItem>
                <SelectItem value="last_month">Mês passado</SelectItem>
                <SelectItem value="custom">Período personalizado</SelectItem>
              </SelectContent>
            </Select>
            {period === "custom" && (
              <div className="flex items-center gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("gap-1", !customStart && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {customStart ? format(customStart, "dd/MM/yy") : "Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={customStart} onSelect={setCustomStart} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("gap-1", !customEnd && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {customEnd ? format(customEnd, "dd/MM/yy") : "Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} locale={ptBR} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="pl-9"
          />
        </div>
        <Button
          type="button"
          variant={vipOnly ? "default" : "outline"}
          onClick={() => { setVipOnly((v) => !v); setPage(0); }}
          className={`gap-2 flex-shrink-0 ${vipOnly ? "bg-amber-500 hover:bg-amber-500/90 text-amber-950 border-amber-500" : ""}`}
          title="Filtrar apenas clientes VIP"
        >
          <Crown className={`h-4 w-4 ${vipOnly ? "" : "text-amber-500"}`} />
          <span className="hidden sm:inline">{vipOnly ? "VIPs" : "Apenas VIPs"}</span>
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {empty && (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <UserIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            {debounced ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}
          </p>
        </div>
      )}

      {!isLoading && rows.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border rounded-lg">
            <ScrollArea className="h-[calc(100vh-360px)]">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-4 py-3">Nome</th>
                    <th className="text-left px-4 py-3">Telefone</th>
                    <th className="text-left px-4 py-3">Aniversário</th>
                    <th className="text-right px-4 py-3">Visitas</th>
                    <th className="text-right px-4 py-3">Faturamento</th>
                    <th className="text-left px-4 py-3">Última visita</th>
                    <th className="text-right px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const rev = revenueMap[c.id];
                    const value = rev?.total ?? 0;
                    return (
                      <tr key={c.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">
                          <span className="inline-flex items-center gap-2">
                            {c.name}
                            {c.is_vip && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                                <Crown className="h-3 w-3" /> VIP
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{c.phone || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(c.birthday)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.visit_count}</td>
                        <td className={cn(
                          "px-4 py-3 text-right tabular-nums font-medium",
                          value > 0 ? (c.is_vip ? "text-amber-600 dark:text-amber-400" : "text-foreground") : "text-muted-foreground"
                        )}>
                          {value > 0 ? formatBRL(value) : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatRelative(c.last_visit_at)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(c)} title="Editar">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteTarget(c)}
                              title="Excluir"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {rows.map((c) => {
              const rev = revenueMap[c.id];
              const value = rev?.total ?? 0;
              return (
                <div key={c.id} className="border rounded-lg p-3 bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate inline-flex items-center gap-2">
                        {c.name}
                        {c.is_vip && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase">
                            <Crown className="h-3 w-3" /> VIP
                          </span>
                        )}
                      </p>
                      {c.phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" /> {c.phone}
                        </p>
                      )}
                      {c.birthday && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Cake className="h-3 w-3" /> {formatDate(c.birthday)}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {c.visit_count}× visitas · {formatRelative(c.last_visit_at)}
                      </p>
                      {value > 0 && (
                        <p className={cn(
                          "text-xs font-semibold mt-1 inline-flex items-center gap-1",
                          c.is_vip ? "text-amber-600 dark:text-amber-400" : ""
                        )}>
                          <DollarSign className="h-3 w-3" /> {formatBRL(value)} no período
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(c)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-muted-foreground">
                Página {page + 1} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          )}
        </>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>
              {editing ? "Atualize os dados do cliente." : "Cadastre um novo cliente."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cust-name">Nome *</Label>
              <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cust-phone">WhatsApp / Telefone</Label>
              <Input id="cust-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cust-bday">Aniversário</Label>
              <Input id="cust-bday" type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cust-notes">Observações</Label>
              <Textarea id="cust-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} />
            </div>
            <label
              htmlFor="cust-vip"
              className="flex items-start gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 cursor-pointer hover:bg-amber-500/10 transition-colors"
            >
              <Checkbox
                id="cust-vip"
                checked={isVip}
                onCheckedChange={(v) => setIsVip(!!v)}
                className="mt-0.5 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Crown className="h-4 w-4 text-amber-500" />
                  Cliente VIP (mensalista)
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Comandas deste cliente ficarão destacadas em <span className="text-amber-600 dark:text-amber-400 font-semibold">amarelo</span> no mapa, indicando que paga periodicamente.
                </p>
              </div>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Comandas anteriores manterão o nome registrado, mas o vínculo com este cadastro será removido.
              <br />
              <strong className="text-foreground">{deleteTarget?.name}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
