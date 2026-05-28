import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
import SignalForm from "@/components/SignalForm";
import Link from "next/link";
import AuthButton from "@/components/AuthButton";
import BillingPortalButton from "@/components/BillingPortalButton";

export default async function SignalsPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const pro = email ? await isProByEmail(email) : false;

  // Protect the route
  if (!email || !pro) redirect("/");

  return (
    <div className="min-h-screen bg-black text-zinc-100 selection:bg-blue-500 selection:text-white font-sans">
      
      {/* --- App Navigation Bar --- */}
      <nav className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          
          {/* Left: Logo & Main Nav */}
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-[0_0_15px_rgba(37,99,235,0.5)] group-hover:bg-blue-500 transition-colors">
                AI
              </div>
              <span className="text-lg font-bold tracking-tight text-white hidden md:block">AInsight</span>
            </Link>
            
            <div className="hidden md:flex items-center gap-1 bg-zinc-900/50 p-1 rounded-lg border border-white/5">
              <Link 
                href="/signals" 
                className="px-4 py-1.5 text-sm font-medium bg-zinc-800 text-white rounded-md shadow-sm"
              >
                Signals
              </Link>
              <Link 
                href="/leaps" 
                className="px-4 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-md transition-all"
              >
                Leaps
              </Link>
              <Link 
                href="/dashboard" 
                className="px-4 py-1.5 text-sm font-medium bg-zinc-800 text-white rounded-md shadow-sm"
              >
                Hybrid
              </Link>
            </div>
          </div>
          
          {/* Right: User Actions */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2">
              <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold uppercase rounded-full tracking-wider">
                Pro Active
              </span>
            </div>
            <BillingPortalButton />
            <AuthButton />
          </div>
        </div>
      </nav>

      {/* --- Main Dashboard Content --- */}
      <main className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* Left Column: The Signal Generator (2/3 width) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">Intraday Signals</h1>
                <p className="text-zinc-400 mt-1">Generate AI-powered trade setups based on real-time price action.</p>
              </div>
              {/* Live Indicator */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-blue-900/20 border border-blue-500/20 rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span className="text-xs font-medium text-blue-400">Market Data Active</span>
              </div>
            </div>

            {/* The Tool Card */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
               {/* Background Glow Effect */}
               <div className="absolute top-0 right-0 -mt-20 -mr-20 w-80 h-80 bg-blue-600/5 rounded-full blur-3xl pointer-events-none"></div>

               {/* The Form Component */}
               <div className="relative z-10">
                 <SignalForm />
               </div>
            </div>

            {/* Helper Note */}
            <p className="text-xs text-zinc-500 flex items-start gap-2 bg-zinc-900/30 p-4 rounded-lg border border-zinc-800/50">
              <svg className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>
                <strong>Note:</strong> Results are generated using 15-minute delayed market data. 
                Always cross-reference with your brokerages real-time charts before executing trades.
              </span>
            </p>
          </div>

          {/* Right Column: Sidebar / Context (1/3 width) */}
          <div className="space-y-6">
            
            {/* Cross-Sell / Navigation Card */}
            <div className="bg-gradient-to-br from-zinc-900 to-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-lg font-bold text-white mb-2">Looking for Long-Term?</h3>
              <p className="text-sm text-zinc-400 mb-4">
                Switch to LEAPS strategies for lower-volatility plays designed for portfolio growth.
              </p>
              <Link 
                href="/leaps" 
                className="block w-full text-center py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-sm font-medium transition-colors border border-zinc-700"
              >
                Go to LEAPS Signals &rarr;
              </Link>
            </div>

            {/* Mini Tips / Status */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-zinc-300 uppercase tracking-wider mb-4">Trading Tips</h3>
              <ul className="space-y-3 text-sm text-zinc-400">
                <li className="flex gap-3">
                  <span className="text-blue-500 font-bold">•</span>
                  <span>Confirm signals with volume trends.</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-500 font-bold">•</span>
                  <span>Avoid trading during high-impact news events (CPI, FOMC).</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-blue-500 font-bold">•</span>
                  <span>Use stop losses to protect capital.</span>
                </li>
              </ul>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}