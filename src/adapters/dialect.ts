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
	return sequelize.getDialect()
}
