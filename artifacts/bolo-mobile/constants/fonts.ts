/**
 * Font registry for Bolo!.
 *
 * - UI font: Inter (the Calm & Modern theme's typeface).
 * - Native-script fonts: one Noto family per Eighth Schedule script, keyed by
 *   the `fontFamily` value stored on each Language row in the backend.
 *
 * `fontMap` is spread into `useFonts()` in app/_layout.tsx. The object keys
 * double as the `fontFamily` string used in StyleSheet styles.
 */
import type { TextStyle } from 'react-native';
import type { Language } from '@workspace/api-client-react';

import {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import {
  NotoSansBengali_400Regular,
  NotoSansBengali_700Bold,
} from '@expo-google-fonts/noto-sans-bengali';
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_700Bold,
} from '@expo-google-fonts/noto-sans-devanagari';
import {
  NotoSansGujarati_400Regular,
  NotoSansGujarati_700Bold,
} from '@expo-google-fonts/noto-sans-gujarati';
import {
  NotoSansGurmukhi_400Regular,
  NotoSansGurmukhi_700Bold,
} from '@expo-google-fonts/noto-sans-gurmukhi';
import {
  NotoSansKannada_400Regular,
  NotoSansKannada_700Bold,
} from '@expo-google-fonts/noto-sans-kannada';
import {
  NotoSansMalayalam_400Regular,
  NotoSansMalayalam_700Bold,
} from '@expo-google-fonts/noto-sans-malayalam';
import {
  NotoSansOriya_400Regular,
  NotoSansOriya_700Bold,
} from '@expo-google-fonts/noto-sans-oriya';
import {
  NotoSansTamil_400Regular,
  NotoSansTamil_700Bold,
} from '@expo-google-fonts/noto-sans-tamil';
import {
  NotoSansTelugu_400Regular,
  NotoSansTelugu_700Bold,
} from '@expo-google-fonts/noto-sans-telugu';
import { NotoSansMeeteiMayek_400Regular } from '@expo-google-fonts/noto-sans-meetei-mayek';
import { NotoSansOlChiki_400Regular } from '@expo-google-fonts/noto-sans-ol-chiki';
import {
  NotoNastaliqUrdu_400Regular,
  NotoNastaliqUrdu_700Bold,
} from '@expo-google-fonts/noto-nastaliq-urdu';
import {
  NotoNaskhArabic_400Regular,
  NotoNaskhArabic_700Bold,
} from '@expo-google-fonts/noto-naskh-arabic';

export const fontMap = {
  Inter_400Regular,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  NotoSansBengali_400Regular,
  NotoSansBengali_700Bold,
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_700Bold,
  NotoSansGujarati_400Regular,
  NotoSansGujarati_700Bold,
  NotoSansGurmukhi_400Regular,
  NotoSansGurmukhi_700Bold,
  NotoSansKannada_400Regular,
  NotoSansKannada_700Bold,
  NotoSansMalayalam_400Regular,
  NotoSansMalayalam_700Bold,
  NotoSansOriya_400Regular,
  NotoSansOriya_700Bold,
  NotoSansTamil_400Regular,
  NotoSansTamil_700Bold,
  NotoSansTelugu_400Regular,
  NotoSansTelugu_700Bold,
  NotoSansMeeteiMayek_400Regular,
  NotoSansOlChiki_400Regular,
  NotoNastaliqUrdu_400Regular,
  NotoNastaliqUrdu_700Bold,
  NotoNaskhArabic_400Regular,
  NotoNaskhArabic_700Bold,
};

/** UI (Latin) font — Inter (Calm & Modern theme). */
export const AppFonts = {
  regular: 'Inter_400Regular',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

// Maps the backend `fontFamily` string to loaded Noto font keys. Scripts with a
// single weight (Meetei Mayek, Ol Chiki) reuse Regular for bold.
const SCRIPT_FONTS: Record<string, { regular: string; bold: string }> = {
  'Noto Sans Bengali': {
    regular: 'NotoSansBengali_400Regular',
    bold: 'NotoSansBengali_700Bold',
  },
  'Noto Sans Devanagari': {
    regular: 'NotoSansDevanagari_400Regular',
    bold: 'NotoSansDevanagari_700Bold',
  },
  'Noto Sans Gujarati': {
    regular: 'NotoSansGujarati_400Regular',
    bold: 'NotoSansGujarati_700Bold',
  },
  'Noto Sans Gurmukhi': {
    regular: 'NotoSansGurmukhi_400Regular',
    bold: 'NotoSansGurmukhi_700Bold',
  },
  'Noto Sans Kannada': {
    regular: 'NotoSansKannada_400Regular',
    bold: 'NotoSansKannada_700Bold',
  },
  'Noto Sans Malayalam': {
    regular: 'NotoSansMalayalam_400Regular',
    bold: 'NotoSansMalayalam_700Bold',
  },
  'Noto Sans Oriya': {
    regular: 'NotoSansOriya_400Regular',
    bold: 'NotoSansOriya_700Bold',
  },
  'Noto Sans Tamil': {
    regular: 'NotoSansTamil_400Regular',
    bold: 'NotoSansTamil_700Bold',
  },
  'Noto Sans Telugu': {
    regular: 'NotoSansTelugu_400Regular',
    bold: 'NotoSansTelugu_700Bold',
  },
  'Noto Sans Meetei Mayek': {
    regular: 'NotoSansMeeteiMayek_400Regular',
    bold: 'NotoSansMeeteiMayek_400Regular',
  },
  'Noto Sans Ol Chiki': {
    regular: 'NotoSansOlChiki_400Regular',
    bold: 'NotoSansOlChiki_400Regular',
  },
  'Noto Nastaliq Urdu': {
    regular: 'NotoNastaliqUrdu_400Regular',
    bold: 'NotoNastaliqUrdu_700Bold',
  },
  'Noto Naskh Arabic': {
    regular: 'NotoNaskhArabic_400Regular',
    bold: 'NotoNaskhArabic_700Bold',
  },
};

/**
 * Returns a style fragment to render text in a language's own script:
 * the correct Noto font + right-to-left direction for Perso-Arabic scripts.
 * Falls back to the UI font when the language/script is unknown.
 */
export function nativeTextStyle(
  language: Language | undefined,
  opts?: { bold?: boolean },
): Pick<TextStyle, 'fontFamily' | 'writingDirection'> {
  if (!language) {
    return { fontFamily: opts?.bold ? AppFonts.bold : AppFonts.regular };
  }
  const entry = SCRIPT_FONTS[language.fontFamily];
  const fontFamily = entry
    ? opts?.bold
      ? entry.bold
      : entry.regular
    : opts?.bold
      ? AppFonts.bold
      : AppFonts.regular;
  return {
    fontFamily,
    writingDirection: language.rtl ? 'rtl' : 'ltr',
  };
}
