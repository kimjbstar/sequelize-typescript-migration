import * as fs from 'fs'
import * as path from 'path'
import removeCurrentRevisionMigrations from './removeCurrentRevisionMigrations'

const tmpRoot = path.join(__dirname, '..', '..', '.tmp-test')

let migrationsPath: string

beforeEach(() => {
	fs.mkdirSync(tmpRoot, { recursive: true })
	migrationsPath = fs.mkdtempSync(path.join(tmpRoot, 'remove-'))
})

afterEach(() => {
	fs.rmSync(migrationsPath, { recursive: true, force: true })
})

const touch = (filename: string) =>
	fs.writeFileSync(path.join(migrationsPath, filename), '')

const remaining = () => fs.readdirSync(migrationsPath).sort()

describe('removeCurrentRevisionMigrations', () => {
	describe('revision matching', () => {
		// Regression: filenames are written zero-padded ("00000001-name.js") but the
		// comparison used the unpadded `revision.toString()`, so "00000001" === "1" was
		// never true and the function silently did nothing. Re-running makeMigration kept
		// piling up files that all claimed the same revision.
		it('제로 패딩된 파일명을 리비전과 매칭해 지운다', () => {
			touch('00000001-first.js')

			expect(removeCurrentRevisionMigrations(1, migrationsPath, {})).toBe(
				true,
			)
			expect(remaining()).toEqual([])
		})

		it('패딩 없는 파일명도 지운다', () => {
			touch('1-legacy.js')

			removeCurrentRevisionMigrations(1, migrationsPath, {})

			expect(remaining()).toEqual([])
		})

		it('같은 리비전 파일이 여러 개면 모두 지운다', () => {
			touch('00000001-first.js')
			touch('00000001-second.js')

			removeCurrentRevisionMigrations(1, migrationsPath, {})

			expect(remaining()).toEqual([])
		})

		it('다른 리비전 파일은 남긴다', () => {
			touch('00000001-target.js')
			touch('00000002-other.js')

			removeCurrentRevisionMigrations(1, migrationsPath, {})

			expect(remaining()).toEqual(['00000002-other.js'])
		})

		it('리비전으로 읽을 수 없는 파일명은 건드리지 않는다', () => {
			touch('README.md')
			touch('not-a-migration.js')

			removeCurrentRevisionMigrations(1, migrationsPath, {})

			expect(remaining()).toEqual(['README.md', 'not-a-migration.js'])
		})

		it('숫자로 시작하지만 리비전이 다른 파일은 남긴다', () => {
			touch('10-ten.js')

			removeCurrentRevisionMigrations(1, migrationsPath, {})

			expect(remaining()).toEqual(['10-ten.js'])
		})
	})

	describe('return value', () => {
		it('지운 파일이 없으면 false를 반환한다', () => {
			expect(removeCurrentRevisionMigrations(1, migrationsPath, {})).toBe(
				false,
			)
		})

		it('하나라도 지웠으면 true를 반환한다', () => {
			touch('00000001-a.js')

			expect(removeCurrentRevisionMigrations(1, migrationsPath, {})).toBe(
				true,
			)
		})
	})

	describe('keepFiles', () => {
		it('keepFiles가 켜져 있으면 아무것도 지우지 않는다', () => {
			touch('00000001-a.js')

			expect(
				removeCurrentRevisionMigrations(1, migrationsPath, {
					keepFiles: true,
				}),
			).toBe(false)
			expect(remaining()).toEqual(['00000001-a.js'])
		})
	})

	describe('best-effort behaviour', () => {
		// Cleaning up old files must never abort a run that has otherwise succeeded.
		it('읽을 수 없는 경로여도 예외를 던지지 않는다', () => {
			expect(
				removeCurrentRevisionMigrations(
					1,
					path.join(migrationsPath, 'does-not-exist'),
					{},
				),
			).toBe(false)
		})

		it('지울 수 없는 항목이 있어도 예외를 던지지 않는다', () => {
			// A directory named like a migration: unlink refuses to remove it.
			fs.mkdirSync(path.join(migrationsPath, '00000001-a-directory'))
			touch('00000001-a.js')

			expect(() =>
				removeCurrentRevisionMigrations(1, migrationsPath, {}),
			).not.toThrow()
		})

		it('하나가 실패해도 나머지는 계속 지운다', () => {
			fs.mkdirSync(path.join(migrationsPath, '00000001-a-directory'))
			touch('00000001-b.js')

			removeCurrentRevisionMigrations(1, migrationsPath, {})

			expect(remaining()).toEqual(['00000001-a-directory'])
		})
	})
})
