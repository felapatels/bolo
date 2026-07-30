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
 */
export function GameMuteButton({
  soundOn,
  onToggle,
}: {
  soundOn: boolean;
  onToggle: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onToggle}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={soundOn ? 'Mute game audio' : 'Unmute game audio'}
      testID="game-mute-btn"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Feather
        name={soundOn ? 'volume-2' : 'volume-x'}
        size={20}
        color={soundOn ? colors.foreground : colors.mutedForeground}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
