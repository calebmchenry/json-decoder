import { StreamBuffer } from "./Buffer.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { mockStreamBuffer } from "./testutils.ts";
import { assertNever } from "./utils.ts";
import { Err } from "./err.ts";
import { assertEquals } from "https://deno.land/std@0.134.0/testing/asserts.ts";

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

//
// value -> EOF
// |
// -> { -> }
//      -> key -> value -> , -> key -> value
//                      -> }
// -> [ -> ]
//      -> value -> ]
//               -> , -> value
// -> primative
//
type State =
  | "Value"
  | "ObjectCloseOrKey"
  | "ObjectCloseOrComma"
  | "Key"
  | "ArrayCloseOrComma"
  | "EOF";

export type JSONPrimativeValue = string | number | boolean | null;

export type JSONValueToken = { kind: "VALUE"; value: JSONPrimativeValue };
export type JSONOpenObjectToken = { kind: "{"; value: "{" };
export type JSONKeyToken = { kind: "KEY"; value: string };
export type JSONCloseObjectToken = { kind: "}"; value: "}" };
export type JSONOpenArrayToken = { kind: "["; value: "[" };
export type JSONCloseArrayToken = { kind: "]"; value: "]" };

export type JSONToken =
  | JSONValueToken
  | JSONOpenObjectToken
  | JSONKeyToken
  | JSONCloseObjectToken
  | JSONOpenArrayToken
  | JSONCloseArrayToken;
export const JSONToken = {
  key(key: string): JSONKeyToken {
    return { kind: "KEY", value: key };
  },
  value(value: JSONPrimativeValue): JSONValueToken {
    return { kind: "VALUE", value };
  },
  openObject(): JSONOpenObjectToken {
    return { kind: "{", value: "{" };
  },
  closeObject(): JSONCloseObjectToken {
    return { kind: "}", value: "}" };
  },
  openArray(): JSONOpenArrayToken {
    return { kind: "[", value: "[" };
  },
  closeArray(): JSONCloseArrayToken {
    return { kind: "]", value: "]" };
  },
  match(
    token: JSONToken,
    matches: {
      "key"?: () => void;
      "value"?: () => void;
      "{"?: () => void;
      "}"?: () => void;
      "["?: () => void;
      "]"?: () => void;
      "_"?: () => void;
    } = {
      "key": undefined,
      "value": undefined,
      "{": undefined,
      "}": undefined,
      "[": undefined,
      "]": undefined,
      "_": () => {},
    },
  ): void {
    const fn = () => {};
    switch (token.kind) {
      case "KEY":
        return (matches.key ?? matches["_"] ?? fn)();
      case "VALUE":
        return (matches.value ?? matches["_"] ?? fn)();
      case "{":
        return (matches["{"] ?? matches["_"] ?? fn)();
      case "}":
        return (matches["}"] ?? matches["_"] ?? fn)();
      case "[":
        return (matches["["] ?? matches["_"] ?? fn)();
      case "]":
        return (matches["]"] ?? matches["_"] ?? fn)();
      default:
        assertNever(token);
    }
  },
};

const allowedNumbers = new Set([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
]);
function isNumber(char: string): boolean {
  return allowedNumbers.has(char);
}

async function parseValue(
  buffer: StreamBuffer,
): Promise<[string | number | boolean | null | undefined, State] | Error> {
  await buffer.consumeWhitespace();
  const char = await buffer.peek();
  if (char === "{") return [undefined, "Key"];
  if (char === "[") return [undefined, "Value"];
  if (char === '"') {
    const val = await decodeString(buffer);
    if (val instanceof Error) return val;
    return [val, "EOF"];
  }
  if (isNumber(char)) {
    const val = await decodeNumber(buffer);
    if (val instanceof Error) return val;
    return [val, "EOF"];
  }
  if (char === "t" || char === "f") {
    const val = await decodeBoolean(buffer);
    if (val instanceof Error) return val;
    return [val, "EOF"];
  }
  if (char === "n") {
    const val = await decodeNull(buffer);
    if (val instanceof Error) return val;
    return [val, "EOF"];
  }
  return Err.unexpectedToken(char);
}

