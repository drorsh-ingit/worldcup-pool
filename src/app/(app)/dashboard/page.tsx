import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Plus, ArrowRight, Clock, Trophy } from "lucide-react";
import { CreateGroupDialog } from "@/components/create-group-dialog";
import { JoinGroupDialog } from "@/components/join-group-dialog";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const memberships = await db.groupMembership.findMany({
    where: { userId: session.user.id },
    include: {
      group: {
        include: {
          members: {
            where: { status: "APPROVED" },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const approved = memberships.filter((m) => m.status === "APPROVED");
  const pending = memberships.filter((m) => m.status === "PENDING");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            Your groups
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Create a new group or join an existing one
          </p>
        </div>
        <div className="flex items-center gap-2">
          <JoinGroupDialog />
          <CreateGroupDialog />
        </div>
      </div>

      {/* Pending requests */}
      {pending.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-neutral-500 uppercase tracking-wider">
            Pending approval
          </h2>
          {pending.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-4 rounded-xl border border-amber-200 bg-amber-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-600" />
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

      {/* Active groups */}
      {approved.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {approved.map((m) => (
            <Link
              key={m.id}
              href={`/group/${m.group.id}`}
              className="card-hover flex items-center justify-between p-4 rounded-xl border border-neutral-200 bg-white"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-neutral-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900">
                    {m.group.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Users className="w-3.5 h-3.5 text-neutral-400" />
                    <span className="text-sm text-neutral-500">
                      {m.group.members.length} member{m.group.members.length !== 1 ? "s" : ""}
                    </span>
                    {m.role === "ADMIN" && (
                      <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                        Admin
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-neutral-400" />
            </Link>
          ))}
        </div>
      ) : (
        pending.length === 0 && (
          <div className="text-center py-16 px-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-100 mb-4">
              <Users className="w-7 h-7 text-neutral-400" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-900 mb-1">
              No groups yet
            </h2>
            <p className="text-sm text-neutral-500 mb-6 max-w-sm mx-auto">
              Create a group and invite your friends, or join an existing one with an invite code.
            </p>
            <div className="flex items-center justify-center gap-2">
              <JoinGroupDialog />
              <CreateGroupDialog />
            </div>
          </div>
        )
      )}
    </div>
  );
}
