import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus, Trash2, Loader2, Shield, Coffee, Lock, Pencil, KeyRound, Calculator, UserX, UserCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface UserProfile {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
  created_at: string;
}

interface AuthUser {
  id: string;
  email: string;
  phone: string;
  last_sign_in_at: string | null;
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

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<UserProfile | null>(null);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Edit state
  const [editTarget, setEditTarget] = useState<UserProfile | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "waiter" | "contabilidade">("waiter");

  // Reset password state
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [newPassword, setNewPassword] = useState("");

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

  // Fetch auth details (email, phone)
  const { data: authUsers = [], isLoading: isLoadingAuth } = useQuery({
    queryKey: ["users_auth_details"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "list" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.users || []) as AuthUser[];
    },
    enabled: unlocked,
  });

  const authMap = new Map(authUsers.map((u) => [u.id, u]));

  const openEdit = (u: UserProfile) => {
    const auth = authMap.get(u.id);
    setEditTarget(u);
    setEditName(u.full_name || "");
    setEditEmail(auth?.email || "");
    setEditPhone(auth?.phone || "");
    setEditRole(u.role as "admin" | "waiter" | "contabilidade");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await supabase.functions.invoke("manage-users", {
        body: { action: "create", email, password, full_name: fullName, role },
      });
      const { data, error } = res;
      if (error) {
        let msg = "Erro ao criar usuário";
        if (error.name === "FunctionsHttpError") {
          try {
            const errBody = typeof error.context === "object" && error.context?.json
              ? await error.context.json()
              : data;
            if (errBody?.error) msg = errBody.error;
          } catch {}
        } else if (data?.error) {
          msg = data.error;
        } else if (error.message) {
          msg = error.message;
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
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
      queryClient.invalidateQueries({ queryKey: ["users_auth_details"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const updateProfileMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) throw new Error("Nenhum usuário selecionado");
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "update_profile",
          user_id: editTarget.id,
          full_name: editName,
          email: editEmail,
          phone: editPhone,
          role: editRole,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Usuário atualizado!");
      setEditTarget(null);
      queryClient.invalidateQueries({ queryKey: ["users_profiles"] });
      queryClient.invalidateQueries({ queryKey: ["users_auth_details"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      if (!resetTarget) throw new Error("Nenhum usuário selecionado");
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: {
          action: "reset_password",
          user_id: resetTarget.id,
          new_password: newPassword,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Senha redefinida com sucesso!");
      setResetTarget(null);
      setNewPassword("");
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: string }) => {
      const { data, error } = await supabase.functions.invoke("manage-users", {
        body: { action: "update_role", user_id, role },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
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
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Usuário removido!");
      setDeleteTarget(null);
      setConfirmPassword("");
      queryClient.invalidateQueries({ queryKey: ["users_profiles"] });
      queryClient.invalidateQueries({ queryKey: ["users_auth_details"] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const handleDeleteConfirm = () => {
    if (!deleteTarget || !confirmPassword) return;
    if (confirmPassword !== ADMIN_PIN) {
      toast.error("PIN incorreto!");
      return;
    }
    deleteMutation.mutate(deleteTarget.id);
  };

  const roleLabel = (r: string) =>
    r === "admin" ? "Administrador" : r === "contabilidade" ? "Contabilidade" : "Garçom";

  const roleIcon = (r: string) =>
    r === "admin" ? <Shield className="h-4 w-4" /> :
    r === "contabilidade" ? <Calculator className="h-4 w-4" /> :
    <Coffee className="h-4 w-4" />;

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
              if (val === ADMIN_PIN) setUnlocked(true);
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
          onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
          className="rounded-lg border bg-card p-4 space-y-4"
        >
          <h2 className="font-semibold text-lg">Cadastrar Usuário</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Nome Completo</label>
              <input required maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Maria da Silva" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">E-mail</label>
              <input required type="email" maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="maria@email.com" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Senha</label>
              <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Função</label>
              <div className="flex gap-2">
                {(["waiter", "admin", "contabilidade"] as const).map((r) => (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-all ${
                      role === r ? "bg-accent text-accent-foreground ring-2 ring-accent ring-offset-1 ring-offset-card" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}>
                    {roleIcon(r)} {roleLabel(r)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowForm(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button type="submit" disabled={createMutation.isPending}
              className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
              {createMutation.isPending ? "Criando..." : "Criar Usuário"}
            </button>
          </div>
        </form>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>Atualize os dados cadastrais do usuário.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); updateProfileMutation.mutate(); }} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Nome Completo</label>
              <input required maxLength={100} value={editName} onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">E-mail</label>
              <input required type="email" maxLength={255} value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Telefone</label>
              <input type="tel" maxLength={20} value={editPhone} onChange={(e) => setEditPhone(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="(99) 99999-9999" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Função</label>
              <div className="flex gap-2">
                {(["waiter", "admin", "contabilidade"] as const).map((r) => (
                  <button key={r} type="button" onClick={() => setEditRole(r)}
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium transition-all ${
                      editRole === r ? "bg-accent text-accent-foreground ring-2 ring-accent ring-offset-1 ring-offset-card" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                    }`}>
                    {roleIcon(r)} {roleLabel(r)}
                  </button>
                ))}
              </div>
            </div>

            {editTarget?.id === user?.id && editRole !== "admin" && (
              <p className="text-xs text-destructive font-medium">
                ⚠️ Você está removendo seu próprio acesso de administrador!
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditTarget(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
              <button type="submit" disabled={updateProfileMutation.isPending}
                className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {updateProfileMutation.isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(o) => !o && setResetTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Redefinir Senha</DialogTitle>
            <DialogDescription>
              Nova senha para <strong>{resetTarget?.full_name}</strong>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); resetPasswordMutation.mutate(); }} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Nova Senha</label>
              <input required type="password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Mínimo 6 caracteres" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setResetTarget(null)}
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
              <button type="submit" disabled={resetPasswordMutation.isPending}
                className="rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {resetPasswordMutation.isPending ? "Redefinindo..." : "Redefinir Senha"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
            <p className="text-sm text-muted-foreground">Digite o PIN de administrador para confirmar:</p>
            <input type="password" autoFocus inputMode="numeric" maxLength={4} value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => { if (e.key === "Enter") handleDeleteConfirm(); }}
              placeholder="••••"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm text-center tracking-[0.3em] outline-none focus:ring-2 focus:ring-ring" />
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDeleteTarget(null); setConfirmPassword(""); }}
                className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
              <button disabled={confirmPassword.length < 4 || deleteMutation.isPending} onClick={handleDeleteConfirm}
                className="rounded-md bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {deleteMutation.isPending ? "Removendo..." : "Confirmar Exclusão"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Users list */}
      {isLoading || isLoadingAuth ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Nenhum usuário cadastrado.</p>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const auth = authMap.get(u.id);
            return (
              <div key={u.id} className="rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex items-center justify-center h-9 w-9 rounded-full shrink-0 ${
                      u.role === "admin" ? "bg-accent/20 text-accent" :
                      u.role === "contabilidade" ? "bg-blue-500/20 text-blue-500" :
                      "bg-secondary text-secondary-foreground"
                    }`}>
                      {roleIcon(u.role)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{u.full_name || "Sem nome"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {auth?.email || "—"} · {roleLabel(u.role)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button onClick={() => openEdit(u)} title="Editar"
                      className="rounded p-1.5 hover:bg-accent/10 text-accent transition-colors">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setResetTarget(u); setNewPassword(""); }} title="Redefinir senha"
                      className="rounded p-1.5 hover:bg-accent/10 text-accent transition-colors">
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeleteTarget(u)} title="Remover"
                      className="rounded p-1.5 hover:bg-destructive/10 text-destructive transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
