// src/app/api/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { stripe, ensureStripeCustomerByEmail } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Plan = "pro" | "elite";

const PLAN_TO_PRICE: Record<Plan, string | undefined> = {
  pro: process.env.STRIPE_PRICE_PRO,
  elite: process.env.STRIPE_PRICE_ELITE,
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;

    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await req.json().catch(() => ({}));
    const plan = json.plan as Plan | undefined;

    if (!plan || !PLAN_TO_PRICE[plan]) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const priceId = PLAN_TO_PRICE[plan]!;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const customer = await ensureStripeCustomerByEmail(email);

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${baseUrl}/signals?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=cancel`,
    });

    return NextResponse.json({ url: checkout.url }, { status: 200 });
  } catch (err) {
    console.error("[subscribe] error", err);
    return NextResponse.json({ error: "Stripe error" }, { status: 500 });
  }
}