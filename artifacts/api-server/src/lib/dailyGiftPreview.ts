// Exact authenticated Clerk ID supplied by the owner for visual gift review.
// This is an identity allowlist, not a credential or a client-provided value.
const GIFT_PREVIEW_USER_ID = "user_3HBsmeNhc3jxT6rCH1WXI4R0Ykv";

/** Skip only the completed-stop prerequisite for the owner’s dev account.
 * The daily ledger claim, gift draw, and actual wallet grant remain unchanged.
 */
export function canPreviewDailyGift(userId: string): boolean {
  return userId === GIFT_PREVIEW_USER_ID;
}
