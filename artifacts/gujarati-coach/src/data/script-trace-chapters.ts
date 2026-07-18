// Stroke guide data for the Script Trace game.
// Each character entry has:
//   id        — stable identifier (used as the characterId in the API)
//   char      — the Unicode character(s) to display
//   label     — romanised pronunciation label shown beneath the character
//   guide     — SVG path data (viewBox 0 0 100 100) used as the faint trace guide
//
// Paths are single-stroke or two-stroke approximations of each character's
// essential shape, designed to be traceable with a finger or mouse.

export type TraceCharacter = {
  id: string;
  char: string;
  label: string;
  guide: string;
};

export type TraceChapter = {
  id: string;
  title: string;
  scriptName: string;
  characters: TraceCharacter[];
};

// ── Gujarati Vowels ────────────────────────────────────────────────────────
const GUJARATI_VOWELS: TraceCharacter[] = [
  {
    id: "gu_a",
    char: "અ",
    label: "a",
    guide: "M 25,20 L 75,20 M 50,20 Q 35,30 33,48 Q 31,65 50,70 Q 68,74 70,58 Q 72,42 58,38 Q 45,34 45,20",
  },
  {
    id: "gu_aa",
    char: "આ",
    label: "aa",
    guide: "M 18,20 L 60,20 M 40,20 Q 26,30 24,48 Q 22,65 40,70 Q 56,74 58,58 M 72,15 L 72,80",
  },
  {
    id: "gu_i",
    char: "ઇ",
    label: "i",
    guide: "M 50,20 Q 28,28 26,50 Q 24,68 45,74 Q 64,78 68,60 Q 72,42 55,35",
  },
  {
    id: "gu_ii",
    char: "ઈ",
    label: "ii",
    guide: "M 30,12 L 70,12 M 50,22 Q 28,30 26,52 Q 24,70 45,76 Q 64,80 68,62 Q 72,44 55,37",
  },
  {
    id: "gu_u",
    char: "ઉ",
    label: "u",
    guide: "M 30,22 L 30,58 Q 30,78 52,78 Q 72,78 72,58 L 72,40",
  },
  {
    id: "gu_uu",
    char: "ઊ",
    label: "uu",
    guide: "M 28,22 L 28,58 Q 28,80 50,80 Q 72,80 72,60 L 72,40 Q 72,24 58,24",
  },
  {
    id: "gu_e",
    char: "એ",
    label: "e",
    guide: "M 20,38 Q 20,18 50,18 Q 80,18 80,38 Q 80,56 62,66 Q 44,76 50,86",
  },
  {
    id: "gu_ai",
    char: "ઐ",
    label: "ai",
    guide: "M 20,38 Q 20,18 50,18 Q 80,18 80,38 Q 80,56 62,66 M 26,26 L 36,10",
  },
  {
    id: "gu_o",
    char: "ઓ",
    label: "o",
    guide: "M 18,48 Q 18,24 48,24 Q 78,24 78,48 Q 78,68 60,74 L 60,88",
  },
  {
    id: "gu_au",
    char: "ઔ",
    label: "au",
    guide: "M 16,48 Q 16,24 46,24 Q 74,24 74,48 Q 74,68 58,74 M 80,18 L 80,74",
  },
];

// ── Hindi / Devanagari Vowels ──────────────────────────────────────────────
const HINDI_VOWELS: TraceCharacter[] = [
  {
    id: "hi_a",
    char: "अ",
    label: "a",
    guide: "M 20,30 L 80,30 M 35,30 Q 35,55 50,64 Q 65,74 65,64 M 65,30 L 65,74",
  },
  {
    id: "hi_aa",
    char: "आ",
    label: "aa",
    guide: "M 20,30 L 72,30 M 32,30 Q 32,54 48,62 Q 62,70 62,62 M 62,30 L 62,70 M 82,20 L 82,80",
  },
  {
    id: "hi_i",
    char: "इ",
    label: "i",
    guide: "M 60,22 L 60,78 M 60,34 Q 40,34 34,50 Q 28,66 40,74",
  },
  {
    id: "hi_ii",
    char: "ई",
    label: "ii",
    guide: "M 20,22 Q 40,12 62,22 M 62,22 L 62,78 M 62,34 Q 42,34 36,50 Q 30,66 42,74",
  },
  {
    id: "hi_u",
    char: "उ",
    label: "u",
    guide: "M 28,24 L 28,56 Q 28,76 50,76 Q 68,76 68,60 Q 68,44 52,42",
  },
  {
    id: "hi_uu",
    char: "ऊ",
    label: "uu",
    guide: "M 28,24 L 28,56 Q 28,76 50,76 Q 68,76 68,60 Q 68,44 52,42 Q 36,40 36,28 Q 36,18 52,18",
  },
  {
    id: "hi_e",
    char: "ए",
    label: "e",
    guide: "M 20,30 L 80,30 M 50,30 L 28,78",
  },
  {
    id: "hi_ai",
    char: "ऐ",
    label: "ai",
    guide: "M 20,30 L 80,30 M 50,30 L 28,78 M 32,52 L 68,52",
  },
  {
    id: "hi_o",
    char: "ओ",
    label: "o",
    guide: "M 20,30 L 80,30 M 18,30 Q 12,56 28,66 Q 44,76 56,70 Q 76,60 76,40 Q 76,30 64,30",
  },
  {
    id: "hi_au",
    char: "औ",
    label: "au",
    guide: "M 20,30 L 72,30 M 16,30 Q 10,56 26,66 Q 42,76 54,70 Q 72,60 72,42 Q 72,30 60,30 M 84,20 L 84,80",
  },
];

