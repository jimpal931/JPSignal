import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST() {
  const session = await getServerSession(authOptions).catch(() => null);
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await stripe.customers.list({ email, limit: 1 });
  const customer = list.data[0] ?? await stripe.customers.create({ email });

  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customer.id,
    line_items: [{ price: process.env.STRIPE_PRICE_PRO!, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/signals?sub=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/?sub=cancel`,
  });

  return NextResponse.json({ url: checkout.url });
}