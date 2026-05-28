// src/app/api/hybrid-signal/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isProByEmail } from "@/lib/isPro";
import { getStockSnapshot, getStockAggs, getStockFinancials } from "@/lib/market-polygon";
import { calculateMacroGateScore, calculateQuantScore } from "@/lib/hybrid-engine";
import { hasLimitRemaining, incrementUsage } from "@/lib/usage";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/ta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  ticker: z.string().min(1).transform((t) => t.toUpperCase()),
});

export async function POST(req: NextRequest) {
  try {
    // 1. Subscription & Rate Limit Verification
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;
    if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await isProByEmail(email))) return NextResponse.json({ error: "Pro Subscription Required" }, { status: 403 });

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) return NextResponse.json({ error: "Account Not Found" }, { status: 404 });
    if (!(await hasLimitRemaining(user.id, "stock"))) return NextResponse.json({ error: "Monthly API processing capacity exhausted." }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Invalid Ticker Parameter" }, { status: 400 });
    const { ticker } = parsed.data;

    // ==========================================
    // LAYER 1: DETERMINISTIC MACRO DEPLOYMENT GATE
    // ==========================================
    // Pull market proxy streams for execution vetting
    const spyBars = await getStockAggs("SPY", 260).catch(() => []);
    const vixyBars = await getStockAggs("VIXY", 60).catch(() => []);
    
    if (!spyBars.length || !vixyBars.length) {
      return NextResponse.json({ error: "Systemic data initialization failed" }, { status: 500 });
    }

    const macroContext = calculateMacroGateScore(
      spyBars.map(b => b.c), 
      vixyBars.map(b => b.c)
    );

    // Hard Risk Breaker Action
    if (macroContext.zone === "RED") {
      return NextResponse.json({
        macroGateScore: macroContext.score,
        deploymentZone: macroContext.zone,
        verdict: "HALT_TRADING_ROTATION_TO_CASH",
        reason: "Systemic risk triggers active. Capital deployment halted by Layer 1 protective rules."
      });
    }

    // ==========================================
    // LAYER 2: DETERMINISTIC QUANTITATIVE SCANNER
    // ==========================================
    const stockBars = await getStockAggs(ticker, 260).catch(() => []);
    if (!stockBars.length) return NextResponse.json({ error: `No history available for ${ticker}` }, { status: 404 });
    
    const quantTechnicalScore = calculateQuantScore(stockBars.map(b => b.c));

    // ==========================================
    // LAYER 3: FUNDAMENTAL AI ANALYST (Structured)
    // ==========================================
    const corporateFinancials = await getStockFinancials(ticker).catch(() => null);
    if (!corporateFinancials?.results?.length) {
      return NextResponse.json({ error: `Fundamental filings missing for asset: ${ticker}` }, { status: 422 });
    }

    // Construct highly focused JSON context payload to strip out prompt fluff
    const streamlinedFinancialContext = corporateFinancials.results.map(f => ({
      quarter_end: f.end_date,
      revenue: f.financials.income_statement?.revenues?.value ?? "N/A",
      net_income: f.financials.income_statement?.net_income_loss?.value ?? "N/A",
      assets: f.financials.balance_sheet?.assets?.value ?? "N/A",
      liabilities: f.financials.balance_sheet?.liabilities?.value ?? "N/A",
      operating_cash_flow: f.financials.cash_flow_statement?.net_cash_flow_from_operating_activities?.value ?? "N/A",
    }));

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    
    // Leverage JSON Schema enforcement for structured fundamental evaluation
    const aiAnalysisResponse = await client.chat.completions.create({
      model: "gpt-5.4", // Or utilize Claude/Gemini model integrations as needed
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an institutional forensic accountant. Review the provided 4-quarter corporate financial data. 
          Evaluate and score the asset across these buckets out of 10 points:
          1. earnings_quality (Revenue consistency & real matching margin trajectory)
          2. balance_sheet_safety (Asset backing vs leverage & debt vulnerabilities)
          3. margin_expansion (Core operating scaling efficiencies)
          4. red_flags (Explicit balance sheet decay, cash burns, or sudden spikes in liabilities. Give 10 for clean, 1 for toxic breakdown).
          
          You must output a strict JSON object matching this schema:
          {
            "earnings_quality": number,
            "balance_sheet_safety": number,
            "margin_expansion": number,
            "red_flags": number,
            "justification_summary": "string"
          }`
        },
        {
          role: "user",
          content: `Asset: ${ticker}\nData Statements:\n${JSON.stringify(streamlinedFinancialContext, null, 2)}`
        }
      ]
    });

    const parsedAiMetrics = JSON.parse(aiAnalysisResponse.choices[0].message.content || "{}");
    
    // Compute cumulative normalized AI Fundamental Score out of 100
    const rawAiSum = 
      parsedAiMetrics.earnings_quality + 
      parsedAiMetrics.balance_sheet_safety + 
      parsedAiMetrics.margin_expansion + 
      parsedAiMetrics.red_flags; // Max possible: 40 points
    
    const aiFundamentalScore = round2((rawAiSum / 40) * 100);

    // ==========================================
    // SYSTEM INTEGRATION: THE 60/40 COMPOSITE BLEND
    // ==========================================
    const finalReRankScore = round2((quantTechnicalScore * 0.60) + (aiFundamentalScore * 0.40));
    
    // Adjust final recommended positions using Layer 1's safety scale multiplier
    const rawBasePosition = finalReRankScore > 75 ? 2.5 : 2.0;
    const macroAdjustedPositionSize = round2(rawBasePosition * macroContext.multiplier);

    // Log tracking metric via Prisma
    await incrementUsage(user.id, "stock");

    return NextResponse.json({
      ticker,
      processedTimestamp: new Date().toISOString(),
      layer1MacroGate: {
        score: macroContext.score,
        zone: macroContext.zone,
        capitalAllocationMultiplier: macroContext.multiplier
      },
      layer2QuantTechnicalScore: quantTechnicalScore,
      layer3AiFundamentalScore: aiFundamentalScore,
      aiBreakdownBuckets: parsedAiMetrics,
      compositeScore: finalReRankScore,
      executionDirectives: {
        recommendedPositionSizePct: macroAdjustedPositionSize,
        actionBias: finalReRankScore >= 50 ? "LONG_ACCUMULATE" : "SHORT_DISTRIBUTE"
      }
    });

  } catch (error) {
    console.error("[HYBRID_ENGINE_PIPELINE_ERROR]", error);
    return NextResponse.json({ error: "Execution cycle timeout or downstream failure" }, { status: 500 });
  }
}