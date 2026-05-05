import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  user_id: string;
  tenant_id: string;
  role: string;
  active: boolean;
  tenant_name?: string;
  full_name?: string;
};

export default function AdminPlatformUsersPage() {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-platform-users"],
    queryFn: async () => {
      const { data: ut } = await supabase
        .from("user_tenants")
        .select("user_id,tenant_id,role,active");
      const tenantIds = Array.from(new Set((ut ?? []).map((r) => r.tenant_id)));
      const userIds = Array.from(new Set((ut ?? []).map((r) => r.user_id)));
      const [{ data: tenants }, { data: profiles }] = await Promise.all([
        supabase.from("tenants").select("id,nome_comercio").in("id", tenantIds.length ? tenantIds : ["00000000-0000-0000-0000-000000000000"]),
        supabase.from("profiles").select("id,full_name").in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]),
      ]);
      const tMap = new Map((tenants ?? []).map((t: any) => [t.id, t.nome_comercio]));
      const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p.full_name]));
      return (ut ?? []).map((r) => ({
        ...r,
        tenant_name: tMap.get(r.tenant_id) || "—",
        full_name: pMap.get(r.user_id) || "—",
      })) as Row[];
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-full">
      <div className="min-w-0">
        <h1 className="text-xl md:text-2xl font-bold break-words">Usuários da plataforma</h1>
        <p className="text-xs md:text-sm text-muted-foreground break-words">
          Visão geral de todos os vínculos usuário ↔ estabelecimento
        </p>
      </div>

      {/* Mobile: cards */}
      <div className="md:hidden space-y-2">
        {isLoading && (
          <div className="p-6 text-center text-muted-foreground rounded-lg border bg-card">Carregando...</div>
        )}
        {rows.map((r, i) => (
          <div key={i} className="rounded-lg border bg-card p-3 space-y-1.5">
            <div className="font-semibold break-words">{r.full_name}</div>
            <div className="text-xs text-muted-foreground break-words">{r.tenant_name}</div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                r.role === "super_admin" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary-foreground"
              }`}>{r.role}</span>
              <span className="text-xs text-muted-foreground">{r.active ? "Ativo" : "Inativo"}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
            <tr>
              <th className="text-left p-3">Usuário</th>
              <th className="text-left p-3">Estabelecimento</th>
              <th className="text-left p-3">Papel</th>
              <th className="text-left p-3">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-3">{r.full_name}</td>
                <td className="p-3">{r.tenant_name}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    r.role === "super_admin" ? "bg-accent/20 text-accent" : "bg-primary/20 text-primary-foreground"
                  }`}>{r.role}</span>
                </td>
                <td className="p-3">{r.active ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
