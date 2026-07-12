import { Router, type IRouter, type Request, type Response } from "express";
import { db, profilesTable } from "@workspace/db";
import { asc } from "drizzle-orm";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { CreateProfileBody, VerifyPinBody } from "@workspace/api-zod";

const router: IRouter = Router();

function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPinHash(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(pin, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Lightweight in-memory throttle so a 4-digit PIN can't be brute-forced.
const MAX_PIN_ATTEMPTS = 8;
const PIN_WINDOW_MS = 60_000;
const pinAttempts = new Map<number, { count: number; resetAt: number }>();

function pinRateLimited(profileId: number): boolean {
  const now = Date.now();
  const entry = pinAttempts.get(profileId);
  if (!entry || now > entry.resetAt) {
    pinAttempts.set(profileId, { count: 1, resetAt: now + PIN_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PIN_ATTEMPTS;
}

type ProfileRow = typeof profilesTable.$inferSelect;

function toPublicProfile(row: ProfileRow) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    avatar: row.avatar,
    hasPin: row.pinHash != null,
  };
}

// GET /profiles — list all kid profiles.
router.get("/profiles", async (_req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select()
    .from(profilesTable)
    .orderBy(asc(profilesTable.id));
  res.json(rows.map(toPublicProfile));
});

// POST /profiles — create a new kid profile.
router.post("/profiles", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile payload" });
    return;
  }
  const { name, color, avatar, pin } = parsed.data;

  const [row] = await db
    .insert(profilesTable)
    .values({
      name: name.trim(),
      color,
      avatar: avatar.trim().slice(0, 2).toUpperCase(),
      pinHash: pin ? hashPin(pin) : null,
    })
    .returning();

  res.status(201).json(toPublicProfile(row));
});

// POST /profiles/:id/verify-pin — check a profile's PIN.
router.post(
  "/profiles/:id/verify-pin",
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid profile id" });
      return;
    }
    const parsed = VerifyPinBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid pin payload" });
      return;
    }

    if (pinRateLimited(id)) {
      res.status(429).json({ error: "Too many attempts, please wait a minute" });
      return;
    }

    const profile = await db.query.profilesTable.findFirst({
      where: (t, { eq: eqFn }) => eqFn(t.id, id),
    });
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    // A profile with no PIN is always open.
    const valid =
      profile.pinHash == null
        ? true
        : verifyPinHash(parsed.data.pin, profile.pinHash);
    res.json({ valid });
  },
);

export default router;
