"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { createGroupSchema, joinGroupSchema } from "@/lib/validators";
import { DEFAULT_GROUP_SETTINGS } from "@/lib/settings";
import { revalidatePath } from "next/cache";
import { initTournament } from "@/lib/actions/tournaments";
import { isTournamentKind } from "@/lib/tournaments/registry";

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
  // If the name contains no Latin/ASCII chars (e.g. Hebrew, Arabic, CJK),
  // base will be empty — just use a standalone random code.
  return base ? `${base}-${suffix}` : suffix;
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

  const rawKind = String(formData.get("tournamentKind") ?? "");
  const kind = isTournamentKind(rawKind) ? rawKind : "WC_2026";

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

    await initTournament(group.id, kind);

    revalidatePath("/dashboard");
    return { success: true, groupId: group.id, slug: group.slug };
  } catch (error) {
    console.error("Create group error:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003" &&
      String(error.meta?.field_name).includes("userId")
    ) {
      return { error: "Your session is invalid. Please sign out and sign in again." };
    }
    return { error: "Failed to create group. Please try again." };
  }
}

/**
 * Core join logic, shared by the invite-code dialog and the direct join link.
 * Joins are auto-approved — anyone with the code/link becomes an APPROVED member.
 * Returns the joined group's id on success (also when already a member).
 */
export async function joinGroupBySlug(rawSlug: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "You must be signed in to join a group" };
  }

  const parsed = joinGroupSchema.safeParse({ slug: rawSlug });
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
        return { success: true, groupId: group.id, alreadyMember: true, groupName: group.name };
      }
      // Previously PENDING/REJECTED → promote to APPROVED now that joins are open.
      await db.groupMembership.update({
        where: { id: existingMembership.id },
        data: { status: "APPROVED" },
      });
      revalidatePath("/dashboard");
      revalidatePath(`/group/${group.id}`);
      return { success: true, groupId: group.id, groupName: group.name };
    }

    await db.groupMembership.create({
      data: {
        userId: session.user.id,
        groupId: group.id,
        role: "MEMBER",
        status: "APPROVED",
      },
    });

    revalidatePath("/dashboard");
    revalidatePath(`/group/${group.id}`);
    return { success: true, groupId: group.id, groupName: group.name };
  } catch (error) {
    console.error("Join group error:", error);
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003" &&
      String(error.meta?.field_name).includes("userId")
    ) {
      return { error: "Your session is invalid. Please sign out and sign in again." };
    }
    return { error: "Failed to join group. Please try again." };
  }
}

export async function joinGroup(formData: FormData) {
  const result = await joinGroupBySlug(String(formData.get("slug") ?? ""));
  if ("error" in result && result.error) {
    return { error: result.error };
  }
  return {
    success: true,
    message: ("alreadyMember" in result && result.alreadyMember)
      ? "You're already in this group."
      : "You're in! Welcome to the group.",
  };
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
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003" &&
      String(error.meta?.field_name).includes("userId")
    ) {
      return { error: "Your session is invalid. Please sign out and sign in again." };
    }
    return { error: "Failed to update membership. Please try again." };
  }
}

export async function deleteGroup(groupId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not authenticated" };

  const membership = await db.groupMembership.findUnique({
    where: { userId_groupId: { userId: session.user.id, groupId } },
  });
  if (!membership || membership.role !== "ADMIN") {
    return { error: "Only the group admin can delete this group" };
  }

  try {
    await db.group.delete({ where: { id: groupId } });
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("Delete group error:", error);
    return { error: "Failed to delete group. Please try again." };
  }
}
