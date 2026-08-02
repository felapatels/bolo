import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, contactSubmissionsTable } from "@workspace/db";
import { getAuth } from "@clerk/express";
import { ensureLocalUser } from "../lib/userIdentity";
import { createRateLimit } from "../middlewares/rateLimit";
import { sendContactNotification } from "../lib/resendClient";

const router: IRouter = Router();

const CONTACT_CATEGORIES = [
  "general",
  "billing",
  "technical",
  "feedback",
  "other",
] as const;

const contactBodySchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email address"),
  category: z.enum(CONTACT_CATEGORIES, {
    errorMap: () => ({ message: "Invalid category" }),
  }),
  message: z
    .string()
    .min(1, "Message is required")
    .max(2000, "Message must be 2000 characters or fewer"),
});

// 3 submissions per user/IP per 10 minutes — the 4th gets a 429.
const contactRateLimit = createRateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message:
    "You've sent a few messages recently. Please wait a few minutes before trying again.",
});

router.post(
  "/contact",
  contactRateLimit,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = contactBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0]?.message ?? "Invalid request";
      res.status(400).json({ error: firstError });
      return;
    }

    const { name, email, category, message } = parsed.data;
    // Mounted BEFORE the barrel-wide requireAuth so signed-out visitors from
    // the public /privacy and /terms pages can reach the form. clerkMiddleware
    // runs app-wide, so getAuth() still surfaces the caller id when a session
    // is present; ensureLocalUser keeps the userId FK satisfiable. Attribution
    // is best-effort — never block a contact message on it.
    let userId: string | null = null;
    try {
      userId = getAuth(req)?.userId ?? null;
      if (userId) await ensureLocalUser(userId);
    } catch {
      userId = null;
    }

    // Insert the row first — if this fails we propagate a 500 so the client
    // knows the message was NOT saved.
    let submissionId: number;
    let createdAt: Date;
    try {
      const [row] = await db
        .insert(contactSubmissionsTable)
        .values({ userId, name, email, category, message, emailSent: false })
        .returning({
          id: contactSubmissionsTable.id,
          createdAt: contactSubmissionsTable.createdAt,
        });
      submissionId = row.id;
      createdAt = row.createdAt;
    } catch {
      res
        .status(500)
        .json({ error: "Failed to save your message. Please try again." });
      return;
    }

    // Attempt to send the notification email.  Failures are silently absorbed
    // so the user always sees a success confirmation once the DB row is saved.
    const emailSent = await sendContactNotification({
      name,
      email,
      category,
      message,
      userId,
      createdAt,
    });

    if (emailSent) {
      // Best-effort flag update — don't fail the request if this write errors.
      try {
        await db
          .update(contactSubmissionsTable)
          .set({ emailSent: true })
          .where(eq(contactSubmissionsTable.id, submissionId));
      } catch {
        // Non-fatal: the row is saved, email was sent, flag just stays false.
      }
    }

    res.json({ success: true });
  },
);

export default router;
