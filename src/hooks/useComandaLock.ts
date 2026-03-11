import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const LOCK_DURATION_SECONDS = 90;
const RENEW_INTERVAL_MS = 60_000; // renew every 60s (before 90s expiry)

interface LockInfo {
  acquired: boolean;
  lockedByUserName?: string;
  lockExpiresAt?: string;
}

export function useComandaLock(
  tableId: string | undefined,
  userId: string | undefined,
  userName: string | undefined,
) {
  const [lockInfo, setLockInfo] = useState<LockInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const acquireLock = useCallback(async () => {
    if (!tableId || !userId) return;
    const { data, error } = await supabase.rpc("acquire_comanda_lock", {
      p_table_id: tableId,
      p_user_id: userId,
      p_user_name: userName || "Usuário",
      p_duration_seconds: LOCK_DURATION_SECONDS,
    });
    if (error) {
      console.error("Lock acquire error:", error);
      setLockInfo({ acquired: false });
    } else {
      setLockInfo(data as unknown as LockInfo);
    }
    setLoading(false);
  }, [tableId, userId, userName]);

  const releaseLock = useCallback(async () => {
    if (!tableId || !userId) return;
    await supabase.rpc("release_comanda_lock", {
      p_table_id: tableId,
      p_user_id: userId,
    });
  }, [tableId, userId]);

  // Acquire on mount, release on unmount
  useEffect(() => {
    if (!tableId || !userId) {
      setLoading(false);
      return;
    }

    acquireLock();

    // Renew lock periodically
    intervalRef.current = setInterval(acquireLock, RENEW_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Release lock on unmount (fire-and-forget)
      releaseLock();
    };
  }, [tableId, userId, acquireLock, releaseLock]);

  // Listen for realtime changes to comanda_locks for this table
  useEffect(() => {
    if (!tableId) return;
    const channel = supabase
      .channel(`comanda-lock-${tableId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comanda_locks", filter: `table_id=eq.${tableId}` },
        () => {
          // Re-check lock status when lock changes
          acquireLock();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tableId, acquireLock]);

  return { lockInfo, loading, releaseLock, retry: acquireLock };
}
