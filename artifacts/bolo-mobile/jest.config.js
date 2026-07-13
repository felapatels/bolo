/**
 * Jest config for the Bolo! Mobile app.
 *
 * Uses the `jest-expo` preset so React Native / Expo modules transform and mock
 * correctly, plus @testing-library/react-native for component tests. Path alias
 * `@/*` mirrors tsconfig so imports resolve the same way as in the app.
 */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest-setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
};
