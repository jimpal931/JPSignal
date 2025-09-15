// src/app/signals/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
import SignalForm from "@/components/SignalForm";

export default async function SignalsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const pro = email ? await isProByEmail(email) : false;
  if (!email || !pro) redirect("/");

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Stock Signals</h1>
      <p className="text-sm text-gray-600">
        Enter a ticker and select a methodology. Results are generated from fresh market data.
      </p>
      <SignalForm />
    </main>
  );
}