import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
import { SIGNALS } from "@/lib/signals";
import { redirect, notFound } from "next/navigation";
import Client from "./Client";

export default async function SignalDetail({ params }: { params: { id: string } }) {
  const sdef = SIGNALS.find(s => s.id === params.id);
  if (!sdef) notFound();

  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) redirect("/?login=1");
  const ok = await isProByEmail(email);
  if (!ok) redirect("/?upgrade=1");

  return (
    <main className="p-6 space-y-3">
      <h1 className="text-2xl font-bold">{sdef.name}</h1>
      <p className="text-gray-600">{sdef.description}</p>
      <Client signalId={sdef.id} />
    </main>
  );
}