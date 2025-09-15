// src/lib/market-polygon.ts
const KEY = process.env.POLYGON_API_KEY!;
const BASE = "https://api.polygon.io";
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function q(url: string) {
  return url + (url.includes("?") ? "&" : "?") + "apiKey=" + KEY;
}

async function jget<T>(path: string) {
  const url = q(BASE + path);
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new HttpError(r.status, `Polygon ${r.status} for ${path}`);
  return (await r.json()) as T;
}

/** 1) Single Ticker Snapshot (last trade/quote + day & prev-day aggs) */
export type StockSnapshot = {
  ticker?: {
    lastTrade?: { p?: number }; // price
    lastQuote?: { bp?: number; ap?: number }; // bid/ask
    day?: { o?: number; h?: number; l?: number; c?: number; v?: number };
    prevDay?: { o?: number; h?: number; l?: number; c?: number; v?: number };
  };
};

export async function getStockSnapshot(ticker: string): Promise<StockSnapshot> {
  return jget<StockSnapshot>(`/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`);
}

/** 2) Daily aggs for ~1y to compute indicators & 52w levels */
export async function getStockAggs(ticker: string, days = 260) {
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 3600 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const json = await jget<{
    results?: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  }>(
    `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${fmt(from)}/${fmt(to)}?adjusted=true&sort=asc&limit=50000`
  );
  return (json.results ?? []).map(r => ({
    t: new Date(r.t), o: r.o, h: r.h, l: r.l, c: r.c, v: r.v
  }));
}
// async function jget<T>(path: string) {
//   const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}apiKey=${KEY}`;
//   const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
//   if (!r.ok) throw new Error(`Polygon error ${r.status} for ${path}`);
//   return (await r.json()) as T;
// }

// /** ---- Stocks: Aggregates (daily OHLC) ---- */
// export async function getStockAggs(ticker: string, days = 120) {
//   const to = new Date();
//   const from = new Date(Date.now() - days * 24 * 3600 * 1000);
//   const fmt = (d: Date) => d.toISOString().slice(0, 10);

//   const json = await jget<{
//     results?: { t: number; o: number; h: number; l: number; c: number; v: number }[];
//   }>(
//     `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${fmt(from)}/${fmt(to)}?adjusted=true&sort=asc&limit=50000`
//   );

//   return (json.results ?? []).map(r => ({
//     t: new Date(r.t),
//     o: r.o,
//     h: r.h,
//     l: r.l,
//     c: r.c,
//     v: r.v,
//   }));
// }

// /** ---- Stocks: Last NBBO mid (plan-dependent; may be undefined) ---- */
// export async function getLastNbboMid(ticker: string) {
//   try {
//     const json = await jget<{ results?: { bid?: { p?: number }; ask?: { p?: number } } }>(
//       `/v2/last/nbbo/${encodeURIComponent(ticker)}`
//     );
//     const bid = json.results?.bid?.p;
//     const ask = json.results?.ask?.p;
//     return bid && ask ? (bid + ask) / 2 : undefined;
//   } catch {
//     return undefined; // free/low tiers may not have NBBO
//   }
// }

// /** ---- Options: Chain Snapshot ---- */
// export type ChainContract = {
//   ticker: string;
//   last_quote?: { ask?: number; bid?: number; mid?: number };
//   greeks?: { delta?: number; gamma?: number; theta?: number; vega?: number };
//   implied_volatility?: number;
//   open_interest?: number;
//   details?: { strike_price?: number; expiration_date?: string; contract_type?: string };
// };

// export async function getOptionsChainSnapshot(underlying: string) {
//   const json = await jget<{ results?: ChainContract[] }>(
//     `/v3/snapshot/options/${encodeURIComponent(underlying)}`
//   );

//   for (const c of json.results ?? []) {
//     if (c.last_quote && c.last_quote.ask && c.last_quote.bid && !c.last_quote.mid) {
//       c.last_quote.mid = (c.last_quote.ask + c.last_quote.bid) / 2;
//     }
//   }

//   return json.results ?? [];
// }