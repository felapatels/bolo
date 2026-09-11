import { orderedZoneStops, nextUnownedStop } from '@/lib/journeyStopOrder';
import { planZoneRows } from '@/lib/journeyRows';

describe('purchase order', () => {
  it('matches the visible journey positions, including synthetic stops', () => {
    const lang = 'gu';
    const groups = [{ id: 101, position: 1, stage: 'phrase' }, { id: 102, position: 2, stage: 'phrase' }, { id: 103, position: 3, stage: 'phrase' }];
    for (let zone = 1; zone <= 6; zone++) {
      const rows = planZoneRows({ lang, zoneIndex: zone - 1, gradedCount: groups.length });
      const ordered = orderedZoneStops(lang, 1, zone, groups);
      expect(ordered.length).toBe(rows.rowCount);
      if (rows.traceIndex != null) expect(ordered[rows.traceIndex]?.kind).toBe('trace');
      if (rows.storyIndex != null) expect(ordered[rows.storyIndex]?.kind).toBe('story');
      if (rows.letterIndex != null) expect(ordered[rows.letterIndex]?.kind).toBe('letter');
      groups.forEach((group, i) => expect(ordered[rows.rowNumberOfGraded(i) - 1]?.lessonGroupId).toBe(group.id));
    }
  });
  it('advances only past owned stops, regardless of later ownership', () => {
    const a = { kind: 'lesson' as const, languageCode: 'xx', journey: 1, zone: 2, lessonGroupId: 1 };
    const b = { ...a, lessonGroupId: 2 };
    const c = { ...a, lessonGroupId: 3 };
    expect(nextUnownedStop([a, b, c], [c])).toEqual(a);
    expect(nextUnownedStop([a, b, c], [a, c])).toEqual(b);
    expect(nextUnownedStop([a, b, c], [a, b, c])).toBeUndefined();
    expect(nextUnownedStop([a], [{ ...a, languageCode: 'yy' }])).toEqual(a);
  });
});
