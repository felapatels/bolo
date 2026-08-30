import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Screen } from '@/components/Screen';
import { CONTENT_MAX_W } from '@/lib/contentWidth';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Every screen inherits the iPad column from here (build 25), so the wrapper
// is pinned rather than fifty screens: children sit in a centred box no wider
// than the column, and a screen that draws its own full-bleed art can opt out.
describe('Screen', () => {
  it('lays its children out in the centred content column', () => {
    render(
      <Screen>
        <Text>inside</Text>
      </Screen>,
    );
    const column = screen.getByText('inside').parent;
    expect(column).toHaveStyle({ maxWidth: CONTENT_MAX_W, alignSelf: 'center', width: '100%' });
  });

  it('gives the whole window to a screen that opts out', () => {
    render(
      <Screen column={false}>
        <Text>bleed</Text>
      </Screen>,
    );
    const parent = screen.getByText('bleed').parent;
    expect(parent).not.toHaveStyle({ maxWidth: CONTENT_MAX_W });
  });
});
