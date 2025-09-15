// src/components/SignalForm.tsx
"use client";

import * as React from "react";

type Props = {
  defaultTicker?: string;
};

export default function SignalForm({ defaultTicker = "" }: Props) {
  const [ticker, setTicker] = React.useState(defaultTicker);
  const [out, setOut] = React.useState<string | null>(null);   // markdown string from server
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const t = ticker.trim().toUpperCase();

    if (!t) {
      setErr("Please enter a ticker (e.g., AAPL).");
      return;
    }

    setLoading(true);
    setErr(null);
    setOut(null);

    try {
      const r = await fetch("/api/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t }),
      });

      const txt = await r.text(); // server returns text/markdown or "INSUFFICIENT_DATA"

      // Friendly errors by HTTP code
      if (!r.ok) {
        // Surface text body if present
        throw new Error(txt || `Request failed (${r.status})`);
      }

      const trimmed = txt.trim();

      if (trimmed === "INSUFFICIENT_DATA") {
        setErr("Live data unavailable or temporarily rate-limited. Please retry in ~60 seconds.");
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
          <label htmlFor="ticker" className="block text-sm font-medium mb-1">
            Ticker
          </label>
          <input
            id="ticker"
            name="ticker"
            type="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="e.g., AAPL"
            className="w-full rounded-md border px-3 py-2 ring-0 outline-none focus:border-black"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !ticker.trim()}
          className="rounded-md bg-black text-white px-4 py-2 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Get Signal"}
        </button>
      </form>

      {err && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {err}
        </div>
      )}

      {out && (
        <article className="prose max-w-none">
          {/* Quick render: plain <pre>. 
              If you prefer nice Markdown, install react-markdown and render it instead. */}
          <pre className="whitespace-pre-wrap break-words text-sm leading-6">
            {out}
          </pre>
        </article>
      )}
    </div>
  );
}