import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { AppNav } from "@/components/app-nav";
import { NavShell } from "@/components/nav-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const [memberships, dbUser] = await Promise.all([
    db.groupMembership.findMany({
      where: { userId: session.user.id, status: "APPROVED" },
      include: { group: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "desc" },
    }),
    db.user.findUnique({
      where: { id: session.user.id },
      select: { avatarColor: true, avatarEmoji: true },
    }),
  ]);
  const groups = memberships.map((m) => ({ id: m.group.id, name: m.group.name }));

  return (
    <NavShell>
      <div className="min-h-screen bg-neutral-50 pb-16 sm:pb-0">
        <AppNav
          user={{ ...session.user, avatarColor: dbUser?.avatarColor ?? null, avatarEmoji: dbUser?.avatarEmoji ?? null }}
          groups={groups}
        />
        <main
          className="max-w-screen-2xl mx-auto page-x-pad"
          style={{ paddingBottom: "8rem" }}
        >
          {children}
        </main>
      </div>
    </NavShell>
  );
}
