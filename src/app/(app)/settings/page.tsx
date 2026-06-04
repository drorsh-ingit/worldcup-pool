import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, realName: true, email: true, avatarColor: true, avatarStyle: true, avatarSeed: true },
  });

  return (
    <SettingsForm
      initialName={user?.name ?? ""}
      realName={user?.realName ?? user?.name ?? ""}
      email={user?.email ?? ""}
      initialColor={user?.avatarColor ?? null}
      initialStyle={user?.avatarStyle ?? null}
      initialSeed={user?.avatarSeed ?? null}
      userId={session.user.id}
    />
  );
}
