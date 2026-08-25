import { Sequelize } from 'sequelize-typescript'
import getTablesFromModels from './getTablesFromModels'
import { AuditEntry, Organization, User } from '../fixtures/models'

/**
 * `validateOnly: true` builds a fully initialised Sequelize against a dummy dialect: no
 * driver, no connection, no database. Everything this function reads (rawAttributes,
 * tableName, options.indexes) is populated exactly as it would be against a real one.
 */
const tablesOf = () => {
	const sequelize = new Sequelize({
		validateOnly: true,
		models: [Organization, User, AuditEntry],
	})
	return getTablesFromModels(sequelize, sequelize.models)
}

const userSchema = () => tablesOf()['users'].schema
const userIndexes = () =>
	Object.values(tablesOf()['users'].indexes) as Array<{
		name: string
		fields: unknown[]
		unique?: boolean
		options: Record<string, unknown>
	}>

describe('getTablesFromModels', () => {
	describe('table shape', () => {
		it('모델마다 테이블명을 키로 하는 항목을 만든다', () => {
			expect(Object.keys(tablesOf()).sort()).toEqual([
				'audit_entries',
				'organizations',
				'users',
			])
		})

		it('각 테이블은 tableName, schema, indexes를 가진다', () => {
			expect(Object.keys(tablesOf()['users']).sort()).toEqual([
				'indexes',
				'schema',
				'tableName',
			])
		})

		it('모델 클래스명이 아니라 테이블명을 키로 쓴다', () => {
			const tables = tablesOf()

			expect(tables['organizations'].tableName).toBe('organizations')
			expect(tables).not.toHaveProperty('Organization')
			expect(tables).not.toHaveProperty('User')
		})

		it('timestamps 컬럼도 스키마에 포함한다', () => {
			expect(Object.keys(userSchema())).toEqual(
				expect.arrayContaining(['createdAt', 'updatedAt']),
			)
		})
	})

	describe('column attributes', () => {
		it.each([
			['email', 'Sequelize.STRING(255)'],
			['nickname', 'Sequelize.STRING'],
			['bio', 'Sequelize.TEXT'],
			['externalId', 'Sequelize.BIGINT'],
			['balance', 'Sequelize.DECIMAL(10,2)'],
			['plan', "Sequelize.ENUM('free', 'pro', 'enterprise')"],
		])('%s의 타입을 %s 코드 문자열로 바꾼다', (columnName, expected) => {
			expect(userSchema()[columnName].seqType).toBe(expected)
		})

		it('primaryKey와 autoIncrement를 보존한다', () => {
			expect(userSchema()['id']).toMatchObject({
				primaryKey: true,
				autoIncrement: true,
			})
		})

		it('allowNull을 보존한다', () => {
			expect(userSchema()['email'].allowNull).toBe(false)
		})

		it('unique를 보존한다', () => {
			expect(
				tablesOf()['organizations'].schema['name'].unique,
			).toBeTruthy()
		})

		it('comment를 보존한다', () => {
			expect(userSchema()['nickname'].comment).toBe('display name')
		})
	})

	describe('foreign keys', () => {
		it('references를 참조 테이블과 키까지 보존한다', () => {
			expect(userSchema()['organizationId'].references).toEqual({
				model: 'organizations',
				key: 'id',
			})
		})

		it('onUpdate와 onDelete 규칙을 보존한다', () => {
			expect(userSchema()['organizationId']).toMatchObject({
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			})
		})
	})

	describe('indexes', () => {
		it('선언한 인덱스를 모두 잡는다', () => {
			expect(userIndexes()).toHaveLength(2)
		})

		it('이름을 지정한 인덱스의 indexName을 보존한다', () => {
			const named = userIndexes().find(
				(index) => index.name === 'idx_users_email',
			)

			expect(named?.options).toMatchObject({
				indexName: 'idx_users_email',
				indicesType: 'UNIQUE',
			})
		})

		it('이름을 지정하지 않은 인덱스도 Sequelize가 채운 이름을 갖는다', () => {
			// Worth pinning: `model.options.indexes` is documented as the pre-normalization
			// list, but Sequelize mutates those entries in place while building `_indexes`,
			// so the generated name is visible here too. The index name is NOT lost.
			const generated = userIndexes().find(
				(index) => index.name === 'users_nickname',
			)

			expect(generated).toBeDefined()
			expect(generated?.options).toMatchObject({
				indexName: 'users_nickname',
			})
		})

		it('인덱스는 해시를 키로 저장하고 해시 자체는 값에서 제거한다', () => {
			const indexes = tablesOf()['users'].indexes

			Object.entries(indexes).forEach(([key, value]) => {
				expect(key).toMatch(/^[0-9a-f]{40}$/)
				expect(value).not.toHaveProperty('hash')
			})
		})
	})

	describe('default values', () => {
		// Regression: the reversed default was written to `rowAttribute` and then the whole
		// object was reassigned to `{ seqType }` a few lines later, with "defaultValue"
		// absent from the copy list that followed. No @Default ever reached a migration.
		it('문자열 기본값을 리터럴로 보존한다', () => {
			expect(userSchema()['role'].defaultValue).toEqual({
				value: 'member',
			})
		})

		it('Sequelize.NOW 기본값을 실행 가능한 코드로 보존한다', () => {
			expect(userSchema()['joinedAt'].defaultValue).toEqual({
				internal: true,
				value: 'Sequelize.NOW',
			})
		})

		// Regression: the guard was a truthy check, so these two were dropped before the
		// reverser even ran -- `@Default(false)` silently became "no default at all".
		it.each([
			['isActive', false],
			['loginCount', 0],
		])('%s의 falsy 기본값(%s)도 보존한다', (columnName, expected) => {
			expect(userSchema()[columnName].defaultValue).toEqual({
				value: expected,
			})
		})

		it('기본값이 없는 컬럼에는 defaultValue를 넣지 않는다', () => {
			expect(userSchema()['email']).not.toHaveProperty('defaultValue')
		})

		it('기본값이 JSON으로 직렬화 가능하다', () => {
			// The whole snapshot is JSON.stringify'd into SequelizeMetaMigrations.state, so
			// a live DataTypes.NOW instance here would round-trip as `{}` and the next run
			// would see a spurious change.
			const schema = userSchema()

			expect(JSON.parse(JSON.stringify(schema))['joinedAt']).toEqual({
				seqType: 'Sequelize.DATE',
				defaultValue: { internal: true, value: 'Sequelize.NOW' },
			})
		})
	})

	describe('previously dropped column types', () => {
		// Regression: reverseSequelizeColType returned VIRTUAL for any class name it did not
		// recognise, and this function skips VIRTUAL columns. DataTypes.JSON is
		// `class JSONTYPE` and DOUBLE was missing from the numeric list, so both columns
		// disappeared from the migration with nothing raised.
		it.each([
			['preferences', 'Sequelize.JSON'],
			['score', 'Sequelize.DOUBLE'],
		])('%s 컬럼이 %s로 스키마에 남는다', (columnName, expected) => {
			expect(userSchema()[columnName].seqType).toBe(expected)
		})

		it('모든 선언 컬럼이 스키마에 들어간다', () => {
			expect(Object.keys(userSchema())).toEqual([
				'id',
				'organizationId',
				'email',
				'nickname',
				'isActive',
				'loginCount',
				'role',
				'joinedAt',
				'plan',
				'balance',
				'bio',
				'externalId',
				'preferences',
				'score',
				'createdAt',
				'updatedAt',
			])
		})
	})

	describe('column names', () => {
		// Regression: the snapshot was keyed by attribute name, so a model with
		// `underscored: true` generated a table of camelCase columns that the model itself
		// could then not find. Sequelize already resolves this onto `attribute.field`, in
		// both v6 and v7, so there is nothing to infer and no option to expose.
		const auditSchema = () => tablesOf()['audit_entries'].schema

		it('underscored 모델의 컬럼명을 snake_case로 쓴다', () => {
			expect(Object.keys(auditSchema())).toEqual([
				'id',
				'actor_name',
				'event_type',
				'raw_payload',
				'created_at',
				'updated_at',
			])
		})

		it('attribute 이름은 스키마에 남기지 않는다', () => {
			expect(auditSchema()).not.toHaveProperty('actorName')
			expect(auditSchema()).not.toHaveProperty('eventType')
		})

		it('명시적 field 지정도 컬럼명으로 쓴다', () => {
			// `payload` with field: 'raw_payload' -- the same bug without `underscored`.
			expect(auditSchema()['raw_payload'].seqType).toBe(
				'Sequelize.STRING(200)',
			)
			expect(auditSchema()).not.toHaveProperty('payload')
		})

		it('컬럼 속성은 그대로 보존한다', () => {
			expect(auditSchema()['actor_name']).toMatchObject({
				seqType: 'Sequelize.STRING(120)',
				allowNull: false,
			})
		})

		it('인덱스 필드도 컬럼명으로 바꾼다', () => {
			// An index declared on `actorName` has to be created on `actor_name`.
			const indexes = Object.values(
				tablesOf()['audit_entries'].indexes,
			) as Array<{ fields?: unknown[] }>

			expect(indexes).toHaveLength(1)
			expect(indexes[0].fields).toEqual(['actor_name'])
		})

		it('매핑이 없는 모델은 그대로 둔다', () => {
			// Without `underscored` or an explicit field, column name equals attribute name.
			expect(Object.keys(userSchema())).toContain('organizationId')
		})
	})

	describe('determinism', () => {
		it('같은 모델을 두 번 읽으면 같은 결과가 나온다', () => {
			expect(tablesOf()).toEqual(tablesOf())
		})

		it('컬럼 순서가 모델 선언 순서를 따른다', () => {
			const keys = Object.keys(userSchema())

			expect(keys.indexOf('id')).toBeLessThan(keys.indexOf('email'))
			expect(keys.indexOf('email')).toBeLessThan(keys.indexOf('plan'))
		})
	})
})
