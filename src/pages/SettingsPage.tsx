import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Settings, Loader2 } from "lucide-react";

export default function SettingsPage() {
  const queryClient = useQueryClient();

  const { data: requiresApproval, isLoading } = useQuery({
    queryKey: ["self_service_requires_approval"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("value")
        .eq("key", "self_service_requires_approval")
        .single();
      return data?.value === "true";
    },
  });

  const toggleApproval = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data: existing } = await supabase
        .from("restaurant_settings")
        .select("key")
        .eq("key", "self_service_requires_approval")
        .single();

      if (existing) {
        await supabase
          .from("restaurant_settings")
          .update({ value: String(enabled) })
          .eq("key", "self_service_requires_approval");
      } else {
        await supabase
          .from("restaurant_settings")
          .insert({ key: "self_service_requires_approval", value: String(enabled) });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["self_service_requires_approval"] });
      toast.success("Configuração salva!");
    },
    onError: () => toast.error("Erro ao salvar configuração"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">
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
              checked={!!requiresApproval}
              onCheckedChange={(checked) => toggleApproval.mutate(checked)}
              disabled={toggleApproval.isPending}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
