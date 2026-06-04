"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { updateProfile } from "@/lib/actions/profile";
import { getInitials, getAvatarColor, AVATAR_COLOR_OPTIONS, AVATAR_EMOJIS } from "@/lib/avatar";

interface Props {
  initialName: string;
  email: string;
  initialColor: number | null;
  initialEmoji: string | null;
  userId: string;
}

export function SettingsForm({ initialName, email, initialColor, initialEmoji, userId }: Props) {
  const { update } = useSession();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(initialName);
  const [selectedColor, setSelectedColor] = useState<number | null>(initialColor);
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(initialEmoji);

  const initials = getInitials(name || initialName);
  const color = selectedColor != null
    ? AVATAR_COLOR_OPTIONS[selectedColor]
    : getAvatarColor(userId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    setError("");

    const formData = new FormData(e.currentTarget);
    if (selectedColor != null) formData.set("avatarColor", String(selectedColor));
    formData.set("avatarEmoji", selectedEmoji ?? "");
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

      <div className="rounded-2xl border border-neutral-200 bg-white" style={{ padding: 28 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 28 }}>

          {/* Live avatar preview */}
          <div className="flex items-center" style={{ gap: 16 }}>
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: color.bg, color: color.text, fontSize: selectedEmoji ? 28 : 18, fontWeight: selectedEmoji ? "normal" : "bold" }}
            >
              {selectedEmoji ?? initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">{name || initialName}</p>
              <p className="text-xs text-neutral-400" style={{ marginTop: 2 }}>{email}</p>
            </div>
          </div>

          {/* Color picker */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="text-sm font-medium text-neutral-700">Background color</label>
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
                    boxShadow: selectedColor === c.id ? "0 0 0 2px white inset" : "none",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Emoji avatar picker */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-neutral-700">Avatar illustration</label>
              {selectedEmoji && (
                <button
                  type="button"
                  onClick={() => setSelectedEmoji(null)}
                  className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
                >
                  Use initials instead
                </button>
              )}
            </div>
            <div className="flex flex-wrap" style={{ gap: 6 }}>
              {AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setSelectedEmoji(selectedEmoji === emoji ? null : emoji)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all hover:scale-110"
                  style={{
                    backgroundColor: selectedEmoji === emoji ? color.bg : "#f3f4f6",
                    outline: selectedEmoji === emoji ? `2px solid ${color.bg}` : "none",
                    outlineOffset: 2,
                  }}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="name" className="text-sm font-medium text-neutral-700">Display name</label>
            <input
              id="name"
              name="name"
              type="text"
              required
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full h-11 rounded-xl border border-neutral-300 text-sm text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent bg-white"
              style={{ paddingLeft: 14, paddingRight: 14 }}
            />
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
