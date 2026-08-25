import * as fs from 'fs'
import * as path from 'path'
import * as sequelizeLib from 'sequelize'
import { QueryTypes } from 'sequelize'
import {
	Column,
	DataType,
	Model,
	PrimaryKey,
	Sequelize,
	Table,
} from 'sequelize-typescript'
import { SequelizeTypescriptMigration } from './index'

/**
 * Dialect-specific coverage: everything sqlite structurally cannot check.
 *
 * Above all this covers Postgres identifier folding, which is the single most reported
 * problem with this tool (upstream #3, #4, #10): unquoted `FROM SequelizeMeta` becomes
 * `from sequelizemeta` and the query fails with `relation "sequelizemeta" does not
 * exist`, making the tool unusable on Postgres.
 *
 * Servers come from test/docker-compose.yml. When one is not reachable its suite is
 * skipped rather than failed, so `npm run test:integration` still works with only sqlite.
 */

const tmpRoot = path.join(__dirname, '..', '.tmp-test')

const mysqlConfig = {
	dialect: 'mysql' as const,
	host: process.env.MYSQL_HOST ?? '127.0.0.1',
	port: Number(process.env.MYSQL_PORT ?? 33306),
	username: process.env.MYSQL_USER ?? 'root',
	password: process.env.MYSQL_PASSWORD ?? 'local_test_password',
	database: process.env.MYSQL_DATABASE ?? 'test_migration',
}

const postgresConfig = {
	dialect: 'postgres' as const,
	host: process.env.POSTGRES_HOST ?? '127.0.0.1',
	port: Number(process.env.POSTGRES_PORT ?? 55432),
	username: process.env.POSTGRES_USER ?? 'postgres',
	password: process.env.POSTGRES_PASSWORD ?? 'local_test_password',
	database: process.env.POSTGRES_DATABASE ?? 'test_migration',
}

/** How long to wait before deciding a server is not there. */
const PROBE_TIMEOUT_MS = 2000

/**
 * Probing has to fail fast. Sequelize's defaults retry and wait far longer than a jest
 * hook allows, which turns "no server running" into a timeout failure instead of a skip.
 */
const canConnect = async (config: Record<string, unknown>) => {
	const probe = new Sequelize({
		...config,
		logging: false,
		retry: { max: 0 },
		pool: { max: 1, acquire: PROBE_TIMEOUT_MS, idle: PROBE_TIMEOUT_MS },
		dialectOptions: {
			// mysql2 and pg spell the same option differently.
			connectTimeout: PROBE_TIMEOUT_MS,
			connectionTimeoutMillis: PROBE_TIMEOUT_MS,
		},
	} as never)

	try {
		await probe.authenticate()
		return true
	} catch {
		return false
	} finally {
		await probe.close().catch(() => undefined)
	}
}

/** Generous enough for the probe above to settle either way. */
const PROBE_HOOK_TIMEOUT_MS = 15000

/** Drops everything this suite creates, so each run starts from a clean schema. */
const dropAll = async (sequelize: Sequelize) => {
	const queryInterface = sequelize.getQueryInterface()
	const tables = await queryInterface.showAllTables()
	for (const table of tables) {
		const name = typeof table === 'string' ? table : String(table)
		await queryInterface
			.dropTable(name, { cascade: true })
			.catch(() => undefined)
	}
}

const loadMigration = (filename: string) => {
	delete require.cache[require.resolve(filename)]
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require(filename)
}

