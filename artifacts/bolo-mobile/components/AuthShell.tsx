import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Screen } from '@/components/Screen';
import { Mascot } from '@/components/Mascot';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

/** Branded wrapper for the sign-in / sign-up screens. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Mascot pose="wave" size={104} motion="float" style={styles.mascot} />
            <Text style={[styles.wordmark, { color: colors.primary }]}>
              Bolo!
            </Text>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {subtitle}
            </Text>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * Safely pull a display message out of a Clerk field/global error entry. The
 * installed @clerk/expo types surface these as `{}`, so we narrow at runtime.
 */
export function fieldError(err: unknown): string | undefined {
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message;
    return typeof m === 'string' ? m : undefined;
  }
  return undefined;
}

export function Field({
  label,
  error,
  secureTextEntry,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const colors = useColors();
  // THE EYE, build 19. The Play testers asked for a show/hide toggle on the
  // password fields. Sign-in, sign-up and account/password all draw their
  // inputs through this one component, so the toggle lives here once rather
  // than three times, and any future password field gets it for free. Only
  // what the glass shows changes: the field's autoComplete and keyboard stay
  // exactly what the caller passed, so password managers still recognise it.
  // Web twin: Clerk's own components carry the same eye on their password
  // inputs, verified on the live site the day this landed.
  const [revealed, setRevealed] = React.useState(false);
  const secure = secureTextEntry === true;
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <View>
        <TextInput
          placeholderTextColor={colors.mutedForeground}
          secureTextEntry={secure && !revealed}
          style={[
            styles.input,
            secure && styles.inputWithEye,
            {
              backgroundColor: colors.card,
              borderColor: error ? colors.destructive : colors.border,
              color: colors.foreground,
            },
          ]}
          {...props}
        />
        {secure ? (
          <Pressable
            testID="password-eye"
            accessibilityRole="button"
            accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
            hitSlop={10}
            onPress={() => setRevealed((v) => !v)}
            style={styles.eye}
          >
            <Feather
              name={revealed ? 'eye-off' : 'eye'}
              size={20}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingBottom: 48,
    gap: 4,
  },
  header: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 28,
  },
  mascot: {
    marginBottom: 8,
  },
  wordmark: {
    fontFamily: AppFonts.extrabold,
    fontSize: 40,
    letterSpacing: -1,
  },
  title: {
    fontFamily: AppFonts.bold,
    fontSize: 22,
    marginTop: 12,
  },
  subtitle: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 21,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontFamily: AppFonts.semibold,
    fontSize: 14,
    marginBottom: 6,
  },
  input: {
    fontFamily: AppFonts.regular,
    fontSize: 16,
    borderWidth: 1.5,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  // Room for the eye so long passwords never run underneath it.
  inputWithEye: { paddingRight: 52 },
  eye: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    marginTop: 5,
  },
});
