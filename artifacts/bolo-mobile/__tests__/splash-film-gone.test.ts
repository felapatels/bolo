// THE OTHER HALF OF THE LAUNCH HANDOVER.
//
// splashReady already carried "home has its data", published from the leaf and
// read at the root. This is the reverse: "the film has gone", published from
// the root and read by home, because home's stats count up from zero over
// 700ms and on a cold start the splash covers the whole of it. The one thing
// that animation exists to do was happening where nobody could see it: "I think
// the splash covers the countup" (owner, 2026-08-27, chat 12).
//
// The case that matters most here is the LAUNCH WHERE THE FILM NEVER PLAYS. A
// warm start reads the play-once latch and BrandSplash begins at 'done', so
// anything waiting on this signal would wait forever if it only fired at the
// end of a fade that never ran. That is trap 6 in this repo's own list: a
// callback is not a completion signal, and anything that can fail to arrive
// needs a bound.
import {
  markFilmGone,
  useFilmGone,
  markHomeReady,
  useHomeReady,
  __resetSplashReadyForTests,
} from '@/lib/splashReady';
import { renderHook, act } from '@testing-library/react-native';

beforeEach(() => {
  __resetSplashReadyForTests();
});

describe('the film-gone signal', () => {
  it('starts false and flips once the film reports gone', () => {
    const { result } = renderHook(() => useFilmGone());
    expect(result.current).toBe(false);
    act(() => markFilmGone());
    expect(result.current).toBe(true);
  });

  it('is already true for a subscriber that mounts after the film went', () => {
    // Home can mount late: a learner who navigates away and back gets a fresh
    // subscriber long after the film is a memory, and it must not sit waiting
    // for a signal that has already been sent.
    markFilmGone();
    const { result } = renderHook(() => useFilmGone());
    expect(result.current).toBe(true);
  });

  it('is idempotent, so a second report cannot re-notify', () => {
    const { result } = renderHook(() => useFilmGone());
    act(() => markFilmGone());
    act(() => markFilmGone());
    expect(result.current).toBe(true);
  });

  it('is a SEPARATE flag from home-ready, not a phase of it', () => {
    // They are published by different components at different moments. On the
    // launch where home settles instantly and the film plays its full length
    // they diverge by seconds, and collapsing them would make each one lie
    // about the other exactly then.
    const film = renderHook(() => useFilmGone());
    const home = renderHook(() => useHomeReady());
    act(() => markHomeReady());
    expect(home.result.current).toBe(true);
    expect(film.result.current).toBe(false);
    act(() => markFilmGone());
    expect(film.result.current).toBe(true);
  });

  it('the reset clears BOTH, or one test leaks into the next', () => {
    markHomeReady();
    markFilmGone();
    __resetSplashReadyForTests();
    expect(renderHook(() => useFilmGone()).result.current).toBe(false);
    expect(renderHook(() => useHomeReady()).result.current).toBe(false);
  });
});
