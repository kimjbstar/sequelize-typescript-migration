import getMigration from './getMigration'
import type { IAction } from './getDiffActionsFromTables'
import type { IColumnSnapshot } from '../constants'

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

describe('getMigration', () => {
	it('빈 액션 목록에서 빈 커맨드를 만든다', () => {
		expect(getMigration([])).toEqual({
			commandsUp: [],
			commandsDown: [],
			consoleOut: [],
		})
	})

	describe('command generation', () => {
		it('createTable 커맨드와 사람이 읽는 요약을 만든다', () => {
			const { commandsUp, consoleOut } = getMigration([
				createTable('users', { id: { seqType: 'Sequelize.INTEGER' } }),
			])

			expect(commandsUp).toHaveLength(1)
			expect(commandsUp[0]).toContain('fn: "createTable"')
			expect(commandsUp[0]).toContain('"users"')
			expect(consoleOut).toEqual(['createTable "users", deps: []'])
		})

		it.each([
			[
				'dropTable',
				{
					actionType: 'dropTable' as const,
					tableName: 'legacy',
					depends: [],
				},
				'{ fn: "dropTable", params: ["legacy"] }',
			],
			[
				'removeColumn',
				{
					actionType: 'removeColumn' as const,
					tableName: 'users',
					columnName: 'old',
					depends: ['users'],
				},
				'{ fn: "removeColumn", params: ["users", "old"] }',
			],
		])('%s 커맨드를 만든다', (_label, action, expected) => {
			expect(getMigration([action]).commandsUp[0]).toBe(expected)
		})

		it('addColumn은 테이블명, 컬럼명, 타입을 순서대로 넣는다', () => {
			const command = getMigration([
				{
					actionType: 'addColumn' as const,
					tableName: 'users',
					attributeName: 'age',
					options: { seqType: 'Sequelize.INTEGER' },
					depends: ['users'],
				},
			]).commandsUp[0]

			expect(command).toContain('fn: "addColumn"')
			expect(command).toContain('"users"')
			expect(command).toContain('"age"')
			expect(command).toContain('"type": Sequelize.INTEGER')
		})

		it('addIndex는 필드 배열과 인덱스 옵션을 넣는다', () => {
			const command = getMigration([
				{
					actionType: 'addIndex' as const,
					tableName: 'users',
					fields: ['name'],
					options: { indexName: 'idx_name' },
					depends: ['users'],
				},
			]).commandsUp[0]

			expect(command).toContain('fn: "addIndex"')
			expect(command).toContain('["name"]')
			expect(command).toContain('"indexName":"idx_name"')
		})

		it('여러 액션을 순서대로 커맨드로 만든다', () => {
			const { commandsUp } = getMigration([
				createTable('users', { id: { seqType: 'Sequelize.INTEGER' } }),
				{
					actionType: 'dropTable' as const,
					tableName: 'legacy',
					depends: [],
				},
			])

			expect(commandsUp).toHaveLength(2)
			expect(commandsUp[0]).toContain('createTable')
			expect(commandsUp[1]).toContain('dropTable')
		})
	})

	describe('attribute rendering', () => {
		it('seqType을 따옴표 없는 type 표현식으로 바꾼다', () => {
			// The whole point of seqType: it must land in the file as executable code
			// (`Sequelize.INTEGER`), not as the string "Sequelize.INTEGER".
			const command = getMigration([
				createTable('t', { id: { seqType: 'Sequelize.INTEGER' } }),
			]).commandsUp[0]

			expect(command).toContain('"type": Sequelize.INTEGER')
			expect(command).not.toContain('"type": "Sequelize.INTEGER"')
		})

		it('allowNull, primaryKey 같은 속성을 그대로 넣는다', () => {
			const command = getMigration([
				createTable('t', {
					id: {
						seqType: 'Sequelize.INTEGER',
						primaryKey: true,
						autoIncrement: true,
					},
				}),
			]).commandsUp[0]

			expect(command).toContain('"primaryKey":true')
			expect(command).toContain('"autoIncrement":true')
		})

		describe('defaultValue', () => {
			// Documents that this layer handles defaultValue correctly. The reason defaults
			// never reach a generated migration is upstream, in getTablesFromModels, which
			// computes the value and then overwrites the object that held it.
			it('리터럴 기본값을 값으로 넣는다', () => {
				expect(
					getMigration([
						createTable('t', {
							a: {
								seqType: 'Sequelize.STRING',
								defaultValue: { value: 'hi' },
							},
						}),
					]).commandsUp[0],
				).toContain('"defaultValue":"hi"')
			})

			it('boolean false 기본값도 값으로 넣는다', () => {
				expect(
					getMigration([
						createTable('t', {
							a: {
								seqType: 'Sequelize.BOOLEAN',
								defaultValue: { value: false },
							},
						}),
					]).commandsUp[0],
				).toContain('"defaultValue":false')
			})

			it('internal 기본값은 따옴표 없는 코드로 넣는다', () => {
				const command = getMigration([
					createTable('t', {
						a: {
							seqType: 'Sequelize.DATE',
							defaultValue: {
								internal: true,
								value: 'Sequelize.NOW',
							},
						},
					}),
				]).commandsUp[0]

				expect(command).toContain('"defaultValue": Sequelize.NOW')
				expect(command).not.toContain('"defaultValue":"Sequelize.NOW"')
			})
		})
	})

	describe('commandsDown', () => {
		// getMigration only ever fills commandsUp. The caller generates the reverse actions
		// by diffing in the opposite direction and then assigns that run's commandsUp onto
		// commandsDown -- which is why an asymmetric change can produce a broken down().
		it('항상 비어 있다 (호출자가 역방향 diff 결과를 대입한다)', () => {
			expect(
				getMigration([
					createTable('t', { id: { seqType: 'Sequelize.INTEGER' } }),
				]).commandsDown,
			).toEqual([])
		})
	})
})
