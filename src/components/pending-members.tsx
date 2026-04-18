"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, Clock } from "lucide-react";
import { updateMembership } from "@/lib/actions/groups";

interface PendingMember {
  id: string;
  user: { id: string; name: string; email: string };
}

export function PendingMembers({ members }: { members: PendingMember[] }) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function handleAction(membershipId: string, action: "approve" | "reject") {
    setLoadingId(membershipId);
    await updateMembership(membershipId, action);
    setLoadingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-medium text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5" />
        Pending requests ({members.length})
      </h2>
      <div className="space-y-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between p-3 rounded-xl border border-amber-200 bg-amber-50"
          >
            <div>
              <p className="text-sm font-medium text-neutral-900">{m.user.name}</p>
              <p className="text-sm text-neutral-500">{m.user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {loadingId === m.id ? (
                <Loader2 className="w-4 h-4 text-neutral-400 animate-spin" />
              ) : (
                <>
                  <button
                    onClick={() => handleAction(m.id, "reject")}
                    className="h-8 w-8 rounded-lg border border-neutral-200 bg-white text-neutral-400 hover:text-red-500 hover:border-red-200 inline-flex items-center justify-center transition-colors"
                    title="Reject"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleAction(m.id, "approve")}
                    className="h-8 w-8 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 inline-flex items-center justify-center transition-colors"
                    title="Approve"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
