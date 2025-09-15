export type SignalId = "mean-reversion" | "breakout" | "momentum";

export const SIGNALS: { id: SignalId; name: string; description: string }[] = [
  { id: "mean-reversion", name: "Mean Reversion", description: "Contrarian signal based on short-term overextension." },
  { id: "breakout", name: "Breakout", description: "Detects strong moves out of consolidation ranges." },
  { id: "momentum", name: "Momentum", description: "Ranks trend strength and persistence." },
];