/**
 * Jest config for the Bolo! Mobile app.
 *
 * Uses the `jest-expo` preset so React Native / Expo modules transform and mock
 * correctly, plus @testing-library/react-native for component tests. Path alias
 * `@/*` mirrors tsconfig so imports resolve the same way as in the app.
 */
// pnpm can end up with SEVERAL react-native instances in the store, because any
// dependency change re-resolves optional peers and pnpm encodes those peers in
// the store path (`react-native@0.81.5_..._supports-color@8.1.1_...`). When the
// app resolves one copy and jest-expo mocks another, the bridge mock never
// applies and 22 suites die with "__fbBatchedBridgeConfig is not set".
//
// Pinning react-native to a single resolved copy makes the suite immune to that
// whole class of churn, rather than the repo having to avoid ever changing a
// dependency. Resolved dynamically because the store path carries a hash.
const path = require('path');
const reactNativeRoot = path.dirname(
  require.resolve('react-native/package.json'),
);

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest-setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^react-native$': reactNativeRoot,
    '^react-native/(.*)$': `${reactNativeRoot}/$1`,
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
};
