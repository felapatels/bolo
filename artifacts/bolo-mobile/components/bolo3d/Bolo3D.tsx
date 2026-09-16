// <Bolo3D>: the live 3D bird, for the few moments that earn one.
//
// WHY A WEBVIEW (decided 2026-09-16, reversible, recorded in
// docs/bolo3d.md). The stage is three.js running in the WebView's own
// process, so a GPU or WebGL fault kills that process and not the app: this
// app's history is launch crashes from native modules, and the stage sits
// behind a boundary those could never cross. The same page renders on the web,
// and the model it reads is a plain file or URL, so the real Bolo can replace
// the stand-in without anything here changing. A native GL host could replace
// the WebView later behind this same component.
//
// THE STILL FALLBACK IS NOT OPTIONAL. The 2D <Mascot> shows until the 3D bird
// reports ready, and comes back for good if the page errors or its process
// dies twice. She must never be a blank box.
//
// Everything is spoken in contract names (lib/bolo-character): moods, clips,
// sockets, mouth tracks. No screen imports three.js or knows which file loaded.

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useReducedMotion } from 'react-native-reanimated';
import type {
  Capabilities,
  ClipName,
  FaceChannel,
  Framing,
  MomentBeat,
  MomentCommand,
  MomentName,
  Mood,
  MouthKey,
  Socket,
  StageCommand,
  StageEvent,
  TouchPart,
} from '@workspace/bolo-character';
import { Mascot, type MascotPose } from '@/components/Mascot';
import { CHARACTER, loadStageAssets, type StageAssets } from '@/lib/bolo3d';

export type Bolo3DHandle = {
  play: (clip: ClipName) => void;
  /** `positionMs`: how far the audio has already played. */
  speak: (track: MouthKey[], positionMs?: number) => void;
  sync: (positionMs: number) => void;
  silence: () => void;
  face: (channel: FaceChannel, value: number) => void;
  /** Start, continue or clear a scene with a prop (the daily gift). */
  moment: (command: MomentCommand) => void;
};

type Phase = 'loading' | 'ready' | 'failed';

/** A crashed page is reloaded once; a second crash means the still bird stays. */
const MAX_RELOADS = 1;

export const Bolo3D = forwardRef<
  Bolo3DHandle,
  {
    mood?: Mood;
    framing?: Framing;
    /**
     * Touch her and she reacts to the part touched; drag sideways to spin her.
     * ON BY DEFAULT, lesson screens included (owner, 2026-09-16). Vertical
     * swipes still scroll the screen under her.
     */
    interactive?: boolean;
    /** After a spin she turns back to face the learner. Off for a dressing room. */
    returnToFront?: boolean;
    wear?: Partial<Record<Socket, string | null>>;
    /** The 2D pose shown while she loads, and if the 3D bird fails. */
    posterPose?: MascotPose;
    posterSize?: number;
    /** Show only the still fallback, to check it. */
    forceFallback?: boolean;
    /** Overrides the system Reduce Motion setting (the lab's toggle). */
    reducedMotion?: boolean;
    style?: StyleProp<ViewStyle>;
    onReady?: (capabilities: Capabilities, loadMs: number) => void;
    onTap?: (part: TouchPart | null, reaction: ClipName | null) => void;
    onClip?: (event: Extract<StageEvent, { type: 'clip' }>) => void;
    /** A moment's beats, so words can land on her gesture. */
    onMoment?: (moment: MomentName, beat: MomentBeat) => void;
    onError?: (message: string) => void;
    testID?: string;
  }