// ── Gujarati Consonants (first 10) ─────────────────────────────────────────
const GUJARATI_CONSONANTS: TraceCharacter[] = [
  {
    id: "gu_ka",
    char: "ક",
    label: "ka",
    guide: "M 30,20 L 30,80 M 30,48 Q 48,38 60,48 Q 72,58 60,70 Q 50,78 30,70",
  },
  {
    id: "gu_kha",
    char: "ખ",
    label: "kha",
    guide: "M 30,20 L 30,80 M 30,40 Q 50,30 65,40 Q 80,50 65,60 Q 50,70 30,62",
  },
  {
    id: "gu_ga",
    char: "ગ",
    label: "ga",
    guide: "M 70,30 Q 50,20 30,30 Q 20,40 25,55 Q 30,70 50,75 Q 70,78 75,65",
  },
  {
    id: "gu_gha",
    char: "ઘ",
    label: "gha",
    guide: "M 25,22 L 75,22 M 25,22 L 25,78 M 75,22 L 75,78 M 25,50 L 75,50",
  },
  {
    id: "gu_cha",
    char: "ચ",
    label: "cha",
    guide: "M 65,25 Q 40,20 30,38 Q 20,56 35,68 Q 50,80 70,72",
  },
  {
    id: "gu_ja",
    char: "જ",
    label: "ja",
    guide: "M 35,22 L 65,22 M 50,22 L 50,65 Q 50,80 35,82",
  },
  {
    id: "gu_ta",
    char: "ત",
    label: "ta",
    guide: "M 50,20 Q 28,28 25,50 Q 22,70 42,76 Q 60,80 70,68 M 50,20 Q 72,28 75,50",
  },
  {
    id: "gu_da",
    char: "દ",
    label: "da",
    guide: "M 35,22 Q 60,18 70,32 Q 80,48 65,60 Q 50,72 30,70 L 30,22",
  },
  {
    id: "gu_na",
    char: "ન",
    label: "na",
    guide: "M 28,22 L 28,78 M 28,22 L 72,22 M 72,22 L 72,78",
  },
  {
    id: "gu_pa",
    char: "પ",
    label: "pa",
    guide: "M 28,22 L 72,22 M 28,22 L 28,78 M 28,48 Q 50,38 72,48 Q 72,62 50,68 Q 30,68 28,58",
  },
];

// ── Hindi Consonants (first 10) ────────────────────────────────────────────
const HINDI_CONSONANTS: TraceCharacter[] = [
  {
    id: "hi_ka",
    char: "क",
    label: "ka",
    guide: "M 20,30 L 80,30 M 48,30 L 48,78 M 48,52 Q 62,44 72,52 Q 80,62 68,72",
  },
  {
    id: "hi_kha",
    char: "ख",
    label: "kha",
    guide: "M 20,30 L 80,30 M 35,30 L 35,78 M 65,30 L 65,78 M 35,54 L 65,54",
  },
  {
    id: "hi_ga",
    char: "ग",
    label: "ga",
    guide: "M 20,30 L 80,30 M 50,30 Q 25,38 22,55 Q 20,72 38,78 Q 55,82 68,72 Q 78,62 72,48",
  },
  {
    id: "hi_gha",
    char: "घ",
    label: "gha",
    guide: "M 20,30 L 80,30 M 25,30 L 25,78 M 55,30 L 55,78 M 80,30 Q 85,54 70,70",
  },
  {
    id: "hi_cha",
    char: "च",
    label: "cha",
    guide: "M 20,30 L 80,30 M 35,30 Q 30,52 35,70 Q 40,80 50,80 Q 60,80 65,70 Q 70,52 65,30",
  },
  {
    id: "hi_ja",
    char: "ज",
    label: "ja",
    guide: "M 20,30 L 80,30 M 50,30 L 50,65 Q 50,82 35,84",
  },
  {
    id: "hi_ta",
    char: "त",
    label: "ta",
    guide: "M 20,30 L 80,30 M 50,30 L 50,78 M 30,56 L 70,56",
  },
  {
    id: "hi_da",
    char: "द",
    label: "da",
    guide: "M 50,22 Q 72,22 78,40 Q 82,58 62,70 Q 42,80 28,68 L 28,30 Q 28,22 50,22",
  },
  {
    id: "hi_na",
    char: "न",
    label: "na",
    guide: "M 20,30 L 80,30 M 32,30 L 32,78 M 68,30 L 68,78 M 32,54 L 68,54",
  },
  {
    id: "hi_pa",
    char: "प",
    label: "pa",
    guide: "M 20,30 L 80,30 M 30,30 L 30,78 M 30,52 Q 50,42 70,52 Q 76,62 60,70 Q 44,76 30,68",
  },
];

export const SCRIPT_TRACE_CHAPTERS: TraceChapter[] = [
  {
    id: "gujarati-vowels",
    title: "Gujarati Vowels",
    scriptName: "Gujarati",
    characters: GUJARATI_VOWELS,
  },
  {
    id: "gujarati-consonants",
    title: "Gujarati Consonants",
    scriptName: "Gujarati",
    characters: GUJARATI_CONSONANTS,
  },
  {
    id: "hindi-vowels",
    title: "Hindi Vowels",
    scriptName: "Devanagari",
    characters: HINDI_VOWELS,
  },
  {
    id: "hindi-consonants",
    title: "Hindi Consonants",
    scriptName: "Devanagari",
    characters: HINDI_CONSONANTS,
  },
];
