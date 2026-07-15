import { Resend } from "resend";
import { logger } from "./logger";

// Lazily initialised so a missing key only affects the send path, not startup.
let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY is not set — contact notification emails will be skipped");
    return null;
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

// The verified sender address.  Fall back to a standard noreply on the
// app's domain if RESEND_FROM is not explicitly configured.
function fromAddress(): string {
  return process.env.RESEND_FROM ?? "noreply@boloapp.in";
}

export interface ContactNotificationParams {
  name: string;
  email: string;
  category: string;
  message: string;
  userId: string | null;
  createdAt: Date;
}

/**
 * Sends a support notification to the LARK team inbox.
 * Returns true on success, false on any failure (the caller records
 * email_sent accordingly without surfacing the error to the user).
 */
export async function sendContactNotification(
  params: ContactNotificationParams,
): Promise<boolean> {
  const client = getResend();
  if (!client) return false;

  const { name, email, category, message, userId, createdAt } = params;
  const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);

  try {
    const { error } = await client.emails.send({
      from: fromAddress(),
      to: "LARKsupport@gmail.com",
      subject: `BOLO Contact Form: ${categoryLabel} from ${name}`,
      html: `
        <h2>New contact form submission</h2>
        <table cellpadding="6" style="font-family:sans-serif;font-size:14px">
          <tr><td><strong>Name</strong></td><td>${htmlEscape(name)}</td></tr>
          <tr><td><strong>Email</strong></td><td>${htmlEscape(email)}</td></tr>
          <tr><td><strong>Category</strong></td><td>${htmlEscape(categoryLabel)}</td></tr>
          <tr><td><strong>User ID</strong></td><td>${userId ?? "(not logged in)"}</td></tr>
          <tr><td><strong>Submitted</strong></td><td>${createdAt.toISOString()}</td></tr>
        </table>
        <h3>Message</h3>
        <p style="font-family:sans-serif;font-size:14px;white-space:pre-wrap">${htmlEscape(message)}</p>
      `,
    });

    if (error) {
      logger.warn({ resendError: error }, "Resend returned an error for contact notification");
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, "Failed to send contact notification via Resend");
    return false;
  }
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
