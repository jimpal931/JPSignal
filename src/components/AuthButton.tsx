"use client";

import { signIn, signOut, useSession } from "next-auth/react";

console.log("[AuthButton] module loaded"); // should appear in BROWSER console

export default function AuthButton() {
   console.log("[AuthButton] rendering before useSession");
  const { data, status } = useSession();
  console.log("[AuthButton] got:", data, status);
  return data?.user ? (
    <button onClick={() => signOut()} className="px-3 py-2 rounded bg-black-200 text-white">
      Sign out
    </button>
  ) : (
    <button onClick={() => signIn("google")} className="px-3 py-2 rounded bg-black text-white">
      Sign in with Google
    </button>
  );
}