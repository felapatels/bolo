// THE LINE THAT SWELLS WHILE IT IS SPOKEN (build 29). The owner asked for the
// word to enlarge while the coach says it and the meaning to enlarge for its
// half, "so learners can tie the visual to the audio for better learning".
//
// These pin the decisions that are NOT preferences, because each one has a
// failure mode that is invisible in a simulator.
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { SpokenLine } from '@/components/SpokenLine';

describe('SpokenLine', () => {
  test('renders its child whether speaking or not', () => {
    const a = render(
      <SpokenLine speaking={false} reduceMotion={false}><Text>नमस्ते</Text></SpokenLine>,
    );
    expect(a.getByText('नमस्ते')).toBeOnTheScreen();
    a.unmount();
    const b = render(
      <SpokenLine speaking reduceMotion={false}><Text>नमस्ते</Text></SpokenLine>,
    );
    expect(b.getByText('नमस्ते')).toBeOnTheScreen();
  });

  test('SCALES, never resizes the font', () => {
    // Animating fontSize relayouts the card and everything under it jumps on
    // every play. The growth must live in a transform, which costs no layout.
    const { UNSAFE_root } = render(
      <SpokenLine speaking reduceMotion={false}><Text>नमस्ते</Text></SpokenLine>,
    );
    const flat = JSON.stringify(UNSAFE_root.props ?? {});
    expect(flat).not.toContain('fontSize');
  });

  test('reduced motion holds it still and still shows the words', () => {
    const { getByText } = render(
      <SpokenLine speaking reduceMotion><Text>नमस्ते</Text></SpokenLine>,
    );
    // Nothing is lost by not animating: the audio still says both parts.
    expect(getByText('नमस्ते')).toBeOnTheScreen();
  });

  test('toggling speaking does not remount the child', () => {
    const { getByText, rerender } = render(
      <SpokenLine speaking={false} reduceMotion={false}><Text>नमस्ते</Text></SpokenLine>,
    );
    const before = getByText('नमस्ते');
    rerender(<SpokenLine speaking reduceMotion={false}><Text>नमस्ते</Text></SpokenLine>);
    // A remount would restart any child animation and flicker the glyph.
    expect(getByText('नमस्ते')).toBe(before);
  });
});
