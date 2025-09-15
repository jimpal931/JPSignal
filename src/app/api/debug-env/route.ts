import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? "SET(sk_* hidden)" : "MISSING",
    STRIPE_PRICE_PRO: process.env.STRIPE_PRICE_PRO
      ? process.env.STRIPE_PRICE_PRO.slice(0, 7) + "..."
      : "MISSING",
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL ?? "MISSING",
    CWD: process.cwd(),
  });
}