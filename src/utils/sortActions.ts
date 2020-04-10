export default function sortActions(actions) {
  const orderedActionTypes: string[] = [
    "removeIndex",
    "removeColumn",
    "dropTable",
    "createTable",
    "addColumn",
    "changeColumn",
    "addIndex",
  ];

  actions.sort((a, b) => {
    if (
      orderedActionTypes.indexOf(a.actionType) <
      orderedActionTypes.indexOf(b.actionType)
    ) {
      return -1;
    }
    if (
      orderedActionTypes.indexOf(a.actionType) >
      orderedActionTypes.indexOf(b.actionType)
    ) {
      return 1;
    }

    if (a.depends.length === 0 && b.depends.length > 0) {
      return -1;
    } // a < b
    if (b.depends.length === 0 && a.depends.length > 0) {
      return 1;
    } // b < a

    return 0;
  });

  for (let k = 0; k <= actions.length; k++) {
    for (let i = 0; i < actions.length; i++) {
      if (!actions[i].depends) {
        continue;
      }
      if (actions[i].depends.length === 0) {
        continue;
      }

      const a = actions[i];

      for (let j = 0; j < actions.length; j++) {
        if (!actions[j].depends) {
          continue;
        }
        if (actions[j].depends.length === 0) {
          continue;
        }

        const b = actions[j];

        if (a.actionType != b.actionType) {
          continue;
        }

        if (b.depends.indexOf(a.tableName) !== -1 && i > j) {
          const c = actions[i];
          actions[i] = actions[j];
          actions[j] = c;
        }
      }
    }
  }
}
