// Server-side funnel events: trial_started and subscription_started.
//
// Owner analytics audit, 2026-09-16. Neither client can see these honestly: a
// trial or a subscription is only real once the STORE says so, and the store
// talks to this server (RevenueCat for iOS and Android, Stripe for web), never
// to the app. So the events fire from the two webhooks, keyed on the Clerk user
// id the clients already identify with, which joins them to the same PostHog
// person as the client events.
//
// The mappers are pure and pinned in posthogCapture.test.ts. The send is
// fire-and-forget: analytics must never fail or slow a billing webhook, and a
// webhook retry must not double count, so every capture carries a uuid derived
// from the store's own event id and the store's own timestamp (PostHog
// deduplicates on those).

import { createHash } from "node:crypto";
import type Stripe from "stripe";

import { logger } from "./logger";
import type { RevenueCatEvent } from "./revenuecatSync";

// WHICH APP THIS IS. The same value the web and mobile clients register
// (analytics.ts in both), because all six BOLO apps share one PostHog project.
export const APP_ID = "bolo-india";

const HOST = process.env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

export type ServerFunnelEvent = "trial_started" | "subscription_started";

export interface FunnelCapture {
  event: ServerFunnelEvent;
  distinctId: string;
  // Stable per store event, so a webhook retry is the same capture.
  sourceEventId: string;
  timestamp: Date;
  properties: Record<string, string | number | boolean>;
}

const REVENUECAT_PLATFORM: Record<string, string> = {
  APP_STORE: "ios",
  MAC_APP_STORE: "ios",
  PLAY_STORE: "android",
  STRIPE: "web",
};

/**
 * RevenueCat to a funnel event, or null. INITIAL_PURCHASE on a TRIAL period is
 * a trial; INITIAL_PURCHASE on any other period is a straight subscription; a
 * RENEWAL flagged is_trial_conversion is the trial turning into money. Every
 * other event (renewals, cancellations, Chai packs) is not a funnel step.
 */
export function funnelFromRevenueCat(event: RevenueCatEvent): FunnelCapture | null {
  const userId = event.app_user_id?.trim();
  if (!userId || !event.id) return null;

  let name: ServerFunnelEvent;
  let convertedFromTrial = false;
  if (event.type === "INITIAL_PURCHASE") {
    name = event.period_type === "TRIAL" ? "trial_started" : "subscription_started";
  } else if (event.type === "RENEWAL" && event.is_trial_conversion) {
    name = "subscription_started";
    convertedFromTrial = true;
  } else {
    return null;
  }

  const properties: Record<string, string | number | boolean> = {
    source: "revenuecat",
    platform: REVENUECAT_PLATFORM[event.store ?? ""] ?? "unknown",
    period_type: event.period_type ?? "unknown",
    converted_from_trial: convertedFromTrial,
  };
  if (event.store) properties.store = event.store;
  if (event.product_id) properties.product_id = event.product_id;
  const entitlement = event.entitlement_ids?.[0] ?? event.entitlement_id;
  if (entitlement) properties.entitlement = entitlement;
  if (typeof event.price === "number") properties.price = event.price;
  if (event.currency) properties.currency = event.currency;
  if (event.environment) properties.store_environment = event.environment;

  return {
    event: name,
    distinctId: userId,
    sourceEventId: `revenuecat:${event.id}`,
    timestamp: new Date(event.event_timestamp_ms ?? Date.now()),
    properties,
  };
}

/**
 * Stripe to a funnel event, or null. A subscription CREATED trialing is a
 * trial and created active is a straight subscription; an UPDATE whose
 * previous status was trialing and whose status is now active is the
 * conversion. The user id comes from the same metadata stripeSync.ts reads.
 */
export function funnelFromStripe(event: Stripe.Event): FunnelCapture | null {
  if (
    event.type !== "customer.subscription.created" &&
    event.type !== "customer.subscription.updated"
  ) {
    return null;
  }
  const sub = event.data.object as Stripe.Subscription;
  const userId = sub.metadata?.userId?.trim();
  if (!userId) return null;

  let name: ServerFunnelEvent;
  let convertedFromTrial = false;
  if (event.type === "customer.subscription.created") {
    if (sub.status === "trialing") name = "trial_started";
    else if (sub.status === "active") name = "subscription_started";
    else return null;
  } else {
    const previous = event.data.previous_attributes as Partial<Stripe.Subscription> | undefined;
    if (previous?.status !== "trialing" || sub.status !== "active") return null;
    name = "subscription_started";
    convertedFromTrial = true;
  }

  const price = sub.items?.data?.[0]?.price;
  const properties: Record<string, string | number | boolean> = {
    source: "stripe",
    platform: "web",
    store: "STRIPE",
    converted_from_trial: convertedFromTrial,
  };
  if (sub.metadata?.plan) properties.plan = sub.metadata.plan;
  if (price?.id) properties.product_id = price.id;
  if (typeof price?.unit_amount === "number") properties.price = price.unit_amount / 100;
  if (price?.currency) properties.currency = price.currency.toUpperCase();

  return {
    event: name,
    distinctId: userId,
    sourceEventId: `stripe:${event.id}`,
    timestamp: new Date(event.created * 1000),
    properties,
  };
}

/** A deterministic UUID from the store event id, so a retry deduplicates. */
export function captureUuid(sourceEventId: string, event: ServerFunnelEvent): string {
  const h = createHash("sha256").update(`${event}:${sourceEventId}`).digest("hex");
  // Shaped as a version 4 style UUID (PostHog validates the format only).
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** The capture API body. Pure, so the wire shape is pinned too. */
export function captureBody(apiKey: string, capture: FunnelCapture) {
  return {
    api_key: apiKey,
    event: capture.event,
    distinct_id: capture.distinctId,
    uuid: captureUuid(capture.sourceEventId, capture.event),
    timestamp: capture.timestamp.toISOString(),
    properties: {
      app: APP_ID,
      environment: "production",
      ...capture.properties,
    },
  };
}

/**
 * Sends only from a Replit DEPLOYMENT: the dev Repl, the Mac and every test
 * run have no REPLIT_DEPLOYMENT, so none of them can put a fake trial into the
 * shared project. The key is the public, write-only project key the web build
 * already carries (VITE_POSTHOG_KEY in .replit); POSTHOG_KEY overrides it.
 */
export function sendFunnelEvent(capture: FunnelCapture | null): void {
  if (!capture) return;
  if (process.env.REPLIT_DEPLOYMENT !== "1") return;
  const apiKey = (process.env.POSTHOG_KEY ?? process.env.VITE_POSTHOG_KEY)?.trim();
  if (!apiKey) return;
  void fetch(`${HOST}/i/v0/e/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(captureBody(apiKey, capture)),
    signal: AbortSignal.timeout(5000),
  })
    .then((res) => {
      if (!res.ok) {
        logger.warn({ status: res.status, event: capture.event }, "PostHog funnel capture rejected");
      }
    })
    .catch((err) => {
      logger.warn({ err, event: capture.event }, "PostHog funnel capture failed");
    });
}
