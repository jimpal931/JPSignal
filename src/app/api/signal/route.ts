// src/app/api/signal-v2/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
import { getStockSnapshot, getStockAggs } from "@/lib/market-polygon";
import { sma, rsi, macdSlope, round2 } from "@/lib/ta";
import { llmNewsSentiment } from "@/lib/sentiment";
import { hasLimitRemaining, incrementUsage } from "@/lib/usage";
import { prisma } from "@/lib/prisma"; // Needed to resolve userId from email

// Ensure Node runtime + no CDN caching
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- input ----
const inSchema = z.object({
  ticker: z
    .string()
    .regex(/^[A-Z.\-]{1,10}$/i)
    .transform((s) => s.toUpperCase()),
});

// ---- system prompt + format ----
const SYSTEM = `You are “JP Signals — STOCKS V3 (Realtime Auto-Fill)”.
Goal: When the user gives only a ticker (e.g., “TICKER = AMD”), render a single-page trading note in the exact STOCKS V2 layout. Output only the note—no extra commentary, no links, no images.

HARD REQUIREMENTS
- Use America/New_York time. Stamp the note with today’s date and the current local timestamp.
- If no numbers were provided, return exactly “INSUFFICIENT_DATA”.
- Tone: concise, declarative, actionable. US decimals; round prices to 2 decimals.

You will be provided a JSON payload with all numbers. Use only those numbers—do not invent data.`.trim();

const STOCKS_V2_FORMAT = String.raw`
OUTPUT FORMAT (must match exactly; no extra lines)
Title:
“{{TICKER}} JPSignals Stock Signal {{DATE}}”

Then:
“# {{TICKER}} Stock Analysis Summary ({{DATE}})”

### Market Direction Consensus for {{TICKER}}
(2–4 sentences citing one support & one resistance, momentum, volume.)

### Trade Recommendation
1. **Entry Price or Range:** - **Entry Price:** $\{\{entry_low\}\} - $\{\{entry_high\}\} (\{\{ENTRY_TIMING\}\})
2. **Stop Loss Level:** - **Stop Loss:** $\{\{stop\}\} (reason)
3. **Take Profit Level:** - **Take Profit Level 1:** $\{\{tp1\}\} (label)  
   - **Take Profit Level 2:** $\{\{tp2\}\} (label)  
   - **Risk-Reward Ratio:** - PT1: Risk $\{\{risk\}\}/share for a reward of $\{\{reward1\}\} (1:\{\{rr1\}\})
     - PT2: Risk $\{\{risk\}\}/share for a reward of $\{\{reward2\}\} (1:\{\{rr2\}\})
4. **Position Size Recommendation:** - **Position Size:** \{\{pos_size\}\}% of the portfolio (adjust per risk tolerance)
5. **Confidence Level:** - **Confidence Level:** \{\{confidence_pct\}\}%
6. **Key Risks and Trade Rationale:** - **Key Risks:** \{\{bullets\}\}  
   - **Trade Rationale:** \{\{bullets\}\}
7. **Trade Entry Timing:** - \{\{ENTRY_TIMING\}\}

### News sentiment
- **Summary:** \{\{sentiment_summary\}\}
- **Headlines:** \{\{news_bullets\}\}

### TRADE_DETAILS (JSON Format)
\`\`\`json
{
  "TRADE_DETAILS": {
    "instrument": "{{TICKER}}",
    "direction": "{{long|short}}",
    "entry_price": {{midpoint}},
    "stop_loss": {{stop}},
    "take_profit": {{tp2}},
    "size": {{pos_size}},
    "confidence": {{confidence_decimal}},
    "entry_timing": "{{ENTRY_TIMING}}",
    "signal_publish_time": "{{YYYY-MM-DD HH:MM:SS}}",
    "news_sentiment": "{{sentiment_label}}",
    "news_sentiment_score": {{sentiment_score}}
  }
}
\`\`\`
`;

// ---- helpers (kept intact) ----
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
  const s = fmt.format(new Date()); // "MM/DD/YYYY, HH:MM:SS"
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
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return { mins: hh * 60 + mm, dow: dowMap[dowStr] ?? 1 };
}

