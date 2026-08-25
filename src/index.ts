import { Sequelize } from 'sequelize-typescript'
import beautify from 'js-beautify'
import * as fs from 'fs'
import { IMigrationState, ITables } from './constants'
import type { Model, ModelStatic, QueryInterface } from 'sequelize'
import getTablesFromModels from './utils/getTablesFromModels'
import getDiffActionsFromTables from './utils/getDiffActionsFromTables'
import getMigration from './utils/getMigration'
import createMigrationTable from './utils/createMigrationTable'
import getLastMigrationState from './utils/getLastMigrationState'
import writeMigration from './utils/writeMigration'

const STATE_TABLE = 'SequelizeMetaMigrations'

export interface IMigrationOptions {
	/**
	 * directory where migration file saved. We recommend that you specify this path to sequelize migration path.
	 */
	outDir: string
	/**
	 * if true, it doesn't generate files but just prints result action.
	 */
	preview?: boolean
	/**
	 * migration file name, default is "noname"
	 */
	migrationName?: string
	/**
	 * comment of migration.
	 */
	comment?: string
	debug?: boolean
}

/**
 * Outcome of a makeMigration run.
 *
 * Discriminated on `status` so callers can branch without matching on message strings,
 * and so "nothing to do" is an ordinary return value rather than a process exit.
 */
export type MigrationResult =
	| { status: 'no-changes' }
	| { status: 'preview'; up: string[]; down: string[] }
	| { status: 'written'; filename: string; revision: number }

export class SequelizeTypescriptMigration {
	/**
	 * generates migration file including up, down code
	 * after this, run 'npx sequelize-cli db:migrate'.
	 * @param sequelize sequelize-typescript instance
	 * @param options options
	 */
	public static makeMigration = async (
		sequelize: Sequelize,
		options: IMigrationOptions,
	): Promise<MigrationResult> => {
		const isPreviewOnly = options.preview ?? false

		if (fs.existsSync(options.outDir) === false) {
			throw new Error(
				`${options.outDir} not exists. check path and if you did 'npx sequelize init' you must use path used in sequelize migration path`,
			)
		}
		await sequelize.authenticate()

		const models: {
			[key: string]: ModelStatic<Model>
		} = sequelize.models

		const queryInterface: QueryInterface = sequelize.getQueryInterface()

		// A preview is meant to be read-only, so the bookkeeping tables are only created
		// on a run that will actually record state.
		if (!isPreviewOnly) {
			await createMigrationTable(sequelize)
		}
		const lastMigrationState = await getLastMigrationState(sequelize)

		// The stored snapshot is JSON read back out of the database, so it arrives
		// untyped. Missing fields fall back to the "nothing migrated yet" values.
		const storedState = lastMigrationState as IMigrationState | undefined

		const previousState: Required<IMigrationState> = {
			revision: storedState?.revision ?? 0,
			version: storedState?.version ?? 1,
			tables: storedState?.tables ?? ({} as ITables),
		}
		const currentState: Required<
			Pick<IMigrationState, 'revision' | 'tables'>
		> = {
			revision: previousState.revision + 1,
			tables: getTablesFromModels(sequelize, models),
		}

		const upActions = getDiffActionsFromTables(
			previousState.tables,
			currentState.tables,
		)
		const downActions = getDiffActionsFromTables(
			currentState.tables,
			previousState.tables,
		)

		const migration = getMigration(upActions)
		migration.commandsDown = getMigration(downActions).commandsUp

		if (migration.commandsUp.length === 0) {
			console.log('No changes found')
			return { status: 'no-changes' }
		}

		migration.consoleOut.forEach((action) => {
			console.log(`[Actions] ${action}`)
		})

		if (isPreviewOnly) {
			console.log('Migration result:')
			console.log(
				beautify(`[ \n${migration.commandsUp.join(', \n')} \n];\n`),
			)
			console.log('Undo commands:')
			console.log(
				beautify(`[ \n${migration.commandsDown.join(', \n')} \n];\n`),
			)
			return {
				status: 'preview',
				up: migration.commandsUp,
				down: migration.commandsDown,
			}
		}

		const info = await writeMigration(
			currentState.revision,
			migration,
			options,
		)

		console.log(
			`New migration to revision ${currentState.revision} has been saved to file '${info.filename}'`,
		)

		// Recording the snapshot is not optional: every later run diffs against it, so a
		// silent failure here would make the next migration re-emit changes that already
		// exist. See https://github.com/sequelize/sequelize/issues/8310 for why this is
		// stored in a table of our own rather than alongside SequelizeMeta.
		await queryInterface.bulkDelete(STATE_TABLE, {
			revision: currentState.revision,
		})
		await queryInterface.bulkInsert(STATE_TABLE, [
			{
				revision: currentState.revision,
				name: info.info.name,
				state: JSON.stringify(currentState),
			},
		])

		console.log(`Use sequelize CLI:
  npx sequelize db:migrate --to ${info.revisionNumber}-${info.info.name}.js --migrations-path=${options.outDir} `)

		return {
			status: 'written',
			filename: info.filename,
			revision: currentState.revision,
		}
	}
}
