import type { Sequelize } from 'sequelize-typescript'

/**
 * Which major version of Sequelize an instance came from.
 *
 * Support for v7 is experimental: it is still alpha upstream, has no beta, and its APIs
 * have changed between alphas before. Everything that differs between the two is handled
 * in this directory so the rest of the codebase never branches on it.
 */
export type SequelizeMajor = 6 | 7

/**
 * Detected from `sequelize.models`, which is a plain object in v6 and a `ModelSetView`
 * in v7. Checking for a method on that view is cheap, needs no I/O, and does not touch
 * any of the properties v7 removed by throwing.
 */
export function getSequelizeMajor(sequelize: Sequelize): SequelizeMajor {
	const models = (sequelize as unknown as { models?: { getNames?: unknown } })
		.models

	return typeof models?.getNames === 'function' ? 7 : 6
}

/**
 * The module a generated migration should require, and the namespace its data type
 * expressions should be prefixed with.
 *
 * v7 removed the data type aliases from the Sequelize class -- `Sequelize.STRING` now
 * raises "use DataTypes.STRING" -- so a migration generated for v7 has to name the
 * namespace differently as well as import it from a different package.
 */
export function getMigrationRuntime(major: SequelizeMajor): {
	module: string
	prefix: string
	importStatement: string
} {
	if (major === 7) {
		return {
			module: '@sequelize/core',
			prefix: 'DataTypes.',
			importStatement:
				"const { DataTypes } = require('@sequelize/core');",
		}
	}

	return {
		module: 'sequelize',
		prefix: 'Sequelize.',
		importStatement: "const Sequelize = require('sequelize');",
	}
}
