const base = require('./jest.config')

/**
 * Integration suite: needs a live database. Run with `npm run test:integration`.
 * The default `npm test` deliberately excludes these so it stays dependency free.
 *
 * @type {import('jest').Config}
 */
module.exports = {
	...base,
	testMatch: ['<rootDir>/src/**/*.integration.spec.ts'],
	testPathIgnorePatterns: ['/node_modules/'],
}
