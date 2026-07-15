import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  useGetAccountSubscription,
  getGetAccountSubscriptionQueryKey,
  useCancelAccountSubscription,
  usePauseAccountSubscription,
  useAcceptRetentionOffer,
  useResumeAccountSubscription,
  getGetEntitlementsQueryKey,
  type SubscriptionDetails,
  type BillingHistoryEntry,
} from '@workspace/api-client-react';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { PressableScale } from '@/components/PressableScale';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePurchases } from '@/contexts/PurchasesContext';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import {
  openStoreSubscriptions,
  openWebBillingPortal,
  storeName,
} from '@/lib/store';

const PLAN_LABELS: Record<string, string> = {
  plus: 'Bolo! Plus',
  one_language: 'One Language',
  free: 'Free',
};

function planLabel(tier: string): string {
  return PLAN_LABELS[tier] ?? 'Free';
}

/** Human date for a nullable ISO timestamp, or null when absent/invalid. */
function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Compact date (e.g. "Mar 5, 2026") for billing-history rows. */
function formatShortDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** A human plan label for a billing entry, inferred from its product id. */
function billingPlanLabel(productId: string): string {
  const id = productId.toLowerCase();
  if (id.includes('one_language') || id.includes('one-language')) {
    return 'One Language';
  }
  if (id.includes('plus')) return 'Bolo! Plus';
  return 'Subscription';
}

const PERIOD_LABELS: Record<string, string> = {
  trial: 'Free trial',
  intro: 'Intro offer',
  normal: 'Subscription',
};

/** A friendly period descriptor, or null when the provider omits it. */
function periodLabel(periodType: string | null): string | null {
  if (!periodType) return null;
  return PERIOD_LABELS[periodType.toLowerCase()] ?? null;
}

function billingStatusMeta(
  status: string,
  colors: ReturnType<typeof useColors>,
): { label: string; color: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', color: colors.success };
    case 'canceled':
      return { label: 'Canceled', color: colors.destructive };
    case 'expired':
      return { label: 'Expired', color: colors.mutedForeground };
    default:
      return { label: status, color: colors.mutedForeground };
  }
}

/**
 * Subscription management. Reads the server-authoritative snapshot and lets a
 * subscriber see their plan/status/dates/language/payment method, work a
 * retention flow (3-month discount or pause — recorded through the backend),
 * and deep-link to the OS store for the actual cancellation, which Apple/Google
 * don't permit an app to perform directly. Free/expired learners get an upgrade
 * entry point into the existing paywall and can always restore purchases.
 */
