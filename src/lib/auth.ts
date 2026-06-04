import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
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
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
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

        if (!user || !user.passwordHash) return null;

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
    async signIn({ user, account }) {
      // For Google OAuth: auto-create user if they don't exist yet
      if (account?.provider === "google" && user.email) {
        const existing = await db.user.findUnique({ where: { email: user.email } });
        if (!existing) {
          const googleName = user.name ?? user.email.split("@")[0];
          const created = await db.user.create({
            data: {
              email: user.email,
              name: googleName,
              realName: googleName,
              passwordHash: null,
            },
          });
          user.id = created.id;
        } else {
          // Sync name from Google profile if it's more complete
          const updates: Record<string, string> = {};
          if (user.name && user.name !== existing.name) updates.name = user.name;
          // Set realName once from Google if not yet stored
          if (user.name && !existing.realName) updates.realName = user.name;
          if (Object.keys(updates).length > 0) {
            await db.user.update({ where: { id: existing.id }, data: updates });
          }
          user.id = existing.id;
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        // For Google users, user.id may not be set by NextAuth — look up by email
        if (!user.id && user.email) {
          const dbUser = await db.user.findUnique({ where: { email: user.email } });
          token.id = dbUser?.id;
        } else {
          token.id = user.id;
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
