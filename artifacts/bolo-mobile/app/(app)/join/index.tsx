// REDEEMING A REFERRAL, on the phone. The counterpart of the web's /join page.
//
// WHY THIS IS NOT PART OF THE FRIENDS SCREEN, even though it takes the same
// string. One code does two jobs, and they are genuinely different acts:
//
//   ADDING A FRIEND lands as a PENDING request the other learner must accept.
//   That acceptance step is the only reason the reuse is safe at all: referral
//   codes are designed to be broadcast, on flyers and in WhatsApp groups, so
//   without it every place someone posted their code would quietly become an
//   open friend list. The note on friends.tsx says so and the server repeats it.
//
//   REDEEMING is one-time, auto-friends INSTANTLY, and pays both learners. It
//   can do that safely because redeeming somebody's link is an explicit act by
//   both parties.
//
// Folding redemption into the friends box would have meant one input doing both,
// and the safe-by-default half would have been the one to go.
//
// WHY IT EXISTS AT ALL, found by a parity scan on 2026-08-24: the word "redeem"
// appeared nowhere in the mobile app. A learner who installed from a friend's
// link and stayed in the app could never redeem it, and the friends box made
// that look like it was working, because typing the code did SOMETHING.
//
// IT IS NOT REACHED BY A LINK, and that is the remaining half of the gap. There
// are no universal links or app links configured, so bolo-india.app/join/CODE
// opens the website rather than the app. This screen is the manual path: the
// learner types or pastes the code a friend gave them. Wiring the link itself
// is native configuration and a separate piece of work.
import { useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRedeemReferral, ApiError } from '@workspace/api-client-react';
import { REFERRAL_REWARD_CHAI, normalizeReferralCode } from '@workspace/referral-link';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

type Outcome =
  | { kind: 'idle' }
  | { kind: 'redeemed' }
  | { kind: 'refused'; message: string };

export default function JoinScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(normalizeReferralCode(params.code ?? ''));
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const redeem = useRedeemReferral();

  const value = normalizeReferralCode(code);
  const canSubmit = value.length > 0 && !redeem.isPending;

  const submit = () => {
    if (!canSubmit) return;
    Keyboard.dismiss();
    setOutcome({ kind: 'idle' });
    redeem.mutate(
      { data: { code: value } },
      {
        onSuccess: () => setOutcome({ kind: 'redeemed' }),
        onError: (err) => {
          // EVERY REFUSAL READS THE SAME except the two the learner can act on.
          // An unknown code, a near miss and their own code must be
          // indistinguishable, or this box becomes a way to discover which
          // codes exist. 409 and 429 are different: both tell the learner
          // something true about themselves rather than about anybody else.
          const status = err instanceof ApiError ? err.status : 0;
          setOutcome({
            kind: 'refused',
            message:
              status === 409
                ? 'You have already used a code. Each learner gets one.'
                : status === 429
                  ? 'Too many tries. Give it a few minutes.'
                  : "That code didn't match. Check it and try again.",
          });
        },
      },
    );
  };

  const s = styles(colors);

  if (outcome.kind === 'redeemed') {
    return (
      <View style={[s.root, s.center, { backgroundColor: colors.background }]} testID="join-done">
        <Text style={[s.h1, { color: colors.foreground }]}>You are in</Text>
        <Text style={[s.body, { color: colors.mutedForeground }]}>
          You and your friend each get {REFERRAL_REWARD_CHAI} Chai, and you are
          now friends on the leaderboard.
        </Text>
        <Pressable
          onPress={() => router.replace('/journey')}
          style={[s.cta, { backgroundColor: colors.primary }]}
        >
          <Text style={s.ctaText}>Start learning</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      contentContainerStyle={s.pad}
      testID="join-screen"
    >
      <Text style={[s.h1, { color: colors.foreground }]}>Got a code?</Text>
      <Text style={[s.body, { color: colors.mutedForeground }]}>
        Enter the code a friend gave you. You both get {REFERRAL_REWARD_CHAI}{' '}
        Chai, and it only works once.
      </Text>

      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="ABCD12"
        placeholderTextColor={colors.mutedForeground}
        // The code alphabet has no O, 0, I or 1, so autocorrect and
        // autocapitalise would both fight the learner rather than help.
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        maxLength={12}
        onSubmitEditing={submit}
        returnKeyType="go"
        testID="join-code"
        style={[
          s.input,
          { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground },
        ]}
      />

      {outcome.kind === 'refused' && (
        <Text style={[s.error, { color: colors.destructive ?? '#e0342c' }]} testID="join-error">
          {outcome.message}
        </Text>
      )}

      <Pressable
        onPress={submit}
        disabled={!canSubmit}
        testID="join-submit"
        style={[s.cta, { backgroundColor: colors.primary, opacity: canSubmit ? 1 : 0.5 }]}
      >
        <Text style={s.ctaText}>{redeem.isPending ? 'Checking…' : 'Redeem'}</Text>
      </Pressable>

      <Pressable onPress={() => router.back()}>
        <Text style={[s.link, { color: colors.mutedForeground }]}>Not now</Text>
      </Pressable>
    </ScrollView>
  );
}

function styles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    pad: { padding: 20, gap: 14 },
    center: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
    h1: { fontFamily: AppFonts.extrabold, fontSize: 24 },
    body: { fontFamily: AppFonts.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
    input: {
      borderWidth: 1,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontFamily: AppFonts.bold,
      fontSize: 20,
      letterSpacing: 4,
      textAlign: 'center',
    },
    error: { fontFamily: AppFonts.regular, fontSize: 13, textAlign: 'center' },
    cta: { borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
    ctaText: { fontFamily: AppFonts.bold, fontSize: 15, color: '#fff' },
    link: { fontFamily: AppFonts.regular, fontSize: 13, textAlign: 'center' },
  });
}
