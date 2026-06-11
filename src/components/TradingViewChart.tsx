"use client";
import { useEffect, useRef } from "react";
import { createChart, ColorType, LineStyle, LineSeries, AreaSeries } from "lightweight-charts";

interface UniversalChartProps {
  mode: "stock" | "leap" | "hybrid";
  ticker: string;
  entryPrice?: number;
  stopLoss?: number;
  targetPrice?: number;
  direction?: "long" | "short" | "call" | "put";
  score?: number;
}

export default function TradingViewChart({
  mode,
  ticker,
  entryPrice = 0,
  stopLoss = 0,
  targetPrice = 0,
  direction = "long",
  score = 0,
}: UniversalChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 1. Initialize Chart Canvas with balanced autoScale padding adjustments
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#18181b" }, // bg-zinc-900
        textColor: "#a1a1aa", // text-zinc-400
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      },
      grid: {
        vertLines: { color: "#27272a" }, // border-zinc-800
        horzLines: { color: "#27272a" },
      },
      rightPriceScale: {
        borderColor: "#27272a",
        autoScale: true,
        entireTextOnly: false,
      },
      timeScale: { 
        borderColor: "#27272a", 
        timeVisible: true,
      },
      width: chartContainerRef.current.clientWidth,
      height: 260,
    });

    const now = Math.floor(Date.now() / 1000);
    const daySeconds = 86400;

    // 2. HYBRID MODULE PIPELINE
    if (mode === "hybrid") {
      const lineSeries = chart.addSeries(LineSeries, {
        color: score >= 50 ? "#6366f1" : "#f43f5e",
        lineWidth: 3,
      });

      const hybridData = [];
      // Adjusted hybrid view history to 30 days for continuity matching
      for (let i = 30; i > 0; i--) {
        hybridData.push({
          time: (now - i * daySeconds) as any,
          value: Math.min(100, Math.max(10, score + (Math.random() - 0.5) * 25)),
        });
      }
      hybridData.push({ time: now as any, value: score });
      lineSeries.setData(hybridData);

      lineSeries.createPriceLine({ price: 70, color: "#34d399", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "GREEN ZONE LEVEL" });
      lineSeries.createPriceLine({ price: 40, color: "#f59e0b", lineWidth: 1, lineStyle: LineStyle.Dashed, title: "YELLOW DEPLOYMENT BOUNDARY" });

    } else {
      // 3. STOCK / LEAP MODE WITH OPTIMIZED 14-DAY RISK-REWARD CONE
      const isBullish = direction === "long" || direction === "call";
      
      // Base historical timeline display
      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: isBullish ? "#34d399" : "#f87171",
        topColor: isBullish ? "rgba(52, 211, 153, 0.12)" : "rgba(248, 113, 113, 0.12)",
        bottomColor: "rgba(24, 24, 27, 0)",
        lineWidth: 2,
      });

      // Target Profit Future Prediction Series (Dashed Green)
      const profitProjectionSeries = chart.addSeries(LineSeries, {
        color: "#10b981", 
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
      });

      // Stop Loss Future Risk Prediction Series (Dashed Red)
      const stopLossProjectionSeries = chart.addSeries(LineSeries, {
        color: "#f43f5e", 
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
      });

      // A. Populate Historical Information backwards from 'now'
      const historicalData = [];
      let currentPrice = entryPrice * (isBullish ? 0.93 : 1.07);
      
      // OPTIMIZATION: Extended lookback history window to 35 days and slightly 
      // increased random asset noise variance to make the past look more dynamic
      for (let i = 35; i > 0; i--) {
        const drift = (entryPrice - currentPrice) / i;
        currentPrice += drift + (Math.random() - 0.49) * (entryPrice * 0.008);
        historicalData.push({ time: (now - i * daySeconds) as any, value: Number(currentPrice.toFixed(2)) });
      }
      historicalData.push({ time: now as any, value: entryPrice });
      areaSeries.setData(historicalData);

      // B. Generate Future Projections (Extended 14-Day Timeline Window)
      const profitData = [];
      const lossData = [];
      
      profitData.push({ time: now as any, value: entryPrice });
      lossData.push({ time: now as any, value: entryPrice });
      
      // OPTIMIZATION: Shifted timeline scale projection matrix out to 14 days
      const projectionDays = 14;
      let stepProfit = entryPrice;
      let stepLoss = entryPrice;

      const profitDelta = (targetPrice - entryPrice) / projectionDays;
      const lossDelta = (stopLoss - entryPrice) / projectionDays;

      for (let j = 1; j <= projectionDays; j++) {
        stepProfit += profitDelta + (Math.random() - 0.5) * (entryPrice * 0.001);
        stepLoss += lossDelta + (Math.random() - 0.5) * (entryPrice * 0.001);
        
        const finalProfit = j === projectionDays ? targetPrice : stepProfit;
        const finalLoss = j === projectionDays ? stopLoss : stepLoss;

        profitData.push({ time: (now + j * daySeconds) as any, value: Number(finalProfit.toFixed(2)) });
        lossData.push({ time: (now + j * daySeconds) as any, value: Number(finalLoss.toFixed(2)) });
      }
      
      profitProjectionSeries.setData(profitData);
      stopLossProjectionSeries.setData(lossData);

      // C. Anchor static price lines for clear scale reference points
      areaSeries.createPriceLine({
        price: entryPrice,
        color: "#6366f1",
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        title: `TRIGGER: $${entryPrice.toFixed(2)}`,
      });

      areaSeries.createPriceLine({
        price: stopLoss,
        color: "#f43f5e",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: `STOP LOSS: $${stopLoss.toFixed(2)}`,
      });

      areaSeries.createPriceLine({
        price: targetPrice,
        color: "#10b981",
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        title: `TARGET PROFIT: $${targetPrice.toFixed(2)}`,
      });
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [mode, ticker, entryPrice, stopLoss, targetPrice, direction, score]);

  return (
    <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl mt-4">
      <div className="flex justify-between items-center mb-2 font-mono text-[11px] text-zinc-500">
        <span>MODE // {mode.toUpperCase()} TIME MATRIX PROJECTION SPECTRUM</span>
        <span className="text-zinc-400 font-bold">{ticker} PROJECTION CONE</span>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}