function isRegularTradingHoursNy(): boolean {
  const { mins, dow } = nowPartsNy();
  if (dow === 0 || dow === 6) return false; // weekend
  return mins >= 9 * 60 + 30 && mins < 16 * 60; // 09:30–16:00 ET
}

function isFirst15MinNy(): boolean {
  const { mins } = nowPartsNy();
  return mins >= 9 * 60 + 30 && mins < 9 * 60 + 45;
}

function isPostCloseNy(): boolean {
  const { mins } = nowPartsNy();
  // after 16:05 ET or before 09:30 ET → treat as outside cash session
  return mins >= 16 * 60 + 5 || mins < 9 * 60 + 30;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
type EntryTiming = "market_open" | "intraday_breakout" | "intraday_breakdown";
function entryTimingNy(direction: "long" | "short"): EntryTiming {
  // Outside RTH or first 15 minutes → wait for market open
  if (!isRegularTradingHoursNy() || isFirst15MinNy()) return "market_open";
  // During RTH: breakout for longs, breakdown for shorts
  return direction === "long" ? "intraday_breakout" : "intraday_breakdown";
}

function widthFor(ltp: number) {
  const w = Math.max(0.4, Math.round(ltp * 0.0025 * 100) / 100);
  return round2(w);
}

function uniqSorted(nums: number[], asc = true) {
  const s = Array.from(new Set(nums.map((x) => round2(x))));
  return s.sort((a, b) => (asc ? a - b : b - a));
}

function withTimeout<T>(p: Promise<T>, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
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

const DEBUG = process.env.NODE_ENV !== "production";

const insuff = (why: string) =>
  new NextResponse(DEBUG ? `INSUFFICIENT_DATA:${why}` : "INSUFFICIENT_DATA", {
    status: 200,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });

// ---- handler ----
export async function POST(req: NextRequest) {
  try {
    // 1. Auth Check
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isProByEmail(email)))
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });

    // 2. Resolve User ID (if not on session) & Check Limits
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const hasAccess = await hasLimitRemaining(user.id, "stock");
    if (!hasAccess) {
      return NextResponse.json({ 
        error: "Monthly limit reached. Please upgrade your plan." 
      }, { status: 403 });
    }

    // input
    const body = await req.json().catch(() => ({}));
    const parsed = inSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Bad input" }, { status: 400 });
    const ticker = parsed.data.ticker;

    // 1) Single-ticker snapshot
    const snap = await withTimeout(getStockSnapshot(ticker)).catch(() => null);
    const day = snap?.ticker?.day;
    const prev = snap?.ticker?.prevDay;
    const lastTrade = snap?.ticker?.lastTrade?.p;
    const bid = snap?.ticker?.lastQuote?.bp;
    const ask = snap?.ticker?.lastQuote?.ap;
    const nbboMid = bid && ask ? (bid + ask) / 2 : undefined;
    // Prefer today's close over previous close; clamp to today's close after RTH
    let ltp = nbboMid ?? lastTrade ?? day?.c ?? prev?.c ?? day?.o;
    if (isPostCloseNy() && day?.c) {
      ltp = day.c;
    }

    if (DEBUG) {
      console.log("[signal-v2] price sources", {
        nbboMid,
        lastTrade,
        dayC: day?.c,
        prevC: prev?.c,
        finalLtp: ltp,
      });
    }

    if (!ltp || !day || !prev) {
      return insuff("snapshot missing ltp/day/prev");
    }

    // definite day/prior values
    const dayHigh = day.h ?? day.c ?? ltp;
    const dayLow = day.l ?? day.c ?? ltp;
    const prevClose = prev.c ?? day.o ?? ltp;
    const priorHigh = prev.h ?? prev.c ?? ltp;
    const priorLow = prev.l ?? prev.c ?? ltp;

    // 2) ~1y daily aggs
    const bars = await withTimeout(getStockAggs(ticker, 260)).catch(() => []);
    if (!bars.length) {
      return insuff("no 1y bars");
    }
    const closes = bars.map((b) => b.c);
    const vols = bars.map((b) => b.v);

    // Indicators
    const ma10 = sma(closes, 10);
    const ma20 = sma(closes, 20);
    const ma50 = sma(closes, 50);
    const ma200 = sma(closes, 200);
    const rsi14 = rsi(closes, 14);
    const macdS = macdSlope(closes);

    // 52-week from series
    const hi52 = Math.max(...closes);
    const lo52 = Math.min(...closes);

    // Volume context (cap extreme ratios; handle partial days)
    const lastVol = vols.length ? vols[vols.length - 1] : 0;
    const avg20Vol =
      vols.slice(-20).reduce((a, b) => a + b, 0) /
      Math.max(1, Math.min(20, vols.length));
    const volRatio = avg20Vol > 0 ? Math.min(3, lastVol / avg20Vol) : null;

    // Direction rules
    const aboveMA10 = ma10 != null && ltp > ma10;
    const aboveMA20 = ma20 != null && ltp > ma20;
    const belowMA10 = ma10 != null && ltp < ma10;
    const belowMA20 = ma20 != null && ltp < ma20;
    const rsiBull = rsi14 != null && rsi14 > 50;
    const rsiBear = rsi14 != null && rsi14 < 50;

    let biasScore = 0;
    if (aboveMA10) biasScore++;
    if (aboveMA20) biasScore++;
    if (rsiBull) biasScore++;
    if (belowMA10) biasScore--;
    if (belowMA20) biasScore--;
    if (rsiBear) biasScore--;
    const direction: "long" | "short" = biasScore >= 0 ? "long" : "short";

    // Entry band around LTP
    const w = widthFor(ltp);
    const entryLow = direction === "long" ? ltp : round2(ltp - w);
    const entryHigh = direction === "long" ? round2(ltp + w) : ltp;
    const midpoint = round2((entryLow + entryHigh) / 2);

    // Supports / Resistances (unique + sorted)
    const supportCandidates = [ma10, ma20, ma50, ma200, priorLow].filter(
      (x): x is number => typeof x === "number"
    );
    const resistanceCandidates = [ma10, ma20, ma50, ma200, priorHigh].filter(
      (x): x is number => typeof x === "number"
    );

    const supports = uniqSorted(supportCandidates, true);
    const resistances = uniqSorted(resistanceCandidates, true);

    // Stops/TPs
    let stop: number;
    if (direction === "long") {
      const below = supports.filter((s) => s < midpoint);
      stop = below.length ? Math.max(...below) : round2(ltp * (1 - 0.018));
    } else {
      const above = resistances.filter((r) => r > midpoint);
      stop = above.length ? Math.min(...above) : round2(ltp * (1 + 0.018));
    }

    let tp1: number;
    if (direction === "long") {
      const above = resistances.filter((r) => r > midpoint);
      tp1 = above.length ? Math.min(...above) : round2(midpoint * 1.01);
    } else {
      const below = supports.filter((s) => s < midpoint);
      tp1 = below.length ? Math.max(...below) : round2(midpoint * 0.99);
    }

    // Normalize risk to avoid zero/tiny distances
    const MIN_RISK = round2(Math.max(ltp * 0.002, 0.05)); // ≥0.2% or 5¢
    let risk = round2(Math.abs(midpoint - stop));
    if (risk < MIN_RISK) {
      stop =
        direction === "long"
          ? round2(midpoint - MIN_RISK)
          : round2(midpoint + MIN_RISK);
      risk = MIN_RISK;
    }
    const tp2 =
      direction === "long"
        ? round2(midpoint + 3 * risk)
        : round2(midpoint - 3 * risk);

    // Confidence & position size
    let conf = 60;
    if (
      rsi14 != null &&
      ((direction === "long" && rsi14 > 55) ||
        (direction === "short" && rsi14 < 45))
    )
      conf += 3;
    if (
      (direction === "long" && aboveMA10 && aboveMA20) ||
      (direction === "short" && belowMA10 && belowMA20)
    )
      conf += 3;
    if (volRatio != null && volRatio > 1.05) conf += 3;
    if (
      (direction === "long" && rsi14 != null && rsi14 < 50) ||
      (direction === "short" && rsi14 != null && rsi14 > 50)
    )
      conf -= 3;
    conf = clamp(conf, 55, 70);
    const posSize = risk / ltp > 0.025 ? 2.0 : 2.5;

    const { date, ts } = nowNy();

    // ---- News sentiment (added) ----
    const sentiment = await llmNewsSentiment(ticker);
    const newsBullets =
      sentiment.headlines.slice(0, 5).map(h => `- ${h.title}${h.date ? ` (${h.date})` : ""}`).join("\n") ||
      "- No recent, reliable headlines.";

    // Build payload with DEFINITE numbers
    const payload = {
      ticker,
      date,
      ts,
      ltp: round2(ltp),
      dayHigh: round2(dayHigh),
      dayLow: round2(dayLow),
      prevClose: round2(prevClose),

      priorHigh: round2(priorHigh),
      priorLow: round2(priorLow),

      hi52: round2(hi52),
      lo52: round2(lo52),

      ma10: ma10 != null ? round2(ma10) : null,
      ma20: ma20 != null ? round2(ma20) : null,
      ma50: ma50 != null ? round2(ma50) : null,
      ma200: ma200 != null ? round2(ma200) : null,
      rsi14: rsi14 != null ? Math.round(rsi14 * 10) / 10 : null,
      macdSlope: macdS != null ? Math.round(macdS * 10000) / 10000 : null,
      volRatio: volRatio != null ? Math.round(volRatio * 100) / 100 : null,

      direction,
      entry_low: round2(entryLow),
      entry_high: round2(entryHigh),
      ENTRY_TIMING: entryTimingNy(direction),

      stop: round2(stop),
      tp1: round2(tp1),
      tp2: round2(tp2),

      risk,
      reward1: round2(Math.abs(tp1 - midpoint)),
      reward2: round2(Math.abs(tp2 - midpoint)),
      rr1: (Math.abs(tp1 - midpoint) / (risk || 0.01)).toFixed(2),
      rr2: (Math.abs(tp2 - midpoint) / (risk || 0.01)).toFixed(2),
      midpoint,
      pos_size: posSize,
      confidence_pct: Math.round(conf),
      confidence_decimal: Math.round(conf) / 100,

      // sentiment fields used by the template
      sentiment_label: sentiment.label,
      sentiment_score: round2(sentiment.score),
      sentiment_summary: sentiment.summary,
      news_bullets: newsBullets,
    };

    // final guard
    if (!isFinite(payload.ltp)) {
      return insuff("ltp not finite");
    }

    // LLM render (strict + timeout)
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const userPrompt = `TICKER=${ticker}\nPAYLOAD=${JSON.stringify(payload)}`;

    const resp = await withTimeout(
      client.responses.create({
        model: "gpt-5",
        input: [
          { role: "system", content: SYSTEM + "\n\n" + STOCKS_V2_FORMAT },
          { role: "user", content: userPrompt },
        ],
        reasoning: { effort: "medium" },
      }),
      120000
    );

    interface ResponseWithText { output_text?: string }
    const out = (resp as ResponseWithText).output_text?.trim() || "";
    const looksLikeNote =
      /Stock Analysis Summary/i.test(out) &&
      /TRADE_DETAILS/i.test(out) &&
      out.length > 200;

    if (!looksLikeNote) {
      return insuff("LLM note failed heuristic");
    }

    // Normalize first-line title to your canonical form
    const wantedTitle = `${ticker} JPSignals Stock Signal ${payload.date}`;
    const normalized = out.replace(/^[^\n]*\n?/, wantedTitle + "\n");

    // 3. Increment Usage (Success Only)
    await incrementUsage(user.id, "stock");

    return new NextResponse(normalized, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[signal-v2] fatal", e);
    return new NextResponse("INSUFFICIENT_DATA", {
      status: 200,
      headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
    });
  }
}