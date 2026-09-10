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
 * It was hardcoded to `https://bolo-india.app` in all six trees, under a comment
 * arguing that canonical targets were exempt from the no-hardcoded-domain rule.
 * True in one app, false in a fleet.
 *
 * `APP_DOMAIN` in ./appDomain is the per-fork constant and is already correct
 * in every tree, which is why the fix is one line and cherry-picks cleanly.
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
