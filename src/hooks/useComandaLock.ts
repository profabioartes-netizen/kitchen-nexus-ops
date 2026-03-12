import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const LOCK_DURATION_SECONDS = 90;
const RENEW_INTERVAL_MS = 60_000;
const RETRY_DELAY_MS = 3_000;
const MAX_RETRIES = 3;

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
  const retryCountRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const acquireLock = useCallback(async (isRetry = false) => {
    if (!tableId || !userId) return;
    try {
      const { data, error } = await supabase.rpc("acquire_comanda_lock", {
        p_table_id: tableId,
        p_user_id: userId,
        p_user_name: userName || "Usuário",
        p_duration_seconds: LOCK_DURATION_SECONDS,
      });
      if (error) {
        // Network/fetch errors — don't block the user, retry silently
        if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError")) {
          console.warn("Lock acquire network error, will retry...");
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            retryTimeoutRef.current = setTimeout(() => acquireLock(true), RETRY_DELAY_MS);
          }
          // Don't update lockInfo on network errors if we already have a lock
          if (!lockInfo || lockInfo.acquired) return;
          return;
        }
        console.error("Lock acquire error:", error);
        setLockInfo({ acquired: false });
      } else {
        retryCountRef.current = 0;
        setLockInfo(data as unknown as LockInfo);
      }
    } catch (err) {
      // Catch unexpected errors (e.g. fetch abort)
      console.warn("Lock acquire unexpected error:", err);
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        retryTimeoutRef.current = setTimeout(() => acquireLock(true), RETRY_DELAY_MS);
      }
    }
    setLoading(false);
  }, [tableId, userId, userName, lockInfo]);

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
    intervalRef.current = setInterval(() => acquireLock(), RENEW_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      releaseLock();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, userId]);

  // Listen for realtime changes to comanda_locks for this table
  // IMPORTANT: Do NOT call acquireLock here — it would create an infinite loop
  // (acquireLock updates the lock → triggers Realtime → calls acquireLock again)
  // Instead, just re-check the lock status via a lightweight read
  useEffect(() => {
    if (!tableId) return;
    const channel = supabase
      .channel(`comanda-lock-${tableId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comanda_locks", filter: `table_id=eq.${tableId}` },
        async (payload) => {
          // Only react if the change was made by a DIFFERENT user
          const newRow = (payload as any).new;
          if (newRow && newRow.locked_by_user_id === userId) return; // ignore own updates
          // Re-check lock status
          acquireLock();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, userId]);

  return { lockInfo, loading, releaseLock, retry: () => acquireLock() };
}
