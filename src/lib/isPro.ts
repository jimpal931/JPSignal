// src/lib/isPro.ts
import { stripe } from "./stripe";

const PRO_PRICE_IDS = [
  process.env.STRIPE_PRICE_PRO,
  process.env.STRIPE_PRICE_ELITE,
].filter(Boolean) as string[];

export async function isProByEmail(email: string): Promise<boolean> {
  if (!PRO_PRICE_IDS.length) {
    console.warn("[isProByEmail] No STRIPE_PRICE_* envs configured");
    return false;
  }

  // 1. Sanitize email for search query
  const escaped = email.replace(/'/g, "\\'");
  
  // 2. Find the Stripe Customer
  const customers = await stripe.customers.search({
    query: `email:'${escaped}'`,
    limit: 1,
  });

  const customer = customers.data[0];
  if (!customer) return false;

  // 3. List Subscriptions
  const subs = await stripe.subscriptions.list({
    customer: customer.id,
    status: "all",
    // REMOVED "expand" because price.id is available by default.
    // If you really need full price details, use: expand: ["data.items.data.price"]
    limit: 10, 
  });

  const now = Math.floor(Date.now() / 1000);

  for (const sub of subs.data) {
    // Skip invalid statuses
    if (
      sub.status === "incomplete" ||
      sub.status === "incomplete_expired" ||
      sub.status === "canceled" ||
      sub.status === "unpaid"
    ) {
      continue;
    }

    // Check if scheduled to cancel in the past
    if (sub.cancel_at && sub.cancel_at <= now) continue;

    // Check items for matching Price ID
    for (const item of sub.items.data) {
      // item.price is an object by default, so .id works fine
      const priceId = item.price?.id;
      if (priceId && PRO_PRICE_IDS.includes(priceId)) {
        return true;
      }
    }
  }

  return false;
}