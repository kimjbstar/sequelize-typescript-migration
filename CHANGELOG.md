# sequelize-typescript-migration

## 1.0.0

### Major Changes

- [`484fc69`](https://github.com/kimjbstar/sequelize-typescript-migration/commit/484fc69421b57553e45db4d31506e2833df36610) Thanks [@kimjbstar](https://github.com/kimjbstar)! - Modernized for Sequelize 6, with experimental Sequelize 7 support.

    This release fixes several bugs that were silently changing what got generated. **Run your
    first migration with `preview: true` and read the output** — you will see differences that
    are not schema changes you made.

    ### Data that used to disappear
    - **Default values now reach the migration.** `@Default(...)` never made it into a generated
      file: the value was computed and then discarded when the attribute object was reassigned.
      Falsy defaults (`@Default(false)`, `@Default(0)`) were dropped even earlier, by a truthy
      guard.
    - **`JSON`, `DOUBLE`, `FLOAT` and `REAL` columns now appear.** The type lookup missed them —
      `DataTypes.JSON`'s class is named `JSONTYPE` — so they degraded to `VIRTUAL` and the caller
      skipped the column entirely, with nothing logged.
    - **Unrecognised types now raise an error** instead of quietly dropping the column. Returning
      a placeholder is what made the two bugs above possible.

    ### Migrations that could not run
    - **`BLOB` no longer emits a bare identifier.** `Sequelize.BLOB((long))` threw
      `ReferenceError` the moment sequelize-cli loaded the file; `DataType.BLOB` without a length
      threw `TypeError` while generating.
    - **`ARRAY` and `RANGE` no longer recurse infinitely.** Both branches extracted the inner
      type and then recursed on themselves.
    - **`CHAR(n)` keeps its length.**

    ### Postgres
    - **Identifiers are quoted per dialect.** Unquoted `FROM SequelizeMeta` was folded to
      lowercase and failed with `relation "sequelizemeta" does not exist`, which made the tool
      unusable on Postgres (upstream [#3](https://github.com/kimjbstar/sequelize-typescript-migration/issues/3), [#4](https://github.com/kimjbstar/sequelize-typescript-migration/issues/4), [#10](https://github.com/kimjbstar/sequelize-typescript-migration/issues/10)).
    - **The stored snapshot is parsed when a dialect returns it as a string.** MySQL hands back a
      parsed object; SQLite has no JSON type and returns the raw text, which read as "nothing has
      ever been migrated" and regenerated the whole schema every run.

    ### Ordering
    - **Foreign keys are ordered by a real topological sort.** The previous pairwise-swap pass
      settled a chain of three but not four — measured, half of the input orderings of a
      four-table chain came out wrong, and 95 of 120 for five. This is the README's old
      "undo(down) action may not work" admission, now closed.
    - **`references.model` is read correctly** in all three places (two were misspelled).

    ### Breaking changes
    - `sequelize` and `sequelize-typescript` are now **peer dependencies**, and no database
      driver is bundled — install the one for your dialect yourself.
    - **`makeMigration` no longer calls `process.exit`.** It returns a discriminated union:
      `{ status: 'no-changes' | 'preview' | 'written' }`.
    - **Failures throw** instead of being reported as success. A failure to record the snapshot
      used to be swallowed, leaving the next run diffing against a stale state.
    - **`preview` is genuinely read-only** — it no longer creates the bookkeeping tables.
    - **Index identity changed.** Indexes are identified by what they do rather than by the shape
      of the object that described them, so reordering decorator options no longer looks like a
      schema change. Existing indexes are re-created once, on the first run after upgrading.
    - Requires Node 18.18+.

    ### New
    - **A real CLI.** `npx sequelize-typescript-migration --config ./db.js --out-dir ./migrations`.
      The `bin` field previously pointed at a file with no entry point.
    - **Experimental Sequelize 7 support.** The package now requires no Sequelize at runtime and
      adapts to whichever version you pass it. v7 is still alpha upstream, hence experimental.
    - **Published type declarations**, and reads the snapshot table under both this package's name
      and the one the `-lts` / `@techntools` forks use, so switching from a fork keeps your history.

### Patch Changes

- [`2f82f62`](https://github.com/kimjbstar/sequelize-typescript-migration/commit/2f82f625a2ad79a0cb68b611dbfde784a1e8356d) Thanks [@kimjbstar](https://github.com/kimjbstar)! - Fixed `underscored: true` and explicit `field` names being ignored.

    Migrations were generated against attribute names rather than column names, so a model with
    `underscored: true` produced a table of camelCase columns — one the model itself could not
    then read. The same applied to any column with an explicit `field`, and to index field
    lists: an index declared on `actorName` was created on `actorName` rather than `actor_name`.

    Sequelize already resolves this onto `attribute.field`, in both v6 and v7, so this needs no
    naming-convention option — unlike the `useSnakeCase` flag some forks added.

    If you use either feature, your previously generated migrations named the wrong columns.
