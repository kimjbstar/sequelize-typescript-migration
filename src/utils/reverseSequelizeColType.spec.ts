import { DataTypes } from 'sequelize'
import { Sequelize } from 'sequelize-typescript'
import reverseSequelizeColType from './reverseSequelizeColType'

/**
 * These tests pin down what the type reverser produces *today*, bugs included.
 * Cases known to be wrong are marked `BUG:` with what the output should be -- they are
 * deliberately asserted at the broken value so that the fix shows up as an intentional
 * test change rather than a silent behaviour drift.
 *
 * No database, and no Sequelize instance, is involved: the function takes a `sequelize`
 * argument but never reads it (see the last describe block), and never calls `toSql()`.
 */

// The signature demands a Sequelize, the implementation never touches it.
const noSequelize = null as unknown as Sequelize

/**
 * Sequelize's type definitions are narrower than its runtime in a couple of places:
 * `.BINARY` is not declared on the STRING/CHAR constructors, and the numeric types only
 * declare an options-object overload even though `DOUBLE(11, 2)` works. These helpers
 * keep those casts in one spot instead of scattering them through the cases below.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dt = DataTypes as any

const instantiate = (type: unknown) =>
	typeof type === 'function' ? new (type as new () => unknown)() : type

const reverse = (type: unknown) =>
	reverseSequelizeColType(noSequelize, instantiate(type))

describe('reverseSequelizeColType', () => {
	describe.each([
		['STRING', DataTypes.STRING, 'Sequelize.STRING'],
		['STRING(50)', DataTypes.STRING(50), 'Sequelize.STRING(50)'],
		['STRING.BINARY', dt.STRING.BINARY, 'Sequelize.STRING.BINARY'],
		['CHAR', DataTypes.CHAR, 'Sequelize.CHAR'],
		['TEXT', DataTypes.TEXT, 'Sequelize.TEXT'],
		['INTEGER', DataTypes.INTEGER, 'Sequelize.INTEGER'],
		['INTEGER(11)', dt.INTEGER(11), 'Sequelize.INTEGER(11)'],
		[
			'INTEGER.UNSIGNED',
			DataTypes.INTEGER.UNSIGNED,
			'Sequelize.INTEGER.UNSIGNED',
		],
		[
			'INTEGER.ZEROFILL',
			DataTypes.INTEGER.ZEROFILL,
			'Sequelize.INTEGER.ZEROFILL',
		],
		['BIGINT', DataTypes.BIGINT, 'Sequelize.BIGINT'],
		['TINYINT', DataTypes.TINYINT, 'Sequelize.TINYINT'],
		['DECIMAL(10,2)', DataTypes.DECIMAL(10, 2), 'Sequelize.DECIMAL(10,2)'],
		['DATE', DataTypes.DATE, 'Sequelize.DATE'],
		['DATEONLY', DataTypes.DATEONLY, 'Sequelize.DATEONLY'],
		['BOOLEAN', DataTypes.BOOLEAN, 'Sequelize.BOOLEAN'],
		['TIME', DataTypes.TIME, 'Sequelize.TIME'],
		['UUID', DataTypes.UUID, 'Sequelize.UUID'],
		['JSONB', DataTypes.JSONB, 'Sequelize.JSONB'],
		['GEOMETRY', DataTypes.GEOMETRY, 'Sequelize.GEOMETRY'],
		["ENUM('a','b')", DataTypes.ENUM('a', 'b'), "Sequelize.ENUM('a', 'b')"],
		['VIRTUAL', DataTypes.VIRTUAL, 'Sequelize.VIRTUAL'],
	])('%s', (_label, dataType, expected) => {
		it(`"${expected}" 로 변환한다`, () => {
			expect(reverse(dataType)).toBe(expected)
		})
	})

	describe('composite types', () => {
		// regression test for the ARRAY/RANGE infinite recursion: both branches extracted the
		// inner type into a local and then recursed on `attrType` itself, so any Postgres
		// ARRAY or RANGE column blew the stack instead of producing a type string.
		it('ARRAY는 내부 타입까지 펼쳐서 변환한다', () => {
			expect(reverse(DataTypes.ARRAY(DataTypes.STRING))).toBe(
				'Sequelize.ARRAY(Sequelize.STRING)',
			)
		})

		it('RANGE는 subtype까지 펼쳐서 변환한다', () => {
			expect(reverse(DataTypes.RANGE(DataTypes.INTEGER))).toBe(
				'Sequelize.RANGE(Sequelize.INTEGER)',
			)
		})

		it('중첩 ARRAY도 스택 오버플로 없이 변환한다', () => {
			expect(
				reverse(DataTypes.ARRAY(DataTypes.ARRAY(DataTypes.INTEGER))),
			).toBe('Sequelize.ARRAY(Sequelize.ARRAY(Sequelize.INTEGER))')
		})
	})

	describe('length arguments', () => {
		// Regression: CHAR only inspected `options.binary` and threw the length away.
		it('CHAR(2)의 길이를 보존한다', () => {
			expect(reverse(DataTypes.CHAR(2))).toBe('Sequelize.CHAR(2)')
		})

		// Regression: keyword lengths were wrapped twice ("TEXT(('tiny'))").
		it("TEXT('tiny')를 괄호 하나로 감싼다", () => {
			expect(reverse(DataTypes.TEXT('tiny'))).toBe(
				"Sequelize.TEXT('tiny')",
			)
		})

		// Regression: BLOB never quoted its length, so the generated file contained a bare
		// identifier and threw `ReferenceError: long is not defined` when sequelize-cli
		// loaded it. A whole migration was unrunnable because of one BLOB column.
		it("BLOB('long')의 길이를 따옴표로 감싼다", () => {
			expect(reverse(DataTypes.BLOB('long'))).toBe(
				"Sequelize.BLOB('long')",
			)
		})

		// Regression: BLOB read `options.length.toLowerCase()` with no guard, so the most
		// natural declaration -- `@Column(DataType.BLOB)` -- crashed the whole run.
		it('길이 없는 BLOB도 죽지 않는다', () => {
			expect(reverse(DataTypes.BLOB)).toBe('Sequelize.BLOB')
		})

		it.each([
			['STRING(50)', DataTypes.STRING(50), 'Sequelize.STRING(50)'],
			['DATE(6)', DataTypes.DATE(6), 'Sequelize.DATE(6)'],
			[
				"TEXT('medium')",
				DataTypes.TEXT('medium'),
				"Sequelize.TEXT('medium')",
			],
		])('%s를 "%s"로 변환한다', (_label, dataType, expected) => {
			expect(reverse(dataType)).toBe(expected)
		})
	})

	describe('previously unsupported types', () => {
		// Regression: each of these fell through the name lookup and came back as VIRTUAL,
		// which the caller then skipped -- so the column vanished from the migration with
		// no error. DataTypes.JSON is `class JSONTYPE`; DOUBLE/FLOAT/REAL were simply
		// absent from the numeric list.
		it.each([
			['JSON', DataTypes.JSON, 'Sequelize.JSON'],
			['DOUBLE', DataTypes.DOUBLE, 'Sequelize.DOUBLE'],
			['FLOAT', DataTypes.FLOAT, 'Sequelize.FLOAT'],
			['REAL', DataTypes.REAL, 'Sequelize.REAL'],
			['TSVECTOR', DataTypes.TSVECTOR, 'Sequelize.TSVECTOR'],
		])('%s를 "%s"로 변환한다', (_label, dataType, expected) => {
			expect(reverse(dataType)).toBe(expected)
		})

		it.each([
			['DOUBLE(11,2)', dt.DOUBLE(11, 2), 'Sequelize.DOUBLE(11,2)'],
			[
				'DOUBLE.UNSIGNED',
				DataTypes.DOUBLE.UNSIGNED,
				'Sequelize.DOUBLE.UNSIGNED',
			],
			['FLOAT(11,2)', dt.FLOAT(11, 2), 'Sequelize.FLOAT(11,2)'],
		])('%s의 옵션도 보존한다', (_label, dataType, expected) => {
			expect(reverse(dataType)).toBe(expected)
		})

		it('DOUBLE은 key가 아니라 클래스명을 쓴다', () => {
			// DataTypes.DOUBLE reports `key === 'DOUBLE PRECISION'`, which is valid SQL but
			// not a valid `Sequelize.<name>` expression -- rendering from the key would emit
			// `Sequelize.DOUBLE PRECISION` and produce a syntax error in the migration.
			expect(reverse(DataTypes.DOUBLE)).not.toContain(' ')
		})
	})

	describe('unsupported types are fatal', () => {
		// Returning a VIRTUAL placeholder is what made columns disappear silently. An
		// unrecognised type now stops the run instead of quietly dropping data.
		it('알 수 없는 타입은 예외를 던진다', () => {
			const unknownType = {
				constructor: { name: 'WEIRDTYPE' },
				options: {},
			}

			expect(() =>
				reverseSequelizeColType(noSequelize, unknownType),
			).toThrow(/Unsupported Sequelize data type "WEIRDTYPE"/)
		})

		it('예외 메시지가 조용한 컬럼 유실 위험을 설명한다', () => {
			expect(() =>
				reverseSequelizeColType(noSequelize, {
					constructor: { name: 'WEIRDTYPE' },
					options: {},
				}),
			).toThrow(/silently drop the column/)
		})

		it('VIRTUAL은 예외 없이 그대로 반환한다', () => {
			expect(reverse(DataTypes.VIRTUAL)).toBe('Sequelize.VIRTUAL')
		})
	})

	describe('type options and dialect-specific types', () => {
		it.each([
			['CHAR.BINARY', dt.CHAR.BINARY, 'Sequelize.CHAR.BINARY'],
			['DECIMAL()', DataTypes.DECIMAL, 'Sequelize.DECIMAL'],
			['DECIMAL(10)', DataTypes.DECIMAL(10), 'Sequelize.DECIMAL(10)'],
			['DATE(6)', DataTypes.DATE(6), 'Sequelize.DATE(6)'],
			[
				'MEDIUMINT.UNSIGNED',
				DataTypes.MEDIUMINT.UNSIGNED,
				'Sequelize.MEDIUMINT.UNSIGNED',
			],
			[
				'BIGINT(20).ZEROFILL',
				dt.BIGINT(20).ZEROFILL,
				'Sequelize.BIGINT(20).ZEROFILL',
			],
			['SMALLINT', DataTypes.SMALLINT, 'Sequelize.SMALLINT'],
		])('%s를 "%s"로 변환한다', (_label, dataType, expected) => {
			expect(reverse(dataType)).toBe(expected)
		})

		it.each([
			['HSTORE', DataTypes.HSTORE, 'Sequelize.HSTORE'],
			['CITEXT', DataTypes.CITEXT, 'Sequelize.CITEXT'],
			['INET', DataTypes.INET, 'Sequelize.INET'],
			['CIDR', DataTypes.CIDR, 'Sequelize.CIDR'],
			['MACADDR', DataTypes.MACADDR, 'Sequelize.MACADDR'],
			['UUIDV1', DataTypes.UUIDV1, 'Sequelize.UUIDV1'],
			['UUIDV4', DataTypes.UUIDV4, 'Sequelize.UUIDV4'],
			['JSONB', DataTypes.JSONB, 'Sequelize.JSONB'],
		])(
			'Postgres 전용 타입 %s를 "%s"로 변환한다',
			(_label, dataType, expected) => {
				expect(reverse(dataType)).toBe(expected)
			},
		)

		describe('spatial types', () => {
			it.each([
				['GEOMETRY', DataTypes.GEOMETRY, 'Sequelize.GEOMETRY'],
				[
					"GEOMETRY('POINT')",
					DataTypes.GEOMETRY('POINT'),
					"Sequelize.GEOMETRY('POINT')",
				],
				[
					"GEOMETRY('POINT', 4326)",
					DataTypes.GEOMETRY('POINT', 4326),
					"Sequelize.GEOMETRY('POINT',4326)",
				],
				['GEOGRAPHY', DataTypes.GEOGRAPHY, 'Sequelize.GEOGRAPHY'],
				[
					"GEOGRAPHY('POINT', 4326)",
					DataTypes.GEOGRAPHY('POINT', 4326),
					"Sequelize.GEOGRAPHY('POINT',4326)",
				],
			])('%s를 "%s"로 변환한다', (_label, dataType, expected) => {
				expect(reverse(dataType)).toBe(expected)
			})

			it('SRID 없는 GEOMETRY는 타입만 넣는다', () => {
				expect(reverse(DataTypes.GEOMETRY('POLYGON'))).not.toContain(
					',',
				)
			})
		})
	})

	describe('prefix option', () => {
		it('prefix를 바꾸면 결과 문자열의 접두사도 바뀐다', () => {
			expect(
				reverseSequelizeColType(
					noSequelize,
					DataTypes.STRING(10),
					'DataTypes.',
				),
			).toBe('DataTypes.STRING(10)')
		})

		it('ARRAY 내부 타입에도 같은 prefix가 전파된다', () => {
			expect(
				reverseSequelizeColType(
					noSequelize,
					DataTypes.ARRAY(DataTypes.STRING),
					'DataTypes.',
				),
			).toBe('DataTypes.ARRAY(DataTypes.STRING)')
		})
	})

	describe('sequelize argument', () => {
		// Documents why the adapter refactor can drop this parameter: it is dead weight.
		it('sequelize 인자를 읽지 않으므로 null이어도 동작한다', () => {
			expect(
				reverseSequelizeColType(noSequelize, DataTypes.STRING(5)),
			).toBe('Sequelize.STRING(5)')
		})
	})
})
