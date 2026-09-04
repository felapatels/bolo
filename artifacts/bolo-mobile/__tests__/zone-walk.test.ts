/**
 * THE ZONE WALK. Walks a learner through every zone of journey 1 in code and
 * asserts the things that, when wrong, leave a learner stuck with no error
 * anywhere: two blocking arrivals on one stop, a stop kind whose data is
 * missing, a run of voice stops with nothing between them.
 *
 * Owner, 2026-09-04: "i want to know that nothing breaks in one of the games
 * and stops the user from progressing", and earlier "no more than 2 stops of
 * normal voice learning in a row, after that either a game or chai", with "an
 * emergency or phone call is also an interruption between 2 stops".
 *
 * It is DATA-FREE ON PURPOSE. Zone sizes are swept from 1 to 12 graded stops,
 * which covers this app's ten, journey 2's one, and Bolo India's nine, seven,
 * five and three, so the same file runs unchanged in both repos. The
 * server-side counterpart pins the real sizes from the real seed.
 *
 * Every function here is the one the journey screen calls; nothing is
 * re-derived in the test. The chai stall cadence, the signal cadence, the row
 * plan, the Emergency index and the game rotation are all the production
 * ones, which is what makes a green run mean something.
 *
 * Web twin: gujarati-coach/src/test/zone-walk.test.ts, same cases, its own
 * imports.
 */
import { planZoneRows } from '@/lib/journeyRows';
import { isChachaEncounterStation } from '@/lib/chachaMemory';
import { planTracksideSignals } from '@/lib/tracksideSignals';
import { gameForSignal } from '@/lib/quick-games';
import { emergencyStopIndex, EMERGENCY_FILM_ZONES } from '@workspace/emergency';
import { storyBookFor } from '@workspace/story';

const ZONES = 6;
const SIZES = Array.from({ length: 12 }, (_, i) => i + 1);
/** A Plus learner's plan-visible phrase count: every game is eligible. */
const PLUS_VISIBLE = 100;
const LANG = 'hi';

type Arrival = {
  zoneIndex: number;
  gradedIndex: number;
  /** 1-based global station, the number the server and the chai stall use. */
  station: number;
  chaiStall: boolean;
  /** The game a trackside signal offers on arrival, or null. */
  game: string | null;
  emergency: boolean;
};

/** Every graded stop of every zone when every zone has `size` graded stops. */
function walk(size: number): Arrival[] {
  const out: Arrival[] = [];
  const total = size * ZONES;
  // A signal is seated in the gap AFTER an odd global stop and opens on
  // arrival at the next one, so the signal after stop N is met at N+1.
  const signalOnArrival = new Map<number, number>();
  for (const s of planTracksideSignals(total)) signalOnArrival.set(s.afterStop + 1, s.signalIndex);
  const emergencyAt = emergencyStopIndex(size);
  for (let z = 0; z < ZONES; z += 1) {
    for (let i = 0; i < size; i += 1) {
      const station = z * size + i + 1;
      const signalIndex = signalOnArrival.get(station);
      const game =
        signalIndex === undefined ? null : (gameForSignal(signalIndex, PLUS_VISIBLE)?.id ?? null);
      out.push({
        zoneIndex: z,
        gradedIndex: i,
        station,
        chaiStall: isChachaEncounterStation(station),
        game,
        emergency: emergencyAt === i,
      });
    }
  }
  return out;
}

/**
 * Stops that carry BOTH the chai stall and the Emergency on arrival, worked out
 * by hand from the two cadences (chai stall at global stations 3, 7, 11, ...;
 * Emergency at min(8, size - 1) of every zone) so the pin is independent of
 * the code it checks. The clients defer one behind the other's modal guard,
 * which today means the Emergency is SKIPPED at these stops (found in the
 * stop-sequence mapping, 2026-09-04). Pinned rather than asserted empty so
 * the walk stays green while the owner decides how to sequence them: a fix
 * shrinks this list, a regression grows it, and either shows up here.
 * This app's ten-stop zones are the three "size 10" lines.
 */
