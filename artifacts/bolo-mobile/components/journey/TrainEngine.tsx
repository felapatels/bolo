import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/**
 * Characterful side-profile steam engine — a react-native-svg port of the web
 * component (gujarati-coach/src/components/train-svg.tsx). The web version
 * tints with `currentColor`; here the caller passes the journey line's accent
 * as `color` explicitly. Faces right — the direction of travel down the line.
 */
export function TrainEngine({
  color,
  width = 64,
  height = 42,
}: {
  color: string;
  width?: number;
  height?: number;
}) {
  return (
    <Svg viewBox="0 0 64 42" width={width} height={height} fill="none">
      {/* cab roof */}
      <Rect x={0} y={4} width={21} height={4.5} rx={2.25} fill={color} />
      {/* cab body */}
      <Rect x={2} y={7.5} width={17} height={21} rx={2} fill={color} />
      {/* cab window */}
      <Rect x={5} y={11} width={11} height={8} rx={2} fill="white" opacity={0.92} />
      {/* boiler */}
      <Rect x={17} y={14} width={33} height={14.5} rx={7} fill={color} />
      {/* smokebox front */}
      <Rect x={45} y={12.5} width={9.5} height={16} rx={3.5} fill={color} />
      {/* funnel (flared) */}
      <Path d="M40.5 6.5h9l-1.6 7h-5.8z" fill={color} />
      <Rect x={39.5} y={4.5} width={11} height={3} rx={1.5} fill={color} />
      {/* steam dome */}
      <Path d="M27 14v-3.2a4 4 0 0 1 8 0V14z" fill={color} />
      {/* friendly eye on the smokebox */}
      <Circle cx={50.5} cy={17.5} r={2.6} fill="white" opacity={0.95} />
      <Circle cx={51.3} cy={17.9} r={1.2} fill={color} />
      {/* headlamp */}
      <Rect x={54} y={18.5} width={2.5} height={4} rx={1} fill={color} />
      {/* running board */}
      <Rect x={1} y={28.5} width={56} height={3} rx={1.5} fill={color} />
      {/* cowcatcher */}
      <Path d="M56 28.5 63.5 36H56z" fill={color} />
      {/* wheels — white hubs keep them legible on tinted bodies */}
      <Circle cx={11} cy={35.5} r={5.5} fill={color} />
      <Circle cx={11} cy={35.5} r={2.2} fill="white" opacity={0.9} />
      <Circle cx={26} cy={35.5} r={5.5} fill={color} />
      <Circle cx={26} cy={35.5} r={2.2} fill="white" opacity={0.9} />
      <Circle cx={40} cy={35.5} r={5.5} fill={color} />
      <Circle cx={40} cy={35.5} r={2.2} fill="white" opacity={0.9} />
      <Circle cx={51.5} cy={36.5} r={4.5} fill={color} />
      <Circle cx={51.5} cy={36.5} r={1.8} fill="white" opacity={0.9} />
      {/* coupling rod */}
      <Rect x={9} y={34.5} width={33} height={2} rx={1} fill="white" opacity={0.55} />
    </Svg>
  );
}
