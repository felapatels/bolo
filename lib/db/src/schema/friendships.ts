import {
  pgTable,
  text,
  serial,
  timestamp,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

// The social graph behind friends & the friends leaderboard.
//
// A friendship is modelled as a single directional row from the learner who
// sent the request (`requesterId`) to the learner who received it
// (`addresseeId`), plus a `status`:
//   - "pending" , a request that is waiting on the addressee to accept/decline.
//   - "accepted", a mutual friendship. It is stored once (keeping the original
//                  requester/addressee direction) but read from both sides, so
//                  each learner sees the other in their friends list.
//
// Uniqueness is enforced on the ordered (requesterId, addresseeId) pair so the
// same person can't send two requests to the same target. The application layer
// additionally rejects a request when a row already exists in EITHER direction,
// so A→B and B→A can never both exist. A CHECK constraint forbids self-friending
// at the database level as a backstop to the application guard.
export const friendshipsTable = pgTable(
  "friendships",
  {
    id: serial("id").primaryKey(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => usersTable.id),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => usersTable.id),
    // "pending" | "accepted"
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // When the addressee accepted the request (null while pending).
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    unique("friendships_pair_unique").on(t.requesterId, t.addresseeId),
    check("friendships_no_self", sql`${t.requesterId} <> ${t.addresseeId}`),
  ],
);

export type Friendship = typeof friendshipsTable.$inferSelect;
