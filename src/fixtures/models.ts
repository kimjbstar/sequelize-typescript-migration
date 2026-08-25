import {
	AllowNull,
	AutoIncrement,
	BelongsTo,
	Column,
	Comment,
	DataType,
	Default,
	ForeignKey,
	HasMany,
	Model,
	PrimaryKey,
	Table,
	Unique,
} from 'sequelize-typescript'

/**
 * Model fixtures for the unit and golden tests. Deliberately dense: every column exists
 * to exercise one branch of the type reverser or the differ.
 *
 * Loaded through `new Sequelize({ validateOnly: true, ... })`, which initialises models
 * without a driver or a connection.
 *
 * Note on foreign keys: `@ForeignKey` alone does NOT populate `rawAttributes.references`.
 * The association decorator (`@BelongsTo` / `@HasMany`) is what wires it up, so both are
 * required for the differ to see a dependency.
 */

@Table({
	tableName: 'organizations',
	indexes: [{ name: 'idx_org_slug', fields: ['slug'], unique: true }],
})
export class Organization extends Model {
	@PrimaryKey
	@AutoIncrement
	@Column(DataType.INTEGER)
	declare id: number

	@AllowNull(false)
	@Unique
	@Column(DataType.STRING(100))
	declare name: string

	@AllowNull(false)
	@Column(DataType.STRING(50))
	declare slug: string

	@HasMany(() => User)
	declare users: User[]
}

/**
 * Exercises the column-name mapping: `underscored: true` means every attribute maps to a
 * snake_case column, and migrations have to name the column.
 */
@Table({
	tableName: 'audit_entries',
	underscored: true,
	timestamps: true,
	indexes: [{ name: 'idx_audit_actor', fields: ['actorName'] }],
})
export class AuditEntry extends Model {
	@PrimaryKey
	@AutoIncrement
	@Column(DataType.INTEGER)
	declare id: number

	@AllowNull(false)
	@Column(DataType.STRING(120))
	declare actorName: string

	@Column(DataType.STRING(40))
	declare eventType: string

	// An explicit field name, which has the same effect without `underscored`.
	@Column({ type: DataType.STRING(200), field: 'raw_payload' })
	declare payload: string
}

@Table({
	tableName: 'users',
	// One named index and one unnamed one: Sequelize fills in "users_nickname" for the
	// latter, in both `options.indexes` and `_indexes`.
	indexes: [
		{ name: 'idx_users_email', fields: ['email'], unique: true },
		{ fields: ['nickname'] },
	],
})
export class User extends Model {
	@PrimaryKey
	@AutoIncrement
	@Column(DataType.INTEGER)
	declare id: number

	@ForeignKey(() => Organization)
	@AllowNull(false)
	@Column(DataType.INTEGER)
	declare organizationId: number

	@BelongsTo(() => Organization)
	declare organization: Organization

	@AllowNull(false)
	@Column(DataType.STRING(255))
	declare email: string

	@Comment('display name')
	@Column(DataType.STRING)
	declare nickname: string

	// Default handling. `false` and `0` are the cases a truthy guard silently drops.
	@Default(false)
	@Column(DataType.BOOLEAN)
	declare isActive: boolean

	@Default(0)
	@Column(DataType.INTEGER)
	declare loginCount: number

	@Default('member')
	@Column(DataType.STRING(20))
	declare role: string

	@Default(DataType.NOW)
	@Column(DataType.DATE)
	declare joinedAt: Date

	@Column(DataType.ENUM('free', 'pro', 'enterprise'))
	declare plan: string

	@Column(DataType.DECIMAL(10, 2))
	declare balance: number

	@Column(DataType.TEXT)
	declare bio: string

	@Column(DataType.BIGINT)
	declare externalId: number

	// Types the reverser fails to recognise today: they degrade to VIRTUAL and then get
	// dropped from the schema entirely.
	@Column(DataType.JSON)
	declare preferences: object

	@Column(DataType.DOUBLE)
	declare score: number
}
