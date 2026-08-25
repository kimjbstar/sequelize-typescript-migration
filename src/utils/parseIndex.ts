import type { IndexesOptions } from 'sequelize'
import * as crypto from 'crypto'

/** Index properties carried into the snapshot, in a fixed order. */
const COPIED_INDEX_KEYS = [
	'name',
	'type',
	'unique',
	'concurrently',
	'fields',
	'using',
	'operator',
	'where',
] as const

/** Options handed to queryInterface.addIndex when this index is created. */
export interface IParsedIndexOptions {
	/** The name of the index. */
	indexName?: string
	/** @todo UNIQUE|FULLTEXT|SPATIAL */
	indicesType?: string
	/** Parser to use for FULLTEXT columns. */
	parser?: string
}

export interface IParsedIndex {
	name?: string
	type?: string
	unique?: boolean
	concurrently?: boolean
	fields?: unknown[]
	using?: string
	operator?: string
	where?: unknown
	options: IParsedIndexOptions
	/**
	 * Identity of the index, used as its key in the snapshot. Removed from the value
	 * once it has been used as a key.
	 */
	hash?: string
}

export default function parseIndex(idx: IndexesOptions): IParsedIndex {
	const source = idx as Record<string, unknown>

	const copied: Record<string, unknown> = {}

	COPIED_INDEX_KEYS.forEach((key) => {
		if (source[key] !== undefined) {
			copied[key] = source[key]
		}
	})

	const result: IParsedIndex = { ...copied, options: {} }

	if (idx.name) {
		result.options.indexName = idx.name
	}

	if (idx.unique) {
		result.options.indicesType = 'UNIQUE'
	}

	if (idx.parser && idx.parser !== '') {
		result.options.parser = idx.parser
	}

	result.hash = hashIndex(result)

	return result
}

/**
 * Identity of an index, derived from what it actually does rather than from the shape of
 * the object that described it.
 *
 * Hashing `JSON.stringify(idx)` directly made the hash sensitive to key insertion order,
 * so reordering decorator options on a model -- a change with no effect on the database --
 * produced a new hash, and the differ read that as "drop this index and add another".
 * On a large table that is a genuine outage, not cosmetic churn.
 */
function hashIndex(index: IParsedIndex): string {
	const identity = {
		name: index.name ?? null,
		type: index.type ?? null,
		unique: index.unique ?? false,
		concurrently: index.concurrently ?? false,
		fields: normalizeFields(index.fields),
		using: index.using ?? null,
		operator: index.operator ?? null,
		where: index.where ?? null,
	}

	return crypto
		.createHash('sha1')
		.update(JSON.stringify(identity))
		.digest('hex')
}

/**
 * Field order is part of an index's meaning -- (a, b) and (b, a) are different indexes --
 * so it is preserved. Only the two spellings of a single field are collapsed: Sequelize
 * accepts both `'email'` and `{ name: 'email' }` and uses them interchangeably.
 */
function normalizeFields(fields: unknown[] | undefined): unknown[] {
	if (!fields) {
		return []
	}

	return fields.map((field) => {
		if (typeof field === 'string') {
			return describeField({ name: field })
		}
		if (field && typeof field === 'object') {
			return describeField(field as Record<string, unknown>)
		}
		return field
	})
}

/** Both field spellings reduced to the same four properties. */
function describeField(field: Record<string, unknown>) {
	return {
		name: field.name ?? null,
		order: field.order ?? null,
		length: field.length ?? null,
		collate: field.collate ?? null,
	}
}
