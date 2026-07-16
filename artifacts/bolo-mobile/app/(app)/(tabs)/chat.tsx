import React from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { appear } from '@/lib/entrance';
import { useChatTurn, type ChatTurnMessage } from '@workspace/api-client-react';
import { ApiError } from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { UpgradeRequiredScreen } from '@/components/UpgradeRequiredScreen';
import { TalkingMascot, type TalkingMascotMode } from '@/components/TalkingMascot';
import { useLanguage } from '@/contexts/LanguageContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { asUpgradeRequired, paywallHrefForDenial } from '@/lib/entitlements';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticMedium, hapticHeavy } from '@/lib/haptics';
import {
  prepareRecordingSession,
  prepareRecorderInSession,
  ensureRecordingMode,
  stopAndReadRecording,
  playBase64Audio,
  RECORDING_PRESET,
  SILENCE_THRESHOLD_DB,
  SILENCE_DURATION_MS,
  type PlaybackHandle,
} from '@/lib/audio';
import { loadChatHoldHintSeen, saveChatHoldHintSeen } from '@/lib/settings';

// How many previous turns to include in each request for conversational context.
const HISTORY_WINDOW = 6;

// Free-tier weekly cap in seconds (matches backend constant).
const FREE_WEEKLY_CAP_SECONDS = 120;

type ChatPhase =
  | 'idle'        // waiting for the learner to tap
  | 'recording'   // mic is live
  | 'processing'  // sent, waiting for the server
  | 'playing'     // reply audio is playing
  | 'error';      // something went wrong

type ChatMessage = {
  role: 'learner' | 'parrot';
  text: string;
};

