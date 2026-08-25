/** @type {import('jest').Config} */
module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	testMatch: ['<rootDir>/src/**/*.spec.ts'],
	// Integration specs need a live sqlite/MySQL/Postgres and are opted into via
	// `npm run test:integration`, so the default run stays fast and dependency free.
	testPathIgnorePatterns: ['/node_modules/', '\\.integration\\.spec\\.ts$'],
	collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts'],
}
