import { ReplitConnectors } from "@replit/connectors-sdk";

// Sends a "download Bolo!" referral email to an address that has no account
// yet. Uses the Resend connector (managed by Replit) so no API key needs to be
// stored in application secrets.
//
// The FROM address MUST be configured via INVITE_FROM_EMAIL (e.g.
// hello@bolo-india.app — the bolo-india.app domain is verified with Resend).
// There is deliberately no hardcoded fallback: a missing value fails loudly
// at send time instead of silently sending from the wrong address.

const connectors = new ReplitConnectors();

// Invite CTA destination. The iOS App Store listing is not live yet, so the
// CTA points at the web app; at iOS launch, flip INVITE_CTA_URL to the App
// Store link — no code change needed. The default is the always-safe web URL.
const INVITE_CTA_URL =
  process.env.INVITE_CTA_URL ?? "https://bolo-india.app";

// Mascot image for the email header — hosted on the production web app so it
// renders in all email clients (Gmail strips base64 data URIs).
const MASCOT_IMG_URL = "https://bolo-india.app/mascot/mascot-wave.png";

function requireFromEmail(): string {
  const from = process.env.INVITE_FROM_EMAIL;
  if (!from) {
    throw new Error(
      "INVITE_FROM_EMAIL is not set — invite emails cannot be sent. Set it to the verified sender address (e.g. hello@bolo-india.app).",
    );
  }
  return from;
}

const APP_NAME = "Bolo!";

function buildHtml(inviterName: string, ctaUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFFBF5;font-family:system-ui,sans-serif;">
  <!-- Preheader: hidden preview text (must stay invisible in the body) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(inviterName)} invited you to learn Indian languages together on ${APP_NAME}.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBF5;padding:40px 16px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #E8E0D4;max-width:540px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#FF6B35;padding:32px 40px;text-align:center;">
            <img src="${MASCOT_IMG_URL}" width="72" alt="Bolo! the parrot" style="display:block;margin:0 auto;width:72px;height:auto;border:0;">
            <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:28px;font-weight:800;letter-spacing:-0.5px;">${APP_NAME}</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Learn Indian languages, together</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 18px;font-size:17px;color:#1A1A1A;line-height:1.5;">
              Hey there! 👋
            </p>
            <p style="margin:0 0 18px;font-size:16px;color:#3D3D3D;line-height:1.6;">
              <strong>${escapeHtml(inviterName)}</strong> wants to practice Indian languages with you on <strong>${APP_NAME}</strong> — an app that teaches you Hindi, Gujarati, Bengali, Tamil, and more through real conversation.
            </p>
            <p style="margin:0 0 28px;font-size:16px;color:#3D3D3D;line-height:1.6;">
              Learn together, challenge each other on the leaderboard, and actually start speaking a new language.
            </p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding-bottom:28px;">
                  <a href="${escapeHtml(ctaUrl)}"
                     style="display:inline-block;background:#FF6B35;color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:14px;letter-spacing:0.2px;">
                    Start learning at bolo-india.app →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:14px;color:#888;line-height:1.5;border-top:1px solid #F0E8DE;padding-top:20px;">
              Can't click the button? Copy this link into your browser:<br>
              <a href="${escapeHtml(ctaUrl)}" style="color:#FF6B35;word-break:break-all;">${escapeHtml(ctaUrl)}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#F9F4EE;padding:20px 40px;text-align:center;border-top:1px solid #E8E0D4;">
            <p style="margin:0;font-size:12px;color:#AAA;line-height:1.6;">
              You received this because ${escapeHtml(inviterName)} entered your email in ${APP_NAME}.<br>
              If you didn't expect this, you can safely ignore it.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildText(inviterName: string, ctaUrl: string): string {
  return [
    `Hey there!`,
    ``,
    `${inviterName} wants to practice Indian languages with you on ${APP_NAME} — an app that teaches you Hindi, Gujarati, Bengali, Tamil, and more through real conversation.`,
    ``,
    `Learn together, challenge each other on the leaderboard, and actually start speaking a new language.`,
    ``,
    `Start learning ${APP_NAME} on the web:`,
    ctaUrl,
    ``,
    `You received this because ${inviterName} entered your email in ${APP_NAME}. If you didn't expect this, you can safely ignore it.`,
  ].join("\n");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendFriendInviteEmail(opts: {
  inviterName: string;
  toEmail: string;
}): Promise<void> {
  // Allow tests to skip the actual network call by setting SKIP_INVITE_EMAIL=1.
  if (process.env.SKIP_INVITE_EMAIL === "1") return;

  const { inviterName, toEmail } = opts;

  const payload = {
    from: `${APP_NAME} <${requireFromEmail()}>`,
    to: [toEmail],
    subject: `${inviterName} wants to practice Indian languages with you`,
    html: buildHtml(inviterName, INVITE_CTA_URL),
    text: buildText(inviterName, INVITE_CTA_URL),
    reply_to: "support@bolo-india.app",
  };

  const response = await connectors.proxy(
    "resend",
    "/emails",
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "(unreadable)");
    throw new Error(`Resend rejected the invite email (${response.status}): ${body}`);
  }
}
