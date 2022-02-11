import {Sequelize,} from "sequelize-typescript";
import {DataType} from "sequelize";

// interface IDataType {
//   key: string;
//   dialectTypes: string;
//   toSql(): string;
//   stringify(value: unknown, options?: object): string;
//   toString(options: object): string;
//   options?: IDataTypeOptions;
// }

// interface IDataTypeOptions {
//   length?: string;
//   binary?: boolean;
//   zerofill?: boolean;
//   unsigned?: boolean;
//   decimals?: number;
//   precision?: number;
//   scale?: number;
//   type?: string;
//   srid?: number;
// }

export default function reverseSequelizeColType(
    sequelize: Sequelize,
    attrType: any,
    prefix = "Sequelize."
) {
    if (attrType.constructor.name === "VIRTUAL") {
        return `${prefix}VIRTUAL`;
    }

    if (attrType.constructor.name === "CHAR") {
        if (!attrType.options) {
            return `${prefix}CHAR`;
        }
        const postfix = attrType.options.binary ? ".BINARY" : "";
        return `${prefix}CHAR${postfix}`;
    }

    if (attrType.constructor.name === "STRING") {
        if (attrType.options === undefined) {
            return `${prefix}STRING`;
        }

        if (attrType.options.binary !== undefined) {
            return `${prefix}STRING.BINARY`;
        }
        const length =
            attrType.options.length !== undefined
                ? `(${attrType.options.length})`
                : "";
        return `${prefix}STRING${length}`;
    }

    if (attrType.constructor.name === "TEXT") {
        if (!attrType.options.length) {
            return `${prefix}TEXT`;
        }
        const postfix = `('${attrType.options.length.toLowerCase()}')`;
        return `${prefix}TEXT(${postfix})`;
    }

    if (attrType.constructor.name === "DECIMAL") {
        const params = [];

        if (attrType.options.precision) {
            params.push(attrType.options.precision);
        }
        if (attrType.options.scale) {
            params.push(attrType.options.scale);
        }
        const postfix = params.length > 0 ? `(${params.join(",")})` : "";
        return `${prefix}DECIMAL${postfix}`;
    }

    if (
        ["TINYINT", "SMALLINT", "MEDIUMINT", "INTEGER", "BIGINT"].indexOf(
            attrType.constructor.name
        ) >= 0
    ) {
        const params = [];

        if (attrType.options.length) {
            params.push(attrType.options.length);
        }
        if (attrType.options.decimals) {
            params.push(attrType.options.decimals);
        }
        let postfix = params.length > 0 ? `(${params.join(",")})` : "";

        if (attrType.options.zerofill) {
            postfix += ".ZEROFILL";
        }

        if (attrType.options.unsigned) {
            postfix += ".UNSIGNED";
        }

        return `${prefix}${attrType.key}${postfix}`;
    }

    if (attrType.constructor.name === "DATE") {
        const length = attrType.options.length
            ? `(${attrType.options.length})`
            : "";
        return `${prefix}DATE${length}`;
    }

    if (attrType.constructor.name === "DATEONLY") {
        return `${prefix}DATEONLY`;
    }
    if (attrType.constructor.name === "JSONTYPE") {
        return `${prefix}JSON`;
    }


    if (attrType.constructor.name === "BLOB") {
        const postfix = `'${attrType.options.length.toLowerCase()}'`;
        return `${prefix}BLOB(${postfix})`;
    }

    if (attrType.constructor.name === "ENUM") {
        return `${prefix}ENUM('${attrType.options.values.join("', '")}')`;
    }

    if (attrType.constructor.name === "GEOMETRY") {
        if (attrType.options.type == undefined) {
            return `${prefix}GEOMETRY`;
        }
        const type = attrType.options.type.toUpperCase();
        const srid = attrType.options.srid;
        const postfixItems = [`'${type}'`];
        if (srid !== undefined) {
            postfixItems.push(attrType.options.srid.toString());
        }
        return `${prefix}GEOMETRY(${postfixItems.join(",")})`;
    }

    if (attrType.constructor.name === "GEOGRAPHY") {
        if (attrType.options.type == undefined) {
            return `${prefix}GEOGRAPHY`;
        }
        const type = attrType.options.type.toUpperCase();
        const srid = attrType.options.srid;
        const postfixItems = [`'${type}'`];
        if (srid !== undefined) {
            postfixItems.push(attrType.options.srid.toString());
        }
        return `${prefix}GEOGRAPHY(${postfixItems.join(",")})`;
    }

    // ARRAY ( PostgreSQL only )
    if (attrType.constructor.name === "ARRAY") {
        const type: DataType = attrType.options.type;
        const innerType = reverseSequelizeColType(sequelize, attrType);
        return `${prefix}ARRAY(${innerType})`;
    }

    // RANGE ( PostgreSQL only )
    if (attrType.constructor.name === "RANGE") {
        const type: DataType = attrType.options.subtype;
        const innerType = reverseSequelizeColType(sequelize, attrType);
        return `${prefix}RANGE(${innerType})`;
    }

    let seqType;
    [
        "BOOLEAN",
        "TIME",
        "HSTORE",
        "JSON",
        "JSONB",
        "NOW",
        "UUID",
        "UUIDV1",
        "UUIDV4",
        "JSONTYPE",
        "DOUBLE",
        "CIDR",
        "INET",
        "MACADDR",
        "CITEXT",
    ].forEach(typeName => {
        if (attrType.constructor.name === typeName) {
            seqType = `${prefix}${typeName}`;
        }
    });
    if (seqType) {
        return seqType;
    }

    // not supported
    console.log("not supported ..." + attrType.constructor.name);
    return `${prefix}VIRTUAL`;
    // handle function
    // if (
    //   attrType.options !== undefined &&
    //   typeof attrType.options.toString === "function"
    // ) {
    //   seqType = attrType.options.toString(sequelize);
    // }

    // if (typeof type.toString === "function") {
    //   seqType = type.toString(sequelize);
    // }

    // return seqType;
}
