import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ChaiGlyph, ChaiStallVignette, STALL_TITLE } from '@/components/ChaiStall';
import { AppFonts, nativeTextStyle } from '@/constants/fonts';
import { MilestoneToast } from '@/components/MilestoneToast';
import { Confetti } from '@/components/Confetti';
import {
  useBuyOutfit,
  useGetChachaLines,
  getGetChachaLinesQueryKey,
  useGetTokens,
  useSynthesizeSpeech,
  type ChachaEncounterResult,
  type ChachaLine,
} from '@workspace/api-client-react';
import { playBase64Audio } from '@/lib/audio';
import { speakChachaLine } from '@/lib/chachaVoice';
import { loadCoachVoicePref } from '@/lib/coachVoicePref';
import { hapticLight } from '@/lib/haptics';
import { useLanguage } from '@/contexts/LanguageContext';

type Colors = {
  foreground: string;
  mutedForeground: string;
  card: string;
  border: string;
  muted: string;
  primary: string;
  primaryForeground: string;
  background: string;
};

/**
 * Chacha-ji's roadside stall. Read only from end to end: he pours the chai the
 * server already granted, says a phrase the learner has met before (no mic, no
 * score), and on his every-third visit puts one stall item within reach.
 *
 * The web dialog (gujarati-coach components/chacha-encounter.tsx) shows the
 * same things in the same order, and the copy is fixed by the contract.
 */
