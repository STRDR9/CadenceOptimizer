// Jest config for STRDR. Pure-logic modules (cadence math, timing) are tested
// off-device here via babel-jest (uses babel.config.js -> babel-preset-expo).
// Device/native behavior is still validated via EAS preview builds.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
};