async function parseKey(buffer: StreamBuffer) {
  const str = await decodeString(buffer);
  if (str instanceof Error) return str;
  return JSONToken.key(str);
}

async function parseComma(buffer: StreamBuffer): Promise<"," | Error> {
  await buffer.consumeWhitespace();
  const comma = await buffer.next();
  if (comma !== ",") return Err.unexpectedToken(comma);
  return comma;
}

async function parseObjectClose(buffer: StreamBuffer): Promise<"}" | Error> {
  await buffer.consumeWhitespace();
  const closeCurly = await buffer.next();
  if (closeCurly !== "}") return Err.unexpectedToken(closeCurly);
  return closeCurly;
}

async function parseObjectCloseOrKey(buffer: StreamBuffer) {
  await buffer.consumeWhitespace();
  const char = await buffer.peek();
  if (char === "}") {
    await parseObjectClose(buffer);
    // TODO(calebmchenry): this isn't right. This should signafy to unwind the recursion
    return "EOF";
  }
  await parseKey(buffer);
  return "Value";
}

async function parseObjectCloseOrComma(
  buffer: StreamBuffer,
): Promise<State | Error> {
  await buffer.consumeWhitespace();
  const char = await buffer.peek();
  if (char === "}") {
    await parseObjectClose(buffer);
    // TODO(calebmchenry): this isn't right. This should signafy to unwind the recursion
    return "EOF";
  }
  if (char === ",") {
    await parseComma(buffer);
    return "Value";
  }
  return Err.unexpectedToken(char);
}

async function parseArrayCloserOrComma(buffer: StreamBuffer) {
  await buffer.consumeWhitespace();
  const char = await buffer.peek();
  if (char === "]") {
    await parseObjectClose(buffer);
    // TODO(calebmchenry): this isn't right. This should signafy to unwind the recursion
    return "EOF";
  }
  if (char === ",") {
    await parseComma(buffer);
    return "Value";
  }
  return Err.unexpectedToken(char);
}

function parseEOF(): Promise<Error> {
  return Promise.resolve(Err.EOF);
}

describe("Parse", () => {
  it("parseKey", async () => {
    const fooStream = mockStreamBuffer(JSON.stringify("foo"));
    assertEquals(await parseKey(fooStream), { kind: "KEY", value: "foo" });
  });
  it("parseComma", async () => {
    const stream = mockStreamBuffer("    ,");
    assertEquals(await parseComma(stream), ",");
  });
  it("parseObjectClose", async () => {
    const stream = mockStreamBuffer("    }");
    assertEquals(await parseObjectClose(stream), "}");
  });
  it("parseObjectCloseOrKey", async () => {
    const commaStream = mockStreamBuffer('    "foo"');
    assertEquals(await parseObjectCloseOrKey(commaStream), "Value");
    const closeStream = mockStreamBuffer("    }");
    assertEquals(await parseObjectCloseOrKey(closeStream), "EOF");
  });
  it("parseObjectCloseOrComma", async () => {
    const commaStream = mockStreamBuffer("    ,");
    assertEquals(await parseObjectCloseOrComma(commaStream), "Value");
    const closeStream = mockStreamBuffer("    }");
    assertEquals(await parseObjectCloseOrComma(closeStream), "EOF");
  });
  it("parseArrayCloseOrComma", async () => {
    const commaStream = mockStreamBuffer("    ,");
    assertEquals(await parseArrayCloserOrComma(commaStream), "Value");
    const closeStream = mockStreamBuffer("    ]");
    assertEquals(await parseArrayCloserOrComma(closeStream), "EOF");
  });
  it("EOF", async () => {
    assertEquals(await parseEOF(), Err.EOF);
  });
});
