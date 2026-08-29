/**
 * What Chacha-ji just said, on screen, twice.
 *
 * TWO LINES, ALWAYS IN THIS ORDER: his words in the language's own script, and
 * a romanization beneath them. The script is what the learner is here to learn
 * to read; the romanization is the crutch that lets them keep up while they
 * cannot yet. Owner ruling, 2026-08-28.
 *
 * THE SECOND LINE IS OPTIONAL AND ITS ABSENCE IS CORRECT. The server romanizes
 * with the same deterministic transliterator the "We heard" line uses, and that
 * returns nothing for scripts it cannot convert honestly (Perso-Arabic, Ol
 * Chiki, Meetei Mayek). One line is right in those languages. A wrong
 * romanization would be worse than none, so nothing is invented to fill the gap.
 *
 * NO SCORE, NO CORRECTION, NO RIGHT-OR-WRONG. A call is an event, not a lesson.
 * The only feedback that appears here is chai the learner EARNED, never a mark
 * against an answer they did not. There is deliberately no red state, no cross,
 * and no "try again" in this component, and there should never be one.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface CallCaptionsProps {
  /** His line, in the language's own script. */
  text: string;
  /** The romanization. Null when the script cannot be romanized honestly. */
  romanized?: string | null;
  /**
   * Chai this turn earned, if any. Absent and zero both mean "say nothing":
   * an answer that earned nothing is not announced, because announcing it is
   * the correction this feature does not do.
   */
  chaiEarned?: number;
  /**
   * XP this turn earned. The GAME call's currency, never alongside chai: chai
   * is what he gives you for picking up when HE rang, XP is what every other
   * game on the hub pays (owner, 2026-08-28).
   */
  xpEarned?: number;
  /**
   * How the turn went, for the pill under the caption. Pairs with the glow at
   * the screen edge so the state never rests on hue alone.
   *
   * `missed` says he heard nothing, and it is deliberately NOT a mark against
   * the learner: it carries an ear rather than a cross, says "didn't catch
   * that" rather than "wrong", and never asks them to try again. A miss is as
   * often the room or the microphone as it is a learner who froze.
   */
  outcome?: 'earned' | 'missed' | null;
}

export function CallCaptions({
  text,
  romanized,
  chaiEarned = 0,
  xpEarned = 0,
  outcome = null,
}: CallCaptionsProps) {
  if (!text.trim()) return null;

  // Repeating the line under itself helps nobody. The server sends the
  // romanization straight through untouched when he already wrote in Latin
  // letters, so this is the guard that keeps it from being shown twice.
  const second =
    romanized && romanized.trim() && romanized.trim() !== text.trim()
      ? romanized.trim()
      : null;

  return (
    <View testID="call-captions" style={styles.wrap}>
      <Text testID="call-caption-native" style={styles.native}>
        {text}
      </Text>
      {second ? (
        <Text testID="call-caption-romanized" style={styles.roman}>
          {second}
        </Text>
      ) : null}

      {chaiEarned > 0 ? (
        // THE ONLY FEEDBACK ON THIS SCREEN, and it is a gift rather than a
        // grade. Never colour alone: a cup glyph, the word, and a number, so
        // it reads with the colour removed. See the answer/ignore controls on
        // the ringing screen for the same rule.
        <View testID="call-chai-earned" style={styles.chai}>
          <Ionicons name="cafe" size={15} color="#FFD79A" />
          <Text style={styles.chaiText}>
            +{chaiEarned} chai
          </Text>
        </View>
      ) : null}

      {xpEarned > 0 ? (
        // The game call's half of the same gift. Bolt, number and the word, on
        // the same rule as the cup.
        <View testID="call-xp-earned" style={styles.chai}>
          <Ionicons name="flash" size={15} color="#7CFFB2" />
          <Text style={[styles.chaiText, { color: '#7CFFB2' }]}>
            +{xpEarned} XP
          </Text>
        </View>
      ) : null}

      {outcome === 'missed' ? (
        // AN EAR, NOT A CROSS, AND NO "TRY AGAIN". He is delighted by anything
        // they say and that has to include nothing; this line says the turn
        // was not heard, and then the call moves on exactly as it always did.
        // The word and the glyph both carry it, so it reads with the colour
        // removed and beside the amber glow rather than depending on it.
        <View testID="call-nothing-heard" style={styles.missed}>
          <Ionicons name="ear" size={15} color="#FFC46B" />
          <Text style={[styles.chaiText, { color: '#FFC46B' }]}>
            Didn&apos;t catch that
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 20,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
  },
  native: {
    fontSize: 25,
    lineHeight: 34,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  roman: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  chai: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  missed: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  chaiText: { fontSize: 14, fontWeight: '700', color: '#FFD79A' },
});
