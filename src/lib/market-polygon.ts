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

/** 1) Stock Snapshot */
export type StockSnapshot = {
  ticker?: {
    lastTrade?: { p?: number };
    day?: { o?: number; h?: number; l?: number; c?: number; v?: number };
    prevDay?: { o?: number; h?: number; l?: number; c?: number; v?: number };
  };
};

export async function getStockSnapshot(ticker: string): Promise<StockSnapshot> {
  return jget<StockSnapshot>(`/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}`);
}

/** 2) Stock Aggs */
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

// ---------- Options ----------
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

// FIX: Updated Type Definition for Starter Plan
type SnapshotItem = {
  ticker: string;
  day?: { v?: number };
  // Starter plan often omits last_quote entirely, so we rely on last_trade
  last_trade?: { p?: number; s?: number; t?: number }; 
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

  // 1. Get Contract List
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

  // 2. Get Snapshot (Delayed)
  let snapMap = new Map<string, SnapshotItem>();
  try {
    const snapshot = await jget<UniversalSnapshot>(
      `/v3/snapshot/options/${encodeURIComponent(ticker)}` + 
      `?expiration_date=${expiryIso}&contract_type=${side}&limit=250`
    );
    (snapshot.results ?? []).forEach(s => snapMap.set(s.ticker, s));
  } catch (e) {
    console.warn("Bulk snapshot failed", e);
  }

  // 3. Merge
  return rawContracts
    .map(r => {
      const snap = snapMap.get(r.ticker);
      
      // STARTER PLAN FIX: 
      // We ignore Bid/Ask because the plan doesn't provide them.
      // We strictly use Last Trade Price (p) as the "mid" proxy.
      const tradePrice = snap?.last_trade?.p ?? null;
      
      return {
        contract: r.ticker,
        expiry: r.expiration_date,
        strike: r.strike_price,
        right,
        bid: null,       // Not available on Starter
        ask: null,       // Not available on Starter
        mid: tradePrice, // Use Last Trade as the "Price"
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
 * Sniper Fetch for specific contract (Starter Plan Version)
 */
export async function getSpecificOptionSnapshot(contractTicker: string): Promise<Partial<OptionCandidate> | null> {
  try {
    const match = contractTicker.match(/O:([A-Z]+)\d{6}[CP]/);
    if (!match) return null;
    const underlying = match[1];

    const url = `/v3/snapshot/options/${underlying}/${contractTicker}`;
    const res = await jget<{ results?: SnapshotItem }>(url);
    const snap = res.results;

    if (!snap) return null;

    // STARTER PLAN FIX: Use Last Trade
    const tradePrice = snap.last_trade?.p ?? null;

    return {
      bid: null,
      ask: null,
      mid: tradePrice,
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

export type FinancialResponse = {
  results?: Array<{
    start_date: string;
    end_date: string;
    timeframe: string;
    financials: {
      income_statement?: {
        revenues?: { value: number };
        net_income_loss?: { value: number };
        operating_expenses?: { value: number };
      };
      balance_sheet?: {
        assets?: { value: number };
        liabilities?: { value: number };
        equity?: { value: number };
      };
      cash_flow_statement?: {
        net_cash_flow_from_operating_activities?: { value: number };
      };
    };
  }>;
};

/** Fetch Last 4 Quarters of Raw Financials for Layer 3 Analysis */
export async function getStockFinancials(ticker: string): Promise<FinancialResponse> {
  // Pulling quarterly filings, limited to the 4 most recent records
  return jget<FinancialResponse>(
    `/vX/reference/financials?ticker=${encodeURIComponent(ticker)}&timeframe=quarterly&limit=4&sort=filing_date`
  );
}