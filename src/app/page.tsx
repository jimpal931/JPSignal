import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
import AuthButton from "@/components/AuthButton"; // your client sign in/out button
import SubscribeButton from "@/components/SubscribeButton";
import BillingPortalButton from "@/components/BillingPortalButton";
import Link from "next/link";

export default async function Page() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const pro = email ? await isProByEmail(email) : false;

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">JPSignal</h1>
      <AuthButton />

      {!email && <p>Please sign in to continue.</p>}

      {email && !pro && (
        <div className="space-x-3">
          <SubscribeButton />
          <BillingPortalButton />
        </div>
      )}

      {email && pro && (
        <div className="space-x-3">
          <Link className="underline" href="/signals">Open signals</Link>
          <BillingPortalButton />
        </div>
      )}

      {email && pro && (
        <div className="space-x-3">
          <Link className="underline" href="/leaps">Open Leaps</Link>
          <BillingPortalButton />
        </div>
      )}
    </main>
  );
}