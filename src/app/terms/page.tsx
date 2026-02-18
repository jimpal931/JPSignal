import Link from "next/link";

export const dynamic = "force-static";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-300 selection:bg-blue-500 selection:text-white font-sans">
      
      {/* Navigation / Back Button */}
      <nav className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link 
            href="/" 
            className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Home
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="space-y-8">
          
          {/* Header */}
          <div className="border-b border-zinc-800 pb-8">
            <h1 className="text-4xl font-extrabold tracking-tight text-white mb-4">Terms of Use &amp; Disclaimer</h1>
            <p className="text-zinc-500">Last Updated: February 2026</p>
          </div>

          {/* Content */}
          <section className="space-y-12 text-base leading-relaxed text-zinc-300">
            
            <div className="space-y-4">
              <p className="text-lg text-zinc-200">
                These Terms of Use (&quot;Terms&quot;) govern your access to and use of
                the <span className="text-white font-semibold">JP Signals / AInsight.dev</span> website, tools, and related services
                (collectively, the &quot;Service&quot;). By using the Service, you agree to
                these Terms.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white">1. Educational Purposes Only</h2>
              <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-2xl">
                <p>
                  All content, signals, analyses, and materials provided through the
                  Service are for{" "}
                  <span className="text-blue-400 font-bold">educational and informational purposes only</span>.
                  Nothing provided by the Service constitutes investment, financial,
                  legal, tax, or trading advice, or a recommendation to buy, sell, or
                  hold any security, option, or other financial instrument.
                </p>
                <p className="mt-4">
                  You are solely responsible for your own trading and investment
                  decisions. You should consult with a qualified financial adviser,
                  tax professional, and/or legal counsel before making any investment
                  decisions.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white">2. No Guarantee of Accuracy or Results</h2>
              <p>
                The Service relies on third-party market data providers, large
                language models, and other automated systems that may contain errors,
                delays, omissions, or inaccuracies.{" "}
                <span className="text-white font-semibold">
                  No representation or warranty is made that any information, signal,
                  or output is complete, accurate, up-to-date, or suitable for any
                  particular purpose.
                </span>
              </p>
              <p>
                Past performance, backtests, or historical examples{" "}
                <span className="text-white font-semibold">do not guarantee future results</span>.
                You understand that all trading and investing involves risk, including
                the possible loss of principal.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white">3. No Fiduciary or Advisory Relationship</h2>
              <p>
                The Service, its owner(s), and any future entity{" "}
                <span className="text-white font-semibold">
                  are not acting as your investment adviser, broker, dealer, or
                  fiduciary
                </span>
                . Use of the Service does not create any advisory, fiduciary,
                client, or professional relationship.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white">4. User Responsibility and Risk</h2>
              <p>
                You understand and agree that{" "}
                <span className="text-white font-semibold">
                  you alone are responsible for evaluating the risks associated with
                  any investment or trade
                </span>
                , and for any use of the information, tools, or signals provided by
                the Service.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white">5. Limitation of Liability</h2>
              <p>
                To the fullest extent permitted by applicable law,{" "}
                <span className="text-white font-semibold">
                  the Service and its owner(s) shall not be liable
                  for any direct, indirect, incidental, consequential, special, or
                  exemplary damages
                </span>{" "}
                arising out of or in connection with your use of, or inability to use,
                the Service, including but not limited to:
              </p>
              <ul className="grid sm:grid-cols-2 gap-3 pt-2">
                {["Trading or investment losses", "Lost profits or opportunities", "Loss of data", "Errors in data or signals", "Decisions based on the Service"].map((item, i) => (
                  <li key={i} className="flex items-center text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-600 mr-3"></span>
                    {item}
                  </li>
                ))}
              </ul>
              <p className="pt-2">
                You agree that any use of the Service is at your{" "}
                <span className="text-white font-semibold">own sole risk</span>.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white">6. Subscriptions &amp; Refunds</h2>
              <p>
                If you purchase a paid subscription through Stripe, you authorize
                recurring charges according to the plan you select. Pricing and features
                may change over time, and such changes will normally apply from your next billing
                cycle.
              </p>
              <p className="p-4 border-l-4 border-red-500 bg-red-500/10 text-red-200">
                <span className="font-bold block mb-1">Refund Policy</span>
                Unless explicitly stated otherwise, all payments are non-refundable.
                You are responsible for canceling your subscription via the billing
                portal before the next billing period if you no longer wish to be
                charged.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-white">7. Contact</h2>
              <p>
                If you have questions about these Terms or the Service, please contact the
                operator via the support email listed on your account dashboard.
              </p>
            </div>

          </section>
        </div>
      </main>
    </div>
  );
}