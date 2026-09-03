import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  ZONE_BACKDROP_SCRIM,
  ZONE_BACKDROP_SCRIM_COLOR,
  ZONE_FILM,
  ZONE_FILM_CROSSFADE_MS,
  zoneFilmTone,
} from '@/lib/zoneBackdrops';

/**
 * THE LIVING BACKDROP, SECOND PASS. One fixed, full-screen, muted, looping
 * film per zone, dissolving into the next as the learner travels down the map.
 * Ported from the Southeast Asia fork's ZoneFilmLayer at the owner's word:
 * "the video splash on the new BOLO Southeast Asia is much better than ours."
 *
 * WHAT WAS WRONG WITH OURS, in one sentence: it stopped. The first pass
 * (components/journey/ZoneFilm.tsx, now gone) unmounted the film the moment a
 * drag began and faded it back in from a still when the map came to rest, so
 * every gesture was a stop and a start. That rule was written out of the
 * six-decoder lmkd incident before build 26, and it was over-fitted to it:
 * ONE fixed decoder, two for 900ms on a crossing, is a different regime.
 *
 * TWO PLAYERS, NOT ONE, AND THAT IS THE WHOLE DESIGN. A single player whose
 * source is swapped cannot dissolve: there is one surface, so the old frame is
 * gone the instant the new source loads and the best you get is a cut with a
 * black flash in it. Two stacked VideoViews let the outgoing film hold
 * underneath while the incoming one comes up over it.
 *
 * THE SLOTS SWAP ROLES; NEITHER IS "THE BASE". A slot keeps its zone until it
 * is the idle one again, so promoting a film is a pure opacity change that
 * touches no player. The fork's first version had a fixed base slot that
 * adopted the new zone once the fade ended, KEYED ON THE ZONE, which remounted
 * the player at the exact moment it reached full opacity: the film everyone
 * was watching restarted from frame 0, and every crossing ended in the flash
 * the dissolve existed to avoid. Do not reintroduce that.
 *
 * ONLY THE INCOMING FILM ANIMATES. The outgoing one holds at full opacity and
 * drops to zero afterwards, when it is already covered. Cross-dissolving both,
 * each through 0.5 at the midpoint, lets a quarter of the ground tone through
 * the middle of every transition, so the picture desaturates and comes back.
 *
 * FAILURE IS A COLOUR. Each slot paints its zone's measured ground tone UNDER
 * the film, so a slow or failed decode dissolves tone-to-film and never
 * through a hole. Nothing here throws and nothing blocks the map.
 *
 * useNativeDriver: false, deliberately. The native driver does not tick in
 * release builds of this app (CLAUDE.md, measured); `true` would hold the
 * incoming film at zero until the callback and then snap it on in one frame,
 * which is the cut this component exists to avoid.
 *
 * THE SCRIM IS HERE, OVER BOTH SLOTS, and the phone bands no longer paint
 * their own. Inside the slots it would double during a crossing and darken
 * the middle of every transition. Same alpha and colour as the paintings had,
 * so a film is dimmed exactly as the picture it replaces.
 */
type SlotRole = 'shown' | 'incoming' | 'hidden';

function FilmSlot({
  zone,
  role,
  fade,
  testID,
}: {
  zone: number | null;
  role: SlotRole;
  fade: Animated.Value;
  testID: string;
}) {
  const source = zone == null ? null : ZONE_FILM(zone);
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    // A backdrop that makes noise while a learner listens to a phrase is
    // actively harmful; the clips were cut silent and are muted again here.
    p.muted = true;
    p.play();
  });
  if (zone == null || source == null) return null;
  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          opacity: role === 'shown' ? 1 : role === 'incoming' ? fade : 0,
          zIndex: role === 'incoming' ? 2 : role === 'shown' ? 1 : 0,
        },
      ]}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: zoneFilmTone(zone) }]} />
      <VideoView player={player} style={styles.film} nativeControls={false} contentFit="cover" />
    </Animated.View>
  );
}

export function ZoneFilmLayer({ zone, reduceMotion }: { zone: number; reduceMotion: boolean }) {
  const [slots, setSlots] = React.useState<[number | null, number | null]>([zone, null]);
  const [shown, setShown] = React.useState<0 | 1>(0);
  const [incoming, setIncoming] = React.useState<0 | 1 | null>(null);
  const fade = React.useRef(new Animated.Value(0)).current;

  // Step one: park the requested zone in the idle slot, mounting its player at
  // zero opacity so it decodes before anyone sees it. A zone crossed while a
  // fade is still running promotes the film in flight to shown at once rather
  // than animating it to nothing, so a fast scroll through two zones does not
  // queue two overlapping dissolves.
  React.useEffect(() => {
    if (slots[shown] === zone) return;
    if (incoming !== null) {
      if (slots[incoming] === zone) return;
      setShown(incoming);
      setIncoming(null);
      return;
    }
    const idle: 0 | 1 = shown === 0 ? 1 : 0;
    if (slots[idle] === zone) return;
    setSlots((prev) => {
      const next: [number | null, number | null] = [prev[0], prev[1]];
      next[idle] = zone;
      return next;
    });
  }, [zone, slots, shown, incoming]);

  // Step two: the idle slot holds the target and is mounted. Give it the
  // incoming role and dissolve it up over the one underneath.
  React.useEffect(() => {
    if (incoming !== null || slots[shown] === zone) return;
    const idle: 0 | 1 = shown === 0 ? 1 : 0;
    if (slots[idle] !== zone) return;
    fade.setValue(0);
    setIncoming(idle);
  }, [zone, slots, shown, incoming, fade]);

  // Step three: the dissolve is over. Hand the incoming slot the shown role,
  // which drops the old one to zero while it is already covered.
  React.useEffect(() => {
    if (incoming === null) return;
    const anim = Animated.timing(fade, {
      toValue: 1,
      duration: reduceMotion ? 0 : ZONE_FILM_CROSSFADE_MS,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (!finished) return;
      setShown(incoming);
      setIncoming(null);
    });
    return () => anim.stop();
  }, [incoming, reduceMotion, fade]);

  const roleFor = (slot: 0 | 1): SlotRole =>
    slot === incoming ? 'incoming' : slot === shown ? 'shown' : 'hidden';

  return (
    <View
      testID="journey-film-layer"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: zoneFilmTone(slots[shown] ?? zone) }]}
    >
      <FilmSlot zone={slots[0]} role={roleFor(0)} fade={fade} testID="journey-film-slot-0" />
      <FilmSlot zone={slots[1]} role={roleFor(1)} fade={fade} testID="journey-film-slot-1" />
      <View
        testID="journey-film-scrim"
        style={[
          StyleSheet.absoluteFill,
          { zIndex: 3, backgroundColor: ZONE_BACKDROP_SCRIM_COLOR, opacity: ZONE_BACKDROP_SCRIM },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  film: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
});
