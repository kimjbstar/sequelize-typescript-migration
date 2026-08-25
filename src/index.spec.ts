import * as fs from 'fs'
import * as path from 'path'
import { Sequelize } from 'sequelize-typescript'
import { SequelizeTypescriptMigration } from './index'
import getTablesFromModels from './utils/getTablesFromModels'
import { Organization, User } from './fixtures/models'

/**
 * makeMigration talks to a database in four places (authenticate, createTable via
 * createMigrationTable, two SELECTs, and bulkDelete/bulkInsert). All four are stubbed
 * here, so the orchestration is testable without a server.
 */

const tmpRoot = path.join(__dirname, '..', '.tmp-test')

let outDir: string
let logSpy: jest.SpyInstance

beforeEach(() => {
	fs.mkdirSync(tmpRoot, { recursive: true })
	outDir = fs.mkdtempSync(path.join(tmpRoot, 'make-'))
	logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
	fs.rmSync(outDir, { recursive: true, force: true })
	jest.restoreAllMocks()
})

type Stub = {
	sequelize: Sequelize
	createdTables: string[]
	bulkInserted: unknown[]
	bulkDeleted: unknown[]
}

/** A validateOnly Sequelize with every database-touching method replaced. */
const stubSequelize = (
	storedState?: unknown,
	overrides: Partial<{ bulkInsert: () => Promise<unknown> }> = {},
): Stub => {
	const sequelize = new Sequelize({
		validateOnly: true,
		models: [Organization, User],
	})

	const createdTables: string[] = []
	const bulkInserted: unknown[] = []
	const bulkDeleted: unknown[] = []

	sequelize.authenticate = () => Promise.resolve()
	sequelize.getDialect = () => 'mysql'

	sequelize.query = ((sql: string) => {
		if (sql.includes('ORDER BY name DESC')) {
			return Promise.resolve(
				storedState ? [{ name: '00000001-prev' }] : [],
			)
		}
		return Promise.resolve(storedState ? [{ state: storedState }] : [])
	}) as unknown as Sequelize['query']

	sequelize.getQueryInterface = (() => ({
		// getLastMigrationState checks for the bookkeeping tables before querying them,
		// so the stub has to answer that too. Reporting them present keeps the stored
		// state path exercised.
		showAllTables: () =>
			Promise.resolve(['SequelizeMeta', 'SequelizeMetaMigrations']),
		createTable: (name: string) => {
			createdTables.push(name)
			return Promise.resolve()
		},
		bulkDelete: (table: string, where: unknown) => {
			bulkDeleted.push({ table, where })
			return Promise.resolve()
		},
		bulkInsert:
			overrides.bulkInsert ??
			((table: string, rows: unknown) => {
				bulkInserted.push({ table, rows })
				return Promise.resolve()
			}),
	})) as unknown as Sequelize['getQueryInterface']

	return { sequelize, createdTables, bulkInserted, bulkDeleted }
}

const makeMigration = SequelizeTypescriptMigration.makeMigration

/** Loads a generated migration the way sequelize-cli would. */
const loadGenerated = (filename: string) => {
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require(filename)
}

const currentTables = () => {
	const sequelize = new Sequelize({
		validateOnly: true,
		models: [Organization, User],
	})
	return getTablesFromModels(sequelize, sequelize.models)
}

const unchangedState = () => ({
	revision: 1,
	version: 1,
	tables: currentTables(),
})

