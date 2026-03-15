import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { User, Phone, UtensilsCrossed, Loader2, Instagram } from "lucide-react";
import coffeeLogo from "@/assets/coffee-thrones-logo.png";
import SelfServiceMenu from "./SelfServiceMenu";
import SelfServiceBill from "./SelfServiceBill";

const SESSION_DURATION_MINUTES = 90;

export default function SelfServicePage() {
  const { tableId } = useParams<{ tableId: string }>();
  const [customerName, setCustomerName] = useState("");
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappError, setWhatsappError] = useState("");
  const [entered, setEntered] = useState(false);
  // Track the order_id linked to this session (each customer gets their own)
  const [sessionOrderId, setSessionOrderId] = useState<string | null>(null);

  const formatWhatsapp = (digits: string) => {
    const d = digits.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const rawWhatsapp = whatsappPhone.replace(/\D/g, "");
  const isWhatsappValid = rawWhatsapp.length === 11 && rawWhatsapp[2] === "9";
  const [view, setView] = useState<"menu" | "bill">("menu");
  const [checkingSession, setCheckingSession] = useState(true);
  const [pulseBill, setPulseBill] = useState(false);
  const [showThankYou, setShowThankYou] = useState(false);

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

  const { data: selfServiceEnabled, isLoading: loadingSelfServiceSetting } = useQuery({
    queryKey: ["restaurant_setting", "self_service_enabled"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("value")
        .eq("key", "self_service_enabled")
        .single();
      return data?.value ?? "true";
    },
  });

  // Check for existing valid session on mount (only reconnects the SAME customer via token)
  const tryAutoEnter = useCallback(async () => {
    if (!tableId) return;
    setCheckingSession(true);

    try {
      const savedToken = localStorage.getItem(`ss_session_${tableId}`);

      if (savedToken) {
        // Validate token against DB
        const { data: session } = await supabase
          .from("self_service_sessions")
          .select("*")
          .eq("session_token", savedToken)
          .eq("table_id", tableId)
          .single();

        if (session && new Date(session.expires_at) > new Date()) {
          // Session still valid — reconnect same customer
          setCustomerName(session.customer_name);
          setSessionOrderId((session as any).order_id || null);
          setEntered(true);
          setCheckingSession(false);
          return;
        } else {
          // Token expired or invalid — clean up
          localStorage.removeItem(`ss_session_${tableId}`);
        }
      }

      // No valid session → show login screen (each customer creates their own)
    } catch (err) {
      console.error("Session check error:", err);
    }

    setCheckingSession(false);
  }, [tableId]);

  useEffect(() => {
    tryAutoEnter();
  }, [tryAutoEnter]);

  // Realtime: auto-logout when waiter cancels the order/table
  useEffect(() => {
    if (!entered || !tableId) return;

    const channel = supabase
      .channel(`ss-auto-logout-${tableId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `table_id=eq.${tableId}` },
        (payload: any) => {
          const newStatus = payload.new?.status;
          // Only auto-logout if THIS customer's order was cancelled
          if (
            (newStatus === "cancelado" || newStatus === "cancelled") &&
            sessionOrderId &&
            payload.new?.id === sessionOrderId
          ) {
            localStorage.removeItem(`ss_session_${tableId}`);
            window.location.reload();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "restaurant_tables", filter: `id=eq.${tableId}` },
        (payload: any) => {
          if (payload.new?.status === "free") {
            const pixJustPaid = localStorage.getItem(`ss_pix_paid_${tableId}`);
            localStorage.removeItem(`ss_session_${tableId}`);
            localStorage.removeItem(`ss_pix_paid_${tableId}`);
            if (pixJustPaid) {
              setShowThankYou(true);
            } else {
              window.location.reload();
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [entered, tableId, sessionOrderId]);

  // Pulse "Minha Conta" when waiter approves items (sent_to_kitchen changes)
  useEffect(() => {
    if (!entered || !tableId) return;

    const channel = supabase
      .channel(`ss-pulse-bill-${tableId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "order_items" },
        (payload: any) => {
          if (payload.new?.sent_to_kitchen === true) {
            setPulseBill(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [entered, tableId]);

  const handleEnter = async () => {
    if (!customerName.trim() || !isWhatsappValid || !tableId) return;
    const name = customerName.trim();

    // Create session (no order_id yet — created on first submit)
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MINUTES * 60 * 1000).toISOString();
    const { data: session } = await supabase
      .from("self_service_sessions")
      .insert({
        table_id: tableId,
        customer_name: name,
        expires_at: expiresAt,
      })
      .select("session_token")
      .single();

    if (session) {
      localStorage.setItem(`ss_session_${tableId}`, session.session_token);
    }

    setCustomerName(name);
    setSessionOrderId(null); // will be set on first order submit
    setEntered(true);
  };

  // Callback for SelfServiceMenu to set the order_id after creating an order
  const handleOrderCreated = useCallback(async (orderId: string) => {
    setSessionOrderId(orderId);
    // Also update the session in DB
    const savedToken = localStorage.getItem(`ss_session_${tableId}`);
    if (savedToken) {
      await supabase
        .from("self_service_sessions")
        .update({ order_id: orderId } as any)
        .eq("session_token", savedToken)
        .eq("table_id", tableId!);
    }
  }, [tableId]);

  if (tableLoading || checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-accent" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
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
      <div className="h-screen overflow-hidden flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm flex-shrink-0">
          <div className="text-center mb-10">
            <img src={coffeeLogo} alt="Coffee Thrones" className="h-28 mx-auto mb-4 object-contain drop-shadow-md" />
            <h1 className="font-display text-2xl tracking-tight">Coffee Thrones</h1>
            <p className="text-sm text-muted-foreground mt-1.5 tracking-wide">
              {table.internal_number || table.name} {table.sector ? `· ${table.sector}` : ""}
            </p>
          </div>

          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  Seu nome
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Digite seu nome..."
                  autoFocus
                  className="w-full mt-1 rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  WhatsApp
                </label>
                <input
                  type="tel"
                  value={formatWhatsapp(whatsappPhone)}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                    setWhatsappPhone(digits);
                    if (digits.length === 11 && digits[2] !== "9") {
                      setWhatsappError("O número deve começar com 9 após o DDD");
                    } else if (digits.length > 0 && digits.length < 11) {
                      setWhatsappError("Digite DDD + 9 + número (11 dígitos)");
                    } else {
                      setWhatsappError("");
                    }
                  }}
                  onKeyDown={(e) => e.key === "Enter" && isWhatsappValid && handleEnter()}
                  placeholder="(00) 90000-0000"
                  maxLength={15}
                  className={`w-full mt-1 rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring ${whatsappError ? "border-destructive" : ""}`}
                />
                {whatsappError && rawWhatsapp.length > 0 && (
                  <p className="text-[11px] text-destructive mt-1">{whatsappError}</p>
                )}
              </div>
              <button
                onClick={handleEnter}
                disabled={!customerName.trim() || !isWhatsappValid}
                className="w-full rounded-md bg-accent text-accent-foreground py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                Acessar Cardápio
              </button>
              <p className="text-[10px] text-muted-foreground text-center">
                coffeethrones.app
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showThankYou) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <img src={coffeeLogo} alt="Coffee Thrones" className="h-36 object-contain drop-shadow-md mb-8" />
        <h2 className="text-2xl font-display font-bold text-foreground text-center mb-2">
          Obrigado pela preferência!
        </h2>
        <p className="text-base text-muted-foreground text-center mb-8">
          Volte sempre! ☕
        </p>
        <a
          href="https://www.instagram.com/coffeethrones/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-full bg-gradient-to-r from-pink-500 via-purple-500 to-orange-400 text-white px-6 py-3 text-sm font-semibold shadow-lg hover:scale-105 transition-transform"
        >
          <Instagram className="h-5 w-5" />
          Siga-nos no Instagram
        </a>
        <p className="text-[11px] text-muted-foreground mt-10">coffeethrones.app</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">
            📍 {table.internal_number || table.name}{table.sector ? ` · ${table.sector}` : ""}
          </p>
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
            onClick={() => { setView("bill"); setPulseBill(false); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${view === "bill" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary"} ${pulseBill && view !== "bill" ? "animate-pulse bg-accent text-accent-foreground ring-2 ring-accent/50" : ""}`}
          >
            Minha Conta
          </button>
          <button
            onClick={() => {
              localStorage.removeItem(`ss_session_${tableId}`);
              window.location.reload();
            }}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {view === "menu" ? (
          <SelfServiceMenu
            tableId={tableId!}
            customerName={customerName}
            table={table}
            whatsappPhone={whatsappPhone}
            orderId={sessionOrderId}
            onOrderCreated={handleOrderCreated}
          />
        ) : (
          <SelfServiceBill
            tableId={tableId!}
            customerName={customerName}
            orderId={sessionOrderId}
            onPaymentComplete={() => setShowThankYou(true)}
          />
        )}
      </div>
    </div>
  );
}
