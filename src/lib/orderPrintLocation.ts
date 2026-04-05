import { supabase } from "@/integrations/supabase/client";

type ResolveOrderPrintLocationParams = {
  orderId?: string | null;
  tableId?: string | null;
  currentLocation?: string | null;
  originLocation?: string | null;
  tableSector?: string | null;
  tableInternalNumber?: string | null;
  tableDefaultName?: string | null;
  fallbackLocation?: string | null;
};

export type ResolvedOrderPrintLocation = {
  tableSector: string | null;
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
  tableSector = null,
  tableInternalNumber = null,
  tableDefaultName = null,
  fallbackLocation = "—",
}: ResolveOrderPrintLocationParams): Promise<ResolvedOrderPrintLocation> {
  let resolvedTableSector = normalizeLocation(tableSector);
  let resolvedTableInternalNumber = normalizeLocation(tableInternalNumber);
  let resolvedTableDefaultName = normalizeLocation(tableDefaultName);

  if (tableId && (!resolvedTableSector || !resolvedTableInternalNumber || !resolvedTableDefaultName)) {
    const { data, error } = await supabase
      .from("restaurant_tables")
      .select("sector, internal_number, default_name")
      .eq("id", tableId)
      .maybeSingle();

    if (error) {
      console.warn("[PRINT BILL] Falha ao buscar mesa para resolver local:", error);
    } else {
      resolvedTableSector = normalizeLocation(data?.sector);
      resolvedTableInternalNumber = normalizeLocation(data?.internal_number);
      resolvedTableDefaultName = normalizeLocation(data?.default_name);
    }
  }

  const orderCurrentLocation = normalizeLocation(currentLocation);
  const orderOriginLocation = normalizeLocation(originLocation);
  const resolvedLocation =
    resolvedTableSector ||
    orderCurrentLocation ||
    resolvedTableInternalNumber ||
    resolvedTableDefaultName ||
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
    tableSector: resolvedTableSector,
    tableInternalNumber: resolvedTableInternalNumber,
    tableDefaultName: resolvedTableDefaultName,
    orderCurrentLocation,
    orderOriginLocation,
    resolvedLocation,
  };
}
