/**
 * THE PASSWORD CHECKLIST, build 19 (owner ask, 2026-08-29): the rules tick
 * live as the learner types, a red x-circle for not yet and a green
 * check-circle for met, and the screens wait for all of them.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PASSWORD_MIN_LENGTH,
  checkPassword,
  passwordMeetsAll,
  passwordProblem,
} from '@/lib/passwordRules';
import { PasswordChecklist } from '@/components/PasswordChecklist';

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    foreground: '#111111',
    mutedForeground: '#666666',
    destructive: '#CC0000',
    success: '#10B981',
  }),
}));
jest.mock('@/constants/fonts', () => ({
  AppFonts: { regular: 'Inter_400Regular', semibold: 'Inter_600SemiBold', bold: 'Inter_700Bold', extrabold: 'Inter_800ExtraBold' },
}));

describe('the rules', () => {
  it('needs eight characters, a letter and a number, and nothing else', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(checkPassword('').map((r) => r.met)).toEqual([false, false, false]);
    expect(checkPassword('abcdefgh').map((r) => [r.key, r.met])).toEqual([
      ['length', true],
      ['letter', true],
      ['number', false],
    ]);
    expect(checkPassword('1234').map((r) => r.met)).toEqual([false, false, true]);
    expect(passwordMeetsAll('chai1234')).toBe(true);
    expect(passwordMeetsAll('chaichai')).toBe(false);
    expect(passwordMeetsAll('12345678')).toBe(false);
  });

  it('counts a letter from any script, since these learners type them', () => {
    expect(passwordMeetsAll('नमस्ते12345')).toBe(true);
  });

  it('names the first unmet rule for the error line', () => {
    expect(passwordProblem('abc')).toBe('Password must be at least 8 characters.');
    expect(passwordProblem('12345678')).toBe('Password needs a letter.');
    expect(passwordProblem('abcdefgh')).toBe('Password needs a number.');
    expect(passwordProblem('abcdefg1')).toBeNull();
  });
});

describe('the checklist', () => {
  it('stays out of the way until the learner types', () => {
    render(<PasswordChecklist password="" />);
    expect(screen.queryByTestId('password-checklist')).toBeNull();
  });

  it('shows an x for not yet and a check for met, with the state in words too', () => {
    render(<PasswordChecklist password="abcdefgh" />);
    expect(screen.getByTestId('password-rule-length-met')).toBeTruthy();
    expect(screen.getByTestId('password-rule-letter-met')).toBeTruthy();
    expect(screen.getByTestId('password-rule-number-unmet')).toBeTruthy();
    // Never hue alone: the label carries the state for a screen reader and
    // for anyone who cannot tell the two colours apart.
    expect(screen.getByLabelText('A number: not yet')).toBeTruthy();
    expect(screen.getByLabelText('A letter: met')).toBeTruthy();
  });

  it('ticks everything for a password that passes', () => {
    render(<PasswordChecklist password="chai1234" />);
    expect(screen.queryAllByTestId(/password-rule-.*-unmet/)).toHaveLength(0);
    expect(screen.getAllByTestId(/password-rule-.*-met/)).toHaveLength(3);
  });
});

describe('the screens use it', () => {
  const ROOT = join(__dirname, '..');
  it('sign-up draws the checklist and waits for every rule', () => {
    const src = readFileSync(join(ROOT, 'app/(auth)/sign-up.tsx'), 'utf8');
    expect(src).toMatch(/<PasswordChecklist password=\{password\} \/>/);
    expect(src).toMatch(/disabled=\{!emailAddress \|\| !passwordMeetsAll\(password\)\}/);
  });

  it('set password draws the checklist and refuses on the same rules', () => {
    const src = readFileSync(join(ROOT, 'app/(app)/account/password.tsx'), 'utf8');
    expect(src).toMatch(/<PasswordChecklist password=\{next\} \/>/);
    expect(src).toMatch(/passwordProblem\(next\)/);
    expect(src).not.toMatch(/next\.length < 8/);
  });
});
