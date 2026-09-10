/**
 * THE CANONICAL TAG MUST NAME THIS FORK'S OWN DOMAIN, NEVER THE PARENT'S.
 *
 * Why this is a test rather than a comment. `SITE_ORIGIN` builds the canonical
 * link, `og:url`, `og:image`, `twitter:image` and the JSON-LD `url` for every
 * PUBLIC page. When it names another fork's domain:
 *
 *   - every public page tells search engines this site is a DUPLICATE of that
 *     one, which is a request to be de-indexed in favour of it;
 *   - every shared link previews with that fork's URL;
 *   - every social preview HOTLINKS that fork's server for the image.
 *
 * THIS IS HARDENING, NOT A REPAIR, AND THE DISTINCTION IS ON THE RECORD BECAUSE
 * I GOT IT WRONG FIRST. India hardcoded `https://bolo-india.app` here, and I
 * concluded from that alone that all five forks carried the same string. They do
 * not: every fork edited this constant at fork time and every live canonical,
 * og:url and og:image already names its own domain. Measured across all five,
 * 2026-09-10. No site was ever asking to be de-indexed.
 *
 * The guard still earns its place. A per-fork `APP_DOMAIN` that no file imports,
 * sitting beside a hardcoded duplicate of itself, is a hazard even while every
 * current value happens to match: THE NEXT FORK IS THE ONE THAT GETS IT WRONG,
 * and a value that must be remembered at fork time will eventually not be.
 */
import { describe, it, expect } from 'vitest';
import { SITE_ORIGIN } from '@/lib/seo';
import { APP_DOMAIN } from '@/lib/appDomain';

describe('SITE_ORIGIN', () => {
  it('is derived from this fork\'s own APP_DOMAIN', () => {
    expect(SITE_ORIGIN).toBe(`https://${APP_DOMAIN}`);
  });

  it('is a bare https origin with no path and no trailing slash', () => {
    // Callers append `${SITE_ORIGIN}${canonicalPath}`, so a trailing slash
    // silently produces "//languages/gujarati" in every canonical URL.
    expect(SITE_ORIGIN).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    expect(SITE_ORIGIN.endsWith('/')).toBe(false);
  });

  it('does not name a sibling fork', () => {
    // The specific regression. A fork that hardcodes any of these is publishing
    // another fork's identity on its own public pages. This list is deliberately
    // ALL SIX: whichever tree this runs in, the other five are wrong for it, and
    // the check above already pins the right one.
    const siblings = [
      'bolo-india.app',
      'bolo-sea.app',
      'bolo-east.app',
      'bolo-europe.app',
      'bolo-africa.app',
      'bolo-latam.app',
    ].filter((d) => d !== APP_DOMAIN);
    for (const d of siblings) {
      expect(SITE_ORIGIN).not.toContain(d);
    }
    // Non-vacuity: if the filter ever empties, this test proves nothing.
    expect(siblings.length).toBe(5);
  });
});
