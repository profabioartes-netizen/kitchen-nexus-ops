import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { User, UtensilsCrossed } from "lucide-react";
import SelfServiceMenu from "./SelfServiceMenu";
import SelfServiceBill from "./SelfServiceBill";

export default function SelfServicePage() {
  const { tableId } = useParams<{ tableId: string }>();
  const [customerName, setCustomerName] = useState("");
  const [entered, setEntered] = useState(false);
  const [view, setView] = useState<"menu" | "bill">("menu");

  // Restore name from sessionStorage
  useEffect(() => {
    const saved = sessionStorage.getItem(`ss_name_${tableId}`);
    if (saved) {
      setCustomerName(saved);
      setEntered(true);
    }
  }, [tableId]);

  const { data: table, isLoading: tableLoading } = useQuery({
    queryKey: ["self_service_table", tableId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("*")
        .eq("id", tableId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!tableId,
  });

  const handleEnter = () => {
    if (!customerName.trim()) return;
    sessionStorage.setItem(`ss_name_${tableId}`, customerName.trim());
    setEntered(true);
  };

  if (tableLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (!table) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-2">
          <UtensilsCrossed className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold text-foreground">Mesa não encontrada</h1>
          <p className="text-sm text-muted-foreground">O QR Code pode estar inválido ou a mesa foi removida.</p>
        </div>
      </div>
    );
  }

  if (!entered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div>
            <UtensilsCrossed className="h-10 w-10 mx-auto text-accent mb-3" />
            <h1 className="text-xl font-bold text-foreground">Bem-vindo!</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {table.name} {table.sector ? `· ${table.sector}` : ""}
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center justify-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Seu nome
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEnter()}
              placeholder="Digite seu nome..."
              autoFocus
              className="w-full rounded-lg border border-input bg-card px-4 py-3 text-center text-base text-foreground outline-none focus:ring-2 focus:ring-accent placeholder:text-muted-foreground"
            />
            <button
              onClick={handleEnter}
              disabled={!customerName.trim()}
              className="w-full rounded-lg bg-accent text-accent-foreground py-3 font-semibold text-base hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              Acessar Cardápio
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{table.name}</p>
          <p className="text-sm font-semibold text-foreground">{customerName}</p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setView("menu")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "menu" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            Cardápio
          </button>
          <button
            onClick={() => setView("bill")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "bill" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"}`}
          >
            Minha Conta
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === "menu" ? (
          <SelfServiceMenu tableId={tableId!} customerName={customerName} table={table} />
        ) : (
          <SelfServiceBill tableId={tableId!} customerName={customerName} />
        )}
      </div>
    </div>
  );
}
