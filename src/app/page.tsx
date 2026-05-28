import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
import AuthButton from "@/components/AuthButton";
import BillingPortalButton from "@/components/BillingPortalButton";
import SubscribeButton from "@/components/SubscribeButton"; 
import Link from "next/link";

export default async function Page() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? null;
  const pro = email ? await isProByEmail(email) : false;

  return (
    <div className="min-h-screen flex flex-col bg-black text-zinc-100 selection:bg-blue-500 selection:text-white">
      
      {/* --- Navigation Bar --- */}
      <nav className="border-b border-white/10 bg-black/50 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          {/* Logo Icon - Links back to home */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-[0_0_15px_rgba(37,99,235,0.5)] group-hover:bg-blue-500 transition-colors">
              AI
            </div>
            <span className="text-lg font-bold tracking-tight text-white">AInsight Signals</span>
          </Link>
        </div>
        
        <div className="flex items-center gap-6">
          {/* Pricing Link */}
          <Link href="/pricing" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors hidden sm:block">
            Pricing
          </Link>

          {email && (
            <>
              {pro && (
                <span className="hidden sm:inline-block px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-bold uppercase rounded-full tracking-wider">
                  Pro Active
                </span>
              )}
              <div className="text-sm">
                <BillingPortalButton />
              </div>
            </>
          )}
          
          <div className="dark-theme-wrapper">
             <AuthButton />
          </div>
        </div>
      </nav>

      {/* --- Main Content --- */}
      <main className="flex-grow max-w-5xl mx-auto px-6 py-16 w-full">
        
        {/* --- SCENARIO 1: Guest (Not Signed In) --- */}
        {!email && (
          <div className="text-center space-y-10 py-12">
            
            {/* Hero Text */}
            <div className="space-y-4">
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white">
                Trade Smarter with <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-600">
                  AI Precision
                </span>
              </h1>
              <p className="text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed">
                Get real-time intraday signals and long-term LEAPS strategies powered by advanced market analysis algorithms.
              </p>
            </div>

            {/* CTA */}
            <div className="flex justify-center">
              <div className="transform scale-110">
                <AuthButton />
              </div>
            </div>

            {/* Feature Teasers */}
            <div className="grid md:grid-cols-2 gap-6 mt-20 text-left">
              <div className="p-8 bg-zinc-900/50 rounded-3xl border border-white/5 hover:border-blue-500/30 transition-colors">
                <div className="h-10 w-10 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 text-blue-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Day Trading Signals</h3>
                <p className="text-zinc-500">High-frequency setups with entry, stop-loss, and take-profit targets delivered in real-time.</p>
              </div>

              <div className="p-8 bg-zinc-900/50 rounded-3xl border border-white/5 hover:border-emerald-500/30 transition-colors">
                 <div className="h-10 w-10 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4 text-emerald-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">LEAPS Strategies</h3>
                <p className="text-zinc-500">Long-term options plays calculated for sustainable portfolio growth and reduced volatility.</p>
              </div>
            </div>
          </div>
        )}

        {/* --- SCENARIO 2: Logged In User (Dashboard) --- */}
        {email && (
          <div className="space-y-10">
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-white">Dashboard</h2>
              <p className="text-zinc-500">Welcome back, <span className="text-zinc-300">{session?.user?.name || email}</span>.</p>
            </div>

            {/* Status Banner for Free Users */}
            {!pro && (
              <div className="relative overflow-hidden bg-gradient-to-r from-blue-900/40 to-indigo-900/40 border border-blue-500/20 p-8 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="relative z-10">
                  <h3 className="text-xl font-bold text-blue-100">Unlock Professional Access</h3>
                  <p className="text-blue-300/80 mt-1 max-w-md">Upgrade to Pro to instantly access live signals, full history, and advanced LEAPS strategies.</p>
                </div>
                <div className="shrink-0 relative z-10">
                   <SubscribeButton 
                      plan="pro" 
                      label={session ? "Upgrade Now" : "Sign In to Upgrade"} 
                    />
                </div>
                {/* Decorative Glow */}
                <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
              </div>
            )}

            {/* App Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              
              {/* Card 1: Signals */}
              <FeatureCard 
                title="Stock Signals" 
                description="Real-time intraday trading opportunities."
                href="/signals"
                isPro={pro}
                icon={
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                }
                color="bg-indigo-600"
                glow="shadow-[0_0_20px_rgba(79,70,229,0.3)]"
              />

              {/* Card 2: Leaps */}
              <FeatureCard 
                title="LEAPS Strategies" 
                description="Long-term options for wealth generation."
                href="/leaps"
                isPro={pro}
                icon={
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                }
                color="bg-emerald-600"
                glow="shadow-[0_0_20px_rgba(16,185,129,0.3)]"
              />

              <FeatureCard 
                title="Hybrid Stock Evaluation" 
                description="Long-term Equity for wealth generation."
                href="/dashboard"
                isPro={pro}
                icon={
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                }
                color="bg-indigo-600"
                glow="shadow-[0_0_20px_rgba(16,185,129,0.3)]"
              />
            </div>
          </div>
        )}
      </main>

      {/* --- Footer --- */}
      <footer className="border-t border-white/10 bg-black py-10 mt-auto">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <div className="flex flex-col md:flex-row items-center gap-2 md:gap-6">
             <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
             <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          </div>
          <div className="text-center md:text-right">
            Project developed by <span className="text-zinc-300 font-medium">Jimmy Palathingal</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

// --- Helper Component for the Cards ---
function FeatureCard({ 
  title, 
  description, 
  href, 
  isPro, 
  icon, 
  color,
  glow
}: { 
  title: string, 
  description: string, 
  href: string, 
  isPro: boolean, 
  icon: React.ReactNode, 
  color: string,
  glow: string
}) {
  const isLocked = !isPro;

  return (
    <div className={`relative group bg-zinc-900 rounded-3xl border transition-all duration-300 ${isLocked ? 'border-zinc-800 opacity-75' : 'border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/80 hover:-translate-y-1'}`}>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${color} ${!isLocked && glow}`}>
            {icon}
          </div>
          {isLocked && (
             <span className="px-3 py-1 bg-zinc-800 text-zinc-500 border border-zinc-700 text-xs font-bold uppercase rounded-full flex items-center gap-1.5">
               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
               Locked
             </span>
          )}
        </div>
        
        <h3 className="text-2xl font-bold text-white tracking-tight">{title}</h3>
        <p className="text-zinc-400 mt-2 mb-8 leading-relaxed">{description}</p>
        
        {isLocked ? (
          <button disabled className="w-full py-3 px-4 bg-zinc-800 text-zinc-500 border border-zinc-700/50 rounded-xl font-medium text-sm cursor-not-allowed flex justify-center items-center gap-2">
            Upgrade to Access
          </button>
        ) : (
          <Link href={href} className="group/btn block w-full text-center py-3 px-4 bg-white text-black rounded-xl font-bold text-sm hover:bg-blue-50 transition-colors flex justify-center items-center gap-2">
            Open Dashboard 
            <span className="group-hover/btn:translate-x-0.5 transition-transform">&rarr;</span>
          </Link>
        )}
      </div>
    </div>
  );
}