import { QueryTypes } from 'sequelize'
import { Sequelize } from 'sequelize-typescript'
import { getDialect, quoteTableName } from '../adapters/dialect'

const META_TABLE = 'SequelizeMeta'
const STATE_TABLE = 'SequelizeMetaMigrations'

/** Revision used when nothing has ever been migrated, so the state lookup finds nothing. */
const NO_REVISION = -1

/**
 * Returns the schema snapshot recorded alongside the most recently applied migration,
 * or undefined when there is none.
 */
export default async function getLastMigrationState(sequelize: Sequelize) {
	const dialect = getDialect(sequelize)
	const metaTable = quoteTableName(dialect, META_TABLE)
	const stateTable = quoteTableName(dialect, STATE_TABLE)

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

	return lastMigration ? lastMigration.state : undefined
}

/**
 * Migration filenames are "<zero-padded revision>-<name>.js", so the revision is the
 * leading segment. Parsed to a number because the column it is compared against is one.
 */
function parseRevision(migrationName: string): number {
	const parsed = Number.parseInt(migrationName.split('-')[0], 10)
	return Number.isNaN(parsed) ? NO_REVISION : parsed
}