export default function SubscriptionScreen() {
  const colors = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { languages } = useLanguage();
  const { restore, isRestoring } = usePurchases();

  const sub = useGetAccountSubscription();
  const cancel = useCancelAccountSubscription();
  const pause = usePauseAccountSubscription();
  const retention = useAcceptRetentionOffer();
  const resume = useResumeAccountSubscription();

  const [retentionOpen, setRetentionOpen] = React.useState(false);
  const [banner, setBanner] = React.useState<{
    kind: 'success' | 'info';
    text: string;
  } | null>(null);

  const details = sub.data;

  // Reflect the server's updated snapshot everywhere and refresh entitlements,
  // which drive what's unlocked across the app.
  const applyDetails = React.useCallback(
    (next: SubscriptionDetails) => {
      qc.setQueryData(getGetAccountSubscriptionQueryKey(), next);
      qc.invalidateQueries({ queryKey: getGetEntitlementsQueryKey() });
    },
    [qc],
  );

  const onRestore = async () => {
    setBanner(null);
    const ok = await restore();
    if (ok) {
      await sub.refetch();
      qc.invalidateQueries({ queryKey: getGetEntitlementsQueryKey() });
      setBanner({ kind: 'success', text: 'Purchases restored.' });
    } else {
      setBanner({ kind: 'info', text: 'No previous purchases found to restore.' });
    }
  };

  const onAcceptRetention = async () => {
    try {
      const next = await retention.mutateAsync();
      applyDetails(next);
      setRetentionOpen(false);
      setBanner({
        kind: 'success',
        text: 'Your discount is applied — welcome back!',
      });
    } catch {
      Alert.alert(
        'Couldn’t apply the offer',
        'This offer may have already been used. Please try again.',
      );
    }
  };

  const onPause = async () => {
    try {
      const next = await pause.mutateAsync({ data: { months: 1 } });
      applyDetails(next);
      setRetentionOpen(false);
      setBanner({
        kind: 'success',
        text: 'Your subscription is paused. Enjoy the break!',
      });
    } catch {
      Alert.alert(
        'Couldn’t pause',
        'We couldn’t pause your subscription. Please try again.',
      );
    }
  };

  // Finish canceling. For store (RevenueCat) subscriptions we record the intent
  // through the backend so entitlements stay correct through the period end,
  // then deep-link to the OS store where the learner completes the cancellation.
  const onCancel = async () => {
    if (!details) return;
    setRetentionOpen(false);
    const managementUrl = details.paymentMethod?.managementUrl ?? null;

    if (details.provider === 'stripe') {
      // Web/Stripe billing must be managed in the Stripe portal — the in-app
      // DB-only endpoints would desync app state from Stripe.
      const opened = await openWebBillingPortal(managementUrl);
      if (!opened) {
        Alert.alert(
          'Manage on the web',
          'Your subscription is billed on the web. Please manage it from the Bolo! website.',
        );
      }
      return;
    }

    try {
      const next = await cancel.mutateAsync();
      applyDetails(next);
    } catch {
      // Non-fatal: still route the learner to the store to finish canceling.
    }
    const opened = await openStoreSubscriptions(managementUrl);
    if (opened) {
      setBanner({
        kind: 'info',
        text: `Finish canceling in ${storeName()}. You’ll keep access until your period ends.`,
      });
    } else {
      setBanner({
        kind: 'info',
        text: 'Your plan is set to cancel at the end of the current period.',
      });
    }
  };

  const onManage = async () => {
    const managementUrl = details?.paymentMethod?.managementUrl ?? null;
    const isStripe = details?.provider === 'stripe';
    const opened = isStripe
      ? await openWebBillingPortal(managementUrl)
      : await openStoreSubscriptions(managementUrl);
    if (!opened) {
      Alert.alert(
        'Nothing to open',
        isStripe
          ? 'We couldn’t open the Bolo! website on this device.'
          : `We couldn’t open ${storeName()} on this device.`,
      );
    }
  };

  // Undo a pending cancellation while the plan is still live. Store (RevenueCat)
  // subscriptions un-cancel through the backend resume endpoint — a plain,
  // repeatable status flip with no discount — so the snapshot reads active
  // again; if it fails we fall back to the store's re-subscribe page. Stripe
  // (web) billing is managed on the web.
  const onReactivate = async () => {
    if (!details) return;
    setBanner(null);
    const managementUrl = details.paymentMethod?.managementUrl ?? null;

    if (details.provider === 'stripe') {
      const opened = await openWebBillingPortal(managementUrl);
      if (!opened) {
        Alert.alert(
          'Manage on the web',
          'Your subscription is billed on the web. Please manage it from the Bolo! website.',
        );
      }
      return;
    }

    try {
      const next = await resume.mutateAsync();
      applyDetails(next);
      setBanner({
        kind: 'success',
        text: 'Your plan is active again — welcome back!',
      });
    } catch {
      // The backend couldn't resume — send the learner to the store to
      // turn auto-renew back on.
      const opened = await openStoreSubscriptions(managementUrl);
      if (opened) {
        setBanner({
          kind: 'info',
          text: `Turn auto-renew back on in ${storeName()} to keep your plan.`,
        });
      } else {
        Alert.alert(
          'Couldn’t reactivate',
          'We couldn’t reactivate your plan just now. Please try again.',
        );
      }
    }
  };

  const busy =
    cancel.isPending ||
    pause.isPending ||
    retention.isPending ||
    resume.isPending;

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerLabel, { color: colors.foreground }]}>
          Subscription
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {sub.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
      ) : sub.isError || !details ? (
        <View style={styles.centerState}>
          <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            We couldn’t load your subscription. Check your connection and try
            again.
          </Text>
          <ChunkyButton
            title="Retry"
            icon="refresh-cw"
            onPress={() => sub.refetch()}
            style={{ marginTop: 6, alignSelf: 'stretch' }}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: TAB_BAR_CLEARANCE,
          }}
          showsVerticalScrollIndicator={false}
        >
          {banner ? (
            <View
              style={[
                styles.banner,
                {
                  backgroundColor:
                    banner.kind === 'success'
                      ? `${colors.success}1A`
                      : colors.card,
                  borderColor:
                    banner.kind === 'success' ? colors.success : colors.border,
                },
              ]}
            >
              <Feather
                name={banner.kind === 'success' ? 'check-circle' : 'info'}
                size={18}
                color={
                  banner.kind === 'success'
                    ? colors.success
                    : colors.mutedForeground
                }
              />
              <Text style={[styles.bannerText, { color: colors.foreground }]}>
                {banner.text}
              </Text>
            </View>
          ) : null}

          <PlanState
            details={details}
            languages={languages}
            onUpgrade={() => router.push('/(app)/paywall')}
            onManage={onManage}
            onCancelPress={() => setRetentionOpen(true)}
            onReactivate={onReactivate}
            busy={busy}
          />

          <BillingHistory entries={details.billingHistory} />

          {/* Restore is always reachable — a reinstall or new device needs it. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            onPress={onRestore}
            disabled={isRestoring}
            style={styles.restoreBtn}
          >
            {isRestoring ? (
              <ActivityIndicator color={colors.mutedForeground} />
            ) : (
              <>
                <Feather
                  name="refresh-ccw"
                  size={16}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[styles.restoreText, { color: colors.mutedForeground }]}
                >
                  Restore purchases
                </Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      )}

      {details ? (
        <RetentionModal
          visible={retentionOpen}
          details={details}
          busy={busy}
          onClose={() => setRetentionOpen(false)}
          onAcceptRetention={onAcceptRetention}
          onPause={onPause}
          onCancel={onCancel}
        />
      ) : null}
    </Screen>
  );
}

function isPaidPlan(d: SubscriptionDetails): boolean {
  return d.tier !== 'free' && d.status !== 'none' && d.status !== 'expired';
}

function PlanState({
  details,
  languages,
  onUpgrade,
  onManage,
  onCancelPress,
  onReactivate,
  busy,
}: {
  details: SubscriptionDetails;
  languages: { code: string; name: string }[];
  onUpgrade: () => void;
  onManage: () => void;
  onCancelPress: () => void;
  onReactivate: () => void;
  busy: boolean;
}) {
  const colors = useColors();
  const paid = isPaidPlan(details);
  const isStripe = details.provider === 'stripe';

  if (!paid) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.planTopRow}>
          <Text style={[styles.planName, { color: colors.foreground }]}>
            Free plan
          </Text>
        </View>
        <Text style={[styles.freeSub, { color: colors.mutedForeground }]}>
          {details.status === 'expired'
            ? 'Your subscription has ended. Go Plus to unlock every language, unlimited lessons, review & analytics.'
            : 'You’re on the free plan. Go Plus to unlock every language, unlimited lessons, review & analytics.'}
        </Text>
        <ChunkyButton
          title="See plans"
          icon="star"
          onPress={onUpgrade}
          style={{ marginTop: 16, alignSelf: 'stretch' }}
        />
      </View>
    );
  }

  const status = statusMeta(details, colors);
  const chosenName =
    details.chosenLanguage != null
      ? languages.find((l) => l.code === details.chosenLanguage)?.name ??
        details.chosenLanguage
      : null;
  const canceling = details.cancelAtPeriodEnd;
  const paused = details.status === 'paused';

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View style={styles.planTopRow}>
        <View style={styles.brandRow}>
          <View style={[styles.brandDot, { backgroundColor: colors.gold }]}>
            <Feather name="star" size={15} color="#1a1200" />
          </View>
          <Text style={[styles.planName, { color: colors.foreground }]}>
            {planLabel(details.tier)}
          </Text>
        </View>
        <View
          style={[styles.statusPill, { backgroundColor: `${status.color}1F` }]}
        >
          <Text style={[styles.statusText, { color: status.color }]}>
            {status.label}
          </Text>
        </View>
      </View>

      <View style={styles.detailRows}>
        {paused && formatDate(details.pauseUntil) ? (
          <DetailRow
            icon="pause-circle"
            label="Paused until"
            value={formatDate(details.pauseUntil)!}
          />
        ) : canceling && formatDate(details.currentPeriodEnd) ? (
          <DetailRow
            icon="calendar"
            label="Access until"
            value={formatDate(details.currentPeriodEnd)!}
          />
        ) : details.status === 'trialing' && formatDate(details.trialEndsAt) ? (
          <DetailRow
            icon="clock"
            label="Free trial ends"
            value={formatDate(details.trialEndsAt)!}
          />
        ) : formatDate(details.currentPeriodEnd) ? (
          <DetailRow
            icon="refresh-cw"
            label="Renews"
            value={formatDate(details.currentPeriodEnd)!}
          />
        ) : null}

        {chosenName ? (
          <DetailRow icon="globe" label="Language" value={chosenName} />
        ) : null}

        {details.paymentMethod?.store ? (
          <DetailRow
            icon="credit-card"
            label="Billed through"
            value={details.paymentMethod.store}
          />
        ) : null}
      </View>

      <View style={styles.actions}>
        <ChunkyButton
          title={isStripe ? 'Manage on the Bolo! website' : `Manage in ${storeName()}`}
          icon="external-link"
          variant="secondary"
          onPress={onManage}
          style={{ alignSelf: 'stretch' }}
        />
        {!canceling ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel subscription"
            onPress={onCancelPress}
            disabled={busy}
            style={styles.cancelBtn}
          >
            <Text style={[styles.cancelText, { color: colors.destructive }]}>
              Cancel subscription
            </Text>
          </Pressable>
        ) : (
          <>
            <ChunkyButton
              title="Reactivate my plan"
              icon="rotate-ccw"
              onPress={onReactivate}
              disabled={busy}
              style={{ alignSelf: 'stretch' }}
            />
            <Text
              style={[styles.cancelingNote, { color: colors.mutedForeground }]}
            >
              Your plan is set to cancel. Reactivate before the date above to
              keep your access.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Past billing periods from the provider (RevenueCat / Stripe). The array can be
 * empty — some providers don't expose history — so we degrade to a friendly
 * empty state rather than hiding all trace of it.
 */
function BillingHistory({ entries }: { entries: BillingHistoryEntry[] }) {
  const colors = useColors();

  return (
    <View style={styles.historySection}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        Billing history
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        {entries.length === 0 ? (
          <View style={styles.historyEmpty}>
            <Feather name="file-text" size={22} color={colors.mutedForeground} />
            <Text
              style={[styles.historyEmptyText, { color: colors.mutedForeground }]}
            >
              No past payments to show yet. Your billing history will appear here
              once you’ve been charged.
            </Text>
          </View>
        ) : (
          entries.map((entry, i) => (
            <BillingRow
              key={`${entry.productId}-${entry.purchasedAt ?? i}`}
              entry={entry}
              isLast={i === entries.length - 1}
            />
          ))
        )}
      </View>
    </View>
  );
}

function BillingRow({
  entry,
  isLast,
}: {
  entry: BillingHistoryEntry;
  isLast: boolean;
}) {
  const colors = useColors();
  const status = billingStatusMeta(entry.status, colors);
  const purchased = formatShortDate(entry.purchasedAt);
  const expires = formatShortDate(entry.expiresAt);
  const period = periodLabel(entry.periodType);

  const dateRange = purchased
    ? expires
      ? `${purchased} – ${expires}`
      : purchased
    : 'Date unavailable';

  const subParts = [billingPlanLabel(entry.productId)];
  if (period) subParts.push(period);

  return (
    <View
      style={[
        styles.historyRow,
        !isLast && { borderBottomWidth: 1, borderBottomColor: colors.border },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.historyDate, { color: colors.foreground }]}>
          {dateRange}
        </Text>
        <Text style={[styles.historyMeta, { color: colors.mutedForeground }]}>
          {subParts.join(' · ')}
        </Text>
      </View>
      <View
        style={[styles.statusPill, { backgroundColor: `${status.color}1F` }]}
      >
        <Text style={[styles.statusText, { color: status.color }]}>
          {status.label}
        </Text>
      </View>
    </View>
  );
}

function statusMeta(
  d: SubscriptionDetails,
  colors: ReturnType<typeof useColors>,
): { label: string; color: string } {
  if (d.cancelAtPeriodEnd) return { label: 'Canceling', color: colors.destructive };
  switch (d.status) {
    case 'active':
      return { label: 'Active', color: colors.success };
    case 'trialing':
      return { label: 'Free trial', color: colors.gold };
    case 'paused':
      return { label: 'Paused', color: colors.mutedForeground };
    case 'canceled':
      return { label: 'Canceling', color: colors.destructive };
    default:
      return { label: 'Active', color: colors.success };
  }
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Feather name={icon} size={16} color={colors.primary} />
      </View>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]}>
        {value}
      </Text>
    </View>
  );
}

