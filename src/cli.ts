#!/usr/bin/env node
import * as path from 'path'
import { parseArgs } from 'node:util'
import type { Sequelize } from 'sequelize-typescript'
import { SequelizeTypescriptMigration } from './index'

const USAGE = `
Usage: sequelize-typescript-migration --config <path> --out-dir <path> [options]

Generates a sequelize-cli migration file from the difference between your models
and the schema snapshot recorded by the previous run.

Options:
  -c, --config <path>    Module exporting the Sequelize instance to read models from.
                         Either a default export, a named "sequelize" export, or the
                         instance itself.
  -o, --out-dir <path>   Directory to write the migration into. Point this at the
                         same path sequelize-cli reads migrations from.
  -n, --name <name>      Migration name. Default: "noname".
      --comment <text>   Comment recorded in the migration's info block.
  -p, --preview          Print what would be generated without writing anything.
                         Read-only: touches nothing in the database.
      --debug            Print the full stack trace on failure.
  -h, --help             Show this message.
  -v, --version          Print the version.

TypeScript config files need a loader, since this tool does not bundle one:

  node --import tsx ./node_modules/.bin/sequelize-typescript-migration \\
    --config ./src/database.ts --out-dir ./migrations

After generating, apply it with sequelize-cli:

  npx sequelize db:migrate
`

/** Everything the CLI needs from its environment, so tests can supply their own. */
export interface CliIo {
	log(message: string): void
	error(message: string): void
}

const defaultIo: CliIo = {
	log: (message) => console.log(message),
	error: (message) => console.error(message),
}

/**
 * Runs the CLI and returns the process exit code.
 *
 * Returning rather than calling process.exit keeps this testable, and keeps the
 * library-side rule -- never terminate the host process -- true of the CLI wrapper too.
 */
export async function runCli(
	argv: string[],
	io: CliIo = defaultIo,
): Promise<number> {
	let parsed: ReturnType<typeof parseArgs>

	try {
		parsed = parseArgs({
			args: argv,
			options: {
				config: { type: 'string', short: 'c' },
				'out-dir': { type: 'string', short: 'o' },
				name: { type: 'string', short: 'n' },
				comment: { type: 'string' },
				preview: { type: 'boolean', short: 'p' },
				debug: { type: 'boolean' },
				help: { type: 'boolean', short: 'h' },
				version: { type: 'boolean', short: 'v' },
			},
			allowPositionals: false,
		})
	} catch (err) {
		io.error(`${(err as Error).message}\n${USAGE}`)
		return 1
	}

	const values = parsed.values as Record<string, string | boolean | undefined>

	if (values.help) {
		io.log(USAGE.trim())
		return 0
	}

	if (values.version) {
		io.log(readVersion())
		return 0
	}

	const configPath = values.config as string | undefined
	const outDir = values['out-dir'] as string | undefined

	if (!configPath || !outDir) {
		io.error(`Both --config and --out-dir are required.\n${USAGE}`)
		return 1
	}

	try {
		const sequelize = loadSequelize(configPath)
		const result = await SequelizeTypescriptMigration.makeMigration(
			sequelize,
			{
				outDir: path.resolve(outDir),
				migrationName: values.name as string | undefined,
				comment: values.comment as string | undefined,
				preview: values.preview === true,
				debug: values.debug === true,
			},
		)

		if (result.status === 'no-changes') {
			io.log('No changes found. Nothing to generate.')
		}

		return 0
	} catch (err) {
		const error = err as Error
		io.error(values.debug ? String(error.stack) : `Error: ${error.message}`)
		return 1
	}
}

/**
 * Resolves the Sequelize instance from the config module, accepting the three shapes
 * people actually write: a default export, a named `sequelize` export, or the instance
 * as the module itself.
 */
export function loadSequelize(configPath: string): Sequelize {
	const resolved = path.resolve(configPath)

	let loaded: unknown
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		loaded = require(resolved)
	} catch (err) {
		const message = (err as Error).message

		if (resolved.endsWith('.ts')) {
			throw new Error(
				`Could not load ${resolved}. TypeScript config files need a loader, which ` +
					`this tool does not bundle. Try:\n\n` +
					`  node --import tsx ./node_modules/.bin/sequelize-typescript-migration ...\n\n` +
					`Original error: ${message}`,
				{ cause: err },
			)
		}

		throw new Error(`Could not load ${resolved}: ${message}`, {
			cause: err,
		})
	}

	const candidate = pickInstance(loaded)

	if (!candidate) {
		throw new Error(
			`${resolved} did not export a Sequelize instance. Export it as the default ` +
				`export, as a named "sequelize" export, or as module.exports itself.`,
		)
	}

	return candidate
}

function pickInstance(loaded: unknown): Sequelize | undefined {
	const module = loaded as Record<string, unknown> | undefined

	for (const candidate of [module?.default, module?.sequelize, module]) {
		if (isSequelize(candidate)) {
			return candidate as Sequelize
		}
	}

	return undefined
}

/**
 * Duck-typed on purpose: an `instanceof` check fails when the consumer's Sequelize is a
 * different copy of the package than ours, which peerDependencies discourage but
 * monorepos still produce.
 */
function isSequelize(value: unknown): boolean {
	if (!value || typeof value !== 'object') {
		return false
	}

	const candidate = value as Record<string, unknown>
	return (
		typeof candidate.getQueryInterface === 'function' &&
		typeof candidate.authenticate === 'function' &&
		typeof candidate.models === 'object'
	)
}

function readVersion(): string {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const pkg = require('../package.json') as { version: string }
	return pkg.version
}

/* istanbul ignore next -- entry point, exercised by the packed-tarball smoke test */
if (require.main === module) {
	runCli(process.argv.slice(2)).then(
		(code) => {
			process.exitCode = code
		},
		(err) => {
			console.error(err)
			process.exitCode = 1
		},
	)
}
