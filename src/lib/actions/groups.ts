"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createGroupSchema, joinGroupSchema } from "@/lib/validators";
import { DEFAULT_GROUP_SETTINGS } from "@/lib/settings";
import { revalidatePath } from "next/cache";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

function generateSlug(name: string): string {
  const base = slugify(name);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

export async function createGroup(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in to create a group" };
  }

  const parsed = createGroupSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    const slug = generateSlug(parsed.data.name);

    const group = await db.group.create({
      data: {
        name: parsed.data.name,
        slug,
        settings: DEFAULT_GROUP_SETTINGS as unknown as import("@prisma/client").Prisma.InputJsonValue,
        members: {
          create: {
            userId: session.user.id,
            role: "ADMIN",
            status: "APPROVED",
          },
        },
      },
    });

    revalidatePath("/dashboard");
    return { success: true, groupId: group.id, slug: group.slug };
  } catch (error) {
    console.error("Create group error:", error);
    return { error: "Failed to create group. Please try again." };
  }
}

export async function joinGroup(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in to join a group" };
  }

  const parsed = joinGroupSchema.safeParse({
    slug: formData.get("slug"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  try {
    const group = await db.group.findUnique({
      where: { slug: parsed.data.slug },
    });

    if (!group) {
      return { error: "Group not found. Check the invite code and try again." };
    }

    const existingMembership = await db.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: session.user.id,
          groupId: group.id,
        },
      },
    });

    if (existingMembership) {
      if (existingMembership.status === "APPROVED") {
        return { error: "You're already a member of this group" };
      }
      if (existingMembership.status === "PENDING") {
        return { error: "Your request to join is already pending approval" };
      }
      if (existingMembership.status === "REJECTED") {
        return { error: "Your request to join this group was declined" };
      }
    }

    await db.groupMembership.create({
      data: {
        userId: session.user.id,
        groupId: group.id,
        role: "MEMBER",
        status: "PENDING",
      },
    });

    revalidatePath("/dashboard");
    return { success: true, message: "Join request sent. Waiting for admin approval." };
  } catch (error) {
    console.error("Join group error:", error);
    return { error: "Failed to join group. Please try again." };
  }
}

export async function updateMembership(membershipId: string, action: "approve" | "reject") {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in" };
  }

  try {
    const membership = await db.groupMembership.findUnique({
      where: { id: membershipId },
      include: { group: true },
    });

    if (!membership) {
      return { error: "Membership not found" };
    }

    // Verify the current user is an admin of this group
    const adminMembership = await db.groupMembership.findUnique({
      where: {
        userId_groupId: {
          userId: session.user.id,
          groupId: membership.groupId,
        },
      },
    });

    if (!adminMembership || adminMembership.role !== "ADMIN") {
      return { error: "Only group admins can manage members" };
    }

    await db.groupMembership.update({
      where: { id: membershipId },
      data: {
        status: action === "approve" ? "APPROVED" : "REJECTED",
      },
    });

    revalidatePath(`/group/${membership.groupId}`);
    return { success: true };
  } catch (error) {
    console.error("Update membership error:", error);
    return { error: "Failed to update membership. Please try again." };
  }
}
