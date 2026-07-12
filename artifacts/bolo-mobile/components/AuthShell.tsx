import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Screen } from '@/components/Screen';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

const logo = require('@/assets/images/icon.png');

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
            <Image source={logo} style={styles.logo} />
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
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.mutedForeground}
        style={[
          styles.input,
          {
            backgroundColor: colors.card,
            borderColor: error ? colors.destructive : colors.border,
            color: colors.foreground,
          },
        ]}
        {...props}
      />
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
  logo: {
    width: 76,
    height: 76,
    borderRadius: 20,
    marginBottom: 12,
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
  error: {
    fontFamily: AppFonts.regular,
    fontSize: 13,
    marginTop: 5,
  },
});
