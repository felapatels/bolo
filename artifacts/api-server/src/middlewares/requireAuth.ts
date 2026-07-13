import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { ensureLocalUser } from "../lib/userIdentity";

// Adds the authenticated Clerk user id to the request after verifying the
// session. Also provisions a local `users` row just-in-time (capturing the
// caller's display name + email from Clerk) so attempts can reference it via
// foreign key and friends can be found and shown by name.
export interface AuthedRequest extends Request {
  userId: string;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const auth = getAuth(req);
    const userId = auth?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Just-in-time provision the local mirror row and capture the caller's
    // display name + email from Clerk (backfilling older rows that lack them).
    await ensureLocalUser(userId);

    (req as AuthedRequest).userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}
