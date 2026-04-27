"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, X } from "lucide-react";
import { createGroup } from "@/lib/actions/groups";
import { TOURNAMENT_CATALOG } from "@/lib/tournaments/catalog";
import type { TournamentKind } from "@/lib/tournaments/types";

const LOGO_SRCS: Record<TournamentKind, string> = {
  WC_2026: "/logos/wc2026.webp",
  UCL_2026: "/logos/ucl2026.svg",
};

function TournamentLogo({ id, size = 40 }: { id: TournamentKind; size?: number }) {
  return (
    <div style={{ width: size, height: size, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <img
        src={LOGO_SRCS[id]}
        alt=""
        style={{ maxWidth: size, maxHeight: size, width: "auto", height: "auto", objectFit: "contain" }}
      />
    </div>
  );
}

export function CreateGroupDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedKind, setSelectedKind] = useState<TournamentKind>("WC_2026");
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set("tournamentKind", selectedKind);

    const result = await createGroup(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setOpen(false);
    setLoading(false);
    router.push(`/group/${result.groupId}`);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl text-white text-sm font-medium active:scale-[0.98] transition-all inline-flex items-center"
        style={{
          backgroundColor: "#4a8c2a",
          height: 36,
          paddingLeft: 16,
          paddingRight: 16,
          gap: 6,
        }}
      >
        <Plus className="w-4 h-4" />
        New group
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={() => !loading && setOpen(false)}
      />
      <div
        className="relative w-full max-w-sm bg-white rounded-2xl border border-neutral-200 shadow-lg"
        style={{ padding: 24 }}
      >
        <button
          onClick={() => !loading && setOpen(false)}
          className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-600"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-semibold text-neutral-900" style={{ marginBottom: 4 }}>
          Create a group
        </h2>
        <p className="text-sm text-neutral-500" style={{ marginBottom: 24 }}>
          You&apos;ll be the admin. Invite friends with the group code.
        </p>

        <form ref={formRef} onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-xl bg-red-50 text-red-600 text-sm" style={{ padding: 12, marginBottom: 16 }}>
              {error}
            </div>
          )}

          {/* Group name */}
          <div style={{ marginBottom: 20 }}>
            <label htmlFor="group-name" className="block text-sm font-medium text-neutral-700" style={{ marginBottom: 6 }}>
              Group name
            </label>
            <input
              id="group-name"
              name="name"
              type="text"
              required
              placeholder='e.g., "The Office Pool"'
              className="w-full h-11 rounded-xl border border-neutral-200 text-sm text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-300 outline-none bg-white"
              style={{ paddingLeft: 14, paddingRight: 14 }}
            />
          </div>

          {/* Tournament picker */}
          <div style={{ marginBottom: 24 }}>
            <label className="block text-sm font-medium text-neutral-700" style={{ marginBottom: 10 }}>
              Tournament
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TOURNAMENT_CATALOG.map((t) => {
                const selected = selectedKind === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedKind(t.id as TournamentKind)}
                    className="w-full rounded-xl border text-left transition-colors"
                    style={{
                      padding: 12,
                      borderColor: selected ? "#4a8c2a" : "#e5e5e5",
                      backgroundColor: selected ? "#f0faf0" : "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <TournamentLogo id={t.id as TournamentKind} size={36} />
                    <div>
                      <div className="text-sm font-medium text-neutral-900">{t.displayName}</div>
                      <div className="text-xs text-neutral-500">{t.shortName}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              className="flex-1 h-10 rounded-xl border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-10 rounded-xl text-white text-sm font-medium active:scale-[0.98] transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
              style={{ backgroundColor: "#4a8c2a" }}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
