// Emit exact .html paths because Replit does not resolve directory indexes.
// Render the same component as the app, with metadata present before JS runs.
import { createServer } from 'vite';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Router } from 'wouter';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'dist/public');
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const template = await readFile(path.join(out, 'index.html'), 'utf8');
if (!template.includes('<div id="root"></div>')) throw new Error('Missing root for language prerender');
const server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });
try {
  const { LANGUAGE_PAGES } = await server.ssrLoadModule('/src/lib/languagePages.ts');
  const { SITE_ORIGIN } = await server.ssrLoadModule('/src/lib/seo.ts');
  const { LanguagePage, languageMetadata } = await server.ssrLoadModule('/src/pages/learn-language.tsx');
  await mkdir(path.join(out, 'languages'), { recursive: true });
  for (const lang of LANGUAGE_PAGES) {
    const meta = languageMetadata(lang);
    const url = SITE_ORIGIN + meta.canonicalPath;
    const body = renderToStaticMarkup(createElement(Router, { ssrPath: meta.canonicalPath }, createElement(LanguagePage, { lang })));
    if (!body.includes(escape(lang.name)) || body.length < 1000) throw new Error(`Incomplete render for ${lang.slug}`);
    let html = template.replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(meta.title)}</title>`);
    // Replace inherited homepage metadata rather than adding conflicting tags.
    html = html.replace(/<meta\b[^>]*(?:name|property)=["'](?:description|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '')
      .replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi, '')
      .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, '');
    const tags = `<meta name="description" content="${escape(meta.description)}" /><link rel="canonical" href="${escape(url)}" /><meta property="og:title" content="${escape(meta.title)}" /><meta property="og:description" content="${escape(meta.description)}" /><meta property="og:url" content="${escape(url)}" /><meta property="og:type" content="website" /><meta property="og:image" content="${SITE_ORIGIN}/mascot/mascot-cheer.png" /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content="${escape(meta.title)}" /><meta name="twitter:description" content="${escape(meta.description)}" /><meta name="twitter:image" content="${SITE_ORIGIN}/mascot/mascot-cheer.png" />`;
    html = html.replace('</head>', `${tags}</head>`).replace('<div id="root"></div>', `<div id="root">${body}</div>`);
    await writeFile(path.join(out, 'languages', `${lang.slug}.html`), html);
  }
  console.log(`Prerendered ${LANGUAGE_PAGES.length} language pages with unique metadata.`);
} finally {
  await server.close();
}
