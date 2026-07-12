import { getAuth } from "@clerk/express";
import type { NextFunction, Request, Response } from "express";
import { db, usersTable } from "@workspace/db";

// Adds the authenticated Clerk user id to the request after verifying the
// session. Also provisions a local `users` row just-in-time so attempts can
// reference it via foreign key.
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

    // Just-in-time provision the local mirror row (no-op if it exists).
    await db
      .insert(usersTable)
      .values({ id: userId })
      .onConflictDoNothing();

    (req as AuthedRequest).userId = userId;
    next();
  } catch (err) {
    next(err);
  }
}
