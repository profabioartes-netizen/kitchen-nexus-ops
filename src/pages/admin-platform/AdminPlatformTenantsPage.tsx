import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Edit, Pause, Play, Trash2, Eye, X, Store } from "lucide-react";

type Tenant = {
  id: string;
  nome_comercio: string;
  slug: string;
  logo_url: string | null;
  cor_primaria: string | null;
  cor_secundaria: string | null;
  status: "ativo" | "suspenso" | "cancelado";
  plano: string;
  data_expiracao_plano: string | null;
  created_at: string;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export default function AdminPlatformTenantsPage() {
  const [editing, setEditing] = useState<Partial<Tenant> | null>(null);
  const [creatingAdmin, setCreatingAdmin] = useState<{ tenantId: string; tenantName: string } | null>(null);
  const qc = useQueryClient();

  const { data: tenants = [], isLoading } = useQuery({
    queryKey: ["admin-platform-tenants"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Tenant[];
    },
  });

  const { data: counts = {} } = useQuery({
    queryKey: ["admin-platform-tenant-user-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("user_tenants").select("tenant_id");
      const map: Record<string, number> = {};
      (data ?? []).forEach((r) => { map[r.tenant_id] = (map[r.tenant_id] || 0) + 1; });
      return map;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Partial<Tenant>) => {
      const data: any = {
        nome_comercio: payload.nome_comercio,
        slug: payload.slug,
        logo_url: payload.logo_url || null,
        cor_primaria: payload.cor_primaria || "#1E40AF",
        cor_secundaria: payload.cor_secundaria || "#FACC15",
        status: payload.status || "ativo",
        plano: payload.plano || "trial",
        data_expiracao_plano: payload.data_expiracao_plano || null,
      };
      if (payload.id) {
        const { error } = await supabase.from("tenants").update(data).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("tenants").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-platform-tenants"] });
      toast.success("Estabelecimento salvo!");
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Tenant["status"] }) => {
      const { error } = await supabase.from("tenants").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-platform-tenants"] });
      toast.success("Status atualizado!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-platform-tenants"] });
      toast.success("Estabelecimento removido!");
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-full">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold break-words">Estabelecimentos</h1>
          <p className="text-xs md:text-sm text-muted-foreground break-words">
            Gerencie todos os clientes da plataforma HuskyPDV
          </p>
        </div>
        <button
          onClick={() => setEditing({ status: "ativo", plano: "trial", cor_primaria: "#1E40AF", cor_secundaria: "#FACC15" })}
          className="flex items-center justify-center gap-2 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" /> Novo cliente
        </button>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-3">
        {isLoading && (
          <div className="p-6 text-center text-muted-foreground rounded-lg border bg-card">Carregando...</div>
        )}
        {!isLoading && tenants.length === 0 && (
          <div className="p-6 text-center text-muted-foreground rounded-lg border bg-card">Nenhum estabelecimento.</div>
        )}
        {tenants.map((t) => (
          <div key={t.id} className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-start gap-3">
              {t.logo_url
                ? <img src={t.logo_url} alt="" className="h-12 w-12 rounded object-cover flex-shrink-0" />
                : <div className="h-12 w-12 rounded bg-muted flex-shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="font-semibold break-words">{t.nome_comercio}</div>
                <div className="text-xs text-muted-foreground font-mono break-all">{t.slug}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Criado em {new Date(t.created_at).toLocaleDateString("pt-BR")}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`px-2 py-1 rounded-full font-semibold ${
                t.status === "ativo" ? "bg-green-500/20 text-green-300" :
                t.status === "suspenso" ? "bg-yellow-500/20 text-yellow-300" :
                "bg-red-500/20 text-red-300"
              }`}>{t.status}</span>
              <span className="px-2 py-1 rounded-full bg-muted capitalize">{t.plano}</span>
              <span className="px-2 py-1 rounded-full bg-muted">{counts[t.id] || 0} usuário(s)</span>
            </div>

            <div className="flex items-center justify-end gap-1 border-t pt-2">
              <button title="Acessar PDV"
                onClick={() => window.open(`/__impersonate?tenant=${t.id}`, "_blank", "noopener,noreferrer")}
                className="p-2 rounded hover:bg-accent/20 text-accent">
                <Store className="h-4 w-4" />
              </button>
              <button title="Criar admin do cliente"
                onClick={() => setCreatingAdmin({ tenantId: t.id, tenantName: t.nome_comercio })}
                className="p-2 rounded hover:bg-muted">
                <Eye className="h-4 w-4" />
              </button>
              <button title="Editar"
                onClick={() => setEditing(t)}
                className="p-2 rounded hover:bg-muted">
                <Edit className="h-4 w-4" />
              </button>
              {t.status === "ativo" ? (
                <button title="Suspender"
                  onClick={() => setStatus.mutate({ id: t.id, status: "suspenso" })}
                  className="p-2 rounded hover:bg-yellow-500/20">
                  <Pause className="h-4 w-4" />
                </button>
              ) : (
                <button title="Reativar"
                  onClick={() => setStatus.mutate({ id: t.id, status: "ativo" })}
                  className="p-2 rounded hover:bg-green-500/20">
                  <Play className="h-4 w-4" />
                </button>
              )}
              <button title="Excluir"
                onClick={() => {
                  if (confirm(`Excluir "${t.nome_comercio}"? Todos os dados serão removidos!`)) remove.mutate(t.id);
                }}
                className="p-2 rounded hover:bg-red-500/20 text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="text-left p-3">Comércio</th>
              <th className="text-left p-3">Slug</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Plano</th>
              <th className="text-left p-3">Usuários</th>
              <th className="text-right p-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>
            )}
            {!isLoading && tenants.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum estabelecimento.</td></tr>
            )}
            {tenants.map((t) => (
              <tr key={t.id} className="border-t hover:bg-muted/20">
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    {t.logo_url && <img src={t.logo_url} alt="" className="h-8 w-8 rounded object-cover" />}
                    <div>
                      <div className="font-semibold">{t.nome_comercio}</div>
                      <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString("pt-BR")}</div>
                    </div>
                  </div>
                </td>
                <td className="p-3 font-mono text-xs">{t.slug}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                    t.status === "ativo" ? "bg-green-500/20 text-green-300" :
                    t.status === "suspenso" ? "bg-yellow-500/20 text-yellow-300" :
                    "bg-red-500/20 text-red-300"
                  }`}>{t.status}</span>
                </td>
                <td className="p-3 capitalize">{t.plano}</td>
                <td className="p-3">{counts[t.id] || 0}</td>
                <td className="p-3">
                  <div className="flex items-center justify-end gap-1">
                    <button title="Acessar PDV"
                      onClick={() => window.open(`/${t.slug}`, "_blank", "noopener,noreferrer")}
                      className="p-2 rounded hover:bg-accent/20 text-accent">
                      <Store className="h-4 w-4" />
                    </button>
                    <button title="Criar admin do cliente"
                      onClick={() => setCreatingAdmin({ tenantId: t.id, tenantName: t.nome_comercio })}
                      className="p-2 rounded hover:bg-muted">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button title="Editar"
                      onClick={() => setEditing(t)}
                      className="p-2 rounded hover:bg-muted">
                      <Edit className="h-4 w-4" />
                    </button>
                    {t.status === "ativo" ? (
                      <button title="Suspender"
                        onClick={() => setStatus.mutate({ id: t.id, status: "suspenso" })}
                        className="p-2 rounded hover:bg-yellow-500/20">
                        <Pause className="h-4 w-4" />
                      </button>
                    ) : (
                      <button title="Reativar"
                        onClick={() => setStatus.mutate({ id: t.id, status: "ativo" })}
                        className="p-2 rounded hover:bg-green-500/20">
                        <Play className="h-4 w-4" />
                      </button>
                    )}
                    <button title="Excluir"
                      onClick={() => {
                        if (confirm(`Excluir "${t.nome_comercio}"? Todos os dados serão removidos!`)) remove.mutate(t.id);
                      }}
                      className="p-2 rounded hover:bg-red-500/20 text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <TenantFormDialog
          tenant={editing}
          onClose={() => setEditing(null)}
          onSave={(p) => saveMutation.mutate(p)}
          saving={saveMutation.isPending}
          slugify={slugify}
        />
      )}

      {creatingAdmin && (
        <CreateAdminDialog
          tenantId={creatingAdmin.tenantId}
          tenantName={creatingAdmin.tenantName}
          onClose={() => setCreatingAdmin(null)}
        />
      )}
    </div>
  );
}

function TenantFormDialog({ tenant, onClose, onSave, saving, slugify }: {
  tenant: Partial<Tenant>;
  onClose: () => void;
  onSave: (p: Partial<Tenant>) => void;
  saving: boolean;
  slugify: (s: string) => string;
}) {
  const [form, setForm] = useState<Partial<Tenant>>(tenant);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg border max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">{form.id ? "Editar" : "Novo"} estabelecimento</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nome do comércio *</label>
            <input
              value={form.nome_comercio || ""}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({
                  ...f,
                  nome_comercio: name,
                  slug: f.id ? f.slug : slugify(name),
                }));
              }}
              className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Slug (URL) *</label>
            <input
              value={form.slug || ""}
              onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
              className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">huskypdv.com/{form.slug || "..."}</p>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Logo (URL)</label>
            <input
              value={form.logo_url || ""}
              onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
              className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm"
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cor primária</label>
              <input
                type="color"
                value={form.cor_primaria || "#1E40AF"}
                onChange={(e) => setForm((f) => ({ ...f, cor_primaria: e.target.value }))}
                className="w-full mt-1 h-10 rounded-md border bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Cor secundária</label>
              <input
                type="color"
                value={form.cor_secundaria || "#FACC15"}
                onChange={(e) => setForm((f) => ({ ...f, cor_secundaria: e.target.value }))}
                className="w-full mt-1 h-10 rounded-md border bg-background"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <select
                value={form.status || "ativo"}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as Tenant["status"] }))}
                className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="ativo">Ativo</option>
                <option value="suspenso">Suspenso</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Plano</label>
              <select
                value={form.plano || "trial"}
                onChange={(e) => setForm((f) => ({ ...f, plano: e.target.value }))}
                className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="trial">Trial</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Expiração do plano</label>
            <input
              type="date"
              value={form.data_expiracao_plano?.split("T")[0] || ""}
              onChange={(e) => setForm((f) => ({ ...f, data_expiracao_plano: e.target.value || null }))}
              className="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border text-sm">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.nome_comercio || !form.slug}
            className="px-4 py-2 rounded-md bg-accent text-accent-foreground text-sm font-semibold disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateAdminDialog({ tenantId, tenantName, onClose }: {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ full_name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "create",
          email: form.email,
          password: form.password,
          full_name: form.full_name,
          role: "admin",
          tenant_id: tenantId,
          tenant_role: "admin_cliente",
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Admin do cliente criado!");
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar usuário");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-lg border max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Criar admin para {tenantName}</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <input placeholder="Nome do responsável" value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          <input type="email" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
          <input type="text" placeholder="Senha temporária (mín. 6)" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-md border text-sm">Cancelar</button>
          <button onClick={submit}
            disabled={loading || !form.email || form.password.length < 6 || !form.full_name}
            className="px-4 py-2 rounded-md bg-accent text-accent-foreground text-sm font-semibold disabled:opacity-50">
            {loading ? "Criando..." : "Criar admin"}
          </button>
        </div>
      </div>
    </div>
  );
}
