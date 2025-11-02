// src/lib/spread-helpers.ts
import type { OptionCandidate } from "./market-polygon";

/**
 * Safely compute NBBO spread % if bid/ask exist and are positive.
 * Returns null when you can't compute (e.g., Starter plan without NBBO, or zero/invalid quotes).
 */
export function spreadPctSafe(c: OptionCandidate): number | null {
  const bid = c.bid ?? null;
  const ask = c.ask ?? null;
  if (
    bid == null ||
    ask == null ||
    !Number.isFinite(bid) ||
    !Number.isFinite(ask) ||
    bid <= 0 ||
    ask <= 0
  ) {
    return null;
  }
  const mid = (bid + ask) / 2;
  if (!Number.isFinite(mid) || mid <= 0) return null;
  return ((ask - bid) / mid) * 100;
}

/**
 * Penalize wide/unknown spreads for scoring (lower is better elsewhere).
 * 0..10 scale. Unknown → heavy penalty so other candidates win.
 */
export function spreadPenalty(c: OptionCandidate): number {
  const pct = spreadPctSafe(c);
  if (pct == null) return 8;         // Unknown quotes → strong penalty, but not infinite
  return Math.min(10, pct / 10);     // 0–2% ≈ 0–0.2, 5% → 0.5, 10%+ clamps at 1.0 (scaled to max 10)
}

/**
 * Human-readable label for the note.
 */
export function spreadComment(
  c: OptionCandidate
): "tight" | "moderate" | "wide" | "unknown" {
  const pct = spreadPctSafe(c);
  if (pct == null) return "unknown";
  if (pct <= 2) return "tight";
  if (pct <= 5) return "moderate";
  return "wide";
}