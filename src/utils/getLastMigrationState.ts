import { QueryTypes } from 'sequelize'
import { Sequelize } from 'sequelize-typescript'
import { getDialect, quoteTableName } from '../adapters/dialect'

const META_TABLE = 'SequelizeMeta'
const STATE_TABLE = 'SequelizeMetaMigrations'

/**
 * The name the widely used forks of this package (`-lts`, `@techntools/...`) give the
 * same table. Reading it lets someone switch back without their entire schema being
 * re-emitted as new -- a mismatch here looks exactly like "nothing was ever migrated".
 */
const FORK_STATE_TABLE = 'SequelizeMigrationsMeta'

/** Revision used when nothing has ever been migrated, so the state lookup finds nothing. */
const NO_REVISION = -1

/**
 * Returns the schema snapshot recorded alongside the most recently applied migration,
 * or undefined when there is none.
 */
export default async function getLastMigrationState(sequelize: Sequelize) {
	// No bookkeeping table means nothing has ever been migrated. Checking rather than
	// letting the SELECT fail matters for preview runs, which deliberately skip creating
	// these tables so that "show me what would change" stays read-only.
	const existing = await listTables(sequelize)

	if (!includesTable(existing, META_TABLE)) {
		return undefined
	}

	const stateTableName = includesTable(existing, STATE_TABLE)
		? STATE_TABLE
		: includesTable(existing, FORK_STATE_TABLE)
			? FORK_STATE_TABLE
			: undefined

	if (!stateTableName) {
		return undefined
	}

	const dialect = getDialect(sequelize)
	const metaTable = quoteTableName(dialect, META_TABLE)
	const stateTable = quoteTableName(dialect, stateTableName)

	const [lastExecutedMigration] = await sequelize.query<{ name: string }>(
		`SELECT name FROM ${metaTable} ORDER BY name DESC LIMIT 1`,
		{ type: QueryTypes.SELECT },
	)

	const lastRevision = lastExecutedMigration
		? parseRevision(lastExecutedMigration.name)
		: NO_REVISION

	const [lastMigration] = await sequelize.query<{ state: unknown }>(
		`SELECT state FROM ${stateTable} WHERE revision = :revision`,
		{ type: QueryTypes.SELECT, replacements: { revision: lastRevision } },
	)

	if (!lastMigration) {
		return undefined
	}

	return parseState(lastMigration.state)
}

/**
 * The state column is declared as JSON, but only some dialects hand it back parsed.
 * MySQL does; SQLite has no JSON type and returns the raw string, and Postgres depends
 * on the column type it ended up with. Reading the string as an object silently yields
 * undefined for every field, which makes the tool believe nothing was ever migrated and
 * re-emit the entire schema on every run.
 */
function parseState(state: unknown): unknown {
	if (typeof state !== 'string') {
		return state
	}

	try {
		return JSON.parse(state)
	} catch {
		// A snapshot we cannot read is worse than none: continuing would diff against
		// garbage and generate a migration that drops everything.
		throw new Error(
			'Stored migration state is not valid JSON. The SequelizeMetaMigrations table ' +
				'may have been modified outside this tool.',
		)
	}
}

/**
 * Uses showAllTables rather than catching the query error, because every dialect words
 * "missing table" differently and swallowing errors by message would also hide genuine
 * connection and permission failures.
 */
async function listTables(sequelize: Sequelize): Promise<string[]> {
	const tables = await sequelize.getQueryInterface().showAllTables()
	return tables.map((table) =>
		typeof table === 'string' ? table : String(table),
	)
}

/** Case-insensitive: Postgres lowercases anything that was created unquoted. */
function includesTable(tables: string[], name: string): boolean {
	return tables.some((table) => table.toLowerCase() === name.toLowerCase())
}

/**
 * Migration filenames are "<zero-padded revision>-<name>.js", so the revision is the
 * leading segment. Parsed to a number because the column it is compared against is one.
 */
function parseRevision(migrationName: string): number {
	const parsed = Number.parseInt(migrationName.split('-')[0], 10)
	return Number.isNaN(parsed) ? NO_REVISION : parsed
}
