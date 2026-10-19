"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Refresh visible data, including after a mobile tab resumes or reconnects. */
export function useLiveRefresh(
  resourceKey: string,
  refresh: (signal: AbortSignal) => Promise<boolean | void>,
  intervalMs = 1000
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
      let timedOut = false;
      const deadline = window.setTimeout(() => { timedOut = true; request.abort(); }, 15000);
      // A suspended mobile request can ignore abort until its network operation
      // settles. Release the refresh loop independently so resume can read again.
      let onAbort: () => void = () => {};
      const interrupted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new DOMException("Refresh interrupted", "AbortError"));
        request.signal.addEventListener("abort", onAbort, { once: true });
      });
      let keepPolling = true;
      try {
        keepPolling = (await Promise.race([callback.current(request.signal), interrupted])) !== false;
        if (!stopped && !request.signal.aborted) setRefreshError(false);
      } catch {
        if (!stopped && document.visibilityState === "visible" && (!request.signal.aborted || timedOut)) setRefreshError(true);
      } finally {
        window.clearTimeout(deadline);
        request.signal.removeEventListener("abort", onAbort);
        inFlight = false;
        if (!stopped && document.visibilityState === "visible") {
          if (pending) { pending = false; void run(); }
          // Reconcile idle screens too: a missed mobile lifecycle event or work
          // started elsewhere must not require the user to reload the page.
          else timer = window.setTimeout(() => void run(), keepPolling ? intervalMs : Math.max(intervalMs, 15000));
        }
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { clearTimer(); controller?.abort(); }
      else void run();
    };
    const onResume = () => {
      if (inFlight) { pending = true; controller?.abort(); }
      else void run();
    };
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
