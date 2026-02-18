import { Plan } from "@prisma/client";

export const PLAN_LIMITS: Record<Plan, { stock: number; leap: number }> = {
  // Free tier (optional, or just for non-payers)
  BASIC: {
    stock: 3,  // Teaser
    leap: 0,
  },
  // This is your $30 "Founder's Plan"
  PRO: {
    stock: 100, // Effectively Unlimited
    leap: 100,   // High enough for any human trader
  },
  // Future Enterprise/Whale tier
  PRO_MAX: {
    stock: 10000,
    leap: 1000,
  },
};