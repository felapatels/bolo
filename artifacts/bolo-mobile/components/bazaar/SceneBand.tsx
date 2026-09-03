import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useReducedMotion } from 'react-native-reanimated';
import { BAND_ASPECT, BAZAAR_ASSETS, STALL_CHARACTERS, type StallKey } from '@/components/StallBand';
import { STALL_FILM, STALL_FILM_POSTER } from '@/components/ChaiStall';

/**
 * A PAINTED SCENE WITH ITS CHARACTER, AND ROOM ON IT (build 22, the owner's
 * bazaar redesign). The stall band draws the same scene with a nameplate;
 * the hub and the four doors want the picture alone, with their own things
 * laid over it (Bolo, the category buttons, a share button), so this is the
 * band without the plate. Sized in points from the width the caller gives,
 * never a percentage (the chat 11 render trap).
 */
export function SceneBand({
  stall,
  width,
  height,
  character = true,
  film = false,
  active = true,
  children,
  style,
  testID,
}: {
  stall: StallKey;
  width: number;
  /** Defaults to the band's 16:9. */
  height?: number;
  /** Whether the stall's keeper stands in the scene. */
  character?: boolean;
  /**
   * THE CHAI STALL AS A FILM (build 29). The owner, on the wallet header:
   * "on the chai wallet chacha is floating above the ground", then "swap it
   * out for the video on iphone and ipad". The float was structural: the
   * scene is `cover`-cropped into a box of the sheet's own height while the
   * cut-out's `bottom` fraction is measured against that box, so the ground
   * moved and his feet did not. The film has him in the frame, on the
   * ground by construction, so `film` drops the cut-out entirely. Chai only;
   * the other three stalls keep their painted figures.
   */
  film?: boolean;
  /** Whether the film may hold a decoder. The wallet passes its visibility. */
  active?: boolean;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const h = height ?? Math.round(width / BAND_ASPECT);
  const scene = stall === 'tailor'
    ? BAZAAR_ASSETS.tailorScene
    : stall === 'ticket'
      ? BAZAAR_ASSETS.ticketScene
      : stall === 'signal'
        ? BAZAAR_ASSETS.signalScene
        : BAZAAR_ASSETS.chaiScene;
  const figure = stall === 'tailor'
    ? BAZAAR_ASSETS.tailor
    : stall === 'ticket'
      ? BAZAAR_ASSETS.stationmaster
      : stall === 'signal'
        ? BAZAAR_ASSETS.lineman
        : BAZAAR_ASSETS.chachaji;
  const place = STALL_CHARACTERS[stall];
  const figureW = Math.round(width * place.width);
  const figureH = Math.round(figureW / place.aspect);
  const reduceMotion = useReducedMotion();
  const filmed = film && stall === 'chai';
  const filming = filmed && active && !reduceMotion;
  const player = useVideoPlayer(filming ? STALL_FILM : null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <View testID={testID} style={[styles.band, { width, height: h }, style]}>
      <Image
        source={filmed ? STALL_FILM_POSTER : scene}
        resizeMode="cover"
        style={{ position: 'absolute', left: 0, top: 0, width, height: h }}
      />
      {filming ? (
        <VideoView
          testID="scene-band-film"
          player={player}
          nativeControls={false}
          contentFit="cover"
          style={{ position: 'absolute', left: 0, top: 0, width, height: h }}
        />
      ) : null}
      {character && !filmed ? (
        <Image
          source={figure}
          resizeMode="contain"
          style={{
            position: 'absolute',
            left: Math.round(width * place.left),
            bottom: Math.round(h * place.bottom),
            width: figureW,
            height: figureH,
          }}
        />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { overflow: 'hidden', borderRadius: 22 },
});
