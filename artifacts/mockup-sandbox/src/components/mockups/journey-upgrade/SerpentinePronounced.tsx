// Curve treatment (b): PRONOUNCED. Cards alternate clearly left/right and the
// track curves across the full column width between them.
import "./_group.css";
import { SerpentineMap } from "./_shared/Serpentine";

const LEFT_X = 92;
const RIGHT_X = 296;

export function SerpentinePronounced() {
  return (
    <SerpentineMap
      config={{
        stationH: 100,
        stationX: (k) => (k % 2 === 0 ? LEFT_X : RIGHT_X),
        cardBox: (x, k) =>
          k % 2 === 0
            ? { left: x + 28, width: 374 - (x + 28), side: "right" }
            : { left: 16, width: x - 28 - 16, side: "left" },
      }}
    />
  );
}
