import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings, Loader2, Save, Eye, EyeOff, CreditCard, AlertCircle, CheckCircle2, Lock, ArrowLeft, QrCode } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ADMIN_PIN = "9135";

function useSettingValue(key: string) {
  return useQuery({
    queryKey: ["restaurant_setting", key],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("value")
        .eq("key", key)
        .single();
      return data?.value ?? "";
    },
  });
}

function useUpsertSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data: existing } = await supabase
        .from("restaurant_settings")
        .select("key")
        .eq("key", key)
        .single();

      if (existing) {
        await supabase.from("restaurant_settings").update({ value }).eq("key", key);
      } else {
        await supabase.from("restaurant_settings").insert({ key, value });
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_setting", vars.key] });
      toast.success("Configuração salva!");
    },
    onError: () => toast.error("Erro ao salvar configuração"),
  });
}

function MercadoPagoCard({ upsert }: { upsert: ReturnType<typeof useUpsertSetting> }) {
  const { data: mpToken, isLoading } = useSettingValue("mercado_pago_access_token");
  const [localToken, setLocalToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (mpToken !== undefined) setLocalToken(mpToken);
  }, [mpToken]);

  const maskToken = (token: string) => {
    if (!token || token.length < 12) return token;
    return token.substring(0, 8) + "••••••••" + token.substring(token.length - 4);
  };

  const testConnection = async () => {
    if (!localToken.trim()) {
      toast.error("Informe o Access Token primeiro.");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-mercadopago`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: localToken.trim() }),
        }
      );
      const result = await res.json();
      setTestResult({ ok: result.ok, message: result.message });
    } catch {
      setTestResult({ ok: false, message: "Erro de rede. Verifique sua conexão." });
    } finally {
      setTesting(false);
    }
  };

  const saveToken = async () => {
    if (!localToken.trim()) {
      toast.error("Informe o Access Token.");
      return;
    }
    await upsert.mutateAsync({ key: "mercado_pago_access_token", value: localToken.trim() });
  };

  if (isLoading) return null;

  const isConfigured = !!mpToken;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-[#009ee3]" />
              Mercado Pago
            </CardTitle>
            <CardDescription>
              Integre com o Mercado Pago para receber pagamentos Pix automaticamente.
              O sistema gera cobranças dinâmicas e confirma o pagamento em tempo real.
            </CardDescription>
          </div>
          <div className={`px-2 py-1 rounded-full text-[10px] font-semibold ${isConfigured ? "bg-green-500/10 text-green-600" : "bg-muted text-muted-foreground"}`}>
            {isConfigured ? "Conectado" : "Não configurado"}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mp-token" className="text-sm font-medium">
            Access Token (Produção)
          </Label>
          <div className="relative">
            <input
              id="mp-token"
              type={showToken ? "text" : "password"}
              value={localToken}
              onChange={(e) => { setLocalToken(e.target.value); setTestResult(null); }}
              placeholder="APP_USR-0000000000000000-000000-00000000000000000000000000000000-000000000"
              className="w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-ring font-mono"
            />
            <button
              type="button"
              onClick={() => setShowToken(!showToken)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Encontre em:{" "}
            <a href="https://www.mercadopago.com.br/developers/panel/app" target="_blank" rel="noopener noreferrer" className="underline text-accent">
              Mercado Pago Developers → Suas integrações → Credenciais de produção
            </a>
          </p>
        </div>

        {testResult && (
          <div className={`flex items-center gap-2 rounded-md p-3 text-sm ${testResult.ok ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
            {testResult.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            {testResult.message}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={testConnection}
            disabled={testing || !localToken.trim()}
            className="flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Testar Conexão
          </button>
          <button
            onClick={saveToken}
            disabled={upsert.isPending || !localToken.trim()}
            className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Salvar
          </button>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1">
          <p className="text-xs font-medium text-foreground">Como obter o Access Token:</p>
          <ol className="text-[11px] text-muted-foreground space-y-0.5 list-decimal list-inside">
            <li>Acesse o painel de desenvolvedores do Mercado Pago</li>
            <li>Crie ou selecione uma aplicação</li>
            <li>Vá em "Credenciais de produção"</li>
            <li>Copie o "Access Token" e cole acima</li>
          </ol>
          <p className="text-[11px] text-muted-foreground mt-2">
            💡 Para trocar a conta, basta substituir o Access Token por um de outra conta Mercado Pago.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const upsert = useUpsertSetting();

  const { data: requiresApproval, isLoading: loadingApproval } = useSettingValue("self_service_requires_approval");
  const { data: selfServiceEnabled, isLoading: loadingSelfService } = useSettingValue("self_service_enabled");

  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <Lock className="h-8 w-8 text-muted-foreground" />
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
          className="w-40 text-center text-2xl tracking-[0.5em] rounded-md border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring"
          placeholder="••••"
        />
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>
    );
  }

  if (loadingApproval) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl h-full overflow-auto">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Configurações</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Auto-Atendimento</CardTitle>
          <CardDescription>
            Configure o comportamento dos pedidos feitos pelo QR Code nas mesas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="approval-toggle" className="text-sm font-medium">
                Aprovação obrigatória de pedidos
              </Label>
              <p className="text-xs text-muted-foreground">
                Quando ativado, os pedidos do auto-atendimento ficam pendentes até que um funcionário aprove.
                Quando desativado, os pedidos são enviados automaticamente para a cozinha.
              </p>
            </div>
            <Switch
              id="approval-toggle"
              checked={requiresApproval === "true"}
              onCheckedChange={(checked) =>
                upsert.mutate({ key: "self_service_requires_approval", value: String(checked) })
              }
              disabled={upsert.isPending}
            />
          </div>
        </CardContent>
      </Card>

      <MercadoPagoCard upsert={upsert} />
    </div>
  );
}