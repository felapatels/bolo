// The one thing that stands between Bolo and a learner's notifications.
//
// WHY IT EXISTS. iOS gives an app ONE system permission dialog per install and
// a denial is close to permanent. lib/push.ts refuses to fire that dialog from
// a background path for exactly that reason, and it is right to, but the only
// code that COULD ask sat behind Account > Reminders. Measured against
// production 2026-08-26: zero push tokens, on either platform. Reported the
// same day: "i downloaded 509 but was never prompted to accept notifications."
//
// THIS ASKS FIRST, IN OUR OWN UI, WHERE A NO COSTS NOTHING. Only a yes goes on
// to call requestNotificationPermission, so the single OS dialog is spent on
// learners who have already said they want it. A "not now" leaves it unspent
// and lets us ask again in a week; a cold system prompt would have burned it.
//
// WHEN. On first login, gated on hasChosenLanguage so it never stacks on the
// first-run language screen: sign up, pick a language, land in the app, and be
// asked then. Asked for 2026-08-26: "can we also ask when they first log in?"
// Build 19 added the walkthrough between the chooser and home, and this waits
// for that too (hasCompletedTour), or picking a language on step one would
// pop this sheet over the cards.
//
// The eligibility and back-off rules live in lib/notificationPrimer.ts, pure
// and tested without a device. This file is the wiring and the words.
import React from 'react';
import { AppState, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useGetAccount } from '@workspace/api-client-react';
import { Mascot } from '@/components/Mascot';
import { AppFonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { hapticLight } from '@/lib/haptics';
import {
  getNotificationPermission,
  remindersSupported,
  requestNotificationPermission,
} from '@/lib/reminders';
import { syncPushToken } from '@/lib/push';
import {
  nextPrimerRecord,
  shouldShowPrimer,
  type PrimerState,
} from '@/lib/notificationPrimer';

const STORE_KEY = 'bolo.notification-primer.v1';

/** Named PrimerRecord, not Record: the built-in of that name is a type this
 *  file would otherwise shadow. */
type PrimerRecord = { timesShown: number; lastShownAt: number | null };

async function readRecord(): Promise<PrimerRecord> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    if (!raw) return { timesShown: 0, lastShownAt: null };
    const parsed = JSON.parse(raw) as Partial<PrimerRecord>;
    return {
      timesShown: Number(parsed.timesShown ?? 0),
      lastShownAt: parsed.lastShownAt == null ? null : Number(parsed.lastShownAt),
    };
  } catch {
    // Unreadable storage means "never asked", which errs towards asking once
    // more rather than towards silence. The cap still bounds it.
    return { timesShown: 0, lastShownAt: null };
  }
}

export function NotificationPrimer() {
  const colors = useColors();
  const account = useGetAccount();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  // One evaluation per app session. Without this the modal reappears on every
  // render that changes the account query's identity.
  const decided = React.useRef(false);

  const learning = account.data?.preferences?.learning;
  // `!== false` on the tour flag: a server that omits it reads as done, the
  // same reading lib/walkthrough.ts makes, so the two can never disagree.
  const ready =
    learning?.hasChosenLanguage === true && learning?.hasCompletedTour !== false;

  React.useEffect(() => {
    if (decided.current) return;
    if (!remindersSupported) return;
    if (!ready) return;
    decided.current = true;

    void (async () => {
      try {
        const [permission, record] = await Promise.all([
          getNotificationPermission(),
          readRecord(),
        ]);
        const state: PrimerState = {
          supported: remindersSupported,
          granted: permission.granted,
          canAskAgain: permission.canAskAgain,
          ready: true,
          timesShown: record.timesShown,
          lastShownAt: record.lastShownAt,
        };
        if (!shouldShowPrimer(state, Date.now())) {
          // Already granted and never asked through here? Still worth making
          // sure the server has a token: a learner who allowed notifications on
          // an earlier install has a grant and no row in push_tokens.
          if (permission.granted) void syncPushToken();
          return;
        }
        // Counted on SHOW, not on accept. A "not now" that did not count would
        // re-ask on the next launch.
        await AsyncStorage.setItem(
          STORE_KEY,
          JSON.stringify(
            nextPrimerRecord({ timesShown: record.timesShown }, Date.now()),
          ),
        ).catch(() => {});
        setOpen(true);
      } catch {
        // A permission read that throws must never take the signed-in layout
        // down with it. There is no fallback worth attempting: if we cannot
        // tell what the grant is, the right move is to ask nothing and leave
        // the one OS dialog unspent.
      }
    })();
  }, [ready]);

  // A learner who granted permission in Settings while the app was backgrounded
  // should have a token when they come back, without being asked anything.
  React.useEffect(() => {
    if (!remindersSupported) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      void (async () => {
        const p = await getNotificationPermission();
        if (p.granted) void syncPushToken();
      })();
    });
    return () => sub.remove();
  }, []);

  if (!open) return null;

  async function allow() {
    if (busy) return;
    setBusy(true);
    hapticLight();
    try {
      // THE ONE OS DIALOG, fired only now, only after a yes.
      const result = await requestNotificationPermission();
      if (result.granted) await syncPushToken();
    } catch {
      // A permission call that throws is not the learner's problem, and the
      // modal closing either way is the honest outcome: we asked, we are done.
    }
    setBusy(false);
    setOpen(false);
  }

  function notNow() {
    hapticLight();
    // The OS is never asked, so the single dialog stays unspent for next time.
    setOpen(false);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={notNow}>
      <View style={styles.backdrop}>
        <View
          testID="notification-primer"
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.top}>
            <Mascot pose="wave" size={64} motion="float" />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Shall Bolo give you a nudge?
          </Text>
          {/* Says what the notifications ARE, not that they are "important".
              A learner deciding needs to know what arrives, and how often. */}
          <Text style={[styles.body, { color: colors.mutedForeground }]}>
            One friendly reminder a day to practise, at a time you pick, plus a
            note when your streak is about to slip. Nothing else, and you can
            turn it off in Account whenever you like.
          </Text>

          <Pressable
            testID="notification-primer-allow"
            accessibilityRole="button"
            disabled={busy}
            onPress={allow}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Feather name="bell" size={16} color={colors.primaryForeground} />
            <Text style={[styles.ctaText, { color: colors.primaryForeground }]}>
              {busy ? 'One moment...' : 'Yes, remind me'}
            </Text>
          </Pressable>

          <Pressable
            testID="notification-primer-dismiss"
            accessibilityRole="button"
            onPress={notNow}
            style={styles.cancel}
          >
            <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>
              Not now
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: '#00000088',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    borderRadius: 22,
    borderWidth: 1,
    gap: 10,
    maxWidth: 380,
    padding: 22,
    width: '100%',
  },
  top: { alignItems: 'center' },
  title: { fontFamily: AppFonts.extrabold, fontSize: 20, textAlign: 'center' },
  body: { fontFamily: AppFonts.regular, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  cta: {
    alignItems: 'center',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 6,
    paddingVertical: 14,
  },
  ctaText: { fontFamily: AppFonts.bold, fontSize: 15 },
  cancel: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontFamily: AppFonts.bold, fontSize: 14 },
});
