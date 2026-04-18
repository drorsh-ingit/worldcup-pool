"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, X, Check } from "lucide-react";
import { joinGroup } from "@/lib/actions/groups";

export function JoinGroupDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setError("");
    setSuccess("");
    setLoading(true);

    const result = await joinGroup(formData);

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setSuccess(result.message || "Request sent!");
    setLoading(false);
    router.refresh();

    setTimeout(() => {
      setOpen(false);
      setSuccess("");
    }, 2000);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="h-9 px-3.5 rounded-xl border border-neutral-200 text-neutral-700 text-sm font-medium hover:bg-neutral-50 active:scale-[0.98] transition-all inline-flex items-center gap-1.5"
      >
        <UserPlus className="w-4 h-4" />
        Join
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/20"
        onClick={() => !loading && setOpen(false)}
      />
      <div className="relative w-full max-w-sm bg-white rounded-2xl border border-neutral-200 p-6 shadow-lg">
        <button
          onClick={() => !loading && setOpen(false)}
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-600"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-semibold text-neutral-900 mb-1">
          Join a group
        </h2>
        <p className="text-sm text-neutral-500 mb-5">
          Enter the invite code shared by your group admin.
        </p>

        {success ? (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm">
            <Check className="w-4 h-4" />
            {success}
          </div>
        ) : (
          <form ref={formRef} action={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-600 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="group-slug"
                className="block text-sm font-medium text-neutral-700"
              >
                Invite code
              </label>
              <input
                id="group-slug"
                name="slug"
                type="text"
                required
                placeholder="e.g., the-office-pool-a3k9"
                className="w-full h-11 px-3.5 rounded-xl border border-neutral-200 text-sm text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-300 focus:border-amber-500 focus:ring-0 outline-none bg-white font-mono"
              />
            </div>

            <div className="flex gap-2">
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
                className="flex-1 h-10 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 active:scale-[0.98] transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Join
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
