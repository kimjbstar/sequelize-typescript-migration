# Security Policy

## Supported Versions

Only the latest published version on npm receives security fixes. This project does not
maintain long-term-support branches for older major or minor versions.

| Version  | Supported          |
| -------- | ------------------ |
| latest   | :white_check_mark: |
| < latest | :x:                |

## Reporting a Vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities.

Report it privately using one of these channels:

- [GitHub Security Advisories](https://github.com/kimjbstar/sequelize-typescript-migration/security/advisories/new)
  (preferred — lets us coordinate a fix and disclosure privately)
- Email: kimjbstar@gmail.com

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce — a minimal model definition and the resulting migration is ideal
- Version information: this package, sequelize, sequelize-typescript, Node, and the database

You should expect an initial response within a few days. This is a single-maintainer project,
so timelines aren't guaranteed, but security reports are prioritized over feature work.

## Scope

This tool has a wider attack surface than a pure code generator, and it is worth being
explicit about why: it does two privileged things. It **writes JavaScript files to a directory
you choose**, and the migrations it produces **execute SQL against your database**.

Relevant vulnerability classes:

- **Injection into generated code.** Model metadata — table names, column names, enum values,
  default values, index names — is rendered into the migration file as source. A model
  definition that could break out of its string literal and inject arbitrary JavaScript into
  the generated file is a vulnerability, because that file is later executed by
  `sequelize-cli` with database credentials.
- **Injection into SQL.** The tool issues raw SQL against its own bookkeeping tables. Values
  that reach those statements without being bound are a vulnerability.
- **Writes outside the output directory.** `outDir` and the migration name both influence the
  path that gets written. A name that escapes the configured directory is a vulnerability.
- **Supply-chain issues** in this package's own dependencies.

Out of scope:

- A migration that is *wrong* but not dangerous — a missing column, a bad type, an ordering
  problem. Those are regular bugs; please file them as normal issues.
- Anything requiring an attacker who already controls your model definitions or your database
  credentials. At that point they can run arbitrary code and arbitrary SQL directly.

Note that this tool is a development-time dependency. It is meant to be installed as a
devDependency and run by a developer against a database they already have access to; it is not
intended to be present in, or reachable from, a deployed application.
