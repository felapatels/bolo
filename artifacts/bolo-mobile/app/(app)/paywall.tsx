import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { PurchasesPackage } from 'react-native-purchases';
import {
  getGetEntitlementsQueryKey,
  useGetTokens,
  useSetChosenLanguage,
} from '@workspace/api-client-react';
import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { FunFactLoader } from '@/components/FunFactLoader';
import {
  usePurchases,
  isTestPurchaseRuntime,
  type PurchaseTier,
} from '@/contexts/PurchasesContext';
import { useEntitlements } from '@/contexts/EntitlementsContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useColors } from '@/hooks/useColors';
import { SpeechBubble } from '@/components/SpeechBubble';
import { Mascot } from '@/components/Mascot';
import { Landmark } from '@/components/journey/Landmark';
import { ChaiGlyph } from '@/components/ChaiStall';
import { AppFonts, isTallCascadingScript, nativeTextStyle } from '@/constants/fonts';
import { hapticLight } from '@/lib/haptics';
import { track, ANALYTICS_EVENTS } from '@/lib/analytics';
import {
  openPrivacyPolicyAlways,
  openTermsOfUse,
  PRIVACY_POLICY_URL_ALWAYS,
  TERMS_OF_USE_URL,
} from '@/lib/legal';

// Hindi is always free, so it is never a One-Language "chosen" language.
const FREE_LANGUAGE = 'hi';

type Benefit = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  desc: string;
};

/**
 * The All-Access list. The chai drop takes the SERVED figure rather than a
 * literal, because tokenEconomy.ts owns every economy number and says so: the
 * allowance already moved once (50 to 15) server-side on purpose, so that no
 * client release was needed. A paywall with a stale price on it is worse than
 * one that never mentioned the benefit.
 */
export function allAccessBenefits(monthlyChai: number | null): Benefit[] {
  return [
  {
    icon: 'globe',
    title: 'Every language',
    desc: 'Learn any language, not just Hindi.',
  },
  {
    icon: 'zap',
    title: 'Full phrase library',
    desc: 'Every phrase, sentence & game, no daily cap.',
  },
  {
    icon: 'repeat',
    title: 'Review weakest phrases',
    desc: 'Smart sessions drill exactly what you miss.',
  },
  {
    icon: 'bar-chart-2',
    title: 'Advanced analytics',
    desc: 'See detailed progress across every topic.',
  },
  {
    icon: 'award',
    title: 'Exclusive badges',
    desc: 'Earn exclusive achievements as you learn.',
  },
  // Last, deliberately: it is the only benefit with a recurring shape and a
  // number, so it is the one a reader carries away from the bottom of a list.
  // Dropped entirely when the figure has not loaded, rather than shown with a
  // blank or a guess where a price should be.
  ...(monthlyChai != null && monthlyChai > 0
    ? [
        {
          icon: 'coffee' as const,
          title: 'Free Chai Drop Every Month!',
          desc: `${monthlyChai} Chai to spend in BOLO Bazaar`,
        },
      ]
    : []),
  ];
}

function oneLanguageBenefits(chosenName: string | null): Benefit[] {
  return [
    {
      icon: 'globe',
      title: chosenName ? `${chosenName} + Hindi` : 'One language + Hindi',
      desc: 'Unlock the language you choose, on top of free Hindi.',
    },
    {
      icon: 'zap',
      title: 'Full phrase library',
      desc: 'Every phrase and sentence, no daily cap.',
    },
  ];
}

const UNIT_WORDS: Record<string, string> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
};

// Derives the free-trial label straight from the store product metadata — never
// hardcoded. The Test Store can't model trials, so this returns null there.
function trialLabel(pkg: PurchasesPackage | null): string | null {
  const intro = pkg?.product.introPrice;
  if (!intro || intro.price !== 0) return null;
  const n = intro.periodNumberOfUnits;
  const unit = UNIT_WORDS[intro.periodUnit ?? ''] ?? 'day';
  return `${n}-${unit}${n === 1 ? '' : 's'} free trial`;
}

