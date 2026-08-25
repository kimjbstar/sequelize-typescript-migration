import * as fs from 'fs'
import * as path from 'path'
import { DataTypes, Model, Sequelize } from '@sequelize/core'
import {
	Attribute,
	Default,
	Index,
	NotNull,
	PrimaryKey,
	Table,
} from '@sequelize/core/decorators-legacy'
import { SqliteDialect } from '@sequelize/sqlite3'
import { SequelizeTypescriptMigration } from './index'

/**
 * Experimental Sequelize v7 support.
 *
 * v7 is still alpha upstream with no beta, and its APIs have changed between alphas
 * before. This suite is what makes the support claim honest rather than aspirational:
 * it runs the whole pipeline against a real v7 instance, with no v6 packages involved.
 *
 * What differs from v6, all of it absorbed by src/adapters/:
 *   - `sequelize.models` is an iterable view, not a plain object
 *   - `rawAttributes` throws; `getAttributes()` is the replacement
 *   - indexes moved from `options.indexes` to `getIndexes()`
 *   - `Sequelize.STRING` was removed in favour of `DataTypes.STRING`
 *   - `showAllTables` resolves to objects rather than strings
 *   - `bulkDelete` takes its where clause inside options
 */

const tmpRoot = path.join(__dirname, '..', '.tmp-test')

@Table({ tableName: 'v7_orgs', timestamps: false })
class Org extends Model {
	@PrimaryKey
	@Attribute(DataTypes.INTEGER)
	declare id: number

	@Attribute(DataTypes.STRING(50))
	declare name: string
}

@Table({
	tableName: 'v7_users',
	timestamps: false,
	indexes: [{ name: 'idx_v7_users_email', fields: ['email'], unique: true }],
})
class User extends Model {
	@PrimaryKey
	@Attribute(DataTypes.INTEGER)
	declare id: number

	@NotNull
	@Attribute(DataTypes.STRING(80))
	declare email: string

	@Default(false)
	@Attribute(DataTypes.BOOLEAN)
	declare isActive: boolean

	@Default(0)
	@Attribute(DataTypes.INTEGER)
	declare loginCount: number

	// The two types that used to be dropped silently.
	@Attribute(DataTypes.JSON)
	declare prefs: object

	@Attribute(DataTypes.DOUBLE)
	declare score: number

	@Index({ name: 'idx_v7_users_nickname' })
	@Attribute(DataTypes.STRING(30))
	declare nickname: string
}

let sequelize: Sequelize
let outDir: string

/**
 * One instance for the whole suite. Unlike v6, v7 refuses to register a model class with
 * a second Sequelize instance, so a per-test instance would fail on the second test.
 */
beforeAll(async () => {
	sequelize = new Sequelize({
		dialect: SqliteDialect,
		storage: ':memory:',
		models: [Org, User],
		// An in-memory database must not have its connection recycled underneath us.
		pool: { idle: Infinity, max: 1 },
	})
	await sequelize.authenticate()
})

afterAll(async () => {
	await sequelize.close()
})

/** Leaves the schema empty so each test starts from the same place. */
const tableNames = async (): Promise<string[]> => {
	const tables = await sequelize.queryInterface.showAllTables()
	return tables.map((table: unknown) =>
		typeof table === 'string'
			? table
			: (table as { tableName: string }).tableName,
	)
}

const dropAllTables = async () => {
	for (const name of await tableNames()) {
		await sequelize.queryInterface.dropTable(name)
	}
}

beforeEach(async () => {
	fs.mkdirSync(tmpRoot, { recursive: true })
	outDir = fs.mkdtempSync(path.join(tmpRoot, 'v7-'))
	jest.spyOn(console, 'log').mockImplementation(() => undefined)
	await dropAllTables()
})

afterEach(async () => {
	await dropAllTables()
	fs.rmSync(outDir, { recursive: true, force: true })
	jest.restoreAllMocks()
})

const makeMigration = (options: Record<string, unknown> = {}) =>
	SequelizeTypescriptMigration.makeMigration(
		sequelize as never,
		{ outDir, migrationName: 'v7', ...options } as never,
	)

const loadMigration = (filename: string) => {
	delete require.cache[require.resolve(filename)]
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require(filename)
}

