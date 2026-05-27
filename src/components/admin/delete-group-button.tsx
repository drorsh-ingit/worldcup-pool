"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { deleteGroup } from "@/lib/actions/groups";

export function DeleteGroupButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const result = await deleteGroup(groupId);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    router.push("/dashboard");
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex items-center h-9 rounded-xl border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
        style={{ gap: 8, paddingLeft: 16, paddingRight: 16 }}
      >
        <Trash2 className="w-4 h-4" />
        Delete group
      </button>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 12 }}>
      <p className="text-sm text-neutral-700">
        Delete <span className="font-semibold">{groupName}</span>? This removes all members, bets, and results permanently.
      </p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex" style={{ gap: 8 }}>
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="h-9 rounded-xl border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          style={{ paddingLeft: 16, paddingRight: 16 }}
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="h-9 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors inline-flex items-center"
          style={{ paddingLeft: 16, paddingRight: 16, gap: 8 }}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          Yes, delete permanently
        </button>
      </div>
    </div>
  );
}
