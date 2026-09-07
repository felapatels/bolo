// The app's own domain, and the address a human can actually write to.
//
// India had neither of these as constants until 2026-09-06: every consumer
// hardcoded its own copy of the support address. The four forks already
// carry an appDomain.ts, so this file exists under that name, with those
// export names, so a cherry-pick between the five lines up instead of
// conflicting. The web twin is gujarati-coach/src/lib/appDomain.ts.

/** The domain this app is served from, and the one Resend has verified. */
export const APP_DOMAIN = "bolo-india.app" as const;

/**
 * WHERE A REPLY GOES, and nothing else.
 *
 * THIS IS NOT A SENDING ADDRESS. Every consumer below uses it as reply_to or
 * as text a human reads. Resend sends only from a domain IT has verified, and
 * larkenterprisesllc.com is not one, so putting this in a `from:` turns a send
 * into a guaranteed failure that still reads like success in the code. See
 * quotaAlertEmail.ts, which deliberately does not use it.
 *
 * IT REPLACED support@bolo-india.app, WHICH BOUNCED, and had bounced in
 * production for as long as invites have existed: bolo-india.app publishes SPF
 * and a resend._domainkey record, so it SENDS, but it has no MX record at all,
 * so nothing can be delivered to it. Every parent who ever received a family
 * invite, hit Reply and asked a question was writing into a void. Owner's
 * ruling, 2026-09-06.
 *
 * larkenterprisesllc.com publishes three Cloudflare Email Routing MX records
 * (route1/2/3.mx.cloudflare.net) and v=spf1 include:_spf.mx.cloudflare.net
 * ~all, which is why this one is different from the address it replaced.
 *
 * TYPO WARNING, AND IT IS AN EASY ONE. larkenterprises.com, WITHOUT the LLC,
 * is a different domain with no MX and no SPF. Dropping three letters here
 * ships the identical bug wearing a better name.
 */
export const SUPPORT_EMAIL = "Hello@LarkEnterprisesLLC.com" as const;
