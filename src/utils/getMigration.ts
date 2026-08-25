import type { IColumnSnapshot } from '../constants'
import type { IAction } from './getDiffActionsFromTables'
import type { IMigrationCommands } from './writeMigration'

export default function getMigration(actions: IAction[]): IMigrationCommands {
	const commandsUp: string[] = []
	const commandsDown: string[] = []
	const consoleOut: string[] = []

	for (const action of actions) {
		switch (action.actionType) {
			case 'createTable':
				{
					const resUp = `
{ fn: "createTable", params: [
"${action.tableName}",
${getAttributes(action.attributes)},
${JSON.stringify(action.options)}
] }`
					commandsUp.push(resUp)

					consoleOut.push(
						`createTable "${action.tableName}", deps: [${action.depends.join(
							', ',
						)}]`,
					)
				}
				break

			case 'dropTable':
				{
					const res = `{ fn: "dropTable", params: ["${action.tableName}"] }`
					commandsUp.push(res)

					consoleOut.push(`dropTable "${action.tableName}"`)
				}
				break

			case 'addColumn':
				{
					const resUp = `{ fn: "addColumn", params: [
    "${action.tableName}",
    "${action.attributeName}",
    ${propertyToStr(action.options)}
] }`

					commandsUp.push(resUp)

					consoleOut.push(
						`addColumn "${action.attributeName}" to table "${action.tableName}"`,
					)
				}
				break

			case 'removeColumn':
				{
					const res = `{ fn: "removeColumn", params: ["${action.tableName}", "${action.columnName}"] }`
					commandsUp.push(res)

					consoleOut.push(
						`removeColumn "${action.columnName}" from table "${action.tableName}"`,
					)
				}
				break

			case 'changeColumn':
				{
					const res = `{ fn: "changeColumn", params: [
    "${action.tableName}",
    "${action.attributeName}",
    ${propertyToStr(action.options)}
] }`
					commandsUp.push(res)

					consoleOut.push(
						`changeColumn "${action.attributeName}" on table "${action.tableName}"`,
					)
				}
				break

			case 'addIndex':
				{
					const res = `{ fn: "addIndex", params: [
    "${action.tableName}",
    ${JSON.stringify(action.fields)},
    ${JSON.stringify(action.options)}
] }`
					commandsUp.push(res)

					const nameOrAttrs =
						action.options &&
						action.options.indexName &&
						action.options.indexName != ''
							? `"${action.options.indexName}"`
							: JSON.stringify(action.fields)
					consoleOut.push(
						`addIndex ${nameOrAttrs} to table "${action.tableName}"`,
					)
				}
				break

			case 'removeIndex': {
				const nameOrAttrs =
					action.options &&
					action.options.indexName &&
					action.options.indexName != ''
						? `"${action.options.indexName}"`
						: JSON.stringify(action.fields)

				const res = `{ fn: "removeIndex", params: [
          "${action.tableName}",
          ${nameOrAttrs}
      ] }`
				commandsUp.push(res)

				consoleOut.push(
					`removeIndex ${nameOrAttrs} from table "${action.tableName}"`,
				)
				break
			}

			default:
			// code
		}
	}

	return { commandsUp, commandsDown, consoleOut }
}

const propertyToStr = (obj: IColumnSnapshot) => {
	// Iterated by key to render every property generically; each key's value differs.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const source = obj as unknown as Record<string, any>
	const rendered: string[] = []
	for (const key in source) {
		if (key === 'seqType') {
			// Emitted unquoted so it lands in the file as an expression, not a string.
			rendered.push(`"type": ${source[key]}`)
			continue
		}

		if (key === 'defaultValue') {
			if (source[key].internal) {
				rendered.push(`"defaultValue": ${source[key].value}`)
				continue
			}
			if (source[key].notSupported) {
				continue
			}

			rendered.push(renderProperty(key, source[key].value))
			continue
		}

		rendered.push(renderProperty(key, source[key]))
	}

	return `{ ${rendered
		.filter((v) => v !== '')
		.reverse()
		.join(', ')} }`
}

/** Renders one property as `"key":value`, borrowing JSON.stringify's escaping. */
const renderProperty = (key: string, value: unknown) =>
	JSON.stringify({ [key]: value }).slice(1, -1)

const getAttributes = (attrs: Record<string, IColumnSnapshot>) => {
	const rendered: string[] = []
	for (const attrName in attrs) {
		rendered.push(`      "${attrName}": ${propertyToStr(attrs[attrName])}`)
	}
	return ` { \n${rendered.join(', \n')}\n     }`
}
