import { ReplitConnectors } from "@replit/connectors-sdk";

// Sends a "join my Bolo! family plan" email with the personal invite link.
// Mirrors inviteEmail.ts (Resend connector, same visual template), but the CTA
// is the web join link — family plans are web-managed, not App Store installs.

const connectors = new ReplitConnectors();

// Same env-configured sender as inviteEmail.ts; no hardcoded fallback so a
// missing INVITE_FROM_EMAIL fails loudly instead of sending from the wrong
// address.
function requireFromEmail(): string {
  const from = process.env.INVITE_FROM_EMAIL;
  if (!from) {
    throw new Error(
      "INVITE_FROM_EMAIL is not set — family invite emails cannot be sent. Set it to the verified sender address (e.g. hello@bolo-india.app).",
    );
  }
  return from;
}
const APP_NAME = "Bolo!";

// Mascot image for the email header — hosted on the production web app so it
// renders in all email clients (Gmail strips base64 data URIs).
const MASCOT_IMG_URL = "https://bolo-india.app/mascot/mascot-wave.png";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(inviterName: string, joinUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#FFFBF5;font-family:system-ui,sans-serif;">
  <!-- Preheader: hidden preview text (must stay invisible in the body) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(inviterName)} shared their ${APP_NAME} family plan with you — full Plus access, free.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBF5;padding:40px 16px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #E8E0D4;max-width:540px;width:100%;">
        <tr>
          <td style="background:#FF6B35;padding:32px 40px;text-align:center;">
            <img src="${MASCOT_IMG_URL}" width="72" alt="Bolo! the parrot" style="display:block;margin:0 auto;width:72px;height:auto;border:0;">
            <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:28px;font-weight:800;letter-spacing:-0.5px;">${APP_NAME}</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:15px;">Learn Indian languages, together</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 18px;font-size:17px;color:#1A1A1A;line-height:1.5;">
              Hey there! 👋
            </p>
            <p style="margin:0 0 18px;font-size:16px;color:#3D3D3D;line-height:1.6;">
              <strong>${escapeHtml(inviterName)}</strong> invited you to their <strong>${APP_NAME} family plan</strong> — you get full Plus access (all 22 official Indian languages, unlimited lessons, review & analytics) at no cost to you.
            </p>
            <p style="margin:0 0 28px;font-size:16px;color:#3D3D3D;line-height:1.6;">
              Your progress and streaks stay completely your own — only the plan is shared.
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td align="center" style="padding-bottom:28px;">
                  <a href="${escapeHtml(joinUrl)}"
                     style="display:inline-block;background:#FF6B35;color:#FFFFFF;font-size:16px;font-weight:700;text-decoration:none;padding:16px 36px;border-radius:14px;letter-spacing:0.2px;">
                    Accept your seat →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:14px;color:#888;line-height:1.5;border-top:1px solid #F0E8DE;padding-top:20px;">
              Can't click the button? Copy this link into your browser:<br>
              <a href="${escapeHtml(joinUrl)}" style="color:#FF6B35;word-break:break-all;">${escapeHtml(joinUrl)}</a>
            </p>
          </td>
        </tr>
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

function buildText(inviterName: string, joinUrl: string): string {
  return [
    `Hey there!`,
    ``,
    `${inviterName} invited you to their ${APP_NAME} family plan — full Plus access (all 22 official Indian languages, unlimited lessons, review & analytics) at no cost to you.`,
    ``,
    `Your progress and streaks stay completely your own — only the plan is shared.`,
    ``,
    `Accept your seat:`,
    joinUrl,
    ``,
    `You received this because ${inviterName} entered your email in ${APP_NAME}. If you didn't expect this, you can safely ignore it.`,
  ].join("\n");
}

export async function sendFamilyInviteEmail(opts: {
  inviterName: string;
  toEmail: string;
  joinUrl: string;
}): Promise<void> {
  // Tests skip the network call the same way friend invites do.
  if (process.env.SKIP_INVITE_EMAIL === "1") return;

  const payload = {
    from: `${APP_NAME} <${requireFromEmail()}>`,
    to: [opts.toEmail],
    subject: `${opts.inviterName} invited you to their ${APP_NAME} family plan`,
    html: buildHtml(opts.inviterName, opts.joinUrl),
    text: buildText(opts.inviterName, opts.joinUrl),
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
    throw new Error(
      `Resend rejected the family invite email (${response.status}): ${body}`,
    );
  }
}
