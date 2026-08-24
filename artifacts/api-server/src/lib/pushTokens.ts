// The device table: who the server may push to, and which rows are dead.
//
// Kept apart from expoPush.ts on purpose. This half touches the database and
// never the network; that half touches the network and never the database. The
// send path joins them, and either can be tested without the other.
import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, pushTokensTable, usersTable, type PushToken } from "@workspace/db";
import { isExpoPushToken } from "./expoPush";

export const PUSH_PLATFORMS = ["ios", "android"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/**
 * Records a device against a learner, and MOVES it if it belonged to another.
 *
 * A push token identifies an install, not a person, and an install changes
 * hands: a shared family iPad, a phone signed out and back in as a sibling. If
 * the row were keyed on (user, token) both accounts would keep the device and
 * each would receive the other's notifications. So the token is unique and
 * registering re-points it.
 *
 * Re-registering also REVIVES a disabled row. A learner who deleted the app and
 * reinstalled gets a token we may have buried; their reappearance is the
 * evidence that it lives again.
 */
export async function registerPushToken(
  userId: string,
  token: string,
  platform: PushPlatform,
): Promise<PushToken | null> {
  if (!isExpoPushToken(token)) return null;
  const now = new Date();
  const [row] = await db
    .insert(pushTokensTable)
    .values({ userId, token: token.trim(), platform })
    .onConflictDoUpdate({
      target: pushTokensTable.token,
      set: { userId, platform, lastSeenAt: now, disabledAt: null },
    })
    .returning();
  return row ?? null;
}

/** Signing out on a device should stop that device, and only that device. */
export async function unregisterPushToken(
  userId: string,
  token: string,
): Promise<boolean> {
  const rows = await db
    .delete(pushTokensTable)
    .where(
      and(eq(pushTokensTable.token, token.trim()), eq(pushTokensTable.userId, userId)),
    )
    .returning({ id: pushTokensTable.id });
  return rows.length > 0;
}

/** The live devices for a learner. Disabled rows are never returned. */
export async function livePushTokens(userId: string): Promise<PushToken[]> {
  return db
    .select()
    .from(pushTokensTable)
    .where(
      and(eq(pushTokensTable.userId, userId), isNull(pushTokensTable.disabledAt)),
    );
}

/**
 * Who a broadcast goes to.
 *
 * "paid" is anyone whose plan is not free, which today is All-Access and the
 * withdrawn Family plan. Deliberately derived from the SAME `tier` column
 * entitlements resolve from, rather than a second definition of "paying", so a
 * broadcast can never disagree with what the app itself thinks a learner is.
 */
export const BROADCAST_AUDIENCES = ["all", "free", "paid"] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

/**
 * Every live device in an audience.
 *
 * NO LIMIT AND NO PAGING, on purpose. A broadcast that quietly reached only the
 * first N devices would be worse than one that failed outright, because nobody
 * would ever know it was short. If this needs paging one day, page it at the
 * CALLER so the omission appears in the response the human is reading.
 */
export async function livePushTokensForAudience(
  audience: BroadcastAudience,
): Promise<PushToken[]> {
  const live = isNull(pushTokensTable.disabledAt);
  if (audience === "all") {
    return db.select().from(pushTokensTable).where(live);
  }
  // Joined rather than filtered in memory: the audience is the point of the
  // feature, and a wrong one is a message reaching people it was not for.
  const rows = await db
    .select({ token: pushTokensTable })
    .from(pushTokensTable)
    .innerJoin(usersTable, eq(usersTable.id, pushTokensTable.userId))
    .where(
      and(
        live,
        audience === "free"
          ? eq(usersTable.tier, "free")
          : ne(usersTable.tier, "free"),
      ),
    );
  return rows.map((r) => r.token);
}

/**
 * Buries the tokens Expo reported as DeviceNotRegistered.
 *
 * Marked, not deleted. A deleted row cannot answer "why did this learner stop
 * getting notifications", and that is exactly the question a delivery
 * complaint asks. It also lets a reinstall revive the same row rather than
 * accumulating a new one each time.
 */
export async function disablePushTokens(tokens: string[]): Promise<number> {
  if (tokens.length === 0) return 0;
  const rows = await db
    .update(pushTokensTable)
    .set({ disabledAt: new Date() })
    .where(
      and(
        inArray(pushTokensTable.token, tokens),
        isNull(pushTokensTable.disabledAt),
      ),
    )
    .returning({ id: pushTokensTable.id });
  return rows.length;
}
