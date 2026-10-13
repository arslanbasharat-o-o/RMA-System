"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Refresh visible data, including after a mobile tab resumes or reconnects. */
export function useLiveRefresh(
  resourceKey: string,
  refresh: (signal: AbortSignal) => Promise<boolean | void>,
  intervalMs = 4000
) {
  const callback = useRef(refresh);
  const trigger = useRef<() => void>(() => {});
  const [refreshError, setRefreshError] = useState(false);
  useEffect(() => { callback.current = refresh; }, [refresh]);
  const refreshNow = useCallback(() => trigger.current(), []);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let pending = false;
    let timer: number | undefined;
    let controller: AbortController | undefined;
    const clearTimer = () => { if (timer !== undefined) window.clearTimeout(timer); };

    const run = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      clearTimer();
      if (inFlight) { pending = true; return; }
      inFlight = true;
      const request = new AbortController();
      controller = request;
      const deadline = window.setTimeout(() => request.abort(), 15000);
      let keepPolling = true;
      try {
        keepPolling = (await callback.current(request.signal)) !== false;
        if (!stopped && !request.signal.aborted) setRefreshError(false);
      } catch {
        if (!stopped && document.visibilityState === "visible") setRefreshError(true);
      } finally {
        window.clearTimeout(deadline);
        inFlight = false;
        if (!stopped && document.visibilityState === "visible") {
          if (pending) { pending = false; void run(); }
          else if (keepPolling) timer = window.setTimeout(() => void run(), intervalMs);
        }
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { clearTimer(); controller?.abort(); }
      else void run();
    };
    const onResume = () => { void run(); };
    trigger.current = onResume;
    void run();
    window.addEventListener("focus", onResume);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("online", onResume);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimer();
      controller?.abort();
      trigger.current = () => {};
      window.removeEventListener("focus", onResume);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("online", onResume);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [resourceKey, intervalMs]);

  return { refreshNow, refreshError };
}
