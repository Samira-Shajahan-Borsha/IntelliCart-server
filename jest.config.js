/** @type {import('jest').Config} */
module.exports = {
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/../test/setup-env.ts'],
  coveragePathIgnorePatterns: ['/generated/'],
};
