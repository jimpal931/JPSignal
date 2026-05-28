// src/lib/hybrid-engine.ts
import { sma, rsi, macdSlope, round2 } from "./ta";

/**
 * LAYER 1: The Macro Deployment Gate (Deterministic)
 * Scores the macro regime from 0 to 100 based on index proxies available on Polygon Starter.
 */
export function calculateMacroGateScore(spyCloses: number[], vixyCloses: number[]): { score: number; zone: "GREEN" | "YELLOW" | "RED"; multiplier: number } {
  let score = 0;

  // 1. Market Breadth / Trend Proxy: SPY above its 200 SMA
  const spy200 = sma(spyCloses, 200);
  const currentSpy = spyCloses[spyCloses.length - 1];
  const isTrendBullish = spy200 ? currentSpy > spy200 : true;
  score += isTrendBullish ? 35 : 5;

  // 2. Volatility Level Proxy: VIXY (Short-term VIX ETF) RSI check
  const vixyRsi = rsi(vixyCloses, 14) ?? 50;
  if (vixyRsi < 45) score += 35;       // Low volatility acceleration / calm market
  else if (vixyRsi < 60) score += 20;  // Moderate baseline volatility
  else score += 5;                     // Severe volatility spike / panic mode

  // 3. Asset Momentum Proxy: SPY RSI baseline stability
  const spyRsi = rsi(spyCloses, 14) ?? 50;
  if (spyRsi > 50 && spyRsi < 70) score += 30;
  else if (spyRsi >= 70 || (spyRsi <= 50 && spyRsi > 40)) score += 15;
  else score += 0;

  // Decision Zone Mapping Matrix
  if (score >= 70) return { score, zone: "GREEN", multiplier: 1.0 };
  if (score >= 40) return { score, zone: "YELLOW", multiplier: 0.6 };
  return { score, zone: "RED", multiplier: 0.0 };
}

/**
 * LAYER 2: Quantitative Scoring Model (Deterministic)
 * Generates a technical momentum score out of 100 based on 5 mathematical factors.
 */
export function calculateQuantScore(closes: number[]): number {
  let score = 0;
  const ltp = closes[closes.length - 1];

  const ma10 = sma(closes, 10);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  const rsi14 = rsi(closes, 14);
  const slope = macdSlope(closes) ?? 0;

  // Factor 1: Moving Average Stack (Weight: 25)
  if (ma10 && ma20 && ma10 > ma20) score += 15;
  if (ma50 && ltp > ma50) score += 10;

  // Factor 2: Macro Trend Alignment (Weight: 20)
  if (ma200 && ltp > ma200) score += 20;

  // Factor 3: RSI Structural Threshold (Weight: 20)
  if (rsi14 && rsi14 > 50 && rsi14 < 68) score += 20;
  else if (rsi14 && rsi14 >= 30 && rsi14 <= 50) score += 10;

  // Factor 4: MACD Histogram Acceleration Slope (Weight: 20)
  if (slope > 0) score += 20;

  // Factor 5: Short-term Velocity (Weight: 15)
  const priorClose = closes[closes.length - 2] ?? ltp;
  if (ltp > priorClose) score += 15;

  return score;
}