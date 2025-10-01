// src/app/api/leap-signal-v2/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
import {
  getStockSnapshot,
  getStockAggs,
  getLeapOptionCandidates,
  OptionCandidate,
} from "@/lib/market-polygon";
import { sma, rsi, round2 } from "@/lib/ta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- input ----
const inSchema = z.object({
  ticker: z.string().regex(/^[A-Z.\-]{1,10}$/i).transform((s) => s.toUpperCase()),
});

// ---- model prompt ----
const SYSTEM = `You are “JP Signals — LEAP V2 (Options Auto-Fill)”.
Choose CALL when long-term bias is bullish; choose PUT when bearish. Use only numbers provided.
If a premium is marked as "theoretical", state that clearly in the note (do not present as a quote). Round prices to 2 decimals.`.trim();

const LEAPS_V2_FORMAT = String.raw`
{{TICKER}} Quant Signals LEAP V2 {{DATE}}
{{TICKER}} LEAP Analysis Summary ({{DATE}})

### Summary (Model)
- Long-term bias: {{long_term_bias}}
- Underlying context: {{context_line}}
- Liquidity: OI {{chosen_oi}}; spreads {{spread_comment}}.

### Clear conclusion
Overall stance: {{BULLISH|BEARISH|NEUTRAL}}; chosen side: {{CALL|PUT}}.

### Recommended trade (single-leg option)
- Instrument: {{TICKER}}
- Strategy: Buy LEAP {{CALL|PUT}}
- Expiry: {{expiry}}
- Strike: $\{\{strike\}\}
- Entry premium: $\{\{entry_premium\}\} ({{premium_source}})  // "nbbo" or "theoretical"
- Entry timing: {{entry_timing}}
- Position size: {{size_contracts}} contract(s)
- Stop-loss (premium): $\{\{stop_premium\}\}
- Profit target (premium): $\{\{tp_premium\}\}
- Confidence: {{confidence_decimal}}

### Why this strike
{{why_strike}}

### Key risks
{{key_risks}}

### Actionable execution notes
{{execution_notes}}

### TRADE_DETAILS (JSON)
\`\`\`json
{
  "instrument": "{{TICKER}}",
  "direction": "{{call|put}}",
  "strike": {{strike}},
  "expiry": "{{expiry}}",
  "confidence": {{confidence_decimal}},
  "profit_target": {{tp_premium}},
  "stop_loss": {{stop_premium}},
  "size": {{size_contracts}},
  "entry_price": {{entry_premium}},
  "entry_price_source": "{{premium_source}}",
  "entry_timing": "{{entry_timing}}",
  "signal_publish_time": "{{YYYY-MM-DD HH:MM:SS}}"
}
\`\`\`
`;

// ---- helpers: time / timeout ----
function nowNy() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const s = fmt.format(new Date());
  const [mdy, hms] = s.split(", ");
  const [m, d, y] = mdy.split("/");
  return { date: `${y}-${m}-${d}`, ts: `${y}-${m}-${d} ${hms}` };
}
function withTimeout<T>(p: Promise<T>, ms = 12000, label = "op"): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); },
           e => { clearTimeout(t); reject(e); });
  });
}
function thirdFriday(y: number, mIdx: number) {
  const d = new Date(Date.UTC(y, mIdx, 1));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + 14);
  return d;
}
function defaultLeapExpiryIso() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const decThis = thirdFriday(y, 11);
  const msLeft = +decThis - +now;
  const target = msLeft < 1000 * 60 * 60 * 24 * 270 ? thirdFriday(y + 1, 11) : decThis;
  return target.toISOString().slice(0, 10);
}

// ---- math: Black–Scholes (theoretical fallback) ----
// ===== math & time helpers (replace your old versions) =====
const RISK_FREE = Number(process.env.RISK_FREE_RATE ?? "0.04");    // 4% default
const DIV_YIELD = Number(process.env.DIVIDEND_YIELD ?? "0.003");   // 0.3% default

