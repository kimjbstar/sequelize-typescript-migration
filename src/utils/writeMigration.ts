import * as beautify from "js-beautify";
import * as fs from "fs";
import * as path from "path";
import removeCurrentRevisionMigrations from "./removeCurrentRevisionMigrations";
export default async function writeMigration(revision, migration, options) {
  await removeCurrentRevisionMigrations(revision, options.outDir, options);

  const name = options.migrationName || "noname";
  const comment = options.comment || "";
  let commands = `var migrationCommands = [ \n${migration.commandsUp.join(
    ", \n"
  )} \n];\n`;
  let commandsDown = `var rollbackCommands = [ \n${migration.commandsDown.join(
    ", \n"
  )} \n];\n`;

  const actions = ` * ${migration.consoleOut.join("\n * ")}`;

  commands = beautify(commands);
  commandsDown = beautify(commandsDown);

  const info = {
    revision,
    name,
    created: new Date(),
    comment,
  };

  const template = `'use strict';

var Sequelize = require('sequelize');

/**
 * Actions summary:
 *
${actions}
 *
 **/

var info = ${JSON.stringify(info, null, 4)};

${commands}

${commandsDown}

module.exports = {
    pos: 0,
    up: function(queryInterface, Sequelize)
    {
        var index = this.pos;
        return new Promise(function(resolve, reject) {
            function next() {
                if (index < migrationCommands.length)
                {
                    let command = migrationCommands[index];
                    console.log("[#"+index+"] execute: " + command.fn);
                    index++;
                    queryInterface[command.fn].apply(queryInterface, command.params).then(next, reject);
                }
                else
                    resolve();
            }
            next();
        });
    },
    down: function(queryInterface, Sequelize)
    {
        var index = this.pos;
        return new Promise(function(resolve, reject) {
            function next() {
                if (index < rollbackCommands.length)
                {
                    let command = rollbackCommands[index];
                    console.log("[#"+index+"] execute: " + command.fn);
                    index++;
                    queryInterface[command.fn].apply(queryInterface, command.params).then(next, reject);
                }
                else
                    resolve();
            }
            next();
        });
    },
    info: info
};
`;

  const revisionNumber = revision.toString().padStart(8, "0");

  const filename = path.join(
    options.outDir,
    `${
      revisionNumber + (name !== "" ? `-${name.replace(/[\s-]/g, "_")}` : "")
    }.js`
  );

  fs.writeFileSync(filename, template);

  return { filename, info, revisionNumber };
}
