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
 * End-to-end against a real database: models -> makeMigration -> run the generated file
 * through queryInterface -> inspect the resulting schema -> run down() and check it is
 * gone again.
 *
 * sqlite in-memory keeps this dependency-free and fast. It cannot cover dialect-specific
 * rendering (MySQL's ZEROFILL, Postgres arrays and identifier folding) -- those need the
 * matching server and live in the CI integration job.
 */

const tmpRoot = path.join(__dirname, '..', '.tmp-test')

@Table({ tableName: 'authors', timestamps: false })
class Author extends Model {
	@PrimaryKey
	@Column(DataType.INTEGER)
	declare id: number

	@Column(DataType.STRING(100))
	declare name: string
}

@Table({ tableName: 'books', timestamps: false })
class Book extends Model {
	@PrimaryKey
	@Column(DataType.INTEGER)
	declare id: number

	@Column(DataType.STRING(200))
	declare title: string

	@Column({ type: DataType.BOOLEAN, defaultValue: false })
	declare isPublished: boolean

	@Column({ type: DataType.INTEGER, defaultValue: 0 })
	declare printCount: number

	@Column(DataType.JSON)
	declare metadata: object
}

let outDir: string
let sequelize: Sequelize
let logSpy: jest.SpyInstance

beforeEach(async () => {
	fs.mkdirSync(tmpRoot, { recursive: true })
	outDir = fs.mkdtempSync(path.join(tmpRoot, 'e2e-'))
	logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)

	sequelize = new Sequelize({
		dialect: 'sqlite',
		storage: ':memory:',
		logging: false,
		models: [Author, Book],
	})
	await sequelize.authenticate()
})

/**
 * Adds a column to the model after the first migration was generated, so the differ has
 * something to find on the second run. Reverted in afterEach.
 */
const addSubtitleColumn = () => {
	// `refreshAttributes` exists at runtime but is not in v6's published types.
	const model = Book as unknown as {
		rawAttributes: Record<string, unknown>
		refreshAttributes(): void
	}
	model.rawAttributes.subtitle = {
		type: DataType.STRING(200),
		fieldName: 'subtitle',
	}
	model.refreshAttributes()
}

const removeSubtitleColumn = () => {
	const model = Book as unknown as {
		rawAttributes: Record<string, unknown>
		refreshAttributes(): void
	}
	delete model.rawAttributes.subtitle
	model.refreshAttributes()
}

afterEach(async () => {
	removeSubtitleColumn()
	await sequelize.close()
	fs.rmSync(outDir, { recursive: true, force: true })
	jest.restoreAllMocks()
})

const makeMigration = (options: Record<string, unknown> = {}) =>
	SequelizeTypescriptMigration.makeMigration(sequelize, {
		outDir,
		migrationName: 'initial',
		...options,
	})

/** Loads the generated migration the way sequelize-cli would. */
const loadMigration = (filename: string) => {
	delete require.cache[require.resolve(filename)]
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require(filename)
}

const runUp = async (filename: string) => {
	await loadMigration(filename).up(
		sequelize.getQueryInterface(),
		sequelizeLib,
	)
}

const runDown = async (filename: string) => {
	await loadMigration(filename).down(
		sequelize.getQueryInterface(),
		sequelizeLib,
	)
}

/**
 * What `npx sequelize db:migrate` does: run up() and then record the filename in
 * SequelizeMeta. That record is how makeMigration finds the revision to diff against on
 * the next run, so a test that only calls up() would never see the stored snapshot.
 */
const applyMigration = async (filename: string) => {
	await runUp(filename)
	await sequelize
		.getQueryInterface()
		.bulkInsert('SequelizeMeta', [{ name: path.basename(filename) }])
}

const tableNames = async () => {
	const rows = await sequelize.query<{ name: string }>(
		"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
		{ type: QueryTypes.SELECT },
	)
	return rows
		.map((row) => row.name)
		.filter((name) => !name.startsWith('sqlite_'))
}

