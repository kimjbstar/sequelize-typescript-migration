import { IAction } from "./getDiffActionsFromTables";

export default function sortActions(actions: IAction[]) {
  const orderedActionTypes: string[] = [
    "removeIndex",
    "removeColumn",
    "dropTable",
    "createTable",
    "addColumn",
    "changeColumn",
    "addIndex",
  ];

  const sortByLengthExists = (left: any[], right: any[]) => {
    if (left.length === 0 && right.length > 0) {
      return -1;
    } // left < right
    if (right.length === 0 && left.length > 0) {
      return 1;
    } // right < left

    return 0;
  };

  actions.sort((left: IAction, right: IAction) => {
    if (
      orderedActionTypes.indexOf(left.actionType) <
      orderedActionTypes.indexOf(right.actionType)
    ) {
      return -1;
    }
    if (
      orderedActionTypes.indexOf(left.actionType) >
      orderedActionTypes.indexOf(right.actionType)
    ) {
      return 1;
    }

    if (left.actionType === "dropTable" && right.actionType === "dropTable") {
      return sortByLengthExists(right.depends, left.depends);
    }
    return sortByLengthExists(left.depends, right.depends);
  });

  for (let i = 0; i < actions.length; i++) {
    const leftAction: IAction = actions[i];
    if (leftAction.depends.length === 0) {
      continue;
    }

    for (let j = 0; j < actions.length; j++) {
      const rightAction: IAction = actions[j];
      if (rightAction.depends.length === 0) {
        continue;
      }

      if (leftAction.actionType != rightAction.actionType) {
        continue;
      }

      if (rightAction.depends.indexOf(leftAction.tableName) !== -1) {
        if (i > j) {
          const c = actions[i];
          actions[i] = actions[j];
          actions[j] = c;
        }
      }
    }
  }
  return actions;
}
