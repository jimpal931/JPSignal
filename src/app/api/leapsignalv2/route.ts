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
  getSpecificOptionSnapshot,
  OptionCandidate,
} from "@/lib/market-polygon";
import { sma, rsi, macdSlope, round2 } from "@/lib/ta";
import { llmNewsSentiment } from "@/lib/sentiment";
import { hasLimitRemaining, incrementUsage } from "@/lib/usage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- input ----
const inSchema = z.object({
  ticker: z.string().regex(/^[A-Z.\-]{1,10}$/i).transform((s) => s.toUpperCase()),
});

// ---- model prompt ----
const SYSTEM = `You are “AInsight Signals — LEAP V3 (Pro Execution)”.

Goal: Render a single-page LEAP trading note. Output only the note—no extra commentary, no links, no images.

HARD REQUIREMENTS
- Use America/New_York time. 
- Use ONLY the numbers provided. 
- Tone: Professional, candid, and strict on risk management.
- Strategy: single-leg naked option (LEAP).

CHOOSING THE SIDE
- If bias is BULLISH → prefer CALL.
- If bias is BEARISH → prefer PUT.
- Note the Conviction Rating based on short-term momentum alignment.`.trim();

const LEAPS_V2_FORMAT = String.raw`
OUTPUT FORMAT (must match exactly; no extra lines)

{{TICKER}} AInsight Signals LEAP V3 {{DATE}}
{{TICKER}} LEAP Analysis & Execution Plan ({{DATE}})

### Summary (Model)
- **Long-Term Trend:** {{long_term_bias}} (Price vs 50/200 SMA)
- **Short-Term Momentum:** {{short_term_bias}} (MACD & 20 SMA)
- **Signal Strength:** {{conviction_rating}}
- **Liquidity:** OI {{chosen_oi}}; Spreads: unknown (Starter Plan).

### Clear Conclusion
Overall stance: {{BULLISH|BEARISH|NEUTRAL}}; chosen side: {{CALL|PUT}}. 
{{conviction_rationale}}

### Recommended Trade (LEAP)
- **Instrument:** {{TICKER}}
- **Strategy:** Buy LEAP {{CALL|PUT}}
- **Expiry:** {{expiry}}
- **Strike:** $\{\{strike\}\}
- **Entry Premium:** $\{\{entry_premium\}\} {{entry_price_note}}
- **Position Size:** 1 to 2 contracts max (Adjust per risk tolerance)
- **Hard Stop-Loss:** $\{\{stop_premium\}\} (-15% premium loss)
- **Take Profit Target:** $\{\{tp_premium\}\} (+25% premium gain)

### ⚠️ Critical Trade Management Rules
- **Take Profits Early:** LEAPS are sensitive to volatility crush. Lock in gains at 20% to 30%.
- **Trend Invalidation (DO NOT HOLD):** - If holding CALLS and the stock breaks deeply below the 50 SMA into a confirmed bearish trend, CUT THE LOSS.
  - If holding PUTS and the stock breaks aggressively above the 50 SMA into a confirmed bullish trend, CUT THE LOSS.
  - Do not marry a LEAP if the underlying daily trend reverses against you.

### Why This Strike?
{{why_strike}}

### News Sentiment
- **Summary:** \{\{sentiment_summary\}\}
- **Headlines:** \{\{news_bullets\}\}

### TRADE_DETAILS (JSON)
\`\`\`json
{
  "instrument": "{{TICKER}}",
  "direction": "{{call|put}}",
  "strike": {{strike}},
  "expiry": "{{expiry}}",
  "conviction": "{{conviction_rating}}",
  "profit_target": {{tp_premium}},
  "stop_loss": {{stop_premium}},
  "entry_price": {{entry_premium}},
  "entry_price_source": "{{entry_price_source}}",
  "signal_publish_time": "{{YYYY-MM-DD HH:MM:SS}}",
  "news_sentiment": "{{sentiment_label}}"
}
\`\`\`
`;

