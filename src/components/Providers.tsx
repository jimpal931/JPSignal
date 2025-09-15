"use client";

import { SessionProvider } from "next-auth/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  console.log("[Providers] mounted"); // should appear in BROWSER console
  return <SessionProvider>{children}</SessionProvider>;
}