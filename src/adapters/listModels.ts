import type { Model, ModelStatic } from 'sequelize'
import type { Sequelize } from 'sequelize-typescript'
import { getSequelizeMajor } from './version'

/**
 * Every model registered on the instance.
 *
 * v6 exposes `sequelize.models` as a plain object keyed by model name; v7 replaced it
 * with a `ModelSetView`, which is iterable but has no enumerable properties -- so
 * `Object.values()` on it silently returns an empty array rather than failing.
 */
export default function listModels(
	sequelize: Sequelize,
	models?: unknown,
): ModelStatic<Model>[] {
	const source = models ?? sequelize.models

	if (getSequelizeMajor(sequelize) === 7) {
		return [...(source as Iterable<ModelStatic<Model>>)]
	}

	// Callers may pass an array directly (the CLI and tests do); Object.values on an
	// array yields its elements, so this covers both shapes.
	return Object.values(source as Record<string, ModelStatic<Model>>)
}