export default function PaywallScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    allAccessMonthly,
    allAccessAnnual,
    oneLanguageMonthly,
    oneLanguageAnnual,
    isConfigured,
    isReady,
    isPurchasing,
    isRestoring,
    purchase,
    restore,
  } = usePurchases();
  const { plan, isPlus, chosenLanguage } = useEntitlements();
  // Read only for the monthly chai figure on the benefit list. Every caller
  // gets it, subscriber or not, and the grant inside GET /tokens is a no-op
  // for anyone who is not already on a paid plan, so showing this screen can
  // never hand somebody chai they have not paid for.
  const tokens = useGetTokens();
  const { languages, activeLang } = useLanguage();
  const setChosenLanguage = useSetChosenLanguage();

  // A locked language tapped elsewhere lands here as ?lang=<code>. This only
  // preselects the One-Language tier below if that tier is actually
  // purchasable; it can never force a tier the store can't sell.
  // ?reason=daily_lesson_limit is forwarded by paywallHrefForDenial so we can
  // surface a contextual trial banner when the learner arrived from the cap.
  const params = useLocalSearchParams<{ lang?: string; reason?: string }>();
  const requestedLang =
    typeof params.lang === 'string' && params.lang !== FREE_LANGUAGE
      ? params.lang
      : null;
  const isDailyLimitDenial = params.reason === 'daily_lesson_limit';

  const hasOneLanguage = !!(oneLanguageMonthly || oneLanguageAnnual);
  const hasAllAccess = !!(allAccessMonthly || allAccessAnnual);
  const hasOfferings = hasOneLanguage || hasAllAccess;

  // A One-Language subscriber can only meaningfully move to all-access; a Free
  // learner may choose either tier — but ONLY when a real, purchasable
  // one_language package exists. The tier is resolved from purchasability in
  // the effect below, never from the `?lang=` param alone: a locked-language
  // deep link must not be able to open a tier the store can't actually sell.
  const [tier, setTier] = useState<PurchaseTier>('all_access');
  const [interval, setInterval] = useState<'annual' | 'monthly'>('annual');
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [langPickerVisible, setLangPickerVisible] = useState(false);
  const [status, setStatus] = useState<{
    kind: 'error' | 'success' | 'info';
    text: string;
  } | null>(null);

  // The languages a One-Language buyer can pick from: everything except free
  // Hindi. Once on the middle tier, the choice is locked to the server value.
  const choosableLanguages = useMemo(
    () => languages.filter((l) => l.code !== FREE_LANGUAGE),
    [languages],
  );

  const [chosenLangCode, setChosenLangCode] = useState<string | null>(
    chosenLanguage ??
      requestedLang ??
      (activeLang !== FREE_LANGUAGE ? activeLang : null),
  );

  // The paywall surface was reached.
  useEffect(() => {
    track(ANALYTICS_EVENTS.PAYWALL_VIEWED);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve the tier from what the store can actually sell — never from the
  // `?lang=` param by itself. A One-Language subscriber can only buy
  // all-access. If only one tier has a real package, that's the tier. If
  // both are purchasable, honor a locked-language deep link as a (harmless)
  // preselection; otherwise all-access is the default emphasis.
  useEffect(() => {
    if (plan === 'one_language') {
      setTier('all_access');
      return;
    }
    if (!hasAllAccess && hasOneLanguage) {
      setTier('one_language');
      return;
    }
    if (!hasOneLanguage) {
      setTier('all_access');
      return;
    }
    setTier(requestedLang ? 'one_language' : 'all_access');
  }, [plan, hasAllAccess, hasOneLanguage, requestedLang]);

  // Once on the middle tier the language is fixed to the server's record.
  useEffect(() => {
    if (plan === 'one_language' && chosenLanguage) {
      setChosenLangCode(chosenLanguage);
    }
  }, [plan, chosenLanguage]);

  // Default a One-Language pick once the language list arrives.
  useEffect(() => {
    if (!chosenLangCode && choosableLanguages.length > 0) {
      setChosenLangCode(choosableLanguages[0].code);
    }
  }, [chosenLangCode, choosableLanguages]);

  const canSwitchLanguage = plan !== 'one_language';
  const chosenLangName =
    languages.find((l) => l.code === chosenLangCode)?.name ?? null;

  const benefits =
    tier === 'all_access'
      ? allAccessBenefits(tokens.data?.allowanceAllAccessMonthly ?? null)
      : oneLanguageBenefits(chosenLangName);

  const monthlyPackage =
    tier === 'all_access' ? allAccessMonthly : oneLanguageMonthly;
  const annualPackage =
    tier === 'all_access' ? allAccessAnnual : oneLanguageAnnual;
  const selectedPackage = interval === 'annual' ? annualPackage : monthlyPackage;

  // The 7-day trial applies to all-access only.
  const trial =
    tier === 'all_access'
      ? trialLabel(selectedPackage ?? annualPackage ?? monthlyPackage)
      : null;

  const showTierToggle =
    plan === 'free' && hasOneLanguage && hasAllAccess;

  const close = useCallback(() => router.back(), [router]);

  // The server (via the store webhook / reconcile-on-read) is the source of
  // truth for the plan, so after a purchase we invalidate every query to pull
  // the freshly-unlocked entitlements and gated content, then close.
  const onUnlocked = useCallback(async () => {
    setStatus({ kind: 'success', text: 'You’re in! Unlocking everything…' });
    await queryClient.refetchQueries({ queryKey: getGetEntitlementsQueryKey() });
    await queryClient.invalidateQueries();
    setTimeout(close, 1100);
  }, [queryClient, close]);

  const runPurchase = useCallback(
    async (pkg: PurchasesPackage) => {
      setStatus(null);
      const outcome = await purchase(pkg);
      if (outcome === 'success') {
        track(ANALYTICS_EVENTS.PURCHASE_COMPLETED, { tier });
        // Record the chosen language for the middle tier so entitlements
        // resolve to Hindi + that language. Best-effort: a locked (409) choice
        // just means it's already set; either way we refetch the server truth.
        if (tier === 'one_language' && chosenLangCode) {
          try {
            await setChosenLanguage.mutateAsync({
              data: { language: chosenLangCode },
            });
          } catch {
            // Non-fatal — the store webhook reconciles the language server-side.
          }
        }
        await onUnlocked();
      } else if (outcome === 'error') {
        setStatus({
          kind: 'error',
          text: 'That purchase didn’t go through. Please try again.',
        });
      }
      // 'cancelled' — silently return to the paywall.
    },
    [purchase, onUnlocked, tier, chosenLangCode, setChosenLanguage],
  );

  const onSubscribe = useCallback(() => {
    if (!selectedPackage) return;
    // A One-Language purchase needs a concrete language locked in first.
    if (tier === 'one_language' && !chosenLangCode) {
      setLangPickerVisible(true);
      return;
    }
    // Guard test/sandbox purchases behind an explicit confirm (custom modal, not
    // a system alert) so a tap can't accidentally trigger a store purchase.
    if (isTestPurchaseRuntime()) {
      setConfirmVisible(true);
      return;
    }
    runPurchase(selectedPackage);
  }, [selectedPackage, tier, chosenLangCode, runPurchase]);

  const onRestore = useCallback(async () => {
    setStatus(null);
    const ok = await restore();
    if (ok) {
      await onUnlocked();
    } else {
      setStatus({
        kind: 'info',
        text: 'No previous purchases found to restore.',
      });
    }
  }, [restore, onUnlocked]);

  const busy = isPurchasing || isRestoring;

  const ctaTitle =
    plan === 'one_language'
      ? 'Upgrade to all-access'
      : trial
        ? 'Start free trial'
        : 'Subscribe';

  const brandTitle = tier === 'all_access' ? 'Bolo! All-Access' : 'One Language';

  return (
    <Screen padTop={false}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={[styles.brandDot, { backgroundColor: colors.gold }]}>
            <Feather name="star" size={16} color="#1a1200" />
          </View>
          <Text style={[styles.brand, { color: colors.foreground }]}>
            {brandTitle}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close"
          onPress={() => {
            hapticLight();
            close();
          }}
          style={[styles.closeBtn, { backgroundColor: colors.muted }]}
        >
          <Feather name="x" size={20} color={colors.foreground} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* THE STATION BEHIND THE WORDS, at a whisper (build 22, the owner's
            paywall mockup): the map's own station silhouette, top right. */}
        <View pointerEvents="none" style={styles.stationSketch}>
          <Landmark city="Kanpur Central" width={200} height={120} ink="#3B2A1E" paper="transparent" opacity={0.08} />
        </View>
        <Text style={[styles.headline, { color: colors.foreground }]}>
          {tier === 'all_access' ? (
            <>
              {'Learn faster, '}
              <Text style={{ color: colors.primary }}>in every language</Text>
            </>
          ) : (
            'Go all-in on one language'
          )}
        </Text>
        <Text style={[styles.subhead, { color: colors.mutedForeground }]}>
          {tier === 'all_access'
            ? 'Unlock the full Bolo! experience.'
            : 'Learn Hindi and the language you choose, no daily cap.'}
        </Text>

        {/* Trial banner — shown when the learner arrived after hitting the daily cap */}
        {isDailyLimitDenial && tier === 'all_access' && (
          <View
            style={[
              styles.trialBanner,
              {
                backgroundColor: `${colors.success}1A`,
                borderColor: `${colors.success}40`,
              },
            ]}
          >
            <Feather name="zap" size={16} color={colors.success} />
            <Text style={[styles.trialBannerText, { color: colors.success }]}>
              You qualify for a{' '}
              <Text style={{ fontFamily: AppFonts.bold }}>7-day free trial</Text>
              . All-Access is pre-selected.
            </Text>
          </View>
        )}

        {/* Plan is decided server-side; render the matching state. */}
        {isPlus ? (
          <View
            style={[
              styles.plusState,
              {
                backgroundColor: `${colors.success}1A`,
                borderColor: colors.success,
              },
            ]}
          >
            <Feather name="check-circle" size={22} color={colors.success} />
            <Text style={[styles.plusStateText, { color: colors.foreground }]}>
              You’re on all-access. Everything’s unlocked!
            </Text>
          </View>
        ) : isConfigured && !isReady ? (
          <FunFactLoader color={colors.primary} style={{ marginVertical: 24 }} />
        ) : hasOfferings ? (
          <>
            {plan === 'one_language' ? (
              <View
                style={[
                  styles.currentPlanNote,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Feather name="check-circle" size={20} color={colors.success} />
                <Text
                  style={[styles.currentPlanText, { color: colors.foreground }]}
                >
                  You’re on One Language
                  {chosenLangName ? ` (${chosenLangName})` : ''}. Upgrade to
                  all-access for every language, review & analytics.
                </Text>
              </View>
            ) : showTierToggle ? (
              <View style={styles.tierToggle}>
                <TierCard
                  label="One Language"
                  priceHint={
                    oneLanguageMonthly
                      ? `${oneLanguageMonthly.product.priceString}/mo`
                      : 'Your chosen language'
                  }
                  selected={tier === 'one_language'}
                  onPress={() => setTier('one_language')}
                />
                <TierCard
                  label="All-Access"
                  priceHint={
                    allAccessMonthly
                      ? `${allAccessMonthly.product.priceString}/mo`
                      : 'Best value'
                  }
                  selected={tier === 'all_access'}
                  onPress={() => setTier('all_access')}
                />
              </View>
            ) : null}

            {/* Benefits for the selected tier, with Bolo beside them (build
                22, the mockup: the bird gives a thumbs up under "All access.
                All aboard!" while the list runs down the right). */}
            <View style={styles.benefitsBlock}>
              {tier === 'all_access' ? (
                <View style={styles.birdColumn}>
                  <SpeechBubble tail="down" style={styles.birdBubble}>
                    <Text style={{ color: colors.primary, fontFamily: AppFonts.bold }}>{'All access.\nAll aboard!'}</Text>
                  </SpeechBubble>
                  <Mascot pose="thumbsup" size={132} motion="none" entering={false} />
                </View>
              ) : null}
              <View style={{ flex: 1, minWidth: 0, gap: 0 }}>
              {benefits.map((b, bi) => (
                <View key={b.title} style={[styles.benefitRow, bi > 0 && styles.benefitRule]}>
                  <View
                    style={[
                      styles.benefitIcon,
                      { backgroundColor: `${colors.primary}1A` },
                    ]}
                  >
                    <Feather name={b.icon} size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.benefitTitle, { color: colors.foreground }]}
                    >
                      {b.title}
                    </Text>
                    <Text
                      style={[
                        styles.benefitDesc,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {b.desc}
                    </Text>
                  </View>
                </View>
              ))}
              </View>
            </View>

            {/* One-Language: which language you're subscribing to */}
            {tier === 'one_language' ? (
              <Pressable
                onPress={
                  canSwitchLanguage
                    ? () => {
                        hapticLight();
                        setLangPickerVisible(true);
                      }
                    : undefined
                }
                disabled={!canSwitchLanguage}
                style={[
                  styles.langSelect,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.langSelectIcon,
                    { backgroundColor: `${colors.primary}1A` },
                  ]}
                >
                  <Feather name="globe" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.langSelectLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {canSwitchLanguage
                      ? 'Your language (locked in once you subscribe)'
                      : 'Your language (locked for this subscription)'}
                  </Text>
                  <Text
                    style={[
                      styles.langSelectName,
                      { color: colors.foreground },
                    ]}
                  >
                    {chosenLangName ?? 'Choose a language'}
                  </Text>
                </View>
                {canSwitchLanguage ? (
                  <Feather
                    name="chevron-right"
                    size={20}
                    color={colors.mutedForeground}
                  />
                ) : (
                  <Feather name="lock" size={18} color={colors.mutedForeground} />
                )}
              </Pressable>
            ) : null}

            {/* Interval options with live store prices */}
            {annualPackage ? (
              <PlanOption
                label="Annual"
                priceString={annualPackage.product.priceString}
                period="per year"
                best
                monthlyEquivalent={perMonthString(annualPackage)}
                savePct={savePercent(annualPackage, monthlyPackage)}
                selected={interval === 'annual'}
                onPress={() => setInterval('annual')}
              />
            ) : null}
            {monthlyPackage ? (
              <PlanOption
                label="Monthly"
                priceString={monthlyPackage.product.priceString}
                period="per month"
                selected={interval === 'monthly'}
                onPress={() => setInterval('monthly')}
              />
            ) : null}

            {trial ? (
              <View style={styles.trialBox}>
                <Feather name="shield" size={22} color="#92650A" />
                <Text style={[styles.trialNote, { color: colors.foreground }]}>
                  {`${trial}, then billed automatically. `}
                  <Text style={{ color: colors.success, fontFamily: AppFonts.bold }}>Cancel anytime.</Text>
                </Text>
                <ChaiGlyph size={30} />
              </View>
            ) : null}

            {/* App Review, Guideline 3.1.2(c): the purchase flow itself must
                link the Terms of Use (EULA) and the privacy policy. Seated
                with the trial disclosure, ABOVE the purchase button, so both
                are on screen without scrolling past the CTA. */}
            <LegalLinks />

            {status ? (
              <Text
                style={[
                  styles.status,
                  {
                    color:
                      status.kind === 'error'
                        ? colors.destructive
                        : status.kind === 'success'
                          ? colors.success
                          : colors.mutedForeground,
                  },
                ]}
              >
                {status.text}
              </Text>
            ) : null}

            <ChunkyButton
              title={ctaTitle}
              icon="unlock"
              onPress={onSubscribe}
              loading={isPurchasing}
              disabled={busy || !selectedPackage}
              style={{ marginTop: 18 }}
            />

            <Pressable
              onPress={() => {
                hapticLight();
                onRestore();
              }}
              disabled={busy}
              style={{ marginTop: 16, alignItems: 'center' }}
            >
              <View style={styles.restoreRow}>
                <Feather name="rotate-ccw" size={14} color={colors.mutedForeground} />
                <Text style={[styles.restore, { color: colors.mutedForeground }]}>
                  {isRestoring ? 'Restoring…' : 'Restore purchases'}
                </Text>
              </View>
            </Pressable>
          </>
        ) : (
          <View
            style={[
              styles.unavailable,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Feather name="clock" size={22} color={colors.mutedForeground} />
            <Text
              style={[styles.unavailableText, { color: colors.mutedForeground }]}
            >
              Subscriptions aren’t available in this build yet. Check back soon.
            </Text>
            <Pressable
              onPress={() => {
                hapticLight();
                onRestore();
              }}
              disabled={busy}
              style={{ marginTop: 6 }}
            >
              <Text style={[styles.restore, { color: colors.primary }]}>
                {isRestoring ? 'Restoring…' : 'Restore purchases'}
              </Text>
            </Pressable>
            {/* The disclosure links belong to the whole subscription surface,
                not just the branch that can transact today. */}
            <LegalLinks />
          </View>
        )}
      </ScrollView>

      {/* One-Language language picker */}
      <Modal
        visible={langPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLangPickerVisible(false)}
      >
        <View style={styles.sheetScrim}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                Choose your language
              </Text>
              <Pressable
                accessibilityLabel="Close"
                onPress={() => {
                  hapticLight();
                  setLangPickerVisible(false);
                }}
                style={[styles.closeBtn, { backgroundColor: colors.muted }]}
              >
                <Feather name="x" size={20} color={colors.foreground} />
              </Pressable>
            </View>
            <Text style={[styles.sheetHint, { color: colors.mutedForeground }]}>
              This is locked in for your subscription. Hindi is always included
              free.
            </Text>
            <FlatList
              data={choosableLanguages}
              keyExtractor={(l) => l.code}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const active = item.code === chosenLangCode;
                const tall = isTallCascadingScript(item);
                return (
                  <Pressable
                    onPress={() => {
                      hapticLight();
                      setChosenLangCode(item.code);
                      setLangPickerVisible(false);
                    }}
                    style={[
                      styles.langRow,
                      tall && styles.langRowTall,
                      {
                        backgroundColor: active
                          ? `${colors.primary}14`
                          : colors.card,
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          nativeTextStyle(item, { bold: true }),
                          styles.langRowNative,
                          tall && styles.langRowNativeTall,
                          { color: colors.foreground },
                        ]}
                      >
                        {item.nativeName}
                      </Text>
                      <Text
                        style={[
                          styles.langRowName,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {item.name} · {item.script}
                      </Text>
                    </View>
                    <Feather
                      name={active ? 'check-circle' : 'circle'}
                      size={22}
                      color={active ? colors.primary : colors.border}
                    />
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Custom test-purchase confirmation (never a system Alert). */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.modalScrim}>
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Confirm test purchase
            </Text>
            <Text style={[styles.modalBody, { color: colors.mutedForeground }]}>
              You’re in a test environment. Continue with a sandbox purchase of{' '}
              {selectedPackage?.product.priceString ?? 'this plan'}
              {tier === 'one_language' && chosenLangName
                ? ` for ${chosenLangName}`
                : ''}
              ?
            </Text>
            <ChunkyButton
              title="Continue"
              onPress={() => {
                setConfirmVisible(false);
                if (selectedPackage) runPurchase(selectedPackage);
              }}
              style={{ marginTop: 18 }}
            />
            <Pressable
              onPress={() => {
                hapticLight();
                setConfirmVisible(false);
              }}
              style={{ marginTop: 14, alignItems: 'center' }}
            >
              <Text style={[styles.restore, { color: colors.mutedForeground }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

// Localized per-month equivalent of an annual package, for the "just $x/mo" hint.
function perMonthString(pkg: PurchasesPackage): string {
  const perMonth = pkg.product.price / 12;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: pkg.product.currencyCode ?? 'USD',
    }).format(perMonth);
  } catch {
    return `${perMonth.toFixed(2)}`;
  }
}

function TierCard({
  label,
  priceHint,
  selected,
  onPress,
}: {
  label: string;
  priceHint: string;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={[
        styles.tierCard,
        {
          backgroundColor: selected ? `${colors.primary}12` : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
      ]}
    >
      <Text style={[styles.tierLabel, { color: colors.foreground }]}>
        {label}
      </Text>
      <Text style={[styles.tierHint, { color: colors.mutedForeground }]}>
        {priceHint}
      </Text>
    </Pressable>
  );
}

/** How much the annual plan saves against twelve months, whole percent, or
 *  null when either price is unknown or the saving is nothing. */
function savePercent(annual: PurchasesPackage | null, monthly: PurchasesPackage | null): number | null {
  if (!annual || !monthly) return null;
  const a = annual.product.price;
  const m = monthly.product.price;
  if (!(a > 0) || !(m > 0)) return null;
  const pct = Math.round(100 * (1 - a / (12 * m)));
  return pct > 0 ? pct : null;
}

function PlanOption({
  label,
  priceString,
  period,
  monthlyEquivalent,
  best,
  savePct,
  selected,
  onPress,
}: {
  label: string;
  priceString: string;
  period: string;
  monthlyEquivalent?: string;
  best?: boolean;
  /** The annual card's saving against monthly, as a badge (build 22). */
  savePct?: number | null;
  selected: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      style={[
        styles.plan,
        {
          backgroundColor: selected ? `${colors.primary}12` : colors.card,
          borderColor: selected ? colors.primary : colors.border,
        },
        // Room at the right for the kulhads and the badge (build 22).
        best && { paddingRight: 96, minHeight: 98 },
      ]}
    >
      <View
        style={[
          styles.radio,
          { borderColor: selected ? colors.primary : colors.border },
        ]}
      >
        {selected ? (
          <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <View style={styles.planLabelRow}>
          <Text style={[styles.planLabel, { color: colors.foreground }]}>
            {label}
          </Text>
          {best ? (
            <View style={[styles.bestPill, { backgroundColor: colors.gold }]}>
              <Text style={styles.bestText}>BEST VALUE</Text>
            </View>
          ) : null}
        </View>
        {monthlyEquivalent ? (
          <Text style={[styles.planSub, { color: colors.primary }]}>
            Just {monthlyEquivalent}/mo
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.planPrice, { color: best ? colors.primary : colors.foreground }]}>
          {priceString}
        </Text>
        <Text style={[styles.planPeriod, { color: colors.mutedForeground }]}>
          {period}
        </Text>
      </View>
      {best ? (
        <View style={styles.planArt} pointerEvents="none">
          <View style={styles.kulhads}>
            <ChaiGlyph size={22} />
            <ChaiGlyph size={28} />
            <ChaiGlyph size={22} />
          </View>
          {savePct ? (
            <View style={[styles.saveBadge, { backgroundColor: colors.primary }]} testID="plan-save-badge">
              <Text style={styles.saveText}>SAVE</Text>
              <Text style={styles.savePct}>{savePct}%</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Terms of Use (EULA) and privacy policy, required inside the purchase flow by
 * App Review Guideline 3.1.2(c). Both URLs are always defined (lib/legal.ts
 * falls back to the production domain), so this renders unconditionally: a
 * paywall that sometimes hides these links is the rejection we just took.
 */
function LegalLinks() {
  const colors = useColors();
  return (
    <View style={styles.legalRow}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Terms of Use"
        accessibilityHint={TERMS_OF_USE_URL}
        hitSlop={10}
        onPress={() => {
          hapticLight();
          void openTermsOfUse();
        }}
      >
        <Text style={[styles.legalLink, { color: colors.primary }]}>
          Terms of Use
        </Text>
      </Pressable>
      <Text style={[styles.legalDot, { color: colors.mutedForeground }]}>·</Text>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Privacy Policy"
        accessibilityHint={PRIVACY_POLICY_URL_ALWAYS}
        hitSlop={10}
        onPress={() => {
          hapticLight();
          void openPrivacyPolicyAlways();
        }}
      >
        <Text style={[styles.legalLink, { color: colors.primary }]}>
          Privacy Policy
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  legalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  legalLink: {
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  legalDot: { fontFamily: AppFonts.semibold, fontSize: 13 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandDot: {
    width: 32,
    height: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { fontFamily: AppFonts.extrabold, fontSize: 26, lineHeight: 32 },
  subhead: { fontFamily: AppFonts.regular, fontSize: 15, marginTop: 6 },
  tierToggle: { flexDirection: 'row', gap: 12, marginTop: 20 },
  tierCard: {
    flex: 1,
    padding: 16,
    borderRadius: 18,
    borderWidth: 2,
    gap: 4,
  },
  tierLabel: { fontFamily: AppFonts.bold, fontSize: 16 },
  tierHint: { fontFamily: AppFonts.semibold, fontSize: 13 },
  currentPlanNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 20,
  },
  currentPlanText: { flex: 1, fontFamily: AppFonts.semibold, fontSize: 14 },
  stationSketch: { position: 'absolute', right: 0, top: -4 },
  benefitsBlock: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 20, marginBottom: 20 },
  birdColumn: { width: 132, alignItems: 'center', gap: 6, paddingTop: 6 },
  birdBubble: { alignSelf: 'center' },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  benefitRule: { borderTopWidth: 1, borderStyle: 'dashed', borderColor: '#E8DFCB' },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  benefitDesc: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 1 },
  langSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 16,
  },
  langSelectIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langSelectLabel: { fontFamily: AppFonts.regular, fontSize: 12 },
  langSelectName: { fontFamily: AppFonts.bold, fontSize: 16, marginTop: 2 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 12,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  planLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planLabel: { fontFamily: AppFonts.bold, fontSize: 17 },
  planSub: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 2 },
  planPrice: { fontFamily: AppFonts.extrabold, fontSize: 18 },
  planPeriod: { fontFamily: AppFonts.regular, fontSize: 12, marginTop: 1 },
  bestPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  planArt: { position: 'absolute', right: 10, bottom: 8, alignItems: 'center' },
  kulhads: { flexDirection: 'row', alignItems: 'flex-end', gap: -6 },
  saveBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginLeft: 30 },
  saveText: { fontFamily: AppFonts.extrabold, fontSize: 8, color: '#FFFFFF', letterSpacing: 0.6 },
  savePct: { fontFamily: AppFonts.extrabold, fontSize: 12, color: '#FFFFFF', lineHeight: 14 },
  trialBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 14,
    padding: 14,
    borderRadius: 16,
    backgroundColor: '#FBF0DC',
  },
  restoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bestText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 9,
    letterSpacing: 0.5,
    color: '#ffffff',
  },
  trialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
  },
  trialBannerText: {
    flex: 1,
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    lineHeight: 18,
  },
  // In the trial box since build 22: a line beside the shield, not centred.
  trialNote: {
    flex: 1,
    fontFamily: AppFonts.semibold,
    fontSize: 13,
    lineHeight: 18,
  },
  status: {
    fontFamily: AppFonts.semibold,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 14,
  },
  restore: { fontFamily: AppFonts.semibold, fontSize: 15 },
  plusState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    borderRadius: 20,
    borderWidth: 1.5,
    marginTop: 20,
  },
  plusStateText: { flex: 1, fontFamily: AppFonts.semibold, fontSize: 15 },
  unavailable: {
    alignItems: 'center',
    gap: 10,
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 20,
  },
  unavailableText: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  sheetScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  sheetHint: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 18,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
    marginBottom: 10,
  },
  langRowNative: { fontSize: 20 },
  // Nastaliq glyphs cascade above/below baseline; extra lineHeight prevents
  // the glyph cluster from overlapping the icon or row border.
  langRowNativeTall: { lineHeight: 44 },
  langRowTall: { paddingVertical: 20 },
  langRowName: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 3 },
  modalScrim: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    padding: 22,
    borderRadius: 24,
    borderWidth: 1,
  },
  modalTitle: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  modalBody: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
  },
});