export function ChachaEncounterDialog({
  encounter,
  colors,
  onDismiss,
  onDecline,
  languageName,
}: {
  encounter: ChachaEncounterResult | null;
  colors: Colors;
  onDismiss: () => void;
  onDecline: () => void;
  languageName: string;
}) {
  const { activeLang, activeLanguage } = useLanguage();
  const tokensQuery = useGetTokens();
  const buyOutfit = useBuyOutfit();
  const synth = useSynthesizeSpeech();

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackStop, setPlaybackStop] = useState<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (playbackStop) playbackStop();
    };
  }, [playbackStop]);

  // Chacha's own voice, gated by the master "does Bolo speak at all" switch —
  // NOT by "Autoplay phrase" (bolo.silentMode). His lines are flavour dialogue,
  // not a pronunciation reference: there is no recording to get out of the way
  // of and no replay affordance, so a control labelled "Autoplay phrase" has no
  // business silencing them. A learner who switched Bolo's voice off entirely
  // must not suddenly hear a new one, so that gate does apply, and it suppresses
  // the request as well as the playback. Null until AsyncStorage answers; the
  // request waits rather than firing against a guess.
  const [voiceOn, setVoiceOn] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void loadCoachVoicePref().then((on) => {
      if (alive) setVoiceOn(on);
    });
    return () => {
      alive = false;
    };
  }, []);

  // His three lines. Requested off the encounter, never in front of it: the
  // Chai grant, the balance and the celebration have all already landed by the
  // time this dialog exists, and nothing here can hold them up.
  const chachaLines = useGetChachaLines({
    query: {
      queryKey: getGetChachaLinesQueryKey(),
      enabled: encounter != null && voiceOn === true,
      // Fixed text, fixed voice, server-cached: refetching buys nothing.
      staleTime: Infinity,
      retry: false,
    },
  });

  // The line currently being spoken, shown on screen while it plays.
  const [spokenLine, setSpokenLine] = useState<{ text: string; english: string } | null>(
    null,
  );

  // Each beat speaks at most once per encounter.
  const saidRef = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (encounter == null) {
      saidRef.current = {};
      setSpokenLine(null);
    }
  }, [encounter]);

  const linesData = chachaLines.data;
  const say = useCallback(
    (key: ChachaLine['key']) => {
      if (voiceOn !== true || saidRef.current[key]) return;
      const line = linesData?.lines.find((l) => l.key === key);
      if (!line) return;
      saidRef.current[key] = true;
      speakChachaLine(
        { audioBase64: line.audioBase64, format: line.format },
        {
          onStart: () => setSpokenLine({ text: line.text, english: line.english }),
          // Only clear the caption if this line is still the one on screen; a
          // later line may already have claimed it.
          onEnd: () => setSpokenLine((cur) => (cur && cur.text === line.text ? null : cur)),
        },
      );
    },
    [voiceOn, linesData],
  );

  // Beat one: he greets on open, the moment his lines land.
  useEffect(() => {
    if (encounter == null) return;
    say('greeting');
  }, [encounter, say]);

  // Beat two: the gift line ONLY when this arrival actually poured the Chai.
  // A revisit to a station that has already paid gets greeting and farewell
  // and nothing in between.
  useEffect(() => {
    if (encounter?.granted !== true) return;
    say('gift');
  }, [encounter?.granted, say]);

  // Beat three: he sees the learner off on every close path — Thanks,
  // Chacha-ji, Not today, Chacha-ji, and a hardware-back dismissal. Queued
  // before the close so it finishes over the closing modal; the queue is
  // module-scope precisely so it outlives this component's unmount cleanup.
  const leaveWith = (go: () => void) => () => {
    say('farewell');
    go();
  };
  const dismissWithFarewell = leaveWith(onDismiss);
  const declineWithFarewell = leaveWith(onDecline);

  const handleBuy = () => {
    if (!encounter?.offer) return;
    hapticLight();
    buyOutfit.mutate(
      { data: { outfitId: encounter.offer.outfitId } },
      {
        onSuccess: () => {
          // The tin is read all over the app, so refresh it before we leave.
          void tokensQuery.refetch();
          dismissWithFarewell();
        },
      },
    );
  };

  const handlePlayAudio = () => {
    if (!encounter?.phrase || isPlaying) return;
    hapticLight();
    if (playbackStop) {
      playbackStop();
      setPlaybackStop(null);
    }

    setIsPlaying(true);
    void synth
      .mutateAsync({
        data: {
          text: encounter.phrase.nativeScript,
          languageName,
          languageCode: activeLang,
        },
      })
      .then(async (res) => {
        const handle = await playBase64Audio(res.audioBase64, res.format ?? 'mp3', () => {
          setIsPlaying(false);
        });
        setPlaybackStop(() => handle.stop);
      })
      .catch(() => {
        setIsPlaying(false);
      });
  };

  if (!encounter) return null;

  const offer = encounter.offer;
  // Native script needs the language's own font, resolved per language the way
  // the practice screen does it, not a style-sheet constant.
  const nativeStyle = nativeTextStyle(activeLanguage, { bold: true });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissWithFarewell}>
      <View style={styles.backdrop}>
        {encounter.granted && (
          <>
            <Confetti />
            <MilestoneToast
              message={`+${encounter.chaiGranted} Chai`}
              toastKey={encounter.station}
            />
          </>
        )}

        <View testID="chacha-dialog" style={[styles.card, { backgroundColor: colors.card }]}>
          <ChaiStallVignette balance={encounter.balance} />

          <View style={styles.contentArea}>
            <Text style={[styles.stallTitle, { color: colors.foreground }]}>{STALL_TITLE}</Text>

            {/* What he is saying right now, in step with his voice. */}
            {spokenLine && (
              <View testID="chacha-spoken-line" style={styles.spokenLine}>
                <Text
                  testID="chacha-spoken-line-text"
                  style={[styles.spokenLineText, { color: colors.foreground }]}
                >
                  {spokenLine.text}
                </Text>
                <Text
                  testID="chacha-spoken-line-english"
                  style={[styles.spokenLineEnglish, { color: colors.mutedForeground }]}
                >
                  {spokenLine.english}
                </Text>
              </View>
            )}

            <Text style={[styles.giftLine, { color: colors.foreground }]}>
              Chacha-ji pours you a chai.
            </Text>

            <View style={styles.grantedRow}>
              <Text testID="chacha-granted-text" style={styles.grantedText}>
                +{encounter.chaiGranted}
              </Text>
              <ChaiGlyph size={18} />
              <Text style={[styles.balanceText, { color: colors.mutedForeground }]}>
                Balance: {encounter.balance}
              </Text>
            </View>

            {encounter.phrase && (
              <View
                style={[
                  styles.phraseCard,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <Pressable
                  testID="play-phrase-audio"
                  accessibilityRole="button"
                  accessibilityLabel="Hear the phrase"
                  style={[
                    styles.playButton,
                    { backgroundColor: colors.primary, opacity: isPlaying ? 0.7 : 1 },
                  ]}
                  onPress={handlePlayAudio}
                  disabled={isPlaying}
                >
                  <Feather name="volume-2" size={16} color={colors.primaryForeground} />
                </Pressable>

                <View style={styles.phraseCardText}>
                  <Text
                    testID="chacha-phrase-native"
                    style={[styles.nativeScript, nativeStyle, { color: colors.foreground }]}
                  >
                    {encounter.phrase.nativeScript}
                  </Text>
                  {encounter.phrase.romanized ? (
                    <Text
                      testID="chacha-phrase-romanized"
                      style={[styles.romanized, { color: colors.primary }]}
                    >
                      {encounter.phrase.romanized}
                    </Text>
                  ) : null}
                  <Text
                    testID="chacha-phrase-english"
                    style={[styles.english, { color: colors.mutedForeground }]}
                  >
                    {encounter.phrase.english}
                  </Text>
                </View>
              </View>
            )}

            {offer ? (
              <View style={[styles.offerBox, { backgroundColor: colors.muted }]}>
                <Text style={[styles.offerName, { color: colors.foreground }]}>{offer.name}</Text>
                <Text style={[styles.offerTagline, { color: colors.mutedForeground }]}>
                  {offer.tagline}
                </Text>

                <View style={styles.offerPriceRow}>
                  <View style={styles.offerPricePill}>
                    <Text style={[styles.offerPriceLabel, { color: colors.mutedForeground }]}>
                      Price
                    </Text>
                    <Text style={[styles.offerPriceValue, { color: colors.foreground }]}>
                      {offer.cost}
                    </Text>
                    <ChaiGlyph size={14} />
                  </View>
                  <View style={styles.offerPricePill}>
                    <Text style={[styles.offerPriceLabel, { color: colors.mutedForeground }]}>
                      You have
                    </Text>
                    <Text style={[styles.offerPriceValue, { color: colors.foreground }]}>
                      {encounter.balance}
                    </Text>
                    <ChaiGlyph size={14} />
                  </View>
                </View>

                <Pressable
                  testID="chacha-buy-btn"
                  accessibilityRole="button"
                  style={[
                    styles.buyButton,
                    {
                      backgroundColor: colors.primary,
                      opacity:
                        buyOutfit.isPending || encounter.balance < offer.cost ? 0.5 : 1,
                    },
                  ]}
                  onPress={handleBuy}
                  disabled={buyOutfit.isPending || encounter.balance < offer.cost}
                >
                  <Text style={[styles.buyButtonText, { color: colors.primaryForeground }]}>
                    Buy {offer.name}
                  </Text>
                </Pressable>

                <Pressable
                  testID="chacha-decline-btn"
                  accessibilityRole="button"
                  style={styles.declineBtn}
                  onPress={declineWithFarewell}
                >
                  <Text style={[styles.declineBtnText, { color: colors.mutedForeground }]}>
                    Not today, Chacha-ji
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                {encounter.ordinal % 3 === 0 && (
                  <Text
                    testID="chacha-closing-line"
                    style={[styles.closingLine, { color: colors.foreground }]}
                  >
                    Come back soon, beta.
                  </Text>
                )}
                <Pressable
                  testID="chacha-dismiss-btn"
                  accessibilityRole="button"
                  style={[styles.dismissBtn, { backgroundColor: colors.primary }]}
                  onPress={dismissWithFarewell}
                >
                  <Text style={[styles.dismissBtnText, { color: colors.primaryForeground }]}>
                    Thanks, Chacha-ji
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  contentArea: {
    gap: 14,
    paddingTop: 8,
  },
  stallTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 20,
    textAlign: 'center',
  },
  giftLine: {
    fontFamily: AppFonts.semibold,
    fontSize: 16,
    textAlign: 'center',
  },
  spokenLine: {
    alignItems: 'center',
    gap: 2,
  },
  spokenLineText: {
    fontFamily: AppFonts.semibold,
    fontSize: 16,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  spokenLineEnglish: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    textAlign: 'center',
  },
  grantedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  grantedText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 18,
    color: '#B45309',
  },
  balanceText: {
    fontFamily: AppFonts.bold,
    fontSize: 13,
    marginLeft: 6,
  },
  phraseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  phraseCardText: {
    flex: 1,
    gap: 2,
  },
  nativeScript: {
    fontFamily: AppFonts.extrabold,
    fontSize: 22,
  },
  romanized: {
    fontFamily: AppFonts.bold,
    fontSize: 14,
  },
  english: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerBox: {
    padding: 16,
    borderRadius: 16,
    gap: 10,
    alignItems: 'center',
  },
  offerName: {
    fontFamily: AppFonts.extrabold,
    fontSize: 16,
    textAlign: 'center',
  },
  offerTagline: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
  },
  offerPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  offerPricePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  offerPriceLabel: {
    fontFamily: AppFonts.bold,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  offerPriceValue: {
    fontFamily: AppFonts.extrabold,
    fontSize: 14,
  },
  buyButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  buyButtonText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 14,
  },
  declineBtn: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  declineBtnText: {
    fontFamily: AppFonts.bold,
    fontSize: 14,
  },
  closingLine: {
    fontFamily: AppFonts.semibold,
    fontSize: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  dismissBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  dismissBtnText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 14,
  },
});
