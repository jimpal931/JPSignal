// src/lib/plan.ts
import { stripe } from "./stripe";

export type PlanId = "none" | "basic" | "pro" | "elite";

const PRICE_TO_PLAN = new Map<string, PlanId>();

// if (process.env.STRIPE_PRICE_BASIC) {
//   PRICE_TO_PLAN.set(process.env.STRIPE_PRICE_BASIC, "basic");
// }
if (process.env.STRIPE_PRICE_PRO) {
  PRICE_TO_PLAN.set(process.env.STRIPE_PRICE_PRO, "pro");
}
if (process.env.STRIPE_PRICE_ELITE) {
  PRICE_TO_PLAN.set(process.env.STRIPE_PRICE_ELITE, "elite");
}

const PLAN_RANK: Record<PlanId, number> = {
  none: 0,
  basic: 1,
  pro: 2,
  elite: 3,
};

export async function getPlanForEmail(email: string): Promise<PlanId> {
  if (!PRICE_TO_PLAN.size) {
    console.warn("[getPlanForEmail] No STRIPE_PRICE_* envs set");
    return "none";
  }

  const escaped = email.replace(/'/g, "\\'");
  const customers = await stripe.customers.search({
    query: `email:'${escaped}'`,
    limit: 1,
  });

  const customer = customers.data[0];
  if (!customer) return "none";

  const subs = await stripe.subscriptions.list({
    customer: customer.id,
    status: "all",
    expand: ["data.items.price"],
    limit: 10,
  });

  const now = Math.floor(Date.now() / 1000);
  let best: PlanId = "none";

  for (const sub of subs.data) {
    if (
      sub.status === "incomplete" ||
      sub.status === "incomplete_expired" ||
      sub.status === "canceled" ||
      sub.status === "unpaid"
    ) {
      continue;
    }

    if (sub.cancel_at && sub.cancel_at <= now) continue;

    for (const item of sub.items.data) {
      const priceId = item.price?.id;
      if (!priceId) continue;

      const plan = PRICE_TO_PLAN.get(priceId);
      if (!plan) continue;

      if (PLAN_RANK[plan] > PLAN_RANK[best]) {
        best = plan;
      }
    }
  }

  return best;
}