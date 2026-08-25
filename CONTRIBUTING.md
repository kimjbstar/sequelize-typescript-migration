# Contributing

Bug fixes and small, focused PRs are very welcome — including ones written by a coding agent
(Claude Code, etc.) rather than typed by hand.

For architecture, gotchas, and how the pieces fit together, read **[CLAUDE.md](./CLAUDE.md)**
first — this file is just the PR mechanics.

By participating in this project, you're expected to uphold the
[Code of Conduct](./CODE_OF_CONDUCT.md). Found a security issue instead of a bug? See
[SECURITY.md](./SECURITY.md) rather than opening a public issue.

## Getting set up

```
git clone https://github.com/kimjbstar/sequelize-typescript-migration.git
cd sequelize-typescript-migration
npm install
npm run build
npm test
```

If both of those succeed, you're ready to make a change. `npm test` needs no database.

## Making a change

1. **Reproduce first.** If you're fixing a bug, write a failing test for it before touching the
   fix. Most of this codebase is testable without a database:
   - `reverseSequelizeColType` takes a live `DataTypes` instance and reads nothing else — see
     `src/utils/reverseSequelizeColType.spec.ts`.
   - Models can be fully initialised with no driver and no connection via
     `new Sequelize({ validateOnly: true, models: [...] })` — see
     `src/utils/getTablesFromModels.spec.ts`.
   - The differ, the sorter and the renderer are pure functions over plain objects.
2. **Fix it.**
3. Run `npm test`. If your change intentionally alters generated output,
   `src/fixtures.golden.spec.ts` will fail with a snapshot diff — run `npx jest -u` and
   **read the diff** before committing the updated snapshot. Every line of it is a change to
   what users' migrations will contain. A diff you didn't expect is exactly the bug this test
   caught.
4. Run `npm run build` — a clean build, which catches things `tsc --noEmit` alone might not.
   While iterating, `npm run typecheck` is faster.
5. If the change is dialect-specific, run the integration suite against real servers:
   ```
   docker compose -f test/docker-compose.yml up -d
   npm run test:integration
   docker compose -f test/docker-compose.yml down -v
   ```
   Without those containers the suite still passes — the dialect-specific tests skip
   themselves rather than fail.

## Where things live

- `src/index.ts` — the public `makeMigration` entry point and its orchestration.
- `src/adapters/` — **the only place that reads Sequelize internals.** If you need to reach
  into a model or a DataType, add it here rather than inline. Sequelize v7 rewrites exactly
  these APIs, and keeping them in one directory is what makes that port tractable.
- `src/utils/` — the pipeline: snapshot the models, diff against the stored snapshot, sort the
  resulting actions, render them, write the file.

## Opening the PR

- One logical change per PR. If you're fixing two unrelated things, that's two PRs.
- Describe *why*, not just *what* — the diff already shows what changed.
- Mention which issue it fixes, if any (`Fixes #123`).
- Confirm in the PR description that `npm test` and `npm run build` pass locally. CI verifies
  this too (Node 20/22/24, Windows, MySQL and Postgres, and both ends of the supported
  sequelize range), but saying so up front saves a round trip.
- If the change should ship in the next release (almost everything except docs-only / CI-only
  changes), run `npx changeset` and answer its prompts — it writes a small markdown file to
  `.changeset/` describing the semver bump and a one-line summary. Commit that file with your
  PR. `patch` for bug fixes, `minor` for new or changed options.

## What tends to get merged quickly

- A regression test alongside the fix.
- A change scoped to the actual bug, not a drive-by refactor of nearby code.
- For anything touching `reverseSequelizeColType`: a note on which dialect you tested against.
  That file reads Sequelize's DataType internals through `constructor.name` and an untyped
  option bag, and it is where most historical bugs have lived — types that silently rendered
  as `VIRTUAL` and got dropped, lengths that lost their quotes and made the generated file
  throw on load.

## What tends to need more discussion first

- New options on `makeMigration` — open an issue first to agree on the name and shape. It is
  easier to agree once than to rename something people already depend on.
- Anything that changes the generated output for cases that already worked. A bug fix that
  changes output is fine; an intentional change to working behaviour needs a conversation,
  because everyone's next `makeMigration` run will show the difference as a schema change.

## Releasing

Releases are automated with [Changesets](https://github.com/changesets/changesets) — you don't
need to be a maintainer to trigger this, just to add a changeset to your PR (see above).

1. Every push to `master` with pending changeset files updates a standing **"Version Packages"**
   pull request — it bumps the version and updates `CHANGELOG.md` from whatever changesets have
   landed, and keeps itself up to date as more PRs merge.
2. When a maintainer merges that PR, the same job detects there are no pending changesets left
   and runs the actual release: `npm publish` with provenance, a GitHub Release, and a git tag.
3. There is no manual `npm version` step — the version is derived entirely from the changeset
   files' bump types accumulated since the last release.

If you're fixing something that shouldn't trigger a release at all (a typo in a comment,
CI-only changes), you can skip the changeset.
