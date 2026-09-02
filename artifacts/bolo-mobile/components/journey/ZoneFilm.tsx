import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ZONE_FILM } from '@/lib/zoneBackdrops';

/** How far the film reaches past the viewport at each end. See FILM_OVERSCAN. */
export const FILM_OVERSCAN = 160;

/**
 * A ZONE BACKDROP THAT COMES ALIVE WHEN THE LEARNER SETTLES ON IT.
 *
 * The owner, build 29: "make them living with video files", then "film starts
 * playing if a learner lands on a zone... once they stop scrolling, that video
 * will play", then "if i'm seeing 2 background images, i want both videos
 * playing", then "you cant blend videos at the seams?".
 *
 * ONE FILM, SIZED TO THE VIEWPORT, AND THAT ANSWERS ALL THREE.
 *
 * The obvious build is one film per visible tile, and it does not work. Two
 * players sit at different frames of the same clip, so at the tile boundary a
 * person is mid-stride on one side and not the other. A gradient cannot hide
 * that: a fade softens a COLOUR step, and this is a motion mismatch. Syncing two
 * players is possible and they drift.
 *
 * So there is never more than one film, and it covers everything on screen.
 * Nothing meets another film, so there is no seam to blend.
 *
 * ITS EDGES ARE OFF-SCREEN, which is why it needs no mask. Where the film meets
 * the still art the motion simply stops, and no gradient can dissolve that
 * either, because a LinearGradient paints colour and cannot make a video
 * transparent. Masking one needs @react-native-masked-view, and a native
 * dependency invalidates every installed dev build in this project. So the film
 * is drawn FILM_OVERSCAN taller than the viewport at each end and parked so both
 * edges fall outside the screen. It only ever plays while the map is at rest, so
 * nothing can scroll one into view.
 *
 * THE CROSS-FADE IN IS INVISIBLE BY CONSTRUCTION, because the still underneath
 * is this film's own first frame, pulled out of the encoded clip. The fade
 * starts from a byte-identical picture and the only thing that appears is the
 * motion. Matching a film to an existing painting was tried first and cannot
 * work: separate generations never line up.
 *
 * `active` is false whenever the map is moving, and a false `active` hands
 * useVideoPlayer a null source, so no decoder exists. That matters: six
 * decoders behind a scrolling map is the class of load that had lmkd killing
 * this screen before build 26.
 *
 * The fade uses useNativeDriver: false deliberately. This app's native
 * animation driver does not tick in release builds; see CLAUDE.md's measurement
 * rules. `false` is the only thing that animates here.
 */
export function ZoneFilm({
  zoneIndex,
  width,
  height,
  active,
}: {
  zoneIndex: number;
  width: number;
  /** Viewport height plus FILM_OVERSCAN at each end. */
  height: number;
  active: boolean;
}) {
  const film = ZONE_FILM(zoneIndex);
  const [firstFrame, setFirstFrame] = React.useState(false);
  const fade = React.useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(active && film ? film : null, (p) => {
    p.muted = true;
    p.loop = true;
  });

  React.useEffect(() => {
    if (active && player) player.play();
    if (!active) setFirstFrame(false);
  }, [active, player]);

  React.useEffect(() => {
    Animated.timing(fade, {
      toValue: active && firstFrame ? 1 : 0,
      duration: 420,
      useNativeDriver: false,
    }).start();
  }, [active, firstFrame, fade]);

  if (!active || !film) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={{ width, height, opacity: fade }}
    >
      <VideoView
        testID={`zone-film-${zoneIndex}`}
        player={player}
        style={StyleSheet.absoluteFill}
        nativeControls={false}
        contentFit="cover"
        onFirstFrameRender={() => setFirstFrame(true)}
      />
    </Animated.View>
  );
}
