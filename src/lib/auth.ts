import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email },
        });

        if (!user) return null;

        const isValid = await compare(parsed.data.password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.userVerifiedAt = Date.now();
      }

      // Periodically verify the user still exists in the DB (every 5 minutes)
      // This handles stale JWTs surviving database resets
      if (token.id && typeof token.userVerifiedAt === "number") {
        const FIVE_MINUTES = 5 * 60 * 1000;
        if (Date.now() - token.userVerifiedAt > FIVE_MINUTES) {
          try {
            const dbUser = await db.user.findUnique({
              where: { id: token.id as string },
              select: { id: true },
            });
            if (!dbUser) {
              token.id = undefined;
              token.userVerifiedAt = undefined;
            } else {
              token.userVerifiedAt = Date.now();
            }
          } catch {
            // DB error — don't invalidate, let it retry next time
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token?.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
