import { QRCodeSVG } from "qrcode.react";

// The learner's friend code as a scannable square.
//
// It encodes the join LINK, not the bare code, so a phone's ordinary camera app
// opens Bolo! straight away instead of showing six letters the reader then has
// to type. The Bolo! scanner on mobile understands both shapes.
//
// Rendered as an SVG with no external assets: a QR is pure geometry, so this
// stays crisp at any size, prints from the browser, and needs no canvas or
// network round trip.
export function FriendQr({
  value,
  size = 148,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={className}
      data-testid="friend-qr"
      // What the square actually encodes. A rendered QR is opaque to a test (and
      // to anyone debugging in devtools), so the payload is exposed here, it is
      // the same string any scanner reads off the image, so nothing is leaked.
      data-value={value}
      // The code is already on screen as text next to this; the square is a
      // shortcut, not the only route to it.
      role="img"
      aria-label="QR code for your friend code"
    >
      <QRCodeSVG
        value={value}
        size={size}
        // Plain black on white regardless of theme: scanners want contrast, and
        // a dark-mode QR rendered in brand teal is measurably harder to read.
        bgColor="#ffffff"
        fgColor="#000000"
        // Medium error correction, enough redundancy for a phone screen photo
        // or a slightly creased printout without inflating the module count.
        level="M"
        marginSize={2}
      />
    </div>
  );
}
