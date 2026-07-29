import type { Request, Response } from "express";
import {
  featuresForPlan,
  isLanguageAllowed,
  upgradeRequired,
  type PlanFeatures,
  type UpgradeRequiredPayload,
} from "./entitlements";
import type { EntitledRequest } from "../middlewares/loadEntitlements";
import {
  countTeaserConsumed,
  getTeaserPhraseIds,
  TEASER_LIMIT,
} from "./teaser";

// The server rejects gated Free actions with 402 Payment Required plus a
// structured UpgradeRequiredPayload, so clients can distinguish "you must
// upgrade" from auth (401) or generic (403/404) errors and render a paywall.
export const UPGRADE_REQUIRED_STATUS = 402;

export function sendUpgradeRequired(
  res: Response,
  payload: UpgradeRequiredPayload,
): void {
  res.status(UPGRADE_REQUIRED_STATUS).json(payload);
}

// ---------------------------------------------------------------------------
// M1 three-state language access: allowed (plan covers the language), teaser
// (locked, fewer than TEASER_LIMIT distinct teaser phrases attempted), or
// exhausted (locked, all teaser phrases attempted). The attempts query runs
// ONLY on the locked branch — allowed languages keep their existing
// synchronous cost.
// ---------------------------------------------------------------------------
export type LanguageAccess =
  | { state: "allowed" }
  // A locked language with no teaser set (no Greetings group 1 — e.g. test
  // fixtures): plain standard-locked behavior, no teaser progress reported.
  | { state: "locked" }
  | { state: "teaser" | "exhausted"; consumed: number; teaserPhraseIds: number[] };

export async function getLanguageAccess(
  req: Request,
  lang: string,
): Promise<LanguageAccess> {
  const { plan, chosenLanguage } = (req as EntitledRequest).resolvedPlan;
  if (isLanguageAllowed(plan, lang, chosenLanguage)) return { state: "allowed" };
  const teaserPhraseIds = await getTeaserPhraseIds(lang);
  if (teaserPhraseIds.length === 0) return { state: "locked" };
  const userId = (req as EntitledRequest).userId;
  const consumed = await countTeaserConsumed(userId, lang, teaserPhraseIds);
  return {
    state: consumed < TEASER_LIMIT ? "teaser" : "exhausted",
    consumed,
    teaserPhraseIds,
  };
}

// Builds and sends the 402 for a locked-language denial. The upgrade target
// depends on where the caller stands: a Free user can unlock a single language
// with the middle tier ($6.99), while a One-Language user (who has already
// spent their one choice) needs all-access Plus to open another. Both teaser
// and exhausted states carry teaser progress so clients can show what's left.
export function sendLockedLanguageDenial(
  req: Request,
  res: Response,
  access: Exclude<LanguageAccess, { state: "allowed" }>,
): void {
  const { plan } = (req as EntitledRequest).resolvedPlan;
  const requiredPlan = plan === "free" ? "one_language" : "plus";
  const payload =
    access.state === "exhausted"
      ? upgradeRequired(
          "teaser_exhausted",
          "You've tried your free phrases in this language. Upgrade to keep learning it.",
          "allLanguages",
          requiredPlan,
        )
      : upgradeRequired(
          "language_locked",
          requiredPlan === "one_language"
            ? "This language is a paid unlock. Upgrade to start learning it."
            : "Bolo! Plus unlocks every language. Upgrade to learn this one too.",
          "allLanguages",
          requiredPlan,
        );
  // Teaser progress rides along on both teaser and exhausted denials; a plain
  // locked language (no teaser set) keeps the pre-M1 payload exactly.
  if (access.state !== "locked") {
    payload.teaser = {
      consumed: Math.min(access.consumed, TEASER_LIMIT),
      limit: TEASER_LIMIT,
    };
  }
  sendUpgradeRequired(res, payload);
}

// If the caller's plan can't access `lang`, sends the 402 and returns true so
// the handler can `if (await denyLockedLanguage(...)) return;` and stop.
// Teaser exception: when `teaserPhraseId` names a phrase inside the caller's
// teaser set and the teaser isn't exhausted, access is granted — this is how
// the phrase-scoped routes (GET /phrases/:id, POST /attempts) let exactly the
// TEASER_LIMIT canonical phrases through with the full pipeline.
export async function denyLockedLanguage(
  req: Request,
  res: Response,
  lang: string,
  opts?: { teaserPhraseId?: number | null },
): Promise<boolean> {
  const access = await getLanguageAccess(req, lang);
  if (access.state === "allowed") return false;
  if (
    access.state === "teaser" &&
    opts?.teaserPhraseId != null &&
    access.teaserPhraseIds.includes(opts.teaserPhraseId)
  ) {
    return false;
  }
  sendLockedLanguageDenial(req, res, access);
  return true;
}

// If the caller's plan lacks a Plus-only feature, sends the 402 and returns
// true. Used to gate review sessions and advanced analytics.
export function denyLockedFeature(
  req: Request,
  res: Response,
  feature: keyof PlanFeatures,
  message: string,
): boolean {
  const { plan } = (req as EntitledRequest).resolvedPlan;
  if (featuresForPlan(plan)[feature]) return false;
  sendUpgradeRequired(res, upgradeRequired("feature_locked", message, feature));
  return true;
}
