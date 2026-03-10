import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, User, Lock, Mail } from "lucide-react";
import coffeeLogo from "@/assets/coffee-thrones-logo.png";

export default function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error("Informe seu nome completo");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Conta criada com sucesso!");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <img src={coffeeLogo} alt="Coffee Thrones" className="h-28 mx-auto mb-4 object-contain drop-shadow-md" />
          <h1 className="font-display text-2xl tracking-tight">Coffee Thrones</h1>
          <p className="text-sm text-muted-foreground mt-1.5 tracking-wide">Sistema de Atendimento</p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <div className="flex rounded-md border overflow-hidden mb-6">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === "login" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${
                mode === "signup" ? "bg-accent text-accent-foreground" : "hover:bg-secondary"
              }`}
            >
              Cadastrar
            </button>
          </div>

          <form onSubmit={mode === "login" ? handleLogin : handleSignup} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nome completo</label>
                <div className="relative mt-1">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex: João Silva"
                    required
                    className="w-full rounded-md border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}
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
              {mode === "login" ? "Entrar" : "Criar conta"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
