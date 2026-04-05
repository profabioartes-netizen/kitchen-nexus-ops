import { supabase } from "@/integrations/supabase/client";

type ResolveOrderPrintLocationParams = {
  orderId?: string | null;
  tableId?: string | null;
  currentLocation?: string | null;
  originLocation?: string | null;
  tableInternalNumber?: string | null;
  tableDefaultName?: string | null;
  fallbackLocation?: string | null;
};

export type ResolvedOrderPrintLocation = {
  tableInternalNumber: string | null;
  tableDefaultName: string | null;
  orderCurrentLocation: string | null;
  orderOriginLocation: string | null;
  resolvedLocation: string;
};

const normalizeLocation = (value?: string | null) => {
  const normalized = value?.trim();
  return normalized ? normalized : null;
};

export async function resolveAndSyncOrderPrintLocation({
  orderId = null,
  tableId = null,
  currentLocation = null,
  originLocation = null,
  tableInternalNumber = null,
  tableDefaultName = null,
  fallbackLocation = "—",
}: ResolveOrderPrintLocationParams): Promise<ResolvedOrderPrintLocation> {
  let resolvedTableInternalNumber = normalizeLocation(tableInternalNumber);
  let resolvedTableDefaultName = normalizeLocation(tableDefaultName);

  if ((!resolvedTableInternalNumber && !resolvedTableDefaultName) && tableId) {
    const { data, error } = await supabase
      .from("restaurant_tables")
      .select("internal_number, default_name")
      .eq("id", tableId)
      .maybeSingle();

    if (error) {
      console.warn("[PRINT BILL] Falha ao buscar mesa para resolver local:", error);
    } else {
      resolvedTableInternalNumber = normalizeLocation(data?.internal_number);
      resolvedTableDefaultName = normalizeLocation(data?.default_name);
    }
  }

  const orderCurrentLocation = normalizeLocation(currentLocation);
  const orderOriginLocation = normalizeLocation(originLocation);
  const resolvedLocation =
    resolvedTableInternalNumber ||
    resolvedTableDefaultName ||
    orderCurrentLocation ||
    orderOriginLocation ||
    normalizeLocation(fallbackLocation) ||
    "—";

  if (orderId && resolvedLocation !== "—" && resolvedLocation !== orderCurrentLocation) {
    const { error } = await supabase
      .from("orders")
      .update({ current_location: resolvedLocation })
      .eq("id", orderId);

    if (error) {
      console.warn("[PRINT BILL] Falha ao sincronizar current_location antes da impressão:", error);
    }
  }

  return {
    tableInternalNumber: resolvedTableInternalNumber,
    tableDefaultName: resolvedTableDefaultName,
    orderCurrentLocation,
    orderOriginLocation,
    resolvedLocation,
  };
}
