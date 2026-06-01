"use client";
import { useState } from "react";

// Exact interface reflecting the flat schema inside /api/leapsignalv2
interface LeapTradeDetails {
  instrument: string;
  direction: "call" | "put";
  strike: number;
  expiry: string;
  conviction: string;
  profit_target: number;
  stop_loss: number;
  entry_price: number;
  entry_price_source: string;
  signal_publish_time: string;
  news_sentiment: string;
}

interface ParsedLeapReport {
  rawMarkdown: string;
  details: LeapTradeDetails;
  conclusionText: string;
}

export default function LeapsSignalForm({ signalId }: { signalId: string }) {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<ParsedLeapReport | null>(null);
  const [viewMode, setViewMode] = useState<"terminal" | "raw">("terminal");

  // Decouple structured metrics nested inside LEAP text responses
  function extractLeapData(rawText: string): ParsedLeapReport | null {
    try {
      const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
      const match = rawText.match(jsonRegex);
      if (!match) return null;
      
      // FIXED: Read fields directly from root because LEAP JSON has no nested TRADE_DETAILS object
      const parsedJson = JSON.parse(match[1]);
      const details = parsedJson as LeapTradeDetails;

      // FIXED: Extract the "Clear Conclusion" paragraph section from the LEAP prompt structure
      let conclusionText = "";
      const conclusionMatch = rawText.match(/### Clear Conclusion[\s\S]*?\n([\s\S]*?)\n###/);
      if (conclusionMatch) {
        conclusionText = conclusionMatch[1].trim();
      }

      return {
        rawMarkdown: rawText,
        details,
        conclusionText
      };
    } catch (e) {
      console.error("LEAP extraction pipeline fault", e);
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setReport(null);
    setLoading(true);
    
    try {
      const r = await fetch("/api/leapsignalv2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId, ticker: ticker.trim().toUpperCase() }),
      });
      
      const rawText = await r.text();
      
      if (!r.ok) throw new Error(rawText || "Downstream LEAP cycle processing exception");
      if (rawText.includes("INSUFFICIENT_DATA")) {
        throw new Error("Market intelligence report returned INSUFFICIENT_DATA for option chain scan.");
      }

      const parsedData = extractLeapData(rawText);
      if (!parsedData || !parsedData.details.instrument) {
        throw new Error("Unable to parse flat quantitative option JSON configurations.");
      }
      
      setReport(parsedData);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // Visual layout configurations keyed directly off choice of option type
  const isCall = report?.details.direction === "call";
  const themeAccent = isCall ? "text-emerald-400" : "text-rose-400";
  const themeBg = isCall ? "bg-emerald-500/10" : "bg-rose-500/10";
  const themeBorder = isCall ? "border-emerald-500/20" : "border-rose-500/20";

  return (
    <div className="space-y-6 w-full">
      
      {/* Ticker Search Console */}
      <form onSubmit={handleSubmit} className="flex gap-3 max-w-md bg-zinc-900 p-2 rounded-xl border border-zinc-800 shadow-lg">
        <input
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 font-mono text-white focus:outline-none focus:border-indigo-500 placeholder-zinc-600 uppercase text-sm flex-1"
          placeholder="ENTER TICKER (e.g., TSLA, NVDA)"
          value={ticker}
          onChange={e => setTicker(e.target.value)}
          pattern="[A-Za-z.\-]{1,10}"
          required
          disabled={loading}
        />
        <button 
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 text-white font-mono px-5 py-2 rounded-lg text-sm font-bold transition-colors cursor-pointer" 
          disabled={loading}
        >
          {loading ? "SCANNING CHAIN..." : "RUN RADAR"}
        </button>
      </form>

      {/* Loading State */}
      {loading && (
        <div className="p-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30 flex flex-col items-center justify-center space-y-4 font-mono">
          <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-zinc-400 tracking-widest animate-pulse">DERIVING BLACK-SCHOLES VOLATILITY CONTEXTS & OPTION CANDIDATES...</p>
        </div>
      )}

      {/* Error State */}
      {err && (
        <div className="p-4 border border-rose-500/30 bg-rose-950/20 text-rose-400 rounded-xl font-mono text-sm shadow-md">
          [SYSTEM_LEAP_HALT]: {err}
        </div>
      )}

      {/* Options Dashboard Grid */}
      {report && !loading && (
        <div className="space-y-4 animate-fadeIn w-full">
          
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setViewMode("terminal")}
              className={`px-3 py-1 text-xs font-mono rounded-md border transition-all cursor-pointer ${viewMode === "terminal" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}
            >
              TERMINAL VIEW
            </button>
            <button
              type="button"
              onClick={() => setViewMode("raw")}
              className={`px-3 py-1 text-xs font-mono rounded-md border transition-all cursor-pointer ${viewMode === "raw" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}
            >
              RAW TEXT PRINTOUT
            </button>
          </div>

          {viewMode === "raw" ? (
            <pre className="p-5 bg-zinc-950 border border-zinc-800 rounded-xl font-mono text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
              {report.rawMarkdown}
            </pre>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              
              {/* Bento Card 1: Asset Core Status */}
              <div className="md:col-span-3 bg-zinc-900 border border-zinc-800 p-6 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-md">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-mono font-black tracking-wider text-white">{report.details.instrument}</span>
                    <span className={`px-3 py-1 font-mono text-xs font-black uppercase rounded tracking-wider ${themeBg} ${themeAccent} border ${themeBorder}`}>
                      LEAP {report.details.direction === "call" ? "🚀 CALL OPTION" : "📉 PUT OPTION"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono mt-1">GENERATED: {report.details.signal_publish_time}</p>
                </div>
                
                <div className="text-center sm:text-right">
                  <div className="text-[10px] font-mono text-zinc-500">MOMENTUM CONVICTION STRENGTH</div>
                  <span className="inline-block mt-1 font-mono text-xs font-bold px-3 py-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wide">
                    {report.details.conviction}
                  </span>
                </div>
              </div>

              {/* Bento Card 2: Contract Parameters and Target Matrix */}
              <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-6 shadow-md">
                <h3 className="text-xs font-mono font-bold text-zinc-400 tracking-wider uppercase border-b border-zinc-800 pb-2">CONTRACT CHAIN SPECIFICATIONS</h3>
                
                {/* Contract Specs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                    <div className="text-[10px] font-mono text-zinc-500">TARGET STRIKE</div>
                    <div className="text-lg font-mono font-bold text-white mt-0.5">${report.details.strike.toFixed(2)}</div>
                  </div>
                  <div className="bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                    <div className="text-[10px] font-mono text-zinc-500">EXPIRATION DATE</div>
                    <div className="text-sm font-mono font-bold text-indigo-400 mt-2 truncate">{report.details.expiry}</div>
                  </div>
                  <div className="bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                    <div className="text-[10px] font-mono text-zinc-500">LIMIT ENTRY BID</div>
                    <div className="text-lg font-mono font-bold text-white mt-0.5">${report.details.entry_price.toFixed(2)}</div>
                  </div>
                  <div className="bg-zinc-950 p-3 border border-zinc-800/80 rounded-lg">
                    <div className="text-[10px] font-mono text-zinc-500">PRICE FEED SOURCE</div>
                    <div className="text-[11px] font-mono text-zinc-400 mt-2 font-bold uppercase truncate text-indigo-400">{report.details.entry_price_source}</div>
                  </div>
                </div>

                {/* Premium Targets */}
                <div className="pt-2">
                  <h4 className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-2">Premium Premium Target Boundaries</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-zinc-950/60 p-3 border border-rose-500/20 rounded-lg flex justify-between items-center">
                      <span className="text-xs font-mono text-rose-400">Hard Premium Stop Loss (-15%)</span>
                      <span className="font-mono font-bold text-sm text-white">${report.details.stop_loss.toFixed(2)}</span>
                    </div>
                    <div className="bg-zinc-950/60 p-3 border border-emerald-500/20 rounded-lg flex justify-between items-center">
                      <span className="text-xs font-mono text-emerald-400">Premium Take Profit Limit (+25%)</span>
                      <span className="font-mono font-bold text-sm text-white">${report.details.profit_target.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bento Card 3: Execution Sizing Advice */}
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl flex flex-col justify-between gap-4 shadow-md">
                <div>
                  <h3 className="text-xs font-mono font-bold text-zinc-400 tracking-wider uppercase border-b border-zinc-800 pb-2 mb-4">LEAP EXECUTION PRINCIPLES</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="text-[11px] font-mono text-zinc-500">MAX ALLOCATION CAPACITY</div>
                      <div className="text-xl font-mono font-black text-white mt-1">1 to 2 Contracts Max</div>
                      <p className="text-[10px] text-zinc-500 font-mono mt-1 leading-normal">Options use high leverage leverage units. Protect principal balance assets continuously.</p>
                    </div>

                    <div className="pt-3 border-t border-zinc-800/50">
                      <div className="text-[11px] font-mono text-zinc-500 mb-1">GENERAL MEDIA OVERVIEW</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                        <span className="font-mono text-sm font-bold text-zinc-300 capitalize">{report.details.news_sentiment || "Neutral Context"}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-zinc-600 leading-snug border-t border-zinc-800/40 pt-2">
                  AInsight Options Terminal. Option matrices modeled directly from delta parameters over true implied standard deviations.
                </div>
              </div>

              {/* Bento Card 4: Clear Narrative Context */}
              {report.conclusionText && (
                <div className="md:col-span-3 bg-zinc-900 border border-zinc-800 p-5 rounded-xl shadow-md">
                  <h3 className="text-xs font-mono font-bold text-zinc-400 tracking-wider uppercase border-b border-zinc-800 pb-2 mb-3">SYSTEM POSITION CONTEXT & CONCLUSION</h3>
                  <p className="text-xs font-mono text-zinc-300 leading-relaxed bg-zinc-950 p-4 border border-zinc-800/80 rounded whitespace-pre-line">
                    {report.conclusionText}
                  </p>
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}