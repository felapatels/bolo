// THE LEGAL PAGES MUST STAY RENDERABLE WITHOUT A BROWSER.
//
// WHAT THIS FILE CAN AND CANNOT PROVE, and the gap cost a day on 2026-09-07.
// It renders the components and asserts the words are there, which is the half
// that can be checked offline. IT CANNOT SEE THE URL. The emitted file was
// correct, the deploy carried it, and /privacy still served the SPA shell
// because Replit's router resolves exact paths only and never a directory
// index. A build step that must never fail needs a check that CAN, and the only
// check that would have caught this is a no-JS fetch of the LIVE url:
//
//   curl -s https://bolo-india.app/privacy.html | wc -c
//
// naming the exact path being filed with the store rather than the pretty one.
// Run it after every publish that touches these pages.
//
// scripts/prerender-legal.mjs emits dist/public/privacy.html AND
// privacy/index.html (same for terms) at build time so a crawler with no JavaScript sees the
// actual policy instead of the SPA shell. Measured 2026-09-07 before it was
// built: /privacy, /delete-account and a nonsense path all returned the SAME
// 7,972 bytes with the homepage title.
//
// THAT SCRIPT NEVER FAILS THE BUILD, ON PURPOSE, because India is live in both
// stores and a prerender bug must not cost a publish. The cost of that choice
// is that a page which stops rendering under SSR is SKIPPED WITH A WARNING in
// a build log nobody reads, and the pages quietly go back to being shells.
// This suite is what makes that loud: it renders the same components the same
// way, in the same Node environment, and fails here instead.
//
// SO IF THIS BREAKS, THE PRERENDER IS ALREADY BROKEN. Do not mock around it.
// The usual cause is a new hook in the page: anything touching window,
// document, localStorage, Clerk or a data fetch cannot run in Node. Either keep
// the page self-contained or take it out of ROUTES in the script and accept
// that it ships as a shell again.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';

import Privacy from '@/pages/privacy';
import Terms from '@/pages/terms';

// wouter's default location hook reads the browser's `location`, so a bare
// render throws "location is not defined". ssrPath is wouter's own answer and
// it is exactly what the prerender script passes.
const renderAt = (path: string, Page: () => JSX.Element) =>
  renderToStaticMarkup(
    <Router ssrPath={path}>
      <Page />
    </Router>,
  );

describe('the legal pages render without a browser', () => {
  it('renders the privacy policy to real markup', () => {
    const html = renderAt('/privacy', Privacy);
    // The script refuses anything under 500 characters as a failed render.
    // Hold this suite to the same bar so the two cannot disagree.
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('Privacy Policy');
  });

  it('renders the terms to real markup', () => {
    const html = renderAt('/terms', Terms);
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('Terms');
  });

  it('puts the contact address on the terms page, and it is one that receives', () => {
    // The page published support@bolo-india.app until 2026-09-06 and that
    // domain has no MX record, so the contact route on a store-facing page was
    // as dead as the invite reply-to. Prerendering it makes the address visible
    // to a crawler, which is a reason to be sure it is the right one.
    const html = renderAt('/terms', Terms);
    expect(html).toContain('Hello@LarkEnterprisesLLC.com');
    expect(html).not.toContain('support@bolo-india.app');
  });

  it('does not lose the policy text to an empty shell', () => {
    // The symptom this whole change exists to fix: markup that is all chrome
    // and no words. Strip the tags and insist on real prose.
    const text = renderAt('/privacy', Privacy)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    expect(text.length).toBeGreaterThan(2000);
  });
});
