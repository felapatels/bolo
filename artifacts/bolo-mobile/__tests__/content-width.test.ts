import { CONTENT_MAX_W, contentInsetFor, contentWidthFor } from '@/lib/contentWidth';

// The column arithmetic behind every iPad layout decision (build 25). A phone
// is narrower than the cap, so both helpers must be the identity there: that
// is the promise that nothing on a phone moved.
describe('the content column', () => {
  it('is the window on every phone', () => {
    for (const w of [320, 375, 402, 430, 440]) {
      expect(contentWidthFor(w)).toBe(w);
      expect(contentInsetFor(w)).toBe(0);
    }
  });

  it('caps at the column width on an iPad and centres it', () => {
    // iPad mini, iPad Pro 11, iPad Pro 13 in portrait points.
    expect(contentWidthFor(744)).toBe(CONTENT_MAX_W);
    expect(contentInsetFor(744)).toBe((744 - CONTENT_MAX_W) / 2);
    expect(contentWidthFor(834)).toBe(CONTENT_MAX_W);
    expect(contentWidthFor(1032)).toBe(CONTENT_MAX_W);
    expect(contentInsetFor(1032)).toBe(216);
  });
});
