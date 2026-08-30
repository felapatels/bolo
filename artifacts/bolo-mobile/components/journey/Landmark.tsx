/**
 * THE CITY'S LANDMARK, AS A SILHOUETTE (build 21, owner: "just choose the
 * most famous landmark per city that zone has and silhouette it through").
 * It seeps through the parchment pass behind the words, in the paper's own
 * ink at a whisper, so the pass says WHERE without a word.
 *
 * DRAWN, NOT PAINTED, and keyed by the zone's city name, the same string the
 * pass prints as the station. Six lines' worth of cities is 132 silhouettes
 * and nobody has drawn 132; the Ganga Line's six are here, and every other
 * city takes the fallback (a great dome between minarets) until its own is
 * drawn. Adding a city is one entry in LANDMARKS and one small drawing in a
 * 200 by 120 box; the table names the monument so the drawing can be checked
 * against it.
 *
 * Every shape is filled in one ink and the caller sets the opacity, so a
 * silhouette is all it ever is.
 */
import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

export type LandmarkKind =
  | 'india-gate' // New Delhi: the memorial arch
  | 'clock-hall' // Aligarh: the university's Victoria Gate clock tower
  | 'domed-station' // Kanpur Central: the station's great dome and towers
  | 'fort-sangam' // Prayagraj: the fort's ramparts over the confluence, a boat on it
  | 'shikhara' // Mirzapur: the Vindhyachal temple's spire
  | 'ghats' // Varanasi: the ghat steps, a temple spire, a boat
  | 'domes'; // the fallback: a great dome between minarets

/** The famous landmark per city, by the station name the pass prints. */
export const LANDMARKS: Record<string, LandmarkKind> = {
  'New Delhi': 'india-gate',
  Aligarh: 'clock-hall',
  'Kanpur Central': 'domed-station',
  Prayagraj: 'fort-sangam',
  Mirzapur: 'shikhara',
  Varanasi: 'ghats',
};

export function landmarkFor(city: string | null | undefined): LandmarkKind {
  return (city && LANDMARKS[city]) || 'domes';
}

