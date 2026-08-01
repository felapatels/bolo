// R1 amendment (32.1 respin): the web pass stub shares the mobile sizing
// contract - stamp type scales as a unit with the ring (no "FARE ZONB" arc
// collision), the station name fits or wraps on spaces (never a mid-word
// ellipsis like "NEW DE..."), and the vertical wordmark fits its run or is
// shortened by whole words (never ellipsized).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ZoneStamp,
  fitStubWordmark,
  stampNameFontSize,
  stampSizeForExtent,
  stubLineFontSize,
  zoneStampExtent,
} from "@/components/ticket";

describe("zone stamp geometry (shared with mobile TicketParts)", () => {
  it("stampSizeForExtent is the safe inverse of zoneStampExtent", () => {
    for (const slot of [44, 52, 56, 60, 64]) {
      expect(zoneStampExtent(stampSizeForExtent(slot))).toBeLessThanOrEqual(slot);
    }
  });
});

describe("zone stamp type scales as a unit (R1 amendment)", () => {
  it("label and name fonts derive from the ring size - no fixed 7px type", () => {
    const { container: small } = render(
      <ZoneStamp ink="#123" zone={2} name="New Delhi" size={44} />,
    );
    const { container: large } = render(
      <ZoneStamp ink="#123" zone={2} name="New Delhi" size={64} />,
    );
    const label = (c: HTMLElement) =>
      parseFloat((c.querySelector("span") as HTMLElement).style.fontSize);
    expect(label(small)).toBe(Math.max(4, Math.round(44 * 0.115)));
    expect(label(large)).toBe(Math.max(4, Math.round(64 * 0.115)));
    expect(label(small)).toBeLessThan(label(large));
  });

  it("the label chord budget keeps FARE ZONE inside the ring at production sizes", () => {
    // Mirror of the mobile pin: 9 glyphs at ~0.7em advance + rendered
    // tracking must clear the chord where the label row sits (~0.8 of the
    // diameter). Checked at the two sizes the app actually derives - home
    // stub (extent 56) and journey header (extent 52).
    for (const size of [stampSizeForExtent(56), stampSizeForExtent(52)]) {
      const { container } = render(
        <ZoneStamp ink="#123" zone={1} name="Anand" size={size} />,
      );
      const label = container.querySelector("span") as HTMLElement;
      const fontSize = parseFloat(label.style.fontSize);
      const tracking = parseFloat(label.style.letterSpacing);
      expect(9 * fontSize * 0.7 + 8 * tracking).toBeLessThan(size * 0.8);
    }
  });

  it("renders the station name without truncation classes (wraps, never ellipsizes)", () => {
    render(
      <ZoneStamp
        ink="#123"
        zone={5}
        name="Thiruvananthapuram Central"
        size={47}
      />,
    );
    const name = screen.getByTestId("zone-stamp-name");
    expect(name.className).not.toMatch(/truncate/);
    expect(name.className).toMatch(/whitespace-normal/);
    expect(name.textContent).toBe("Thiruvananthapuram Central");
    // Font is sized so the longest WORD fits the 0.72-diameter chord
    // budget - a mid-word break is impossible by construction.
    expect(parseFloat(name.style.fontSize)).toBe(
      stampNameFontSize("Thiruvananthapuram Central", 47),
    );
  });

  it("stampNameFontSize fits the longest word to the chord budget", () => {
    // Short name: full-size type (capped at 7).
    expect(stampNameFontSize("Agra", 52)).toBe(7);
    // Long single word: shrinks, floored at 3.
    const px = stampNameFontSize("Thiruvananthapuram Central", 47);
    expect(px).toBeGreaterThanOrEqual(3);
    expect(px).toBeLessThan(4);
  });
});

describe("stub wordmark fits its run or shortens by whole words (R1 amendment)", () => {
  it("unmeasured render keeps the full name", () => {
    expect(fitStubWordmark("Darjeeling Himalayan Railway", 0).text).toBe(
      "DARJEELING HIMALAYAN RAILWAY",
    );
  });

  it("a roomy run keeps the full name at cap size", () => {
    expect(fitStubWordmark("Gujarat Express", 200)).toEqual({
      text: "GUJARAT EXPRESS",
      fontSize: 8,
    });
  });

  it("a short run shortens by whole words, never mid-word, never ellipsis", () => {
    const { text, fontSize } = fitStubWordmark(
      "Darjeeling Himalayan Railway",
      90,
    );
    expect(text).not.toMatch(/\.\.\.|…/);
    // Word-boundary prefix of the full wordmark.
    expect("DARJEELING HIMALAYAN RAILWAY".startsWith(text)).toBe(true);
    expect(["DARJEELING", "DARJEELING HIMALAYAN"]).toContain(text);
    // The fitted run stays inside the extent.
    expect(text.length * fontSize * 0.75 + 8).toBeLessThanOrEqual(90);
  });

  it("stubLineFontSize clamps to the shared 5..8 band", () => {
    expect(stubLineFontSize("Gujarat Express", 200)).toBe(8);
    expect(stubLineFontSize("Gujarat Express", 20)).toBe(5);
  });
});
