import { Sequelize } from 'sequelize-typescript'
import createMigrationTable from './createMigrationTable'

type CreateTableCall = [string, Record<string, { type: unknown }>]

/**
 * Data types are read off the instance rather than imported, so the stub carries a
 * constructor with a DataTypes namespace -- exactly the shape both v6 and v7 expose.
 */
const stubSequelize = () => {
	const calls: CreateTableCall[] = []
	const DataTypes = { STRING: 'STRING', INTEGER: 'INTEGER', JSON: 'JSON' }
	const sequelize = {
		constructor: { DataTypes },
		getQueryInterface: () => ({
			createTable: (
				name: string,
				attributes: Record<string, { type: unknown }>,
			) => {
				calls.push([name, attributes])
				return Promise.resolve()
			},
		}),
	} as unknown as Sequelize

	return { sequelize, calls, DataTypes }
}

describe('createMigrationTable', () => {
	it('SequelizeMeta와 SequelizeMetaMigrations를 이 순서로 만든다', async () => {
		const { sequelize, calls } = stubSequelize()

		await createMigrationTable(sequelize)

		expect(calls.map(([name]) => name)).toEqual([
			'SequelizeMeta',
			'SequelizeMetaMigrations',
		])
	})

	it('SequelizeMeta는 name 컬럼 하나만 가진다', async () => {
		const { sequelize, calls } = stubSequelize()

		await createMigrationTable(sequelize)

		expect(Object.keys(calls[0][1])).toEqual(['name'])
		expect(calls[0][1].name).toMatchObject({
			allowNull: false,
			unique: true,
			primaryKey: true,
		})
	})

	it('인스턴스의 DataTypes를 쓴다 (import하지 않는다)', async () => {
		// This is what lets one build work against both v6 and v7: the package never
		// requires sequelize itself, it uses whichever one the caller handed it.
		const { sequelize, calls, DataTypes } = stubSequelize()

		await createMigrationTable(sequelize)

		expect(calls[0][1].name.type).toBe(DataTypes.STRING)
		expect(calls[1][1].state.type).toBe(DataTypes.JSON)
	})

	it('DataTypes를 읽을 수 없으면 명확한 예외를 던진다', async () => {
		const notSequelize = {
			constructor: {},
			getQueryInterface: () => ({ createTable: () => Promise.resolve() }),
		} as unknown as Sequelize

		await expect(createMigrationTable(notSequelize)).rejects.toThrow(
			/not a Sequelize instance/,
		)
	})

	it('SequelizeMetaMigrations는 revision, name, state를 가진다', async () => {
		const { sequelize, calls } = stubSequelize()

		await createMigrationTable(sequelize)

		expect(Object.keys(calls[1][1])).toEqual(['revision', 'name', 'state'])
	})

	it('revision을 기본키로 삼는다', async () => {
		const { sequelize, calls } = stubSequelize()

		await createMigrationTable(sequelize)

		expect(calls[1][1].revision).toMatchObject({
			allowNull: false,
			unique: true,
			primaryKey: true,
		})
	})

	describe('known behaviour: unconditional writes', () => {
		// createTable relies on the dialect's implicit IF NOT EXISTS, so calling it on every
		// run is harmless -- but makeMigration calls this before checking `preview`, which
		// means a "preview only" run still writes DDL to the database.
		it('이미 존재하는지 확인하지 않고 매번 createTable을 호출한다', async () => {
			const { sequelize, calls } = stubSequelize()

			await createMigrationTable(sequelize)
			await createMigrationTable(sequelize)

			expect(calls).toHaveLength(4)
		})
	})
})