describe('dialect specific behaviour', () => {
	describe('postgres', () => {
		@Table({ tableName: 'pg_widgets', timestamps: false })
		class PgWidget extends Model {
			@PrimaryKey
			@Column(DataType.INTEGER)
			declare id: number

			@Column(DataType.STRING(80))
			declare label: string

			@Column(DataType.JSONB)
			declare settings: object

			@Column(DataType.ARRAY(DataType.STRING))
			declare tags: string[]

			@Column({ type: DataType.BOOLEAN, defaultValue: false })
			declare isActive: boolean
		}

		let sequelize: Sequelize
		let outDir: string
		let available = false

		beforeAll(async () => {
			available = await canConnect(postgresConfig)
		}, PROBE_HOOK_TIMEOUT_MS)

		beforeEach(async () => {
			if (!available) return
			fs.mkdirSync(tmpRoot, { recursive: true })
			outDir = fs.mkdtempSync(path.join(tmpRoot, 'pg-'))
			sequelize = new Sequelize({
				...postgresConfig,
				logging: false,
				models: [PgWidget],
			})
			await dropAll(sequelize)
			jest.spyOn(console, 'log').mockImplementation(() => undefined)
		})

		afterEach(async () => {
			if (!available) return
			await dropAll(sequelize)
			await sequelize.close()
			fs.rmSync(outDir, { recursive: true, force: true })
			jest.restoreAllMocks()
		})

		const runOrSkip = (name: string, body: () => Promise<void>) =>
			it(name, async () => {
				if (!available) {
					console.warn(`[skip] postgres unreachable: ${name}`)
					return
				}
				await body()
			})

		// The whole reason this suite exists.
		runOrSkip(
			'대소문자가 섞인 부기 테이블을 만들고 다시 읽는다',
			async () => {
				const result = await SequelizeTypescriptMigration.makeMigration(
					sequelize,
					{ outDir, migrationName: 'first' },
				)

				expect(result.status).toBe('written')

				const rows = await sequelize.query<{ revision: number }>(
					'SELECT revision FROM "SequelizeMetaMigrations"',
					{ type: QueryTypes.SELECT },
				)
				expect(rows).toEqual([{ revision: 1 }])
			},
		)

		runOrSkip('두 번째 실행이 저장된 스냅샷을 읽는다', async () => {
			const first = await SequelizeTypescriptMigration.makeMigration(
				sequelize,
				{ outDir, migrationName: 'first' },
			)
			const { filename } = first as { filename: string }

			await loadMigration(filename).up(
				sequelize.getQueryInterface(),
				sequelizeLib,
			)
			await sequelize
				.getQueryInterface()
				.bulkInsert('SequelizeMeta', [
					{ name: path.basename(filename) },
				])

			await expect(
				SequelizeTypescriptMigration.makeMigration(sequelize, {
					outDir,
					migrationName: 'second',
				}),
			).resolves.toEqual({ status: 'no-changes' })
		})

		runOrSkip('ARRAY와 JSONB 컬럼을 실제로 만든다', async () => {
			const result = await SequelizeTypescriptMigration.makeMigration(
				sequelize,
				{ outDir, migrationName: 'first' },
			)
			await loadMigration((result as { filename: string }).filename).up(
				sequelize.getQueryInterface(),
				sequelizeLib,
			)

			const described = await sequelize
				.getQueryInterface()
				.describeTable('pg_widgets')

			expect(Object.keys(described).sort()).toEqual([
				'id',
				'isActive',
				'label',
				'settings',
				'tags',
			])
			expect(described.tags.type).toMatch(/ARRAY|\[\]/)
			expect(described.settings.type).toMatch(/JSONB/i)
		})

		runOrSkip('생성된 마이그레이션을 down으로 되돌린다', async () => {
			const result = await SequelizeTypescriptMigration.makeMigration(
				sequelize,
				{ outDir, migrationName: 'first' },
			)
			const migration = loadMigration(
				(result as { filename: string }).filename,
			)

			await migration.up(sequelize.getQueryInterface(), sequelizeLib)
			await migration.down(sequelize.getQueryInterface(), sequelizeLib)

			const tables = (
				await sequelize.getQueryInterface().showAllTables()
			).map((t) => String(t))
			expect(tables).not.toContain('pg_widgets')
		})
	})

	describe('mysql', () => {
		@Table({ tableName: 'my_widgets', timestamps: false })
		class MyWidget extends Model {
			@PrimaryKey
			@Column(DataType.INTEGER)
			declare id: number

			@Column(DataType.STRING(80))
			declare label: string

			@Column(DataType.TEXT('tiny'))
			declare summary: string

			@Column(DataType.BLOB('long'))
			declare payload: Buffer

			@Column(DataType.ENUM('draft', 'live'))
			declare state: string

			@Column(DataType.JSON)
			declare metadata: object

			@Column({ type: DataType.BOOLEAN, defaultValue: false })
			declare isActive: boolean
		}

		let sequelize: Sequelize
		let outDir: string
		let available = false

		beforeAll(async () => {
			available = await canConnect(mysqlConfig)
		}, PROBE_HOOK_TIMEOUT_MS)

		beforeEach(async () => {
			if (!available) return
			fs.mkdirSync(tmpRoot, { recursive: true })
			outDir = fs.mkdtempSync(path.join(tmpRoot, 'my-'))
			sequelize = new Sequelize({
				...mysqlConfig,
				logging: false,
				models: [MyWidget],
			})
			await dropAll(sequelize)
			jest.spyOn(console, 'log').mockImplementation(() => undefined)
		})

		afterEach(async () => {
			if (!available) return
			await dropAll(sequelize)
			await sequelize.close()
			fs.rmSync(outDir, { recursive: true, force: true })
			jest.restoreAllMocks()
		})

		const runOrSkip = (name: string, body: () => Promise<void>) =>
			it(name, async () => {
				if (!available) {
					console.warn(`[skip] mysql unreachable: ${name}`)
					return
				}
				await body()
			})

		// TEXT('tiny') and BLOB('long') are where the length quoting bugs lived: an
		// unquoted keyword made the generated file throw ReferenceError on load.
		runOrSkip(
			'TEXT와 BLOB 길이 키워드가 실제 컬럼 타입이 된다',
			async () => {
				const result = await SequelizeTypescriptMigration.makeMigration(
					sequelize,
					{ outDir, migrationName: 'first' },
				)
				await loadMigration(
					(result as { filename: string }).filename,
				).up(sequelize.getQueryInterface(), sequelizeLib)

				const described = await sequelize
					.getQueryInterface()
					.describeTable('my_widgets')

				expect(described.summary.type).toMatch(/TINYTEXT/i)
				expect(described.payload.type).toMatch(/LONGBLOB/i)
			},
		)

		runOrSkip('ENUM과 JSON 컬럼을 실제로 만든다', async () => {
			const result = await SequelizeTypescriptMigration.makeMigration(
				sequelize,
				{ outDir, migrationName: 'first' },
			)
			await loadMigration((result as { filename: string }).filename).up(
				sequelize.getQueryInterface(),
				sequelizeLib,
			)

			const described = await sequelize
				.getQueryInterface()
				.describeTable('my_widgets')

			expect(described.state.type).toMatch(/ENUM/i)
			expect(described.metadata.type).toMatch(/JSON/i)
		})

		// MySQL hands the JSON column back already parsed, unlike sqlite. Both paths have
		// to end up with the same stored snapshot.
		runOrSkip(
			'저장된 스냅샷을 객체로 돌려받아도 재실행이 no-changes다',
			async () => {
				const first = await SequelizeTypescriptMigration.makeMigration(
					sequelize,
					{ outDir, migrationName: 'first' },
				)
				const { filename } = first as { filename: string }

				await loadMigration(filename).up(
					sequelize.getQueryInterface(),
					sequelizeLib,
				)
				await sequelize
					.getQueryInterface()
					.bulkInsert('SequelizeMeta', [
						{ name: path.basename(filename) },
					])

				await expect(
					SequelizeTypescriptMigration.makeMigration(sequelize, {
						outDir,
						migrationName: 'second',
					}),
				).resolves.toEqual({ status: 'no-changes' })
			},
		)

		runOrSkip('기본값이 실제 컬럼 기본값이 된다', async () => {
			const result = await SequelizeTypescriptMigration.makeMigration(
				sequelize,
				{ outDir, migrationName: 'first' },
			)
			await loadMigration((result as { filename: string }).filename).up(
				sequelize.getQueryInterface(),
				sequelizeLib,
			)

			const described = await sequelize
				.getQueryInterface()
				.describeTable('my_widgets')

			expect(described.isActive.defaultValue).not.toBeNull()
		})
	})
})
