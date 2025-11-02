// src/lib/sentiment.ts
export type Headline = { title: string; description?: string | null };

const POS = ["beat", "beats", "strong", "surge", "record", "raise", "raises", "upgrade", "outperform", "profit", "growth", "bullish"];
const NEG = ["miss", "misses", "weak", "cut", "cuts", "downgrade", "probe", "lawsuit", "recall", "bearish", "layoff", "guidance cut", "plunge", "drop", "falls"];

function scoreText(t: string): number {
  const s = t.toLowerCase();
  let sc = 0;
  for (const w of POS) if (s.includes(w)) sc += 1;
  for (const w of NEG) if (s.includes(w)) sc -= 1;
  return sc;
}

/** Returns score in [-1, 1] and a label. */
export function sentimentOf(headlines: Headline[]): { score: number; label: "positive"|"neutral"|"negative"; sample: string[] } {
  if (!headlines.length) return { score: 0, label: "neutral", sample: [] };
  const raw = headlines.map(h => scoreText([h.title, h.description ?? ""].join(". ")));
  const total = raw.reduce((a,b)=>a+b,0);
  // normalize by count; gentle clamp
  const avg = Math.max(-2, Math.min(2, total / Math.max(1, headlines.length)));
  const score = avg / 2; // -> [-1, 1]
  const label = score > 0.15 ? "positive" : score < -0.15 ? "negative" : "neutral";
  const sample = headlines.slice(0, 3).map(h => h.title);
  return { score, label, sample };
}