"use client";

import { useEffect, useState } from "react";
import { relativeAgo } from "@/lib/ui";

/**
 * A relative timestamp that keeps telling the truth (Codex P2 on PR #279).
 *
 * The recent-verifications strip is server-rendered, so `relativeAgo()` was
 * evaluated once per request. A till sits open between customers, and the
 * page only re-renders on navigation or the post-success `router.refresh()` —
 * so an entry could still read "just now" an hour later. On the one surface
 * whose entire job is answering "did that one just go through?", a frozen
 * "just now" is worse than no timestamp: it can talk staff into verifying a
 * code that was already used.
 *
 * So the label re-computes on a timer. 30s is well under the smallest step
 * the formatter can show, and one interval per row on a page with three rows
 * costs nothing.
 *
 * `suppressHydrationWarning`: the server's string and the client's first
 * render can legitimately differ when the clock crosses a boundary between
 * the two, which is a correct update, not a mismatch to fix.
 */
const TICK_MS = 30_000;

export function LiveAgo({ iso }: { iso: string }) {
  const [label, setLabel] = useState(() => relativeAgo(iso));

  useEffect(() => {
    setLabel(relativeAgo(iso));
    const t = setInterval(() => setLabel(relativeAgo(iso)), TICK_MS);
    return () => clearInterval(t);
  }, [iso]);

  return <span suppressHydrationWarning>{label}</span>;
}
