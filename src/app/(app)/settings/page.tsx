"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { updateProfile } from "@/lib/actions/profile";
import { getInitials, getAvatarColor, AVATAR_COLOR_OPTIONS } from "@/lib/avatar";

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [selectedColor, setSelectedColor] = useState<number | null>(null);

  const name = session?.user?.name ?? "";
  const initials = getInitials(name);
  // Use selected color, or fall back to the deterministic one from the user id
  const colorIdx = selectedColor ?? null;
  const color = colorIdx != null
    ? AVATAR_COLOR_OPTIONS[colorIdx]
    : getAvatarColor(session?.user?.id ?? name);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    setError("");

    const formData = new FormData(e.currentTarget);
    if (selectedColor != null) formData.set("avatarColor", String(selectedColor));
    const result = await updateProfile(formData);

    if (result.error) {
      setError(result.error);
    } else {
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
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 24 }}>

          {/* Avatar preview + color picker */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label className="text-sm font-medium text-neutral-700">Avatar color</label>
            <div className="flex items-center" style={{ gap: 16 }}>
              {/* Preview */}
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                style={{ backgroundColor: color.bg, color: color.text }}
              >
                {initials}
              </div>
              {/* Color swatches */}
              <div className="flex flex-wrap" style={{ gap: 8 }}>
                {AVATAR_COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedColor(c.id)}
                    className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                    style={{
                      backgroundColor: c.bg,
                      outline: selectedColor === c.id ? `3px solid ${c.bg}` : "none",
                      outlineOffset: 2,
                      boxShadow: selectedColor === c.id ? "0 0 0 1px white inset" : "none",
                    }}
                    title={`Color ${c.id + 1}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Name */}
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
              defaultValue={name}
              placeholder="Your name"
              className="w-full h-11 rounded-xl border border-neutral-300 text-sm text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent bg-white"
              style={{ paddingLeft: 14, paddingRight: 14 }}
            />
          </div>

          {/* Email (read-only) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="text-sm font-medium text-neutral-700">Email</label>
            <p className="text-sm text-neutral-500 h-11 flex items-center" style={{ paddingLeft: 14 }}>
              {session?.user?.email}
            </p>
          </div>

          {error && <p className="text-sm text-red-500 rounded-xl bg-red-50" style={{ padding: 12 }}>{error}</p>}
          {success && <p className="text-sm text-emerald-600 rounded-xl bg-emerald-50" style={{ padding: 12 }}>Profile updated!</p>}

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
