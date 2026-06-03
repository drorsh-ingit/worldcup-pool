"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { updateName } from "@/lib/actions/profile";

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    setError("");

    const formData = new FormData(e.currentTarget);
    const result = await updateName(formData);

    if (result.error) {
      setError(result.error);
    } else {
      // Refresh the NextAuth session so the name updates everywhere
      await update();
      setSuccess(true);
    }
    setLoading(false);
  }

  return (
    <div className="max-w-md mx-auto" style={{ paddingTop: 40, display: "flex", flexDirection: "column", gap: 32 }}>
      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
          style={{ marginBottom: 16 }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>
        <h1 className="text-4xl font-black tracking-tight text-neutral-900">Profile</h1>
      </div>

      {/* Form */}
      <div className="rounded-2xl border border-neutral-200 bg-white" style={{ padding: 28 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="name" className="text-sm font-medium text-neutral-700">
              Display name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={50}
              defaultValue={session?.user?.name ?? ""}
              placeholder="Your name"
              className="w-full h-11 rounded-xl border border-neutral-300 text-sm text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent bg-white"
              style={{ paddingLeft: 14, paddingRight: 14 }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="text-sm font-medium text-neutral-700">Email</label>
            <p className="text-sm text-neutral-500 h-11 flex items-center"
              style={{ paddingLeft: 14 }}>
              {session?.user?.email}
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-500 rounded-xl bg-red-50" style={{ padding: 12 }}>{error}</p>
          )}
          {success && (
            <p className="text-sm text-emerald-600 rounded-xl bg-emerald-50" style={{ padding: 12 }}>Name updated!</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-xl bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center"
            style={{ gap: 8 }}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