/** Format seconds as "1:23" */
function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function ChatScreen() {
  const colors = useColors();
  const router = useRouter();
  const { activeLang, languages } = useLanguage();
  const { isPlus, isOneLanguage, isLanguageAllowed } = useEntitlements();

  const chatTurn = useChatTurn();

  // Per-session language state — does NOT change the learner's global active language.
  const [chatLang, setChatLang] = React.useState<string>(activeLang);

  // Derived from the language list for display.
  const chatLanguage = React.useMemo(
    () => languages.find((l) => l.code === chatLang),
    [languages, chatLang],
  );

  // Language picker bottom-sheet state.
  const [pickerOpen, setPickerOpen] = React.useState(false);

  // Conversation history shown in the UI (and sent to the server as context)
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [phase, setPhase] = React.useState<ChatPhase>('idle');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Remaining weekly seconds (null = unlimited; undefined = not yet fetched)
  const [secondsRemaining, setSecondsRemaining] = React.useState<
    number | null | undefined
  >(undefined);

  // If the language is unlocked after a purchase, the screen re-evaluates.
  const [upgradeRequired, setUpgradeRequired] = React.useState(false);

  // First-time hold-to-speak hint — shown until the learner presses or it
  // auto-dismisses. `null` means "not yet loaded from storage".
  const [holdHintSeen, setHoldHintSeen] = React.useState<boolean | null>(null);
  const holdHintTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    loadChatHoldHintSeen().then((seen) => {
      if (!cancelled) setHoldHintSeen(seen);
    });
    return () => { cancelled = true; };
  }, []);
  // Auto-dismiss the hint after 5 s so it never blocks the screen permanently.
  React.useEffect(() => {
    if (holdHintSeen === false) {
      holdHintTimerRef.current = setTimeout(() => {
        setHoldHintSeen(true);
        void saveChatHoldHintSeen();
      }, 5000);
    }
    return () => {
      if (holdHintTimerRef.current) clearTimeout(holdHintTimerRef.current);
    };
  }, [holdHintSeen]);
  const dismissHoldHint = React.useCallback(() => {
    if (holdHintSeen) return;
    if (holdHintTimerRef.current) clearTimeout(holdHintTimerRef.current);
    setHoldHintSeen(true);
    void saveChatHoldHintSeen();
  }, [holdHintSeen]);

  // Audio
  const recorder = useAudioRecorder(RECORDING_PRESET);
  const recorderState = useAudioRecorderState(recorder, 250);
  const playbackRef = React.useRef<PlaybackHandle | null>(null);
  const sessionReadyRef = React.useRef(false);
  const recorderPreparedRef = React.useRef(false);
  const preparePromiseRef = React.useRef<Promise<boolean> | null>(null);
  const finishingRef = React.useRef(false);

  // Tracks whether the learner's finger is currently held down on the mascot.
  // Used to resolve the startup race: if pressOut fires before the async
  // recorder startup completes (phase is still idle), handleStartRecording
  // reads this ref after startup and immediately stops itself.
  const isPressingRef = React.useRef(false);

  // Silence auto-stop
  const silenceSinceRef = React.useRef<number | null>(null);
  const metering = recorderState?.metering;

  const scrollRef = React.useRef<ScrollView>(null);

  // Clear conversation history and stop any playback when the chat language changes.
  React.useEffect(() => {
    setMessages([]);
    setErrorMsg(null);
    setPhase('idle');
    playbackRef.current?.stop();
    playbackRef.current = null;
    setUpgradeRequired(false);
  }, [chatLang]);

  // ── Mic warm-up ────────────────────────────────────────────────────────────
  const prepareRecorder = React.useCallback((): Promise<boolean> => {
    if (preparePromiseRef.current) return preparePromiseRef.current;
    const run = async (): Promise<boolean> => {
      try {
        if (!sessionReadyRef.current) {
          const ok = await prepareRecordingSession();
          if (!ok) return false;
          sessionReadyRef.current = true;
        }
        if (!recorderPreparedRef.current) {
          await prepareRecorderInSession(recorder);
          recorderPreparedRef.current = true;
        }
        return true;
      } catch {
        return false;
      } finally {
        preparePromiseRef.current = null;
      }
    };
    preparePromiseRef.current = run();
    return preparePromiseRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder]);

  // Pre-warm on mount and after each turn (return to idle)
  React.useEffect(() => {
    if (phase === 'idle') void prepareRecorder();
  }, [phase, prepareRecorder]);

  // Clean up playback on unmount
  React.useEffect(
    () => () => {
      playbackRef.current?.stop();
    },
    [],
  );

  // Tab screens stay mounted, so unmount cleanup alone isn't enough: when the
  // learner switches to another tab mid-recording or while Bolo is speaking,
  // stop the mic and playback and settle back to idle so nothing keeps running
  // (or holds the audio session) in the background.
  // The callback must stay referentially stable across re-renders: if it
  // changed with volatile state (e.g. recorderState.isRecording), React
  // Navigation would re-register the effect mid-session and run the previous
  // cleanup while the learner is still on the tab, cutting off an active turn.
  const recorderRef = React.useRef(recorder);
  recorderRef.current = recorder;
  // Tracks whether the Chat tab is currently focused so a chat turn that is
  // still in flight when the learner switches tabs can't start playing the
  // reply audio in the background once the server responds.
  const isFocusedRef = React.useRef(true);
  useFocusEffect(
    React.useCallback(
      () => {
        isFocusedRef.current = true;
        return () => {
        // Runs only on actual tab blur (or unmount).
        isFocusedRef.current = false;
        playbackRef.current?.stop();
        playbackRef.current = null;
        try {
          void recorderRef.current.stop();
        } catch {
          // Best-effort: the recorder may already be stopped/idle.
        }
        recorderPreparedRef.current = false;
        finishingRef.current = false;
        isPressingRef.current = false;
        silenceSinceRef.current = null;
        setPhase('idle');
        setErrorMsg(null);
        };
      },
      [],
    ),
  );

  // ── Silence auto-stop ──────────────────────────────────────────────────────
  React.useEffect(() => {
    if (phase !== 'recording') {
      silenceSinceRef.current = null;
      return;
    }
    if (typeof metering !== 'number') return;
    const now = Date.now();
    if (metering > SILENCE_THRESHOLD_DB) {
      silenceSinceRef.current = now;
      return;
    }
    if (silenceSinceRef.current == null) {
      silenceSinceRef.current = now;
      return;
    }
    if (now - silenceSinceRef.current >= SILENCE_DURATION_MS) {
      silenceSinceRef.current = null;
      void handleStopRecording();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, metering]);

  // Scroll to bottom whenever messages change
  React.useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages]);

  // ── Recording ──────────────────────────────────────────────────────────────
  const handleStartRecording = async () => {
    if (phase !== 'idle' && phase !== 'error') return;

    // Check weekly cap before even starting
    if (!isPlus && !isOneLanguage && secondsRemaining !== undefined && secondsRemaining !== null && secondsRemaining <= 0) {
      router.push('/(app)/paywall');
      return;
    }

    setErrorMsg(null);
    finishingRef.current = false;
    playbackRef.current?.stop();
    playbackRef.current = null;

    if (!recorderPreparedRef.current) {
      const ok = await prepareRecorder();
      if (!ok) {
        if (!sessionReadyRef.current) {
          Alert.alert(
            'Microphone needed',
            'Please allow microphone access to chat with Bolo.',
          );
        } else {
          Alert.alert('Recording failed', 'Could not start recording. Try again.');
        }
        return;
      }
    }
    try {
      await ensureRecordingMode();
      recorder.record();
      recorderPreparedRef.current = false;
      setPhase('recording');
      hapticMedium();
      // Guard: if the finger was lifted while async startup was in flight,
      // stop immediately so recording never outlasts the hold gesture.
      if (!isPressingRef.current) {
        void handleStopRecording();
      }
    } catch {
      recorderPreparedRef.current = false;
      Alert.alert('Recording failed', 'Could not start recording. Try again.');
    }
  };

  const handleStopRecording = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setPhase('processing');

    let audioBase64: string;
    try {
      audioBase64 = await stopAndReadRecording(recorder);
    } catch {
      setPhase('error');
      setErrorMsg("We couldn't read that recording. Give it another try.");
      finishingRef.current = false;
      return;
    }

    // Build rolling history window for the server (role labels match the API)
    const history: ChatTurnMessage[] = messages
      .slice(-HISTORY_WINDOW)
      .map((m) => ({ role: m.role === 'parrot' ? 'parrot' : 'learner', text: m.text }));

    try {
      const result = await chatTurn.mutateAsync({
        data: { languageCode: chatLang, audioBase64, history },
      });

      // If the learner left the Chat tab while this turn was in flight, drop
      // the response silently — never start reply audio on another tab.
      if (!isFocusedRef.current) {
        finishingRef.current = false;
        return;
      }

      // Append both sides of the exchange to the transcript
      setMessages((prev) => [
        ...prev,
        { role: 'learner', text: result.transcript },
        { role: 'parrot', text: result.replyText },
      ]);

      // Update the remaining-time display for free users
      if (result.secondsRemaining !== null) {
        setSecondsRemaining(result.secondsRemaining);
      } else {
        setSecondsRemaining(null); // unlimited
      }

      // Play the parrot's audio reply
      setPhase('playing');
      hapticHeavy();
      const handle = await playBase64Audio(
        result.replyAudioBase64,
        result.format || 'mp3',
        () => {
          playbackRef.current = null;
          setPhase('idle');
        },
      );
      playbackRef.current = handle;
    } catch (err) {
      finishingRef.current = false;

      // Off-tab failure: the blur cleanup already reset the screen; don't
      // surface errors or navigate while another tab is active.
      if (!isFocusedRef.current) return;

      // 402 upgrade_required — language locked or weekly cap hit
      const upgrade = asUpgradeRequired(err);
      if (upgrade) {
        const isCap = upgrade.reason === 'weekly_cap_exceeded';
        if (isCap) {
          setSecondsRemaining(0);
          router.push('/(app)/paywall');
          setPhase('idle');
          return;
        }
        setUpgradeRequired(true);
        setPhase('idle');
        return;
      }

      setPhase('error');
      if (err instanceof ApiError) {
        if ((err as { status?: number }).status === 502) {
          setErrorMsg("We couldn't process that. Give it another try!");
        } else if ((err as { status?: number }).status === 429) {
          setErrorMsg('Slow down a bit! Wait a moment and try again.');
        } else {
          setErrorMsg('Something went wrong. Please try again.');
        }
      } else if (err instanceof TypeError) {
        setErrorMsg("We couldn't reach the server. Check your connection and try again.");
      } else {
        setErrorMsg('Something went wrong. Please try again.');
      }
    }
  };

  // ── Language gate ──────────────────────────────────────────────────────────
  // Only block the whole screen if a previous turn attempt was denied (edge
  // case). Per-language locks are handled inside the picker.
  if (upgradeRequired) {
    return (
      <UpgradeRequiredScreen
        title="Unlock this language"
        message="Upgrade to Plus to chat with Bolo in any language."
        onUpgrade={() =>
          router.push(
            paywallHrefForDenial(
              {
                error: 'upgrade_required',
                upgradeRequired: true,
                reason: 'language_locked',
                message: 'Upgrade to chat in any language.',
                feature: 'allLanguages',
                requiredPlan: 'one_language',
              },
              chatLang,
            ),
          )
        }
        onBack={() => router.push('/(app)/(tabs)')}
      />
    );
  }

  // ── Mascot mode ────────────────────────────────────────────────────────────
  const mascotMode: TalkingMascotMode =
    phase === 'recording'
      ? 'listening'
      : phase === 'playing'
        ? 'talking'
        : phase === 'processing'
          ? 'thinking'
          : 'idle';

  // ── Free-tier time indicator ───────────────────────────────────────────────
  const showTimeIndicator =
    !isPlus && !isOneLanguage && secondsRemaining !== undefined && secondsRemaining !== null;
  const timePercent =
    showTimeIndicator && secondsRemaining !== null
      ? Math.max(0, Math.min(1, secondsRemaining / FREE_WEEKLY_CAP_SECONDS))
      : 1;
  const capExhausted = showTimeIndicator && secondsRemaining !== null && secondsRemaining <= 0;

  return (
    <Screen>
      {/* Header — no back button: the screen now lives in the tab bar */}
      <View style={styles.header}>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Chat with Bolo
          </Text>
        </View>
      </View>

      {/* Language pill — tap to switch chat language */}
      <View style={styles.langPillRow}>
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityLabel={`Chat language: ${chatLanguage?.name ?? chatLang}. Tap to change.`}
          style={[
            styles.langPill,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="globe" size={14} color={colors.primary} />
          <Text style={[styles.langPillText, { color: colors.foreground }]}>
            {chatLanguage?.name ?? chatLang}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* Free-tier time remaining bar */}
      {showTimeIndicator && (
        <Animated.View
          entering={appear(FadeInDown.duration(300))}
          style={[styles.timeBar, { backgroundColor: colors.muted }]}
        >
          <View
            style={[
              styles.timeBarFill,
              {
                backgroundColor: capExhausted ? (colors.destructive ?? '#EF4444') : colors.primary,
                width: `${Math.round(timePercent * 100)}%`,
              },
            ]}
          />
          <Text style={[styles.timeLabel, { color: colors.mutedForeground }]}>
            {capExhausted
              ? 'Weekly chat time used — upgrade for unlimited'
              : `⏱ ${formatSeconds(secondsRemaining!)} of 2:00 left this week`}
          </Text>
        </Animated.View>
      )}

      {/* Mascot area — hold the bird to speak, release to send */}
      <Pressable
        onPressIn={() => {
          isPressingRef.current = true;
          // Dismiss the hold-hint on first interaction.
          dismissHoldHint();
          if (phase === 'idle' || phase === 'error') void handleStartRecording();
        }}
        onPressOut={() => {
          isPressingRef.current = false;
          // If recording is already live, stop immediately.
          // If startup is still in flight (phase still idle/error), the ref
          // flip above is enough — handleStartRecording reads it after startup
          // completes and calls handleStopRecording itself.
          if (phase === 'recording') void handleStopRecording();
        }}
        disabled={phase === 'processing' || phase === 'playing' || capExhausted}
        style={[styles.mascotArea, messages.length === 0 && styles.mascotAreaFull]}
        accessibilityRole="button"
        accessibilityLabel={
          phase === 'recording' ? 'Release to send' : 'Hold to speak'
        }
        accessibilityHint="Hold your finger on Bolo to record, lift to send"
      >
        <TalkingMascot mode={mascotMode} size={messages.length === 0 ? 220 : 130} />

        {/* Status label under the mascot */}
        <Animated.Text
          key={phase}
          entering={appear(FadeInDown.duration(250))}
          style={[styles.statusLabel, { color: colors.mutedForeground }]}
        >
          {phase === 'idle' && messages.length === 0
            ? 'Hold Bolo to start talking'
            : phase === 'idle'
              ? 'Hold to talk again'
              : phase === 'recording'
                ? 'Listening… release to send'
                : phase === 'processing'
                  ? 'Thinking…'
                  : phase === 'playing'
                    ? 'Bolo is speaking…'
                    : phase === 'error'
                      ? 'Something went wrong — hold to retry'
                      : ''}
        </Animated.Text>

        {/* First-time instructional hint */}
        {holdHintSeen === false && (
          <Animated.View
            entering={appear(FadeInDown.duration(320))}
            style={[styles.holdHint, { backgroundColor: colors.primary }]}
          >
            <Feather name="mic" size={13} color={colors.primaryForeground ?? '#fff'} />
            <Text style={[styles.holdHintText, { color: colors.primaryForeground ?? '#fff' }]}>
              Hold to speak · release to send
            </Text>
          </Animated.View>
        )}

        {/* Skip button — only shown while Bolo is speaking */}
        {phase === 'playing' && (
          <Animated.View entering={appear(FadeInDown.duration(200))} style={{ marginTop: 8 }}>
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                playbackRef.current?.stop();
                playbackRef.current = null;
                setPhase('idle');
              }}
              style={[styles.skipBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              accessibilityRole="button"
              accessibilityLabel="Skip Bolo's reply"
            >
              <Feather name="skip-forward" size={18} color={colors.mutedForeground} />
            </Pressable>
          </Animated.View>
        )}
      </Pressable>

      {/* Static greeting bubble — shown before the first exchange, client-side only, never sent to the API */}
      {messages.length === 0 && (
        <Animated.View
          entering={appear(FadeInUp.duration(320).delay(200))}
          style={[
            styles.bubble,
            styles.bubbleParrot,
            { backgroundColor: colors.card, borderColor: colors.border, alignSelf: 'flex-start', marginHorizontal: 16, marginBottom: 8 },
          ]}
        >
          <Text style={[styles.bubbleText, { color: colors.foreground }]}>
            {'Squawk! I\'m Bolo — your feathered conversation buddy! Hold my belly and let\'s chat in ' +
              (chatLanguage?.name ?? chatLang) + '! Awk!'}
          </Text>
        </Animated.View>
      )}

      {/* Conversation transcript */}
      {messages.length > 0 && (
        <ScrollView
          ref={scrollRef}
          style={styles.transcript}
          contentContainerStyle={styles.transcriptContent}
          showsVerticalScrollIndicator={false}
        >
          {messages.map((msg, i) => (
            <Animated.View
              key={i}
              entering={appear(FadeInUp.duration(280).delay(40))}
              style={[
                styles.bubble,
                msg.role === 'learner'
                  ? [styles.bubbleLearner, { backgroundColor: colors.primary }]
                  : [styles.bubbleParrot, { backgroundColor: colors.card, borderColor: colors.border }],
              ]}
            >
              <Text
                style={[
                  styles.bubbleText,
                  {
                    color:
                      msg.role === 'learner'
                        ? colors.primaryForeground
                        : colors.foreground,
                  },
                ]}
              >
                {msg.text}
              </Text>
            </Animated.View>
          ))}
        </ScrollView>
      )}

      {/* Error message */}
      {phase === 'error' && errorMsg && (
        <Animated.View
          entering={appear(FadeInDown.duration(280))}
          style={[styles.errorBox, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <Feather name="alert-circle" size={16} color={colors.destructive ?? '#EF4444'} />
          <Text style={[styles.errorText, { color: colors.foreground }]}>
            {errorMsg}
          </Text>
        </Animated.View>
      )}

      {/* Language picker modal */}
      <Modal
        visible={pickerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop]}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.background, borderColor: colors.border }]}
            onPress={() => {}}
          >
            {/* Handle bar */}
            <View style={[styles.handleBar, { backgroundColor: colors.border }]} />

            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Chat language
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
              Choose the language for this chat session
            </Text>

            <FlatList
              data={languages}
              keyExtractor={(item) => item.code}
              contentContainerStyle={styles.langList}
              renderItem={({ item: lang }) => {
                const selected = lang.code === chatLang;
                const locked = !isLanguageAllowed(lang.code);
                return (
                  <TouchableOpacity
                    onPress={() => {
                      if (locked) {
                        setPickerOpen(false);
                        router.push(
                          paywallHrefForDenial(
                            {
                              error: 'upgrade_required',
                              upgradeRequired: true,
                              reason: 'language_locked',
                              message: 'Upgrade to chat in any language.',
                              feature: 'allLanguages',
                              requiredPlan: 'one_language',
                            },
                            lang.code,
                          ),
                        );
                        return;
                      }
                      setChatLang(lang.code);
                      setPickerOpen(false);
                    }}
                    style={[
                      styles.langRow,
                      {
                        backgroundColor: selected
                          ? colors.primary + '15'
                          : colors.card,
                        borderColor: selected
                          ? colors.primary
                          : colors.border,
                      },
                    ]}
                    accessibilityLabel={`${lang.name}${locked ? ', locked — upgrade to unlock' : selected ? ', selected' : ''}`}
                  >
                    <View style={styles.langRowLeft}>
                      <Text
                        style={[
                          styles.langNativeName,
                          {
                            color: locked
                              ? colors.mutedForeground
                              : colors.foreground,
                            fontFamily: lang.fontFamily
                              ? undefined
                              : AppFonts.bold,
                          },
                          lang.fontFamily
                            ? { fontFamily: lang.fontFamily }
                            : {},
                        ]}
                        numberOfLines={1}
                      >
                        {lang.nativeName}
                      </Text>
                      <Text style={[styles.langEnglishName, { color: colors.mutedForeground }]}>
                        {lang.name}
                      </Text>
                    </View>
                    {selected ? (
                      <Feather name="check" size={18} color={colors.primary} />
                    ) : locked ? (
                      <Feather name="lock" size={16} color={colors.mutedForeground} />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 17,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langPillRow: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  langPillText: {
    fontFamily: AppFonts.semibold,
    fontSize: 14,
  },
  timeBar: {
    marginHorizontal: 20,
    marginBottom: 8,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  timeBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 3,
  },
  timeLabel: {
    fontFamily: AppFonts.regular,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
  },
  mascotArea: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  mascotAreaFull: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: TAB_BAR_CLEARANCE,
  },
  statusLabel: {
    fontFamily: AppFonts.semibold,
    fontSize: 14,
  },
  transcript: {
    flex: 1,
    marginHorizontal: 20,
  },
  transcriptContent: {
    gap: 8,
    paddingVertical: 8,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bubbleLearner: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleParrot: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  skipBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 4,
  },
  holdHintText: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
  },
  // Modal / bottom-sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '80%',
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 18,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    marginBottom: 16,
  },
  langList: {
    gap: 8,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  langRowLeft: {
    flex: 1,
    minWidth: 0,
  },
  langNativeName: {
    fontSize: 16,
    fontFamily: AppFonts.bold,
  },
  langEnglishName: {
    fontFamily: AppFonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
});