export function Landmark({
  city,
  width,
  height,
  ink,
  opacity,
  paper,
}: {
  city: string | null | undefined;
  width: number;
  height: number;
  /** The silhouette's one colour. */
  ink: string;
  opacity: number;
  /** The paper's colour, for the cut-outs (doorways, arches). */
  paper: string;
}) {
  const kind = landmarkFor(city);
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 200 120"
      pointerEvents="none"
      style={{ opacity }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={`landmark-${kind}`}
    >
      {kind === 'india-gate' && (
        <>
          {/* the plinth and the two piers */}
          <Rect x={30} y={106} width={140} height={8} rx={2} fill={ink} />
          <Rect x={46} y={40} width={30} height={66} fill={ink} />
          <Rect x={124} y={40} width={30} height={66} fill={ink} />
          {/* the attic above the arch, and the cornice */}
          <Rect x={46} y={28} width={108} height={22} fill={ink} />
          <Rect x={40} y={24} width={120} height={6} rx={2} fill={ink} />
          {/* the small cupola on top */}
          <Rect x={92} y={14} width={16} height={10} fill={ink} />
          <Path d="M90 14 a10 10 0 0 1 20 0 z" fill={ink} />
          {/* the arch itself, cut from the paper */}
          <Path d="M76 106 v-38 a24 24 0 0 1 48 0 v38 z" fill={paper} />
        </>
      )}
      {kind === 'clock-hall' && (
        <>
          <Rect x={16} y={104} width={168} height={10} rx={2} fill={ink} />
          {/* the wings */}
          <Rect x={22} y={70} width={60} height={34} fill={ink} />
          <Rect x={118} y={70} width={60} height={34} fill={ink} />
          {/* the wings' small domes */}
          <Path d="M36 70 a10 10 0 0 1 20 0 z" fill={ink} />
          <Path d="M144 70 a10 10 0 0 1 20 0 z" fill={ink} />
          {/* the clock tower */}
          <Rect x={84} y={34} width={32} height={70} fill={ink} />
          <Path d="M82 34 a18 18 0 0 1 36 0 z" fill={ink} />
          <Rect x={98} y={12} width={4} height={10} fill={ink} />
          {/* the clock face and the gate arch, in paper */}
          <Circle cx={100} cy={50} r={7} fill={paper} />
          <Path d="M92 104 v-18 a8 8 0 0 1 16 0 v18 z" fill={paper} />
        </>
      )}
      {kind === 'domed-station' && (
        <>
          <Rect x={10} y={104} width={180} height={10} rx={2} fill={ink} />
          {/* the long facade */}
          <Rect x={18} y={74} width={164} height={30} fill={ink} />
          {/* the corner towers */}
          <Rect x={24} y={48} width={20} height={56} fill={ink} />
          <Rect x={156} y={48} width={20} height={56} fill={ink} />
          <Path d="M22 48 a12 12 0 0 1 24 0 z" fill={ink} />
          <Path d="M154 48 a12 12 0 0 1 24 0 z" fill={ink} />
          {/* the great dome over the hall */}
          <Rect x={68} y={54} width={64} height={22} fill={ink} />
          <Path d="M66 54 c0 -22 14 -34 34 -34 c20 0 34 12 34 34 z" fill={ink} />
          <Rect x={98} y={12} width={4} height={8} fill={ink} />
          {/* the arcade, in paper */}
          <Path d="M52 104 v-14 a6 6 0 0 1 12 0 v14 z M76 104 v-14 a6 6 0 0 1 12 0 v14 z M112 104 v-14 a6 6 0 0 1 12 0 v14 z M136 104 v-14 a6 6 0 0 1 12 0 v14 z" fill={paper} />
        </>
      )}
      {kind === 'fort-sangam' && (
        <>
          {/* the ramparts with their merlons */}
          <Rect x={16} y={62} width={168} height={30} fill={ink} />
          <Path d="M16 62 h12 v-10 h12 v10 h12 v-10 h12 v10 h12 v-10 h12 v10 h12 v-10 h12 v10 h12 v-10 h12 v10 h12 v-10 h12 v10 h12 v-10 h12 v10 h12 v-10 h12 v10 h12 v-10 h12 v10 h12 z" fill={ink} />
          {/* the two bastions */}
          <Rect x={22} y={40} width={22} height={52} fill={ink} />
          <Rect x={156} y={40} width={22} height={52} fill={ink} />
          <Path d="M20 40 a13 13 0 0 1 26 0 z" fill={ink} />
          <Path d="M154 40 a13 13 0 0 1 26 0 z" fill={ink} />
          {/* the water, and a boat on the confluence */}
          <Rect x={10} y={104} width={180} height={10} rx={2} fill={ink} />
          <Path d="M78 104 l6 -10 h32 l6 10 z" fill={ink} />
          <Rect x={99} y={82} width={3} height={14} fill={ink} />
          <Path d="M102 82 l14 8 h-14 z" fill={ink} />
        </>
      )}
      {kind === 'shikhara' && (
        <>
          <Rect x={30} y={104} width={140} height={10} rx={2} fill={ink} />
          {/* the hall */}
          <Rect x={40} y={78} width={120} height={26} fill={ink} />
          {/* the spire, stepped, over the sanctum */}
          <Path d="M72 78 c2 -14 6 -26 10 -38 c4 -12 10 -24 18 -34 c8 10 14 22 18 34 c4 12 8 24 10 38 z" fill={ink} />
          {/* the amalaka and the finial */}
          <Circle cx={100} cy={12} r={5} fill={ink} />
          <Rect x={98} y={2} width={4} height={8} fill={ink} />
          {/* the porch's smaller spire */}
          <Path d="M42 78 c2 -8 6 -14 12 -20 c6 6 10 12 12 20 z" fill={ink} />
          <Path d="M134 78 c2 -8 6 -14 12 -20 c6 6 10 12 12 20 z" fill={ink} />
          {/* the doorway, in paper */}
          <Path d="M92 104 v-16 a8 8 0 0 1 16 0 v16 z" fill={paper} />
        </>
      )}
      {kind === 'ghats' && (
        <>
          {/* the steps down to the river */}
          <Path d="M10 66 h60 v8 h-8 v8 h-8 v8 h-8 v8 h-8 v8 h-8 v8 h-20 z" fill={ink} />
          <Path d="M190 66 h-60 v8 h8 v8 h8 v8 h8 v8 h8 v8 h8 v8 h20 z" fill={ink} />
          {/* the riverside buildings and the temple spire */}
          <Rect x={28} y={40} width={30} height={26} fill={ink} />
          <Rect x={142} y={44} width={30} height={22} fill={ink} />
          <Rect x={70} y={48} width={60} height={18} fill={ink} />
          <Path d="M86 48 c2 -12 6 -22 14 -34 c8 12 12 22 14 34 z" fill={ink} />
          <Rect x={98} y={8} width={4} height={8} fill={ink} />
          {/* the water, and a boat */}
          <Rect x={10} y={106} width={180} height={8} rx={2} fill={ink} />
          <Path d="M82 106 l6 -9 h24 l6 9 z" fill={ink} />
        </>
      )}
      {kind === 'domes' && (
        <>
          <Rect x={10} y={104} width={180} height={10} rx={2} fill={ink} />
          <Rect x={18} y={38} width={8} height={66} rx={3} fill={ink} />
          <Path d="M16 40 a6 6 0 0 1 12 0 z" fill={ink} />
          <Rect x={174} y={38} width={8} height={66} rx={3} fill={ink} />
          <Path d="M172 40 a6 6 0 0 1 12 0 z" fill={ink} />
          <Rect x={44} y={54} width={7} height={50} rx={3} fill={ink} />
          <Rect x={149} y={54} width={7} height={50} rx={3} fill={ink} />
          <Rect x={56} y={70} width={88} height={34} fill={ink} />
          <Path d="M58 72 a12 12 0 0 1 24 0 v4 h-24 z" fill={ink} />
          <Path d="M118 72 a12 12 0 0 1 24 0 v4 h-24 z" fill={ink} />
          <Path d="M76 74 c0 -18 8 -30 24 -40 c16 10 24 22 24 40 z" fill={ink} />
          <Rect x={98} y={26} width={4} height={10} rx={2} fill={ink} />
          <Path d="M92 104 v-16 a8 8 0 0 1 16 0 v16 z" fill={paper} />
        </>
      )}
    </Svg>
  );
}
