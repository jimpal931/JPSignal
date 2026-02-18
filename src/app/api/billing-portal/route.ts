// src/app/api/billing-portal/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const email = session?.user?.email ?? null;

    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const escaped = email.replace(/'/g, "\\'");
    const customers = await stripe.customers.search({
      query: `email:'${escaped}'`,
      limit: 1,
    });

    const customer = customers.data[0];
    if (!customer) {
      return NextResponse.json(
        { error: "No Stripe customer found for this account" },
        { status: 404 }
      );
    }

    const returnUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    const portal = await stripe.billingPortal.sessions.create({
      customer: customer.id,
      return_url: `${returnUrl}/account`,
    });

    return NextResponse.json({ url: portal.url }, { status: 200 });
  } catch (err) {
    console.error("[billing-portal] error", err);
    return NextResponse.json({ error: "Stripe error" }, { status: 500 });
  }
}

// Optional GET wrapper
export async function GET() {
  return POST();
}