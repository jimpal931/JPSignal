import { stripe } from "./stripe";

const cache = new Map<string, { ok: boolean; exp: number }>();
const TTL = 5 * 60 * 1000;

export async function isProByEmail(email: string) {
  const now = Date.now();
  const hit = cache.get(email);
  if (hit && hit.exp > now) return hit.ok;

  const customers = await stripe.customers.list({ email, limit: 1 });
  const customer = customers.data[0];

  let ok = false;
  if (customer) {
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "all",
      limit: 10,
    });
    ok = subs.data.some(s => ["active", "trialing", "past_due"].includes(s.status));
  }

  cache.set(email, { ok, exp: now + TTL });
  return ok;
}