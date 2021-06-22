import { Sequelize } from "sequelize-typescript";
export default async function getLastMigrationState(sequelize: Sequelize) {
  const [
    lastExecutedMigration,
  ] = await sequelize.query(
    'SELECT name FROM "SequelizeMeta" ORDER BY name desc limit 1',
    { type: "SELECT" }
  );

  const lastRevision: number =
    lastExecutedMigration !== undefined
      ? lastExecutedMigration["name"].split("-")[0]
      : -1;

  const [
    lastMigration,
  ] = await sequelize.query(
    `SELECT state FROM "SequelizeMetaMigrations" where revision = '${lastRevision}'`,
    { type: "SELECT" }
  );
  if(lastMigration)
    return typeof lastMigration["state"] === 'string' ? JSON.parse(lastMigration["state"]) : lastMigration["state"];
  return undefined;
}
