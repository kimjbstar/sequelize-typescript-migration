import { IAction } from './getDiffActionsFromTables'

/**
 * The order queryInterface commands have to run in. Indexes come off before their
 * columns, columns before their tables, and everything is re-created in the mirror
 * order afterwards.
 */
const ORDERED_ACTION_TYPES: IAction['actionType'][] = [
	'removeIndex',
	'removeColumn',
	'dropTable',
	'createTable',
	'addColumn',
	'changeColumn',
	'addIndex',
]

/**
 * Orders migration actions so they can be executed top to bottom.
 *
 * Two passes: bucket by action type, then topologically sort within each bucket so a
 * table never appears before something it references.
 *
 * The previous implementation compared pairs and swapped when `i > j`, mutating the
 * array as it iterated. That settles a chain of three but not four -- measured, half of
 * the input orderings of a four-table chain came out mis-ordered, and 95 of 120 for five.
 * That is the concrete mechanism behind the README's "undo(down) action may not work".
 *
 * Sorts in place and returns the same array, as callers rely on.
 */
export default function sortActions(actions: IAction[]): IAction[] {
	const sorted = ORDERED_ACTION_TYPES.flatMap((actionType) => {
		const bucket = actions.filter(
			(action) => action.actionType === actionType,
		)
		// Dropping runs in reverse: a table has to go before the one it depends on.
		return actionType === 'dropTable'
			? sortByDependency(bucket).reverse()
			: sortByDependency(bucket)
	})

	// Anything with an unrecognised action type keeps its original position at the end
	// rather than being dropped on the floor.
	const unknown = actions.filter(
		(action) => !ORDERED_ACTION_TYPES.includes(action.actionType),
	)

	actions.length = 0
	actions.push(...sorted, ...unknown)
	return actions
}

/**
 * Kahn's algorithm, taking the earliest ready node each round so the result is stable:
 * actions that do not constrain each other keep their input order.
 *
 * Dependencies on tables outside this bucket are ignored -- they are satisfied by an
 * earlier bucket, or by a migration that already ran.
 */
function sortByDependency(actions: IAction[]): IAction[] {
	const indexesByTable = new Map<string, number[]>()
	actions.forEach((action, index) => {
		const existing = indexesByTable.get(action.tableName)
		if (existing) {
			existing.push(index)
		} else {
			indexesByTable.set(action.tableName, [index])
		}
	})

	const outstanding = actions.map(
		(action) =>
			new Set(
				action.depends
					.filter(
						(dependency) =>
							indexesByTable.has(dependency) &&
							dependency !== action.tableName,
					)
					.flatMap(
						(dependency) => indexesByTable.get(dependency) ?? [],
					),
			),
	)

	const emitted = new Array<boolean>(actions.length).fill(false)
	const result: IAction[] = []

	while (result.length < actions.length) {
		const readyIndex = outstanding.findIndex(
			(dependencies, index) => !emitted[index] && dependencies.size === 0,
		)

		// A cycle: nothing is ready, so fall back to input order for the remainder
		// rather than looping forever. Sequelize itself cannot create such a schema in
		// one pass either, so there is no correct order to find.
		if (readyIndex === -1) {
			actions.forEach((action, index) => {
				if (!emitted[index]) {
					emitted[index] = true
					result.push(action)
				}
			})
			break
		}

		emitted[readyIndex] = true
		result.push(actions[readyIndex])
		outstanding.forEach((dependencies) => dependencies.delete(readyIndex))
	}

	return result
}
