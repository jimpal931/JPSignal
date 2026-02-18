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
import { sma, rsi, round2 } from "@/lib/ta";
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
const SYSTEM = `You are “AInsight Signals — LEAP V2 (Options Auto-Fill)”.

Goal: Given a ticker and TWO precomputed LEAP candidates (one CALL, one PUT) plus underlying context, produce a single-page LEAP trading note. You must CHOOSE either the CALL or the PUT and fill out one final trade. Output only the note—no extra commentary, no links, no images.

HARD REQUIREMENTS
- Use America/New_York time. Stamp the note with today’s date and the current local timestamp.
- Use ONLY the numbers provided. Do NOT invent prices, greeks, OI, or dates.
- Round prices to 2 decimals; probabilities as percents.
- Strategy: single-leg naked option (LEAP).
- If a candidate premium is missing or <= 0, treat that candidate as unavailable.

CHOOSING THE SIDE
- If long-term bias is BULLISH → prefer the CALL candidate.
- If long-term bias is BEARISH → prefer the PUT candidate.
- If NEUTRAL or both available, choose the one with better liquidity (higher OI, tighter spread) and viable premium.

If numbers are missing, the calling code will return “INSUFFICIENT_DATA”.`.trim();

const LEAPS_V2_FORMAT = String.raw`
OUTPUT FORMAT (must match exactly; no extra lines)

{{TICKER}} AInsight Signals LEAP V3 {{DATE}}
{{TICKER}} LEAP Analysis Summary ({{DATE}})

### Summary (Model)
- Long-term bias: {{long_term_bias}}  // "bullish" | "bearish" | "neutral"
- Underlying context: {{context_line}}  // e.g., "Price above 50/200SMA, RSI>50"
- Liquidity: OI {{chosen_oi}}; spreads {{spread_comment}}.

### Clear conclusion
Overall stance: {{BULLISH|BEARISH|NEUTRAL}}; chosen side: {{CALL|PUT}} (single-leg) based on bias and liquidity.

### Recommended trade (single-leg option)
- Instrument: {{TICKER}}
- Strategy: Buy LEAP {{CALL|PUT}}
- Expiry: {{expiry}}
- Strike: $\{\{strike\}\}
- Entry premium: $\{\{entry_premium\}\}  // ask if present else mid; else theoretical
- Entry timing: {{entry_timing}}  // "open" is fine
- Position size: {{size_contracts}} contract(s)
- Stop-loss (premium): $\{\{stop_premium\}\}
- Profit target (premium): $\{\{tp_premium\}\}
- Confidence: {{confidence_decimal}}  // 0.00–1.00

### Why this strike
{{why_strike}}

### Key risks
{{key_risks}}

### Actionable execution notes
{{execution_notes}}

### News sentiment
- **Summary:** \{\{sentiment_summary\}\}
- **Headlines:** \{\{news_bullets\}\}

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
  "entry_price_source": "{{entry_price_source}}",
  "entry_timing": "{{entry_timing}}",
  "signal_publish_time": "{{YYYY-MM-DD HH:MM:SS}}",
  "news_sentiment": "{{sentiment_label}}",
  "news_sentiment_score": {{sentiment_score}}
}
\`\`\`
`;

// ---- helpers ----
function nowNy() {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const s = fmt.format(new Date());
  const [mdy, hms] = s.split(", ");
  const [m, d, y] = mdy.split("/");
  return { date: `${y}-${m}-${d}`, ts: `${y}-${m}-${d} ${hms}` };
}

function withTimeout<T>(p: Promise<T>, ms = 12000, label = "op"): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
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
  // ensure ~12–26 months out
  if (msToDecThis < 1000 * 60 * 60 * 24 * 270) target = thirdFriday(y + 1, 11);
  return target.toISOString().slice(0, 10);
}

// --- pricing/selection utilities (FIXED FOR STARTER PLAN) ---

// FIX: Trust 'mid' directly because it contains Last Trade Price on Starter Plan
function midOf(c: OptionCandidate): number | null {
  if (c.mid != null && isFinite(c.mid) && c.mid > 0) return c.mid;
  return null;
}

// FIX: Check 'mid' directly
function priceOf(c: OptionCandidate): { price: number; source: "ask" | "mid" } | null {
  const ask = c.ask ?? null;
  if (ask != null && isFinite(ask) && ask > 0) return { price: ask, source: "ask" };
  
  const m = midOf(c);
  if (m != null && isFinite(m) && m > 0) return { price: m, source: "mid" };
  
  return null; 
}

