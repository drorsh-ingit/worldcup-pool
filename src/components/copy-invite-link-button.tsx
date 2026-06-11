"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";

export function CopyInviteLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const url = `${window.location.origin}/join/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — no-op
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
      style={{ gap: 4, padding: 0 }}
      title="Copy a direct join link"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-emerald-500" />
          <span className="text-xs">Link copied</span>
        </>
      ) : (
        <>
          <Link2 className="w-4 h-4 text-neutral-400" />
          <span className="text-xs">Share link</span>
        </>
      )}
    </button>
  );
}
