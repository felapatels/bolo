/**
 * ChatRecordingContext
 *
 * Lets the bottom-nav Bolo button trigger hold-to-talk on the chat screen.
 *
 * Design: ref-based so callers (BoloTabButton) don't re-render on every phase
 * change. The only state (`isRecording`) is a boolean that flips only at the
 * recording boundary, the minimal surface that must cause a UI update (for the
 * accessibility label).
 */
import React from 'react';

type ChatRecordingContextValue = {
  /** Ref to the latest start-recording wrapper registered by chat.tsx. */
  startRecordingRef: React.MutableRefObject<(() => void) | null>;
  /** Ref to the latest stop-recording wrapper registered by chat.tsx. */
  stopRecordingRef: React.MutableRefObject<(() => void) | null>;
  /** Ref to the current chat phase, readable without subscribing. */
  phaseRef: React.MutableRefObject<string>;
  /**
   * True only while the mic is live. The single piece of state that drives a
   * re-render of BoloTabButton (for the accessibility label).
   */
  isRecording: boolean;
  /**
   * Called by chat.tsx on mount to hand off stable wrapper functions.
   * The wrappers should read fresh values from their own refs internally so
   * this only needs to be called once.
   */
  register: (start: () => void, stop: () => void) => void;
  /**
   * Called by chat.tsx whenever its `phase` state changes.
   * Updates `phaseRef` and flips `isRecording` state at the recording boundary.
   */
  notifyPhase: (phase: string) => void;
};

const ChatRecordingContext = React.createContext<ChatRecordingContextValue | null>(null);

export function ChatRecordingProvider({ children }: { children: React.ReactNode }) {
  const startRecordingRef = React.useRef<(() => void) | null>(null);
  const stopRecordingRef = React.useRef<(() => void) | null>(null);
  const phaseRef = React.useRef<string>('idle');
  const [isRecording, setIsRecording] = React.useState(false);

  const register = React.useCallback((start: () => void, stop: () => void) => {
    startRecordingRef.current = start;
    stopRecordingRef.current = stop;
  }, []);

  const notifyPhase = React.useCallback((phase: string) => {
    phaseRef.current = phase;
    setIsRecording(phase === 'recording');
  }, []);

  const value = React.useMemo(
    () => ({
      startRecordingRef,
      stopRecordingRef,
      phaseRef,
      isRecording,
      register,
      notifyPhase,
    }),
    [isRecording, register, notifyPhase],
  );

  return (
    <ChatRecordingContext.Provider value={value}>
      {children}
    </ChatRecordingContext.Provider>
  );
}

// Stable no-op fallback used when ChatScreen is rendered outside the provider
// (e.g. in unit tests that mount chat.tsx directly).  The nav-bar hold-to-talk
// feature simply does nothing in that environment, which is correct, no tab
// bar exists in isolation.
const NOOP = () => {};
const NO_OP_REFS = {
  startRecordingRef: { current: null } as React.MutableRefObject<(() => void) | null>,
  stopRecordingRef: { current: null } as React.MutableRefObject<(() => void) | null>,
  phaseRef: { current: 'idle' } as React.MutableRefObject<string>,
};
const FALLBACK: ChatRecordingContextValue = {
  ...NO_OP_REFS,
  isRecording: false,
  register: NOOP,
  notifyPhase: NOOP,
};

export function useChatRecording(): ChatRecordingContextValue {
  const ctx = React.useContext(ChatRecordingContext);
  // Return the no-op fallback when rendered outside the provider (standalone
  // screens in tests, Storybook, etc.) rather than throwing.
  return ctx ?? FALLBACK;
}
