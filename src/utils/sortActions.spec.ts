import sortActions from './sortActions'
import { IAction } from './getDiffActionsFromTables'

const action = (
	actionType: IAction['actionType'],
	tableName: string,
	depends: string[] = [],
): IAction => ({ actionType, tableName, depends })

const create = (tableName: string, depends: string[] = []) =>
	action('createTable', tableName, depends)

const typesOf = (actions: IAction[]) => actions.map((a) => a.actionType)
const namesOf = (actions: IAction[]) => actions.map((a) => a.tableName)

const clone = (actions: IAction[]): IAction[] =>
	actions.map((a) => ({ ...a, depends: [...a.depends] }))

/** Every table that appears before something it depends on. */
const topologyViolations = (sorted: IAction[]): string[] => {
	const positionOf = new Map(sorted.map((a, i) => [a.tableName, i]))
	const violations: string[] = []
	sorted.forEach((a, index) => {
		a.depends.forEach((dependency) => {
			const dependencyPosition = positionOf.get(dependency)
			if (
				dependencyPosition !== undefined &&
				dependencyPosition > index
			) {
				violations.push(
					`${a.tableName}@${index} needs ${dependency}@${dependencyPosition}`,
				)
			}
		})
	})
	return violations
}

const permutations = <T>(items: T[]): T[][] => {
	if (items.length <= 1) return [items]
	return items.flatMap((item, i) =>
		permutations([...items.slice(0, i), ...items.slice(i + 1)]).map(
			(rest) => [item, ...rest],
		),
	)
}

/** How many input orderings of the same dependency graph come out mis-sorted. */
const brokenPermutationCount = (actions: IAction[]): number =>
	permutations(actions).filter(
		(permutation) =>
			topologyViolations(sortActions(clone(permutation))).length > 0,
	).length

