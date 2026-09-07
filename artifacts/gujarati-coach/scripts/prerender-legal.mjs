// PRERENDER THE LEGAL PAGES, so a crawler without JavaScript sees words.
//
// MEASURED BEFORE IT WAS WRITTEN, 2026-09-07. bolo-india.app/privacy,
// /delete-account and a nonsense path all returned the SAME 7,972 bytes with
// the homepage title to a fetch with no JavaScript. Those are real SPA routes
// that render fine once JS runs, and they are URLs handed to app stores.
//
// THE RISK RANKING THAT MADE THIS WORTH BUILDING, and it is not "SEO". Apple
// and Google both fetch a review URL with a real browser engine, so store
// REVIEW was never in danger. Play's data-deletion crawler and its automated
// re-checks are the exposure, and Play's deletion policy makes that URL
// load-bearing rather than decorative.
//
// WHY THIS AND NOT A site/ DIRECTORY. Europe solved the same problem by
// serving a static site from its apex, which works only because Europe has no
// backend there: bolo-europe.app/api/languages answers HTML today. India is
// live and its apex must keep serving the app. Prerendering keeps one origin,
// one router and one copy of the words, and costs a build step.
//
// IT WORKS BECAUSE REAL FILES BEAT THE SPA FALLBACK, checked against
// production rather than assumed: /aksharmala.html returns its own 659KB and
// /robots.txt returns its own 68 bytes, while /manifest.webmanifest falls
// through to index.html because no such file is built. So an emitted
// dist/public/privacy/index.html is served ahead of the catch-all.
//
// THIS SCRIPT MUST NEVER FAIL THE BUILD. It runs after `vite build` in the
// package's build script, and India is live in both stores: a prerender that
// breaks `pnpm build` costs a morning publish to save a crawler. Every failure
// path below warns and exits 0, leaving exactly today's behaviour.
//
// TO ADD A PAGE: put it in ROUTES. It must be a self-contained component with
// no auth, no data fetching and no router state. /delete-account is NOT here
// on purpose: see the note on that constant.
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Router } from 'wouter';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const HERE = import.meta.dirname;
const OUT = path.resolve(HERE, '../dist/public');

// THE PAGES THAT HAVE WORDS TO PRERENDER, and their <title>, which matters more
// than it looks: without it every prerendered page keeps index.html's homepage
// title, which is the exact symptom that made this measurable in the first
// place.
//
// /delete-account IS DELIBERATELY ABSENT. It is not a route in App.tsx at all,
// so it renders the app's own not-found page, and there is no content here to
// prerender. That is a bigger problem than this script solves and it needs a
// page written, not a build step. Do not add it here until it exists.
const ROUTES = [
  { url: '/privacy', module: '/src/pages/privacy.tsx', title: 'Privacy Policy : Bolo!' },
  { url: '/terms', module: '/src/pages/terms.tsx', title: 'Terms of Service : Bolo!' },
];

const warn = (message) => console.warn(`prerender: ${message}`);

/** Swap in a title without disturbing the rest of the head. */
function withTitle(html, title) {
  const escaped = title.replace(/</g, '&lt;').replace(/&/g, '&amp;');
  return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escaped}</title>`);
}

async function main() {
  let template;
  try {
    template = await readFile(path.join(OUT, 'index.html'), 'utf8');
  } catch {
    warn('no dist/public/index.html, so there is nothing to prerender into. Skipped.');
    return;
  }

  if (!template.includes('<div id="root"></div>')) {
    // The anchor moved. Bail rather than guess: a wrong injection point would
    // ship a page with the markup in the wrong place, which is worse than the
    // empty page it replaces because it looks like it worked.
    warn('index.html no longer contains <div id="root"></div>. Skipped.');
    return;
  }

  // Vite in middleware mode gives ssrLoadModule, which applies this project's
  // own transforms, so import.meta.env.BASE_URL and the @/ alias resolve the
  // way they do in the app. That is the whole reason this is a vite server and
  // not an esbuild bundle: esbuild is not a declared dependency here, and a
  // second bundler would be a second set of resolution rules to keep in step.
  let server;
  try {
    server = await createServer({
      configFile: path.resolve(HERE, '../vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'custom',
      logLevel: 'error',
    });
  } catch (error) {
    warn(`could not start vite (${error.message}). Skipped.`);
    return;
  }

  let written = 0;
  try {
    for (const route of ROUTES) {
      try {
        const mod = await server.ssrLoadModule(route.module);
        const Page = mod.default;
        if (typeof Page !== 'function') {
          warn(`${route.module} has no default component export. Skipped.`);
          continue;
        }
        // WRAPPED IN wouter's Router WITH ssrPath, and it is not optional.
        // Both pages render a <Link>, and wouter's default location hook reads
        // the browser's `location` at render time, so a bare
        // renderToStaticMarkup dies with "location is not defined". ssrPath is
        // wouter's own answer to exactly this and it also makes any
        // path-dependent markup render as the real URL rather than as "/".
        const body = renderToStaticMarkup(
          createElement(Router, { ssrPath: route.url }, createElement(Page)),
        );
        if (body.length < 500) {
          // A component that renders almost nothing means the render failed
          // quietly, and a near-empty page is indistinguishable from today's
          // symptom. Refuse it rather than ship it.
          warn(`${route.url} rendered only ${body.length} characters. Skipped.`);
          continue;
        }
        const html = withTitle(template, route.title).replace(
          '<div id="root"></div>',
          `<div id="root">${body}</div>`,
        );
        const dir = path.join(OUT, route.url.replace(/^\//, ''));
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, 'index.html'), html, 'utf8');
        written += 1;
        console.log(`prerender: ${route.url} -> ${path.relative(OUT, path.join(dir, 'index.html'))} (${body.length} chars)`);
      } catch (error) {
        warn(`${route.url} failed (${error.message}). Skipped.`);
      }
    }
  } finally {
    await server.close().catch(() => {});
  }

  if (written === 0) warn('nothing was prerendered. The build is unaffected.');
}

// The app is mounted with createRoot().render(), not hydrateRoot(), so React
// replaces this markup wholesale on load rather than trying to hydrate it.
// There is no mismatch to reconcile and no class of hydration bug to inherit.
main().catch((error) => {
  warn(`unexpected failure (${error.message}). The build is unaffected.`);
});
