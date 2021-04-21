import {Sequelize} from "sequelize-typescript";
import * as beautify from "js-beautify";
import * as fs from "fs";
import {IMigrationState} from "./constants";
import {Model, ModelCtor, QueryInterface} from "sequelize/types";
import getTablesFromModels from "./utils/getTablesFromModels";
import getDiffActionsFromTables from "./utils/getDiffActionsFromTables";
import getMigration from "./utils/getMigration";
import createMigrationTable from "./utils/createMigrationTable";
import getLastMigrationState from "./utils/getLastMigrationState";
import writeMigration from "./utils/writeMigration";

export interface IMigrationOptions {
    /**
     * directory where migration file saved. We recommend that you specify this path to sequelize migration path.
     */
    outDir: string;
    /**
     * if true, it doesn't generate files but just prints result action.
     */
    preview?: boolean;
    /**
     * migration file name, default is "noname"
     */
    migrationName?: string;
    /**
     * comment of migration.
     */
    comment?: string;
    debug?: boolean;
}

export class SequelizeTypescriptMigration {
    /**
     * generates migration file including up, down code
     * after this, run 'npx sequelize-cli db:migrate'.
     * @param sequelize sequelize-typescript instance
     * @param options options
     */
    public static makeMigration = async (
        sequelize: Sequelize,
        options: IMigrationOptions
    ) => {
        options.preview = options.preview || false;
        if (fs.existsSync(options.outDir) === false) {
            return Promise.reject({
                msg: `${options.outDir} not exists. check path and if you did 'npx sequelize init' you must use path used in sequelize migration path`,
            });
        }
        await sequelize.authenticate();

        const models: {
            [key: string]: ModelCtor<Model>;
        } = sequelize.models;

        const queryInterface: QueryInterface = sequelize.getQueryInterface();

        await createMigrationTable(sequelize);
        const lastMigrationState = await getLastMigrationState(sequelize);

        const previousState: IMigrationState = {
            revision:
                lastMigrationState !== undefined ? lastMigrationState["revision"] : 0,
            version:
                lastMigrationState !== undefined ? lastMigrationState["version"] : 1,
            tables:
                lastMigrationState !== undefined ? lastMigrationState["tables"] : {},
        };
        const currentState: IMigrationState = {
            revision: previousState.revision + 1,
            tables: getTablesFromModels(sequelize, models),
        };

        const upActions = getDiffActionsFromTables(
            previousState.tables,
            currentState.tables
        );
        const downActions = getDiffActionsFromTables(
            currentState.tables,
            previousState.tables
        );

        const migration = getMigration(upActions);
        const tmp = getMigration(downActions);

        migration.commandsDown = tmp.commandsUp;

        if (migration.commandsUp.length === 0) {
            return Promise.resolve({msg: "success: no changes found"});
        }

        // log
        migration.consoleOut.forEach(v => {
            console.log(`[Actions] ${v}`);
        });
        if (options.preview) {
            console.log("Migration result:");
            console.log(beautify(`[ \n${migration.commandsUp.join(", \n")} \n];\n`));
            console.log("Undo commands:");
            console.log(
                beautify(`[ \n${migration.commandsDown.join(", \n")} \n];\n`)
            );
            return Promise.resolve({msg: "success without save"});
        }

        const info = await writeMigration(
            currentState,
            migration,
            options
        );

        console.log(
            `New migration to revision ${currentState.revision} has been saved to file '${info.filename}'`
        );

        // save current state, Ugly hack, see https://github.com/sequelize/sequelize/issues/8310
        const rows = [
            {
                revision: currentState.revision,
                name: info.info.name,
                state: JSON.stringify(currentState),
            },
        ];

        try {
            await queryInterface.bulkDelete("SequelizeMetaMigrations", {
                revision: currentState.revision,
            });
            await queryInterface.bulkInsert("SequelizeMetaMigrations", rows);

            console.log(`Use sequelize CLI:
  npx sequelize db:migrate --to ${info.revisionNumber}-${
                info.info.name
            }.js ${`--migrations-path=${options.outDir}`} `);

            return Promise.resolve({msg: "success"});
        } catch (err) {
            if (options.debug) console.error(err);
        }

        return Promise.resolve({msg: "success anyway.."});
    };
}