function spreadPct(c: OptionCandidate): number | null {
  // On starter plan, we likely have no bid/ask, so spread is unknown/null
  const bid = c.bid ?? null;
  const ask = c.ask ?? null;
  if (bid == null || ask == null || !isFinite(bid) || !isFinite(ask) || bid <= 0 || ask <= 0)
    return null;
  const mid = (bid + ask) / 2;
  if (mid <= 0) return null;
  return ((ask - bid) / mid) * 100;
}

function spreadCommentFromPct(pct: number | null): "tight" | "moderate" | "wide" | "unknown" {
  if (pct == null) return "unknown";
  if (pct <= 2) return "tight";
  if (pct <= 5) return "moderate";
  return "wide";
}

function theoreticalPremium(
  c: OptionCandidate,
  ltp: number,
  ivGuess: number
): number {
  const isCall = c.right === "C";
  const intrinsic = Math.max(
    0,
    isCall ? ltp - c.strike : c.strike - ltp
  );
  // Time value scaled by LTP and sqrt(T)
  const T = Math.max(
    1 / 365,
    (Date.parse(c.expiry + "T20:00:00Z") - Date.now()) / (365 * 24 * 3600 * 1000)
  );
  const tv = 0.25 * ltp * Math.sqrt(T) * Math.max(0.15, Math.min(0.60, ivGuess));
  const tvCapped = Math.min(tv, Math.max(2, 0.15 * Math.max(ltp, c.strike)));
  return round2(intrinsic + tvCapped);
}

function guessIvFromChain(
  side: "call" | "put",
  ltp: number,
  candidates: OptionCandidate[]
): number {
  const right: "C" | "P" = side === "call" ? "C" : "P";
  const marks = candidates
    .filter((c) => c.right === right)
    .map((c) => {
      const mid = midOf(c);
      if (mid == null) return null;
      const intrinsic = Math.max(0, right === "C" ? ltp - c.strike : c.strike - ltp);
      const tv = Math.max(0, mid - intrinsic);
      return { T: Math.max(1 / 365, (Date.parse(c.expiry + "T20:00:00Z") - Date.now()) / (365 * 24 * 3600 * 1000)), tv };
    })
    .filter((x): x is { T: number; tv: number } => !!x);

  if (!marks.length) return 0.28;
  const avg = marks.reduce((a, b) => a + (b.tv / Math.sqrt(b.T)), 0) / marks.length;
  const iv = avg / (0.25 * Math.max(1, ltp));
  return Math.max(0.15, Math.min(0.60, iv));
}