// ---- helpers ----
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

function nowPartsNy() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const dowStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dowMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return { mins: hh * 60 + mm, dow: dowMap[dowStr] ?? 1 };
}

function isRegularTradingHoursNy(): boolean {
  const { mins, dow } = nowPartsNy();
  if (dow === 0 || dow === 6) return false; 
  return mins >= 9 * 60 + 30 && mins < 16 * 60; 
}

function withTimeout<T>(p: Promise<T>, ms = 12000, label = "op"): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

function thirdFriday(year: number, monthIdx: number) {
  const d = new Date(Date.UTC(year, monthIdx, 1));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCDate(d.getUTCDate() + 14);
  return d;
}

function defaultLeapExpiryIso() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const decThis = thirdFriday(y, 11);
  const msToDecThis = +decThis - +now;
  let target = decThis;
  if (msToDecThis < 1000 * 60 * 60 * 24 * 270) target = thirdFriday(y + 1, 11);
  return target.toISOString().slice(0, 10);
}

function calculateHV(closes: number[]): number {
  if (closes.length < 21) return 0.35; 
  const returns = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const recent = returns.slice(-20); 
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (recent.length - 1);
  const dailyStdDev = Math.sqrt(variance);
  return dailyStdDev * Math.sqrt(252); 
}

function midOf(c: OptionCandidate): number | null {
  if (c.mid != null && isFinite(c.mid) && c.mid > 0) return c.mid;
  return null;
}

function priceOf(c: OptionCandidate): { price: number; source: "ask" | "mid" } | null {
  const m = midOf(c);
  if (m != null && isFinite(m) && m > 0) return { price: m, source: "mid" };
  return null; 
}

function theoreticalPremium(c: OptionCandidate, ltp: number, hv: number): number {
  const isCall = c.right === "C";
  const intrinsic = Math.max(0, isCall ? ltp - c.strike : c.strike - ltp);
  const T = Math.max(1 / 365, (Date.parse(c.expiry + "T20:00:00Z") - Date.now()) / (365 * 24 * 3600 * 1000));
  const adjustedVol = Math.max(0.20, Math.min(0.80, hv * 1.15)); 
  const tv = 0.25 * ltp * Math.sqrt(T) * adjustedVol;
  const tvCapped = Math.min(tv, Math.max(2, 0.15 * Math.max(ltp, c.strike)));
  return round2(intrinsic + tvCapped);
}

function pickBestBySide(side: "call" | "put", ltp: number, candidates: OptionCandidate[]): OptionCandidate | null {
  const right: "C" | "P" = side === "call" ? "C" : "P";
  const pool = candidates.filter((c) => c.right === right);
  if (!pool.length) return null;

  const score = (c: OptionCandidate, pivotDelta: number | null) => {
    const oiScore = -(c.oi ?? 0) / 5000;
    const hasPrice = (c.mid ?? 0) > 0;
    const priceBonus = hasPrice ? -0.25 : 0;

    if (pivotDelta != null && c.delta != null && isFinite(c.delta)) {
      const deltaScore = Math.abs((c.delta as number) - pivotDelta);
      return deltaScore + priceBonus + oiScore;
    } else {
      const bias = side === "call" ? -0.02 : +0.02;
      const target = ltp * (1 + bias);
      const strikeScore = Math.abs(c.strike - target) / Math.max(1, ltp);
      return strikeScore + priceBonus + oiScore;
    }
  };

  const inBand = pool.filter(c => c.delta != null && isFinite(c.delta) && 
    (side === "call" ? (c.delta as number) >= 0.6 && (c.delta as number) <= 0.8 : (c.delta as number) <= -0.6 && (c.delta as number) >= -0.8)
  );
  if (inBand.length) return inBand.map(c => ({ c, s: score(c, side === "call" ? 0.7 : -0.7) })).sort((a, b) => a.s - b.s)[0].c;

  return pool.map(c => ({ c, s: score(c, null) })).sort((a, b) => a.s - b.s)[0].c;
}

