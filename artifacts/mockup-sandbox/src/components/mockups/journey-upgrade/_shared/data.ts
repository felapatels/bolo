// Static stand-in for the live /journey data (Gujarat Express line, gu).
// Shapes mirror LessonGroupSummary + the Station decoration in
// artifacts/gujarati-coach/src/pages/journey.tsx, values are hand-picked to
// exercise every visual state: completed, tested_out (Express), current
// (train + mascot), progression-locked, sentence-gated (All-Access chip),
// and a teaser (Free taste) station.

export const ACCENT = "#ea580c"; // Gujarat Express (journeyLines.ts)
export const GRAY = "#9ca3af"; // locked rail/marker color (journey.tsx)
export const BG = "hsl(210 40% 98%)"; // --background, used to split twin rails
export const LINE_NAME = "Gujarat Express";

export type StationStatus =
  | "completed"
  | "tested_out"
  | "in_progress"
  | "unlocked"
  | "locked";

export interface MockStation {
  id: number;
  stage: "phrase" | "sentence";
  status: StationStatus;
  stopNumber: number;
  stopCount: number;
  phraseCount: number;
  masteredCount: number;
  attemptedCount: number;
  isCurrent?: boolean;
  /** Free-taste marked station (M1 teaser chip). */
  teaser?: boolean;
  /** Sentence stop viewed by a Free learner, All-Access chip + lock. */
  sentenceGated?: boolean;
}

export interface MockZone {
  id: number;
  title: string;
  geoName: string;
  stations: MockStation[];
}

let idSeq = 1;
function st(p: Partial<MockStation> & Pick<MockStation, "status">): MockStation {
  return {
    id: idSeq++,
    stage: "phrase",
    stopNumber: 1,
    stopCount: 1,
    phraseCount: 5,
    masteredCount: 0,
    attemptedCount: 0,
    ...p,
  };
}

function numbered(stations: MockStation[]): MockStation[] {
  return stations.map((s, i) => ({
    ...s,
    stopNumber: i + 1,
    stopCount: stations.length,
  }));
}

export const ZONES: MockZone[] = [
  {
    id: 1,
    title: "Greetings & Manners",
    geoName: "Ahmedabad Junction",
    stations: numbered([
      st({ status: "completed", masteredCount: 5, attemptedCount: 5 }),
      st({ status: "tested_out", masteredCount: 5, attemptedCount: 5 }),
      st({ status: "unlocked", stage: "sentence", sentenceGated: true, phraseCount: 6 }),
    ]),
  },
  {
    id: 2,
    title: "Family",
    geoName: "Anand",
    stations: numbered([
      st({ status: "completed", masteredCount: 6, attemptedCount: 6, phraseCount: 6 }),
      st({ status: "in_progress", isCurrent: true, masteredCount: 2, attemptedCount: 3 }),
      st({ status: "locked" }),
    ]),
  },
  {
    id: 3,
    title: "Numbers 1-10",
    geoName: "Vadodara",
    stations: numbered([st({ status: "locked" }), st({ status: "locked" })]),
  },
  {
    id: 4,
    title: "Food & Eating",
    geoName: "Surat",
    stations: numbered([st({ status: "locked", teaser: true }), st({ status: "locked" })]),
  },
  {
    id: 5,
    title: "Everyday Words",
    geoName: "Rajkot",
    stations: numbered([st({ status: "locked" }), st({ status: "locked" })]),
  },
  {
    id: 6,
    title: "Feelings",
    geoName: "Dwarka",
    stations: numbered([
      st({ status: "locked" }),
      st({ status: "locked", stage: "sentence", sentenceGated: true, phraseCount: 6 }),
    ]),
  },
];

export const DONE_COUNT = 4;
export const TOTAL_COUNT = ZONES.reduce((n, z) => n + z.stations.length, 0);

export function mascotUrl(name: string): string {
  return `${import.meta.env.BASE_URL}mascot/${name}.png`;
}

export function isAccessible(s: MockStation): boolean {
  if (s.sentenceGated) return false;
  return (
    s.status === "unlocked" ||
    s.status === "in_progress" ||
    s.status === "completed" ||
    s.status === "tested_out"
  );
}

export function statusCopy(s: MockStation): string {
  if (s.status === "completed") return "Completed";
  if (s.status === "tested_out") return "Tested out";
  if (s.status === "in_progress") return "In progress";
  return isAccessible(s) ? "Now boarding" : "Locked";
}
