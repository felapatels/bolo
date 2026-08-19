import { pgTable, text, serial, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Append-only log of friend-code lookups (POST /friends/requests/by-code).
// This log IS the rate-limit source, the same way zone_testouts is for zone
// test-outs, a DB-backed window rather than the in-memory middleware, because
// a code-guessing surface must stay bounded across instances and restarts.
//
// Two axes are logged on every row so both can be counted from one insert:
//   - user_id : the signed-in caller (the per-account ceiling).
//   - ip_hash : a salted hash of the caller's IP (the per-IP ceiling, which is
//               what actually bounds an attacker spreading guesses across many
//               throwaway accounts). Hashed, never stored raw, because the only
//               thing this table needs is equality between two requests.
//
// Every attempt is logged, hit or miss. Counting only misses would let a
// guesser reset their budget by interleaving one known-good code.
export const friendCodeAttemptsTable = pgTable(
  "friend_code_attempts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    ipHash: text("ip_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("friend_code_attempts_user_idx").on(t.userId, t.createdAt),
    index("friend_code_attempts_ip_idx").on(t.ipHash, t.createdAt),
  ],
);

export type FriendCodeAttempt = typeof friendCodeAttemptsTable.$inferSelect;
