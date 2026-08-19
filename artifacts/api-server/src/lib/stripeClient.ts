// Stripe client + credentials.
//
// NOTE: We intentionally do NOT use the Replit Stripe connector here. In this
// environment the connector's credential-listing endpoint returns no
// connection and its request proxy misroutes (it does not reach api.stripe.com),
// so both the raw-secret-fetch and proxy patterns fail. Instead we read the
// Stripe secret key + webhook signing secret directly from Replit Secrets
// (STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET). See
// .agents/memory/stripe-connector-broken.md for the full diagnosis.
//
// Unlike the RevenueCat connector (best-effort, degrades to null), Stripe
// checkout/portal/webhook calls are the primary path for real money, callers
// should let failures here propagate (502/500) rather than silently no-op.

import Stripe from "stripe";

function getSecretKey(): string {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it via Replit Secrets before using " +
        "Stripe checkout/portal.",
    );
  }
  return secretKey;
}

// Returns a fresh authenticated Stripe client. Not cached so a rotated key is
// picked up without a restart.
export async function getUncachableStripeClient(): Promise<Stripe> {
  return new Stripe(getSecretKey());
}

// The signing secret for the webhook endpoint, used to verify incoming webhook
// payloads. Empty string when unset (dev-only: signature verification is then
// skipped in the webhook handler).
export async function getStripeWebhookSecret(): Promise<string> {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
}
