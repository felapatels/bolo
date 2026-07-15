import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useUser } from '@clerk/expo';
import { useSubmitContactForm } from '@workspace/api-client-react';

import { Screen } from '@/components/Screen';
import { ChunkyButton } from '@/components/ChunkyButton';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

const CATEGORIES = [
  { value: 'general', label: 'General question' },
  { value: 'billing', label: 'Billing & subscription' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'feedback', label: 'Feedback / feature request' },
  { value: 'other', label: 'Other' },
] as const;

type CategoryValue = (typeof CATEGORIES)[number]['value'];

const MAX_MESSAGE = 2000;

export default function ContactScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useUser();
  const submit = useSubmitContactForm();

  const [name, setName] = React.useState(
    () =>
      user?.fullName ??
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ??
      '',
  );
  const [email, setEmail] = React.useState(
    () => user?.primaryEmailAddress?.emailAddress ?? '',
  );
  const [category, setCategory] = React.useState<CategoryValue | ''>('');
  const [message, setMessage] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  const isValid =
    name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    category !== '' &&
    message.trim().length > 0;

  const openCategoryPicker = () => {
    Alert.alert(
      'Choose a topic',
      undefined,
      [
        ...CATEGORIES.map((c) => ({
          text: c.label,
          onPress: () => setCategory(c.value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Valid email required', 'Please enter a valid email address.');
      return;
    }
    if (!category) {
      Alert.alert('Topic required', 'Please choose a topic for your message.');
      return;
    }
    if (!message.trim()) {
      Alert.alert('Message required', 'Please write a message before sending.');
      return;
    }

    setError(null);
    try {
      await submit.mutateAsync({
        data: {
          name: name.trim(),
          email: email.trim(),
          category,
          message,
        },
      });
      setSuccess(true);
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === 'object' &&
        'data' in err &&
        err.data &&
        typeof (err.data as { error?: unknown }).error === 'string'
          ? (err.data as { error: string }).error
          : 'Something went wrong. Please try again.';
      setError(msg);
    }
  };

  const categoryLabel =
    CATEGORIES.find((c) => c.value === category)?.label ?? '';

  return (
    <Screen>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.card }]}
        >
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerLabel, { color: colors.foreground }]}>
          Contact Us
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {success ? (
          <View
            style={[
              styles.successCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.successIcon,
                { backgroundColor: colors.primary + '1A' },
              ]}
            >
              <Feather name="check-circle" size={32} color={colors.primary} />
            </View>
            <Text style={[styles.successTitle, { color: colors.foreground }]}>
              Message sent!
            </Text>
            <Text
              style={[styles.successBody, { color: colors.mutedForeground }]}
            >
              We've received your message and will get back to you at {email}.
            </Text>
            <ChunkyButton
              title="Back to settings"
              icon="arrow-left"
              variant="secondary"
              onPress={() => router.back()}
              style={{ marginTop: 8, alignSelf: 'stretch' }}
            />
          </View>
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              We read every message and reply within a business day.
            </Text>

            {/* Name */}
            <View style={styles.field}>
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                NAME
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Your name"
                placeholderTextColor={colors.mutedForeground}
                maxLength={200}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              />
            </View>

            {/* Email */}
            <View style={styles.field}>
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                EMAIL
              </Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              />
            </View>

            {/* Category */}
            <View style={styles.field}>
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                TOPIC
              </Text>
              <Pressable
                onPress={openCategoryPicker}
                style={[
                  styles.categoryBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    {
                      color: categoryLabel
                        ? colors.foreground
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  {categoryLabel || 'Choose a topic'}
                </Text>
                <Feather
                  name="chevron-down"
                  size={18}
                  color={colors.mutedForeground}
                />
              </Pressable>
            </View>

            {/* Message */}
            <View style={styles.field}>
              <View style={styles.fieldLabelRow}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  MESSAGE
                </Text>
                <Text
                  style={[
                    styles.charCount,
                    {
                      color:
                        message.length > MAX_MESSAGE * 0.9
                          ? colors.destructive
                          : colors.mutedForeground,
                    },
                  ]}
                >
                  {message.length}/{MAX_MESSAGE}
                </Text>
              </View>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Tell us what's on your mind…"
                placeholderTextColor={colors.mutedForeground}
                multiline
                maxLength={MAX_MESSAGE}
                style={[
                  styles.textarea,
                  {
                    color: colors.foreground,
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                  },
                ]}
              />
            </View>

            {/* Inline error */}
            {error ? (
              <View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: colors.destructive + '14',
                    borderColor: colors.destructive + '50',
                  },
                ]}
              >
                <Text style={[styles.errorText, { color: colors.destructive }]}>
                  {error}
                </Text>
              </View>
            ) : null}

            <ChunkyButton
              title="Send message"
              icon="send"
              onPress={handleSubmit}
              disabled={submit.isPending || !isValid}
              loading={submit.isPending}
              style={{ marginTop: 8, alignSelf: 'stretch' }}
            />
          </View>
        )}
      </ScrollView>
    </Screen>
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
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  card: {
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    gap: 16,
  },
  subtitle: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
  },
  field: { gap: 6 },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldLabel: {
    fontFamily: AppFonts.extrabold,
    fontSize: 11,
    letterSpacing: 0.6,
  },
  charCount: { fontFamily: AppFonts.regular, fontSize: 11 },
  input: {
    fontFamily: AppFonts.semibold,
    fontSize: 15,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  categoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  categoryText: { fontFamily: AppFonts.semibold, fontSize: 15 },
  textarea: {
    fontFamily: AppFonts.regular,
    fontSize: 15,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  errorText: { fontFamily: AppFonts.regular, fontSize: 13, lineHeight: 18 },
  successCard: {
    padding: 28,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    fontFamily: AppFonts.bold,
    fontSize: 22,
    textAlign: 'center',
  },
  successBody: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
