// src/lib/market-polygon.ts
const KEY = process.env.POLYGON_API_KEY!;
const BASE = "https://api.polygon.io";

export class HttpError extends Error {
  constructor(public status: number, public message: string) {
    super(message);
  }
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

/** 1) Single Ticker Snapshot */
export type StockSnapshot = {
  ticker?: {
    lastTrade?: { p?: number };
    lastQuote?: { bp?: number; ap?: number };
    day?: { o?: number; h?: number; l?: number; c?: number; v?: number };
    prevDay?: { o?: number; h?: number; l?: number; c?: number; v?: number };
  };
};

export async function getStockSnapshot(ticker: string): Promise<StockSnapshot> {
  return jget<StockSnapshot>(`/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`);
}

/** 2) Daily Aggs */
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
  contract: string;
  expiry: string;
  strike: number;
  right: "C" | "P";
  bid?: number | null;
  ask?: number | null;
  mid?: number | null;
  oi?: number | null;
  volume?: number | null;
  delta?: number | null;
  iv?: number | null;
};

// Snapshot Item Shape
type SnapshotItem = {
  ticker: string;
  day?: { v?: number };
  last_quote?: { a?: number; b?: number };
  open_interest?: number;
  greeks?: { delta?: number; theta?: number; gamma?: number; vega?: number };
  implied_volatility?: number;
};

type UniversalSnapshot = {
  results?: SnapshotItem[];
};

export async function getLeapOptionCandidates(
  ticker: string,
  expiryIso: string,
  side: "call" | "put"
): Promise<OptionCandidate[]> {
  const right: "C" | "P" = side === "call" ? "C" : "P";

  // 1. Get Contract List (Reference)
  const ref = await jget<{
    results?: Array<{
      ticker: string;
      expiration_date: string;
      strike_price: number;
      contract_type: "call" | "put";
    }>;
  }>(
    `/v3/reference/options/contracts?underlying_ticker=${encodeURIComponent(ticker)}` +
    `&expiration_date=${expiryIso}&contract_type=${side}&active=true&limit=100&order=asc`
  );

  const rawContracts = ref.results ?? [];
  if (rawContracts.length === 0) return [];

  // 2. Try Bulk Snapshot (might be empty/partial)
  let snapMap = new Map<string, SnapshotItem>();
  try {
    const snapshot = await jget<UniversalSnapshot>(
      `/v3/snapshot/options/${encodeURIComponent(ticker)}` + 
      `?expiration_date=${expiryIso}&contract_type=${side}&limit=250`
    );
    (snapshot.results ?? []).forEach(s => snapMap.set(s.ticker, s));
  } catch (e) {
    // Ignore bulk fetch error, we will return partials and fill gaps later if needed
    console.warn("Bulk snapshot failed, falling back to basic contract list", e);
  }

  // 3. Merge
  return rawContracts
    .map(r => {
      const snap = snapMap.get(r.ticker);
      const bid = snap?.last_quote?.b ?? null;
      const ask = snap?.last_quote?.a ?? null;
      // Ensure strict number check
      const mid = (typeof bid === 'number' && typeof ask === 'number') 
        ? (bid + ask) / 2 
        : null;
      
      return {
        contract: r.ticker,
        expiry: r.expiration_date,
        strike: r.strike_price,
        right,
        bid,
        ask,
        mid,
        oi: snap?.open_interest ?? null,
        volume: snap?.day?.v ?? null,
        delta: snap?.greeks?.delta ?? null,
        iv: snap?.implied_volatility ?? null,
      } satisfies OptionCandidate;
    })
    .filter(c => c.contract && isFinite(c.strike));
}

export async function getOptionExpiries(ticker: string): Promise<string[]> {
  const path =
    `/v3/reference/options/contracts?underlying_ticker=${encodeURIComponent(ticker)}` +
    `&active=true&expired=false&limit=1000&order=asc`;
  const data = await jget<{ results?: Array<{ expiration_date?: string }> }>(path);
  const set = new Set<string>();
  for (const r of data.results ?? []) {
    if (r.expiration_date) set.add(r.expiration_date);
  }
  return Array.from(set).sort();
}

/**
 * NEW: Fetch a single contract's snapshot to fill in gaps.
 * This is more reliable than bulk snapshots for specific tickers.
 */
export async function getSpecificOptionSnapshot(contractTicker: string): Promise<Partial<OptionCandidate> | null> {
  try {
    // Note: The endpoint is /v3/snapshot/options/{underlying}/{contract}
    // We need to parse underlying from contract (e.g. O:GOOGL...) or just pass the contract if API supports it.
    // Actually, Polygon V3 Universal Snapshot supports passing just the option ticker in the path for "Option Contract" endpoint
    // Endpoint: /v3/snapshot/options/{underlyingAsset}/{optionContract}
    
    // Extract underlying from ticker string (e.g. "O:GOOGL26..." -> "GOOGL")
    // Or simpler: Assuming 'underlying' is known by the caller, but here we can try to guess or use the universal lookup.
    
    // We will use the direct contract snapshot URL if possible.
    // For universal snapshot, passing the contract ticker as the 2nd param works.
    // Parse underlying:
    const match = contractTicker.match(/O:([A-Z]+)\d{6}[CP]/);
    if (!match) return null;
    const underlying = match[1];

    const url = `/v3/snapshot/options/${underlying}/${contractTicker}`;
    const res = await jget<{ results?: SnapshotItem }>(url);
    const snap = res.results;

    if (!snap) return null;

    const bid = snap.last_quote?.b ?? null;
    const ask = snap.last_quote?.a ?? null;
    const mid = (typeof bid === 'number' && typeof ask === 'number') ? (bid + ask) / 2 : null;

    return {
      bid,
      ask,
      mid,
      oi: snap.open_interest ?? null,
      volume: snap.day?.v ?? null,
      delta: snap.greeks?.delta ?? null,
      iv: snap.implied_volatility ?? null,
    };
  } catch (e) {
    console.error(`Single snapshot failed for ${contractTicker}`, e);
    return null;
  }
}