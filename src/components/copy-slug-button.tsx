"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopySlugButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(slug);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center text-sm text-neutral-400 hover:text-neutral-600 transition-colors"
      style={{ gap: 6 }}
      title="Copy invite code"
    >
      <code className="text-xs bg-neutral-100 rounded font-mono" style={{ paddingLeft: 8, paddingRight: 8, paddingTop: 2, paddingBottom: 2 }}>
        {slug}
      </code>
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
