import type { IParsedIndex } from './utils/parseIndex'
import type { IReversedDefaultValue } from './utils/reverseSequelizeDefValueType'

/**
 * One column, described in a form that can be stored as JSON and rendered back into
 * migration source.
 */
export interface IColumnSnapshot {
	/** Source expression that recreates the column type, e.g. "Sequelize.STRING(255)". */
	seqType: string
	defaultValue?: IReversedDefaultValue
	allowNull?: boolean
	unique?: boolean | string
	primaryKey?: boolean
	autoIncrement?: boolean
	autoIncrementIdentity?: boolean
	comment?: string
	references?: { model?: string; key?: string }
	onUpdate?: string
	onDelete?: string
	validate?: unknown
}

export interface ITableSnapshot {
	tableName: string
	schema: Record<string, IColumnSnapshot>
	/** Keyed by the index's content hash, as produced by parseIndex. */
	indexes: Record<string, IParsedIndex>
}

/** Every table, keyed by table name. */
export type ITables = Record<string, ITableSnapshot>

export interface IMigrationState {
	revision?: number
	version?: number
	tables: ITables
}
