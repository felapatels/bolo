// Curve treatment (a): SUBTLE. Cards stay near-full-width with a slight
// alternating offset; the railway track weaves gently under them.
import "./_group.css";
import { SerpentineMap } from "./_shared/Serpentine";

const CX = 56;
const AMP = 26;

export function SerpentineSubtle() {
  return (
    <SerpentineMap
      config={{
        stationH: 92,
        stationX: (k) => CX + AMP * Math.sin(k * 1.15),
        cardBox: (x) => ({
          left: x + 26,
          width: 374 - (x + 26),
          side: "right",
        }),
      }}
    />
  );
}
