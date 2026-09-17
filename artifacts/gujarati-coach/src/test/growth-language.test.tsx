import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { growthSignupHref, GROWTH_PAGES, type GrowthLanguage } from '@/lib/growth-pages';

const state = vi.hoisted(() => ({ signedIn: false, track: vi.fn() }));
vi.mock('@clerk/react', () => ({ useUser: () => ({ isSignedIn: state.signedIn }) }));
vi.mock('@/lib/analytics', async () => ({
  ...(await vi.importActual<typeof import('@/lib/analytics')>('@/lib/analytics')),
  track: state.track,
}));
import GrowthLanguagePage from '@/pages/growth-language';
import { ANALYTICS_EVENTS } from '@/lib/analyticsEvents';

beforeEach(() => { state.signedIn = false; state.track.mockClear(); });

function show(slug: GrowthLanguage, query = '') {
  const { hook, searchHook } = memoryLocation({ path: `/${slug}${query}` });
  return render(<Router hook={hook} searchHook={searchHook}><GrowthLanguagePage slug={slug} /></Router>);
}

describe('growth landing pages', () => {
  it.each(['gujarati', 'punjabi', 'hindi'] as const)('%s has distinct copy, canonical and real screenshots', slug => {
    show(slug);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(GROWTH_PAGES[slug].headline);
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `https://bolo-india.app/${slug}`);
    expect(screen.getAllByRole('img', { name: /Real Bolo/ })).toHaveLength(4);
    expect(screen.getByRole('link', { name: new RegExp(`^${slug}$`, 'i') })).toHaveAttribute('aria-current', 'page');
    for (const link of screen.getAllByRole('link', { name: 'Download on the App Store' })) {
      expect(link).toHaveAttribute('href', 'https://apps.apple.com/app/id6790907772');
    }
    expect(screen.getAllByRole('link', { name: 'Download on the App Store' })).toHaveLength(2);
    for (const link of screen.getAllByRole('link', { name: 'Get it on Google Play' })) {
      expect(link).toHaveAttribute('href', 'https://play.google.com/store/apps/details?id=com.bolo.mobile');
    }
    expect(screen.getAllByRole('link', { name: 'Get it on Google Play' })).toHaveLength(2);
    expect(document.body.textContent).not.toContain('—');
  });

  it('carries campaign attribution into signup, fixes the redirect and tracks the language', () => {
    show('gujarati', '?utm_source=instagram&utm_campaign=family&redirect_url=https://evil.example');
    const link = screen.getAllByRole('link', { name: 'Start learning Gujarati' })[0];
    const target = new URL(link.getAttribute('href')!, 'https://bolo-india.app');
    expect(target.pathname).toBe('/sign-up');
    expect(target.searchParams.get('utm_source')).toBe('instagram');
    expect(target.searchParams.get('utm_campaign')).toBe('family');
    expect(target.searchParams.get('redirect_url')).toBe('/choose-language');
    fireEvent.click(link);
    expect(state.track).toHaveBeenCalledWith(ANALYTICS_EVENTS.SIGNUP_STARTED, { source: 'growth-gujarati', language: 'gu' });
  });

  it('opens the app for an existing learner without claiming a new signup', () => {
    state.signedIn = true;
    show('punjabi');
    const link = screen.getAllByRole('link', { name: 'Open Bolo' })[0];
    expect(link).toHaveAttribute('href', '/app');
    fireEvent.click(link);
    expect(state.track.mock.calls.some(([name]) => name === ANALYTICS_EVENTS.SIGNUP_STARTED)).toBe(false);
  });

  it('copies only bounded campaign tags into the signup URL', () => {
    const url = new URL(growthSignupHref(`utm_content=${'a'.repeat(500)}&email=private@example.com&next=//evil.example`), 'https://bolo-india.app');
    expect(url.searchParams.get('utm_content')).toHaveLength(200);
    expect(url.searchParams.has('email')).toBe(false);
    expect(url.searchParams.has('next')).toBe(false);
  });
});
