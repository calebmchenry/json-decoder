import { StreamBuffer } from "./Buffer.ts";
import { isNumber } from "./utils.ts";
import { Err } from "./err.ts";

export const Decode = {
  string: decodeString,
  number: decodeNumber,
  boolean: decodeBoolean,
  null: decodeNull,
  object: decodeObject,
  array: decodeArray,
  value: decodeValue,
};

type DecodedJSONValue = boolean | null | string | number | unknown[] | {
  [key: string]: unknown;
};

type JSONValue =
  | "JSONBoolean"
  | "JSONNumber"
  | "JSONString"
  | "JSONNull"
  | "JSONArray"
  | "JSONObject";

export async function whichJSONValue(
  buffer: StreamBuffer,
): Promise<JSONValue | undefined> {
  const firstChar = await buffer.peek();
  if (firstChar === "t") return "JSONBoolean";
  if (firstChar === "f") return "JSONBoolean";
  if (firstChar === "n") return "JSONNull";
  if (firstChar === '"') return "JSONString";
  if (isNumber(firstChar)) return "JSONNumber";
  if (firstChar === "[") return "JSONArray";
  if (firstChar === "{") return "JSONObject";
  return Promise.reject(
    new Error(`[DEBUG]: unexpected start of token "${firstChar}"`),
  );
}

export async function decodeValue(
  buffer: StreamBuffer,
): Promise<DecodedJSONValue | Error> {
  await buffer.consumeWhitespace();
  const type = await whichJSONValue(buffer);
  switch (type) {
    case "JSONBoolean":
      return await decodeBoolean(buffer);
    case "JSONNull":
      return await decodeNull(buffer);
    case "JSONString":
      return await decodeString(buffer);
    case "JSONNumber":
      return await decodeNumber(buffer);
    case "JSONArray":
      return await decodeArray(buffer);
    case "JSONObject":
      return await decodeObject(buffer);
    default:
      return Promise.reject(
        new Error(`[DEBUG]: unknown json value "${type}"`),
      );
  }
}

export async function decodeArray(
  buffer: StreamBuffer,
): Promise<unknown[] | Error> {
  const firstChar = await buffer.next();
  if (firstChar !== "[") {
    return Err.unexpectedToken(firstChar);
  }

  let first = true;
  const arr: unknown[] = [];
  while (await buffer.peek() != "]") {
    if (!first) {
      const comma = await buffer.next();
      if (comma != ",") {
        return Err.unexpectedToken(comma);
      }
    }
    try {
      const val = await decodeValue(buffer);
      arr.push(val);
    } catch (err) {
      return err;
    }
    first = false;
    await buffer.consumeWhitespace();
  }

  const closingChar = await buffer.next();
  if (closingChar !== "]") {
    return Err.unexpectedToken(closingChar);
  }
  return arr;
}

export async function decodeObject(
  buffer: StreamBuffer,
): Promise<{ [key: string]: unknown } | Error> {
  const firstChar = await buffer.next();
  if (firstChar !== "{") {
    return Err.unexpectedToken(firstChar);
  }

  let first = true;
  const obj: { [key: string]: unknown } = {};
  while (await buffer.peek() != "}") {
    if (!first) {
      const comma = await buffer.next();
      if (comma != ",") {
        return Err.unexpectedToken(comma);
      }
    }
    // TODO(calebmchenry): keys have more restrictions
    await buffer.consumeWhitespace();
    const key = await decodeString(buffer);
    if (key instanceof Error) return key;
    await buffer.consumeWhitespace();
    const colon = await buffer.next();
    if (colon !== ":") return Err.unexpectedToken(colon);

    const val = await decodeValue(buffer);
    if (val instanceof Error) return val;
    obj[key] = val;
    first = false;
    await buffer.consumeWhitespace();
  }

  const closingChar = await buffer.next();
  if (closingChar !== "}") {
    return Err.unexpectedToken(closingChar);
  }
  return obj;
}

const stringifiedNull = "null";
export async function decodeNull(buffer: StreamBuffer): Promise<null | Error> {
  for (let i = 0; i < stringifiedNull.length; i++) {
    const char = await buffer.next();
    if (char === "") return Err.unexpectedEnd();
    if (char !== stringifiedNull[i]) {
      return Err.unexpectedToken(char);
    }
  }
  return null;
}

const stringifiedTrue = "true";
const stringifiedFalse = "false";
export async function decodeBoolean(
  buffer: StreamBuffer,
): Promise<boolean | Error> {
  const firstChar = await buffer.peek();
  const match = firstChar === "t" ? stringifiedTrue : stringifiedFalse;
  for (let i = 0; i < match.length; i++) {
    const char = await buffer.next();
    if (char === undefined) return Err.unexpectedEnd();
    if (char !== match[i]) {
      return Err.unexpectedToken(char);
    }
  }
  return match === stringifiedTrue;
}

export async function decodeNumber(
  buffer: StreamBuffer,
): Promise<number | Error> {
  let jsonNumber = "";
  let hasDecimal = false;
  let i = -1;
  while (await buffer.peek() === "." || isNumber(await buffer.peek())) {
    i++;
    const char = await buffer.next();
    if (char === "") return Err.unexpectedEnd();
    if (char === ".") {
      if (i === 0) {
        return Err.unexpectedToken(char);
      }
      if (hasDecimal) {
        return Err.unexpectedToken(char);
      }
      hasDecimal = true;
      jsonNumber += char;
      continue;
    }
    if (!isNumber(char)) break;
    jsonNumber += char;
  }
  return parseFloat(jsonNumber);
}

export async function decodeString(buffer: StreamBuffer) {
  let jsonString = "";
  let escaped = false;
  // consume beginning "
  await buffer.next();
  while (true) {
    const char = await buffer.next();
    if (char === "") return Err.unexpectedEnd();
    if (escaped) {
      if (char === '"') {
        jsonString += char;
        escaped = false;
        continue;
      }
      if (char === "\\") {
        jsonString += char;
        escaped = false;
        continue;
      }
      if (char === "n") {
        jsonString += "\n";
        escaped = false;
      }
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') break;
    jsonString += char;
  }
  return jsonString;
}
