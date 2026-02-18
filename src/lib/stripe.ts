// src/lib/stripe.ts
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) throw new Error("STRIPE_SECRET_KEY missing");

export const stripe = new Stripe(secretKey, {
  apiVersion: "2025-08-27.basil", // Update this line
  typescript: true,
});

export async function ensureStripeCustomerByEmail(email: string) {
  // 1. First, check our own database
  const user = await prisma.user.findUnique({
    where: { email },
    select: { stripeCustomerId: true },
  });

  if (user?.stripeCustomerId) {
    // We already have the ID, return it (wrapped in an object to match Stripe's return type shape roughly)
    return { id: user.stripeCustomerId };
  }

  // 2. If not in DB, search Stripe to see if they exist there (prevents duplicates)
  const search = await stripe.customers.search({
    query: `email:'${email.replace(/'/g, "\\'")}'`,
    limit: 1,
  });

  let customer = search.data[0];

  // 3. If not in Stripe, create them
  if (!customer) {
    customer = await stripe.customers.create({ email });
  }

  // 4. CRITICAL: Save the ID to the database so the Webhook can find this user later
  await prisma.user.update({
    where: { email },
    data: { stripeCustomerId: customer.id },
  });

  return customer;
}