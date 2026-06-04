"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(50),
  avatarColor: z.coerce.number().int().min(0).max(9).optional(),
});

export async function updateProfile(formData: FormData) {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const parsed = schema.safeParse({
    name: formData.get("name"),
    avatarColor: formData.get("avatarColor") ?? undefined,
  });
  if (!parsed.success) return { error: "Name must be 1–50 characters" };

  await db.user.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name,
      ...(parsed.data.avatarColor != null && { avatarColor: parsed.data.avatarColor }),
    },
  });

  return { success: true };
}

// Keep old name for backwards compat
export const updateName = updateProfile;

export async function getAvatarColor(userId: string): Promise<number | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { avatarColor: true } });
  return user?.avatarColor ?? null;
}