describe('end to end against sqlite', () => {
	describe('initial migration', () => {
		it('생성된 마이그레이션을 실행하면 모델대로 테이블이 만들어진다', async () => {
			const result = await makeMigration()
			expect(result.status).toBe('written')

			await runUp((result as { filename: string }).filename)

			expect(await tableNames()).toEqual(
				expect.arrayContaining(['authors', 'books']),
			)
		})

		it('컬럼 타입과 제약이 실제 스키마에 반영된다', async () => {
			const result = await makeMigration()
			await runUp((result as { filename: string }).filename)

			const described = await sequelize
				.getQueryInterface()
				.describeTable('books')

			expect(Object.keys(described).sort()).toEqual([
				'id',
				'isPublished',
				'metadata',
				'printCount',
				'title',
			])
			expect(described.id.primaryKey).toBe(true)
		})

		it('@Default(false)와 @Default(0)이 실제 컬럼 기본값이 된다', async () => {
			// The bug this guards: defaults used to be computed and then discarded, so the
			// generated table had no defaults at all.
			const result = await makeMigration()
			await runUp((result as { filename: string }).filename)

			const described = await sequelize
				.getQueryInterface()
				.describeTable('books')

			expect(described.isPublished.defaultValue).not.toBeNull()
			expect(described.printCount.defaultValue).not.toBeNull()
		})

		it('JSON 컬럼이 실제로 만들어진다', async () => {
			// DataTypes.JSON is `class JSONTYPE`, which the type reverser used to miss --
			// the column silently vanished from the migration.
			const result = await makeMigration()
			await runUp((result as { filename: string }).filename)

			const described = await sequelize
				.getQueryInterface()
				.describeTable('books')

			expect(described).toHaveProperty('metadata')
		})

		it('부기 테이블에 현재 스냅샷을 기록한다', async () => {
			await makeMigration()

			const rows = await sequelize.query<{
				revision: number
				state: string
			}>('SELECT revision, state FROM SequelizeMetaMigrations', {
				type: QueryTypes.SELECT,
			})

			expect(rows).toHaveLength(1)
			expect(rows[0].revision).toBe(1)
			expect(JSON.parse(rows[0].state)).toHaveProperty('tables.books')
		})
	})

	describe('down migration', () => {
		// The README used to admit that undo "may not work". This is the check.
		it('down을 실행하면 만든 테이블이 사라진다', async () => {
			const result = await makeMigration()
			const { filename } = result as { filename: string }

			await runUp(filename)
			expect(await tableNames()).toEqual(
				expect.arrayContaining(['authors', 'books']),
			)

			await runDown(filename)

			const remaining = await tableNames()
			expect(remaining).not.toContain('authors')
			expect(remaining).not.toContain('books')
		})

		it('up과 down을 반복해도 같은 결과가 나온다', async () => {
			const result = await makeMigration()
			const { filename } = result as { filename: string }

			await runUp(filename)
			await runDown(filename)
			await runUp(filename)

			expect(await tableNames()).toEqual(
				expect.arrayContaining(['authors', 'books']),
			)
		})
	})

	describe('incremental migration', () => {
		it('적용 후 다시 실행하면 변경이 없다고 보고한다', async () => {
			const first = await makeMigration()
			await applyMigration((first as { filename: string }).filename)

			await expect(
				makeMigration({ migrationName: 'second' }),
			).resolves.toEqual({ status: 'no-changes' })
		})

		it('변경이 없으면 파일을 만들지 않는다', async () => {
			const first = await makeMigration()
			await applyMigration((first as { filename: string }).filename)
			const before = fs.readdirSync(outDir)

			await makeMigration({ migrationName: 'second' })

			expect(fs.readdirSync(outDir)).toEqual(before)
		})

		it('모델이 바뀌면 그 차이만 담은 다음 리비전을 만든다', async () => {
			const first = await makeMigration()
			await applyMigration((first as { filename: string }).filename)

			addSubtitleColumn()
			const second = await makeMigration({ migrationName: 'second' })

			expect(second).toMatchObject({ status: 'written', revision: 2 })
			const contents = fs.readFileSync(
				(second as { filename: string }).filename,
				'utf8',
			)
			expect(contents).toContain('addColumn')
			expect(contents).toContain('subtitle')
			expect(contents).not.toContain('createTable')
		})

		it('추가된 컬럼을 실제로 데이터베이스에 반영한다', async () => {
			const first = await makeMigration()
			await applyMigration((first as { filename: string }).filename)

			addSubtitleColumn()
			const second = await makeMigration({ migrationName: 'second' })
			await runUp((second as { filename: string }).filename)

			expect(
				await sequelize.getQueryInterface().describeTable('books'),
			).toHaveProperty('subtitle')
		})
	})

	describe('preview mode', () => {
		it('데이터베이스를 건드리지 않는다', async () => {
			await makeMigration({ preview: true })

			// Not even the bookkeeping tables: a preview is read-only.
			expect(await tableNames()).toEqual([])
		})

		it('실행될 커맨드를 반환한다', async () => {
			const result = await makeMigration({ preview: true })

			expect(result.status).toBe('preview')
			expect((result as { up: string[] }).up.join('\n')).toContain(
				'createTable',
			)
		})
	})

	describe('generated file quality', () => {
		it('로그 없이도 파일이 유효한 자바스크립트다', async () => {
			const result = await makeMigration()
			const { filename } = result as { filename: string }

			expect(() => loadMigration(filename)).not.toThrow()
			expect(logSpy).toHaveBeenCalled()
		})

		it('알 수 없는 커맨드를 만나면 거부한다', async () => {
			const result = await makeMigration()
			const loaded = loadMigration(
				(result as { filename: string }).filename,
			)

			await expect(loaded.up({}, {})).rejects.toThrow(
				/unknown queryInterface method/,
			)
		})
	})
})
