import beautify from 'js-beautify'
import * as fs from 'fs'
import * as path from 'path'
import removeCurrentRevisionMigrations from './removeCurrentRevisionMigrations'

/**
 * The module the generated migration requires at runtime. Sequelize v7 renames this to
 * '@sequelize/core', so keeping it as a constant makes that a one-line change.
 */
const SEQUELIZE_MODULE = 'sequelize'
export interface IMigrationCommands {
	commandsUp: string[]
	commandsDown: string[]
	consoleOut: string[]
}

export interface IWriteMigrationOptions {
	outDir: string
	migrationName?: string
	comment?: string
	keepFiles?: boolean
	verbose?: boolean
	debug?: boolean
}

export default async function writeMigration(
	revision: number,
	migration: IMigrationCommands,
	options: IWriteMigrationOptions,
) {
	removeCurrentRevisionMigrations(revision, options.outDir, options)

	const name = options.migrationName || 'noname'
	const comment = options.comment || ''
	let commands = `const migrationCommands = [ \n${migration.commandsUp.join(
		', \n',
	)} \n];\n`
	let commandsDown = `const rollbackCommands = [ \n${migration.commandsDown.join(
		', \n',
	)} \n];\n`

	const actions = ` * ${migration.consoleOut.join('\n * ')}`

	commands = beautify(commands)
	commandsDown = beautify(commandsDown)

	const info = {
		revision,
		name,
		created: new Date(),
		comment,
	}

	// The generated file is loaded by sequelize-cli, so it must be plain CommonJS that
	// runs on the consumer's Node -- not on ours. async/await is safe from Node 8.
	//
	// The previous shape (a recursive `next()` inside `new Promise`, plus a `pos: 0`
	// instance field) had two failure modes worth naming: a synchronous throw inside
	// `next` -- an unknown `command.fn`, say -- rejected nothing and hung forever, and
	// the shared `pos` meant a second `up()` call resumed instead of restarting.
	const template = `'use strict';

const Sequelize = require('${SEQUELIZE_MODULE}');

/**
 * Actions summary:
 *
${actions}
 *
 **/

const info = ${JSON.stringify(info, null, 4)};

${commands}

${commandsDown}

async function runCommands(queryInterface, commands) {
    for (let index = 0; index < commands.length; index++) {
        const command = commands[index];
        if (typeof queryInterface[command.fn] !== "function") {
            throw new Error(
                "[#" + index + "] unknown queryInterface method: " + command.fn
            );
        }
        console.log("[#" + index + "] execute: " + command.fn);
        await queryInterface[command.fn].apply(queryInterface, command.params);
    }
}

module.exports = {
    up: function(queryInterface, Sequelize) {
        return runCommands(queryInterface, migrationCommands);
    },
    down: function(queryInterface, Sequelize) {
        return runCommands(queryInterface, rollbackCommands);
    },
    info: info
};
`

	const revisionNumber = revision.toString().padStart(8, '0')

	const filename = path.join(
		options.outDir,
		`${
			revisionNumber +
			(name !== '' ? `-${name.replace(/[\s-]/g, '_')}` : '')
		}.js`,
	)

	fs.writeFileSync(filename, template)

	return { filename, info, revisionNumber }
}
