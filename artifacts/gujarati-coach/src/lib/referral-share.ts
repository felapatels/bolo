// The ONE web share invocation for a referral link (Task #1049).
//
// Two surfaces now hand out the same link, the settings "Invite friends" card
// and the compact card at the bottom of home, so the share text and the
// native-share call live here rather than being written twice. The link itself
// comes from @workspace/referral-link via lib/referral-code.

import { REFERRAL_REWARD_CHAI } from "@workspace/referral-link";

/** The message that rides along with the link in the share sheet. */
export function referralShareText(): string {
  return `Learn your family's language with me on Bolo! Use my link and we both get ${REFERRAL_REWARD_CHAI} Chai.`;
}

/** Copies the link. Resolves false when the clipboard is unavailable. */
export async function copyReferralLink(link: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(link);
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens the browser's share sheet with the referral link.
 *
 * @param fallback Runs instead when the browser has no share sheet at all
 *                 (desktop Firefox, older Chrome), the caller decides what
 *                 consolation it offers, because the settings card has a
 *                 "Copied!" affordance and home does not.
 */
export async function shareReferralLink(
  link: string,
  fallback?: () => void | Promise<void>,
): Promise<void> {
  if (!navigator.share) {
    await fallback?.();
    return;
  }
  try {
    await navigator.share({ text: referralShareText(), url: link });
  } catch {
    // A dismissed share sheet is not an error.
  }
}
