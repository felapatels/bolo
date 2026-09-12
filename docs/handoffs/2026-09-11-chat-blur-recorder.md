# Chat recorder cleanup on navigation

ENGINE. Africa iPad screenshot navigation exposed an unhandled rejected promise: Calling the stop function has failed. Chat blur stops the recorder even when idle; the existing try/catch handled synchronous throws but not the rejected stop promise. Handle that rejection as best-effort cleanup too. No recording, permission, transcription or server behavior changes. Same correction applied to all six mobile clients; web does not use this native recorder lifecycle.

All six mobile typechecks passed. No full suites per owner instruction.
