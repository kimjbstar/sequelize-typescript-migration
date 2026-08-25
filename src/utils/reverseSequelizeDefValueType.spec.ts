import { DataTypes, fn } from 'sequelize'
import reverseSequelizeDefValueType from './reverseSequelizeDefValueType'

/**
 * Sequelize declares NOW/UUIDV1/UUIDV4 as constructors that take no arguments and are
 * not meant to be newed directly, but that is exactly the shape a model's defaultValue
 * holds at runtime. One helper keeps the cast out of the cases below.
 */
const instantiate = (type: unknown) => new (type as new () => unknown)()

describe('reverseSequelizeDefValueType', () => {
	describe('sequelize-internal defaults', () => {
		it('fn()은 internal로 표시하고 재현 가능한 코드 문자열로 만든다', () => {
			expect(reverseSequelizeDefValueType(fn('NOW'))).toEqual({
				internal: true,
				value: "Sequelize.fn('NOW')",
			})
		})

		it.each([
			['NOW', DataTypes.NOW, 'Sequelize.NOW'],
			['UUIDV1', DataTypes.UUIDV1, 'Sequelize.UUIDV1'],
			['UUIDV4', DataTypes.UUIDV4, 'Sequelize.UUIDV4'],
		])('%s를 internal 상수로 변환한다', (_label, dataType, expected) => {
			expect(reverseSequelizeDefValueType(instantiate(dataType))).toEqual(
				{
					internal: true,
					value: expected,
				},
			)
		})

		it('prefix를 바꾸면 internal 상수의 접두사도 바뀐다', () => {
			expect(
				reverseSequelizeDefValueType(
					instantiate(DataTypes.NOW),
					'DataTypes.',
				),
			).toEqual({ internal: true, value: 'DataTypes.NOW' })
		})
	})

	describe('literal defaults', () => {
		it.each([
			['문자열', 'hello'],
			['숫자', 42],
			['0', 0],
			['false', false],
			['true', true],
		])('%s 리터럴은 그대로 통과시킨다', (_label, input) => {
			expect(reverseSequelizeDefValueType(input)).toEqual({
				value: input,
			})
		})
	})

	describe('unsupported defaults', () => {
		// Note the ordering trap: the `typeof defaultValue === 'function'` branch sits *after*
		// three `defaultValue.constructor.name` reads, so a plain function reaches it only
		// because Function's constructor is named 'Function' and misses all three.
		it('일반 함수는 notSupported로 표시한다', () => {
			expect(reverseSequelizeDefValueType(() => 1)).toEqual({
				notSupported: true,
				value: '',
			})
		})
	})

	describe('null-ish defaults', () => {
		// Regression: the first line dereferenced `defaultValue.fn` with no guard, so a null
		// default crashed the run instead of being reported. Note that getTablesFromModels
		// now uses a `!= null` check, so this path is mostly defensive.
		it.each([
			['null', null],
			['undefined', undefined],
		])('%s은 notSupported로 보고한다', (_label, input) => {
			expect(reverseSequelizeDefValueType(input)).toEqual({
				notSupported: true,
				value: '',
			})
		})
	})
})
