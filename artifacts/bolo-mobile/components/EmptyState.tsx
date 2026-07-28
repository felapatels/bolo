import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

interface EmptyStateProps {
  title: string;
  body?: string;
}

/**
 * Minimal empty-state display. Use when a list or queue has no items to show.
 */
export function EmptyState({ title, body }: EmptyStateProps) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {body ? (
        <Text style={[styles.body, { color: colors.mutedForeground }]}>{body}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  title: {
    fontFamily: AppFonts.extrabold,
    fontSize: 22,
    textAlign: 'center',
  },
  body: {
    fontFamily: AppFonts.regular,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
});
