import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Lock, Mail } from "lucide-react";
import coffeeLogo from "@/assets/coffee-thrones-logo.png";

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
    <div className="h-screen overflow-hidden flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm flex-shrink-0">
        <div className="text-center mb-10">
          <img src={coffeeLogo} alt="Coffee Thrones" className="h-28 mx-auto mb-4 object-contain drop-shadow-md" />
          <h1 className="font-display text-2xl tracking-tight">Coffee Thrones</h1>
          <p className="text-sm text-muted-foreground mt-1.5 tracking-wide">Sistema de Atendimento</p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <div className="relative mt-1">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="garcom@restaurante.com"
                  required
                  className="w-full rounded-md border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Senha</label>
              <div className="relative mt-1">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full rounded-md border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-accent text-accent-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