describe('SequelizeTypescriptMigration.makeMigration', () => {
	describe('input validation', () => {
		it('outDir이 없으면 Error를 던진다', async () => {
			const { sequelize } = stubSequelize()

			await expect(
				makeMigration(sequelize, { outDir: path.join(outDir, 'nope') }),
			).rejects.toThrow(/not exists/)
		})

		it('던지는 값은 스택 트레이스를 가진 Error다', async () => {
			// It used to reject with a plain object, which carries no stack.
			const { sequelize } = stubSequelize()

			await expect(
				makeMigration(sequelize, { outDir: path.join(outDir, 'nope') }),
			).rejects.toBeInstanceOf(Error)
		})

		it('outDir이 없으면 데이터베이스에 접속조차 하지 않는다', async () => {
			const { sequelize } = stubSequelize()
			const authenticate = jest.fn(() => Promise.resolve())
			sequelize.authenticate = authenticate

			await expect(
				makeMigration(sequelize, { outDir: path.join(outDir, 'nope') }),
			).rejects.toBeDefined()
			expect(authenticate).not.toHaveBeenCalled()
		})
	})

	describe('first run against an empty database', () => {
		it('written 상태와 파일 경로, 리비전을 반환한다', async () => {
			const { sequelize } = stubSequelize()

			const result = await makeMigration(sequelize, {
				outDir,
				migrationName: 'initial',
			})

			expect(result).toEqual({
				status: 'written',
				filename: path.join(outDir, '00000001-initial.js'),
				revision: 1,
			})
		})

		it('마이그레이션 파일을 만든다', async () => {
			const { sequelize } = stubSequelize()

			await makeMigration(sequelize, { outDir, migrationName: 'initial' })

			expect(fs.readdirSync(outDir)).toEqual(['00000001-initial.js'])
		})

		it('생성된 파일이 로드 가능하다', async () => {
			const { sequelize } = stubSequelize()

			const result = await makeMigration(sequelize, {
				outDir,
				migrationName: 'initial',
			})

			expect(result.status).toBe('written')
			const { filename } = result as {
				status: 'written'
				filename: string
			}
			expect(() => loadGenerated(filename)).not.toThrow()
		})

		it('부기 테이블 두 개를 만든다', async () => {
			const { sequelize, createdTables } = stubSequelize()

			await makeMigration(sequelize, { outDir })

			expect(createdTables).toEqual([
				'SequelizeMeta',
				'SequelizeMetaMigrations',
			])
		})

		it('현재 상태를 SequelizeMetaMigrations에 저장한다', async () => {
			const { sequelize, bulkInserted } = stubSequelize()

			await makeMigration(sequelize, { outDir, migrationName: 'initial' })

			expect(bulkInserted).toHaveLength(1)
			const { table, rows } = bulkInserted[0] as {
				table: string
				rows: Array<{ revision: number; name: string; state: string }>
			}
			expect(table).toBe('SequelizeMetaMigrations')
			expect(rows[0]).toMatchObject({ revision: 1, name: 'initial' })
			expect(JSON.parse(rows[0].state)).toHaveProperty('tables.users')
		})

		it('저장 전에 같은 리비전 행을 지운다', async () => {
			const { sequelize, bulkDeleted } = stubSequelize()

			await makeMigration(sequelize, { outDir })

			expect(bulkDeleted).toEqual([
				{ table: 'SequelizeMetaMigrations', where: { revision: 1 } },
			])
		})
	})

	describe('incremental run against a stored state', () => {
		const storedStateWithoutUsers = () => ({
			revision: 1,
			version: 1,
			tables: {
				organizations: {
					tableName: 'organizations',
					schema: { id: { seqType: 'Sequelize.INTEGER' } },
					indexes: {},
				},
			},
		})

		it('리비전을 하나 올린다', async () => {
			const { sequelize } = stubSequelize(storedStateWithoutUsers())

			const result = await makeMigration(sequelize, {
				outDir,
				migrationName: 'second',
			})

			expect(result).toMatchObject({ status: 'written', revision: 2 })
			expect(fs.readdirSync(outDir)).toEqual(['00000002-second.js'])
		})

		it('저장된 상태와의 차이만 마이그레이션에 담는다', async () => {
			const { sequelize } = stubSequelize(storedStateWithoutUsers())

			await makeMigration(sequelize, { outDir, migrationName: 'second' })

			const contents = fs.readFileSync(
				path.join(outDir, '00000002-second.js'),
				'utf8',
			)
			expect(contents).toContain('createTable "users"')
			expect(contents).not.toContain('createTable "organizations"')
		})
	})

	describe('no changes', () => {
		it('no-changes 상태를 반환한다 (프로세스를 죽이지 않는다)', async () => {
			// It used to call process.exit(0) here -- a library terminating its host.
			const { sequelize } = stubSequelize(unchangedState())

			await expect(makeMigration(sequelize, { outDir })).resolves.toEqual(
				{
					status: 'no-changes',
				},
			)
		})

		it('파일을 만들지 않는다', async () => {
			const { sequelize } = stubSequelize(unchangedState())

			await makeMigration(sequelize, { outDir })

			expect(fs.readdirSync(outDir)).toEqual([])
		})

		it('상태를 다시 저장하지 않는다', async () => {
			const { sequelize, bulkInserted } = stubSequelize(unchangedState())

			await makeMigration(sequelize, { outDir })

			expect(bulkInserted).toEqual([])
		})

		it('No changes found를 출력한다', async () => {
			const { sequelize } = stubSequelize(unchangedState())

			await makeMigration(sequelize, { outDir })

			expect(logSpy).toHaveBeenCalledWith('No changes found')
		})
	})

	describe('preview mode', () => {
		it('생성될 up과 down 커맨드를 반환한다', async () => {
			const { sequelize } = stubSequelize()

			const result = await makeMigration(sequelize, {
				outDir,
				preview: true,
			})

			expect(result.status).toBe('preview')
			const preview = result as { up: string[]; down: string[] }
			expect(preview.up.length).toBeGreaterThan(0)
			expect(preview.up.join('\n')).toContain('createTable')
			expect(preview.down.join('\n')).toContain('dropTable')
		})

		it('파일을 만들지 않는다', async () => {
			const { sequelize } = stubSequelize()

			await makeMigration(sequelize, { outDir, preview: true })

			expect(fs.readdirSync(outDir)).toEqual([])
		})

		it('상태를 저장하지 않는다', async () => {
			const { sequelize, bulkInserted } = stubSequelize()

			await makeMigration(sequelize, { outDir, preview: true })

			expect(bulkInserted).toEqual([])
		})

		it('부기 테이블도 만들지 않는다 (읽기 전용)', async () => {
			// createMigrationTable used to run before the preview branch, so a "just show
			// me what would change" run still issued DDL.
			const { sequelize, createdTables } = stubSequelize()

			await makeMigration(sequelize, { outDir, preview: true })

			expect(createdTables).toEqual([])
		})

		it('up과 down을 모두 출력한다', async () => {
			const { sequelize } = stubSequelize()

			await makeMigration(sequelize, { outDir, preview: true })

			const printed = logSpy.mock.calls
				.map((c) => String(c[0]))
				.join('\n')
			expect(printed).toContain('Migration result:')
			expect(printed).toContain('Undo commands:')
		})
	})

	describe('state persistence failures surface', () => {
		// This used to be swallowed and reported as success. The migration file would be
		// on disk while the recorded state was not, so the next run diffed against a
		// stale snapshot and re-emitted changes that already existed.
		it('상태 저장이 실패하면 거부한다', async () => {
			const { sequelize } = stubSequelize(undefined, {
				bulkInsert: () => Promise.reject(new Error('write failed')),
			})

			await expect(makeMigration(sequelize, { outDir })).rejects.toThrow(
				'write failed',
			)
		})
	})
})
