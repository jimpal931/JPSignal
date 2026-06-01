// src/app/signals/[id]/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
import { SIGNALS } from "@/lib/signals";
import { redirect, notFound } from "next/navigation";
import Client from "./Client";

export default async function SignalDetail({ params }: { params: { id: string } }) {
  // 1. Maintain your dynamic strategy route check
  const sdef = SIGNALS.find(s => s.id === params.id);
  if (!sdef) notFound();

  // 2. Maintain your native security + subscription gates intact
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) redirect("/?login=1");
  const ok = await isProByEmail(email);
  if (!ok) redirect("/?upgrade=1");

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Styled Terminal Strategy Branding Header */}
        <div className="border-b border-zinc-800 pb-4">
          <h1 className="text-2xl font-mono font-bold tracking-tight text-white uppercase">
            {sdef.name} STRATEGY CORE
          </h1>
          <p className="text-sm text-zinc-400 mt-1">{sdef.description}</p>
        </div>

        {/* Hand over execution directly to the interactive interface */}
        <Client signalId={sdef.id} />
      </div>
    </main>
  );
}