import * as fs from 'fs'
import * as path from 'path'
import writeMigration from './writeMigration'
import getMigration from './getMigration'
import type { IAction } from './getDiffActionsFromTables'
import type { IColumnSnapshot } from '../constants'

/**
 * The value of this file is that it does not stop at string matching: it writes the
 * migration to disk and then `require`s it, which is exactly what sequelize-cli does.
 * Anything the generator emits that is not valid, resolvable JavaScript fails here.
 */

// Deliberately inside the project tree, not os.tmpdir(): the generated migration starts
// with `require('sequelize')`, which only resolves from a directory that can walk up to
// this repo's node_modules.
const tmpRoot = path.join(__dirname, '..', '..', '.tmp-test')

let outDir: string

beforeEach(() => {
	fs.mkdirSync(tmpRoot, { recursive: true })
	outDir = fs.mkdtempSync(path.join(tmpRoot, 'write-'))
})

afterEach(() => {
	fs.rmSync(outDir, { recursive: true, force: true })
})

const migrationFor = (actions: IAction[]) => getMigration(actions)

const write = (actions: IAction[], options: Record<string, unknown> = {}) =>
	writeMigration(1, migrationFor(actions), { outDir, ...options })

/** Loads the generated file the way sequelize-cli would. */
const loadGenerated = (filename: string) => {
	delete require.cache[require.resolve(filename)]
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	return require(filename)
}

const createTable = (
	tableName: string,
	attributes: Record<string, Partial<IColumnSnapshot>>,
): IAction => ({
	actionType: 'createTable',
	tableName,
	attributes,
	options: {},
	depends: [],
})

const simpleTable = createTable('users', {
	id: { seqType: 'Sequelize.INTEGER', primaryKey: true, autoIncrement: true },
	name: { seqType: 'Sequelize.STRING', allowNull: false },
})

