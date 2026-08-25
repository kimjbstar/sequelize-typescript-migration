import { Sequelize } from 'sequelize-typescript'

/**
 * Renders a Sequelize DataType instance back into the source expression that produces
 * it, e.g. `Sequelize.STRING(255)`. The result is written verbatim into the generated
 * migration, so it has to be valid, self-contained JavaScript.
 *
 * This is the only place that reads Sequelize's DataType internals (`constructor.name`,
 * `.options`, `.key`). Sequelize v7 rewrites those classes, so this file is the one that
 * has to change for a v7 port.
 *
 * `constructor.name` rather than `instanceof`: an `instanceof` check breaks when the
 * consumer's Sequelize is a different copy than ours, which peerDependencies discourage
 * but monorepos still produce.
 */

/**
 * Class names that differ from the DataTypes key used to construct them.
 * `DataTypes.JSON` is `class JSONTYPE`, because JSON is a reserved global.
 */
const CLASS_NAME_TO_TYPE_NAME: Record<string, string> = {
	JSONTYPE: 'JSON',
}

/** Types rendered as a bare name, with no options to reproduce. */
const SIMPLE_TYPE_NAMES = [
	'BOOLEAN',
	'CIDR',
	'CITEXT',
	'DATEONLY',
	'HSTORE',
	'INET',
	'JSON',
	'JSONB',
	'MACADDR',
	'NOW',
	'TIME',
	'TSVECTOR',
	'UUID',
	'UUIDV1',
	'UUIDV4',
]

/**
 * Numeric types sharing NUMBER's option bag (length, decimals, zerofill, unsigned).
 *
 * These are matched on class name, not on `.key`: DOUBLE reports its key as
 * "DOUBLE PRECISION", which is valid SQL but not a valid `Sequelize.<name>` expression.
 */
const NUMERIC_TYPE_NAMES = [
	'TINYINT',
	'SMALLINT',
	'MEDIUMINT',
	'INTEGER',
	'BIGINT',
	'FLOAT',
	'DOUBLE',
	'REAL',
]

/* eslint-disable @typescript-eslint/no-explicit-any --
 * These take live Sequelize DataType instances. Sequelize's own declarations describe
 * the constructors, not the instances' internal `.options` bags, so there is no exported
 * type that matches what this file reads. Reaching into them is this module's whole job.
 */
export default function reverseSequelizeColType(
	sequelize: Sequelize,
	attrType: any,
	prefix = 'Sequelize.',
): string {
	const typeName = getTypeName(attrType)
	const options = attrType.options ?? {}

	if (typeName === 'VIRTUAL') {
		return `${prefix}VIRTUAL`
	}

	if (typeName === 'CHAR') {
		if (options.binary) {
			return `${prefix}CHAR.BINARY`
		}
		return `${prefix}CHAR${renderLength(options.length)}`
	}

	if (typeName === 'STRING') {
		if (options.binary) {
			return `${prefix}STRING.BINARY`
		}
		return `${prefix}STRING${renderLength(options.length)}`
	}

	if (typeName === 'TEXT') {
		return `${prefix}TEXT${renderLength(options.length)}`
	}

	if (typeName === 'BLOB') {
		return `${prefix}BLOB${renderLength(options.length)}`
	}

	if (typeName === 'DATE') {
		return `${prefix}DATE${renderLength(options.length)}`
	}

	if (typeName === 'DECIMAL') {
		const params = [options.precision, options.scale].filter(
			(value) => value !== undefined && value !== null,
		)
		const postfix = params.length > 0 ? `(${params.join(',')})` : ''
		return `${prefix}DECIMAL${postfix}`
	}

	if (NUMERIC_TYPE_NAMES.includes(typeName)) {
		const params = [options.length, options.decimals].filter(
			(value) => value !== undefined && value !== null,
		)
		let postfix = params.length > 0 ? `(${params.join(',')})` : ''

		if (options.zerofill) {
			postfix += '.ZEROFILL'
		}
		if (options.unsigned) {
			postfix += '.UNSIGNED'
		}

		return `${prefix}${typeName}${postfix}`
	}

	if (typeName === 'ENUM') {
		return `${prefix}ENUM('${options.values.join("', '")}')`
	}

	if (typeName === 'GEOMETRY' || typeName === 'GEOGRAPHY') {
		return `${prefix}${typeName}${renderSpatialOptions(options)}`
	}

	// ARRAY ( PostgreSQL only )
	if (typeName === 'ARRAY') {
		// `attrType.type`, not `attrType.options.type`: the ARRAY constructor instantiates
		// the element type into `this.type`, while `options.type` can still hold the class
		// itself -- whose constructor.name is 'Function', not the data type name.
		const innerType = reverseSequelizeColType(
			sequelize,
			attrType.type,
			prefix,
		)
		return `${prefix}ARRAY(${innerType})`
	}

	// RANGE ( PostgreSQL only )
	if (typeName === 'RANGE') {
		// `options.subtype` is the only instantiated type RANGE exposes -- it has no
		// `this.type`, so reaching for one yields undefined and crashes on .constructor.
		const innerType = reverseSequelizeColType(
			sequelize,
			options.subtype,
			prefix,
		)
		return `${prefix}RANGE(${innerType})`
	}

	if (SIMPLE_TYPE_NAMES.includes(typeName)) {
		return `${prefix}${typeName}`
	}

	// Deliberately fatal. Returning a placeholder here is what used to make columns
	// vanish from generated migrations without a word: the caller skipped anything that
	// came back as VIRTUAL, so an unrecognised type silently dropped the column and the
	// data it would have held.
	throw new Error(
		`Unsupported Sequelize data type "${typeName}". ` +
			`It cannot be rendered into a migration, and skipping it would silently drop the column. ` +
			`Please open an issue at https://github.com/kimjbstar/sequelize-typescript-migration/issues`,
	)
}

function getTypeName(attrType: any): string {
	const className = attrType.constructor.name
	return CLASS_NAME_TO_TYPE_NAME[className] ?? className
}

/**
 * Renders a length argument, quoting it when it is a keyword such as 'tiny' or 'long'.
 * An unquoted keyword becomes a bare identifier in the generated file and throws
 * ReferenceError the moment sequelize-cli loads the migration.
 */
function renderLength(length: unknown): string {
	if (length === undefined || length === null) {
		return ''
	}
	if (typeof length === 'string') {
		return `('${length.toLowerCase()}')`
	}
	return `(${length})`
}

function renderSpatialOptions(options: any): string {
	if (options.type === undefined || options.type === null) {
		return ''
	}
	const parts = [`'${String(options.type).toUpperCase()}'`]
	if (options.srid !== undefined && options.srid !== null) {
		parts.push(String(options.srid))
	}
	return `(${parts.join(',')})`
}
/* eslint-enable @typescript-eslint/no-explicit-any */
