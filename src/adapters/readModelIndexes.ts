import type { IndexesOptions, Model, ModelStatic } from 'sequelize'

/**
 * Reads a model's index definitions.
 *
 * `options.indexes` is documented as the pre-normalization list, but Sequelize mutates
 * those entries in place while building `_indexes`, so generated names (e.g. the
 * "users_nickname" it invents for an unnamed index) are visible here too -- verified
 * against v5 and v6. That means the public option bag is enough and the private
 * `_indexes` is not worth depending on.
 *
 * In v7 this becomes `modelDefinition.getIndexes()`.
 */
export default function readModelIndexes(
	model: ModelStatic<Model>,
): readonly IndexesOptions[] {
	return model.options.indexes ?? []
}
