import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";

export type Tenant = {
  id: string;
  nome_comercio: string;
  slug: string;
  logo_url: string | null;
  cor_primaria: string | null;
  cor_secundaria: string | null;
  status: "ativo" | "suspenso" | "cancelado";
  plano: string;
  data_expiracao_plano: string | null;
};

export type TenantRole = "super_admin" | "admin_cliente" | "atendente" | "caixa" | "cozinha";

type TenantContextType = {
  tenant: Tenant | null;
  roles: TenantRole[];
  isSuperAdmin: boolean;
  loading: boolean;
  reload: () => Promise<void>;
};

const TenantContext = createContext<TenantContextType>({
  tenant: null,
  roles: [],
  isSuperAdmin: false,
  loading: true,
  reload: async () => {},
});

export const useTenant = () => useContext(TenantContext);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, profile, loading: authLoading } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [roles, setRoles] = useState<TenantRole[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) {
      setTenant(null);
      setRoles([]);
      setLoading(false);
      return;
    }

    // Roles do usuário em qualquer tenant
    const { data: userTenants } = await supabase
      .from("user_tenants")
      .select("tenant_id, role, active")
      .eq("user_id", user.id)
      .eq("active", true);

    const allRoles = (userTenants ?? []).map((r) => r.role as TenantRole);
    setRoles(allRoles);

    // Tenant principal: profile.tenant_id, fallback para o primeiro vínculo não-super
    const targetTenantId =
      (profile as any)?.tenant_id ??
      userTenants?.find((r) => r.role !== "super_admin")?.tenant_id ??
      null;

    if (targetTenantId) {
      const { data: t } = await supabase
        .from("tenants")
        .select("id,nome_comercio,slug,logo_url,cor_primaria,cor_secundaria,status,plano,data_expiracao_plano")
        .eq("id", targetTenantId)
        .maybeSingle();
      setTenant((t as Tenant) ?? null);
    } else {
      setTenant(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, (profile as any)?.tenant_id, authLoading]);

  // Aplicar cores do tenant nas variáveis CSS
  useEffect(() => {
    if (!tenant) return;
    const root = document.documentElement;
    if (tenant.cor_primaria) root.style.setProperty("--tenant-primary", tenant.cor_primaria);
    if (tenant.cor_secundaria) root.style.setProperty("--tenant-accent", tenant.cor_secundaria);
  }, [tenant]);

  const isSuperAdmin = roles.includes("super_admin");

  return (
    <TenantContext.Provider value={{ tenant, roles, isSuperAdmin, loading, reload: load }}>
      {children}
    </TenantContext.Provider>
  );
}
