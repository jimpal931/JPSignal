// src/app/api/macro-status/route.ts
import { NextResponse } from "next/server";
import { getStockAggs } from "@/lib/market-polygon";
import { calculateMacroGateScore } from "@/lib/hybrid-engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const spyBars = await getStockAggs("SPY", 260).catch(() => []);
    const vixyBars = await getStockAggs("VIXY", 60).catch(() => []);
    
    if (!spyBars.length || !vixyBars.length) {
      return NextResponse.json({ score: 50, zone: "YELLOW", multiplier: 0.6 });
    }

    const macroContext = calculateMacroGateScore(
      spyBars.map(b => b.c), 
      vixyBars.map(b => b.c)
    );

    return NextResponse.json(macroContext);
  } catch {
    return NextResponse.json({ score: 50, zone: "YELLOW", multiplier: 0.6 });
  }
}