describe('sortActions', () => {
	describe('action type ordering', () => {
		it('액션 타입을 정해진 실행 순서대로 정렬한다', () => {
			const sorted = sortActions([
				action('addIndex', 'a'),
				action('createTable', 'b'),
				action('removeIndex', 'c'),
				action('dropTable', 'd'),
				action('changeColumn', 'e'),
				action('removeColumn', 'f'),
				action('addColumn', 'g'),
			])

			expect(typesOf(sorted)).toEqual([
				'removeIndex',
				'removeColumn',
				'dropTable',
				'createTable',
				'addColumn',
				'changeColumn',
				'addIndex',
			])
		})

		it('같은 타입끼리는 의존이 없는 쪽을 앞에 둔다', () => {
			expect(
				namesOf(
					sortActions([create('posts', ['users']), create('users')]),
				),
			).toEqual(['users', 'posts'])
		})

		it('dropTable은 반대로 의존하는 쪽을 먼저 지운다', () => {
			expect(
				namesOf(
					sortActions([
						action('dropTable', 'users'),
						action('dropTable', 'posts', ['users']),
					]),
				),
			).toEqual(['posts', 'users'])
		})

		it('타입이 다르면 의존 관계보다 타입 순서가 우선한다', () => {
			// addColumn always runs after createTable even when the column has no dependency
			// and the table does -- the type bucket wins.
			const sorted = sortActions([
				action('addColumn', 'a'),
				create('b', ['a']),
			])
			expect(typesOf(sorted)).toEqual(['createTable', 'addColumn'])
		})
	})

	describe('dependency ordering that works', () => {
		it('길이 3인 FK 체인은 모든 입력 순서에서 정렬된다', () => {
			expect(
				brokenPermutationCount([
					create('a'),
					create('b', ['a']),
					create('c', ['b']),
				]),
			).toBe(0)
		})

		it('다이아몬드 의존은 모든 입력 순서에서 정렬된다', () => {
			expect(
				brokenPermutationCount([
					create('a'),
					create('b', ['a']),
					create('c', ['a']),
					create('d', ['b', 'c']),
				]),
			).toBe(0)
		})

		it('여러 테이블을 참조하는 테이블은 참조 대상 모두보다 뒤에 온다', () => {
			const order = namesOf(
				sortActions([
					create('posts', ['users', 'orgs']),
					create('users'),
					create('orgs'),
				]),
			)
			expect(order.indexOf('posts')).toBe(2)
		})
	})

	describe('topological ordering', () => {
		// Regression: the dependency pass used to compare pairs and swap only when `i > j`,
		// mutating the array as it iterated. That settles a chain of three but not four --
		// measured, 12 of 24 input orderings of a four-table chain came out mis-ordered, and
		// 95 of 120 for five. It is the concrete mechanism behind the README's admission
		// that "undo(down) action may not work".
		it.each([
			[
				'길이 4인 FK 체인',
				[
					create('a'),
					create('b', ['a']),
					create('c', ['b']),
					create('d', ['c']),
				],
			],
			[
				'길이 5인 FK 체인',
				[
					create('a'),
					create('b', ['a']),
					create('c', ['b']),
					create('d', ['c']),
					create('e', ['d']),
				],
			],
			[
				'다이아몬드',
				[
					create('a'),
					create('b', ['a']),
					create('c', ['a']),
					create('d', ['b', 'c']),
				],
			],
			[
				'루트가 여럿인 그래프',
				[
					create('a'),
					create('b'),
					create('c', ['a', 'b']),
					create('d', ['c']),
				],
			],
			[
				'별 모양',
				[
					create('hub'),
					create('s1', ['hub']),
					create('s2', ['hub']),
					create('s3', ['hub']),
				],
			],
			[
				'넓고 깊은 그래프',
				[
					create('a'),
					create('b', ['a']),
					create('c', ['a']),
					create('d', ['b']),
					create('e', ['c', 'd']),
				],
			],
		])('%s는 모든 입력 순서에서 정렬된다', (_label, actions) => {
			expect(brokenPermutationCount(actions)).toBe(0)
		})

		it('예전에 실패하던 [a,c,d,b] 입력을 올바르게 정렬한다', () => {
			const sorted = sortActions([
				create('a'),
				create('c', ['b']),
				create('d', ['c']),
				create('b', ['a']),
			])

			expect(namesOf(sorted)).toEqual(['a', 'b', 'c', 'd'])
			expect(topologyViolations(sorted)).toEqual([])
		})

		it('제약이 없는 액션들은 입력 순서를 유지한다', () => {
			// A stable sort matters: an unstable one would churn the generated migration
			// on every run even when nothing about the schema changed.
			expect(
				namesOf(sortActions([create('z'), create('y'), create('x')])),
			).toEqual(['z', 'y', 'x'])
		})

		it('dropTable은 의존하는 쪽부터 지운다', () => {
			const sorted = sortActions([
				action('dropTable', 'a'),
				action('dropTable', 'b', ['a']),
				action('dropTable', 'c', ['b']),
			])

			expect(namesOf(sorted)).toEqual(['c', 'b', 'a'])
		})
	})

	describe('degenerate input', () => {
		it('빈 배열을 그대로 반환한다', () => {
			expect(sortActions([])).toEqual([])
		})

		it('액션이 하나면 그대로 둔다', () => {
			expect(namesOf(sortActions([create('a', ['ghost'])]))).toEqual([
				'a',
			])
		})

		it('의존 사이클이 있어도 무한 루프 없이 끝난다', () => {
			expect(() =>
				sortActions([create('a', ['b']), create('b', ['a'])]),
			).not.toThrow()
		})

		it('자기 자신을 참조해도 무한 루프 없이 끝난다', () => {
			expect(() => sortActions([create('a', ['a'])])).not.toThrow()
		})

		it('존재하지 않는 테이블에 의존하면 그 의존은 무시한다', () => {
			// The dependency is satisfied by an earlier bucket or by a migration that
			// already ran, so it must not hold this action back.
			expect(
				namesOf(
					sortActions([create('a', ['nonexistent']), create('b')]),
				),
			).toEqual(['a', 'b'])
		})

		it('의존 사이클이 있으면 입력 순서로 되돌아간다', () => {
			expect(
				namesOf(sortActions([create('a', ['b']), create('b', ['a'])])),
			).toEqual(['a', 'b'])
		})

		it('입력 배열을 그 자리에서 정렬해 같은 참조를 반환한다', () => {
			const input = [action('addIndex', 'a'), create('b')]
			expect(sortActions(input)).toBe(input)
		})
	})
})
