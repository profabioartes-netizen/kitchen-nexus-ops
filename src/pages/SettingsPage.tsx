import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Settings, Lock, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ADMIN_PIN = "9135";

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _useSettingValue(key: string) {
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

export default function SettingsPage() {
  const navigate = useNavigate();
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  // Reserved for future settings
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _upsert = useUpsertSetting();

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

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl h-full overflow-auto">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Configurações</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Sem configurações adicionais no momento.
      </p>
    </div>
  );
}