describe('writeMigration', () => {
	describe('file naming', () => {
		it('리비전 번호를 8자리로 채운 파일명을 만든다', async () => {
			const { filename, revisionNumber } = await write([simpleTable])

			expect(revisionNumber).toBe('00000001')
			expect(path.basename(filename)).toBe('00000001-noname.js')
		})

		it('migrationName의 공백을 밑줄로 바꿔 파일명에 붙인다', async () => {
			const { filename } = await write([simpleTable], {
				migrationName: 'create users',
			})

			expect(path.basename(filename)).toBe('00000001-create_users.js')
		})

		it('큰 리비전 번호도 8자리 규칙을 유지한다', async () => {
			const { revisionNumber } = await writeMigration(
				123,
				migrationFor([simpleTable]),
				{ outDir },
			)

			expect(revisionNumber).toBe('00000123')
		})

		it('지정한 outDir에 파일을 만든다', async () => {
			const { filename } = await write([simpleTable])

			expect(path.dirname(filename)).toBe(outDir)
			expect(fs.existsSync(filename)).toBe(true)
		})
	})

	describe('generated file is loadable', () => {
		it('생성된 파일이 up과 down 함수를 export한다', async () => {
			const { filename } = await write([simpleTable])
			const loaded = loadGenerated(filename)

			expect(typeof loaded.up).toBe('function')
			expect(typeof loaded.down).toBe('function')
		})

		it('생성된 파일이 info 메타데이터를 담는다', async () => {
			const { filename, info } = await write([simpleTable], {
				migrationName: 'init',
				comment: 'first migration',
			})
			const loaded = loadGenerated(filename)

			expect(loaded.info).toMatchObject({
				revision: 1,
				name: 'init',
				comment: 'first migration',
			})
			expect(info.name).toBe('init')
		})

		it('up을 실행하면 각 커맨드를 queryInterface에 순서대로 넘긴다', async () => {
			const { filename } = await write([
				simpleTable,
				{
					actionType: 'dropTable' as const,
					tableName: 'legacy',
					depends: [],
				},
			])
			const loaded = loadGenerated(filename)

			const calls: string[] = []
			const queryInterface = {
				createTable: (...args: unknown[]) => {
					calls.push(`createTable:${args[0]}`)
					return Promise.resolve()
				},
				dropTable: (...args: unknown[]) => {
					calls.push(`dropTable:${args[0]}`)
					return Promise.resolve()
				},
			}

			await loaded.up(queryInterface, {})

			expect(calls).toEqual(['createTable:users', 'dropTable:legacy'])
		})

		it('커맨드가 없으면 up이 아무것도 호출하지 않고 끝난다', async () => {
			const { filename } = await write([])
			const loaded = loadGenerated(filename)

			await expect(loaded.up({}, {})).resolves.toBeUndefined()
		})

		it('queryInterface가 거부하면 up도 거부한다', async () => {
			const { filename } = await write([simpleTable])
			const loaded = loadGenerated(filename)

			await expect(
				loaded.up(
					{ createTable: () => Promise.reject(new Error('boom')) },
					{},
				),
			).rejects.toThrow('boom')
		})
	})

	describe('generated runner robustness', () => {
		// The old recursive-`next()` runner had two holes the async/await loop closes.

		it('알 수 없는 queryInterface 메서드를 만나면 거부한다', async () => {
			// Previously this threw synchronously inside the promise executor's `next()`,
			// where nothing was listening -- the returned promise simply never settled.
			const { filename } = await write([simpleTable])
			const loaded = loadGenerated(filename)

			await expect(loaded.up({}, {})).rejects.toThrow(
				/unknown queryInterface method: createTable/,
			)
		})

		it('up을 두 번 호출해도 매번 처음부터 실행한다', async () => {
			// The old module kept a shared `pos: 0` field and advanced it, so a second call
			// resumed from wherever the first stopped.
			const { filename } = await write([
				simpleTable,
				{
					actionType: 'dropTable' as const,
					tableName: 'legacy',
					depends: [],
				},
			])
			const loaded = loadGenerated(filename)

			const calls: string[] = []
			const queryInterface = {
				createTable: () => {
					calls.push('createTable')
					return Promise.resolve()
				},
				dropTable: () => {
					calls.push('dropTable')
					return Promise.resolve()
				},
			}

			await loaded.up(queryInterface, {})
			await loaded.up(queryInterface, {})

			expect(calls).toEqual([
				'createTable',
				'dropTable',
				'createTable',
				'dropTable',
			])
		})

		it('첫 커맨드가 실패하면 나머지를 실행하지 않는다', async () => {
			const { filename } = await write([
				simpleTable,
				{
					actionType: 'dropTable' as const,
					tableName: 'legacy',
					depends: [],
				},
			])
			const loaded = loadGenerated(filename)

			const dropTable = jest.fn(() => Promise.resolve())

			await expect(
				loaded.up(
					{
						createTable: () => Promise.reject(new Error('boom')),
						dropTable,
					},
					{},
				),
			).rejects.toThrow('boom')
			expect(dropTable).not.toHaveBeenCalled()
		})

		it('down은 rollbackCommands를 실행한다', async () => {
			const migration = migrationFor([simpleTable])
			migration.commandsDown = ['{ fn: "dropTable", params: ["users"] }']
			const { filename } = await writeMigration(1, migration, { outDir })
			const loaded = loadGenerated(filename)

			const calls: string[] = []
			await loaded.down(
				{
					dropTable: (name: string) => {
						calls.push(name)
						return Promise.resolve()
					},
				},
				{},
			)

			expect(calls).toEqual(['users'])
		})

		it('생성된 파일에 var를 쓰지 않는다', () => {
			return write([simpleTable]).then(({ filename }) => {
				expect(fs.readFileSync(filename, 'utf8')).not.toMatch(/\bvar\s/)
			})
		})
	})

	describe('data types survive the round trip', () => {
		// Each of these lands in the file as a bare expression. If the generator quotes it
		// wrong, `require` throws right here rather than at migration time in production.
		it.each([
			['STRING', 'Sequelize.STRING'],
			['INTEGER', 'Sequelize.INTEGER'],
			['STRING(255)', 'Sequelize.STRING(255)'],
			['DECIMAL(10,2)', 'Sequelize.DECIMAL(10,2)'],
			["ENUM('a', 'b')", "Sequelize.ENUM('a', 'b')"],
			['ARRAY(STRING)', 'Sequelize.ARRAY(Sequelize.STRING)'],
			['RANGE(INTEGER)', 'Sequelize.RANGE(Sequelize.INTEGER)'],
			["TEXT(('tiny'))", "Sequelize.TEXT(('tiny'))"],
			['INTEGER.UNSIGNED', 'Sequelize.INTEGER.UNSIGNED'],
		])(
			'%s 컬럼을 담은 파일을 문제없이 로드한다',
			async (_label, seqType) => {
				const { filename } = await write([
					createTable('t', { c: { seqType } }),
				])

				expect(() => loadGenerated(filename)).not.toThrow()
			},
		)

		it('internal 기본값(Sequelize.NOW)도 실행 가능한 코드로 남는다', async () => {
			const { filename } = await write([
				createTable('t', {
					c: {
						seqType: 'Sequelize.DATE',
						defaultValue: {
							internal: true,
							value: 'Sequelize.NOW',
						},
					},
				}),
			])

			expect(() => loadGenerated(filename)).not.toThrow()
		})
	})

	describe('known-broken output: BLOB length is never quoted', () => {
		// BUG: reverseSequelizeColType emits `Sequelize.BLOB((long))` -- a bare identifier.
		// The generated module throws on load, so a single BLOB column makes the whole
		// migration unrunnable. This should start failing (in the good way) once the
		// quoting is fixed.
		it('BLOB 컬럼이 있으면 생성된 파일이 ReferenceError로 로드에 실패한다', async () => {
			const { filename } = await write([
				createTable('t', {
					data: { seqType: 'Sequelize.BLOB((long))' },
				}),
			])

			expect(() => loadGenerated(filename)).toThrow(ReferenceError)
			expect(() => loadGenerated(filename)).toThrow(/long is not defined/)
		})
	})

	describe('same-revision files are replaced', () => {
		// Regression: filenames are zero-padded ("00000001-name.js") while the deletion
		// check compared against the unpadded revision, so nothing was ever removed and
		// re-running makeMigration left several files claiming the same revision.
		it('같은 리비전으로 다시 쓰면 이전 파일을 대체한다', async () => {
			await write([simpleTable], { migrationName: 'first' })
			await write([simpleTable], { migrationName: 'second' })

			expect(fs.readdirSync(outDir)).toEqual(['00000001-second.js'])
		})

		it('keepFiles를 켜면 이전 파일을 남긴다', async () => {
			await write([simpleTable], { migrationName: 'first' })
			await write([simpleTable], {
				migrationName: 'second',
				keepFiles: true,
			})

			expect(fs.readdirSync(outDir).sort()).toEqual([
				'00000001-first.js',
				'00000001-second.js',
			])
		})

		it('다른 리비전 파일은 건드리지 않는다', async () => {
			await writeMigration(1, migrationFor([simpleTable]), {
				outDir,
				migrationName: 'first',
			})
			await writeMigration(2, migrationFor([simpleTable]), {
				outDir,
				migrationName: 'second',
			})

			expect(fs.readdirSync(outDir).sort()).toEqual([
				'00000001-first.js',
				'00000002-second.js',
			])
		})
	})

	describe('actions summary', () => {
		it('액션 요약을 파일 상단 주석에 남긴다', async () => {
			const { filename } = await write([simpleTable])
			const contents = fs.readFileSync(filename, 'utf8')

			expect(contents).toContain('Actions summary')
			expect(contents).toContain('createTable "users"')
		})
	})
})
