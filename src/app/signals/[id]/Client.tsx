"use client";
import { useState } from "react";

interface TradeDetails {
  instrument: string;
  direction: "long" | "short";
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  size: number;
  confidence: number;
  entry_timing: string;
  signal_publish_time: string;
  news_sentiment: string;
  news_sentiment_score: number;
}

interface ParsedSignalReport {
  rawMarkdown: string;
  details: TradeDetails;
  consensusText: string;
}

export default function SignalClient({ signalId }: { signalId: string }) {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [report, setReport] = useState<ParsedSignalReport | null>(null);
  const [viewMode, setViewMode] = useState<"terminal" | "raw">("terminal");

  // Decouple structured metrics nested inside LLM text responses
  function extractSignalData(rawText: string): ParsedSignalReport | null {
    try {
      const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
      const match = rawText.match(jsonRegex);
      if (!match) return null;
      
      const parsedJson = JSON.parse(match[1]);
      const details = parsedJson.TRADE_DETAILS as TradeDetails;

      let consensusText = "";
      const consensusMatch = rawText.match(/### Market Direction Consensus for[\s\S]*?\n([\s\S]*?)\n###/);
      if (consensusMatch) {
        consensusText = consensusMatch[1].trim();
      }

      return { rawMarkdown: rawText, details, consensusText };
    } catch (e) {
      console.error("Downstream extraction fault", e);
      return null;
    }
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setReport(null);
    setLoading(true);
    
    try {
      const r = await fetch("/api/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId, ticker: ticker.trim().toUpperCase() }),
      });
      
      // Crucial: Read response as plain text first to isolate the raw markdown output
      const rawText = await r.text();
      
      if (!r.ok) throw new Error(rawText || "Downstream processing cycle exception");
      if (rawText.includes("INSUFFICIENT_DATA")) {
        throw new Error("Market intelligence report returned INSUFFICIENT_DATA for ticker.");
      }

      const parsedData = extractSignalData(rawText);
      if (!parsedData) {
        throw new Error("Unable to extract inner quantitative JSON configurations.");
      }
      
      setReport(parsedData);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const isLong = report?.details.direction === "long";
  const themeAccent = isLong ? "text-emerald-400" : "text-rose-400";
  const themeBg = isLong ? "bg-emerald-500/10" : "bg-rose-500/10";
  const themeBorder = isLong ? "border-emerald-500/20" : "border-rose-500/20";

  return (
    <div className="space-y-6">
      
      {/* Ticker Form Control console */}
      <form onSubmit={run} className="flex gap-3 max-w-md bg-zinc-900 p-2 rounded-xl border border-zinc-800 shadow-lg">
        <input
          className="bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 font-mono text-white focus:outline-none focus:border-indigo-500 placeholder-zinc-600 uppercase text-sm flex-1"
          placeholder="ENTER TICKER (e.g., AMD, NVDA)"
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
          {loading ? "SCANNING..." : "RUN RADAR"}
        </button>
      </form>

      {/* Loading Terminal Indicator */}
      {loading && (
        <div className="p-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/30 flex flex-col items-center justify-center space-y-4 font-mono">
          <div className="h-6 w-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-zinc-400 tracking-widest animate-pulse">EXECUTING QUANT MATHEMATICAL DEPLOYMENT CYCLES...</p>
        </div>
      )}

      {/* Error Output Layer */}
      {err && (
        <div className="p-4 border border-rose-500/30 bg-rose-950/20 text-rose-400 rounded-xl font-mono text-sm shadow-md animate-fadeIn">
          [SYSTEM_SIGNAL_HALT]: {err}
        </div>
      )}

      {/* Main Analytical Report Panel */}
      {report && !loading && (
        <div className="space-y-4 animate-fadeIn">
          
          {/* Dynamic layout layout switcher controls */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setViewMode("terminal")}
              className={`px-3 py-1 text-xs font-mono rounded-md border transition-all cursor-pointer ${viewMode === "terminal" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}
            >
              TERMINAL VIEW
            </button>
            <button
              onClick={() => setViewMode("raw")}
              className={`px-3 py-1 text-xs font-mono rounded-md border transition-all cursor-pointer ${viewMode === "raw" ? "bg-indigo-600 border-indigo-500 text-white" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"}`}
            >
              RAW MARKDOWN TEXT
            </button>
          </div>

          {viewMode === "raw" ? (
            <pre className="p-5 bg-zinc-950 border border-zinc-800 rounded-xl font-mono text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed shadow-inner">
              {report.rawMarkdown}
            </pre>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Bento Row 1: Executive Status Banner */}
              <div className="md:col-span-3 bg-zinc-900 border border-zinc-800 p-6 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-md">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-mono font-black tracking-wider text-white">{report.details.instrument}</span>
                    <span className={`px-3 py-1 font-mono text-xs font-black uppercase rounded tracking-wider ${themeBg} ${themeAccent} border ${themeBorder}`}>
                      {report.details.direction === "long" ? "🚀 BUY / LONG" : "📉 SELL / SHORT"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono mt-1">TIMESTAMP: {report.details.signal_publish_time}</p>
                </div>
                
                <div className="w-full sm:w-48">
                  <div className="flex justify-between items-center text-xs font-mono mb-1 text-zinc-400">
                    <span>CONFIDENCE METRIC</span>
                    <span className="text-white font-bold">{(report.details.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div className="bg-indigo-500 h-2 rounded-full transition-all duration-500" style={{ width: `${report.details.confidence * 100}%` }}></div>
                  </div>
                </div>
              </div>

              {/* Bento Row 2: Target Execution Parameters */}
              <div className="md:col-span-2 bg-zinc-900 border border-zinc-800 p-5 rounded-xl space-y-6 shadow-md">
                <h3 className="text-xs font-mono font-bold text-zinc-400 tracking-wider uppercase border-b border-zinc-800 pb-2">QUANTITATIVE RISK PLAN</h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-zinc-950 p-4 border border-zinc-800/80 rounded-lg">
                    <div className="text-[10px] font-mono text-zinc-500">ENTRY TRIGGER LEVEL</div>
                    <div className="text-lg font-mono font-bold text-white mt-0.5">${report.details.entry_price.toFixed(2)}</div>
                    <div className="text-[10px] font-mono mt-1 uppercase text-indigo-400">⚡ {report.details.entry_timing.replace(/_/g, " ")}</div>
                  </div>
                  <div className="bg-zinc-950 p-4 border border-zinc-800/80 rounded-lg">
                    <div className="text-[10px] font-mono text-rose-500/70">STOP LOSS LEVEL</div>
                    <div className="text-lg font-mono font-bold text-rose-400 mt-0.5">${report.details.stop_loss.toFixed(2)}</div>
                    <div className="text-[10px] font-mono text-zinc-500 mt-1">Defensive Structural Floor</div>
                  </div>
                  <div className="bg-zinc-950 p-4 border border-zinc-800/80 rounded-lg">
                    <div className="text-[10px] font-mono text-emerald-500/70">PROFIT OBJECTIVE</div>
                    <div className="text-lg font-mono font-bold text-emerald-400 mt-0.5">${report.details.take_profit.toFixed(2)}</div>
                    <div className="text-[10px] font-mono text-zinc-500 mt-1">Strict 1:3 RR Matrix Target</div>
                  </div>
                </div>

                <div className="bg-zinc-950 p-4 border border-zinc-800/60 rounded-lg space-y-3">
                  <div className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider">Spatial Risk Matrix Continuum</div>
                  <div className="relative pt-2">
                    <div className="w-full bg-zinc-800 h-1.5 rounded flex overflow-hidden">
                      <div className="bg-rose-500/40 h-full" style={{ width: "25%" }}></div>
                      <div className="bg-indigo-500 h-full" style={{ width: "35%" }}></div>
                      <div className="bg-emerald-500/40 h-full" style={{ width: "40%" }}></div>
                    </div>
                    <div className="flex justify-between text-[10px] font-mono text-zinc-500 mt-1.5">
                      <span>STOP (${report.details.stop_loss})</span>
                      <span className="text-indigo-400">TRIGGER (${report.details.entry_price})</span>
                      <span className="text-emerald-400">OBJECTIVE (${report.details.take_profit})</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bento Row 3: Allocation Sizing & Sentiment Dial */}
              <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-xl flex flex-col justify-between gap-4 shadow-md">
                <div>
                  <h3 className="text-xs font-mono font-bold text-zinc-400 tracking-wider uppercase border-b border-zinc-800 pb-2 mb-4">PORTFOLIO MATRIX WEIGHTING</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="text-[11px] font-mono text-zinc-500">RECOMMENDED EXPOSURE UNIT</div>
                      <div className="text-2xl font-mono font-black text-white mt-0.5">{report.details.size.toFixed(1)}%</div>
                      <p className="text-[10px] text-zinc-500 font-mono mt-0.5">Scale allocation units down per personal equity limits.</p>
                    </div>

                    <div className="pt-3 border-t border-zinc-800/50">
                      <div className="text-[11px] font-mono text-zinc-500 mb-1.5">NEWS SENTIMENT SCORE</div>
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full animate-pulse ${report.details.news_sentiment_score >= 0 ? "bg-emerald-400" : "bg-rose-400"}`} />
                        <span className="font-mono text-sm font-bold text-zinc-200 capitalize">{report.details.news_sentiment}</span>
                        <span className="text-xs font-mono text-zinc-500">({report.details.news_sentiment_score.toFixed(2)})</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-zinc-600 leading-snug border-t border-zinc-800/40 pt-2">
                  AInsight Realtime Execution Engine V3. Data compiled dynamically via real-time technical tracking endpoints.
                </div>
              </div>

              {/* Bento Row 4: Narrative Text Consensus Panel */}
              {report.consensusText && (
                <div className="md:col-span-3 bg-zinc-900 border border-zinc-800 p-5 rounded-xl shadow-md">
                  <h3 className="text-xs font-mono font-bold text-zinc-400 tracking-wider uppercase border-b border-zinc-800 pb-2 mb-3">SYSTEM ANALYSIS CONTEXT</h3>
                  <p className="text-xs font-mono text-zinc-300 leading-relaxed bg-zinc-950 p-4 border border-zinc-800/80 rounded whitespace-pre-line">
                    {report.consensusText}
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