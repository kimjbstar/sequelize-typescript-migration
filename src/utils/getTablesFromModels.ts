import { Sequelize } from "sequelize-typescript";
import { ModelCtor, Model, ModelAttributeColumnOptions } from "sequelize/types";
import reverseSequelizeColType from "./reverseSequelizeColType";
import reverseSequelizeDefValueType from "./reverseSequelizeDefValueType";
import parseIndex from "./parseIndex";

export default function reverseModels(
  sequelize: Sequelize,
  models: {
    [key: string]: ModelCtor<Model>;
  }
) {
  const tables = {};
  for (let [modelKey, model] of Object.entries(models)) {
    const attributes: {
      [key: string]: ModelAttributeColumnOptions;
    } = model.rawAttributes;

    const resultAttributes = {};

    for (let [column, attribute] of Object.entries(attributes)) {
      let rowAttribute = {};

      if (attribute.defaultValue) {
        const _val = reverseSequelizeDefValueType(attribute.defaultValue);
        if (_val.notSupported) {
          console.log(
            `[Not supported] Skip defaultValue column of attribute ${model}:${column}`
          );
          continue;
        }
        rowAttribute["defaultValue"] = _val;
      }

      if (attribute.type === undefined) {
        console.log(
          `[Not supported] Skip column with undefined type ${model}:${column}`
        );
        continue;
      }

      const seqType: string = reverseSequelizeColType(
        sequelize,
        attribute.type
      );
      if (seqType === "Sequelize.VIRTUAL") {
        console.log(
          `[SKIP] Skip Sequelize.VIRTUAL column "${column}"", defined in model "${model}"`
        );
        continue;
      }

      rowAttribute = {
        seqType: seqType,
      };

      [
        "allowNull",
        "unique",
        "primaryKey",
        "autoIncrement",
        "autoIncrementIdentity",
        "comment",
        "references",
        "onUpdate",
        "onDelete",
        "validate",
      ].forEach(key => {
        if (attribute[key] !== undefined) {
          rowAttribute[key] = attribute[key];
        }
      });

      resultAttributes[column] = rowAttribute;
    } // attributes in model

    tables[model.tableName] = {
      tableName: model.tableName,
      schema: resultAttributes,
    };

    let idx_out = {};
    if (model.options.indexes.length > 0) {
      for (const _i in model.options.indexes) {
        const index = parseIndex(model.options.indexes[_i]);
        idx_out[`${index["hash"]}`] = index;
        delete index["hash"];
      }
    }
    tables[model.tableName].indexes = idx_out;
  } // model in models

  return tables;
}