function pickBestBySide(
  side: "call" | "put",
  ltp: number,
  candidates: OptionCandidate[]
): OptionCandidate | null {
  const right: "C" | "P" = side === "call" ? "C" : "P";
  const pool = candidates.filter((c) => c.right === right);
  if (!pool.length) return null;

  const score = (c: OptionCandidate, pivotDelta: number | null) => {
    // For Starter plan, we won't have spread info, so default to 3 (neutral)
    const sp = spreadPct(c);
    const spreadScore = sp == null ? 3 : Math.min(10, sp / 10); 
    const oiScore = -(c.oi ?? 0) / 5000;
    
    // Check if we have a price (mid > 0)
    const hasPrice = (c.mid ?? 0) > 0;
    const priceBonus = hasPrice ? -0.25 : 0;

    if (pivotDelta != null && c.delta != null && isFinite(c.delta)) {
      const deltaScore = Math.abs((c.delta as number) - pivotDelta);
      return deltaScore + priceBonus + spreadScore + oiScore;
    } else {
      const bias = side === "call" ? -0.02 : +0.02;
      const target = ltp * (1 + bias);
      const strikeScore = Math.abs(c.strike - target) / Math.max(1, ltp);
      return strikeScore + priceBonus + spreadScore + oiScore;
    }
  };

  const inBand = pool.filter(
    (c) =>
      c.delta != null &&
      isFinite(c.delta) &&
      (side === "call"
        ? (c.delta as number) >= 0.6 && (c.delta as number) <= 0.8
        : (c.delta as number) <= -0.6 && (c.delta as number) >= -0.8)
  );
  if (inBand.length) {
    const pivot = side === "call" ? 0.7 : -0.7;
    return inBand
      .map((c) => ({ c, s: score(c, pivot) }))
      .sort((a, b) => a.s - b.s)[0].c;
  }

  const relaxed = pool.filter(
    (c) =>
      c.delta != null &&
      isFinite(c.delta) &&
      (side === "call"
        ? (c.delta as number) >= 0.5 && (c.delta as number) <= 0.9
        : (c.delta as number) <= -0.5 && (c.delta as number) >= -0.9)
  );
  if (relaxed.length) {
    const pivot = side === "call" ? 0.7 : -0.7;
    return relaxed
      .map((c) => ({ c, s: score(c, pivot) }))
      .sort((a, b) => a.s - b.s)[0].c;
  }

  return pool
    .map((c) => ({ c, s: score(c, null) }))
    .sort((a, b) => a.s - b.s)[0].c;
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
    // 1. Auth Check
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isProByEmail(email)))
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    
    // 2. Resolve User ID & Check Limits
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const hasAccess = await hasLimitRemaining(user.id, "leap");
    if (!hasAccess) {
      return NextResponse.json({ 
        error: "Monthly LEAP signal limit reached. Please upgrade." 
      }, { status: 403 });
    }

    // input
    const body = await req.json().catch(() => ({}));
    const parsed = inSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Bad input" }, { status: 400 });
    const ticker = parsed.data.ticker;

    // underlying snapshot for LTP
    const snap = await withTimeout(getStockSnapshot(ticker), 8000, "polygon:snapshot").catch(() => null);
    
    // FIX: Using only available fields from StockSnapshot (Starter Plan compatible)
    const day = snap?.ticker?.day;
    const prev = snap?.ticker?.prevDay;
    const lastTradePrice = snap?.ticker?.lastTrade?.p; // <--- Correct way to get price on Starter Plan

    // Logic: Try Last Trade -> Day Close -> Prev Close -> etc.
    const ltp = lastTradePrice ?? day?.c ?? prev?.c ?? day?.o ?? prev?.o ?? null;
    
    if (!ltp || !day || !prev) return insuff("snapshot missing ltp/day/prev");

    // long-term bias from ~1y bars
    const bars = await withTimeout(getStockAggs(ticker, 260), 10000, "polygon:aggs").catch(() => []);
    if (!bars.length) return insuff("no 1y bars");
    const closes = bars.map((b) => b.c);
    const ma50 = sma(closes, 50);
    const ma200 = sma(closes, 200);
    const rsi14 = rsi(closes, 14);
    const above50 = ma50 != null && ltp > ma50;
    const above200 = ma200 != null && ltp > ma200;
    const rsiBull = rsi14 != null && rsi14 > 50;
    const rsiBear = rsi14 != null && rsi14 < 50;
    let biasScore = 0;
    if (above50) biasScore++;
    if (above200) biasScore++;
    if (rsiBull) biasScore++;
    if (!above50) biasScore--;
    if (above200) biasScore--;
    if (rsiBear) biasScore--;
    const longTermBias: "bullish" | "bearish" | "neutral" =
      biasScore >= 1 ? "bullish" : biasScore <= -1 ? "bearish" : "neutral";

    // news sentiment
    const sentiment = await llmNewsSentiment(ticker);
    const newsBullets =
      sentiment.headlines
        .slice(0, 5)
        .map((h) => `- ${h.title}${h.date ? ` (${h.date})` : ""}`)
        .join("\n") || "- No recent, reliable headlines.";

    // options: fetch both sides
    const targetExpiry = defaultLeapExpiryIso();
    const calls = await withTimeout(getLeapOptionCandidates(ticker, targetExpiry, "call"), 12000, "options:calls").catch(
      () => [] as OptionCandidate[]
    );
    const puts = await withTimeout(getLeapOptionCandidates(ticker, targetExpiry, "put"), 12000, "options:puts").catch(
      () => [] as OptionCandidate[]
    );
    if (!calls.length && !puts.length) return insuff("options_unavailable");

    const bestCall = pickBestBySide("call", ltp, calls);
    const bestPut = pickBestBySide("put", ltp, puts);

    if (!bestCall && !bestPut) return insuff("options_unpriced");

    // Choose side
    let chosen: OptionCandidate | null = null;
    let chosenSide: "call" | "put" | null = null;
    if (longTermBias === "bullish") {
      chosen = bestCall ?? bestPut;
      chosenSide = bestCall ? "call" : bestPut ? "put" : null;
    } else if (longTermBias === "bearish") {
      chosen = bestPut ?? bestCall;
      chosenSide = bestPut ? "put" : bestCall ? "call" : null;
    } else {
      // neutral logic
      const scoreLiquidity = (c: OptionCandidate | null) => {
        if (!c) return -Infinity;
        const oi = c.oi ?? 0;
        const sp = spreadPct(c);
        const spreadScore = sp == null ? -5 : -sp;
        return oi * 0.001 + spreadScore;
      };
      const sCall = scoreLiquidity(bestCall);
      const sPut = scoreLiquidity(bestPut);
      if (sCall > sPut) {
        chosen = bestCall;
        chosenSide = "call";
      } else if (sPut > sCall) {
        chosen = bestPut;
        chosenSide = "put";
      } else {
        chosen = bestCall ?? bestPut;
        chosenSide = bestCall ? "call" : bestPut ? "put" : null;
      }
    }

    if (!chosen || !chosenSide) return insuff("options_unpriced");

    // --- RE-FETCH DATA IF MISSING ---
    // On Starter plan, check if mid (last trade) or OI is missing
    if (chosen.mid == null || chosen.oi == null) {
      console.log(`[Sniper] Fetching specific snapshot for ${chosen.contract}`);
      const freshData = await getSpecificOptionSnapshot(chosen.contract);
      if (freshData) {
        chosen = { ...chosen, ...freshData };
        if (chosenSide === "call" && bestCall) Object.assign(bestCall, freshData);
        if (chosenSide === "put" && bestPut) Object.assign(bestPut, freshData);
      }
    }
    // -------------------------------------

    const ivGuessCall = guessIvFromChain("call", ltp, calls);
    const ivGuessPut = guessIvFromChain("put", ltp, puts);
    const ivGuess = chosenSide === "call" ? ivGuessCall : ivGuessPut;

    const quoted = priceOf(chosen);
    const entryPrice = quoted
      ? round2(quoted.price)
      : theoreticalPremium(chosen, ltp, ivGuess);
    const entryPriceSource = quoted ? quoted.source : "theoretical";

    if (!entryPrice || !isFinite(entryPrice) || entryPrice <= 0) return insuff("options_unpriced");

    const spreadTxt = spreadCommentFromPct(spreadPct(chosen));
    const stopPremium = round2(entryPrice * 0.625); // ~37.5% below entry
    const tpPremium = round2(entryPrice * 2.0); // +100% PT
    const confidence = longTermBias === "neutral" ? 0.6 : 0.75;

    const { date, ts } = nowNy();

    const payload = {
      ticker,
      date,
      ts,
      ltp: round2(ltp),
      long_term_bias: longTermBias,
      context_line: [
        ma50 != null ? (ltp > ma50 ? "above 50SMA" : "below 50SMA") : null,
        ma200 != null ? (ltp > ma200 ? "above 200SMA" : "below 200SMA") : null,
        rsi14 != null ? `RSI ${round2(rsi14)}` : null,
      ]
        .filter(Boolean)
        .join(", "),

      call: bestCall
        ? {
            contract: bestCall.contract,
            expiry: bestCall.expiry,
            strike: round2(bestCall.strike),
            right: "C" as const,
            // Pass null for bid/ask, pass mid (Last Trade)
            bid: null,
            ask: null,
            mid: midOf(bestCall) != null ? round2(midOf(bestCall) as number) : null,
            oi: bestCall.oi ?? null,
            volume: bestCall.volume ?? null,
            delta: bestCall.delta ?? null,
            iv: bestCall.iv ?? null,
          }
        : null,

      put: bestPut
        ? {
            contract: bestPut.contract,
            expiry: bestPut.expiry,
            strike: round2(bestPut.strike),
            right: "P" as const,
            bid: null,
            ask: null,
            mid: midOf(bestPut) != null ? round2(midOf(bestPut) as number) : null,
            oi: bestPut.oi ?? null,
            volume: bestPut.volume ?? null,
            delta: bestPut.delta ?? null,
            iv: bestPut.iv ?? null,
          }
        : null,

      chosen_side: chosenSide,
      expiry: chosen.expiry,
      strike: round2(chosen.strike),
      chosen_oi: chosen.oi ?? null,
      spread_comment: spreadTxt,

      entry_premium: entryPrice,
      entry_price_source: entryPriceSource,
      stop_premium: stopPremium,
      tp_premium: tpPremium,

      size_contracts: 1,
      entry_timing: "open",
      confidence_decimal: confidence,

      sentiment_label: sentiment.label,
      sentiment_score: round2(sentiment.score),
      sentiment_summary: sentiment.summary,
      news_bullets: newsBullets,
    };

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const userPrompt = `TICKER=${ticker}\nPAYLOAD=${JSON.stringify(payload)}`;

    const resp = await withTimeout(
      client.responses.create({
        model: "gpt-5.2", // or "gpt-4o"
        input: [
          { role: "system", content: SYSTEM + "\n\n" + LEAPS_V2_FORMAT },
          { role: "user", content: userPrompt },
        ],
        reasoning: { effort: "medium" },
      }),
      120000,
      "openai:leaps"
    );

    interface RespWithText {
      output_text?: string;
    }
    const out = (resp as RespWithText).output_text?.trim() || "";
    const looksLike =
      /LEAP Analysis Summary/i.test(out) &&
      /TRADE_DETAILS/i.test(out) &&
      out.length > 200;
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