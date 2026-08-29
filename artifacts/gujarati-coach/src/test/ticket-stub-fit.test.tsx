// R1 amendment (32.1 respin): the web pass stub shares the mobile sizing
// contract - stamp type scales as a unit with the ring (no "FARE ZONB" arc
// collision), the station name fits or wraps on spaces (never a mid-word
// ellipsis like "NEW DE..."), and the vertical wordmark fits its run or is
// shortened by whole words (never ellipsized).
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  MiniTicket,
  ZoneStamp,
  fitStubWordmark,
  stampNameFontSize,
  stampSizeForExtent,
  stubLineFontSize,
  zoneStampExtent,
} from "@/components/ticket";
import { homeTicketScale, HOME_TICKET_BASE_W, HOME_TICKET_MAX_SCALE } from "@/pages/home";

// THE STAMP'S THREE ROWS FIT THE RING DOWN, NOT ONLY ACROSS (build 18, off the
// owner's desktop screenshot: "PLATFORM" riding the top arc and "DELHI" on the
// bottom one). The chord rule fits the longest WORD; a two-word name then
// wraps to two lines, and nothing ever added the rows up.
describe("the stamp's rows fit inside the ring at every size the app draws", () => {
  it("label + numeral + two lines of name never exceed the ring's interior", () => {
    for (const size of [34, 38, 44, 47, 52, 56, 63, 69, 80]) {
      const { container, unmount } = render(
        <ZoneStamp ink="#123" zone={1} name="New Delhi" size={size} />,
      );
      const spans = [...container.querySelectorAll("span")] as HTMLElement[];
      const [label, zone, name] = spans;
      const rows =
        parseFloat(label!.style.lineHeight) +
        parseFloat(zone!.style.lineHeight) +
        2 * parseFloat(name!.style.lineHeight);
      expect(rows, `size ${size}`).toBeLessThanOrEqual(size * 0.86 + 0.01);
      unmount();
    }
  });

  it("a desktop-sized stamp keeps the name at full size", () => {
    // The clamp only bites where the ring is small; at 69 (the home ticket at
    // scale 1.8) the name gets its full 7px.
    render(<ZoneStamp ink="#123" zone={1} name="New Delhi" size={69} />);
    expect(parseFloat(screen.getByTestId("zone-stamp-name").style.fontSize)).toBe(7);
  });
});

// THE TICKET SCALES AS ONE UNIT ON WEB (build 18): "boarding pass ticket on
// web is too small and not responsive to size." The host measures its board
// and passes the factor; the phone stays at mobile's 148.
describe("the home ticket scales with the board", () => {
  it("homeTicketScale is 1 on a phone, proportional above, capped", () => {
    expect(homeTicketScale(0)).toBe(1);
    expect(homeTicketScale(200)).toBe(1);
    expect(homeTicketScale(HOME_TICKET_BASE_W)).toBe(1);
    expect(homeTicketScale(HOME_TICKET_BASE_W * 1.5)).toBeCloseTo(1.5, 6);
    expect(homeTicketScale(2000)).toBe(HOME_TICKET_MAX_SCALE);
  });

  it("MiniTicket scales its type, its paddings and its notches with the factor", () => {
    const at = (scale: number) =>
      render(
        <MiniTicket
          lineName="Ganga Line"
          zone={1}
          stationName="New Delhi"
          stampSize={stampSizeForExtent(Math.round(46 * scale))}
          width={Math.round(148 * scale)}
          scale={scale}
          tearing={false}
          notchFill="#F9EBD5"
        />,
      );
    const one = at(1);
    const admit1 = parseFloat(one.getByTestId("mini-ticket-admit").style.fontSize);
    const ticket1 = one.getByTestId("home-mini-ticket");
    expect(ticket1.style.width).toBe("148px");
    one.unmount();
    const big = at(1.8);
    const admit18 = parseFloat(big.getByTestId("mini-ticket-admit").style.fontSize);
    expect(admit18).toBeCloseTo(admit1 * 1.8, 6);
    expect(big.getByTestId("home-mini-ticket").style.width).toBe("266px");
    // The stamp grew with it: its slot is the rotated extent of a bigger ring.
    const slot = big.getByTestId("home-stamp-slot");
    expect(parseFloat(slot.style.width)).toBeGreaterThan(70);
  });
});

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

  it("the label chord budget keeps PLATFORM inside the ring at production sizes", () => {
    // Mirror of the mobile pin: the label's glyphs at ~0.7em advance +
    // rendered tracking must clear the chord where the label row sits (~0.8
    // of the diameter). Checked at the two sizes the app actually derives -
    // home stub (extent 56) and journey header (extent 52).
    // THE WORD IS PLATFORM NOW, NOT FARE ZONE (owner's hybrid ticket, build
    // 17 on mobile, build 18 here): eight glyphs against nine, so the
    // budget the FARE ZONE arc needed still holds with room to spare.
    for (const size of [stampSizeForExtent(56), stampSizeForExtent(52)]) {
      const { container } = render(
        <ZoneStamp ink="#123" zone={1} name="Anand" size={size} />,
      );
      const label = container.querySelector("span") as HTMLElement;
      expect(label.textContent).toBe("Platform");
      const glyphs = label.textContent!.length;
      const fontSize = parseFloat(label.style.fontSize);
      const tracking = parseFloat(label.style.letterSpacing);
      expect(glyphs * fontSize * 0.7 + (glyphs - 1) * tracking).toBeLessThan(size * 0.8);
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
