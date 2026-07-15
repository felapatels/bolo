import { ReplitConnectors } from "@replit/connectors-sdk";

// Sends a "download Bolo!" referral email to an address that has no account
// yet. Uses the Resend connector (managed by Replit) so no API key needs to be
// stored in application secrets.
//
// The FROM address can be overridden via INVITE_FROM_EMAIL; it defaults to
// onboarding@resend.dev which works on the Resend free tier without domain
// verification.

const connectors = new ReplitConnectors();

// App Store / TestFlight link — same link used in the store submission assets.
const APP_STORE_URL =
  process.env.APP_STORE_URL ?? "https://apps.apple.com/app/id982107779";

const FROM_EMAIL =
  process.env.INVITE_FROM_EMAIL ?? "onboarding@resend.dev";

const APP_NAME = "Bolo!";

function buildHtml(inviterName: string, appStoreUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFFBF5;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBF5;padding:40px 16px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #E8E0D4;max-width:540px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#FF6B35;padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:40px;">🦜</p>
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
                  <a href="${escapeHtml(appStoreUrl)}"
                     style="display:inline-block;background:#FF6B35;color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:14px;letter-spacing:0.2px;">
                    Download ${APP_NAME} on the App Store →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;font-size:14px;color:#888;line-height:1.5;border-top:1px solid #F0E8DE;padding-top:20px;">
              Can't click the button? Copy this link into your browser:<br>
              <a href="${escapeHtml(appStoreUrl)}" style="color:#FF6B35;word-break:break-all;">${escapeHtml(appStoreUrl)}</a>
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

function buildText(inviterName: string, appStoreUrl: string): string {
  return [
    `Hey there!`,
    ``,
    `${inviterName} wants to practice Indian languages with you on ${APP_NAME} — an app that teaches you Hindi, Gujarati, Bengali, Tamil, and more through real conversation.`,
    ``,
    `Learn together, challenge each other on the leaderboard, and actually start speaking a new language.`,
    ``,
    `Download ${APP_NAME} on the App Store:`,
    appStoreUrl,
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
  const appStoreUrl = APP_STORE_URL;

  const payload = {
    from: `${APP_NAME} <${FROM_EMAIL}>`,
    to: [toEmail],
    subject: `${inviterName} wants to practice Indian languages with you`,
    html: buildHtml(inviterName, appStoreUrl),
    text: buildText(inviterName, appStoreUrl),
  };

  const response = await connectors.proxy(
    "conn_resend_01KXKHKJCCZD0N30PZCPDH0XPX",
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
