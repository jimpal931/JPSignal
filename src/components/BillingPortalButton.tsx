// src/components/BillingPortalButton.tsx
"use client";

import { useState } from "react";

export default function BillingPortalButton() {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    try {
      setLoading(true);
      const res = await fetch("/api/billing-portal", { method: "POST" });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok || !data.url) {
        alert(data.error || "Unable to open billing portal.");
        return;
      }

      window.location.href = data.url;
    } catch (err) {
      console.error("Billing portal error", err);
      alert("Something went wrong. Try again later.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className="px-4 py-2 rounded-md bg-black text-white text-sm disabled:opacity-50"
      onClick={openPortal}
      disabled={loading}
    >
      {loading ? "Opening…" : "Manage Billing"}
    </button>
  );
}