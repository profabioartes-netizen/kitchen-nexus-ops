import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2, Shield, Coffee, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface UserProfile {
  id: string;
  full_name: string;
  role: string;
  created_at: string;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "waiter" | "contabilidade">("waiter");

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const ADMIN_PIN = "9135";

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users_profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as UserProfile[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "create", email, password, full_name: fullName, role },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Usuário criado com sucesso!");
      setShowForm(false);
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("waiter");
      queryClient.invalidateQueries({ queryKey: ["users_profiles"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: string }) => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "update_role", user_id, role },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Função atualizada!");
      queryClient.invalidateQueries({ queryKey: ["users_profiles"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (user_id: string) => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "delete", user_id },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Usuário removido!");
      setDeleteTarget(null);
      setConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: ["users_profiles"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });


  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !confirmPassword) return;
    setConfirmingDelete(true);
    try {
      if (confirmPassword !== ADMIN_PIN) {
        toast.error("Senha incorreta!");
        return;
      }
      deleteMutation.mutate(deleteTarget.id);
    } finally {
      setConfirmingDelete(false);
    }
  };

  const roleLabel = (r: string) => (r === "admin" ? "Administrador" : "Garçom");

  if (!unlocked) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="rounded-lg border bg-card p-6 w-full max-w-xs space-y-4 shadow-lg text-center">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
          <h2 className="font-semibold text-lg">Área Restrita</h2>
          <p className="text-sm text-muted-foreground">Digite o PIN de administrador</p>
          <input
            type="password"
            autoFocus
            inputMode="numeric"
            maxLength={4}
            value={pinInput}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, "");
              setPinInput(val);
              if (val === ADMIN_PIN) {
                setUnlocked(true);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (pinInput === ADMIN_PIN) setUnlocked(true);
                else { setPinInput(""); toast.error("PIN incorreto!"); }
              }
            }}
            placeholder="••••"
            className="w-full rounded-md border bg-background px-3 py-3 text-center text-2xl tracking-[0.5em] outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            onClick={() => window.history.back()}
            className="w-full rounded-md border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
          >
            ← Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 h-full overflow-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Usuários</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <UserPlus className="h-4 w-4" />
          Novo Usuário
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate();
          }}
          className="rounded-lg border bg-card p-4 space-y-4"
        >
          <h2 className="font-semibold text-lg">Cadastrar Usuário</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Nome Completo</label>
              <input
                required
                maxLength={100}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Maria da Silva"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">E-mail</label>
              <input
                required
                type="email"
                maxLength={255}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="maria@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Senha</label>
              <input
                required
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Função</label>
              <div className="flex gap-2">
                {(["waiter", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`flex-1 flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-all ${
                      role === r
                        ? "bg-accent text-accent-foreground ring-2 ring-accent ring-offset-1 ring-offset-card"
                        : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}
                  >
                    {r === "admin" ? <Shield className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}
                    {roleLabel(r)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {createMutation.isPending ? "Criando..." : "Criar Usuário"}
            </button>
          </div>
        </form>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border bg-card p-6 w-full max-w-sm mx-4 space-y-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-full bg-destructive/15 text-destructive">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Confirmar exclusão</h3>
                <p className="text-xs text-muted-foreground">
                  Remover <strong>{deleteTarget.full_name}</strong>
                </p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground">
              Digite sua senha de administrador para confirmar:
            </p>

            <input
              type="password"
              autoFocus
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && confirmPassword.length >= 6) handleDeleteConfirm();
              }}
              placeholder="Sua senha"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setDeleteTarget(null);
                  setConfirmPassword("");
                }}
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                disabled={confirmPassword.length < 6 || confirmingDelete || deleteMutation.isPending}
                onClick={handleDeleteConfirm}
                className="rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {confirmingDelete || deleteMutation.isPending ? "Verificando..." : "Confirmar Exclusão"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users list */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Nenhum usuário cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-lg border bg-card p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex items-center justify-center h-9 w-9 rounded-full ${
                    u.role === "admin"
                      ? "bg-accent/20 text-accent"
                      : "bg-secondary text-secondary-foreground"
                  }`}
                >
                  {u.role === "admin" ? <Shield className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name || "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel(u.role)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-2">
                <select
                  value={u.role}
                  onChange={(e) =>
                    updateRoleMutation.mutate({ user_id: u.id, role: e.target.value })
                  }
                  className="rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="admin">Administrador</option>
                  <option value="waiter">Garçom</option>
                </select>
                <button
                  onClick={() => setDeleteTarget(u)}
                  className="rounded p-1.5 hover:bg-destructive/10 text-destructive transition-colors"
                  title="Remover usuário"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
