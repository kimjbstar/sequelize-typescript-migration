import { IndexesOptions } from "sequelize/types";
import * as crypto from "crypto";

export default function parseIndex(idx: IndexesOptions) {
  let result = {};

  [
    "name",
    "type",
    "unique",
    "concurrently",
    "fields",
    "using",
    "operator",
    "where"
  ].forEach(key => {
    if (idx[key] !== undefined) {
      result[key] = idx[key];
    }
  });

  const options = {};

  if (idx.name) {
    options["indexName"] = idx.name;
  } // The name of the index. Default is __

  // @todo: UNIQUE|FULLTEXT|SPATIAL
  if (idx.unique) {
    options["indicesType"] = "UNIQUE";
  }

  // Set a type for the index, e.g. BTREE. See the documentation of the used dialect
  //   if (idx.method) {
  //     options["indexType"] = idx.type;
  //   }

  if (idx.parser && idx.parser !== "") {
    options["parser"] = idx.parser;
  } // For FULLTEXT columns set your parser

  result["options"] = options;

  //   result["hash"] = hash(idx);
  result["hash"] = crypto
    .createHash("sha1")
    .update(JSON.stringify(idx))
    .digest("hex");

  return result;
}
