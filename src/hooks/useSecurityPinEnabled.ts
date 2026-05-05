import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Lê a flag `security_pin_enabled` em restaurant_settings do tenant atual.
 * Padrão: true (PIN exigido). Quando 'false', as áreas sensíveis liberam acesso direto.
 */
export function useSecurityPinEnabled() {
  const { tenant } = useTenant();
  const { data, isLoading } = useQuery({
    queryKey: ["security_pin_enabled", tenant?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("value")
        .eq("key", "security_pin_enabled")
        .maybeSingle();
      // Default: true (exigir PIN). Só desabilita se vier explicitamente "false".
      return data?.value !== "false";
    },
    enabled: !!tenant?.id,
    staleTime: 60_000,
  });
  return { pinEnabled: data ?? true, loading: isLoading };
}
