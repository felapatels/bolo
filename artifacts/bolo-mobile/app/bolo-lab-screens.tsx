// BOLO LAB, SCREENS: chat's, the lessons' and the tailor's 3D bird (components/bolo3d/BoloLabScreens.tsx).
//
// A GATE, NOT THE SCREEN. Expo Router can load every route file when the app
// starts, so this file imports nothing from the 3D stack: it requires BoloLabScreens
// only when the lab is on, and a release build made without
// EXPO_PUBLIC_BOLO3D_LAB never loads react-native-webview at launch. Ledger X92's
// hidden-route rule: the 3D runtime never rides the launch path.
//
//   xcrun simctl openurl booted "bolo-mobile://bolo-lab-screens"

import React from 'react';
import { Redirect } from 'expo-router';
import { BOLO3D_LAB_ENABLED } from '@/lib/bolo3dFlag';

export default function BoloLabScreensRoute() {
  if (!BOLO3D_LAB_ENABLED) return <Redirect href="/" />;
  const { BoloLabScreens } = require('@/components/bolo3d/BoloLabScreens') as typeof import('@/components/bolo3d/BoloLabScreens');
  return <BoloLabScreens />;
}
