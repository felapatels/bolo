// The web twin of api-server/src/lib/appDomain.ts. Same names, same values,
// separate packages: the two cannot import from each other, so the one string
// is duplicated the way every other web/mobile twin in this repo is.
//
// If you change SUPPORT_EMAIL here, change it there in the same commit.

/** The domain this app is served from, and the one Resend has verified. */
export const APP_DOMAIN = 'bolo-india.app' as const;

/**
 * WHERE A REPLY GOES, and the address the Terms page publishes.
 *
 * It replaced support@bolo-india.app, which bounced: the domain publishes SPF
 * and a resend._domainkey record so it SENDS, but it has no MX record, so
 * nothing can be delivered to it. Owner's ruling, 2026-09-06.
 *
 * NOT A SENDING ADDRESS. larkenterprisesllc.com is not verified with Resend;
 * it receives (three Cloudflare Email Routing MX records) and that is all this
 * is for. And note the LLC: larkenterprises.com without it is a different
 * domain with no MX, which is the same bug with a better name.
 */
export const SUPPORT_EMAIL = 'Hello@LarkEnterprisesLLC.com' as const;
