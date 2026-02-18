import OpenAI from "openai";

// --- Types ---

// The shape of a single news item from Polygon API
interface PolygonNewsItem {
  id: string;
  publisher: {
    name: string;
    homepage_url: string;
    logo_url?: string;
    favicon_url?: string;
  };
  title: string;
  author?: string;
  published_utc: string;
  article_url: string;
  tickers: string[];
  amp_url?: string;
  image_url?: string;
  description?: string;
}

export type SentimentResult = {
  label: "Bullish" | "Bearish" | "Neutral";
  score: number; // -1 to +1
  summary: string;
  headlines: { title: string; url?: string | null; date?: string | null }[];
};

// --- Helper: Safe Default ---
function safeDefault(): SentimentResult {
  return {
    label: "Neutral",
    score: 0,
    summary: "No reliable news signal.",
    headlines: [],
  };
}

// --- Main Function ---
export async function llmNewsSentiment(ticker: string): Promise<SentimentResult> {
  try {
    const apiKey = process.env.POLYGON_API_KEY;
    if (!apiKey) return safeDefault();

    // 1. Fetch from Polygon (Last 5 articles)
    const url = `https://api.polygon.io/v2/reference/news?ticker=${ticker}&limit=5&apiKey=${apiKey}`;
    
    // Cache for 1 hour to save API calls
    const r = await fetch(url, { next: { revalidate: 3600 } });
    
    if (!r.ok) return safeDefault();
    
    const data = await r.json();
    
    // STRICT TYPING FIX: explicit cast to our interface
    const results = (data.results || []) as PolygonNewsItem[];

    if (results.length === 0) return safeDefault();

    // 2. Format for LLM
    const headlinesText = results
      .map((h, i) => `${i + 1}. ${h.title} (${h.published_utc.split("T")[0]})`)
      .join("\n");

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const systemPrompt = `You are a financial news sentiment model.
Analyze the following headlines for ${ticker}.
Return a JSON object with:
- "label": "Bullish", "Bearish", or "Neutral"
- "score": number between -1.0 and 1.0
- "summary": A 1-sentence summary of the news sentiment.`;

    // 3. Call OpenAI (using gpt-5-mini)
    const completion = await client.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: headlinesText },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return safeDefault();

    const parsed = JSON.parse(content);

    // 4. Return formatted result
    return {
      label: parsed.label || "Neutral",
      score: parsed.score || 0,
      summary: parsed.summary || "Sentiment analysis unavailable.",
      headlines: results.map((h) => ({
        title: h.title,
        url: h.article_url,
        date: h.published_utc ? h.published_utc.split("T")[0] : null,
      })),
    };

  } catch (error) {
    console.error("[NEWS_SENTIMENT_ERROR]", error);
    return safeDefault();
  }
}