import * as beautify from "js-beautify";
import * as fs from "fs";
import * as path from "path";
import removeCurrentRevisionMigrations from "./removeCurrentRevisionMigrations";

export default async function writeMigration(currentState, migration, options) {
    await removeCurrentRevisionMigrations(currentState.revision, options.outDir, options);

    const name = options.migrationName || "noname";
    const comment = options.comment || "";


    let myState = JSON.stringify(currentState);
    const searchRegExp = /'/g;
    const replaceWith = "\\'";
    myState = myState.replace(searchRegExp, replaceWith);

    const versionCommands = `
      {
        fn: "createTable",
        params: [
          "SequelizeMetaMigrations",
          {
            "revision": {
              "primaryKey": true,
              "type": Sequelize.UUID
            },
            "name": {
              "allowNull": false,
              "type": Sequelize.STRING
            },
            "state": {
              "allowNull": false,
              "type": Sequelize.JSON
            },
          },
          {}
        ]
      },
       {
        fn: "bulkDelete",
        params: [
          "SequelizeMetaMigrations",
          [{
            revision: info.revision
          }],
          {}
        ]
      },
      {
        fn: "bulkInsert",
        params: [
          "SequelizeMetaMigrations",
          [{
            revision: info.revision,
            name: info.name,
            state: '${myState}'
          }],
          {}
        ]
      },
    `

    const versionDownCommands = `
    {
      fn: "bulkDelete",
      params: [
        "SequelizeMetaMigrations",
        [{
          revision: info.revision,
        }],
        {}
      ]
    },
 `;


    let commands = `var migrationCommands = [\n${versionCommands}\n\n \n${migration.commandsUp.join(", \n")} \n];\n`;
    let commandsDown = `var rollbackCommands = [\n${versionDownCommands}\n\n \n${migration.commandsDown.join(", \n")} \n];\n`;


    const actions = ` * ${migration.consoleOut.join("\n * ")}`;

    commands = beautify(commands);
    commandsDown = beautify(commandsDown);

    const info = {
        revision: currentState.revision,
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

    const revisionNumber = currentState.revision.toString().padStart(8, "0");

    const filename = path.join(
        options.outDir,
        `${
            revisionNumber + (name !== "" ? `-${name.replace(/[\s-]/g, "_")}` : "")
        }.js`
    );

    fs.writeFileSync(filename, template);

    return {filename, info, revisionNumber};
}
