// src/app/account/page.tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
import BillingPortalButton from "@/components/BillingPortalButton";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;

  if (!email) redirect("/");

  const pro = await isProByEmail(email);

  return (
    <main className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Account</h1>

      <div className="rounded-md border p-4 space-y-2">
        <p><span className="font-medium">Signed in as:</span> {email}</p>
        <p>
          <span className="font-medium">Subscription status:</span>{" "}
          {pro ? "Active" : "Free / Inactive"}
        </p>
        {pro && (
          <div className="pt-2">
            <BillingPortalButton />
          </div>
        )}
      </div>
    </main>
  );
}