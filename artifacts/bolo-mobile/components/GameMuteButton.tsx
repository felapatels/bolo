import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { loadGameAudioPref, saveGameAudioPref } from '@/lib/gameAudioPref';

/**
 * Device-local game audio preference: whether games speak target-language
 * audio. Default on. Shared by all five games so the choice sticks across
 * games and sessions. When off, games must skip synthesis calls entirely,
 * not just playback.
 */
export function useGameAudio(): { soundOn: boolean; toggle: () => void } {
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadGameAudioPref().then((v) => {
      if (!cancelled) setSoundOn(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      void saveGameAudioPref(next);
      return next;
    });
  }, []);

  return { soundOn, toggle };
}

/**
 * The one shared mute toggle rendered on every game's play surface.
 * Speaker icon when audio is on, crossed speaker when muted.
 *
 * `active` is the audio-active treatment (web parity): while a clip is
 * actually sounding the button lights up green, so the learner can see which
 * control owns the noise they're hearing. Purely visual and opt-in — callers
 * that don't track playback simply omit it and get the previous behaviour.
 */
export function GameMuteButton({
  soundOn,
  onToggle,
  active = false,
}: {
  soundOn: boolean;
  onToggle: () => void;
  active?: boolean;
}) {
  const colors = useColors();
  // Muted games never light up, even if a caller leaves `active` latched.
  const live = soundOn && active;
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.btn, live && styles.btnLive]}
      accessibilityRole="button"
      accessibilityLabel={soundOn ? 'Mute game audio' : 'Unmute game audio'}
      testID="game-mute-btn"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Feather
        name={soundOn ? 'volume-2' : 'volume-x'}
        size={20}
        color={live ? ACTIVE_GREEN : soundOn ? colors.foreground : colors.mutedForeground}
      />
    </Pressable>
  );
}

const ACTIVE_GREEN = '#10B981';

const styles = StyleSheet.create({
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  btnLive: { borderRadius: 22, backgroundColor: '#10B98118' },
});
