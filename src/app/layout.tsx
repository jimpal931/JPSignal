// src/app/layout.tsx
import "./globals.css";
import Providers from "@/components/Providers";
import {MacroHeader} from "@/components/MacroHeader"; // Global Macro Status component
import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-zinc-950 text-zinc-100 min-h-screen flex flex-col antialiased">
        <Providers>
          {/* Layer 1 Persistent Header Banner across all routes */}
          <MacroHeader />
          
          {/* Main Global Navigation Infrastructure */}
          {/* <header className="border-b border-zinc-900 bg-zinc-950/50 backdrop-blur sticky top-0 z-40 w-full px-6 py-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <Link href="/" className="font-mono font-black tracking-wider text-white hover:opacity-80">
                AInsight<span className="text-indigo-500">SIGNALS</span>
              </Link>
              <nav className="flex items-center gap-6 text-sm font-mono text-zinc-400">
                <Link href="/dashboard" className="hover:text-white transition-colors font-bold text-zinc-200">Radar Terminal</Link>
                <Link href="/signals" className="hover:text-white transition-colors">Signals</Link>
                <Link href="/leaps" className="hover:text-white transition-colors">LEAPs</Link>
                <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
                <Link href="/account" className="hover:text-white transition-colors">Account</Link>
              </nav>
            </div>
          </header> */}

          {/* Active Router Page Context */}
          <main className="flex-1 w-full">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}