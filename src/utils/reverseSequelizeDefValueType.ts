export interface IReversedDefaultValue {
	/** True when `value` is source code to evaluate rather than a literal. */
	internal?: boolean
	/** True when the default cannot be reproduced in a migration. */
	notSupported?: boolean
	value: unknown
}

export default function reverseSequelizeDefValueType(
	// A default can be any literal, a DataTypes instance, or a Sequelize fn() wrapper.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	defaultValue: any,
	prefix = 'Sequelize.',
): IReversedDefaultValue {
	// Guarded because the reads below all dereference `defaultValue`. A null default is
	// indistinguishable from no default for migration purposes, so it is reported rather
	// than crashing the run.
	if (defaultValue === null || defaultValue === undefined) {
		return { notSupported: true, value: '' }
	}

	if (typeof defaultValue.fn !== 'undefined') {
		return {
			internal: true,
			value: `${prefix}fn('${defaultValue.fn}')`,
		}
	}

	if (defaultValue.constructor.name == 'NOW') {
		return {
			internal: true,
			value: `${prefix}NOW`,
		}
	}

	if (defaultValue.constructor.name == 'UUIDV1') {
		return {
			internal: true,
			value: `${prefix}UUIDV1`,
		}
	}

	if (defaultValue.constructor.name == 'UUIDV4') {
		return {
			internal: true,
			value: `${prefix}UUIDV4`,
		}
	}

	if (typeof defaultValue === 'function') {
		return { notSupported: true, value: '' }
	}

	return { value: defaultValue }
}
