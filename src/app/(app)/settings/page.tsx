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
    select: { name: true, email: true, avatarColor: true, avatarEmoji: true },
  });

  return (
    <SettingsForm
      initialName={user?.name ?? ""}
      email={user?.email ?? ""}
      initialColor={user?.avatarColor ?? null}
      initialEmoji={user?.avatarEmoji ?? null}
      userId={session.user.id}
    />
  );
}
