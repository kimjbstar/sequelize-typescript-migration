# CLAUDE.md

Working notes for anyone — human or coding agent — changing this codebase. Start here, then
see [CONTRIBUTING.md](./CONTRIBUTING.md) for PR mechanics.

## What this tool does

`makeMigration(sequelize, options)` compares your `sequelize-typescript` models against the
schema snapshot from the last migration, and writes a `sequelize-cli`-compatible migration
file describing the difference.

It is Django's `makemigrations` for Sequelize. Sequelize has no such feature and
[has said it will not add one](https://github.com/sequelize/sequelize/issues/17447).

## The pipeline

```
models
  └─ getTablesFromModels    → a serializable snapshot: { [tableName]: { schema, indexes } }
       └─ getDiffActionsFromTables (deep-diff)  → IAction[]
            └─ sortActions            → execution order (topological, within type buckets)
                 └─ getMigration      → queryInterface command strings
                      └─ writeMigration → the .js file on disk
```

`makeMigration` runs the diff twice — forwards for `up`, backwards for `down` — and assigns
the second run's commands onto `commandsDown`.

## The one thing to understand first

**The "previous state" does not come from the database schema.** It comes from a JSON snapshot
this tool wrote into its own `SequelizeMetaMigrations` table on the previous run. There is no
`describeTable` anywhere in the diff path.

That design is defensible — Drizzle Kit works the same way — but it has a consequence worth
stating plainly: if anyone changes the schema outside this tool, the snapshot silently drifts
and the next generated migration will be wrong. There is no drift detection today.

The other half of the bookkeeping is `SequelizeMeta`, and **that one is written by
sequelize-cli, not by us.** We read it to find which migration ran last, which is how we know
which snapshot to diff against. A test that runs `up()` without also recording the filename in
`SequelizeMeta` will never see the stored snapshot — that is not a bug in the tool.

## Known gotchas (learned the hard way)

Each of these cost real debugging time. They are why the code looks the way it does.

**`DataTypes.JSON`'s class is named `JSONTYPE`.** `JSON` is a reserved global, so Sequelize
names the class differently. Any lookup keyed on `constructor.name` misses it. This one silently
dropped every JSON column from generated migrations for years.

**`DataTypes.DOUBLE`'s `key` is `'DOUBLE PRECISION'` — with a space.** Valid SQL, invalid as a
`Sequelize.<name>` expression. This is why the type reverser renders from `constructor.name`
rather than from `.key`, even though the integer types would work either way.

**`RANGE` has no `.type`.** `ARRAY` exposes its instantiated element type as `this.type`, but
`RANGE` only has `_subtype` (a key string) and `options.subtype` (the instance). Reaching for
`.type` on a RANGE yields `undefined` and crashes on `.constructor`. One published fork has
this bug today.

**`ARRAY.options.type` can still be the class.** The constructor instantiates into `this.type`
but leaves `options.type` as whatever it was given. If that was a class, `constructor.name` is
`'Function'`.

**The `state` column is JSON, but only some dialects parse it for you.** MySQL hands back an
object; SQLite has no JSON type and hands back the raw string. Reading the string as an object
yields `undefined` for every field, which reads as "nothing has ever been migrated" and
regenerates the entire schema every run. `getLastMigrationState` parses defensively.

**Postgres folds unquoted identifiers to lowercase.** `FROM SequelizeMeta` becomes
`from sequelizemeta` and fails. Everything that names a table in raw SQL goes through
`quoteTableName`.

**`@ForeignKey` alone does not populate `references`.** The association decorator
(`@BelongsTo` / `@HasMany`) is what wires it up. Test fixtures need both, or the differ sees no
dependency and the FK ordering is never exercised.

**Decorators apply bottom-up.** `@PrimaryKey` must sit *above* `@Column`, because `@Column` has
to register the attribute before `@PrimaryKey` can annotate it. Applying them by hand (as the
packed-tarball smoke test does) means calling `Column(...)` first.

**An attribute name is not a column name.** With `underscored: true` or an explicit
`field`, the attribute is `firstName` while the column is `first_name`. Sequelize resolves
this onto `attribute.field` (both v6 and v7), and everything written into a migration --
schema keys and index field lists alike -- has to be the column name. Generating attribute
names produces a table the model cannot read.

**ts-jest does not type check.** It transpiles. `npm run typecheck` is the only thing that
reads the specs' types, which is why `tsconfig.json` includes them and `tsconfig.build.json`
excludes them.

## Where Sequelize internals are read

`src/adapters/` is meant to be the only place, and `reverseSequelizeColType.ts` is the
documented exception — reaching into DataType instances is that module's entire job.

This is what made experimental v7 support cheap. Everything that differs between the two
versions lives in `src/adapters/`, and nothing outside that directory branches on the
version. If you need a new piece of Sequelize internals, add an adapter rather than reaching
for it inline.

**What actually differs in v7** (all measured against alpha.48, not assumed):

| | v6 | v7 |
|---|---|---|
| models | plain object | `ModelSetView`, iterable, `Object.values` gives `[]` |
| attributes | `rawAttributes` | `rawAttributes` **throws**; `getAttributes()` works in both |
| indexes | `options.indexes` | `options.indexes` is empty; `getIndexes()` |
| data type id | `.key` | `.key` **throws**; `constructor.name` works in both |
| type namespace | `Sequelize.STRING` | removed — `DataTypes.STRING` |
| `showAllTables` | `string[]` | `TableNameWithSchema[]` |
| `bulkDelete` | `(table, where)` | `(table, { where })` |
| model reuse | allowed | a model may belong to **one** instance only |

**The package requires no Sequelize at runtime.** `QueryTypes.SELECT` is the literal
`'SELECT'` in both versions and `DataTypes` is read off the instance the caller passed
(`sequelize.constructor.DataTypes`, present on both). That is what lets a single build serve
v6 and v7. Keep it that way — adding `require('sequelize')` back would break v7 support.

## Testing approach

`npm test` needs no database and covers most of the logic. Two things make that possible:

- `reverseSequelizeColType` takes a DataType instance and reads nothing else — no connection,
  no `toSql()`.
- `new Sequelize({ validateOnly: true, models: [...] })` initialises models fully against a
  dummy dialect, with no driver and no connection.

`src/fixtures.golden.spec.ts` pins the whole pipeline, including the generated file verbatim.
**When a snapshot changes, read the diff.** Every line of it is a change to what users'
migrations will contain.

`src/utils/writeMigration.spec.ts` does not stop at string matching — it `require`s the
generated file, the same as sequelize-cli does. Anything that is not valid, resolvable
JavaScript fails there rather than in someone's production deploy.

`npm run test:integration` needs real servers (`test/docker-compose.yml`). The dialect-specific
tests skip themselves when a server is unreachable, so the suite still passes without them —
which also means a green run does not prove they executed. Check for `[skip]` in the output.
