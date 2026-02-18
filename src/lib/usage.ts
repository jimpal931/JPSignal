import { prisma } from "@/lib/prisma";
import { PLAN_LIMITS } from "@/lib/limits";
import { Plan } from "@prisma/client";

/**
 * Checks if the user has remaining usage for a specific signal type.
 * Returns false if the user has reached their plan limit.
 */
export async function hasLimitRemaining(
  userId: string,
  type: "stock" | "leap"
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      usage: {
        select: {
          stockSignalsUsed: true,
          leapSignalsUsed: true,
        },
      },
    },
  });

  // If usage row is missing, block to force investigation or reset
  if (!user || !user.usage) {
    return false;
  }

  // Ensure plan is treated as a valid key (fallback to BASIC if somehow null)
  const userPlan = (user.plan || "BASIC") as Plan;
  const limit = PLAN_LIMITS[userPlan];

  if (type === "stock") {
    return user.usage.stockSignalsUsed < limit.stock;
  } else {
    return user.usage.leapSignalsUsed < limit.leap;
  }
}

/**
 * Increments the usage counter for a specific signal type.
 * Should be called ONLY after a successful signal generation.
 */
export async function incrementUsage(
  userId: string,
  type: "stock" | "leap"
): Promise<void> {
  if (type === "stock") {
    await prisma.usage.update({
      where: { userId },
      data: { stockSignalsUsed: { increment: 1 } },
    });
  } else {
    await prisma.usage.update({
      where: { userId },
      data: { leapSignalsUsed: { increment: 1 } },
    });
  }
}