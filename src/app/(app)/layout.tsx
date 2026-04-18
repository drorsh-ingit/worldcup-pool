import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AppNav } from "@/components/app-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const memberships = await db.groupMembership.findMany({
    where: { userId: session.user.id, status: "APPROVED" },
    include: { group: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "desc" },
  });
  const groups = memberships.map((m) => ({ id: m.group.id, name: m.group.name }));

  return (
    <div className="min-h-screen bg-neutral-50 pb-16 sm:pb-0">
      <AppNav user={session.user} groups={groups} />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {children}
      </main>
    </div>
  );
}
