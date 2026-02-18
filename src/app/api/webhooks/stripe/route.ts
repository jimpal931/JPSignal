import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  
  // FIX: await headers() before calling .get()
  const signature = (await headers()).get("Stripe-Signature") as string;

  if (!signature) {
    return new NextResponse("Missing Stripe Signature", { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error: any) {
    console.error("Webhook signature verification failed.", error.message);
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }

  // Handle "Invoice Paid" (Subscription Renewal)
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as Stripe.Invoice;
    // Stripe IDs can be objects or strings, cast to string safely
    const customerId = typeof invoice.customer === 'string' 
      ? invoice.customer 
      : (invoice.customer as any)?.id;

    if (customerId) {
      const user = await prisma.user.findUnique({
        where: { stripeCustomerId: customerId },
        include: { usage: true },
      });

      if (user) {
        // Reset usage
        await prisma.usage.upsert({
          where: { userId: user.id },
          update: {
            stockSignalsUsed: 0,
            leapSignalsUsed: 0,
            resetAt: new Date(),
          },
          create: {
            userId: user.id,
            stockSignalsUsed: 0,
            leapSignalsUsed: 0,
            resetAt: new Date(),
          }
        });
        console.log(`Reset usage for user ${user.email}`);
      }
    }
  }

  return new NextResponse(null, { status: 200 });
}