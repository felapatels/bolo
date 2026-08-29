// The password checklist, drawn. Rules in lib/passwordRules.ts.
//
// STATE IS SHAPE AND WORD, NEVER HUE ALONE: a met rule is a check-circle and
// an unmet one an x-circle, with the colours reinforcing rather than
// carrying it (the owner is partially colour blind, and red against green is
// the pair that fails first). Rendered only once the learner has started
// typing, so an empty form is not a wall of red before a single key.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AppFonts } from '@/constants/fonts';
import { useColors } from '@/hooks/useColors';
import { checkPassword } from '@/lib/passwordRules';

export function PasswordChecklist({ password }: { password: string }) {
  const colors = useColors();
  if (!password) return null;
  return (
    <View testID="password-checklist" style={styles.list} accessibilityRole="list">
      {checkPassword(password).map((rule) => (
        <View
          key={rule.key}
          testID={`password-rule-${rule.key}`}
          accessibilityLabel={`${rule.label}: ${rule.met ? 'met' : 'not yet'}`}
          style={styles.row}
        >
          <Feather
            testID={`password-rule-${rule.key}-${rule.met ? 'met' : 'unmet'}`}
            name={rule.met ? 'check-circle' : 'x-circle'}
            size={15}
            color={rule.met ? colors.success : colors.destructive}
          />
          <Text
            style={[
              styles.label,
              { color: rule.met ? colors.foreground : colors.mutedForeground },
            ]}
          >
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 6, marginTop: -6, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontFamily: AppFonts.semibold, fontSize: 13 },
});
