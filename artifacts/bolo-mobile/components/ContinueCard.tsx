import React from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { type Category } from '@workspace/api-client-react';
import { PressableScale } from '@/components/PressableScale';
import { useColors } from '@/hooks/useColors';
import { categoryIcon } from '@/lib/ui';

/** Hero card that surfaces the learner's next best action — continue an
 * in-progress topic, or start the first unmastered one. */
export function ContinueCard({
  categories,
  onNavigate,
}: {
  categories: Category[];
  onNavigate: (categoryId: number) => void;
}) {
  const colors = useColors();

  // Priority 1 — in-progress (at least one phrase mastered but not all)
  const inProgress = categories.find(
    (c) => c.masteredCount > 0 && c.masteredCount < c.phraseCount,
  );
  // Priority 2 — first unstarted topic
  const unstarted = categories.find((c) => c.masteredCount === 0);
  const target = inProgress ?? unstarted ?? categories[0];

  if (!target) return null;

  const isResume = inProgress != null;
  const pct =
    target.phraseCount > 0
      ? Math.round((target.masteredCount / target.phraseCount) * 100)
      : 0;

  return (
    <PressableScale
      onPress={() => onNavigate(target.id)}
      scaleTo={0.98}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          borderRadius: 18,
          padding: 18,
          marginBottom: 12,
          backgroundColor: colors.primary,
          shadowColor: colors.primaryShadow,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 12,
          elevation: 4,
        },
      ]}
    >
      {/* Topic icon */}
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.2)',
        }}
      >
        <Feather
          name={categoryIcon(target.iconName)}
          size={24}
          color={colors.primaryForeground}
        />
      </View>

      {/* Topic info */}
      <View style={{ flex: 1 }}>
        <Text
          style={{ fontSize: 13, opacity: 0.85, marginBottom: 2, color: colors.primaryForeground }}
        >
          {isResume ? 'Continue where you left off' : 'Start a new topic'}
        </Text>
        <Text
          style={{ fontSize: 18, fontWeight: '700', color: colors.primaryForeground }}
          numberOfLines={1}
        >
          {target.title}
        </Text>

        {/* Mini progress bar */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <View
            style={{
              flex: 1,
              height: 5,
              borderRadius: 999,
              overflow: 'hidden',
              backgroundColor: 'rgba(255,255,255,0.25)',
            }}
          >
            <View
              style={{
                width: `${pct}%`,
                height: '100%',
                backgroundColor: colors.primaryForeground,
                borderRadius: 999,
              }}
            />
          </View>
          <Text style={{ fontSize: 12, opacity: 0.85, color: colors.primaryForeground }}>
            {pct}%
          </Text>
        </View>
      </View>

      {/* CTA button */}
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primaryForeground,
        }}
      >
        <Feather name="play" size={18} color={colors.primary} />
      </View>
    </PressableScale>
  );
}
