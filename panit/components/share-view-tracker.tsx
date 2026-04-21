"use client";

import { useEffect, useRef, useState } from "react";
import { isSharePublicId } from "@/lib/share";

type Props = { shareToken: string; initialViews?: number };

/**
 * Records one view per page load for `shares.public_id` URLs (abuse-limited per IP in middleware).
 * Legacy slug/UUID share URLs do not call the API (no `shares` row).
 */
export function ShareViewTracker({ shareToken, initialViews }: Props) {
  const sent = useRef(false);
  const [viewCount, setViewCount] = useState<number | null>(
    typeof initialViews === "number" ? initialViews : null,
  );

  useEffect(() => {
    if (!isSharePublicId(shareToken)) {
      return;
    }
    if (sent.current) return;
    sent.current = true;

    const body = JSON.stringify({ id: shareToken.trim() });

    const run = () => {
      fetch("/api/share/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      })
        .then(async (res) => {
          if (!res.ok) return;
          const data = (await res.json()) as { viewCount?: number };
          if (typeof data.viewCount === "number") setViewCount(data.viewCount);
        })
        .catch(() => {});
    };

    run();
  }, [shareToken]);

  if (!isSharePublicId(shareToken)) {
    return null;
  }

  if (viewCount === null) {
    return (
      <p className="text-xs text-ink-muted text-center sm:text-left" aria-live="polite">
        Listens: …
      </p>
    );
  }

  return (
    <p className="text-xs text-ink-muted text-center sm:text-left" aria-live="polite">
      {viewCount === 1 ? "1 listen" : `${viewCount} listens`}
    </p>
  );
}
