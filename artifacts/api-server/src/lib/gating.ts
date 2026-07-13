import type { Request, Response } from "express";
import {
  featuresForPlan,
  isLanguageAllowed,
  upgradeRequired,
  type PlanFeatures,
  type UpgradeRequiredPayload,
} from "./entitlements";
import type { EntitledRequest } from "../middlewares/loadEntitlements";

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

// If the caller's plan can't access `lang`, sends the 402 and returns true so
// the handler can `if (denyLockedLanguage(...)) return;` and stop.
export function denyLockedLanguage(
  req: Request,
  res: Response,
  lang: string,
): boolean {
  const { plan } = (req as EntitledRequest).resolvedPlan;
  if (isLanguageAllowed(plan, lang)) return false;
  sendUpgradeRequired(
    res,
    upgradeRequired(
      "language_locked",
      "Bolo! Plus unlocks every language. Upgrade to learn this one.",
      "allLanguages",
    ),
  );
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
