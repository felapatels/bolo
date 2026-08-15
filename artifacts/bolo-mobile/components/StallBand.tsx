// Bazaar stall bands - mobile twin of the web treatment
// (artifacts/gujarati-coach/src/components/stall-band.tsx). Same scenes, same
// character contract, same names on both platforms, built once.
//
// The bazaar is a STREET, not a hub: four painted stall bands stacked down one
// scroller, each with its own goods listed directly underneath it. A band is
// scenery with a name on it; it is never a painted hotspot map and never a
// menu tile that hides its stock behind a tap.
//
// The character is ALWAYS a transparent PNG composited over the scene rather
// than painted into it - the same contract the chai stall's CHACHAJI layer
// already follows (components/ChaiStall.tsx), so a figure can be moved,
// animated or replaced without redrawing a scene.
//
// DELIVERY: Metro static requires, mirroring assets/images/stall. The web twin
// resolves the same files out of the public folder via BASE_URL; the two
// registries must stay in step.
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AppFonts } from '@/constants/fonts';

/**
 * Asset map: the mobile twin of web's BAZAAR_ASSETS path registry.
 *
 * The chai stall's two layers are the SAME FILES the home vignette uses
 * (components/ChaiStall.tsx's STALL_ASSETS) - no fourth scene was drawn for
 * this street. They are required here directly rather than imported from that
 * module so a band never depends on the vignette's exports: several suites
 * replace ChaiStall wholesale to stub the glyph, and an import would take the
 * bazaar down with them.
 */
export const BAZAAR_ASSETS = {
  tailorScene: require('../assets/images/bazaar/tailor-scene.png') as number,
  tailor: require('../assets/images/bazaar/tailor.png') as number,
  ticketScene: require('../assets/images/bazaar/ticket-scene.png') as number,
  stationmaster: require('../assets/images/bazaar/stationmaster.png') as number,
  signalScene: require('../assets/images/bazaar/signal-scene.png') as number,
  lineman: require('../assets/images/bazaar/lineman.png') as number,
  chaiScene: require('../assets/images/stall/stall.png') as number,
  chachaji: require('../assets/images/stall/chachaji.png') as number,
};

/**
 * ONE aspect for all four bands, so the street reads as a row of shopfronts
 * rather than four differently-proportioned pictures. The scenes are not all
 * the same shape (tailor is 1024x578, ticket and signal are 1024x572, the chai
 * stall art is 1024x572), so the band box is 16:9 and `cover` takes the sliver
 * of difference off the edge: at most 0.4% of a scene's height, which is why
 * the measured character fractions below still land.
 */
export const BAND_ASPECT = 16 / 9;

/**
 * Where each stallholder stands, in fractions of the BAND BOX, plus the art's
 * own aspect so the height is derived rather than guessed - the same contract
 * as ChaiStall's CHACHAJI map, and the same numbers as web's STALL_CHARACTERS.
 *
 * The three new scenes are painted with their stall on the left and open
 * ground on the right, so each figure stands in the CLEAR RIGHT THIRD: left
 * ~0.70 puts the whole silhouette past the stall structure, and bottom 0.06 is
 * the dirt line those three scenes share. Every figure is 520px tall at
 * source, so the widths are set from each one's own proportions and all three
 * land at the same height in the band: tailor 193x520, stationmaster 176x520,
 * lineman 240x520.
 *
 * The chai stall keeps CHACHAJI's own MEASURED numbers (0.485 / 0.17 / 0.195),
 * because those were traced against stall.png itself - his soles sit on the
 * dirt where the awning pole meets it, and moving him to the right third would
 * float him off his own ground line. That is the whole reason this map is
 * per-stall rather than one shared position.
 */
export const STALL_CHARACTERS = {
  tailor: { left: 0.705, bottom: 0.06, width: 0.135, aspect: 193 / 520 },
  ticket: { left: 0.72, bottom: 0.06, width: 0.123, aspect: 176 / 520 },
  signal: { left: 0.7, bottom: 0.06, width: 0.168, aspect: 240 / 520 },
  chai: { left: 0.485, bottom: 0.17, width: 0.195, aspect: 386 / 520 },
} as const;

export type StallKey = keyof typeof STALL_CHARACTERS;

