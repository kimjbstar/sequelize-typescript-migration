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

/**
 * The database column an attribute maps to.
 *
 * These differ whenever a model sets `underscored: true` or a column's `field` option:
 * the attribute is `firstName` while the column is `first_name`. Migrations have to name
 * the column, not the attribute -- generating the attribute name produces a table whose
 * columns the model cannot find.
 *
 * Sequelize has already worked this out and stores it on the attribute, in both v6 and
 * v7, so there is nothing to infer here and no naming-convention option to expose.
 */
export function getColumnName(
	attribute: ModelAttributeColumnOptions,
	attributeName: string,
): string {
	return (attribute as { field?: string }).field ?? attributeName
}

/** Attribute name to column name, for translating index field lists. */
export function buildColumnNameMap(
	attributes: Record<string, ModelAttributeColumnOptions>,
): Map<string, string> {
	return new Map(
		Object.entries(attributes).map(([name, attribute]) => [
			name,
			getColumnName(attribute, name),
		]),
	)
}
