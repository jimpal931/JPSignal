"use client";
import { useState } from "react";

export default function SignalClient({ signalId }: { signalId: string }) {
  const [ticker, setTicker] = useState("");
  const [out, setOut] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOut(null);
    setLoading(true);
    try {
      const r = await fetch("/api/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId, ticker: ticker.trim().toUpperCase() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Unknown error");
      setOut(j.result);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setErr(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={run} className="flex gap-2">
        <input
          className="border rounded px-3 py-2 flex-1"
          placeholder="TICKER (e.g., GOOGL)"
          value={ticker}
          onChange={e => setTicker(e.target.value)}
          pattern="[A-Za-z.\-]{1,10}"
          required
        />
        <button className="px-4 py-2 rounded bg-black text-white disabled:opacity-50" disabled={loading}>
          {loading ? "Running..." : "Run"}
        </button>
      </form>
      {err && <pre className="text-red-600 whitespace-pre-wrap">{err}</pre>}
      {out && <article className="border rounded p-4 whitespace-pre-wrap">{out}</article>}
    </div>
  );
}