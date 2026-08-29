/**
 * THE PASSWORD EYE, build 19. The Play testers asked for a show/hide toggle
 * on the password fields. All three password screens (sign-in, sign-up,
 * account/password) draw their inputs through AuthShell's Field, so the eye
 * lives there once; these tests pin the toggle itself and then pin that no
 * screen has grown a password input that bypasses it.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Field } from '@/components/AuthShell';

jest.mock('@/hooks/useColors', () => ({
  useColors: () => ({
    card: '#FFFFFF',
    border: '#DDDDDD',
    foreground: '#111111',
    mutedForeground: '#666666',
    destructive: '#CC0000',
    primary: '#6C3FC5',
    background: '#FFFFFF',
  }),
}));

// AuthShell imports the mascot and the screen chrome for its own wrapper;
// Field needs neither, and both reach native modules.
jest.mock('@/components/Mascot', () => {
  const { View } = require('react-native');
  return { Mascot: () => <View /> };
});
jest.mock('@/components/Screen', () => {
  const { View } = require('react-native');
  return { Screen: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});

describe('the password eye', () => {
  it('starts hidden, with the eye offering to show', () => {
    render(<Field label="Password" placeholder="Your password" secureTextEntry />);
    expect(screen.getByPlaceholderText('Your password').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Show password')).toBeTruthy();
  });

  it('reveals on tap and hides again on the next', () => {
    render(<Field label="Password" placeholder="Your password" secureTextEntry />);
    fireEvent.press(screen.getByTestId('password-eye'));
    expect(screen.getByPlaceholderText('Your password').props.secureTextEntry).toBe(false);
    expect(screen.getByLabelText('Hide password')).toBeTruthy();
    fireEvent.press(screen.getByTestId('password-eye'));
    expect(screen.getByPlaceholderText('Your password').props.secureTextEntry).toBe(true);
    expect(screen.getByLabelText('Show password')).toBeTruthy();
  });

  it('keeps the caller\'s autoComplete, so password managers still see a password field', () => {
    render(
      <Field
        label="New password"
        placeholder="At least 8 characters"
        secureTextEntry
        autoComplete="new-password"
      />,
    );
    fireEvent.press(screen.getByTestId('password-eye'));
    const input = screen.getByPlaceholderText('At least 8 characters');
    expect(input.props.autoComplete).toBe('new-password');
    expect(input.props.secureTextEntry).toBe(false);
  });

  it('draws no eye on a plain field', () => {
    render(<Field label="Email" placeholder="you@example.com" />);
    expect(screen.queryByTestId('password-eye')).toBeNull();
    expect(screen.getByPlaceholderText('you@example.com').props.secureTextEntry).toBe(false);
  });
});

describe('every password input goes through Field', () => {
  // A raw <TextInput secureTextEntry> anywhere in app/ would be a password
  // field without the eye. The screens are named rather than globbed so a
  // new one is a deliberate addition to this list.
  const ROOT = join(__dirname, '..');
  const SCREENS = [
    'app/(auth)/sign-in.tsx',
    'app/(auth)/sign-up.tsx',
    'app/(app)/account/password.tsx',
  ];

  it.each(SCREENS)('%s renders its password field(s) with Field', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src).toMatch(/<Field[\s\S]*?secureTextEntry/);
    // A bare TextInput import would be the bypass.
    expect(src).not.toMatch(/\bTextInput\b/);
  });
});
