#!/usr/bin/env bash
#
# Installs the packed tarball into a throwaway project and actually runs it.
#
# This catches three things the test suite structurally cannot:
#   1. A file that tests import but `files` does not publish -- green locally, broken
#      the moment someone installs it.
#   2. A runtime dependency that only resolves because it is a devDependency here.
#   3. An entry point or `types` field that points at something the build does not emit.
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_dir="$(mktemp -d)"
trap 'rm -rf "$work_dir"' EXIT

echo "==> Building and packing"
cd "$repo_root"
npm run build >/dev/null
tarball="$(npm pack --silent)"
mv "$tarball" "$work_dir/package.tgz"

echo "==> Installing into a clean project"
cd "$work_dir"
cat > package.json <<'JSON'
{
  "name": "packed-tarball-smoke-test",
  "private": true,
  "version": "1.0.0"
}
JSON

# The peer dependencies are the consumer's responsibility, which is exactly what this
# is verifying: install them the way a real user would, from the registry.
npm install --silent --no-audit --no-fund \
  "$work_dir/package.tgz" \
  sequelize@^6.37.0 \
  sequelize-typescript@^2.1.0 \
  reflect-metadata@^0.2.2 \
  sqlite3@^5.1.7

echo "==> Running makeMigration against a real database"
mkdir -p migrations
cat > smoke.js <<'JS'
require('reflect-metadata')
const fs = require('fs')
const path = require('path')
const {
	Sequelize,
	Model,
	Table,
	Column,
	PrimaryKey,
	DataType,
} = require('sequelize-typescript')
const { SequelizeTypescriptMigration } = require('sequelize-typescript-migration')

// Decorators applied by hand, so the order matters: @Column has to register the
// attribute before @PrimaryKey can annotate it.
class Widget extends Model {}
Table({ tableName: 'widgets', timestamps: false })(Widget)
Column(DataType.INTEGER)(Widget.prototype, 'id')
PrimaryKey(Widget.prototype, 'id')
Column(DataType.STRING(80))(Widget.prototype, 'label')
Column({ type: DataType.BOOLEAN, defaultValue: false })(Widget.prototype, 'isActive')
Column(DataType.JSON)(Widget.prototype, 'payload')

async function main() {
	const sequelize = new Sequelize({
		dialect: 'sqlite',
		storage: ':memory:',
		logging: false,
		models: [Widget],
	})

	const outDir = path.join(__dirname, 'migrations')
	const result = await SequelizeTypescriptMigration.makeMigration(sequelize, {
		outDir,
		migrationName: 'smoke',
	})

	if (result.status !== 'written') {
		throw new Error(`expected a migration to be written, got ${result.status}`)
	}

	const contents = fs.readFileSync(result.filename, 'utf8')

	// Requiring it is the real check: anything that is not valid, resolvable
	// JavaScript throws right here, the same way it would under sequelize-cli.
	const migration = require(result.filename)
	await migration.up(sequelize.getQueryInterface(), require('sequelize'))

	const described = await sequelize.getQueryInterface().describeTable('widgets')
	for (const column of ['id', 'label', 'isActive', 'payload']) {
		if (!(column in described)) {
			throw new Error(`column "${column}" is missing from the created table`)
		}
	}

	if (!contents.includes('defaultValue')) {
		throw new Error('default values did not reach the generated migration')
	}

	await migration.down(sequelize.getQueryInterface(), require('sequelize'))
	await sequelize.close()

	console.log('    migration generated, applied and rolled back')
}

main().catch((err) => {
	console.error(err)
	process.exit(1)
})
JS
node smoke.js

echo "==> Checking the published type declarations resolve"
node -e "
const path = require('path')
const pkgDir = path.dirname(require.resolve('sequelize-typescript-migration/package.json'))
const pkg = require('sequelize-typescript-migration/package.json')
const fs = require('fs')
if (!pkg.types) throw new Error('package.json has no types field')
const typesPath = path.join(pkgDir, pkg.types)
if (!fs.existsSync(typesPath)) throw new Error('types field points at ' + pkg.types + ', which is not in the tarball')
console.log('    ' + pkg.types + ' is present')
"

echo "==> OK"
