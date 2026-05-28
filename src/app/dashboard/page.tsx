// src/app/dashboard/page.tsx
"use client";
import React, { useState } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
import LeapSignalForm from "@/components/LeapsSignalForm"; // Ensure you have this component!
import Link from "next/link";
import AuthButton from "@/components/AuthButton";
import BillingPortalButton from "@/components/BillingPortalButton";
type HybridReport = {
  ticker?: string;
  processedTimestamp?: string;
  layer1MacroGate?: { 
    score: number; 
    zone: "GREEN" | "YELLOW" | "RED"; 
    capitalAllocationMultiplier: number 
  };
  layer2QuantTechnicalScore?: number;
  layer3AiFundamentalScore?: number;
  aiBreakdownBuckets?: { 
    earnings_quality: number; 
    balance_sheet_safety: number; 
    margin_expansion: number; 
    red_flags: number; 
    justification_summary: string 
  };
  compositeScore?: number;
  executionDirectives?: { 
    recommendedPositionSizePct: number; 
    actionBias: string 
  };
  verdict?: string;
  reason?: string;
  macroGateScore?: number;
  deploymentZone?: string;
};

export default function HybridDashboard() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("");
  const [report, setReport] = useState<HybridReport | null>(null);
  const [error, setError] = useState("");
  const [showHelp, setShowHelp] = useState(false); // Toggle state for the documentation modal

  const runAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker) return;
    setLoading(true);
    setError("");
    setReport(null);

    try {
      setStage("Evaluating Layer 1 Macro Environment...");
  await new Promise((r) => setTimeout(r, 800));
  
  setStage("Executing Layer 2 Mathematical Quant Scans...");
  await new Promise((r) => setTimeout(r, 800));

  setStage("Processing Layer 3 Corporate Filings via AI Analyst API...");
  
  const res = await fetch("/api/hybrid-signal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker }),
  });

  // 1. DEFENSIVE CHECK: If the server threw a 500 text error, handle it before running .json()
  if (!res.ok) {
    const errorText = await res.text();
    // Check if it's a generic unhandled server message
    if (errorText.includes("Internal Server Error")) {
      throw new Error("The backend pipeline crashed completely. Check your server terminal logs or environment keys.");
    }
    
    // Attempt to safely parse a structured backend JSON error if available
    try {
      const parsedError = JSON.parse(errorText);
      throw new Error(parsedError.error || "Downstream processing cycle failure");
    } catch {
      throw new Error(errorText || "Unknown backend processing exception");
    }
  }

  // 2. Safe to parse now that we know res.ok is true
  const data = await res.json();
  setReport(data);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
      setStage("");
    }
  };

  return (
    
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans relative">
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
                className="px-4 py-1.5 text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-md transition-all"
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
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Terminal Header */}
        <div className="border-b border-zinc-800 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-mono font-bold tracking-tight text-white">HYBRID SYSTEMS RADAR TERMINAL</h1>
            <p className="text-sm text-zinc-400">Deterministic Mathematical Processing Over Qualitative Language Pipelines</p>
          </div>
          {/* Documentation Trigger Link */}
          <button 
            type="button" 
            onClick={() => setShowHelp(true)}
            className="text-xs font-mono bg-zinc-900 border border-zinc-800 hover:border-indigo-500 hover:text-white px-3 py-1.5 rounded transition-all text-zinc-400 flex items-center gap-2 shadow-sm"
          >
            <span className="text-indigo-400 font-bold">?</span> HOW TO READ THIS TERMINAL
          </button>
        </div>

        {/* Input Controls */}
        <form onSubmit={runAnalysis} className="flex gap-3 max-w-md">
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="ENTER TICKER (e.g. AAPL, NVDA)"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-4 py-2 font-mono text-white focus:outline-none focus:border-indigo-500 placeholder-zinc-600 uppercase text-sm"
            disabled={loading}
          />
          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white font-mono px-6 py-2 rounded text-sm font-bold transition-colors"
            disabled={loading}
          >
            {loading ? "PROCESSING..." : "RUN RADAR"}
          </button>
        </form>

        {/* Dynamic Process Pipeline Loader */}
        {loading && (
          <div className="p-8 border border-dashed border-zinc-800 rounded bg-zinc-900/50 flex flex-col items-center justify-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            <p className="text-sm font-mono text-zinc-400 tracking-wide animate-pulse">{stage}</p>
          </div>
        )}

        {/* Error Terminal Banner */}
        {error && (
          <div className="p-4 border border-rose-500/30 bg-rose-950/20 text-rose-400 rounded font-mono text-sm">
            [ERROR_SIGNAL_HALT]: {error}
          </div>
        )}

        {/* Report Output Configuration */}
        {report && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
            
            {/* Short Circuit / Block Trigger State */}
            {report.verdict === "HALT_TRADING_ROTATION_TO_CASH" ? (
              <div className="md:col-span-3 p-6 border border-rose-500/30 bg-rose-950/40 rounded-xl text-center space-y-3">
                <h2 className="text-xl font-bold font-mono text-rose-400">⚠️ LAYER 1 CIRCUIT BREAKER TRIPPED</h2>
                <p className="text-zinc-300 max-w-2xl mx-auto text-sm">{report.reason}</p>
                <div className="text-xs text-zinc-500 font-mono">Macro Gate Score: {report.layer1MacroGate?.score || report.macroGateScore}/100</div>
              </div>
            ) : (
              <>
                {/* Score Summary Directive Banner */}
                <div className="md:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-zinc-900 border border-zinc-800 p-6 rounded-xl items-center">
                  <div className="text-center sm:text-left">
                    <div className="text-xs font-mono text-zinc-400">UNIFIED COMPOSITE SCORE</div>
                    <div className="text-4xl font-mono font-black text-indigo-400 mt-1">{report.compositeScore ?? 0}%</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-mono text-zinc-400">RECOMMENDED EXHAUST POSITION SIZE</div>
                    <div className="text-2xl font-mono font-bold text-white mt-1">{report.executionDirectives?.recommendedPositionSizePct ?? 0}%</div>
                  </div>
                  <div className="text-center sm:text-right">
                    <div className="text-xs font-mono text-zinc-400">SYSTEM ARCHITECTURE ACTION BIAS</div>
                    <span className={`inline-block mt-2 font-mono text-xs font-bold px-3 py-1 rounded ${report.executionDirectives?.actionBias === "LONG_ACCUMULATE" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                      {report.executionDirectives?.actionBias ?? "NEUTRAL"}
                    </span>
                  </div>
                </div>

                {/* Layer 1 Module Display */}
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-4">
                  <h3 className="text-sm font-mono font-bold text-zinc-400 border-b border-zinc-800 pb-2">LAYER 1: MACRO ENVIRONMENT</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500">System Deployment Zone</span>
                    <span className={`font-mono font-bold text-sm ${report.layer1MacroGate?.zone === "GREEN" ? "text-emerald-400" : "text-amber-400"}`}>
                      {report.layer1MacroGate?.zone ?? "UNKNOWN"}
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div className={`h-2 rounded-full ${report.layer1MacroGate?.zone === "GREEN" ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${report.layer1MacroGate?.score ?? 0}%` }}></div>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono">
                    Macro Health Multiplier: {((report.layer1MacroGate?.capitalAllocationMultiplier ?? 0) * 100).toFixed(0)}%
                  </p>
                </div>

                {/* Layer 2 Module Display */}
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-4">
                  <h3 className="text-sm font-mono font-bold text-zinc-400 border-b border-zinc-800 pb-2">LAYER 2: QUANT MOMENTUM (60%)</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500">Technical Factor Score</span>
                    <span className="font-mono font-bold text-sm text-white">{report.layer2QuantTechnicalScore ?? 0}/100</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${report.layer2QuantTechnicalScore ?? 0}%` }}></div>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono">Calculated across 5 deterministic pricing rules.</p>
                </div>

                {/* Layer 3 Module Display */}
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-4">
                  <h3 className="text-sm font-mono font-bold text-zinc-400 border-b border-zinc-800 pb-2">LAYER 3: FUNDAMENTAL AI (40%)</h3>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-zinc-500">AI Forensic Safety Target</span>
                    <span className="font-mono font-bold text-sm text-white">{report.layer3AiFundamentalScore ?? 0}/100</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${report.layer3AiFundamentalScore ?? 0}%` }}></div>
                  </div>
                  
                  {/* Granular AI Metrics Checklist */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-mono pt-2 border-t border-zinc-800/60 text-zinc-400">
                    <div>Earnings Quality: <span className="text-white">{report.aiBreakdownBuckets?.earnings_quality ?? 0}/10</span></div>
                    <div>Balance Sheet: <span className="text-white">{report.aiBreakdownBuckets?.balance_sheet_safety ?? 0}/10</span></div>
                    <div>Margin Scaling: <span className="text-white">{report.aiBreakdownBuckets?.margin_expansion ?? 0}/100</span></div>
                    <div>Clean History: <span className="text-white">{report.aiBreakdownBuckets?.red_flags ?? 0}/10</span></div>
                  </div>
                </div>

                {/* AI Textual Audit Analysis Trail */}
                <div className="md:col-span-3 bg-zinc-900 border border-zinc-800 p-5 rounded-xl">
                  <h3 className="text-sm font-mono font-bold text-zinc-400 border-b border-zinc-800 pb-2 mb-3">QUALITATIVE AI AUDIT TRAIL EVIDENCE</h3>
                  <p className="text-xs font-mono text-zinc-300 leading-relaxed bg-zinc-950 p-4 border border-zinc-800/80 rounded whitespace-pre-line">
                    {report.aiBreakdownBuckets?.justification_summary ?? "No textual audit trail logs provided for this execution cycle."}
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* DOCUMENTATION MODAL ACCORDION LAYER */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl p-6 space-y-6 text-sm text-zinc-300">
            
            {/* Modal Header */}
            <div className="border-b border-zinc-800 pb-3 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-mono font-bold text-white">SYSTEM PIPELINE MANUAL</h2>
                <p className="text-xs text-zinc-500">Understanding the 3-Layer Risk & Allocation Logic</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowHelp(false)}
                className="text-zinc-500 hover:text-white font-mono text-xs border border-zinc-800 hover:border-zinc-700 bg-zinc-950 px-2.5 py-1 rounded transition-colors"
              >
                ESC ×
              </button>
            </div>

            {/* Layer 1 Explanation */}
            <div className="space-y-2">
              <h3 className="font-mono font-bold text-indigo-400 text-xs tracking-wider">LAYER 1: THE MACRO DEPLOYMENT GATE (DETERMINISTIC)</h3>
              <p className="text-xs leading-relaxed text-zinc-400">
                Before evaluating individual stocks, the system looks at the overarching macro regime using 1-year systemic indicators (SPY pricing structural trend vs. VIXY baseline volatility indices).
              </p>
              <ul className="list-disc pl-5 text-xs space-y-1 text-zinc-400 font-mono">
                <li><strong className="text-zinc-300">GREEN Zone (Score &gt;= 70):</strong> Unrestricted trading conditions. Capital allocation is multiplied at 100%.</li>
                <li><strong className="text-zinc-300">YELLOW Zone (Score 40-69):</strong> Hidden technical headwinds detected. Postured defensively; position sizing is cut to 60%.</li>
                <li><strong className="text-zinc-300">RED Zone (Score &lt; 40):</strong> High systemic failure risk. The system trips a circuit breaker and blocks downstream operations to keep your assets completely in cash.</li>
              </ul>
            </div>

            <hr className="border-zinc-800/60" />

            {/* Layer 2 Explanation */}
            <div className="space-y-2">
              <h3 className="font-mono font-bold text-indigo-400 text-xs tracking-wider">LAYER 2: THE QUANTITATIVE SCANNER (DETERMINISTIC)</h3>
              <p className="text-xs leading-relaxed text-zinc-400">
                A hardcoded mathematical score from 0 to 100 evaluated over a 260-day historical window. It ignores opinions and looks strictly at 5 technical factors: moving average stacked alignments, macro index trends, RSI baseline configurations, momentum velocity, and MACD divergence vectors.
              </p>
            </div>

            <hr className="border-zinc-800/60" />

            {/* Layer 3 Explanation */}
            <div className="space-y-2">
              <h3 className="font-mono font-bold text-indigo-400 text-xs tracking-wider">LAYER 3: FUNDAMENTAL AI ANALYST (NON-DETERMINISTIC)</h3>
              <p className="text-xs leading-relaxed text-zinc-400">
                The top momentum candidates are passed to Claude Opus 4.8 to serve as a qualitative risk screen. The system strips prompt noise and sends the last 4 quarters of corporate filings. Claude executes tool-forced audit scores (1-10) tracking earnings authenticity, leverage safety, and operational margin expansion.
              </p>
            </div>

            <hr className="border-zinc-800/60" />

            {/* The Blend Explanation */}
            <div className="space-y-2 bg-zinc-950 p-4 border border-zinc-800/60 rounded-lg">
              <h3 className="font-mono font-bold text-white text-xs tracking-wider">THE 60/40 COMPOSITE BLEND WEIGHTING</h3>
              <blockquote className="text-xs text-zinc-400 border-l-2 border-indigo-500 pl-3 italic leading-relaxed">
                Math tracks the momentum trend, but language catches the corporate fraud.
              </blockquote>
              <p className="text-xs leading-relaxed text-zinc-400 mt-2">
                The unified ranking is computed by combining the scores: **60% Weight** goes to the Layer 2 technical scanner, and **40% Weight** goes to Claudes forensic accounting score. This architecture prevents the system from blindly pursuing high-momentum technical breakouts that are hidden fundamental value traps.
              </p>
            </div>

            {/* Close Button */}
            <div className="pt-2">
              <button 
                type="button" 
                onClick={() => setShowHelp(false)}
                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-mono py-2 rounded text-xs font-bold transition-colors"
              >
                ACKNOWLEDGE & CLOSE TERMINAL MANUAL
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}