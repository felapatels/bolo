import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useUser } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';
import {
  MARKETING_CONSENT_TEXT,
  hasMarketingConsent,
  marketingEmailsRecord,
  parkMarketingChoice,
  readMarketingEmails,
  shouldApplyParkedChoice,
  takeParkedMarketingChoice,
} from '@/lib/marketingConsent';

/** The sign-up form's box: unticked by default, inline above Create account. */
export function MarketingConsentCheckbox() {
  const colors = useColors();
  const [checked, setChecked] = useState(false);
  const toggle = () => {
    const next = !checked;
    setChecked(next);
    parkMarketingChoice(marketingEmailsRecord(next, 'mobile-signup'));
  };
  return (
    <Pressable
      testID="marketing-consent"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={MARKETING_CONSENT_TEXT}
      onPress={toggle}
      style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4, marginBottom: 12 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: checked ? colors.primary : colors.border,
          backgroundColor: checked ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {checked ? <Feather name="check" size={14} color={colors.primaryForeground} /> : null}
      </View>
      <Text style={{ flex: 1, fontFamily: AppFonts.regular, fontSize: 14, lineHeight: 20, color: colors.foreground }}>
        {MARKETING_CONSENT_TEXT}
      </Text>
    </Pressable>
  );
}

/** Writes a parked sign-up choice onto the brand-new account once it exists. Renders nothing. */
export function MarketingConsentSync() {
  const { user, isLoaded } = useUser();
  useEffect(() => {
    if (!isLoaded || !user) return;
    const choice = takeParkedMarketingChoice();
    if (!shouldApplyParkedChoice(choice, readMarketingEmails(user.unsafeMetadata), user.createdAt)) return;
    user
      .update({ unsafeMetadata: { ...(user.unsafeMetadata ?? {}), marketingEmails: choice } })
      .catch(() => {
        // Put it back so the next mount retries rather than losing the tick.
        if (choice) parkMarketingChoice(choice);
      });
  }, [isLoaded, user?.id]);
  return null;
}

/** Account's switch: the same choice, changeable any time, because withdrawing must be as easy as agreeing. */
export function MarketingEmailsSetting() {
  const colors = useColors();
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const optedIn = hasMarketingConsent(user?.unsafeMetadata);
  const change = async (next: boolean) => {
    if (!user) return;
    setSaving(true);
    setFailed(false);
    try {
      await user.update({
        unsafeMetadata: { ...(user.unsafeMetadata ?? {}), marketingEmails: marketingEmailsRecord(next, 'mobile-account') },
      });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={{ padding: 12, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.foreground, fontWeight: '700' }}>Bolo news by email</Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
            New languages and offers. Off unless you turn it on.
          </Text>
        </View>
        <Switch
          testID="marketing-emails-switch"
          accessibilityLabel="Bolo news by email"
          value={optedIn}
          disabled={saving || !user}
          onValueChange={value => void change(value)}
          trackColor={{ true: colors.primary }}
        />
      </View>
      {failed ? (
        <Text accessibilityRole="alert" style={{ color: colors.destructive, fontSize: 12 }}>
          Couldn't save that. Try again.
        </Text>
      ) : null}
    </View>
  );
}
