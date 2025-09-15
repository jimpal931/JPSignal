"use client";
import { SessionProvider } from "next-auth/react";

export default function SessionBoundary({ children }: { children: React.ReactNode }) {
  console.log("[SessionBoundary] mounted");
  return <SessionProvider>{children}</SessionProvider>;
}