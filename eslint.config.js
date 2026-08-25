const js = require('@eslint/js')
const tseslint = require('typescript-eslint')
const eslintConfigPrettier = require('eslint-config-prettier')

module.exports = tseslint.config(
	{
		ignores: ['dist/**', 'coverage/**', 'example/**'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	eslintConfigPrettier,
	{
		rules: {
			// `any` is load bearing in exactly two places, both of which read Sequelize
			// internals whose declared types are narrower than the runtime: the DataType
			// option bags in reverseSequelizeColType, and deep-diff's lhs/rhs. Those carry
			// an inline disable with the reason; everywhere else this is an error.
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_' },
			],
			// Stated explicitly rather than inherited. This rule moved into
			// js.configs.recommended at some point and the local install and CI disagreed
			// about whether it was on -- CI failed a lint that passed locally. Pinning it
			// here means both see the same rule set.
			'preserve-caught-error': 'error',
		},
	},
)
