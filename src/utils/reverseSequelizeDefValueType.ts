export default function reverseSequelizeDefValueType(
  defaultValue,
  prefix = "Sequelize."
) {
  if (typeof defaultValue.fn !== "undefined") {
    return {
      internal: true,
      value: `${prefix}fn('${defaultValue.fn}')`
    };
  }

  if (defaultValue.constructor.name == "NOW") {
    return {
      internal: true,
      value: `${prefix}NOW`
    };
  }

  if (defaultValue.constructor.name == "UUIDV1") {
    return {
      internal: true,
      value: `${prefix}UUIDV1`
    };
  }

  if (defaultValue.constructor.name == "UUIDV4") {
    return {
      internal: true,
      value: `${prefix}UUIDV4`
    };
  }

  if (typeof defaultValue === "function") {
    return { notSupported: true, value: "" };
  }

  return { value: defaultValue };
}
