"use client";

import { useState } from "react";

type Props = {
  excerpt: string;
  full: string;
  truncated: boolean;
};

export function ShareText({ excerpt, full, truncated }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!truncated) {
    return (
      <div className="prose prose-stone max-w-none whitespace-pre-wrap text-ink">
        {full}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="prose prose-stone max-w-none whitespace-pre-wrap text-ink">
        {expanded ? full : excerpt}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="text-sm font-medium text-accent hover:underline"
      >
        {expanded ? "Show less" : "Read full text"}
      </button>
    </div>
  );
}
