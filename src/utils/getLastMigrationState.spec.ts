import { QueryTypes } from 'sequelize'
import { Sequelize } from 'sequelize-typescript'
import getLastMigrationState from './getLastMigrationState'

/**
 * No database here: the function's entire surface is two `sequelize.query` calls, so a
 * stub that records the SQL and options it was handed covers everything -- including
 * the two things that used to break in production (unquoted identifiers on Postgres,
 * and a revision interpolated straight into the WHERE clause).
 */
type RecordedQuery = { sql: string; options: Record<string, unknown> }

const stubSequelize = (
	responses: unknown[][],
	dialect = 'mysql',
): { sequelize: Sequelize; queries: RecordedQuery[] } => {
	const queries: RecordedQuery[] = []
	let call = 0
	const sequelize = {
		getDialect: () => dialect,
		query: (sql: string, options: Record<string, unknown>) => {
			queries.push({ sql, options })
			return Promise.resolve(responses[call++] ?? [])
		},
	} as unknown as Sequelize

	return { sequelize, queries }
}

describe('getLastMigrationState', () => {
	describe('reading the stored state', () => {
		it('마지막 실행 마이그레이션의 리비전으로 상태를 찾는다', async () => {
			const state = { revision: 3, tables: {} }
			const { sequelize, queries } = stubSequelize([
				[{ name: '00000003-add_users' }],
				[{ state }],
			])

			await expect(getLastMigrationState(sequelize)).resolves.toBe(state)
			expect(queries[1].options.replacements).toEqual({ revision: 3 })
		})

		it('SequelizeMeta가 비어 있으면 undefined를 반환한다', async () => {
			const { sequelize } = stubSequelize([[], []])

			await expect(
				getLastMigrationState(sequelize),
			).resolves.toBeUndefined()
		})

		it('상태 행이 없으면 undefined를 반환한다', async () => {
			const { sequelize } = stubSequelize([
				[{ name: '00000001-init' }],
				[],
			])

			await expect(
				getLastMigrationState(sequelize),
			).resolves.toBeUndefined()
		})

		it('실행 이력이 없으면 리비전 -1로 조회한다', async () => {
			const { sequelize, queries } = stubSequelize([[], []])

			await getLastMigrationState(sequelize)

			expect(queries[1].options.replacements).toEqual({ revision: -1 })
		})

		it('제로 패딩된 파일명에서 숫자 리비전을 뽑아낸다', async () => {
			const { sequelize, queries } = stubSequelize([
				[{ name: '00000012-add-user-email-index' }],
				[],
			])

			await getLastMigrationState(sequelize)

			// A number, not the string "00000012": the column it is compared against
			// is an INTEGER.
			expect(queries[1].options.replacements).toEqual({ revision: 12 })
		})

		it('리비전을 읽을 수 없는 파일명이면 -1로 되돌아간다', async () => {
			const { sequelize, queries } = stubSequelize([
				[{ name: 'not-a-revision' }],
				[],
			])

			await getLastMigrationState(sequelize)

			expect(queries[1].options.replacements).toEqual({ revision: -1 })
		})
	})

	describe('query shape', () => {
		it('가장 최근 마이그레이션 한 건만 조회한다', async () => {
			const { sequelize, queries } = stubSequelize([[], []])

			await getLastMigrationState(sequelize)

			expect(queries[0].sql).toMatch(/ORDER BY name DESC LIMIT 1$/)
		})

		it('두 조회 모두 SELECT 타입으로 실행한다', async () => {
			const { sequelize, queries } = stubSequelize([[], []])

			await getLastMigrationState(sequelize)

			queries.forEach((query) => {
				expect(query.options.type).toBe(QueryTypes.SELECT)
			})
		})
	})

	describe('dialect-aware identifier quoting', () => {
		// Postgres folds unquoted identifiers to lowercase, so `FROM SequelizeMeta` used to
		// become `from sequelizemeta` and fail with `relation "sequelizemeta" does not
		// exist` -- the most reported problem with this tool (upstream #3, #4, #10).
		it.each([
			['postgres', '"SequelizeMeta"', '"SequelizeMetaMigrations"'],
			['mssql', '[SequelizeMeta]', '[SequelizeMetaMigrations]'],
			['mysql', '`SequelizeMeta`', '`SequelizeMetaMigrations`'],
			['mariadb', '`SequelizeMeta`', '`SequelizeMetaMigrations`'],
		])(
			'%s에서 테이블 이름을 %s로 인용한다',
			async (dialect, metaTable, stateTable) => {
				const { sequelize, queries } = stubSequelize([[], []], dialect)

				await getLastMigrationState(sequelize)

				expect(queries[0].sql).toContain(`FROM ${metaTable}`)
				expect(queries[1].sql).toContain(`FROM ${stateTable}`)
			},
		)

		it('알 수 없는 dialect에서는 인용하지 않는다', async () => {
			const { sequelize, queries } = stubSequelize([[], []], 'sqlite')

			await getLastMigrationState(sequelize)

			expect(queries[0].sql).toContain('FROM SequelizeMeta ')
		})
	})

	describe('parameter binding', () => {
		it('리비전을 SQL 문자열에 이어붙이지 않는다', async () => {
			const { sequelize, queries } = stubSequelize([
				[{ name: '00000007-x' }],
				[],
			])

			await getLastMigrationState(sequelize)

			expect(queries[1].sql).toContain('revision = :revision')
			expect(queries[1].sql).not.toContain('7')
		})

		it('파일명에 SQL이 섞여 있어도 쿼리에 새어나가지 않는다', async () => {
			const { sequelize, queries } = stubSequelize([
				[{ name: "1' OR '1'='1" }],
				[],
			])

			await getLastMigrationState(sequelize)

			expect(queries[1].sql).not.toContain('OR')
			expect(queries[1].options.replacements).toEqual({ revision: 1 })
		})
	})
})
