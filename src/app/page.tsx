"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { MatchdayLogo } from "@/components/matchday-logo";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        setLoading(false);
        return;
      }

      router.push(callbackUrl);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && (
        <div className="rounded-xl bg-red-50 text-red-600 text-sm" style={{ padding: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label htmlFor="email" className="block text-sm font-medium text-neutral-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full h-11 rounded-xl border border-neutral-300 text-sm text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent bg-white"
          style={{ paddingLeft: 14, paddingRight: 14 }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 16 }}>
        <label htmlFor="password" className="block text-sm font-medium text-neutral-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          className="w-full h-11 rounded-xl border border-neutral-300 text-sm text-neutral-900 placeholder:text-neutral-400 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent bg-white"
          style={{ paddingLeft: 14, paddingRight: 14 }}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full h-11 rounded-xl bg-pitch-900 text-white font-medium text-sm hover:bg-pitch-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center"
        style={{ marginTop: 16, gap: 8 }}
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}

function HomePageInner() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50" style={{ paddingLeft: 24, paddingRight: 24 }}>
      <div style={{ width: "100%", maxWidth: 440, margin: "0 auto" }}>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5e5e5",
            borderRadius: 16,
            padding: 40,
          }}
        >
          {/* Brand header */}
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
              <MatchdayLogo variant="icon" size={56} />
            </div>
            <h1
              className="font-display font-semibold tracking-tight text-neutral-900"
              style={{ fontSize: 26, marginTop: 10 }}
            >
              Matchday
            </h1>
            <p className="text-sm text-neutral-500" style={{ marginTop: 6 }}>
              Tournament prediction pools for you and your friends
            </p>
          </div>

          <hr style={{ borderColor: "#f0f0f0", marginBottom: 32 }} />

          {/* Google sign-in */}
          <button
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
            className="w-full h-11 rounded-xl border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 active:scale-[0.98] transition-all inline-flex items-center justify-center"
            style={{ gap: 10, marginBottom: 20 }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center" style={{ gap: 12, marginBottom: 20 }}>
            <hr style={{ flex: 1, borderColor: "#e5e5e5" }} />
            <span className="text-xs text-neutral-400">or sign in with email</span>
            <hr style={{ flex: 1, borderColor: "#e5e5e5" }} />
          </div>

          <Suspense fallback={<div style={{ height: 160 }} />}>
            <LoginForm />
          </Suspense>

          <p className="text-center text-sm text-neutral-500" style={{ marginTop: 24 }}>
            No account?{" "}
            <Link href="/signup" className="font-medium" style={{ color: "#3d7a28" }}>
              Create one free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return <HomePageInner />;
}
