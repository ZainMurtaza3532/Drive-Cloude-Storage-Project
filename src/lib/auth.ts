import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { lookup as dnsLookup } from "node:dns";
import type { LookupFunction } from "node:net";
import prisma from "./prisma";
import bcrypt from "bcrypt";
import { verifyTotpCode } from "./totp";
import { enforceRateLimit } from "./security";

const oauthLookup: LookupFunction = (hostname, options, callback) =>
  dnsLookup(hostname, { ...options, family: 4 }, callback);
const oauthHttpOptions = { timeout: 10_000, lookup: oauthLookup };

const authSecret = process.env.NEXTAUTH_SECRET?.trim() || process.env.AUTH_SECRET?.trim();

if (process.env.NODE_ENV === "production" && !authSecret) {
  throw new Error("NEXTAUTH_SECRET must be configured in production.");
}

export const authOptions: NextAuthOptions = {
  secret: authSecret,
  useSecureCookies: process.env.NODE_ENV === "production",
  adapter: PrismaAdapter(prisma),
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          allowDangerousEmailAccountLinking: false,
          httpOptions: oauthHttpOptions,
          authorization: {
            params: {
              prompt: "select_account",
            },
          },
        }),
      ]
      : []),
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? [
        GitHubProvider({
          clientId: process.env.GITHUB_CLIENT_ID,
          clientSecret: process.env.GITHUB_CLIENT_SECRET,
          allowDangerousEmailAccountLinking: false,
          httpOptions: oauthHttpOptions,
        }),
      ]
      : []),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        twoFactorCode: { label: "Authenticator code", type: "text" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";

        if (!email || !password) {
          return null;
        }

        if (await enforceRateLimit(email, "auth")) return null;

        if (!process.env.DATABASE_URL?.trim()) {
          console.error("Credentials sign-in is unavailable because DATABASE_URL is missing.");
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
              passwordHash: true,
              twoFactorEnabled: true,
              twoFactorSecret: true,
            },
          });

          if (!user?.passwordHash) return null;

          const isCorrectPassword = await bcrypt.compare(password, user.passwordHash);
          if (!isCorrectPassword) return null;
          if (user.twoFactorEnabled) {
            const code = typeof credentials?.twoFactorCode === "string" ? credentials.twoFactorCode : "";
            if (!user.twoFactorSecret || !verifyTotpCode(user.twoFactorSecret, code)) return null;
          }

          return { id: user.id, name: user.name, email: user.email, image: user.image };
        } catch (error) {
          console.error("Credentials authentication failed.", error);
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const emailIsVerified = profile && "email_verified" in profile && profile.email_verified === true;
        if (!user.email || !emailIsVerified) return false;
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
          select: { twoFactorEnabled: true },
        });
        return !existingUser?.twoFactorEnabled;
      }

      if (account?.provider === "github") {
        if (!user.email) return false;
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
          select: { twoFactorEnabled: true },
        });
        return !existingUser?.twoFactorEnabled;
      }

      return true;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.id || token.sub) as string;
        session.user.name = session.user.name || (token.name as string | undefined) || "User";
        session.user.image = (token.picture as string | null | undefined) ?? null;
        session.user.themePreference = (token.themePreference as "LIGHT" | "DARK" | "SYSTEM" | undefined) ?? "SYSTEM";
      }
      return session;
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
      }
      if (user || trigger === "update") {
        const userId = user?.id ?? token.id ?? token.sub;
        if (userId) {
          const account = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, name: true, image: true, themePreference: true },
          });
          if (account) {
            token.id = account.id;
            token.name = account.name;
            token.picture = account.image;
            token.themePreference = account.themePreference === "LIGHT" || account.themePreference === "DARK"
              ? account.themePreference
              : "SYSTEM";
          }
        }
      }
      return token;
    },
  },
};
