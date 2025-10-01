// src/app/leaps/page.tsx
import LeapsSignalForm from "@/components/LeapsSignalForm";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
//import SignalForm from "@/components/SignalForm";
import Link from "next/link";


export default async function LeapsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const pro = email ? await isProByEmail(email) : false;
  if (!email || !pro) redirect("/");
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-2">
      <h1 className="text-2xl font-semibold">LEAP Option Signals</h1>
      <p className="text-sm text-gray-600">15-minute delayed options data.</p>
      <LeapsSignalForm />

      <p className="text-sm">
        Looking for stock signals?{" "}
        <Link href="/signals" className="text-blue-600 hover:underline">
          Go to Stock Signals →
        </Link>
      </p>
      
    </main>
  );
}