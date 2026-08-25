import type { IndexesOptions, Model, ModelStatic } from 'sequelize'

/**
 * Reads a model's index definitions.
 *
 * v6: `options.indexes` is documented as the pre-normalization list, but Sequelize
 * mutates those entries in place while building `_indexes`, so generated names (e.g. the
 * "users_nickname" it invents for an unnamed index) are visible there too -- verified
 * against v5 and v6. The public option bag is enough and the private `_indexes` is not
 * worth depending on.
 *
 * v7: `options.indexes` is left empty and the built list moved to `getIndexes()`.
 * `_indexes` throws there, pointing at the same replacement.
 */
export default function readModelIndexes(
	model: ModelStatic<Model>,
): readonly IndexesOptions[] {
	const candidate = model as unknown as {
		getIndexes?: () => readonly IndexesOptions[]
		options?: { indexes?: readonly IndexesOptions[] }
	}

	if (typeof candidate.getIndexes === 'function') {
		return candidate.getIndexes()
	}

	return candidate.options?.indexes ?? []
}
