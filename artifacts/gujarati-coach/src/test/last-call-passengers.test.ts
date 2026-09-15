import { describe, it, expect } from 'vitest';
// LAST CALL'S PASSENGERS, pinned: the face rotation, the sign fitter, and where
// a figure stands. Art pass, 2026-09-14 (@workspace/script-trace
// last-call-passengers.ts, shared by both screens).
//
// Written 2026-09-14 and NOT YET RUN (typecheck only while developing, per
// CLAUDE.md). Runs with the full suite before the next build or publish.
import {
  LAST_CALL_PASSENGERS,
  assignLastCallPassengers,
  estimateSignTextWidth,
  fitSignText,
  lastCallFigureBox,
  lastCallPassengerById,
} from '@workspace/script-trace';

const ids = (n: number) => Array.from({ length: n }, (_, i) => 100 + i);

describe('assignLastCallPassengers', () => {
  it('gives every phrase a face', () => {
    const preview = ids(9);
    const faces = assignLastCallPassengers(preview, [...preview].reverse());
    for (const id of preview) expect(faces.get(id)).toBeDefined();
  });

  it('never puts one face twice in a row in the preview or the opening queue, including the re-queue wrap', () => {
    for (const n of [2, 3, 6, 7, 12]) {
      const preview = ids(n);
      // A deterministic scramble standing in for the screen's shuffle.
      const recall = [...preview].sort((a, b) => ((a * 7) % 11) - ((b * 7) % 11));
      const faces = assignLastCallPassengers(preview, recall);
      for (let i = 1; i < n; i++) {
        expect(faces.get(preview[i]!)).not.toBe(faces.get(preview[i - 1]!));
        expect(faces.get(recall[i]!)).not.toBe(faces.get(recall[i - 1]!));
      }
      if (n > 2) expect(faces.get(recall[n - 1]!)).not.toBe(faces.get(recall[0]!));
    }
  });

  it('is stable: the same orders deal the same faces', () => {
    const preview = ids(8);
    const recall = [...preview].reverse();
    expect([...assignLastCallPassengers(preview, recall)]).toEqual([...assignLastCallPassengers(preview, recall)]);
  });

  it('uses all six passengers across a six-phrase round', () => {
    const faces = assignLastCallPassengers(ids(6));
    expect(new Set(faces.values()).size).toBe(LAST_CALL_PASSENGERS.length);
  });
});

describe('fitSignText', () => {
  const opts = { maxFontSize: 30, minFontSize: 8, lineHeight: 1.2, maxLines: 3 };

  it('fits inside the box in at most three lines, never breaking a word', () => {
    const text = 'Where is the ticket counter please?';
    const fit = fitSignText(text, 120, 70, estimateSignTextWidth, opts);
    expect(fit.fits).toBe(true);
    expect(fit.lines.length).toBeLessThanOrEqual(3);
    expect(fit.lines.join(' ')).toBe(text);
    expect(fit.lines.length * fit.fontSize * 1.2).toBeLessThanOrEqual(70);
    for (const line of fit.lines) expect(estimateSignTextWidth(line, fit.fontSize)).toBeLessThanOrEqual(120);
  });

  it('shrinks for a longer line on the same card', () => {
    const short = fitSignText('Hello', 120, 70, estimateSignTextWidth, opts);
    const long = fitSignText('Please could you tell me which platform the Mumbai train leaves from', 120, 70, estimateSignTextWidth, opts);
    expect(long.fontSize).toBeLessThan(short.fontSize);
  });

  it('reports a text that cannot fit even at the floor, at the floor', () => {
    const fit = fitSignText('Supercalifragilisticexpialidocious', 20, 10, estimateSignTextWidth, opts);
    expect(fit.fits).toBe(false);
    expect(fit.fontSize).toBe(8);
  });
});

describe('lastCallFigureBox', () => {
  const phone = { w: 390, h: 741 };

  it('stands the door passenger at half the stage height, centred, bottom near the top of the steps', () => {
    const p = lastCallPassengerById('farmer');
    const box = lastCallFigureBox('door', p, phone.w, phone.h);
    expect(box.height).toBeCloseTo(phone.h * 0.5, 0);
    expect(box.cx).toBeCloseTo(phone.w / 2, 0);
    expect(box.bottom / phone.h).toBeGreaterThan(0.7);
    expect(box.bottom / phone.h).toBeLessThan(0.82);
    expect(box.width / box.height).toBeCloseTo(p.width / p.height, 3);
  });

  it('never lets a wide cut-out overflow a narrow stage', () => {
    const p = lastCallPassengerById('grandmother');
    const box = lastCallFigureBox('door', p, 300, 900);
    expect(box.width).toBeLessThanOrEqual(300 * 0.92 + 0.001);
  });

  it('queues smaller, fainter, further back and to the right', () => {
    const p = lastCallPassengerById('student');
    const door = lastCallFigureBox('door', p, phone.w, phone.h);
    const q1 = lastCallFigureBox('queue1', p, phone.w, phone.h);
    const q2 = lastCallFigureBox('queue2', p, phone.w, phone.h);
    expect(q1.height).toBeLessThan(door.height);
    expect(q2.height).toBeLessThan(q1.height);
    expect(q1.opacity).toBeLessThan(door.opacity);
    expect(q2.opacity).toBeLessThan(q1.opacity);
    expect(q1.cx).toBeGreaterThan(door.cx);
    expect(q1.bottom).toBeLessThan(door.bottom);
  });

  it('keeps every sign box inside its image', () => {
    for (const p of LAST_CALL_PASSENGERS) {
      expect(p.sign.x).toBeGreaterThanOrEqual(0);
      expect(p.sign.y).toBeGreaterThanOrEqual(0);
      expect(p.sign.x + p.sign.w).toBeLessThanOrEqual(1);
      expect(p.sign.y + p.sign.h).toBeLessThanOrEqual(1);
    }
  });
});