/** The street, in order: tailor, ticket counter, signal box, chai stall. */
export const STALLS: Record<
  StallKey,
  { scene: number; character: number; name: string; trade: string }
> = {
  tailor: {
    scene: BAZAAR_ASSETS.tailorScene,
    character: BAZAAR_ASSETS.tailor,
    name: 'The Tailor',
    trade: 'Outfits & accessories',
  },
  ticket: {
    scene: BAZAAR_ASSETS.ticketScene,
    character: BAZAAR_ASSETS.stationmaster,
    name: 'Ticket Counter',
    trade: 'Passes & bookings',
  },
  signal: {
    scene: BAZAAR_ASSETS.signalScene,
    character: BAZAAR_ASSETS.lineman,
    name: 'Signal Box',
    trade: 'Keep the line running',
  },
  chai: {
    scene: BAZAAR_ASSETS.chaiScene,
    character: BAZAAR_ASSETS.chachaji,
    name: "Chacha-ji's Chai Stall",
    trade: 'Your Chai, counted',
  },
};

/**
 * A single stall band: painted scene, the stallholder composited over it, and
 * the stall's own name struck across the top-left.
 *
 * Legibility over photographic art is the same two-part house treatment the
 * chai vignette uses - a side scrim plus white text with a text-shadow - only
 * mirrored to the LEFT, because the figures stand on the right.
 *
 * Pass `onPress` to make the whole band a door (the chai stall opens the
 * wallet); without one the band is scenery and stays out of the a11y tree, so
 * the rows beneath it are the only things a screen reader stops on.
 */
export function StallBand({
  stall,
  onPress,
  accessibilityLabel,
}: {
  stall: StallKey;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { scene, character, name, trade } = STALLS[stall];
  const place = STALL_CHARACTERS[stall];
  // The fractions above are of the BAND BOX, and RN has no percentage-of-parent
  // for a derived height, so the box measures itself once and the layer maths
  // runs in points - the same onLayout pattern ChaiStall uses.
  const [box, setBox] = React.useState({ width: 0, height: 0 });
  const characterWidth = box.width * place.width;

  const layers = (
    <View
      testID={`stall-band-scene-layer-${stall}`}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.band}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox((prev) =>
          prev.width === width && prev.height === height
            ? prev
            : { width, height },
        );
      }}
    >
      {/* width/height 100% are LOAD-BEARING alongside absoluteFill: with only
          the four insets, iOS gives the Image its INTRINSIC size and
          resizeMode scales nothing. Same note as ChaiStall's scene layer. */}
      <Image
        source={scene}
        testID={`stall-band-scene-${stall}`}
        resizeMode="cover"
        style={[StyleSheet.absoluteFill, styles.fillImage]}
      />
      <View
        testID={`stall-band-character-${stall}`}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: box.width * place.left,
          bottom: box.height * place.bottom,
          width: characterWidth,
          height: characterWidth / place.aspect,
        }}
      >
        <Image source={character} resizeMode="contain" style={styles.fillImage} />
      </View>
      <LinearGradient
        testID={`stall-band-scrim-${stall}`}
        pointerEvents="none"
        colors={['rgba(0,0,0,0.80)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.scrim}
      />
      <View pointerEvents="none" style={styles.overlayColumn}>
        <Text testID={`stall-band-name-${stall}`} style={styles.name}>
          {name}
        </Text>
        <Text style={styles.trade}>{trade}</Text>
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View testID={`stall-band-${stall}`} style={styles.band}>
        {layers}
      </View>
    );
  }

  return (
    <Pressable
      testID={`stall-band-${stall}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
      style={styles.band}
    >
      {layers}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  band: {
    // Full-width band at one fixed aspect: Yoga derives the height from the
    // measured width, which is what keeps the character fractions true.
    width: '100%',
    aspectRatio: BAND_ASPECT,
    borderRadius: 16,
    overflow: 'hidden',
  },
  fillImage: {
    width: '100%',
    height: '100%',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '50%',
  },
  overlayColumn: {
    position: 'absolute',
    top: 12,
    left: 14,
    width: '52%',
    gap: 4,
  },
  name: {
    color: '#FFFFFF',
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  trade: {
    color: 'rgba(255,255,255,0.88)',
    fontFamily: AppFonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
