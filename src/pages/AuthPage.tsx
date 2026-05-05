import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Lock, Mail } from "lucide-react";
import huskyLogo from "@/assets/husky-pdv-logo.png";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const userId = authData.user?.id;
      if (!userId) throw new Error("Erro ao obter usuário");

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .single();

      if (profile?.role === "contabilidade") {
        await supabase.auth.signOut();
        toast.error("Acesso restrito. Use o painel de contabilidade em /contabilidade/login");
        return;
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="h-screen overflow-hidden flex items-center justify-center p-4 relative"
      style={{
        background:
          "radial-gradient(1200px 600px at 10% 0%, hsl(224 70% 22%) 0%, transparent 60%), radial-gradient(900px 500px at 90% 100%, hsl(224 80% 14%) 0%, transparent 55%), linear-gradient(135deg, hsl(222 60% 8%) 0%, hsl(224 76% 14%) 100%)",
      }}
    >
      {/* Subtle yellow accent glow */}
      <div className="pointer-events-none absolute top-1/4 right-1/4 w-72 h-72 rounded-full blur-3xl opacity-20" style={{ background: "hsl(48 96% 53%)" }} />

      <div className="w-full max-w-sm flex-shrink-0 relative z-10">
        <div className="text-center mb-8">
          <img
            src={huskyLogo}
            alt="HuskyPDV"
            className="h-32 w-32 mx-auto mb-4 object-contain drop-shadow-2xl"
          />
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">HuskyPDV</h1>
          <p className="text-sm mt-2 tracking-wide" style={{ color: "hsl(48 96% 70%)" }}>
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
              disabled={loading}
              className="w-full rounded-lg py-3 text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg hover:shadow-yellow-400/30 hover:brightness-110 active:scale-[0.98]"
              style={{
                background: "linear-gradient(135deg, hsl(48 96% 58%) 0%, hsl(45 96% 50%) 100%)",
                color: "hsl(222 60% 12%)",
              }}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
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
