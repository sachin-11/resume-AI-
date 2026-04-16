import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import type { UserRole } from "@/lib/permissions";

const USER_ROLES: readonly UserRole[] = ["admin", "recruiter", "viewer"];

function normalizeUserRole(value: unknown): UserRole {
  if (typeof value === "string" && (USER_ROLES as readonly string[]).includes(value)) {
    return value as UserRole;
  }
  return "admin";
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    // ── Google OAuth ─────────────────────────────────────────
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),

    // ── Email + Password ─────────────────────────────────────
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email },
          include: { teamMembership: true, ownedOrg: true },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        const role = user.teamMembership?.role ?? user.role ?? "admin";
        const orgId = user.ownedOrg?.id ?? user.teamMembership?.orgId ?? null;

        return { id: user.id, email: user.email, name: user.name, role, orgId };
      },
    }),
  ],
  callbacks: {
    // ── Auto-create user on first Google login ───────────────
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        if (!user.email) return false;

        const existing = await db.user.findUnique({ where: { email: user.email } });

        if (!existing) {
          // Create new user — no password (Google-only)
          await db.user.create({
            data: {
              email: user.email,
              name: user.name ?? "",
              password: "", // Google users don't need password
              role: "admin",
            },
          });
        }
        return true;
      }
      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        // Credentials login
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "admin";
        token.orgId = (user as { orgId?: string | null }).orgId ?? null;
      }

      // Google login — fetch user from DB to get id + role
      if (account?.provider === "google" && token.email) {
        const dbUser = await db.user.findUnique({
          where: { email: token.email },
          include: { teamMembership: true, ownedOrg: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.teamMembership?.role ?? dbUser.role ?? "admin";
          token.orgId = dbUser.ownedOrg?.id ?? dbUser.teamMembership?.orgId ?? null;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = normalizeUserRole(token.role);
        session.user.orgId = (token.orgId as string | null) ?? null;
      }
      return session;
    },
  },
};
