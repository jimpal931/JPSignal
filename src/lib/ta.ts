// src/lib/ta.ts
import { RSI, SMA, MACD } from "technicalindicators";

export const last = <T>(a: T[]) => a[a.length - 1];

export function sma(values: number[], n: number) {
  if (values.length < n) return undefined;
  return SMA.calculate({ period: n, values }).at(-1);
}

export function rsi(values: number[], n = 14) {
  if (values.length < n) return undefined;
  return RSI.calculate({ period: n, values }).at(-1);
}

export function macdSlope(values: number[]) {
  if (values.length < 35) return undefined;

  const arr = MACD.calculate({
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
    values,
  });

  const a = arr.at(-1);
  const b = arr.at(-2);

  if (!a?.MACD || !b?.MACD) return undefined; // ensures MACD is defined

  return a.MACD - b.MACD;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;