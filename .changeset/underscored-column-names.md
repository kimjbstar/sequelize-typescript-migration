---
'sequelize-typescript-migration': patch
---

Fixed `underscored: true` and explicit `field` names being ignored.

Migrations were generated against attribute names rather than column names, so a model with
`underscored: true` produced a table of camelCase columns — one the model itself could not
then read. The same applied to any column with an explicit `field`, and to index field
lists: an index declared on `actorName` was created on `actorName` rather than `actor_name`.

Sequelize already resolves this onto `attribute.field`, in both v6 and v7, so this needs no
naming-convention option — unlike the `useSnakeCase` flag some forks added.

If you use either feature, your previously generated migrations named the wrong columns.
