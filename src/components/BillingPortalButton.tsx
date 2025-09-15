"use client";
import { useState } from "react";

export default function BillingPortalButton() {
  const [loading, set] = useState(false);
  return (
    <button
      className="px-4 py-2 rounded border disabled:opacity-50"
      onClick={async () => {
        set(true);
        const r = await fetch("/api/billing-portal", { method: "POST" });
        const { url } = await r.json();
        window.location.href = url;
      }}
      disabled={loading}
    >
      {loading ? "Opening..." : "Manage billing"}
    </button>
  );
}