import * as fs from 'fs'
import * as path from 'path'
import { Sequelize } from 'sequelize-typescript'
import getTablesFromModels from './utils/getTablesFromModels'
import getDiffActionsFromTables from './utils/getDiffActionsFromTables'
import getMigration from './utils/getMigration'
import writeMigration from './utils/writeMigration'
import type { ITables } from './constants'
import { AuditEntry, Organization, User } from './fixtures/models'

/**
 * End-to-end golden test: models -> table snapshot -> diff -> commands -> migration file.
 *
 * This is the safety net the rest of the modernization leans on. It covers the whole
 * pipeline except the database round trip, and because the tool's output *is* a text
 * file, a snapshot is the natural shape for it.
 *
 * When a snapshot here changes, read the diff. Every line of it is a change to what
 * users' migrations will contain.
 */

const tmpRoot = path.join(__dirname, '..', '.tmp-test')

let outDir: string

beforeEach(() => {
	fs.mkdirSync(tmpRoot, { recursive: true })
	outDir = fs.mkdtempSync(path.join(tmpRoot, 'golden-'))
})

afterEach(() => {
	fs.rmSync(outDir, { recursive: true, force: true })
})

const buildTables = () => {
	const sequelize = new Sequelize({
		validateOnly: true,
		models: [Organization, User, AuditEntry],
	})
	return getTablesFromModels(sequelize, sequelize.models)
}

/** Mirrors what makeMigration does: diff both directions, then swap up onto down. */
const buildMigration = (previousTables: ITables, currentTables: ITables) => {
	const migration = getMigration(
		getDiffActionsFromTables(previousTables, currentTables),
	)
	migration.commandsDown = getMigration(
		getDiffActionsFromTables(currentTables, previousTables),
	).commandsUp
	return migration
}

/** Strips the generated timestamp so the snapshot is stable across runs. */
const readGenerated = (filename: string) =>
	fs
		.readFileSync(filename, 'utf8')
		.replace(/"created": "[^"]*"/, '"created": "<timestamp>"')

describe('golden: models to migration file', () => {
	describe('initial migration (empty database)', () => {
		const tables = () => buildTables()

		it('전체 스키마에 대한 up 커맨드를 만든다', () => {
			expect(buildMigration({}, tables()).commandsUp).toMatchSnapshot()
		})

		it('전체 스키마에 대한 down 커맨드를 만든다', () => {
			expect(buildMigration({}, tables()).commandsDown).toMatchSnapshot()
		})

		it('사람이 읽는 액션 요약을 만든다', () => {
			expect(buildMigration({}, tables()).consoleOut).toMatchSnapshot()
		})

		it('마이그레이션 파일 전문을 만든다', async () => {
			const { filename } = await writeMigration(
				1,
				buildMigration({}, tables()),
				{ outDir, migrationName: 'initial' },
			)

			expect(readGenerated(filename)).toMatchSnapshot()
		})

		it('생성된 파일이 로드 가능하다', async () => {
			const { filename } = await writeMigration(
				1,
				buildMigration({}, tables()),
				{ outDir, migrationName: 'initial' },
			)

			// eslint-disable-next-line @typescript-eslint/no-require-imports
			expect(() => require(filename)).not.toThrow()
		})

		it('FK를 가진 테이블이 참조 대상보다 뒤에 온다', () => {
			const { consoleOut } = buildMigration({}, tables())
			const orgIndex = consoleOut.findIndex((line) =>
				line.includes('createTable "organizations"'),
			)
			const userIndex = consoleOut.findIndex((line) =>
				line.includes('createTable "users"'),
			)

			expect(orgIndex).toBeGreaterThanOrEqual(0)
			expect(orgIndex).toBeLessThan(userIndex)
		})
	})

	describe('incremental migrations', () => {
		it('변경이 없으면 커맨드가 비어 있다', () => {
			const tables = buildTables()

			expect(buildMigration(tables, tables).commandsUp).toEqual([])
		})

		it('컬럼 추가는 addColumn 하나만 만든다', () => {
			const previous = buildTables()
			const current = buildTables()
			current['users'].schema['phone'] = {
				seqType: 'Sequelize.STRING(20)',
				allowNull: true,
			}

			expect(
				buildMigration(previous, current).commandsUp,
			).toMatchSnapshot()
		})

		it('컬럼 삭제는 removeColumn 하나만 만든다', () => {
			const previous = buildTables()
			const current = buildTables()
			delete current['users'].schema['bio']

			expect(
				buildMigration(previous, current).commandsUp,
			).toMatchSnapshot()
		})

		it('타입 변경은 changeColumn을 만든다', () => {
			const previous = buildTables()
			const current = buildTables()
			current['users'].schema['nickname'].seqType = 'Sequelize.STRING(64)'

			expect(
				buildMigration(previous, current).commandsUp,
			).toMatchSnapshot()
		})

		it('테이블 삭제는 dropTable을 만든다', () => {
			const previous = buildTables()
			const current = buildTables()
			delete current['users']

			expect(
				buildMigration(previous, current).commandsUp,
			).toMatchSnapshot()
		})

		it('추가한 컬럼의 down은 그 컬럼을 되돌린다', () => {
			const previous = buildTables()
			const current = buildTables()
			current['users'].schema['phone'] = {
				seqType: 'Sequelize.STRING(20)',
			}

			const { commandsDown } = buildMigration(previous, current)

			expect(commandsDown).toHaveLength(1)
			expect(commandsDown[0]).toContain('removeColumn')
			expect(commandsDown[0]).toContain('"phone"')
		})
	})

	describe('table snapshot itself', () => {
		// Pins the intermediate representation, not just the rendered file. When the type
		// reverser or the attribute copier changes, this snapshot is where it shows first.
		it('모델에서 뽑아낸 테이블 스냅샷을 고정한다', () => {
			expect(buildTables()).toMatchSnapshot()
		})
	})
})
