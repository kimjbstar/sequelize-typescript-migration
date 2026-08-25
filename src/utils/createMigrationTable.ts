import type { QueryInterface } from 'sequelize'
import { Sequelize } from 'sequelize-typescript'
import { getDataTypes } from '../adapters/dialect'

/**
 * Creates the two bookkeeping tables if they are not already there.
 *
 * Data types come from the caller's own Sequelize rather than from an import, so this
 * works against either v6 or v7 without this package depending on either at runtime.
 */
export default async function createMigrationTable(sequelize: Sequelize) {
	const queryInterface: QueryInterface = sequelize.getQueryInterface()
	const DataTypes = getDataTypes(sequelize)

	await queryInterface.createTable('SequelizeMeta', {
		name: {
			type: DataTypes.STRING,
			allowNull: false,
			unique: true,
			primaryKey: true,
		},
	})

	await queryInterface.createTable('SequelizeMetaMigrations', {
		revision: {
			type: DataTypes.INTEGER,
			allowNull: false,
			unique: true,
			primaryKey: true,
		},
		name: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		state: {
			type: DataTypes.JSON,
			allowNull: false,
		},
	})
}
