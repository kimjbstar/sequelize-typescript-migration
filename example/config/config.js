const path = require("path");
const inflection = require("inflection");

module.exports = {
  username: process.env.SEQUELIZE_USERNAME,
  password: process.env.SEQUELIZE_PASSWORD,
  database: "test_migration2",
  host: process.env.SEQUELIZE_HOST,
  dialect: "mysql",
  models: [path.join(process.cwd(), "models")],
  modelMatch: (_filename, _member) => {
    const filename = inflection.camelize(_filename.replace(".model", ""));
    const member = _member;
    return filename === member;
  },
  timezone: "+09:00",
};
