import { useEffect } from 'react';

// Lightweight per-page head metadata for the PUBLIC marketing surface.
//
// Mechanism: this is a client-rendered SPA, so head tags are managed at
// runtime from React (no SSR, no react-helmet dependency). index.html ships
// the site-wide defaults; DocumentHead swaps them per page on mount and other
// pages overwrite them on their own mount. Crawlers that execute JS (Google)
// see the per-page values; the static defaults in index.html remain the
// no-JS fallback.
//
// SITE_ORIGIN is the production domain used for canonical/OG URLs and the
// sitemap. It is a functional URL constant (like the support addresses), not
// marketing prose; the standing rule against hardcoding the domain applies to
// copy, not to canonical link targets.
export const SITE_ORIGIN = 'https://bolo-india.app';

interface HeadProps {
  /** Full document title, e.g. "Learn to speak Gujarati | Bolo!" */
  title: string;
  description: string;
  /** Path portion of the canonical URL, e.g. "/languages/gujarati". */
  canonicalPath: string;
  /** Absolute image URL for OG/Twitter cards. Defaults to the mascot card. */
  image?: string;
}

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/** Apply the full head-tag set for a public page. Safe to call repeatedly. */
export function applyDocumentHead({ title, description, canonicalPath, image }: HeadProps) {
  const canonical = `${SITE_ORIGIN}${canonicalPath}`;
  const img = image ?? `${SITE_ORIGIN}/mascot/mascot-cheer.png`;
  document.title = title;
  setMeta('name', 'description', description);
  setCanonical(canonical);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:url', canonical);
  setMeta('property', 'og:image', img);
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setMeta('name', 'twitter:image', img);
}

/** React hook wrapper: sets the head tags on mount and when inputs change. */
export function useDocumentHead(props: HeadProps) {
  useEffect(() => {
    applyDocumentHead(props);
    // Individual fields, so a per-language page updates when the slug changes.
  }, [props.title, props.description, props.canonicalPath, props.image]);
}

const JSONLD_ID = 'bolo-structured-data';

/**
 * Inject (or replace) the homepage JSON-LD structured data:
 * Organization + SoftwareApplication, per Story 6.3.
 */
export function useHomepageStructuredData() {
  useEffect(() => {
    const data = [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Bolo!',
        url: SITE_ORIGIN,
        logo: `${SITE_ORIGIN}/mascot/mascot-wave.png`,
        description:
          'Bolo! is a speaking-first app for learning South Asian languages out loud, with instant pronunciation coaching.',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'Bolo!',
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Web, iOS',
        url: SITE_ORIGIN,
        description:
          'Speak South Asian languages out loud and get coached on the spot. 22 languages, chat with Bolo the parrot, a journey map, games, and spaced review.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
          description: 'Free to start; optional All-Access and Family subscriptions.',
        },
      },
    ];
    let el = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement('script');
      el.type = 'application/ld+json';
      el.id = JSONLD_ID;
      document.head.appendChild(el);
    }
    el.textContent = JSON.stringify(data);
    return () => {
      // Structured data is homepage-only; remove it when leaving the page.
      document.getElementById(JSONLD_ID)?.remove();
    };
  }, []);
}
