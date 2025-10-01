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

// ---------- Options (Polygon) ----------
export type OptionCandidate = {
  contract: string;              // e.g. "O:AMZN261218C00225000"
  expiry: string;                // "YYYY-MM-DD"
  strike: number;
  right: "C" | "P";              // call/put
  bid?: number | null;           // NBBO bid (may be undefined/null)
  ask?: number | null;           // NBBO ask
  mid?: number | null;           // optional convenience ((bid+ask)/2)
  oi?: number | null;            // open interest
  volume?: number | null;        // today’s volume
  delta?: number | null;         // if your plan exposes greeks
  iv?: number | null;            // if exposed; else null (we’ll fall back)
};

type ChainSnapshotResult = {
  results?: Array<{
    details?: {
      ticker?: string;                 // contract symbol, e.g., O:AMZN261218C00225000
      expiration_date?: string;        // YYYY-MM-DD
      contract_type?: "call" | "put";
      strike_price?: number;
    };
    last_quote?: {
      bid?: number;
      ask?: number;
      midpoint?: number;
    };
    last_trade?: {
      price?: number;
    };
    open_interest?: number;
    greeks?: {
      delta?: number;
    };
    day?: { volume?: number };
  }>;
  next_url?: string;
};

function appendKey(url: string) {
  return url + (url.includes("?") ? "&" : "?") + "apiKey=" + KEY;
}

/**
 * Fetch a page (with apiKey) and return parsed JSON.
 */
async function jgetFull<T>(url: string): Promise<T> {
  const u = appendKey(url);
  const r = await fetch(u, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new HttpError(r.status, `Polygon ${r.status} for ${url}`);
  return (await r.json()) as T;
}

/**
 * Returns a thin, filtered universe of LEAP candidates for a given underlying + expiry.
 * Uses the Option Chain Snapshot endpoint with filters.
 *
 * Docs: GET /v3/snapshot/options/{underlyingAsset}
 * Query params: expiration_date=YYYY-MM-DD, contract_type=call|put, limit=250, with pagination via next_url.
 */
export async function getLeapOptionCandidates(
  ticker: string,
  expiryIso: string,
  side: "call" | "put"
): Promise<OptionCandidate[]> {
  const right: "C" | "P" = side === "call" ? "C" : "P";

  const ref = await jget<{
    results?: Array<{
      ticker?: string;
      expiration_date?: string;
      strike_price?: number;
      contract_type?: "call" | "put";
    }>;
  }>(
    `/v3/reference/options/contracts?underlying_ticker=${encodeURIComponent(ticker)}` +
    `&expiration_date=${expiryIso}&contract_type=${side}&active=true&limit=1000&order=asc`
  );

  const rows = (ref.results ?? []).filter(r => r.contract_type === side);

  const out: OptionCandidate[] = rows
    .map(r => ({
      contract: r.ticker ?? "",
      expiry: r.expiration_date ?? expiryIso,
      strike: r.strike_price ?? NaN,
      right,                           // <-- stays "C" | "P"
      bid: null,
      ask: null,
      mid: null,
      oi: null,
      volume: null,
      delta: null,
      iv: null,
    } satisfies OptionCandidate))       // <-- ensures literal types are preserved
    .filter(c => c.contract && isFinite(c.strike));

  return out;
}
// List distinct future expiries for a ticker (soonest → latest)
export async function getOptionExpiries(ticker: string): Promise<string[]> {
  // Polygon v3 reference contracts; filter active, non-expired
  const path =
    `/v3/reference/options/contracts?underlying_ticker=${encodeURIComponent(ticker)}` +
    `&active=true&expired=false&limit=1000&order=asc`;
  const data = await jget<{ results?: Array<{ expiration_date?: string }> }>(path);
  const set = new Set<string>();
  for (const r of data.results ?? []) {
    const e = r.expiration_date;
    if (e) set.add(e);
  }
  // Return sorted ascending (YYYY-MM-DD)
  return Array.from(set).sort();
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