import { createClerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const GIFT_PREVIEW_EMAIL = "aakeshp@gmail.com";

/** Owner-authorized gift preview: skip only the completed-stop prerequisite.
 * Both gift read and claim call this through the same loader. Never grants
 * currency, changes lesson progress, or bypasses the daily ledger claim.
 */
export async function canPreviewDailyGift(userId: string): Promise<boolean> {
  const [localUser] = await db.select({ email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  // The mirror is only a lookup hint, never proof of eligibility.
  if (localUser?.email?.trim().toLowerCase() !== GIFT_PREVIEW_EMAIL) return false;

  // Deployments can authenticate against separate live and development Clerk
  // instances. Verify the authenticated ID with the instance that owns it.
  const keys = new Set([process.env.CLERK_SECRET_KEY_PROD, process.env.CLERK_SECRET_KEY]);
  for (const secretKey of keys) {
    if (!secretKey) continue;
    try {
      const user = await createClerkClient({ secretKey }).users.getUser(userId);
      const primary = user.emailAddresses.find(email => email.id === user.primaryEmailAddressId);
      return primary?.verification?.status === "verified"
        && primary.emailAddress.trim().toLowerCase() === GIFT_PREVIEW_EMAIL;
    } catch {
      // Missing identity / unavailable provider: keep the normal lesson gate.
    }
  }
  return false;
}
