import type { Model, ModelAttributeColumnOptions, ModelStatic } from 'sequelize'

/**
 * Reads a model's attribute definitions.
 *
 * Isolated here because this is the single sharpest edge in the Sequelize v7 upgrade:
 * `rawAttributes` is deprecated in v6 and *throws* in v7, where the replacement is
 * `Model.modelDefinition.attributes`. Keeping the access in one place means that
 * migration is a one-line change rather than a hunt through the codebase.
 */
export default function readModelAttributes(
	model: ModelStatic<Model>,
): Record<string, ModelAttributeColumnOptions> {
	return model.getAttributes()
}
