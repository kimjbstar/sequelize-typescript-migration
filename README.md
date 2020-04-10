# sequelize-typescript-migration

this scans models and its decorators and find changes. and generates migration up, down function like "makemigration" in django framework.
this is based on [sequelize-typescript](https://www.npmjs.com/package/sequelize-typescript)

## Installation

```
npm i -S sequelize-typescript-migration
```

## Usage Example

```typescript
import { Sequelize } from "sequelize-typescript";

const sequelize: Sequelize = new Sequelize({
	// .. options
});

await SequelizeTypescriptMigration.makeMigration(sequelize, {
	outDir: path.join(__dirname, "../migrations"),
	migrationName: "add-awesome-field-in-my-table"
	preview: false,
});
```

after generate successfully, you can use "migrate" in [Sequelize](https://sequelize.org/)
[Sequelize Migration Manual](https://sequelize.org/master/manual/migrations.html)

## Documentation

not ready yet.
