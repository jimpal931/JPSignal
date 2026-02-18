import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter"; // <--- Import this
import { prisma } from "@/lib/prisma";                     // <--- Import your prisma client

export const authOptions: NextAuthOptions = {
  // 1. Connect the adapter so users are saved to the DB
  adapter: PrismaAdapter(prisma),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  
  // 2. We keep JWT strategy, but the adapter ensures the DB sync happens
  session: { 
    strategy: "jwt" 
  },

  // 3. (Optional but recommended) callbacks to ensure ID is available
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        // Pass the user ID from the token to the session
        // (The adapter puts the DB ID into the token)
        session.user.image = token.picture; // Ensure image passes through
      }
      return session;
    },
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };