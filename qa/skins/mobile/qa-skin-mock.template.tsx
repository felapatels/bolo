// Task #1117 — MOBILE mock: train skins on leaderboard friend rows.
//
// MOCK AND MEASUREMENT, NOT A FEATURE. This file is a TEMPLATE. The probe
// (qa/task1117-mobile-skin-mock.mjs) writes it into
// artifacts/bolo-mobile/app/qa-skin-mock.tsx with the placeholder token below
// replaced by the shared palette JSON, screenshots it through Expo web, and
// deletes the route again.
// It is a top-level route, so it renders outside the (app) auth gate; Metro
// cannot resolve imports from outside the project root, which is why the
// palettes arrive as injected JSON rather than an import from qa/.
//
// Three rules keep the mock honest, same as the web harness:
//  1. The ROW MARKUP is copied verbatim from
//     app/(app)/(tabs)/friends.tsx LeaderboardRow — same lbRow/rankBadge/
//     lbName/lbSub styles, same trailing Feather "zap". Task #1112 is editing
//     that file right now; this copies it, it never edits it.
//  2. The TRAIN is the real component (@/components/journey/TrainEngine),
//     recoloured through its own existing `palette` prop — the mechanism the
//     Chai wallet's art tiles already use. Only the four palette roles change:
//     the white highlights are untouched, and the headlamp `tint` follows the
//     row's text colour, which is what web's currentColor does.
//  3. The AVATAR is replaced by a labelled placeholder at 60px, the size Task
//     #1112 is moving the dressed mascot to. #1112 is not merged, so its
//     component is deliberately not imported.
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { TrainEngine } from '@/components/journey/TrainEngine';
import { useColors } from '@/hooks/useColors';
import { AppFonts } from '@/constants/fonts';

const DATA = __SKIN_MOCK_DATA__ as {
  opacity: number;
  engine: { inline: Box; background: Box; reference: Box };
  palettes: Palette[];
  rows: Row[];
};

type Box = { width: number; height: number };
type Palette = {
  id: string;
  label: string;
  chassis: string;
  body: string;
  trim: string;
  steam: string;
};
type Row = {
  key: string;
  rank: number;
  name: string;
  isSelf: boolean;
  xp: number;
  palette: string | null;
};

const paletteById = (id: string | null) =>
  DATA.palettes.find((p) => p.id === id) ?? null;

function Engine({
  palette,
  box,
  tint,
  probe,
}: {
  palette: Palette;
  box: Box;
  tint: string;
  probe: string;
}) {
  return (
    <View testID={`train-${probe}`} style={{ width: box.width, height: box.height }}>
      <TrainEngine
        tint={tint}
        width={box.width}
        height={box.height}
        palette={{
          chassis: palette.chassis,
          body: palette.body,
          trim: palette.trim,
          steam: palette.steam,
        }}
      />
    </View>
  );
}

/** Stand-in for Task #1112's dressed mascot: 60px, the size that task moves to. */
function MascotPlaceholder({ isSelf }: { isSelf: boolean }) {
  const colors = useColors();
  return (
    <View
      style={{
        width: 60,
        height: 60,
        borderRadius: 30,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isSelf ? 'rgba(255,255,255,0.22)' : `${colors.primary}1F`,
      }}
    >
      <Text
        style={{
          fontFamily: AppFonts.extrabold,
          fontSize: 10,
          color: isSelf ? colors.primaryForeground : colors.primary,
        }}
      >
        #1112
      </Text>
    </View>
  );
}

type Treatment = 'a' | 'b' | 'c';

function LeaderboardRow({
  entry,
  treatment,
  textless,
  probeId,
}: {
  entry: Row;
  treatment: Treatment;
  /** Measurement strip only: the row's own content is drawn at opacity 0 so a
   *  pixel sample of the engine reads the engine over the row background, not
   *  a glyph painted on top of it. Layout and colours are untouched. */
  textless?: boolean;
  probeId?: string;
}) {
  const colors = useColors();
  const isSelf = entry.isSelf;
  const isPodium = entry.rank <= 3;
  const podiumColor =
    entry.rank === 1
      ? colors.gold
      : entry.rank === 2
        ? colors.mutedForeground
        : colors.secondary;
  const palette = paletteById(entry.palette);
  const bg = treatment === 'c' && palette;
  const inline = treatment === 'a' && palette;
  const probe = probeId ?? `${treatment}-${entry.key}`;
  const tint = isSelf ? colors.primaryForeground : colors.foreground;
  const hide = textless ? { opacity: 0 } : null;

  return (
    <View
      testID={`row-${probe}`}
      style={[
        styles.lbRow,
        {
          backgroundColor: isSelf ? colors.primary : colors.card,
          borderColor: isSelf ? colors.primary : colors.border,
        },
        // Zero layout cost: only paint order and clipping change.
        bg ? { position: 'relative', overflow: 'hidden' } : null,
      ]}
    >
      {bg ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            marginTop: -DATA.engine.background.height / 2,
            opacity: DATA.opacity,
          }}
        >
          <Engine
            palette={palette}
            box={DATA.engine.background}
            tint={tint}
            probe={probe}
          />
        </View>
      ) : null}

      <View
        style={[
          styles.rankBadge,
          {
            backgroundColor: isSelf
              ? 'rgba(255,255,255,0.22)'
              : isPodium
                ? `${podiumColor}26`
                : colors.muted,
          },
          hide,
        ]}
      >
        <Text
          style={[
            styles.rankText,
            {
              color: isSelf
                ? colors.primaryForeground
                : isPodium
                  ? podiumColor
                  : colors.mutedForeground,
            },
          ]}
        >
          {entry.rank}
        </Text>
      </View>

      <View style={hide}>
        <MascotPlaceholder isSelf={isSelf} />
      </View>

      {inline ? (
        <Engine
          palette={palette}
          box={DATA.engine.inline}
          tint={tint}
          probe={probe}
        />
      ) : null}

      <View style={[{ flex: 1 }, hide]}>
        <Text
          style={[
            styles.lbName,
            { color: isSelf ? colors.primaryForeground : colors.foreground },
          ]}
          numberOfLines={1}
        >
          {entry.name}
        </Text>
        <Text
          testID={`xp-${probe}`}
          style={[
            styles.lbSub,
            { color: isSelf ? 'rgba(255,255,255,0.75)' : colors.mutedForeground },
          ]}
        >
          {entry.xp.toLocaleString()} XP
        </Text>
      </View>

      <View style={hide}>
        <Feather
          name="zap"
          size={20}
          color={isSelf ? colors.primaryForeground : colors.gold}
        />
      </View>
    </View>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View
      testID={`section-${id}`}
      style={{ backgroundColor: colors.background, paddingHorizontal: 20, paddingVertical: 14 }}
    >
      <Text style={[styles.h2, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.note, { color: colors.mutedForeground }]}>{note}</Text>
      {children}
    </View>
  );
}

export default function QaSkinMock() {
  const colors = useColors();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <Section
        id="reference"
        title="Reference liveries (provisional)"
        note="Full-size engines for the naming test. Provisional swatches only — not named, not priced, not a shipping set."
      >
        {DATA.palettes.map((p) => (
          <View
            key={p.id}
            style={[
              styles.refRow,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Engine
              palette={p}
              box={DATA.engine.reference}
              tint={colors.foreground}
              probe={`ref-${p.id}`}
            />
            <Text style={[styles.refLabel, { color: colors.foreground }]}>
              {p.label}
            </Text>
          </View>
        ))}
      </Section>

      <Section
        id="treatment-a"
        title="Treatment A — mascot and train side by side"
        note="Engine 64px wide, in flow, between the 60px mascot placeholder and the name column."
      >
        {DATA.rows.map((r) => (
          <LeaderboardRow key={r.key} entry={r} treatment="a" />
        ))}
      </Section>

      <Section
        id="treatment-b"
        title="Treatment B — mascot only"
        note="The row as it renders today (with #1112's 60px mascot placeholder). No skin is shown at all."
      >
        {DATA.rows.map((r) => (
          <LeaderboardRow key={r.key} entry={r} treatment="b" />
        ))}
      </Section>

      <Section
        id="treatment-c"
        title={`Treatment C — train in the row background (opacity ${DATA.opacity})`}
        note="Engine 88px wide, absolutely positioned at the trailing edge, zero layout width. Row 1 is the caller's indigo self-row carrying the indigo-adjacent skin; the last row has no skin equipped."
      >
        {DATA.rows.map((r) => (
          <LeaderboardRow key={r.key} entry={r} treatment="c" />
        ))}
      </Section>

      <Section
        id="grid"
        title="Treatment C — every livery on the indigo self-row"
        note="What all four provisional liveries look like on the caller's own indigo row."
      >
        {DATA.palettes.map((p) => (
          <LeaderboardRow
            key={p.id}
            entry={{
              key: `self-${p.id}`,
              rank: 1,
              name: `You — ${p.id}`,
              isSelf: true,
              xp: 1840,
              palette: p.id,
            }}
            treatment="c"
            probeId={`c-self-${p.id}`}
          />
        ))}
      </Section>

      <Section
        id="strip"
        title="Measurement strip (row content hidden)"
        note="Identical treatment-C rows with the row's own content at opacity 0, so pixel samples read the engine composited over the row background rather than a glyph painted over the engine. Each livery on the indigo self-row and on the card background."
      >
        {DATA.palettes.flatMap((p) =>
          [true, false].map((isSelf) => (
            <LeaderboardRow
              key={`${p.id}-${String(isSelf)}`}
              entry={{
                key: `strip-${p.id}`,
                rank: isSelf ? 1 : 4,
                name: p.id,
                isSelf,
                xp: 1840,
                palette: p.id,
              }}
              treatment="c"
              textless
              probeId={`strip-${isSelf ? 'self' : 'card'}-${p.id}`}
            />
          )),
        )}
      </Section>
    </ScrollView>
  );
}

// Copied verbatim from the friends screen's stylesheet.
const styles = StyleSheet.create({
  lbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  rankBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { fontFamily: AppFonts.extrabold, fontSize: 15 },
  lbName: { fontFamily: AppFonts.bold, fontSize: 16 },
  lbSub: { fontFamily: AppFonts.semibold, fontSize: 13, marginTop: 2 },
  // Harness chrome (not part of the row).
  h2: { fontFamily: AppFonts.extrabold, fontSize: 14, marginBottom: 4 },
  note: { fontFamily: AppFonts.regular, fontSize: 11, lineHeight: 15, marginBottom: 10 },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
  },
  refLabel: { fontFamily: AppFonts.bold, fontSize: 11, flex: 1 },
});
