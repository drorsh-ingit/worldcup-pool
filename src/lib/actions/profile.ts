"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const VALID_AVATAR_STYLES = [
  "adventurer", "avataaars", "bottts", "fun-emoji", "lorelei",
  "micah", "notionists", "personas", "pixel-art", "thumbs",
  "croodles", "shapes",
] as const;

const schema = z.object({
  name: z.string().min(1).max(50),
  avatarColor: z.coerce.number().int().min(0).max(11).optional(),
  avatarStyle: z.enum(VALID_AVATAR_STYLES).optional(),
  avatarSeed: z.string().max(20).optional(),
});

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const parsed = schema.safeParse({
    name: formData.get("name"),
    avatarColor: formData.get("avatarColor") ?? undefined,
    avatarStyle: formData.get("avatarStyle") ?? undefined,
    avatarSeed: formData.get("avatarSeed") ?? undefined,
  });
  if (!parsed.success) return { error: "Name must be 1–50 characters" };

  await db.user.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name,
      ...(parsed.data.avatarColor != null && { avatarColor: parsed.data.avatarColor }),
      avatarStyle: parsed.data.avatarStyle || null,
      avatarSeed: parsed.data.avatarSeed || null,
    },
  });

  return { success: true };
}

export async function deleteAccount() {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const userId = session.user.id;

  // LeaderboardEntry has no cascade relation — delete manually
  await db.leaderboardEntry.deleteMany({ where: { userId } });

  // User delete cascades: memberships, bets, push subscriptions
  await db.user.delete({ where: { id: userId } });

  return { success: true };
}

// Keep old name for backwards compat
export const updateName = updateProfile;

export async function getAvatarColor(userId: string): Promise<number | null> {
  const session = await auth();
  if (!session) return null;

  const user = await db.user.findUnique({ where: { id: userId }, select: { avatarColor: true } });
  return user?.avatarColor ?? null;
}
