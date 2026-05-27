import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, User, Phone, X, Crown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { toast } from "sonner";

export interface PickedCustomer {
  id: string | null;
  name: string;
  phone?: string | null;
}

interface Props {
  onSelect: (customer: PickedCustomer) => void;
  onSkip: () => void;
}

const customerSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(100),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  birthday: z.string().optional().or(z.literal("")),
});

export default function CustomerPicker({ onSelect, onSkip }: Props) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [creating, setCreating] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [birthday, setBirthday] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results = [], isLoading } = useQuery({
    queryKey: ["customers_search", debounced],
    queryFn: async () => {
      let q = supabase.from("customers" as any).select("id, name, phone, visit_count, last_visit_at, is_vip").order("last_visit_at", { ascending: false, nullsFirst: false }).limit(15);
      if (debounced) {
        q = q.or(`name.ilike.%${debounced}%,phone.ilike.%${debounced}%`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown) as Array<{ id: string; name: string; phone: string | null; visit_count: number; last_visit_at: string | null }>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const parsed = customerSchema.safeParse({ name, phone, notes, birthday });
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        throw new Error(first?.message ?? "Dados inválidos");
      }
      const payload: any = {
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        notes: parsed.data.notes || null,
        birthday: parsed.data.birthday || null,
      };
      const { data, error } = await supabase.from("customers" as any).insert(payload).select("id, name, phone").single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: (created) => {
      toast.success("Cliente cadastrado");
      qc.invalidateQueries({ queryKey: ["customers_search"] });
      onSelect({ id: created.id, name: created.name, phone: created.phone });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao cadastrar"),
  });

  const showCreateInline = useMemo(
    () => debounced.length > 0 && !results.some((r) => r.name.toLowerCase() === debounced.toLowerCase()),
    [debounced, results]
  );

  if (creating) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Novo cliente</h3>
          <button onClick={() => setCreating(false)} className="text-xs text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome *"
            maxLength={100}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="WhatsApp / telefone (opcional)"
            maxLength={20}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            placeholder="Aniversário"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observações (opcional)"
            maxLength={500}
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCreating(false)}
            className="flex-1 rounded-md border py-2 text-sm font-medium hover:bg-secondary"
          >
            Voltar
          </button>
          <button
            disabled={!name.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
            className="flex-1 rounded-md bg-accent text-accent-foreground py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {createMutation.isPending ? "Salvando..." : "Cadastrar e abrir"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente por nome ou telefone..."
          className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="max-h-64 overflow-y-auto space-y-1 -mx-1 px-1">
        {isLoading && <p className="text-xs text-muted-foreground py-2">Buscando...</p>}
        {!isLoading && results.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            {debounced ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}
          </p>
        )}
        {results.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect({ id: c.id, name: c.name, phone: c.phone })}
            className="w-full flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-left hover:bg-secondary transition-colors"
          >
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate flex items-center gap-1.5">
                {c.name}
                {(c as any).is_vip && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-yellow-400 text-yellow-900 px-1.5 py-0.5">
                    <Crown className="h-2.5 w-2.5" />
                    <span className="text-[8px] font-bold uppercase leading-none">VIP</span>
                  </span>
                )}
              </p>
              {c.phone && (
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {c.phone}
                </p>
              )}
            </div>
            {c.visit_count > 0 && (
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {c.visit_count}× visitas
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-1 border-t">
        <button
          onClick={() => {
            setName(debounced);
            setCreating(true);
          }}
          className="w-full flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm font-medium hover:bg-secondary"
        >
          <UserPlus className="h-4 w-4" />
          {showCreateInline ? `Cadastrar "${debounced}"` : "Cadastrar novo cliente"}
        </button>
        <button
          onClick={onSkip}
          className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
        >
          Pular — abrir como cliente avulso
        </button>
      </div>
    </div>
  );
}
