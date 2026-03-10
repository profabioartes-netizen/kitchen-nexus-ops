import { useAuth } from "@/contexts/AuthContext";
import { LogOut, UserCircle, ChefHat } from "lucide-react";

export default function WaiterProfilePage() {
  const { user, profile, signOut } = useAuth();

  return (
    <div className="p-4">
      <h1 className="text-lg font-semibold mb-6">Perfil</h1>

      <div className="rounded-xl border bg-card p-5 flex flex-col items-center text-center mb-6">
        <div className="rounded-full bg-accent/10 p-4 mb-3">
          <UserCircle className="h-12 w-12 text-accent" />
        </div>
        <p className="font-semibold text-base">{profile?.full_name || "Garçom"}</p>
        <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
          <ChefHat className="h-3 w-3" />
          {profile?.role === "admin" ? "Administrador" : "Garçom"}
        </span>
      </div>

      <button
        onClick={signOut}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 py-4 text-sm font-medium text-destructive active:opacity-80 transition-opacity"
      >
        <LogOut className="h-5 w-5" />
        Sair da conta
      </button>
    </div>
  );
}
