// BOLO LAB: the 3D runtime, every control in one place (components/bolo3d/BoloLab.tsx).
//
// A GATE, NOT THE SCREEN. Expo Router can load every route file when the app
// starts, so this file imports nothing from the 3D stack: it requires BoloLab
// only when the lab is on, and a release build made without
// EXPO_PUBLIC_BOLO3D_LAB never loads react-native-webview at launch. Ledger X92's
// hidden-route rule: the 3D runtime never rides the launch path.
//
//   xcrun simctl openurl booted "bolo-mobile://bolo-lab"

import React from 'react';
import { Redirect } from 'expo-router';
import { BOLO3D_LAB_ENABLED } from '@/lib/bolo3dFlag';

export default function BoloLabRoute() {
  if (!BOLO3D_LAB_ENABLED) return <Redirect href="/" />;
  const { BoloLab } = require('@/components/bolo3d/BoloLab') as typeof import('@/components/bolo3d/BoloLab');
  return <BoloLab />;
}
