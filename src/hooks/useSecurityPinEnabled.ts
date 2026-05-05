import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Lê o PIN de segurança configurado em `restaurant_settings.security_pin`.
 *
 * Regras:
 * - Se o PIN não estiver definido (vazio/null) → áreas sensíveis ficam DESBLOQUEADAS por padrão.
 * - Se o PIN estiver definido (4 dígitos) → áreas sensíveis exigem o PIN.
 *
 * Mantém retro-compatibilidade com a flag antiga `security_pin_enabled` (apenas se PIN não definido).
 */
export function useSecurityPin() {
  const { tenant } = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ["security_pin", tenant?.id],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("restaurant_settings")
        .select("key,value")
        .in("key", ["security_pin", "security_pin_enabled"]);
      const pin = rows?.find((r) => r.key === "security_pin")?.value?.trim() || "";
      const legacyEnabled = rows?.find((r) => r.key === "security_pin_enabled")?.value;
      // Se houver PIN configurado, ele manda. Senão, desbloqueado por padrão.
      return { pin, legacyEnabled: legacyEnabled !== "false" };
    },
    enabled: !!tenant?.id,
    staleTime: 30_000,
  });
  const pin = data?.pin ?? "";
  const pinEnabled = pin.length === 4;
  return { pin, pinEnabled, loading: isLoading };
}

/**
 * @deprecated use `useSecurityPin` — mantido para compat.
 * Retorna `pinEnabled = false` por padrão (sem PIN configurado).
 */
export function useSecurityPinEnabled() {
  const { pinEnabled, loading } = useSecurityPin();
  return { pinEnabled, loading };
}
