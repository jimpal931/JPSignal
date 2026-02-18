// src/components/SubscribeButton.tsx
"use client";

import { useState } from "react";

type Plan =  "pro" | "elite";

interface Props {
  plan: Plan;
  label?: string;
}

export default function SubscribeButton({ plan, label }: Props) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    try {
      setLoading(true);
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const data = await res.json();

      if (!res.ok || !data.url) {
        alert(data.error || "Unable to start checkout.");
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      console.error("Subscribe error", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white py-4 text-base font-semibold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50"
    >
      {loading ? "Redirecting…" : label ?? "Subscribe"}
    </button>
  );
}