import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password must be less than 100 characters"),
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(50, "Name must be less than 50 characters")
    .trim(),
});

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export const createGroupSchema = z.object({
  name: z
    .string()
    .min(3, "Group name must be at least 3 characters")
    .max(50, "Group name must be less than 50 characters")
    .trim(),
});

export const joinGroupSchema = z.object({
  slug: z
    .string()
    .min(1, "Group code is required")
    .max(50)
    .trim()
    .toLowerCase(),
});

export const updateMembershipSchema = z.object({
  membershipId: z.string().cuid(),
  action: z.enum(["approve", "reject"]),
});

export const matchScorePredictionSchema = z.object({
  homeScore: z.number().int().min(0).max(20),
  awayScore: z.number().int().min(0).max(20),
});

export const betPredictionSchema = z.object({
  betTypeId: z.string().cuid(),
  matchId: z.string().cuid().optional(),
  prediction: z.record(z.string(), z.unknown()),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type JoinGroupInput = z.infer<typeof joinGroupSchema>;
