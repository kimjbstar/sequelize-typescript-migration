import getDiffActionsFromTables, { IAction } from './getDiffActionsFromTables'
import type { IColumnSnapshot, ITables, ITableSnapshot } from '../constants'

const table = (
	tableName: string,
	schema: ITableSnapshot['schema'],
	indexes: ITableSnapshot['indexes'] = {},
): ITableSnapshot => ({
	tableName,
	schema,
	indexes,
})

const column = (
	seqType: string,
	extra: Partial<IColumnSnapshot> = {},
): IColumnSnapshot => ({
	seqType,
	...extra,
})

const users = table('users', { id: column('Sequelize.INTEGER') })
const usersWithName = table('users', {
	id: column('Sequelize.INTEGER'),
	name: column('Sequelize.STRING'),
})

const diff = (previous: ITables, current: ITables): IAction[] =>
	getDiffActionsFromTables(previous, current)

const typesOf = (actions: IAction[]) => actions.map((a) => a.actionType)

describe('getDiffActionsFromTables', () => {
	describe('no-op diffs', () => {
		it('양쪽이 비어 있으면 액션이 없다', () => {
			expect(diff({}, {})).toEqual([])
		})

		it('변경이 없으면 액션이 없다', () => {
			expect(diff({ users }, { users })).toEqual([])
		})

		it('같은 내용이라도 객체 참조가 다르면 여전히 액션이 없다', () => {
			expect(
				diff(
					{ users },
					{
						users: table('users', {
							id: column('Sequelize.INTEGER'),
						}),
					},
				),
			).toEqual([])
		})
	})

	describe('table level changes', () => {
		it('새 테이블은 createTable 액션을 만든다', () => {
			const [action] = diff({}, { users })

			expect(action).toMatchObject({
				actionType: 'createTable',
				tableName: 'users',
				attributes: { id: { seqType: 'Sequelize.INTEGER' } },
				options: {},
				depends: [],
			})
		})

		it('사라진 테이블은 dropTable 액션을 만든다', () => {
			expect(diff({ users }, {})).toEqual([
				expect.objectContaining({
					actionType: 'dropTable',
					tableName: 'users',
				}),
			])
		})

		it('FK를 가진 새 테이블은 참조 대상을 depends에 넣는다', () => {
			const [action] = diff(
				{},
				{
					posts: table('posts', {
						userId: column('Sequelize.INTEGER', {
							references: { model: 'users', key: 'id' },
						}),
					}),
				},
			)

			expect(action.depends).toEqual(['users'])
		})

		it('여러 FK를 가지면 모두 depends에 들어간다', () => {
			const [action] = diff(
				{},
				{
					posts: table('posts', {
						userId: column('Sequelize.INTEGER', {
							references: { model: 'users', key: 'id' },
						}),
						orgId: column('Sequelize.INTEGER', {
							references: { model: 'orgs', key: 'id' },
						}),
					}),
				},
			)

			expect(action.depends).toEqual(['users', 'orgs'])
		})
	})

	describe('column level changes', () => {
		it('새 컬럼은 addColumn 액션을 만든다', () => {
			const [action] = diff({ users }, { users: usersWithName })

			expect(action).toMatchObject({
				actionType: 'addColumn',
				tableName: 'users',
				attributeName: 'name',
				depends: ['users'],
			})
		})

		it('사라진 컬럼은 removeColumn 액션을 만든다', () => {
			const [action] = diff({ users: usersWithName }, { users })

			expect(action).toMatchObject({
				actionType: 'removeColumn',
				tableName: 'users',
				columnName: 'name',
				depends: ['users'],
			})
		})

		it('타입이 바뀐 컬럼은 changeColumn 액션을 만든다', () => {
			const [action] = diff(
				{ users },
				{ users: table('users', { id: column('Sequelize.BIGINT') }) },
			)

			expect(action).toMatchObject({
				actionType: 'changeColumn',
				tableName: 'users',
				attributeName: 'id',
			})
			expect(action.options).toMatchObject({
				seqType: 'Sequelize.BIGINT',
			})
		})
	})

	describe('index changes', () => {
		const withIndex = table(
			'users',
			{ id: column('Sequelize.INTEGER') },
			{ somehash: { fields: ['id'], options: { indexName: 'idx_id' } } },
		)

		it('새 인덱스는 addIndex 액션을 만든다', () => {
			const [action] = diff({ users }, { users: withIndex })

			expect(action).toMatchObject({
				actionType: 'addIndex',
				tableName: 'users',
				fields: ['id'],
				depends: ['users'],
			})
		})

		it('사라진 인덱스는 removeIndex 액션을 만든다', () => {
			expect(typesOf(diff({ users: withIndex }, { users }))).toEqual([
				'removeIndex',
			])
		})
	})

	describe('multiple simultaneous changes', () => {
		it('여러 변경을 한 번에 액션으로 만든다', () => {
			const actions = diff(
				{ users },
				{
					users: usersWithName,
					posts: table('posts', { id: column('Sequelize.INTEGER') }),
				},
			)

			expect(typesOf(actions)).toEqual(['createTable', 'addColumn'])
		})

		it('결과는 실행 순서대로 정렬되어 나온다', () => {
			// getDiffActionsFromTables runs sortActions before returning, so createTable
			// always precedes addColumn regardless of the order the diffs were produced in.
			const actions = diff(
				{ users: usersWithName },
				{ posts: table('posts', { id: column('Sequelize.INTEGER') }) },
			)

			expect(typesOf(actions)).toEqual(['dropTable', 'createTable'])
		})
	})

	describe('column attribute edits', () => {
		it.each([
			['allowNull 값 변경', { allowNull: false }, { allowNull: true }],
			['comment 값 변경', { comment: 'a' }, { comment: 'b' }],
		])('%s은 changeColumn을 만든다', (_label, before, after) => {
			const actions = diff(
				{
					posts: table('posts', {
						c: column('Sequelize.STRING', before),
					}),
				},
				{
					posts: table('posts', {
						c: column('Sequelize.STRING', after),
					}),
				},
			)

			expect(typesOf(actions)).toEqual(['changeColumn'])
		})

		it('속성이 제거되어도 changeColumn을 만든다', () => {
			const actions = diff(
				{
					posts: table('posts', {
						c: column('Sequelize.STRING', { allowNull: false }),
					}),
				},
				{ posts: table('posts', { c: column('Sequelize.STRING') }) },
			)

			expect(typesOf(actions)).toEqual(['changeColumn'])
		})

		it('변경된 컬럼의 최종 속성 전체를 options에 담는다', () => {
			// changeColumn has to restate the whole column, not just the delta.
			const [action] = diff(
				{
					posts: table('posts', {
						c: column('Sequelize.STRING', { allowNull: false }),
					}),
				},
				{
					posts: table('posts', {
						c: column('Sequelize.TEXT', { allowNull: true }),
					}),
				},
			)

			expect(action.options).toMatchObject({
				seqType: 'Sequelize.TEXT',
				allowNull: true,
			})
		})
	})

	describe('foreign key dependencies', () => {
		// Regression: two of the three `references` reads were misspelled `.nodel` instead
		// of `.model` (the `case "D"` branch had it right). The undefined that landed in
		// `depends` could not match any tableName, so sortActions silently lost the
		// foreign-key ordering for that action.
		it('기존 컬럼에 FK가 추가되면 참조 테이블이 depends에 들어간다', () => {
			const [action] = diff(
				{
					posts: table('posts', {
						userId: column('Sequelize.INTEGER'),
					}),
				},
				{
					posts: table('posts', {
						userId: column('Sequelize.INTEGER', {
							references: { model: 'users', key: 'id' },
						}),
					}),
				},
			)

			expect(action.actionType).toBe('changeColumn')
			expect(action.depends).toEqual(['posts', 'users'])
		})

		it('참조 테이블이 바뀌면 새 참조 대상이 depends에 들어간다', () => {
			const [action] = diff(
				{
					posts: table('posts', {
						userId: column('Sequelize.INTEGER', {
							references: { model: 'users', key: 'id' },
						}),
					}),
				},
				{
					posts: table('posts', {
						userId: column('Sequelize.INTEGER', {
							references: { model: 'organizations', key: 'id' },
						}),
					}),
				},
			)

			expect(action.depends).toEqual(['posts', 'organizations'])
		})

		it('FK가 제거되면 참조 대상이 depends에서 빠진다', () => {
			const [action] = diff(
				{
					posts: table('posts', {
						userId: column('Sequelize.INTEGER', {
							references: { model: 'users', key: 'id' },
						}),
					}),
				},
				{
					posts: table('posts', {
						userId: column('Sequelize.INTEGER'),
					}),
				},
			)

			expect(action.depends).toEqual(['posts'])
		})

		it('createTable 경로도 FK를 올바르게 읽는다', () => {
			const [action] = diff(
				{},
				{
					posts: table('posts', {
						userId: column('Sequelize.INTEGER', {
							references: { model: 'users', key: 'id' },
						}),
					}),
				},
			)

			expect(action.depends).toEqual(['users'])
		})

		it('어떤 경로에서도 depends에 undefined가 들어가지 않는다', () => {
			const withRef = column('Sequelize.INTEGER', {
				references: { model: 'users', key: 'id' },
			})
			const withoutRef = column('Sequelize.INTEGER')
			const scenarios: Array<[ITables, ITables]> = [
				[{}, { posts: table('posts', { userId: withRef }) }],
				[
					{ posts: table('posts', { userId: withoutRef }) },
					{ posts: table('posts', { userId: withRef }) },
				],
				[
					{ posts: table('posts', { userId: withRef }) },
					{ posts: table('posts', { userId: withoutRef }) },
				],
				[{ posts: table('posts', { userId: withRef }) }, {}],
			]

			scenarios.forEach(([previous, current]) => {
				diff(previous, current).forEach((action) => {
					expect(action.depends).not.toContain(undefined)
				})
			})
		})
	})
})