function stdNormCdf(x: number) {
  const k = 1 / (1 + 0.2316419 * Math.abs(x));
  const a1 = 0.319381530, a2 = -0.356563782, a3 = 1.781477937, a4 = -1.821255978, a5 = 1.330274429;
  const poly = ((((a5 * k + a4) * k + a3) * k + a2) * k + a1) * k;
  const phi = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
  return x >= 0 ? phi : 1 - phi;
}

// business days between now (ET) and expiry; convert to year fraction with 252 trading days
function businessDayYearFrac(expiryIso: string): number {
  const start = new Date(); // server time is fine; we only need weekday counting
  const end = new Date(expiryIso + "T20:00:00Z");
  if (end <= start) return 1e-6;
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUTC = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  let bdays = 0;
  while (d <= endUTC) {
    const wd = d.getUTCDay();          // 0..6
    if (wd !== 0 && wd !== 6) bdays++; // Mon–Fri
    d.setUTCDate(d.getUTCDate() + 1);
    // guard for extremely long loops
    if (bdays > 2000) break;
  }
  return Math.max(1e-6, bdays / 252);
}

// Merton (dividend-yield) Black–Scholes
function blackScholesMerton(side: "C" | "P", S: number, K: number, T: number, r: number, q: number, sigma: number): number | null {
  if (!(S > 0 && K > 0 && T > 0 && sigma > 0 && Number.isFinite(r) && Number.isFinite(q))) return null;
  const sqrtT = Math.sqrt(T);
  const mu = r - q;
  const d1 = (Math.log(S / K) + (mu + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  if (side === "C") {
    return S * Math.exp(-q * T) * stdNormCdf(d1) - K * Math.exp(-r * T) * stdNormCdf(d2);
  } else {
    return K * Math.exp(-r * T) * stdNormCdf(-d2) - S * Math.exp(-q * T) * stdNormCdf(-d1);
  }
}

// realized vol (log returns), annualized; blend 20D/60D (smoother) with caps
function realizedVolAnnual(closes: number[], window: number): number | null {
  if (closes.length < window + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - window + 1; i < closes.length; i++) {
    const r = Math.log(closes[i] / closes[i - 1]);
    if (Number.isFinite(r)) rets.push(r);
  }
  if (!rets.length) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, rets.length - 1);
  const dailyVol = Math.sqrt(Math.max(0, varr));
  return dailyVol * Math.sqrt(252);
}

// simple skew adjuster: ITM gets a slight IV haircut
function skewAdjustIV(baseSigma: number, S: number, K: number, side: "C" | "P"): number {
  const moneyness = S / K; // >1 ITM for calls, <1 ITM for puts
  let adj = baseSigma;
  if (side === "C" && moneyness > 1) {
    const depth = Math.min(0.3, moneyness - 1); // cap depth at 30%
    adj *= 1 - 0.15 * depth;                    // up to ~4.5% cut at 30% ITM
  } else if (side === "P" && moneyness < 1) {
    const depth = Math.min(0.3, 1 - moneyness);
    adj *= 1 - 0.15 * depth;
  }
  return Math.max(0.05, Math.min(1.0, adj));    // keep sane bounds
}

// IV estimator: blend 20D/60D, then clamp; allow small uplift vs realized
function estimateIVFromUnderlying(closes: number[]): number {
  const v20 = realizedVolAnnual(closes, 20);
  const v60 = realizedVolAnnual(closes, 60);
  const base = (v20 != null && v60 != null) ? (0.6 * v20 + 0.4 * v60)
             : (v20 ?? v60 ?? 0.25);
  // modest IV>RV premium
  const prem = base * 1.08;
  // clamp to typical equity range
  return Math.max(0.12, Math.min(0.55, prem));
}

// ===== pricing with source (replace your old premiumWithSource) =====
function premiumWithSource(
  c: OptionCandidate | null,
  S: number,
  expiryIso: string,
  closes: number[]
): { price: number | null; source: "nbbo" | "theoretical" | null } {
  if (!c) return { price: null, source: null };

  // 1) If you ever get NBBO on your plan, prefer it
  const ask = c.ask != null && isFinite(c.ask) && c.ask > 0 ? c.ask : null;
  const bid = c.bid != null && isFinite(c.bid) && c.bid > 0 ? c.bid : null;
  const mid = (ask != null && bid != null) ? (ask + bid) / 2 : null;
  const nbbo = ask ?? (mid != null && mid > 0 ? mid : null);
  if (nbbo != null) return { price: round2(nbbo), source: "nbbo" };

  // 2) Theoretical (Merton) with business-day T, dividend yield q, skew-adjusted IV
  const T = businessDayYearFrac(expiryIso);
  // prefer per-contract IV if you later add it to OptionCandidate; else estimate
  const sigma0 = estimateIVFromUnderlying(closes);
  const sigma = skewAdjustIV(sigma0, S, c.strike, c.right);
  const theo = blackScholesMerton(c.right, S, c.strike, T, RISK_FREE, DIV_YIELD, sigma);
  return theo != null && isFinite(theo) ? { price: round2(theo), source: "theoretical" } : { price: null, source: null };
}

// Safe spread (%) if both bid/ask exist and are > 0; else null
function spreadPctSafe(c: OptionCandidate): number | null {
  const bid = c.bid ?? null;
  const ask = c.ask ?? null;
  if (bid == null || ask == null || !isFinite(bid) || !isFinite(ask) || bid <= 0 || ask <= 0) return null;
  const mid = (bid + ask) / 2;
  if (mid <= 0) return null;
  return ((ask - bid) / mid) * 100;
}

// Numeric penalty for ranking (lower is better); works without NBBO
function spreadPenalty(c: OptionCandidate): number {
  const pct = spreadPctSafe(c);
  if (pct == null) return 8;            // missing NBBO → moderate penalty, not fatal
  return Math.min(10, pct / 10);        // e.g., 2% → 0.2, 10% → 1, 100% → 10
}

// Human-readable label for the note
function spreadComment(c: OptionCandidate): "tight" | "moderate" | "wide" | "unknown" {
  const pct = spreadPctSafe(c);
  if (pct == null) return "unknown";
  if (pct <= 2) return "tight";
  if (pct <= 5) return "moderate";
  return "wide";
}

// ---- tolerant picker (delta targeted; doesn’t require a price to exist) ----
function pickBestBySide(
  side: "call" | "put",
  ltp: number,
  candidates: OptionCandidate[]
): OptionCandidate | null {
  const right: "C" | "P" = side === "call" ? "C" : "P";
  const pool = candidates.filter(c => c.right === right);
  if (!pool.length) return null;

  const score = (c: OptionCandidate, pivot: number | null) => {
    const hasAsk = c.ask != null && isFinite(c.ask) && (c.ask as number) > 0;
    const spreadScore = spreadPenalty(c);
    const oiScore = -(c.oi ?? 0) / 5000;
    const askBonus = hasAsk ? -0.25 : 0;

    if (pivot != null && c.delta != null && isFinite(c.delta)) {
      const deltaScore = Math.abs((c.delta as number) - pivot);
      return deltaScore + askBonus + spreadScore + oiScore;
    }
    // fallback: slight ITM bias + liquidity/spread
    const bias = side === "call" ? -0.02 : +0.02;
    const target = ltp * (1 + bias);
    const strikeScore = Math.abs(c.strike - target) / Math.max(1, ltp);
    return strikeScore + askBonus + spreadScore + oiScore;
  };

  // strict delta band
  const strict = pool.filter(c =>
    c.delta != null && isFinite(c.delta) &&
    (side === "call"
      ? (c.delta as number) >= 0.6 && (c.delta as number) <= 0.8
      : (c.delta as number) <= -0.6 && (c.delta as number) >= -0.8)
  );
  if (strict.length) {
    const pivot = side === "call" ? 0.7 : -0.7;
    return strict.map(c => ({ c, s: score(c, pivot) })).sort((a,b)=>a.s-b.s)[0].c;
  }
  // relaxed delta band
  const relaxed = pool.filter(c =>
    c.delta != null && isFinite(c.delta) &&
    (side === "call"
      ? (c.delta as number) >= 0.5 && (c.delta as number) <= 0.9
      : (c.delta as number) <= -0.5 && (c.delta as number) >= -0.9)
  );
  if (relaxed.length) {
    const pivot = side === "call" ? 0.7 : -0.7;
    return relaxed.map(c => ({ c, s: score(c, pivot) })).sort((a,b)=>a.s-b.s)[0].c;
  }
  // no greeks → pick by strike proximity + liquidity
  return pool.map(c => ({ c, s: score(c, null) })).sort((a,b)=>a.s-b.s)[0].c;
}

// ---- handler ----
const DEBUG = process.env.NODE_ENV !== "production";
const insuff = (why: string) =>
  new NextResponse(DEBUG ? `INSUFFICIENT_DATA:${why}` : "INSUFFICIENT_DATA", {
    status: 200,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });

export async function POST(req: NextRequest) {
  try {
    // auth + pro
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isProByEmail(email))) return NextResponse.json({ error: "Subscription required" }, { status: 403 });

    // input
    const body = await req.json().catch(() => ({}));
    const parsed = inSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Bad input" }, { status: 400 });
    const ticker = parsed.data.ticker;

    // underlying snapshot → LTP
    const snap = await withTimeout(getStockSnapshot(ticker), 8000, "snapshot").catch(() => null);
    const day = snap?.ticker?.day, prev = snap?.ticker?.prevDay;
    const lastTrade = snap?.ticker?.lastTrade?.p;
    const qBid = snap?.ticker?.lastQuote?.bp, qAsk = snap?.ticker?.lastQuote?.ap;
    const nbboMid = qBid && qAsk ? (qBid + qAsk) / 2 : undefined;
    const ltp = nbboMid ?? lastTrade ?? day?.c ?? prev?.c ?? day?.o;
    if (!ltp || !day || !prev) return insuff("snapshot missing ltp/day/prev");

    // 1y bars for bias + realized vol (IV fallback)
    const bars = await withTimeout(getStockAggs(ticker, 260), 10000, "aggs").catch(() => []);
    if (!bars.length) return insuff("no_1y_bars");
    const closes = bars.map(b => b.c);

    const ma50 = sma(closes, 50);
    const ma200 = sma(closes, 200);
    const rsi14 = rsi(closes, 14);
    let biasScore = 0;
    if (ma50 != null && ltp > ma50) biasScore++; else biasScore--;
    if (ma200 != null && ltp > ma200) biasScore++; else biasScore--;
    if (rsi14 != null && rsi14 > 50) biasScore++; else if (rsi14 != null && rsi14 < 50) biasScore--;
    const longTermBias: "bullish" | "bearish" | "neutral" =
      biasScore >= 1 ? "bullish" : biasScore <= -1 ? "bearish" : "neutral";

    // target expiry (Dec) – Starter may not have quotes; we still proceed
    const expiry = defaultLeapExpiryIso();

    // fetch chains
    const calls = await withTimeout(getLeapOptionCandidates(ticker, expiry, "call"), 12000, "calls").catch(() => [] as OptionCandidate[]);
    const puts  = await withTimeout(getLeapOptionCandidates(ticker, expiry, "put"),  12000, "puts").catch(() => [] as OptionCandidate[]);
    if (!calls.length && !puts.length) return insuff("options_unavailable");

    // pick side (we don't require quotes here—can fall back to theoretical)
    const bestCall = pickBestBySide("call", ltp, calls);
    const bestPut  = pickBestBySide("put",  ltp, puts);
    if (!bestCall && !bestPut) return insuff("no_candidates_after_pick");

    // premiums (NBBO if present, else theoretical BS)
    const callP = premiumWithSource(bestCall, ltp, expiry, closes);
    const putP  = premiumWithSource(bestPut,  ltp, expiry, closes);

    // if both lack any price (edge), bail
    if ((!callP.price && !putP.price)) return insuff("options_unpriced_all_sources");

    // choose based on bias: prefer call for bullish, put for bearish; if missing, fallback to the other
    const chosen =
      longTermBias === "bearish"
        ? (putP.price ? { side: "put" as const, c: bestPut!, p: putP } : { side: "call" as const, c: bestCall!, p: callP })
        : /* bullish or neutral default to call */ (callP.price ? { side: "call" as const, c: bestCall!, p: callP } : { side: "put" as const, c: bestPut!, p: putP });

    const { date, ts } = nowNy();

    const stop = chosen.p.price ? round2(chosen.p.price * 0.625) : null;
    const tp   = chosen.p.price ? round2(chosen.p.price * 2.0)   : null;

    const payload = {
      ticker,
      date, ts,
      expiry,
      ltp: round2(ltp),
      long_term_bias: longTermBias,
      context_line: [
        ma50 != null ? (ltp > ma50 ? "above 50SMA" : "below 50SMA") : null,
        ma200 != null ? (ltp > ma200 ? "above 200SMA" : "below 200SMA") : null,
        rsi14 != null ? `RSI ${round2(rsi14)}` : null,
      ].filter(Boolean).join(", "),
      chosen_side: chosen.side,
      premium_source: chosen.p.source ?? "theoretical",
      size_contracts: 1,
      entry_timing: "open",
      confidence_decimal: (longTermBias === "bullish" || longTermBias === "bearish") ? 0.75 : 0.60,

      // pass both candidates so the model can mention the other side if useful
      call: bestCall ? {
        contract: bestCall.contract, expiry: bestCall.expiry, strike: round2(bestCall.strike), right: "C" as const,
        bid: bestCall.bid ?? null, ask: bestCall.ask ?? null, oi: bestCall.oi ?? null, delta: bestCall.delta ?? null,
        entry_premium: callP.price ?? null,
        premium_source: callP.source,
        stop_premium: callP.price ? round2(callP.price * 0.625) : null,
        tp_premium:   callP.price ? round2(callP.price * 2.0)   : null,
        spread_comment: spreadComment(bestCall),
      } : null,
      put: bestPut ? {
        contract: bestPut.contract, expiry: bestPut.expiry, strike: round2(bestPut.strike), right: "P" as const,
        bid: bestPut.bid ?? null, ask: bestPut.ask ?? null, oi: bestPut.oi ?? null, delta: bestPut.delta ?? null,
        entry_premium: putP.price ?? null,
        premium_source: putP.source,
        stop_premium: putP.price ? round2(putP.price * 0.625) : null,
        tp_premium:   putP.price ? round2(putP.price * 2.0)   : null,
        spread_comment: spreadComment(bestPut),
      } : null,
    };

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const user = `TICKER=${ticker}\nPAYLOAD=${JSON.stringify(payload)}`;

    const resp = await withTimeout(
      client.responses.create({
        model: "gpt-5",
        input: [
          { role: "system", content: SYSTEM + "\n\n" + LEAPS_V2_FORMAT },
          { role: "user", content: user },
        ],
        reasoning: { effort: "medium" },
      }),
      120000,
      "openai:leaps"
    );

    interface RespWithText { output_text?: string }
    const out = (resp as RespWithText).output_text?.trim() || "";
    const looksLike =
      /LEAP Analysis Summary/i.test(out) &&
      /TRADE_DETAILS/i.test(out) &&
      out.length > 200;
    if (!looksLike) return insuff("LLM note failed heuristic");

    const wantedTitle = `${ticker} Quant Signals LEAP V2 ${date}`;
    const normalized = out.replace(/^[^\n]*\n?/, wantedTitle + "\n");

    return new NextResponse(normalized, {
      status: 200,
      headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" },
    });

  } catch (e) {
    console.error("[leap-signal-v2] fatal", e);
    return new NextResponse("INSUFFICIENT_DATA", {
      status: 200,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }
}