# sequelize-typescript-migration

It is based on [sequelize-typescript](https://www.npmjs.com/package/sequelize-typescript), not supports "sequelize" based model codes.
and you need prior knowledge of migration of Sequelize.

[Sequelize Migration Manual](https://sequelize.org/master/manual/migrations.html)

This scans models and its decorators to find changes, and generates migration code with this changes so don't need to write up, down function manually. this is like "makemigration" in django framework.

After generate successfully, you can use "migrate" in [Sequelize](https://sequelize.org/)
[Sequelize Migration Manual](https://sequelize.org/master/manual/migrations.html)

**This refers to [GitHub - flexxnn/sequelize-auto-migrations: Migration generator && runner for sequelize](https://github.com/flexxnn/sequelize-auto-migrations) and its forks, and modified to typescript.**

Sometimes, undo(down) action may not work, then you should modify manually. Maybe it's because of ordering of relations of models.
That issue is currently in the works.

## Installation

```
npm i -D sequelize-typescript-migration
```

## Usage Example

```typescript
import { Sequelize } from "sequelize-typescript";
import { SequelizeTypescriptMigration } from "sequelize-typescript-migration";

const sequelize: Sequelize = new Sequelize({
	// .. options
});

await SequelizeTypescriptMigration.makeMigration(sequelize, {
	outDir: path.join(__dirname, "../migrations"),
	migrationName: "add-awesome-field-in-my-table"
	preview: false,
});
```

let's see example, if you have this two models and run first makeMigration, it detects all table change from nothing.

```typescript
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
```

```typescript
@Table
export class Car extends Model<Car> {
  @Column
  name: string;

  @ForeignKey(() => CarBrand)
  @Column
  carBrandId: number;

  @BelongsTo(() => CarBrand)
  carBrand: CarBrand;
}
```

then this code written to 00000001-noname.js in migrations path.

```javascript
"use strict";

var Sequelize = require("sequelize");

/**
 * Actions summary:
 *
 * createTable "CarBrands", deps: []
 * createTable "Cars", deps: [CarBrands]
 *
 **/

var info = {
  revision: 1,
  name: "noname",
  created: "2020-04-12T15:49:58.814Z",
  comment: "",
};

var migrationCommands = [
  {
    fn: "createTable",
    params: [
      "CarBrands",
      {
        id: {
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
          type: Sequelize.INTEGER,
        },
        name: {
          type: Sequelize.STRING,
        },
        isCertified: {
          type: Sequelize.BOOLEAN,
        },
        imgUrl: {
          type: Sequelize.STRING,
        },
        orderNo: {
          type: Sequelize.INTEGER,
        },
        carsCount: {
          type: Sequelize.INTEGER,
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE,
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE,
        },
      },
      {},
    ],
  },

  {
    fn: "createTable",
    params: [
      "Cars",
      {
        id: {
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
          type: Sequelize.INTEGER,
        },
        name: {
          type: Sequelize.STRING,
        },
        carBrandId: {
          onDelete: "NO ACTION",
          onUpdate: "CASCADE",
          references: {
            model: "CarBrands",
            key: "id",
          },
          allowNull: true,
          type: Sequelize.INTEGER,
        },
        createdAt: {
          allowNull: false,
          type: Sequelize.DATE,
        },
        updatedAt: {
          allowNull: false,
          type: Sequelize.DATE,
        },
      },
      {},
    ],
  },
];

var rollbackCommands = [
  {
    fn: "dropTable",
    params: ["Cars"],
  },
  {
    fn: "dropTable",
    params: ["CarBrands"],
  },
];

module.exports = {
  pos: 0,
  up: function (queryInterface, Sequelize) {
    var index = this.pos;
    return new Promise(function (resolve, reject) {
      function next() {
        if (index < migrationCommands.length) {
          let command = migrationCommands[index];
          console.log("[#" + index + "] execute: " + command.fn);
          index++;
          queryInterface[command.fn]
            .apply(queryInterface, command.params)
            .then(next, reject);
        } else resolve();
      }
      next();
    });
  },
  down: function (queryInterface, Sequelize) {
    var index = this.pos;
    return new Promise(function (resolve, reject) {
      function next() {
        if (index < rollbackCommands.length) {
          let command = rollbackCommands[index];
          console.log("[#" + index + "] execute: " + command.fn);
          index++;
          queryInterface[command.fn]
            .apply(queryInterface, command.params)
            .then(next, reject);
        } else resolve();
      }
      next();
    });
  },
  info: info,
};
```

then you can apply this `npx sequelize db:migrate --to 00000001-noname.js`

## Documentation

not ready yet.
