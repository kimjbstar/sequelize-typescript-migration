import { diff, Diff } from "deep-diff";
import sortActions from "./sortActions";

export default function getDiffActionsFromTables(
  previousStateTables,
  currentStateTables
) {
  const actions = [];
  let difference: Array<Diff<any, any>> = diff(
    previousStateTables,
    currentStateTables
  );
  if (difference === undefined) {
    return actions;
  }

  difference.forEach(df => {
    switch (df.kind) {
      // add new
      case "N":
        {
          // new table created
          if (df.path.length === 1) {
            const depends = [];

            const tableName = df.rhs.tableName;
            Object.values(df.rhs.schema).forEach((v: any) => {
              if (v.references) {
                depends.push(v.references.model);
              }
            });

            actions.push({
              actionType: "createTable",
              tableName,
              attributes: df.rhs.schema,
              options: {},
              depends
            });

            // create indexes
            if (df.rhs.indexes) {
              for (const _i in df.rhs.indexes) {
                const copied = JSON.parse(JSON.stringify(df.rhs.indexes[_i]));
                actions.push(
                  Object.assign(
                    {
                      actionType: "addIndex",
                      tableName,
                      depends: [tableName]
                    },
                    copied
                  )
                );
              }
            }
            break;
          }

          const tableName = df.path[0];
          const depends = [tableName];

          if (df.path[1] === "schema") {
            // if (df.path.length === 3) - new field
            if (df.path.length === 3) {
              // new field
              if (df.rhs && df.rhs.references) {
                depends.push(df.rhs.references.model);
              }

              actions.push({
                actionType: "addColumn",
                tableName,
                attributeName: df.path[2],
                options: df.rhs,
                depends
              });
              break;
            }

            // if (df.path.length > 3) - add new attribute to column (change col)
            if (df.path.length > 3) {
              if (df.path[1] === "schema") {
                // new field attributes
                const options =
                  currentStateTables[tableName].schema[df.path[2]];
                if (options.references) {
                  depends.push(options.references.nodel);
                }

                actions.push({
                  actionType: "changeColumn",
                  tableName,
                  attributeName: df.path[2],
                  options,
                  depends
                });
                break;
              }
            }
          }

          // new index
          if (df.path[1] === "indexes") {
            const tableName = df.path[0];
            const copied = df.rhs
              ? JSON.parse(JSON.stringify(df.rhs))
              : undefined;
            const index = copied;

            index.actionType = "addIndex";
            index.tableName = tableName;
            index.depends = [tableName];
            actions.push(index);
            break;
          }
        }
        break;

      // drop
      case "D":
        {
          const tableName = df.path[0];
          const depends = [tableName];

          if (df.path.length === 1) {
            // drop table
            actions.push({ actionType: "dropTable", tableName, depends: [] });
            break;
          }

          if (df.path[1] === "schema") {
            // if (df.path.length === 3) - drop field
            if (df.path.length === 3) {
              // drop column
              actions.push({
                actionType: "removeColumn",
                tableName,
                columnName: df.path[2],
                depends: [tableName]
              });
              break;
            }

            // if (df.path.length > 3) - drop attribute from column (change col)
            if (df.path.length > 3) {
              // new field attributes
              const options = currentStateTables[tableName].schema[df.path[2]];
              if (options.references) {
                depends.push(options.references.nodel);
              }

              actions.push({
                actionType: "changeColumn",
                tableName,
                attributeName: df.path[2],
                options,
                depends
              });
              break;
            }
          }

          if (df.path[1] === "indexes") {
            //                   console.log(df)
            actions.push({
              actionType: "removeIndex",
              tableName,
              fields: df.lhs.fields,
              options: df.lhs.options,
              depends: [tableName]
            });
            break;
          }
        }
        break;

      // edit
      case "E":
        {
          const tableName = df.path[0];
          const depends = [tableName];

          if (df.path[1] === "schema") {
            // new field attributes
            const options = currentStateTables[tableName].schema[df.path[2]];
            if (options.references) {
              depends.push(options.references.nodel);
            }

            actions.push({
              actionType: "changeColumn",
              tableName,
              attributeName: df.path[2],
              options,
              depends
            });
          }
        }
        break;

      // array change indexes
      case "A":
        {
          console.log(
            "[Not supported] Array model changes! Problems are possible. Please, check result more carefully!"
          );
          console.log("[Not supported] Difference: ");
          console.log(JSON.stringify(df, null, 4));
        }
        break;

      default:
        // code
        break;
    }
  });
  sortActions(actions);
  return actions;
}
