// src/components/MacroHeader.tsx
"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";

type MacroData = { score: number; zone: "GREEN" | "YELLOW" | "RED"; multiplier: number };

export function MacroHeader() {
  const [macro, setMacro] = useState<MacroData | null>(null);

  useEffect(() => {
    fetch("/api/macro-status")
      .then((res) => res.json())
      .then((data) => setMacro(data))
      .catch(() => null);
  }, []);

  if (!macro) return null;

  const zoneColors = {
    GREEN: "bg-emerald-950/80 text-emerald-400 border-emerald-500/30",
    YELLOW: "bg-amber-950/80 text-amber-400 border-amber-500/30",
    RED: "bg-rose-950/80 text-rose-400 border-rose-500/30",
  };

  return (
    <div className={`w-full border-b backdrop-blur-md px-4 py-2 transition-all duration-300 ${zoneColors[macro.zone]}`}>
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${macro.zone === "GREEN" ? "bg-emerald-400" : macro.zone === "YELLOW" ? "bg-amber-400" : "bg-rose-400"}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${macro.zone === "GREEN" ? "bg-emerald-500" : macro.zone === "YELLOW" ? "bg-amber-500" : "bg-rose-500"}`}></span>
          </span>
          <span>
            <strong>LAYER 1 MACRO GATE:</strong> {macro.zone} ZONE (Score: {macro.score}/100)
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span>Risk Multiplier: <strong>{(macro.multiplier * 100).toFixed(0)}%</strong></span>
          <Link href="/dashboard" className="underline hover:text-white transition-colors font-bold">
            Open Terminal →
          </Link>
        </div>
      </div>
    </div>
  );
}