// src/components/LeapsSignalForm.tsx
"use client";

import * as React from "react";

type Props = { defaultTicker?: string };

export default function LeapsSignalForm({ defaultTicker = "" }: Props) {
  const [ticker, setTicker] = React.useState(defaultTicker);
  const [out, setOut] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t) { setErr("Please enter a ticker (e.g., AMZN)."); return; }

    setLoading(true); setErr(null); setOut(null);
    try {
      const r = await fetch("/api/leapsignalv2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t }), // <-- no side
      });
      const txt = await r.text();

      if (!r.ok) throw new Error(txt || `Request failed (${r.status})`);

      const trimmed = txt.trim();
      if (trimmed.startsWith("INSUFFICIENT_DATA")) {
        const reason = trimmed.includes(":") ? trimmed.split(":").slice(1).join(":") : "";
        setErr(reason ? `Data unavailable: ${reason}.` : "Data unavailable or rate-limited.");
        return;
      }
      setOut(trimmed);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="ticker" className="block text-sm font-medium mb-1">Ticker</label>
        <input
            id="ticker" name="ticker" type="text"
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            value={ticker} onChange={(e) => setTicker(e.target.value)}
            placeholder="e.g., AMZN"
            className="w-full rounded-md border px-3 py-2 ring-0 outline-none focus:border-black"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !ticker.trim()}
          className="rounded-md bg-black text-white px-4 py-2 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Get LEAP Signal"}
        </button>
      </form>

      {err && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {err}
        </div>
      )}

      {out && (
        <article className="prose max-w-none">
          <pre className="whitespace-pre-wrap break-words text-sm leading-6">{out}</pre>
        </article>
      )}
    </div>
  );
}