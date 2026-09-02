import React from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { ZONE_FILM, ZONE_FILM_STILL } from '@/lib/zoneBackdrops';

/**
 * A ZONE BACKDROP THAT COMES ALIVE WHEN THE LEARNER SETTLES ON IT.
 *
 * The owner, build 29: "I want to convert mobile backdrops to this new art and
 * make them living with video files", then "film starts playing if a learner
 * lands on a zone... once they stop scrolling, that video will play".
 *
 * WHY THE CROSS-FADE IS INVISIBLE, and it is not luck. The still under the film
 * is the film's OWN FIRST FRAME, extracted from the encoded clip. So the fade
 * begins from a byte-identical picture and the only thing a learner sees appear
 * is the motion. Getting there needed the still to be derived FROM the video
 * rather than the video matched to an existing painting, which was the first
 * thing tried and does not work: they are separate generations and never line
 * up.
 *
 * ONE PLAYER, AND ONLY WHILE IT IS BEING LOOKED AT. `active` is false whenever
 * the map is moving or another zone owns the viewport, and a false `active`
 * hands `useVideoPlayer` a null source, so no decoder exists. Six simultaneous
 * decoders behind a scrolling map is exactly the kind of load that had lmkd
 * killing this screen on Android before build 26 fixed the bitmap problem, and
 * this screen has not earned a second one.
 *
 * THE FADE USES useNativeDriver: false, and that is not an oversight. This
 * app's native animation driver does not tick in release builds; see the
 * measurement rules in CLAUDE.md. `false` is the only thing that animates here.
 *
 * `onFirstFrameRender` gates the fade so it never cross-fades to a black or
 * half-decoded frame, which is the same trick BrandSplash uses for the same
 * reason.
 */
export function ZoneFilm({
  zoneIndex,
  width,
  height,
  active,
}: {
  zoneIndex: number;
  width: number;
  height: number;
  /** True only when the map is still AND this zone owns the viewport. */
  active: boolean;
}) {
  const still = ZONE_FILM_STILL(zoneIndex);
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

  return (
    <View style={{ width, height }} pointerEvents="none">
      <Image source={still} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {active && film ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
          <VideoView
            testID={`zone-film-${zoneIndex}`}
            player={player}
            style={StyleSheet.absoluteFill}
            nativeControls={false}
            contentFit="cover"
            onFirstFrameRender={() => setFirstFrame(true)}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
