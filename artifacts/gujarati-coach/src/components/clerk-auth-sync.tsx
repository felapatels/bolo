import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/react';
import { setAuthTokenGetter } from '@workspace/api-client-react';

/**
 * Registers a fresh Clerk session token getter for every API request.
 *
 * A ref holds the latest `getToken` identity so the module-level registration
 * is a single stable closure that never goes stale, no need to re-register
 * when Clerk internally rotates the function reference across renders.
 *
 * This component is placed as the FIRST child inside <ClerkProvider>, before
 * <QueryClientProvider>. React renders siblings in order: the synchronous
 * setAuthTokenGetter call below runs before QueryClientProvider (and therefore
 * before any child query hook) renders. Effects fire after the full render
 * pass, so by the time any useQuery schedules a fetch the getter is already
 * registered, the startup race is closed without gating or suspense.
 *
 * Renders nothing; exists only for its side effects.
 */
export function ClerkAuthSync(): null {
  const { getToken } = useAuth();

  // Always keep the ref pointing at the latest getToken.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Register synchronously during render so the getter is in place before
  // QueryClientProvider and its children render for the first time.
  setAuthTokenGetter(() => getTokenRef.current());

  useEffect(() => {
    // Re-affirm registration after mount (handles StrictMode double-invoke
    // and any sign-in / sign-out transitions that remount this component).
    setAuthTokenGetter(() => getTokenRef.current());

    return () => {
      // Clear when ClerkProvider unmounts so no dangling getter remains.
      setAuthTokenGetter(null);
    };
  }, []);

  return null;
}
