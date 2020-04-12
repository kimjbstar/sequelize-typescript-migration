import { SequelizeTypescriptMigration } from "../../sequelize-typescript-migration";
import { Sequelize } from "sequelize-typescript";
import * as path from "path";
import { Car } from "models/car.model";
import { CarBrand } from "models/car_brand.model";

const bootstrap = async () => {
  const sequelize: Sequelize = new Sequelize({
    username: "kimjbstar",
    password: "12091457",
    database: "test_migration2",
    host: "localhost",
    dialect: "mysql",
    models: [CarBrand, Car],
    timezone: "+09:00",
    logging: false,
  });
  try {
    const result = await SequelizeTypescriptMigration.makeMigration(sequelize, {
      outDir: path.join(__dirname, "./migrations"),
    });
    console.log(result);
  } catch (e) {
    console.log(e);
  }
};
bootstrap();