>(function Bolo3D(
  {
    mood = 'idle',
    framing = 'full',
    interactive = true,
    returnToFront = true,
    wear,
    posterPose = 'wave',
    posterSize = 140,
    forceFallback = false,
    reducedMotion: reducedMotionOverride,
    style,
    onReady,
    onTap,
    onClip,
    onMoment,
    onError,
    testID,
  },
  ref,
) {
  const systemReducedMotion = useReducedMotion();
  const reducedMotion = reducedMotionOverride ?? systemReducedMotion;
  const web = useRef<WebView>(null);
  const [assets, setAssets] = useState<StageAssets | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [generation, setGeneration] = useState(0);
  const queue = useRef<StageCommand[]>([]);
  const phaseRef = useRef<Phase>('loading');
  phaseRef.current = phase;

  // The latest props, read when the page boots rather than when it mounted.
  const latest = useRef({ mood, framing, interactive, returnToFront, wear, reducedMotion });
  latest.current = { mood, framing, interactive, returnToFront, wear, reducedMotion };

  useEffect(() => {
    let live = true;
    loadStageAssets(CHARACTER.model).then(
      (loaded) => live && setAssets(loaded),
      (error: unknown) => {
        if (!live) return;
        setPhase('failed');
        onError?.(`assets: ${String(error)}`);
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const post = useCallback((command: StageCommand) => {
    web.current?.postMessage(JSON.stringify(command));
  }, []);

  const send = useCallback(
    (command: StageCommand) => {
      if (phaseRef.current === 'ready') post(command);
      else if (phaseRef.current === 'loading') queue.current = [...queue.current, command].slice(-8);
    },
    [post],
  );

  useImperativeHandle(
    ref,
    () => ({
      play: (clip) => send({ type: 'play', clip }),
      speak: (track, positionMs = 0) => send({ type: 'speak', track, positionMs }),
      sync: (positionMs) => send({ type: 'sync', positionMs }),
      silence: () => send({ type: 'silence' }),
      face: (channel, value) => send({ type: 'face', channel, value }),
      moment: (command) => send(command),
    }),
    [send],
  );

  // Standing props follow the component after the bird is up.
  useEffect(() => {
    if (phase === 'ready') post({ type: 'mood', mood });
  }, [mood, phase, post]);
  useEffect(() => {
    if (phase === 'ready') post({ type: 'view', framing, interactive, returnToFront });
  }, [framing, interactive, returnToFront, phase, post]);
  useEffect(() => {
    if (phase === 'ready') post({ type: 'motion', reduced: reducedMotion });
  }, [reducedMotion, phase, post]);
  const wearKey = JSON.stringify(wear ?? {});
  useEffect(() => {
    if (phase !== 'ready') return;
    for (const [socket, item] of Object.entries(wear ?? {})) post({ type: 'wear', socket: socket as Socket, item: item ?? null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wearKey, phase, post]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let message: StageEvent;
      try {
        message = JSON.parse(event.nativeEvent.data) as StageEvent;
      } catch {
        return;
      }
      switch (message.type) {
        case 'booted': {
          if (!assets) return;
          const now = latest.current;
          post({
            type: 'load',
            config: {
              modelUrl: assets.model,
              rig: CHARACTER.rig,
              mood: now.mood,
              framing: now.framing,
              interactive: now.interactive,
              reducedMotion: now.reducedMotion,
              wear: now.wear,
            },
          });
          return;
        }
        case 'ready':
          setPhase('ready');
          phaseRef.current = 'ready';
          for (const queued of queue.current) post(queued);
          queue.current = [];
          onReady?.(message.capabilities, message.loadMs);
          return;
        case 'clip':
          onClip?.(message);
          return;
        case 'tap':
          onTap?.(message.part, message.reaction);
          return;
        case 'moment':
          onMoment?.(message.moment, message.beat);
          return;
        case 'error':
          setPhase('failed');
          onError?.(message.message);
          return;
      }
    },
    [assets, post, onReady, onClip, onTap, onMoment, onError],
  );

  const recover = useCallback(
    (why: string) => {
      onError?.(why);
      if (generation < MAX_RELOADS) {
        setPhase('loading');
        setGeneration((g) => g + 1);
      } else {
        setPhase('failed');
      }
    },
    [generation, onError],
  );

  const showStill = forceFallback || phase !== 'ready';

  return (
    <View style={[styles.box, style]} testID={testID}>
      {assets && !forceFallback && phase !== 'failed' ? (
        <WebView
          key={generation}
          ref={web}
          source={{ uri: assets.page }}
          allowingReadAccessToURL={assets.readAccess}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          originWhitelist={['*']}
          javaScriptEnabled
          onMessage={onMessage}
          onContentProcessDidTerminate={() => recover('stage process terminated')}
          onRenderProcessGone={() => recover('stage renderer gone')}
          onError={(e) => recover(`stage page error: ${e.nativeEvent.description}`)}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          setSupportMultipleWindows={false}
          androidLayerType="hardware"
          webviewDebuggingEnabled={__DEV__}
          style={[styles.web, phase === 'ready' ? null : styles.hidden]}
          containerStyle={styles.web}
          accessible
          accessibilityRole="image"
          accessibilityLabel="Bolo, animated"
        />
      ) : null}
      {showStill ? (
        <View style={styles.still} pointerEvents="none" testID="bolo3d-still">
          <Mascot pose={posterPose} size={posterSize} motion={phase === 'loading' ? 'float' : 'none'} entering={false} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
  web: { flex: 1, backgroundColor: 'transparent' },
  hidden: { opacity: 0 },
  still: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
