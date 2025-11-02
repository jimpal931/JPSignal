// src/lib/news-polygon.ts
const KEY = process.env.POLYGON_API_KEY!;
const BASE = "https://api.polygon.io";

export type TickerNewsItem = {
  id?: string;
  title?: string;
  description?: string;
  published_utc?: string;
  tickers?: string[];
  amp_url?: string | null;
  article_url?: string | null;
  source?: string | null;
};

class HttpError extends Error {
  constructor(public status: number, msg: string) { super(msg); }
}

function q(url: string) {
  return url + (url.includes("?") ? "&" : "?") + "apiKey=" + KEY;
}

async function jget<T>(path: string): Promise<T> {
  const url = q(BASE + path);
  const r = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
  if (!r.ok) throw new HttpError(r.status, `Polygon ${r.status} for ${path}`);
  return r.json() as Promise<T>;
}

/** Recent news for a ticker. Polygon returns a mix of sources. */
export async function getTickerNews(ticker: string, days = 3, limit = 20): Promise<TickerNewsItem[]> {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
  const path = `/v2/reference/news?ticker=${encodeURIComponent(ticker)}&published_utc.gte=${encodeURIComponent(from)}&limit=${limit}&order=desc`;
  const json = await jget<{ results?: TickerNewsItem[] }>(path);
  return (json.results ?? []).filter(n => (n.title || n.description));
}