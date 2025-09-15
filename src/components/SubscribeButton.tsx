"use client";
import { useState } from "react";

export default function SubscribeButton() {
  const [loading, set] = useState(false);
  return (
    <button
      className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      onClick={async () => {
        set(true);
        const r = await fetch("/api/checkout", { method: "POST" });
        const { url } = await r.json();
        window.location.href = url;
      }}
      disabled={loading}
    >
      {loading ? "Redirecting..." : "Subscribe"}
    </button>
  );
}