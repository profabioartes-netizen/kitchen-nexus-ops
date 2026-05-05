import { useEffect, useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, Lock, Mail, AlertTriangle } from "lucide-react";
import huskyLogo from "@/assets/husky-pdv-logo.png";
import LoadingScreen from "@/components/LoadingScreen";

type PublicTenant = {
  id: string;
  nome_comercio: string;
  slug: string;
  logo_url: string | null;
  cor_primaria: string | null;
  cor_secundaria: string | null;
  status: "ativo" | "suspenso" | "cancelado";
};

// Routes that must NEVER be treated as tenant slugs
const RESERVED_SLUGS = new Set([
  "login",
  "admin-platform",
  "caixa",
  "comandas",
  "produtos",
  "relatorios",
  "impressoras",
  "configuracoes",
  "vendas",
  "abertura-caixa",
  "controle-caixa",
  "usuarios",
  "mesas",
  "cozinha",
  "garcom",
  "contabilidade",
  "self-service",
]);

export default function TenantLoginPage() {
  const { slug } = useParams<{ slug: string }>();
  const { user, profile, loading: authLoading } = useAuth();
  const [tenant, setTenant] = useState<PublicTenant | null>(null);
  const [lookupState, setLookupState] = useState<"loading" | "not_found" | "found">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const normalizedSlug = (slug ?? "").toLowerCase().trim();
  const isReserved = RESERVED_SLUGS.has(normalizedSlug);

  useEffect(() => {
    if (!normalizedSlug || isReserved) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_tenant_by_slug", { _slug: normalizedSlug });
      if (cancelled) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setLookupState("not_found");
        return;
      }
      const t = (Array.isArray(data) ? data[0] : data) as PublicTenant;
      setTenant(t);
      setLookupState("found");
    })();
    return () => {
      cancelled = true;
    };
  }, [normalizedSlug, isReserved]);

  // Reserved -> let other routes handle / 404
  if (isReserved) return <Navigate to={`/${normalizedSlug}`} replace state={{ __reserved: true }} />;

  // Already logged in (operacional) -> go to PDV
  if (!authLoading && user && profile?.role !== "contabilidade") {
    return <Navigate to="/" replace />;
  }

  if (lookupState === "loading") return <LoadingScreen mode="full" />;

  if (lookupState === "not_found") {
    return (
      <div className="h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="inline-flex p-4 rounded-full bg-muted">
            <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Estabelecimento não encontrado.</h1>
          <p className="text-muted-foreground">
            Verifique o endereço digitado ou entre em contato com o suporte da HuskyPDV.
          </p>
          <a href="/login" className="inline-block text-sm text-primary underline">Ir para login padrão</a>
        </div>
      </div>
    );
  }

  if (tenant && tenant.status !== "ativo") {
    return (
      <div className="h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md text-center space-y-4">
          <div className="inline-flex p-4 rounded-full bg-yellow-500/20">
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
          </div>
          <h1 className="text-2xl font-bold">Acesso temporariamente indisponível</h1>
          <p className="text-muted-foreground">
            Este acesso está temporariamente indisponível. Entre em contato com o suporte.
          </p>
        </div>
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const userId = authData.user?.id;
      if (!userId) throw new Error("Erro ao obter usuário");

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (prof?.role === "contabilidade") {
        await supabase.auth.signOut();
        toast.error("Acesso restrito. Use o painel de contabilidade em /contabilidade/login");
        return;
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const primary = tenant?.cor_primaria || "hsl(224 76% 14%)";
  const accent = tenant?.cor_secundaria || "hsl(48 96% 53%)";

  return (
    <div
      className="h-screen overflow-hidden flex items-center justify-center p-4 relative"
      style={{
        background: `radial-gradient(1200px 600px at 10% 0%, ${primary} 0%, transparent 60%), radial-gradient(900px 500px at 90% 100%, ${primary} 0%, transparent 55%), linear-gradient(135deg, hsl(222 60% 8%) 0%, ${primary} 100%)`,
      }}
    >
      <div className="pointer-events-none absolute top-1/4 right-1/4 w-72 h-72 rounded-full blur-3xl opacity-20" style={{ background: accent }} />

      <div className="w-full max-w-sm flex-shrink-0 relative z-10">
        <div className="text-center mb-8">
          <img
            src={tenant?.logo_url || huskyLogo}
            alt={tenant?.nome_comercio || "HuskyPDV"}
            className="h-32 w-32 mx-auto mb-4 object-contain drop-shadow-2xl rounded-2xl bg-white/5 p-2"
          />
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            {tenant?.nome_comercio}
          </h1>
          <p className="text-sm mt-2 tracking-wide" style={{ color: accent }}>
            Sistema inteligente de PDV
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/70">Email</label>
              <div className="relative mt-1.5">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  required
                  className="w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-yellow-400/60 focus:border-transparent transition"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-white/70">Senha</label>
              <div className="relative mt-1.5">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-yellow-400/60 focus:border-transparent transition"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg py-3 text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:brightness-110 active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${accent} 0%, ${accent} 100%)`,
                color: "hsl(222 60% 12%)",
              }}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-white/40 mt-6">
          © {new Date().getFullYear()} HuskyPDV · Plataforma SaaS
        </p>
      </div>
    </div>
  );
}
