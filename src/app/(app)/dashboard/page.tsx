import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Users, Clock } from "lucide-react";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { JoinGroupDialog } from "@/components/join-group-dialog";

interface DashboardPageProps {
  searchParams: Promise<{ new?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { new: showWelcome } = await searchParams;

  const memberships = await db.groupMembership.findMany({
    where: { userId: session.user.id },
    include: { group: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "desc" },
  });

  const approved = memberships.filter((m) => m.status === "APPROVED");
  const pending = memberships.filter((m) => m.status === "PENDING");

  if (approved.length > 0 && !showWelcome) {
    redirect(`/group/${approved[0].group.id}`);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 80,
        paddingBottom: 80,
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div
        className="inline-flex items-center justify-center rounded-2xl bg-neutral-100"
        style={{ width: 56, height: 56, marginBottom: 16 }}
      >
        <Users className="w-7 h-7 text-neutral-400" />
      </div>
      <h1
        className="font-display text-xl font-semibold tracking-tight text-neutral-900 text-center"
        style={{ marginBottom: 8 }}
      >
        Welcome to Matchday
      </h1>
      <p
        className="text-sm text-neutral-500 text-center"
        style={{ marginBottom: 24, lineHeight: 1.6, maxWidth: 384 }}
      >
        Create a new group and invite your friends, or join an existing one with an invite code.
      </p>
      <div className="flex items-center justify-center" style={{ gap: 8 }}>
        <JoinGroupDialog />
        <CreateGroupDialog />
      </div>

      {pending.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            marginTop: 40,
            width: "100%",
            maxWidth: 480,
          }}
        >
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 text-center">
            Pending approval
          </h2>
          {pending.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-xl border border-amber-200 bg-pitch-50"
              style={{ padding: 16, gap: 12 }}
            >
              <div className="flex items-center" style={{ gap: 12 }}>
                <div className="w-10 h-10 rounded-xl bg-pitch-50 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-pitch-700" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    {m.group.name}
                  </p>
                  <p className="text-sm text-neutral-500">
                    Waiting for admin approval
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