/**
 * Shown before a cancellation. Offers the one-time 3-month discount and a pause
 * (both recorded through the backend) as retention, then a clear path to finish
 * canceling. For Stripe (web) subscribers the in-app offers are hidden — their
 * billing is provider-authoritative and managed on the web.
 */
function RetentionModal({
  visible,
  details,
  busy,
  onClose,
  onAcceptRetention,
  onPause,
  onCancel,
}: {
  visible: boolean;
  details: SubscriptionDetails;
  busy: boolean;
  onClose: () => void;
  onAcceptRetention: () => void;
  onPause: () => void;
  onCancel: () => void;
}) {
  const colors = useColors();
  const inApp = details.provider !== 'stripe';
  const canDiscount = inApp && !details.retentionOfferAcceptedAt;
  const canPause = inApp && details.status !== 'paused';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalSheet,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}
        >
          <View style={styles.modalHandleWrap}>
            <View style={[styles.modalHandle, { backgroundColor: colors.border }]} />
          </View>

          <Text style={[styles.modalTitle, { color: colors.foreground }]}>
            {canDiscount || canPause ? 'Before you go…' : 'Cancel subscription'}
          </Text>
          <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
            {canDiscount || canPause
              ? 'Keep your streak going with one of these instead.'
              : inApp
                ? `You’ll finish canceling in ${storeName()}. You keep access until your current period ends.`
                : 'You’ll manage or cancel on the Bolo! website. You keep access until your current period ends.'}
          </Text>

          {canDiscount ? (
            <OfferCard
              icon="gift"
              title="3 months at a discount"
              desc="Stay on and save — a one-time offer to keep everything you’ve unlocked."
              cta="Claim the offer"
              onPress={onAcceptRetention}
              disabled={busy}
              highlight
            />
          ) : null}

          {canPause ? (
            <OfferCard
              icon="pause-circle"
              title="Pause instead"
              desc="Take a break for a month — your progress waits for you, and billing pauses too."
              cta="Pause subscription"
              onPress={onPause}
              disabled={busy}
            />
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue to cancel"
            onPress={onCancel}
            disabled={busy}
            style={styles.modalCancel}
          >
            <Text style={[styles.modalCancelText, { color: colors.destructive }]}>
              {inApp ? `Cancel in ${storeName()}` : 'Manage on the web'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keep my subscription"
            onPress={onClose}
            disabled={busy}
            style={styles.modalKeep}
          >
            <Text style={[styles.modalKeepText, { color: colors.foreground }]}>
              Keep my subscription
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function OfferCard({
  icon,
  title,
  desc,
  cta,
  onPress,
  disabled,
  highlight,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  desc: string;
  cta: string;
  onPress: () => void;
  disabled?: boolean;
  highlight?: boolean;
}) {
  const colors = useColors();
  return (
    <View
      style={[
        styles.offerCard,
        {
          backgroundColor: colors.card,
          borderColor: highlight ? colors.gold : colors.border,
        },
      ]}
    >
      <View style={styles.offerHead}>
        <View
          style={[
            styles.offerIcon,
            { backgroundColor: highlight ? `${colors.gold}2E` : `${colors.primary}1A` },
          ]}
        >
          <Feather
            name={icon}
            size={18}
            color={highlight ? colors.gold : colors.primary}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.offerTitle, { color: colors.foreground }]}>
            {title}
          </Text>
          <Text style={[styles.offerDesc, { color: colors.mutedForeground }]}>
            {desc}
          </Text>
        </View>
      </View>
      <ChunkyButton
        title={cta}
        onPress={onPress}
        disabled={disabled}
        variant={highlight ? 'primary' : 'secondary'}
        style={{ marginTop: 12, alignSelf: 'stretch' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLabel: { fontFamily: AppFonts.bold, fontSize: 18 },
  centerState: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 40,
    paddingHorizontal: 28,
  },
  stateText: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  bannerText: { flex: 1, fontFamily: AppFonts.semibold, fontSize: 14 },
  card: {
    padding: 18,
    borderRadius: 20,
    borderWidth: 1,
  },
  planTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planName: { fontFamily: AppFonts.extrabold, fontSize: 20 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusText: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  freeSub: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  detailRows: { marginTop: 18, gap: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIcon: { width: 22, alignItems: 'center' },
  detailLabel: { fontFamily: AppFonts.regular, fontSize: 14, flex: 1 },
  detailValue: { fontFamily: AppFonts.bold, fontSize: 14 },
  actions: { marginTop: 22, gap: 8 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14 },
  cancelText: { fontFamily: AppFonts.bold, fontSize: 15 },
  cancelingNote: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
    lineHeight: 18,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    marginTop: 8,
  },
  restoreText: { fontFamily: AppFonts.semibold, fontSize: 14 },
  historySection: { marginTop: 24 },
  sectionTitle: {
    fontFamily: AppFonts.extrabold,
    fontSize: 16,
    marginBottom: 10,
    marginLeft: 2,
  },
  historyEmpty: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  historyEmptyText: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  historyDate: { fontFamily: AppFonts.bold, fontSize: 14 },
  historyMeta: { fontFamily: AppFonts.regular, fontSize: 13, marginTop: 3 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    padding: 22,
    paddingBottom: 34,
    gap: 12,
  },
  modalHandleWrap: { alignItems: 'center', marginBottom: 4 },
  modalHandle: { width: 40, height: 5, borderRadius: 3 },
  modalTitle: { fontFamily: AppFonts.extrabold, fontSize: 22 },
  modalSub: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  offerCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  offerHead: { flexDirection: 'row', gap: 12 },
  offerIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerTitle: { fontFamily: AppFonts.bold, fontSize: 16 },
  offerDesc: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  modalCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 2 },
  modalCancelText: { fontFamily: AppFonts.bold, fontSize: 15 },
  modalKeep: { alignItems: 'center', paddingVertical: 10 },
  modalKeepText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
});