const KNOWN_COLLISIONS = [
  'size 3: zone 1 stop 3 (station 3)',
  'size 3: zone 5 stop 3 (station 15)',
  'size 5: zone 3 stop 5 (station 15)',
  'size 7: zone 1 stop 7 (station 7)',
  'size 7: zone 5 stop 7 (station 35)',
  'size 9: zone 3 stop 9 (station 27)',
  'size 10: zone 2 stop 9 (station 19)',
  'size 10: zone 4 stop 9 (station 39)',
  'size 10: zone 6 stop 9 (station 59)',
  'size 11: zone 3 stop 9 (station 31)',
];

describe('the zone walk: every zone of journey 1, every plausible size', () => {
  it('draws a row plan whose extra rows are in range and never share a slot', () => {
    for (const size of SIZES) {
      for (let z = 0; z < ZONES; z += 1) {
        const plan = planZoneRows({ lang: LANG, zoneIndex: z, gradedCount: size });
        // THREE SPLICED ROWS HERE, NOT TWO. The fork this file came from has
        // tracing and story; India added the LETTER row at stop 4 on
        // 2026-09-04, and it is the reason the walk is written off
        // `plan.rowCount` and a filtered list rather than off a literal 2.
        // A fourth row type joins by being added to this array.
        const extras = [plan.traceIndex, plan.storyIndex, plan.letterIndex].filter(
          (x): x is number => x !== null,
        );
        expect(plan.rowCount).toBe(size + extras.length);
        for (const idx of extras) {
          expect(idx).toBeGreaterThanOrEqual(0);
          expect(idx).toBeLessThan(plan.rowCount);
        }
        // No two spliced rows may take the same slot: one would be drawn over
        // the other and a learner would simply never see it.
        expect(new Set(extras).size).toBe(extras.length);
        // Every graded stop wears a distinct number, in order, inside the run.
        const numbers = Array.from({ length: size }, (_, i) => plan.rowNumberOfGraded(i));
        expect(new Set(numbers).size).toBe(size);
        expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
        expect(numbers[numbers.length - 1]).toBeLessThanOrEqual(plan.rowCount);
      }
    }
  });

  it('has a story book and an Emergency film for every journey 1 zone', () => {
    for (let z = 0; z < ZONES; z += 1) {
      expect(storyBookFor(1, z + 1)).not.toBeNull();
      expect(EMERGENCY_FILM_ZONES).toContain(z + 1);
    }
  });

  it('fires the Emergency inside every zone of two or more stops, never on the first', () => {
    for (const size of SIZES) {
      const at = emergencyStopIndex(size);
      if (size < 2) {
        expect(at).toBeNull();
        continue;
      }
      expect(at).not.toBeNull();
      expect(at!).toBeGreaterThan(0);
      expect(at!).toBeLessThan(size);
    }
  });

  it('never puts more than two plain voice stops in a row for a Plus learner (owner rule)', () => {
    // A breaker is anything that is not voice drilling: the chai stall, a game
    // offered by a signal, the Emergency, or a drawn story, tracing or LETTER
    // row sitting directly above the stop.
    for (const size of SIZES) {
      const arrivals = walk(size);
      for (let z = 0; z < ZONES; z += 1) {
        const plan = planZoneRows({ lang: LANG, zoneIndex: z, gradedCount: size });
        const drawnRows = new Set(
          [plan.traceIndex, plan.storyIndex, plan.letterIndex].filter(
            (x): x is number => x !== null,
          ),
        );
        let run = 0;
        for (const a of arrivals.filter((x) => x.zoneIndex === z)) {
          const rowAbove = plan.rowNumberOfGraded(a.gradedIndex) - 2; // 0-based row just above
          const brokenByRow = rowAbove >= 0 && drawnRows.has(rowAbove);
          const brokenOnArrival = a.chaiStall || a.game !== null || a.emergency;
          run = brokenByRow || brokenOnArrival ? 0 : run + 1;
          if (run > 2) {
            throw new Error(
              `size ${size}, zone ${z + 1}: stop ${a.gradedIndex + 1} is plain voice stop number ${run} in a row`,
            );
          }
        }
      }
    }
  });

  it('pins every stop that carries two blocking arrivals, so a new one cannot appear unnoticed', () => {
    const collisions: string[] = [];
    for (const size of SIZES) {
      for (const a of walk(size)) {
        if (a.chaiStall && a.emergency) {
          collisions.push(`size ${size}: zone ${a.zoneIndex + 1} stop ${a.gradedIndex + 1} (station ${a.station})`);
        }
      }
    }
    expect(collisions).toEqual(KNOWN_COLLISIONS);
  });
});
