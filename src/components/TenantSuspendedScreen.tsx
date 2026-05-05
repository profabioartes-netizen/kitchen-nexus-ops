import { useTenant } from "@/contexts/TenantContext";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function TenantSuspendedScreen() {
  const { tenant } = useTenant();
  const { signOut } = useAuth();

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background p-6">
      <div className="max-w-md text-center space-y-4">
        <div className="inline-flex p-4 rounded-full bg-yellow-500/20">
          <AlertTriangle className="h-8 w-8 text-yellow-400" />
        </div>
        <h1 className="text-2xl font-bold">Acesso temporariamente suspenso</h1>
        <p className="text-muted-foreground">
          O estabelecimento <strong>{tenant?.nome_comercio}</strong> está com o acesso suspenso.
          Entre em contato com o suporte da HuskyPDV.
        </p>
        <button onClick={signOut} className="rounded-md bg-accent text-accent-foreground px-6 py-2 text-sm font-semibold">
          Sair
        </button>
      </div>
    </div>
  );
}
