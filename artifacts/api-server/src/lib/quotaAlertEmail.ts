import { Resend } from "resend";
import { logger } from "./logger";
import { APP_DOMAIN } from "./appDomain";

// Email alert for low ElevenLabs credits. Recipient and sender are
// env-configurable with sane defaults; sending is best-effort — a failure is
// logged by the caller and never disturbs the TTS path.

const ALERT_TO = process.env.ELEVENLABS_ALERT_EMAIL ?? "aakeshp@gmail.com";
// SUPPORT_EMAIL IS DELIBERATELY NOT USED HERE, and this is the one consumer
// that must not inherit it. This is a `from:`, not a reply_to, and Resend
// sends only from a domain IT has verified. The support address lives on
// larkenterprisesllc.com, which receives but is not verified with Resend, so
// dropping it in here would turn a best-effort alert into a guaranteed
// failure, in the shape that still reads like success in the code.
//
// alerts@ RATHER THAN support@, on the same verified domain. Both send, since
// Resend verifies the DOMAIN and not the mailbox, but support@bolo-india.app
// is an address with no mailbox behind it, and naming it as the sender of a
// robot's alert invited exactly the reply that bounces. Override with
// ELEVENLABS_ALERT_FROM if a verified sender domain ever changes.
const ALERT_FROM =
  process.env.ELEVENLABS_ALERT_FROM ?? `Bolo! <alerts@${APP_DOMAIN}>`;

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) {
    logger.warn(
      "RESEND_API_KEY is not set — ElevenLabs quota alert emails will be skipped",
    );
    return null;
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

export interface QuotaAlertParams {
  characterCount: number;
  characterLimit: number;
  remaining: number;
  /** Unix seconds when credits reset (0 when unknown). */
  resetUnix: number;
}

/**
 * Send the low-credits alert email. Returns true on success, false on any
 * failure (missing key, Resend error). Never throws.
 */
export async function sendQuotaAlertEmail(
  params: QuotaAlertParams,
): Promise<boolean> {
  const client = getResend();
  if (!client) return false;

  const { characterCount, characterLimit, remaining, resetUnix } = params;
  const pct = characterLimit > 0 ? Math.round((remaining / characterLimit) * 100) : 0;
  const resetsAt =
    resetUnix > 0 ? new Date(resetUnix * 1000).toUTCString() : "unknown";
  const exhausted = remaining === 0;

  const subject = exhausted
    ? "Bolo!: ElevenLabs credits EXHAUSTED — audio is on gpt-audio fallback"
    : `Bolo!: ElevenLabs credits low — ${pct}% remaining`;

  const lines = [
    exhausted
      ? "The ElevenLabs monthly character allowance is fully used up."
      : "The ElevenLabs monthly character allowance has dropped to the low-credit threshold.",
    "",
    `Used: ${characterCount.toLocaleString("en-US")} of ${characterLimit.toLocaleString("en-US")} characters`,
    `Remaining: ${remaining.toLocaleString("en-US")} characters (${pct}%)`,
    `Credits reset: ${resetsAt}`,
    "",
    exhausted
      ? "Uncached phrase and chat audio is now synthesized with the lower-fidelity gpt-audio fallback until credits reset or you top up at elevenlabs.io."
      : "When credits run out, uncached phrase and chat audio will fall back to the lower-fidelity gpt-audio voice. Top up or upgrade at elevenlabs.io to avoid the downgrade.",
  ];

  try {
    const { error } = await client.emails.send({
      from: ALERT_FROM,
      to: ALERT_TO,
      subject,
      text: lines.join("\n"),
    });
    if (error) {
      logger.warn({ resendError: error }, "Resend returned an error for ElevenLabs quota alert");
      return false;
    }
    logger.info({ to: ALERT_TO, remaining, pct }, "ElevenLabs low-credit alert email sent");
    return true;
  } catch (err) {
    logger.warn({ err }, "Failed to send ElevenLabs quota alert email");
    return false;
  }
}
