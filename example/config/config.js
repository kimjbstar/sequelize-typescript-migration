const path = require("path");

module.exports = {
  username: process.env.SEQUELIZE_USERNAME,
  password: process.env.SEQUELIZE_PASSWORD,
  database: process.env.SEQUELIZE_DATABASE || "test_migration",
  host: process.env.SEQUELIZE_HOST,
  dialect: "mysql",
  models: [path.join(process.cwd(), "models")],
  // "car_brand.model" -> "CarBrand", matching the exported class name.
  modelMatch: (filename, member) =>
    filename
      .replace(".model", "")
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("") === member,
  timezone: "+09:00",
};
