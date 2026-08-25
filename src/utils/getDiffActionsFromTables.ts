import { diff } from 'deep-diff'
import type { ITables } from '../constants'
import sortActions from './sortActions'

/* eslint-disable @typescript-eslint/no-explicit-any --
 * IAction is a union in all but name: `attributes` holds a whole schema for createTable
 * but a single column for addColumn, `options` is a column definition in one case and an
 * index option bag in another. Typing it precisely means splitting IAction into seven
 * interfaces, which is a larger refactor than this file warrants today.
 */
export interface IAction {
	actionType:
		| 'createTable'
		| 'addIndex'
		| 'addColumn'
		| 'dropTable'
		| 'removeColumn'
		| 'removeIndex'
		| 'changeColumn'
	tableName: string
	attributes?: any
	attributeName?: any
	options?: any
	columnName?: any
	fields?: any[]
	depends: string[]
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export default function getDiffActionsFromTables(
	previousStateTables: ITables,
	currentStateTables: ITables,
): IAction[] {
	const actions: IAction[] = []
	const difference = diff(previousStateTables, currentStateTables)
	if (difference === undefined) {
		return actions
	}

	difference.forEach((change) => {
		// deep-diff leaves `path` undefined when the two roots are replaced wholesale
		// rather than one of their properties changing. We always compare two table maps,
		// so such a diff names no table to act on and there is nothing to emit for it.
		if (!change.path) {
			return
		}
		const path = change.path

		// deep-diff types `lhs`/`rhs` as the root type it was given, but their actual
		// shape depends on how deep `path` goes: a whole table at depth 1, a column at
		// depth 3, one column property below that. The switch below discriminates on
		// path length instead, so the declared types would only get in the way.
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
		const lhs = (change as { lhs?: any }).lhs
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- see comment above
		const rhs = (change as { rhs?: any }).rhs

		switch (change.kind) {
			// add new
			case 'N':
				{
					// new table created
					if (path.length === 1) {
						const depends: string[] = []

						const tableName = rhs.tableName
						// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rhs is untyped, see above
						Object.values(rhs.schema).forEach((v: any) => {
							if (v.references) {
								depends.push(v.references.model)
							}
						})

						actions.push({
							actionType: 'createTable',
							tableName,
							attributes: rhs.schema,
							options: {},
							depends: depends,
						})

						// create indexes
						if (rhs.indexes) {
							for (const _i in rhs.indexes) {
								const copied = JSON.parse(
									JSON.stringify(rhs.indexes[_i]),
								)
								actions.push(
									Object.assign(
										{
											actionType: 'addIndex',
											tableName,
											depends: [tableName],
										},
										copied,
									),
								)
							}
						}
						break
					}

					const tableName = path[0]
					const depends = [tableName]

					if (path[1] === 'schema') {
						// if (path.length === 3) - new field
						if (path.length === 3) {
							// new field
							if (rhs && rhs.references) {
								depends.push(rhs.references.model)
							}
							actions.push({
								actionType: 'addColumn',
								tableName: tableName,
								attributeName: path[2],
								options: rhs,
								depends: depends,
							})
							break
						}

						// if (path.length > 3) - add new attribute to column (change col)
						if (path.length > 3) {
							if (path[1] === 'schema') {
								// new field attributes
								const options =
									currentStateTables[tableName].schema[
										path[2]
									]
								if (options.references) {
									depends.push(options.references.model)
								}

								actions.push({
									actionType: 'changeColumn',
									tableName: tableName,
									attributeName: path[2],
									options: options,
									depends: depends,
								})
								break
							}
						}
					}

					// new index
					if (path[1] === 'indexes') {
						const tableName = path[0]
						const copied = rhs
							? JSON.parse(JSON.stringify(rhs))
							: undefined
						const index = copied

						index.actionType = 'addIndex'
						index.tableName = tableName
						index.depends = [tableName]
						actions.push(index)
						break
					}
				}
				break

			// drop
			case 'D':
				{
					const tableName = path[0]

					if (path.length === 1) {
						// drop table
						const depends: string[] = []
						// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lhs is untyped, see above
						Object.values(lhs.schema).forEach((v: any) => {
							if (v.references) {
								depends.push(v.references.model)
							}
						})

						actions.push({
							actionType: 'dropTable',
							tableName: tableName,
							depends: depends,
						})
						break
					}

					if (path[1] === 'schema') {
						// if (path.length === 3) - drop field
						if (path.length === 3) {
							// drop column
							actions.push({
								actionType: 'removeColumn',
								tableName,
								columnName: path[2],
								depends: [tableName],
							})
							break
						}

						// if (path.length > 3) - drop attribute from column (change col)
						if (path.length > 3) {
							const depends = [tableName]
							// new field attributes
							const options =
								currentStateTables[tableName].schema[path[2]]
							if (options.references) {
								depends.push(options.references.model)
							}

							actions.push({
								actionType: 'changeColumn',
								tableName,
								attributeName: path[2],
								options,
								depends,
							})
							break
						}
					}

					if (path[1] === 'indexes') {
						actions.push({
							actionType: 'removeIndex',
							tableName,
							fields: lhs.fields,
							options: lhs.options,
							depends: [tableName],
						})
						break
					}
				}
				break

			// edit
			case 'E':
				{
					const tableName = path[0]
					const depends = [tableName]

					if (path[1] === 'schema') {
						// new field attributes
						const options =
							currentStateTables[tableName].schema[path[2]]
						if (options.references) {
							depends.push(options.references.model)
						}

						actions.push({
							actionType: 'changeColumn',
							tableName,
							attributeName: path[2],
							options,
							depends,
						})
					}
				}
				break

			// array change indexes
			case 'A':
				{
					console.log(
						'[Not supported] Array model changes! Problems are possible. Please, check result more carefully!',
					)
					console.log('[Not supported] Difference: ')
					console.log(JSON.stringify(change, null, 4))
				}
				break

			default:
				// code
				break
		}
	})
	const result = sortActions(actions)
	return result
}
