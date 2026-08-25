/* eslint-disable @typescript-eslint/no-explicit-any -- DataTypes is a namespace of
 * constructors whose shape differs between v6 and v7; callers narrow at the use site. */
import type { Sequelize } from 'sequelize-typescript'

/**
 * Quotes a table identifier for the given dialect.
 *
 * Without this, raw SQL such as `FROM SequelizeMeta` is folded to lowercase by Postgres
 * and fails with `relation "sequelizemeta" does not exist` -- the most frequently
 * reported problem with this tool (upstream #3, #4, #10).
 */
export function quoteTableName(dialect: string, tableName: string): string {
	if (dialect === 'postgres') {
		return `"${tableName}"`
	}
	if (dialect === 'mssql') {
		return `[${tableName}]`
	}
	if (dialect === 'mysql' || dialect === 'mariadb') {
		return `\`${tableName}\``
	}
	return tableName
}

export function getDialect(sequelize: Sequelize): string {
	const dialect = sequelize.getDialect()

	// v7 splits dialects into their own packages and reports the package's name, so
	// sqlite comes back as "sqlite3". Normalising keeps quoteTableName's table small.
	return dialect === 'sqlite3' ? 'sqlite' : dialect
}

/**
 * Names of every table in the database.
 *
 * v6's showAllTables resolves to `string[]`; v7 changed it to `TableNameWithSchema[]`
 * and deprecated it in favour of `listTables`. Stringifying the v7 shape would yield
 * "[object Object]" and quietly break every lookup built on it.
 */
export async function listTableNames(sequelize: Sequelize): Promise<string[]> {
	const queryInterface = sequelize.getQueryInterface() as unknown as {
		showAllTables: () => Promise<Array<string | { tableName: string }>>
	}

	const tables = await queryInterface.showAllTables()

	return tables.map((table) =>
		typeof table === 'string' ? table : table.tableName,
	)
}

/**
 * The DataTypes namespace belonging to the caller's Sequelize.
 *
 * Taken from the instance rather than imported, so this package needs no runtime
 * dependency on either `sequelize` or `@sequelize/core` and works with whichever one the
 * consumer installed. Both versions expose it as a static on the class.
 */
export function getDataTypes(sequelize: Sequelize): Record<string, any> {
	const constructor = (sequelize as unknown as { constructor: unknown })
		.constructor as { DataTypes?: Record<string, any> }

	if (!constructor?.DataTypes) {
		throw new Error(
			'Could not read DataTypes from the Sequelize instance. This usually means the ' +
				'object passed to makeMigration is not a Sequelize instance.',
		)
	}

	return constructor.DataTypes
}
