import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings, Loader2, Save } from "lucide-react";

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

export default function SettingsPage() {
  const upsert = useUpsertSetting();

  const { data: requiresApproval, isLoading: loadingApproval } = useSettingValue("self_service_requires_approval");
  const { data: pixKey, isLoading: loadingPixKey } = useSettingValue("pix_key");
  const { data: pixName, isLoading: loadingPixName } = useSettingValue("pix_recipient_name");
  const { data: pixCity, isLoading: loadingPixCity } = useSettingValue("pix_city");

  const [localPixKey, setLocalPixKey] = useState("");
  const [localPixName, setLocalPixName] = useState("");
  const [localPixCity, setLocalPixCity] = useState("");

  useEffect(() => { if (pixKey !== undefined) setLocalPixKey(pixKey); }, [pixKey]);
  useEffect(() => { if (pixName !== undefined) setLocalPixName(pixName); }, [pixName]);
  useEffect(() => { if (pixCity !== undefined) setLocalPixCity(pixCity || "SAO PAULO"); }, [pixCity]);

  const isLoading = loadingApproval || loadingPixKey || loadingPixName || loadingPixCity;

  const savePixSettings = async () => {
    if (!localPixKey.trim() || !localPixName.trim()) {
      toast.error("Preencha a chave Pix e o nome do recebedor.");
      return;
    }
    await upsert.mutateAsync({ key: "pix_key", value: localPixKey.trim() });
    await upsert.mutateAsync({ key: "pix_recipient_name", value: localPixName.trim().toUpperCase() });
    await upsert.mutateAsync({ key: "pix_city", value: localPixCity.trim().toUpperCase() || "SAO PAULO" });
  };

  if (isLoading) {
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pagamento Pix</CardTitle>
          <CardDescription>
            Configure sua chave Pix para que os clientes possam pagar diretamente pelo autoatendimento.
            Um QR Code será gerado automaticamente com o valor da conta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pix-key" className="text-sm font-medium">
              Chave Pix
            </Label>
            <input
              id="pix-key"
              type="text"
              value={localPixKey}
              onChange={(e) => setLocalPixKey(e.target.value)}
              placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pix-name" className="text-sm font-medium">
              Nome do recebedor
            </Label>
            <input
              id="pix-name"
              type="text"
              value={localPixName}
              onChange={(e) => setLocalPixName(e.target.value)}
              placeholder="Nome que aparece no Pix (ex: COFFEE THRONES)"
              maxLength={25}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pix-city" className="text-sm font-medium">
              Cidade
            </Label>
            <input
              id="pix-city"
              type="text"
              value={localPixCity}
              onChange={(e) => setLocalPixCity(e.target.value)}
              placeholder="Cidade do estabelecimento"
              maxLength={15}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <button
            onClick={savePixSettings}
            disabled={upsert.isPending}
            className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Salvar Configurações Pix
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
