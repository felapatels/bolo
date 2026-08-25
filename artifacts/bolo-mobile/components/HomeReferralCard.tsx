// Task #1049: the referral entry point on mobile home — the twin of web's
// components/home-referral-card.tsx. Compact by design: gift icon, headline,
// one line of copy, one button that opens the native share sheet with the
// learner's referral link. It never shows the raw code, the URL text, the
// Joined / Pending / Chai earned row or a Copy link button; the full referral
// surface lives in web settings and is deliberately NOT ported here.
//
// The link comes from lib/referral (which builds it through the one shared
// @workspace/referral-link module the web app uses), and the Chai figure is
// that module's REFERRAL_REWARD_CHAI — contract-tested against the server's
// reward constants, never a literal.
import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGetReferral } from '@workspace/api-client-react';
import { REFERRAL_REWARD_CHAI } from '@workspace/referral-link';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';
import { referralLinkFor } from '@/lib/referral';

export function HomeReferralCard() {
  const router = useRouter();
  const colors = useColors();
  const { data, isLoading, isError } = useGetReferral();

  const link = referralLinkFor(data?.code);

  // Nothing half-built on home: absent while the code is in flight, if the
  // query failed, or when no web domain is configured to point the link at
  // (the same rule the Privacy Policy link follows).
  if (isLoading || isError || !link) return null;

  const onShare = async () => {
    hapticLight();
    try {
      await Share.share({
        message: `Learn your family's language with me on Bolo! Use my link and we both get ${REFERRAL_REWARD_CHAI} Chai. ${link}`,
        url: link,
      });
    } catch {
      // The learner dismissed the sheet or sharing is unavailable — no-op.
    }
  };

  return (
    <View
      testID="home-referral-card"
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${colors.primary}1A` }]}>
          <Feather name="gift" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Invite a friend, earn Chai
          </Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            You both get {REFERRAL_REWARD_CHAI} Chai when they finish their
            first practice.
          </Text>
        </View>
      </View>
      <PressableScale
        testID="home-referral-share"
        accessibilityRole="button"
        accessibilityLabel="Share invite"
        onPress={onShare}
        style={[styles.button, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>
          Share invite
        </Text>
      </PressableScale>
      {/* THE OTHER DIRECTION, and it had no door until 2026-08-24. This card
          only ever let a learner GIVE their code away; the word "redeem"
          appeared nowhere in the app, so somebody who installed from a
          friend's link could never claim it. There are still no universal
          links, so bolo-india.app/join/CODE opens the website rather than
          this, which makes a manual way in the only way in. */}
      <PressableScale
        testID="home-referral-redeem"
        accessibilityRole="button"
        accessibilityLabel="Enter a friend's code"
        onPress={() => router.push('/join')}
        style={styles.redeem}
      >
        <Text style={[styles.redeemText, { color: colors.mutedForeground }]}>
          Got a code from a friend?
        </Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same quiet bordered treatment as the Phrasebook door card on this screen.
  redeem: { paddingTop: 10, alignItems: 'center' },
  redeemText: { fontSize: 13, textDecorationLine: 'underline' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: AppFonts.bold, fontSize: 16 },
  sub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 1 },
  button: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: { fontFamily: AppFonts.extrabold, fontSize: 14 },
});
