import { QueryInterface } from "sequelize/types";
import {
  Sequelize,
  DataType as SequelizeTypescriptDataType
} from "sequelize-typescript";
export default async function createMigrationTable(sequelize: Sequelize) {
  const queryInterface: QueryInterface = sequelize.getQueryInterface();
  await queryInterface.createTable("SequelizeMeta", {
    name: {
      type: SequelizeTypescriptDataType.STRING,
      allowNull: false,
      unique: true,
      primaryKey: true
    }
  });
  await queryInterface.createTable("SequelizeMetaMigrations", {
    revision: {
      type: SequelizeTypescriptDataType.INTEGER,
      allowNull: false,
      unique: true,
      primaryKey: true
    },
    name: {
      type: SequelizeTypescriptDataType.STRING,
      allowNull: false
    },
    state: {
      type: SequelizeTypescriptDataType.JSON,
      allowNull: false
    }
  });
}
