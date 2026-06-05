"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Shuffle, Bell, BellOff } from "lucide-react";
import Link from "next/link";
import { updateProfile } from "@/lib/actions/profile";
import { getInitials, getAvatarColor, AVATAR_COLOR_OPTIONS, DICEBEAR_STYLES, dicebearUrl, randomSeed } from "@/lib/avatar";
import { usePushNotifications } from "@/hooks/use-push-notifications";

interface Props {
  initialName: string;
  realName: string;
  email: string;
  initialColor: number | null;
  initialStyle: string | null;
  initialSeed: string | null;
  userId: string;
}

export function SettingsForm({ initialName, realName, email, initialColor, initialStyle, initialSeed, userId }: Props) {
  const { update } = useSession();
  const router = useRouter();
  const { permission, subscribed, loading: pushLoading, subscribe, unsubscribe, debugInfo, canPush } = usePushNotifications();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState(initialName);
  const [selectedColor, setSelectedColor] = useState<number | null>(initialColor);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(initialStyle);
  const [seed, setSeed] = useState<string>(initialSeed ?? userId.slice(-8));

  const initials = getInitials(realName);
  const color = selectedColor != null ? AVATAR_COLOR_OPTIONS[selectedColor] : getAvatarColor(userId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setSuccess(false);
    setError("");

    const formData = new FormData(e.currentTarget);
    if (selectedColor != null) formData.set("avatarColor", String(selectedColor));
    formData.set("avatarStyle", selectedStyle ?? "");
    formData.set("avatarSeed", seed);
    const result = await updateProfile(formData);

    if (result.error) {
      setError(result.error);
    } else {
      await update();
      setSuccess(true);
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="max-w-lg mx-auto" style={{ paddingTop: 40, display: "flex", flexDirection: "column", gap: 32 }}>
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors" style={{ marginBottom: 16 }}>
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </Link>
        <h1 className="text-4xl font-black tracking-tight text-neutral-900">Profile</h1>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white" style={{ padding: 28 }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 28 }}>

          {/* Live preview */}
          <div className="flex items-center" style={{ gap: 16 }}>
            <div className="w-16 h-16 rounded-full overflow-hidden shrink-0 flex items-center justify-center"
              style={{ backgroundColor: color.bg }}>
              {selectedStyle ? (
                <img src={dicebearUrl(selectedStyle, seed)} alt="avatar" className="w-full h-full" />
              ) : (
                <span style={{ color: color.text, fontSize: 20, fontWeight: "bold" }}>{initials}</span>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-900">{name || initialName}</p>
              <p className="text-xs text-neutral-400" style={{ marginTop: 2 }}>{email}</p>
            </div>
          </div>

          {/* Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="name" className="text-sm font-medium text-neutral-700">Display name</label>
            <input
              id="name" name="name" type="text" required maxLength={50}
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full h-11 rounded-xl border border-neutral-300 text-sm text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent bg-white"
              style={{ paddingLeft: 14, paddingRight: 14 }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="text-sm font-medium text-neutral-700">Email</label>
            <p className="text-sm text-neutral-500 h-11 flex items-center" style={{ paddingLeft: 14 }}>{email}</p>
          </div>

          {/* Avatar style picker */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-neutral-700">Avatar style</label>
              <div className="flex items-center" style={{ gap: 8 }}>
                {selectedStyle && (
                  <button type="button" onClick={() => setSelectedStyle(null)} className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
                    Use initials
                  </button>
                )}
                {selectedStyle && (
                  <button
                    type="button"
                    onClick={() => setSeed(randomSeed())}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors"
                    style={{ paddingLeft: 10, paddingRight: 10, paddingTop: 5, paddingBottom: 5 }}
                  >
                    <Shuffle className="w-3 h-3" /> Shuffle
                  </button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {/* Initials option */}
              <button
                type="button"
                onClick={() => setSelectedStyle(null)}
                className={`flex flex-col items-center rounded-xl border-2 transition-all ${!selectedStyle ? "border-emerald-500 bg-emerald-50" : "border-neutral-200 hover:border-neutral-300 bg-white"}`}
                style={{ padding: "12px 8px", gap: 8 }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ backgroundColor: color.bg, color: color.text }}>
                  {initials}
                </div>
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${!selectedStyle ? "text-emerald-700" : "text-neutral-400"}`}>Initials</span>
              </button>

              {DICEBEAR_STYLES.map((style) => {
                const isSelected = selectedStyle === style.id;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setSelectedStyle(style.id)}
                    className={`flex flex-col items-center rounded-xl border-2 transition-all ${isSelected ? "border-emerald-500 bg-emerald-50" : "border-neutral-200 hover:border-neutral-300 bg-white"}`}
                    style={{ padding: "12px 8px", gap: 8 }}
                  >
                    <img
                      src={dicebearUrl(style.id, seed)}
                      alt={style.label}
                      className="w-12 h-12 rounded-full"
                      style={{ backgroundColor: "#f3f4f6" }}
                    />
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${isSelected ? "text-emerald-700" : "text-neutral-400"}`}>
                      {style.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Background color — always available */}
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

          {/* Push notifications */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="text-sm font-medium text-neutral-700">Notifications</label>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Toggle — only when push is available on this device/browser */}
              {canPush && permission !== "unsupported" && (
                <>
                  {permission === "denied" ? (
                    <div className="flex items-center" style={{ gap: 10 }}>
                      <BellOff className="w-4 h-4 text-neutral-400 shrink-0" />
                      <p className="text-sm text-neutral-500">Notifications are blocked. Enable them in your browser settings, then reload.</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between" style={{ gap: 12 }}>
                      <div className="flex items-center" style={{ gap: 10 }}>
                        {subscribed
                          ? <Bell className="w-4 h-4 text-emerald-600 shrink-0" />
                          : <BellOff className="w-4 h-4 text-neutral-400 shrink-0" />
                        }
                        <div>
                          <p className="text-sm font-medium text-neutral-900">
                            {subscribed ? "Notifications enabled" : "Enable notifications"}
                          </p>
                          <p className="text-xs text-neutral-500" style={{ marginTop: 2 }}>
                            {subscribed
                              ? "You'll be notified when new bets open."
                              : "Get notified when new bets open."}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={subscribed ? unsubscribe : subscribe}
                        disabled={pushLoading}
                        className={`text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                          subscribed
                            ? "text-neutral-500 bg-white border border-neutral-200 hover:bg-neutral-50"
                            : "text-white bg-neutral-900 hover:bg-neutral-700"
                        }`}
                        style={{ paddingLeft: 14, paddingRight: 14, paddingTop: 7, paddingBottom: 7, whiteSpace: "nowrap" }}
                      >
                        {pushLoading ? "…" : subscribed ? "Turn off" : "Turn on"}
                      </button>
                    </div>
                  )}

                  {/* Debug info */}
                  {debugInfo && (
                    <p className="text-xs font-mono text-amber-700 bg-amber-50 rounded-lg" style={{ padding: "6px 10px" }}>{debugInfo}</p>
                  )}
                </>
              )}

              {/* Instructions — always shown (with separator if toggle is above) */}
              {canPush && permission !== "unsupported" && permission !== "denied" && !subscribed && (
                <div className="border-t border-neutral-200" style={{ paddingTop: 10 }}>
                  <p className="text-xs font-medium text-neutral-500" style={{ marginBottom: 6 }}>How to enable on your device:</p>
                  <ul className="text-xs text-neutral-400" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <li><span className="font-medium text-neutral-500">Android</span> — tap "Turn on" above and allow when prompted.</li>
                    <li><span className="font-medium text-neutral-500">iPhone / iPad</span> — first add this app to your Home Screen: set Safari as your default browser (Settings → Safari → Default Browser App), open this site in Safari, tap the Share button → &quot;Add to Home Screen&quot;. Then open from your Home Screen and come back here to turn on notifications. You can switch your default browser back afterwards.</li>
                  </ul>
                </div>
              )}

              {!canPush && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {subscribed && (
                    <div className="flex items-center justify-between" style={{ gap: 12 }}>
                      <div className="flex items-center" style={{ gap: 10 }}>
                        <Bell className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-neutral-900">Notifications enabled</p>
                          <p className="text-xs text-neutral-500" style={{ marginTop: 2 }}>You&apos;ll be notified when new bets open.</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={unsubscribe}
                        disabled={pushLoading}
                        className="text-sm font-medium rounded-lg transition-colors disabled:opacity-50 text-neutral-500 bg-white border border-neutral-200 hover:bg-neutral-50"
                        style={{ paddingLeft: 14, paddingRight: 14, paddingTop: 7, paddingBottom: 7, whiteSpace: "nowrap" }}
                      >
                        {pushLoading ? "…" : "Turn off"}
                      </button>
                    </div>
                  )}
                  {!subscribed && (
                    <div>
                      <p className="text-sm text-neutral-500" style={{ marginBottom: 8 }}>Push notifications aren&apos;t available in this browser. Here&apos;s how to enable them:</p>
                      <ul className="text-xs text-neutral-400" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <li><span className="font-medium text-neutral-500">Android</span> — open this site in Chrome, go to your Profile, and tap &quot;Turn on&quot; under Notifications.</li>
                        <li><span className="font-medium text-neutral-500">iPhone / iPad</span> — set Safari as your default browser (Settings → Safari → Default Browser App), open this site in Safari, tap the Share button → &quot;Add to Home Screen&quot;. Then open the app from your Home Screen, go to your Profile, and tap &quot;Turn on&quot; under Notifications. You can switch your default browser back afterwards.</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-sm text-red-500 rounded-xl bg-red-50" style={{ padding: 12 }}>{error}</p>}
          {success && <p className="text-sm text-emerald-600 rounded-xl bg-emerald-50" style={{ padding: 12 }}>Profile updated!</p>}

          <button type="submit" disabled={loading}
            className="h-11 rounded-xl bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center"
            style={{ gap: 8 }}>
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? "Saving..." : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
