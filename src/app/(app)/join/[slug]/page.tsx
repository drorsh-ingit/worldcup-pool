import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { joinGroupBySlug } from "@/lib/actions/groups";

interface JoinPageProps {
  params: Promise<{ slug: string }>;
}

// Direct join link. Auth is enforced by middleware (unauthenticated visitors are
// bounced to /login?callbackUrl=/join/<slug> and land back here after signing in).
export default async function JoinPage({ params }: JoinPageProps) {
  const { slug } = await params;
  const result = await joinGroupBySlug(slug);

  if ("groupId" in result && result.groupId) {
    redirect(`/group/${result.groupId}`);
  }

  return (
    <div className="max-w-sm mx-auto" style={{ paddingTop: 80, display: "flex", flexDirection: "column", gap: 16, alignItems: "center", textAlign: "center" }}>
      <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
        <AlertCircle className="w-6 h-6 text-red-500" />
      </div>
      <h1 className="text-xl font-semibold text-neutral-900">Couldn&apos;t join</h1>
      <p className="text-sm text-neutral-500" style={{ lineHeight: 1.5 }}>
        {result.error ?? "This invite link is invalid or the group no longer exists."}
      </p>
      <Link
        href="/dashboard"
        className="rounded-xl border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors inline-flex items-center"
        style={{ height: 40, paddingLeft: 16, paddingRight: 16 }}
      >
        Back to dashboard
      </Link>
    </div>
  );
}