// ---- handler ----
const DEBUG = process.env.NODE_ENV !== "production";
const insuff = (why: string) => new NextResponse(DEBUG ? `INSUFFICIENT_DATA:${why}` : "INSUFFICIENT_DATA", { status: 200, headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isProByEmail(email))) return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const hasAccess = await hasLimitRemaining(user.id, "leap");
    if (!hasAccess) return NextResponse.json({ error: "Monthly LEAP signal limit reached." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const parsed = inSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Bad input" }, { status: 400 });
    const ticker = parsed.data.ticker;

    // 1. Technicals & Aggs (Fetched first to act as fallback for off-hours/holidays)
    const bars = await withTimeout(getStockAggs(ticker, 260), 10000).catch(() => []);
    if (!bars.length) return insuff("no 1y bars");
    const closes = bars.map((b) => b.c);
    const lastHistoricalClose = closes[closes.length - 1];

    // 2. Snapshot & Prices
    const snap = await withTimeout(getStockSnapshot(ticker), 8000).catch(() => null);
    const day = snap?.ticker?.day ?? null;
    const prev = snap?.ticker?.prevDay ?? null;
    const lastTradePrice = snap?.ticker?.lastTrade?.p ?? null;
    
    let ltp = lastTradePrice ?? day?.c ?? prev?.c ?? lastHistoricalClose;

    // If off-hours, weekend, or holiday, pin to the official historical close
    if (!isRegularTradingHoursNy() && lastHistoricalClose) {
      ltp = lastHistoricalClose;
    }

    if (!ltp) return insuff("unable to determine ltp");

    // Calculate True Historical Volatility
    const stockHv = calculateHV(closes);

    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const ma200 = sma(closes, 200);
    const rsi14 = rsi(closes, 14);
    const macdS = macdSlope(closes);

    // LONG-TERM BIAS (The LEAP Core)
    let ltBiasScore = 0;
    if (ma50 != null && ltp > ma50) ltBiasScore++;
    if (ma200 != null && ltp > ma200) ltBiasScore++;
    if (ma50 != null && ltp < ma50) ltBiasScore--;
    if (ma200 != null && ltp < ma200) ltBiasScore--;
    const longTermBias = ltBiasScore >= 1 ? "bullish" : ltBiasScore <= -1 ? "bearish" : "neutral";

    // SHORT-TERM BIAS (The Stock Signal Core)
    let stBiasScore = 0;
    if (ma20 != null && ltp > ma20) stBiasScore++;
    if (macdS != null && macdS > 0) stBiasScore++;
    if (ma20 != null && ltp < ma20) stBiasScore--;
    if (macdS != null && macdS < 0) stBiasScore--;
    const shortTermBias = stBiasScore >= 1 ? "bullish" : stBiasScore <= -1 ? "bearish" : "neutral";

    // CONVICTION LOGIC
    let convictionRating = "MODERATE";
    if (longTermBias === shortTermBias && longTermBias !== "neutral") {
      convictionRating = "HIGH CONVICTION";
    } else if (longTermBias === "neutral") {
      convictionRating = "LOW (Consolidating)";
    }

    const sentiment = await llmNewsSentiment(ticker);
    const newsBullets = sentiment.headlines.slice(0, 5).map((h) => `- ${h.title}`).join("\n") || "- No recent headlines.";

    // 3. Option Candidates
    const targetExpiry = defaultLeapExpiryIso();
    const calls = await withTimeout(getLeapOptionCandidates(ticker, targetExpiry, "call"), 12000).catch(() => []);
    const puts = await withTimeout(getLeapOptionCandidates(ticker, targetExpiry, "put"), 12000).catch(() => []);
    
    const bestCall = pickBestBySide("call", ltp, calls);
    const bestPut = pickBestBySide("put", ltp, puts);

    let chosen: OptionCandidate | null = null;
    let chosenSide: "call" | "put" | null = null;
    if (longTermBias === "bullish") {
      chosen = bestCall ?? bestPut;
      chosenSide = bestCall ? "call" : bestPut ? "put" : null;
    } else if (longTermBias === "bearish") {
      chosen = bestPut ?? bestCall;
      chosenSide = bestPut ? "put" : bestCall ? "call" : null;
    } else {
      chosen = bestCall ?? bestPut;
      chosenSide = bestCall ? "call" : bestPut ? "put" : null;
    }

    if (!chosen || !chosenSide) return insuff("options_unpriced");

    // Sniper Fetch for missing Mid/OI
    if (chosen.mid == null || chosen.oi == null) {
      const freshData = await getSpecificOptionSnapshot(chosen.contract);
      if (freshData) chosen = { ...chosen, ...freshData };
    }

    const quoted = priceOf(chosen);
    
    // Pricing Engine
    let baseEntryPrice = quoted ? round2(quoted.price) : theoreticalPremium(chosen, ltp, stockHv);
    
    // Add 5% Fill Buffer if it's theoretical so the limit order actually triggers
    const entryPrice = quoted ? baseEntryPrice : round2(baseEntryPrice * 1.05);
    const entryPriceSource = quoted ? quoted.source : "theoretical (buffered)";
    // Dynamic text note injection for the LLM template structure
    const entryPriceNote = entryPriceSource === "theoretical (buffered)"
      ? "(Includes +5% fill buffer over theoretical)"
      : "(Real market proxy)";

    if (!entryPrice || !isFinite(entryPrice) || entryPrice <= 0) return insuff("options_unpriced");

    // Smarter Targets (25% Win, 15% Loss)
    const tpPremium = round2(entryPrice * 1.25); 
    const stopPremium = round2(entryPrice * 0.85);

    const { date, ts } = nowNy();

    const payload = {
      ticker, date, ts,
      ltp: round2(ltp),
      long_term_bias: longTermBias,
      short_term_bias: shortTermBias,
      conviction_rating: convictionRating,
      context_line: `LTP: ${round2(ltp)} | 50SMA: ${ma50 ? round2(ma50) : 'N/A'} | MACD Slope: ${macdS ? round2(macdS) : 'N/A'}`,
      chosen_side: chosenSide,
      expiry: chosen.expiry,
      strike: round2(chosen.strike),
      chosen_oi: chosen.oi ?? "N/A",
      entry_premium: entryPrice,
      entry_price_source: entryPriceSource,
      entry_price_note: entryPriceNote,
      stop_premium: stopPremium,
      tp_premium: tpPremium,
      sentiment_label: sentiment.label,
      sentiment_summary: sentiment.summary,
      news_bullets: newsBullets,
    };

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const userPrompt = `TICKER=${ticker}\nPAYLOAD=${JSON.stringify(payload)}`;

    const resp = await withTimeout(
      client.responses.create({
        model: "gpt-5.4", 
        input: [
          { role: "system", content: SYSTEM + "\n\n" + LEAPS_V2_FORMAT },
          { role: "user", content: userPrompt },
        ],
        reasoning: { effort: "medium" },
      }),
      120000,
      "openai:leaps"
    );

    interface RespWithText { output_text?: string; }
    const out = (resp as RespWithText).output_text?.trim() || "";
    const looksLike = /LEAP Analysis/i.test(out) && /TRADE_DETAILS/i.test(out);
    if (!looksLike) return insuff("LLM note failed heuristic");

    const wantedTitle = `${ticker} AInsight Signals LEAP V3 ${date}`;
    const normalized = out.replace(/^[^\n]*\n?/, wantedTitle + "\n");

    await incrementUsage(user.id, "leap");

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