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
      className="inline-flex items-center rounded-xl border border-neutral-200 text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50 transition-colors"
      style={{ height: 36, paddingLeft: 14, paddingRight: 14, gap: 8 }}
      title="Copy a direct join link"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-emerald-500" />
          Link copied
        </>
      ) : (
        <>
          <Link2 className="w-4 h-4 text-neutral-400" />
          Copy invite link
        </>
      )}
    </button>
  );
}
