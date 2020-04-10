import { SequelizeTypescriptMigration } from "./index";
import { Sequelize } from "sequelize-typescript";
import { Table, Column, Model, Default, DataType } from "sequelize-typescript";
import * as path from "path";

@Table
export class CarBrand extends Model<CarBrand> {
  @Column
  name: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isCertified: boolean;

  @Column
  imgUrl: string;

  @Column
  orderNo: number;

  @Column
  carsCount: number;
}

const bootstrap = async () => {
  const sequelize: Sequelize = new Sequelize({
    username: "kimjbstar",
    password: "12091457",
    database: "test_migration2",
    host: "localhost",
    dialect: "mysql",
    models: [CarBrand],
    timezone: "+09:00",
    logging: false,
  });
  try {
    const result = await SequelizeTypescriptMigration.makeMigration(sequelize, {
      outDir: path.join(__dirname, "../migrations"),
    });
    console.log(result);
  } catch (e) {
    console.log(e);
  }
};
bootstrap();
