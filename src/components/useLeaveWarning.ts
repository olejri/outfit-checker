"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Holds back leaving a page with unsaved changes. Links inside the app are stopped and
 * their address is returned as `pending`, so the page can ask in its own sheet (the
 * router has no navigation event to hook into). Reloading or closing the tab can only
 * use the browser's own prompt.
 */
export function useLeaveWarning(active: boolean) {
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || link.target === "_blank" || link.origin !== location.origin) return;
      if (link.pathname === location.pathname && link.search === location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(link.pathname + link.search + link.hash);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [active]);

  /** Ask before going to `href` (for buttons that navigate). */
  const ask = useCallback((href: string) => setPending(href), []);
  const cancel = useCallback(() => setPending(null), []);
  return { pending, ask, cancel };
}
