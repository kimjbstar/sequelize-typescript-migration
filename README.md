# sequelize-typescript-migration

[![npm version](https://img.shields.io/npm/v/sequelize-typescript-migration.svg)](https://www.npmjs.com/package/sequelize-typescript-migration)
[![npm downloads](https://img.shields.io/npm/dm/sequelize-typescript-migration.svg)](https://www.npmjs.com/package/sequelize-typescript-migration)
[![CI](https://github.com/kimjbstar/sequelize-typescript-migration/actions/workflows/ci.yml/badge.svg)](https://github.com/kimjbstar/sequelize-typescript-migration/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/sequelize-typescript-migration.svg)](./LICENSE.md)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](./CONTRIBUTING.md)

Generates `sequelize-cli` migration files by diffing your `sequelize-typescript` models
against the schema recorded by the previous run. Django's `makemigrations`, for Sequelize.

Bugs and feature requests go to [Issues](https://github.com/kimjbstar/sequelize-typescript-migration/issues);
"how do I..." questions to [Discussions](https://github.com/kimjbstar/sequelize-typescript-migration/discussions).

**Contents** · [Why](#why-this-exists) · [Install](#install) · [Usage](#usage) · [CLI](#cli) ·
[Options](#options) · [What it generates](#what-it-generates) · [Upgrading](#upgrading) ·
[Sequelize 7](#sequelize-7) · [Limitations](#limitations) ·
[Relationship to the forks](#relationship-to-the-forks) ·
[FAQ](#faq) · [Contributing](./CONTRIBUTING.md)

> **In a hurry?** Run the first migration with `preview: true` and read the output before
> writing anything. This is doubly true if you are coming from an older version or from a
> fork — see [Upgrading](#upgrading).

## Why this exists

Sequelize does not generate migrations from your models, and
[has declined to add the feature](https://github.com/sequelize/sequelize/issues/17447).
`sequelize-cli migration:generate` creates an empty file with `up` and `down` stubs for you
to fill in by hand; the official docs are explicit that "you define those functions
manually."

Of the major TypeScript ORMs, Sequelize is the only one without diff-based migration
generation. Prisma, Drizzle, TypeORM and MikroORM all have it. This package fills that gap
for codebases already on Sequelize.

## Install

```
npm i -D sequelize-typescript-migration
```

This package declares `sequelize` and `sequelize-typescript` as peer dependencies and ships
no database driver of its own — **install the driver for your dialect yourself** (`mysql2`,
`pg` + `pg-hstore`, `sqlite3`, …), the same one your application already uses.

Requires Node 18.18 or newer. Sequelize 6 is the supported target; **Sequelize 7 works but is
experimental** — see [Sequelize 7](#sequelize-7).

## Usage

```typescript
import path from 'path'
import { Sequelize } from 'sequelize-typescript'
import { SequelizeTypescriptMigration } from 'sequelize-typescript-migration'

const sequelize = new Sequelize({
	/* your usual options and models */
})

const result = await SequelizeTypescriptMigration.makeMigration(sequelize, {
	outDir: path.join(__dirname, '../migrations'),
	migrationName: 'add-awesome-field-in-my-table',
	preview: false,
})

if (result.status === 'written') {
	console.log(`wrote ${result.filename}`)
}
```

Point `outDir` at the same directory `sequelize-cli` reads migrations from. Then apply it the
way you always do:

```
npx sequelize db:migrate
```

The result is a discriminated union, so you can branch on it without matching on strings:

```typescript
type MigrationResult =
	| { status: 'no-changes' }
	| { status: 'preview'; up: string[]; down: string[] }
	| { status: 'written'; filename: string; revision: number }
```

## CLI

If you would rather not write a bootstrap script:

```
npx sequelize-typescript-migration \
  --config ./dist/database.js \
  --out-dir ./migrations \
  --name add-awesome-field
```

`--config` points at a module that exports your `Sequelize` instance — as a default export,
as a named `sequelize` export, or as `module.exports` itself. All three work.

TypeScript config files need a loader, since this package does not bundle one:

```
node --import tsx ./node_modules/.bin/sequelize-typescript-migration \
  --config ./src/database.ts --out-dir ./migrations
```

Run `npx sequelize-typescript-migration --help` for the full flag list.

## Options

| Option          | Type      | Default    | Description                                                     |
| --------------- | --------- | ---------- | --------------------------------------------------------------- |
| `outDir`        | `string`  | *required* | Where to write the migration. Point at your sequelize-cli path.  |
| `migrationName` | `string`  | `"noname"` | Goes into the filename; spaces become underscores.               |
| `preview`       | `boolean` | `false`    | Print what would be generated and write nothing. Read-only.      |
| `comment`       | `string`  | `""`       | Recorded in the migration's `info` block.                        |
| `debug`         | `boolean` | `false`    | Extra logging on failure.                                        |

## What it generates

Given two models:

```typescript
@Table
export class CarBrand extends Model {
	@Column
	declare name: string

	@Default(true)
	@Column(DataType.BOOLEAN)
	declare isCertified: boolean
}

@Table
export class Car extends Model {
	@Column
	declare name: string

	@ForeignKey(() => CarBrand)
	@Column
	declare carBrandId: number

	@BelongsTo(() => CarBrand)
	declare carBrand: CarBrand
}
```

the first run writes `00000001-noname.js`:

```javascript
'use strict';

const Sequelize = require('sequelize');

/**
 * Actions summary:
 *
 * createTable "CarBrands", deps: []
 * createTable "Cars", deps: [CarBrands]
 *
 **/

const info = {
    "revision": 1,
    "name": "noname",
    "created": "2026-08-25T07:09:51.308Z",
    "comment": ""
};

const migrationCommands = [

    {
        fn: "createTable",
        params: [
            "CarBrands",
            {
                "id": {
                    "autoIncrement": true,
                    "primaryKey": true,
                    "allowNull": false,
                    "type": Sequelize.INTEGER
                },
                "name": {
                    "type": Sequelize.STRING
                },
                "isCertified": {
                    "defaultValue": true,
                    "type": Sequelize.BOOLEAN
                },
                "createdAt": {
                    "allowNull": false,
                    "type": Sequelize.DATE
                },
                "updatedAt": {
                    "allowNull": false,
                    "type": Sequelize.DATE
                }
            },
            {}
        ]
    },

    // ... createTable "Cars", with a references block pointing at CarBrands
];

const rollbackCommands = [{
        fn: "dropTable",
        params: ["Cars"]
    },
    {
        fn: "dropTable",
        params: ["CarBrands"]
    }
];

async function runCommands(queryInterface, commands) {
    for (let index = 0; index < commands.length; index++) {
        const command = commands[index];
        if (typeof queryInterface[command.fn] !== "function") {
            throw new Error(
                "[#" + index + "] unknown queryInterface method: " + command.fn
            );
        }
        console.log("[#" + index + "] execute: " + command.fn);
        await queryInterface[command.fn].apply(queryInterface, command.params);
    }
}

module.exports = {
    up: function(queryInterface, Sequelize) {
        return runCommands(queryInterface, migrationCommands);
    },
    down: function(queryInterface, Sequelize) {
        return runCommands(queryInterface, rollbackCommands);
    },
    info: info
};
```

Note `isCertified`: the `@Default(true)` made it into the migration. That is worth pointing
out because it did not, in every version before this one.

Tables are ordered so a foreign key never precedes the table it references, and `down`
reverses that order.

## Upgrading

**Run your first migration with `preview: true` and read the output.** Recent versions fixed
several bugs that had been quietly changing what got generated, so your next run will
legitimately show differences that are not schema changes you made.

Specifically:

- **Default values now appear.** They previously never reached a generated migration at all —
  the value was computed and then discarded. If your models use `@Default`, expect
  `changeColumn` entries adding them.
- **`JSON`, `DOUBLE`, `FLOAT` and `REAL` columns now appear.** These were silently dropped:
  the type lookup missed them and the column vanished from the migration without a word.
- **Index identity changed.** Indexes are now identified by what they do rather than by the
  shape of the object that described them, which stops a reordered decorator from looking
  like a schema change. The one-time cost is that existing indexes are re-created on the
  first run after upgrading.
- **`underscored: true` and explicit `field` names now work.** Migrations were generated
  against attribute names rather than column names, so a model with `underscored: true`
  produced a table of camelCase columns that the model itself could not find. If you use
  either, your previous migrations named the wrong columns.
- **`makeMigration` no longer calls `process.exit`.** If you relied on the process ending
  when there was nothing to do, check for `status === 'no-changes'` instead.
- **Failures now throw.** A missing `outDir`, or a failure to record the snapshot, used to be
  reported as success.

Coming from `sequelize-typescript-migration-lts` or `@techntools/sequelize-typescript-migration`?
Those forks name the snapshot table `SequelizeMigrationsMeta` while this package uses
`SequelizeMetaMigrations`. This package reads both, so your history is picked up
automatically and you will not get a spurious "create every table" migration.

## Sequelize 7

Sequelize 7 (`@sequelize/core`) is supported, **experimentally**. The whole pipeline runs
against it — including generating, applying and rolling back a migration — and that is
covered by its own test suite. What makes it experimental is upstream, not here: v7 has been
in alpha since 2021, the most recent release was alpha.48 in February 2026, there is still no
beta, and its APIs have changed between alphas before.

Nothing changes in how you call this package. Point it at a v7 `Sequelize` and it adapts:

- models come from the iterable `ModelSetView` rather than a plain object
- attributes come from `getAttributes()`, since `rawAttributes` throws in v7
- indexes come from `getIndexes()`, since `options.indexes` is left empty
- the generated migration requires `@sequelize/core` and renders types as `DataTypes.*`,
  because v7 removed the `Sequelize.STRING` aliases

Note that v7 does not use `sequelize-typescript` — its decorators live in
`@sequelize/core/decorators-legacy`, and `@ForeignKey` in particular has no equivalent
(the foreign key is a plain attribute, named in the association decorator instead).
`sequelize-typescript` has had no release since 2023 and declares a peer dependency on
Sequelize 6, so it is not going to gain v7 support.

Running the migration is also different: `@sequelize/cli`'s migration commands are merged
upstream but not yet published, so [umzug](https://github.com/sequelize/umzug) is currently
the released way to apply migrations on v7.

This package requires no Sequelize at runtime at all — it uses whichever copy you pass it,
which is what lets one build serve both versions.

## Limitations

Worth knowing before you adopt this:

- **The previous state comes from a snapshot, not from the database.** Each run diffs your
  models against JSON this tool stored on the previous run — there is no introspection of the
  live schema. Drizzle Kit works the same way, and it is a reasonable design, but it means
  **schema changes made outside this tool are not noticed** and will silently skew the next
  migration. There is no drift detection yet.
- **Column renames are seen as a drop plus an add.** A diff cannot tell renaming from
  deleting-and-creating, so review those by hand before running them against data you care
  about.
- **`down` is generated by reversing the diff**, not by inverting each command. It is far
  better than it used to be — foreign-key ordering is now a real topological sort, and the
  round trip is covered by tests against MySQL, Postgres and SQLite — but a complex change
  is still worth reading before you rely on rolling it back.
- **Always read the generated migration before applying it.** This is true of every tool in
  this category.

## Relationship to the forks

This package went unmaintained after 2020, and the community carried it forward. That work
was real and this version builds on it:

| Package                                     | Contributed                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| [flexxnn/sequelize-auto-migrations][auto]    | The original design this package was a TypeScript rewrite of.           |
| [sequelize-typescript-migration-lts][lts]    | Sequelize 6 support, the `useSnakeCase` option, dropping `process.exit`. |
| [@techntools/...][techntools]                | Postgres identifier quoting, topological sorting, the `defaultValue` fix. |

[auto]: https://github.com/flexxnn/sequelize-auto-migrations
[lts]: https://www.npmjs.com/package/sequelize-typescript-migration-lts
[techntools]: https://www.npmjs.com/package/@techntools/sequelize-typescript-migration

What this version adds on top: peer dependencies instead of a bundled MySQL driver,
published type declarations, a real CLI, a test suite (unit plus integration against MySQL,
Postgres and SQLite), CI, and fixes for several data-loss bugs none of the forks had caught —
the discarded default values, the silently dropped `JSON` and `DOUBLE` columns, and a
`removeCurrentRevisionMigrations` that never actually removed anything.

## FAQ

**Does this work with plain Sequelize models, without decorators?**
No. It reads `sequelize-typescript` model metadata. Plain `sequelize.define()` models are not
supported.

**Does it apply the migration too?**
No, and that is deliberate. It writes the file; `sequelize-cli` runs it. That split is also
why the bookkeeping is split: this tool writes `SequelizeMetaMigrations`, sequelize-cli writes
`SequelizeMeta`.

**Why did my column disappear from the migration?**
It shouldn't any more — that was the `JSON`/`DOUBLE` bug described in
[Upgrading](#upgrading). An unrecognised type now raises an error instead of quietly skipping
the column. If you hit that error, please
[open an issue](https://github.com/kimjbstar/sequelize-typescript-migration/issues) with the
type name.

**Does it support Sequelize 7?**
Experimentally, yes — see [Sequelize 7](#sequelize-7). It works and is tested, but v7 itself
is still alpha upstream, so treat it as such.

**Can I run it against Postgres?**
Yes. Older versions failed on Postgres because unquoted identifiers get folded to lowercase —
`SequelizeMeta` became `sequelizemeta` and the query failed. Identifiers are quoted per
dialect now, and there are integration tests running against a real Postgres.
