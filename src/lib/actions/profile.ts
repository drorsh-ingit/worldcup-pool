"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({ name: z.string().min(1).max(50) });

export async function updateName(formData: FormData) {
  const session = await auth();
  if (!session) return { error: "Not authenticated" };

  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return { error: "Name must be 1–50 characters" };

  await db.user.update({
    where: { id: session.user.id },
    data: { name: parsed.data.name },
  });

  return { success: true };
}
