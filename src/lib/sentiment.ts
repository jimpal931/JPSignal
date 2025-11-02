// src/lib/sentiment.ts
import OpenAI from "openai";

export type NewsItem = {
  title: string;
  url?: string | null;
  published_utc?: string | null;
};

export type SentimentResult = {
  label: "bullish" | "bearish" | "neutral";
  score: number; // -1 .. +1
  summary: string;
  sources: { title: string; url?: string | null }[];
  headlines: { title: string; url?: string | null; date?: string | null }[];
};

// safe fallback
function safeDefault(): SentimentResult {
  return {
    label: "neutral",
    score: 0,
    summary: "No reliable news signal.",
    sources: [],
    headlines: [],
  };
}

// Polygon News fetch
async function fetchPolygonNews(ticker: string, limit = 8): Promise<NewsItem[]> {
  try {
    const key = process.env.POLYGON_API_KEY!;
    const url = `https://api.polygon.io/v2/reference/news?ticker=${encodeURIComponent(
      ticker
    )}&limit=${limit}&apiKey=${key}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.results) ? j.results : [];
  } catch {
    return [];
  }
}

export async function llmNewsSentiment(
  ticker: string
): Promise<SentimentResult> {
  try {
    const headlines = await fetchPolygonNews(ticker, 8);
    if (!headlines.length) return safeDefault();

    const textBlocks = headlines
      .map((h) => `• ${h.title}`)
      .slice(0, 8)
      .join("\n");

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const prompt = `
You are a financial news sentiment model.
Analyze the following headlines for ticker ${ticker} and output JSON ONLY.

Return fields:
- label: "bullish" | "bearish" | "neutral"
- score: -1 to +1
- summary: brief reason

Headlines:
${textBlocks}

Respond strictly in JSON.
    `.trim();

    const resp = await client.responses.create({
      model: "gpt-5-mini",
      input: prompt,
    });

    const raw = (resp.output_text ?? "").trim();
    if (!raw.startsWith("{")) return safeDefault();

    const parsed = JSON.parse(raw);

    return {
      label: parsed.label ?? "neutral",
      score: parsed.score ?? 0,
      summary: parsed.summary ?? "No clear signal.",
      sources: headlines.map((h) => ({ title: h.title, url: h.url })),
      headlines: headlines.map((h) => ({
        title: h.title,
        url: h.url,
        date: h.published_utc ? h.published_utc.slice(0, 10) : null,
      })),
    };
  } catch {
    return safeDefault();
  }
}