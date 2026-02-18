// src/app/pricing/page.tsx
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import SubscribeButton from "@/components/SubscribeButton";
import Link from "next/link";
import { Plan } from "@prisma/client";

export default async function PricingPage() {
  const session = await getServerSession(authOptions);
  
  let currentPlan: Plan = "BASIC";
  
  if (session?.user?.email) {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { plan: true }
    });
    if (user?.plan) {
      currentPlan = user.plan;
    }
  }

  const isPro = currentPlan === "PRO";
  const isElite = currentPlan === "PRO_MAX";

  return (
    <div className="min-h-screen bg-black text-white selection:bg-indigo-500/30 font-sans">
      
      {/* --- Navigation --- */}
      <nav className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <Link 
            href="/" 
            className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Home
          </Link>
        </div>
      </nav>

      {/* --- Hero Section --- */}
      <div className="pt-20 pb-12 px-6 text-center">
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6">
          Choose Your <span className="text-indigo-500">Edge.</span>
        </h1>
        <p className="text-lg text-zinc-400 max-w-2xl mx-auto leading-relaxed">
          Whether you are a casual trader or a high-volume institution, our AI signals scale with your ambition.
        </p>
      </div>

      {/* --- Pricing Grid --- */}
      <div className="max-w-6xl mx-auto px-6 pb-24 grid md:grid-cols-2 gap-8 lg:gap-12 items-start">
        
        {/* === CARD 1: FOUNDER ($30) === */}
        <div className="relative bg-zinc-900/50 rounded-3xl p-8 border border-zinc-800 hover:border-zinc-700 transition-colors">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-xl font-bold text-white">Founders Access</h3>
              <p className="text-zinc-400 text-sm mt-1">Perfect for daily active traders.</p>
            </div>
            <div className="text-right">
              <span className="text-4xl font-bold text-white">$30</span>
              <span className="text-zinc-500 text-sm font-medium block">/month</span>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <FeatureItem text="100 Stock Signals / mo" />
            <FeatureItem text="100 LEAP Option Signals / mo" />
            <FeatureItem text="Real-Time Sentiment Analysis" />
            <FeatureItem text="Basic Discord Access" />
          </div>

          <div className="pt-6 border-t border-zinc-800">
            {isPro ? (
               <button disabled className="w-full py-3 bg-zinc-800 text-zinc-400 rounded-xl font-medium cursor-default">
                 Current Plan
               </button>
            ) : isElite ? (
               <button disabled className="w-full py-3 bg-zinc-800 text-zinc-500 rounded-xl font-medium cursor-default">
                 Included in Elite
               </button>
            ) : (
              <SubscribeButton 
                plan="pro" 
                label={session ? "Subscribe - $30/mo" : "Sign In to Subscribe"} 
              />
            )}
          </div>
        </div>

        {/* === CARD 2: ELITE / UNLIMITED ($99.99) === */}
        <div className="relative group">
          {/* Glowing Border Effect for Premium Card */}
          <div className="absolute -inset-[1px] bg-gradient-to-b from-indigo-500 to-purple-600 rounded-3xl opacity-50 blur-sm group-hover:opacity-75 transition duration-1000"></div>
          
          <div className="relative bg-zinc-900 rounded-3xl p-8 h-full flex flex-col">
            
            {/* Best Value Badge */}
            <div className="absolute top-0 right-0 -mt-3 mr-6 px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-lg">
              Unlimited Access
            </div>

            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-xl font-bold text-white">Professional</h3>
                <p className="text-indigo-200/70 text-sm mt-1">For high-volume & algorithmic traders.</p>
              </div>
              <div className="text-right">
                <span className="text-4xl font-bold text-white">$99</span>
                <span className="text-zinc-400 text-xl font-bold">.99</span>
                <span className="text-zinc-500 text-sm font-medium block">/month</span>
              </div>
            </div>

            <div className="space-y-4 mb-8 flex-grow">
              <FeatureItem text="UNLIMITED Stock Signals" highlight />
              <FeatureItem text="UNLIMITED LEAP Option Signals" highlight />
              <FeatureItem text="Priority Execution Speed" />
              <FeatureItem text="Institutional Sentiment Feed" />
              <FeatureItem text="Direct Developer Support" />
            </div>

            <div className="pt-6 border-t border-zinc-800">
              {isElite ? (
                 <button disabled className="w-full py-3 bg-indigo-900/20 text-indigo-400 border border-indigo-500/30 rounded-xl font-bold cursor-default">
                   Your Active Plan
                 </button>
              ) : (
                <SubscribeButton 
                  plan="elite" 
                  label={session ? "Go Unlimited - $99.99/mo" : "Sign In to Upgrade"} 
                />
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Footer / Trust */}
      <div className="text-center pb-12 border-t border-white/5 pt-12">
        <p className="text-zinc-500 text-sm">
          Secure payments processed by Stripe. Cancel anytime from your dashboard.
        </p>
      </div>
    </div>
  );
}

// --- Helper Components ---
function FeatureItem({ text, highlight = false }: { text: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 ${highlight ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-400'}`}>
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
      </div>
      <span className={`text-sm ${highlight ? 'text-white font-semibold' : 'text-zinc-300'}`}>{text}</span>
    </div>
  );
}