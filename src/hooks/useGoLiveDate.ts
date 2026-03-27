import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the system go-live date. All operational queries
 * (reports, sales, dashboard KPIs) should filter orders
 * with created_at >= this date.
 */
export function useGoLiveDate() {
  const { data: goLiveAt, isLoading } = useQuery({
    queryKey: ["system_go_live_at"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("value")
        .eq("key", "system_go_live_at")
        .single();
      return data?.value ?? null;
    },
    staleTime: 5 * 60 * 1000, // cache 5 min
  });

  return { goLiveAt, isLoading };
}
