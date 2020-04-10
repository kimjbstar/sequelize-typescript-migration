import * as path from "path";

export interface IMigrationState {
  revision?: number;
  version?: number;
  tables: {};
}

export interface ISequelizeRc {
  config?: string;
  "models-path"?: string;
  "seeders-path"?: string;
  "migrations-path"?: string;
}

export const projectRootPath = process.cwd();
export const sequelizeRcPath = path.join(projectRootPath, ".sequelizerc");
