import { Sequelize } from 'sequelize-typescript'
import type { Model, ModelAttributeColumnOptions, ModelStatic } from 'sequelize'
import type { IColumnSnapshot, ITableSnapshot, ITables } from '../constants'
import readModelAttributes from '../adapters/readModelAttributes'
import readModelIndexes from '../adapters/readModelIndexes'
import reverseSequelizeColType from './reverseSequelizeColType'
import reverseSequelizeDefValueType from './reverseSequelizeDefValueType'
import parseIndex from './parseIndex'

/** Attribute keys copied verbatim from the model definition into the snapshot. */
const COPIED_ATTRIBUTE_KEYS = [
	'allowNull',
	'defaultValue',
	'unique',
	'primaryKey',
	'autoIncrement',
	'autoIncrementIdentity',
	'comment',
	'references',
	'onUpdate',
	'onDelete',
	'validate',
]

/**
 * Turns live models into the serializable table snapshot that the differ compares
 * against the previously stored one.
 */
export default function getTablesFromModels(
	sequelize: Sequelize,
	models: {
		[key: string]: ModelStatic<Model>
	},
) {
	const tables: ITables = {}

	for (const model of Object.values(models)) {
		tables[model.tableName] = {
			tableName: model.tableName,
			schema: buildSchema(sequelize, model),
			indexes: buildIndexes(model),
		}
	}

	return tables
}

function buildSchema(
	sequelize: Sequelize,
	model: ModelStatic<Model>,
): Record<string, IColumnSnapshot> {
	const attributes: {
		[key: string]: ModelAttributeColumnOptions
	} = readModelAttributes(model)

	const schema: Record<string, IColumnSnapshot> = {}

	for (const [column, attribute] of Object.entries(attributes)) {
		if (attribute.type === undefined) {
			console.log(
				`[Not supported] Skip column with undefined type ${model.name}:${column}`,
			)
			continue
		}

		const seqType: string = reverseSequelizeColType(
			sequelize,
			attribute.type,
		)
		if (seqType === 'Sequelize.VIRTUAL') {
			console.log(
				`[SKIP] Skip Sequelize.VIRTUAL column "${column}", defined in model "${model.name}"`,
			)
			continue
		}

		const rowAttribute: IColumnSnapshot = { seqType }

		const source = attribute as unknown as Record<string, unknown>
		const target = rowAttribute as unknown as Record<string, unknown>
		COPIED_ATTRIBUTE_KEYS.forEach((key) => {
			if (source[key] !== undefined) {
				target[key] = source[key]
			}
		})

		// Overwrites the raw value copied above with its reproducible form: a literal
		// stays a literal, while `DataType.NOW` or `fn(...)` becomes source code the
		// generated migration can evaluate.
		//
		// A `!= null` check, not a truthy one -- `@Default(false)` and `@Default(0)`
		// are real defaults and used to be dropped before ever reaching the reverser.
		if (attribute.defaultValue != null) {
			const defaultValue = reverseSequelizeDefValueType(
				attribute.defaultValue,
			)
			if (defaultValue.notSupported) {
				console.log(
					`[Not supported] Skip defaultValue of attribute ${model.name}:${column}`,
				)
				delete rowAttribute.defaultValue
			} else {
				rowAttribute.defaultValue = defaultValue
			}
		}

		schema[column] = rowAttribute
	}

	return schema
}

function buildIndexes(model: ModelStatic<Model>): ITableSnapshot['indexes'] {
	const indexesByHash: ITableSnapshot['indexes'] = {}

	readModelIndexes(model).forEach((index) => {
		const parsed = parseIndex(index)
		indexesByHash[`${parsed.hash}`] = parsed
		delete parsed.hash
	})

	return indexesByHash
}
