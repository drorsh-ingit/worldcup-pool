import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-50 mb-2">
            <Trophy className="w-7 h-7 text-amber-500" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-neutral-900">
            Pool
          </h1>
          <p className="text-base text-neutral-500 leading-relaxed">
            World Cup 2026 prediction pool.
            <br />
            Pick scores, track standings, compete with friends.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center justify-center h-11 px-6 rounded-xl bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 active:scale-[0.98] transition-all"
          >
            Create an account
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center h-11 px-6 rounded-xl border border-neutral-200 text-neutral-700 font-medium text-sm hover:bg-neutral-50 active:scale-[0.98] transition-all"
          >
            Sign in
          </Link>
        </div>

        <p className="text-sm text-neutral-400">
          Free to play. Set up a group and invite your friends.
        </p>
      </div>
    </div>
  );
}
