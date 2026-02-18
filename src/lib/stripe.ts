// src/lib/stripe.ts
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

const secretKey = process.env.STRIPE_SECRET_KEY;

if (!secretKey) throw new Error("STRIPE_SECRET_KEY missing");

export const stripe = new Stripe(secretKey, {
  // apiVersion: "2025-08-27.basil", // Optional: leave commented to use default
  typescript: true,
  httpClient: Stripe.createFetchHttpClient(),
});

export async function ensureStripeCustomerByEmail(email: string) {
  // 1. Check our database first
  const user = await prisma.user.findUnique({
    where: { email },
    select: { stripeCustomerId: true },
  });

  if (user?.stripeCustomerId) {
    return { id: user.stripeCustomerId };
  }

  // 2. Search Stripe to prevent duplicates
  const search = await stripe.customers.search({
    query: `email:'${email.replace(/'/g, "\\'")}'`,
    limit: 1,
  });

  let customer = search.data[0];

  // 3. Create in Stripe if missing
  if (!customer) {
    customer = await stripe.customers.create({ email });
  }

  // 4. CRITICAL FIX: Use 'upsert' instead of 'update'
  // This prevents the P2025 error by creating the user if they don't exist yet.
  await prisma.user.upsert({
    where: { email },
    update: { 
      stripeCustomerId: customer.id 
    },
    create: { 
      email, 
      stripeCustomerId: customer.id 
    },
  });

  return customer;
}