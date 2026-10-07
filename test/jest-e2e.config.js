/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  testRegex: 'test/e2e/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  testTimeout: 30000,
  setupFiles: ['<rootDir>/test/setup-env.ts'],
};