const readGenerated = async () => {
	const result = await makeMigration()
	expect(result.status).toBe('written')
	const { filename } = result as { filename: string }
	return { filename, source: fs.readFileSync(filename, 'utf8') }
}

describe('Sequelize v7 (experimental)', () => {
	describe('reading v7 models', () => {
		it('iterable 모델 뷰에서 모든 모델을 읽는다', async () => {
			// Object.values on v7's ModelSetView returns [] rather than failing, so a
			// missing adapter here would look like "no models" instead of an error.
			const { source } = await readGenerated()

			expect(source).toContain('createTable "v7_orgs"')
			expect(source).toContain('createTable "v7_users"')
		})

		it('getIndexes()에서 인덱스를 읽는다', async () => {
			// v7 leaves options.indexes empty and moves the built list to getIndexes().
			const { source } = await readGenerated()

			expect(source).toContain('idx_v7_users_email')
			expect(source).toContain('idx_v7_users_nickname')
		})

		it('기본값을 보존한다', async () => {
			const { source } = await readGenerated()

			expect(source).toMatch(/"defaultValue": ?false/)
			expect(source).toMatch(/"defaultValue": ?0/)
		})

		it('JSON과 DOUBLE 컬럼을 빠뜨리지 않는다', async () => {
			const { source } = await readGenerated()

			expect(source).toContain('prefs')
			expect(source).toContain('score')
		})
	})

	describe('generating for the v7 runtime', () => {
		it('@sequelize/core에서 DataTypes를 가져온다', async () => {
			const { source } = await readGenerated()

			expect(source).toContain(
				"const { DataTypes } = require('@sequelize/core');",
			)
			expect(source).not.toContain("require('sequelize')")
		})

		it('타입을 DataTypes 접두사로 렌더링한다', async () => {
			// v7 removed the aliases: Sequelize.STRING now raises "use DataTypes.STRING".
			const { source } = await readGenerated()

			expect(source).toMatch(/DataTypes\.STRING\(80\)/)
			expect(source).not.toMatch(/[^@/]Sequelize\.[A-Z]/)
		})
	})

	describe('running the generated migration', () => {
		it('up을 실행하면 모델대로 테이블이 만들어진다', async () => {
			const { filename } = await readGenerated()
			const migration = loadMigration(filename)

			await migration.up(sequelize.queryInterface, { DataTypes })

			const described =
				await sequelize.queryInterface.describeTable('v7_users')
			expect(Object.keys(described).sort()).toEqual([
				'email',
				'id',
				'isActive',
				'loginCount',
				'nickname',
				'prefs',
				'score',
			])
		})

		it('기본값이 실제 컬럼 기본값이 된다', async () => {
			const { filename } = await readGenerated()

			await loadMigration(filename).up(sequelize.queryInterface, {
				DataTypes,
			})

			const described =
				await sequelize.queryInterface.describeTable('v7_users')
			expect(described.isActive.defaultValue).not.toBeNull()
			expect(described.loginCount.defaultValue).not.toBeNull()
		})

		it('down으로 되돌린다', async () => {
			const { filename } = await readGenerated()
			const migration = loadMigration(filename)

			await migration.up(sequelize.queryInterface, { DataTypes })
			await migration.down(sequelize.queryInterface, { DataTypes })

			const tables = (await sequelize.queryInterface.showAllTables()).map(
				(table: unknown) =>
					typeof table === 'string'
						? table
						: (table as { tableName: string }).tableName,
			)
			expect(tables).not.toContain('v7_users')
		})
	})

	describe('bookkeeping', () => {
		it('스냅샷을 기록하고 재실행하면 변경이 없다', async () => {
			// Exercises the v7 bulkDelete signature and the object-shaped showAllTables.
			const { filename } = await readGenerated()

			await loadMigration(filename).up(sequelize.queryInterface, {
				DataTypes,
			})
			await sequelize.queryInterface.bulkInsert('SequelizeMeta', [
				{ name: path.basename(filename) },
			])

			await expect(
				makeMigration({ migrationName: 'second' }),
			).resolves.toEqual({ status: 'no-changes' })
		})

		it('preview는 데이터베이스를 건드리지 않는다', async () => {
			await makeMigration({ preview: true })

			expect(await tableNames()).toEqual([])
		})
	})
})
