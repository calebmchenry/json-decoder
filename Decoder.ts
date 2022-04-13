import {
  assertEquals,
  assertInstanceOf,
} from "https://deno.land/std@0.134.0/testing/asserts.ts";
import { StreamBuffer } from "./Buffer.ts";

export type JSONValue =
  | "JSONBoolean"
  | "JSONNumber"
  | "JSONString"
  | "JSONNull"
  | "JSONArray"
  | "JSONObject";

export type JSONToken = "VALUE" | "{" | "KEY" | "}" | "[" | "]";

export class Decoder {
  #stream: ReadableStream;
  constructor(stream: ReadableStream) {
    this.#stream = stream;
  }

  decode() {
  }

  /** Returns true if there are more tokens to be consumed */
  more(): boolean {
    return true;
  }

  /** Consumes token */
  token() {
  }

  // Private API
}

const UNEXPECTED_END = new SyntaxError("Unexpected end of JSON input");

async function decodeString(buffer: StreamBuffer): Promise<string | Error> {
  let jsonString = "";
  let escaped = false;
  // consume beginning "
  await buffer.next();
  while (true) {
    const char = await buffer.next();
    if (char === "") return UNEXPECTED_END;
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

function mockStreamBuffer(str: string) {
  const stream = new ReadableStream({
    start(control) {
      control.enqueue(str);
      control.close();
    },
  });
  return new StreamBuffer(stream);
}

Deno.test({ name: "decodeString" }, async () => {
  const NEW_LINE = "\n";
  assertEquals(await decodeString(mockStreamBuffer(JSON.stringify(""))), "");
  assertEquals(await decodeString(mockStreamBuffer(JSON.stringify("a"))), "a");
  assertEquals(
    await decodeString(mockStreamBuffer(JSON.stringify("abc"))),
    "abc",
  );
  assertEquals(await decodeString(mockStreamBuffer('"abc"q')), "abc");
  assertEquals(
    await decodeString(mockStreamBuffer(JSON.stringify('abc"d'))),
    'abc"d',
  );
  assertEquals(
    await decodeString(mockStreamBuffer(JSON.stringify('abc\\"d'))),
    'abc\\"d',
  );
  assertEquals(
    await decodeString(mockStreamBuffer(JSON.stringify(`abc${NEW_LINE}"d`))),
    `abc${NEW_LINE}"d`,
  );
  assertInstanceOf(await decodeString(mockStreamBuffer('"Hello')), SyntaxError);
});

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
async function decodeNumber(buffer: StreamBuffer): Promise<number | Error> {
  let jsonNumber = "";
  let hasDecimal = false;
  let i = -1;
  while (await buffer.peek() === "." || isNumber(await buffer.peek())) {
    i++;
    const char = await buffer.next();
    if (char === "") return UNEXPECTED_END;
    if (char === ".") {
      if (i === 0) {
        return new SyntaxError(`Unexpected token ${char} in JSON position x`);
      }
      if (hasDecimal) {
        return new SyntaxError(`Unexpected token ${char} in JSON position x`);
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

Deno.test({ name: "decodeNumber" }, async () => {
  assertEquals(await decodeNumber(mockStreamBuffer("0")), 0);
  assertEquals(await decodeNumber(mockStreamBuffer("1")), 1);
  assertEquals(await decodeNumber(mockStreamBuffer("123")), 123);
  assertEquals(await decodeNumber(mockStreamBuffer("0.5")), 0.5);
  assertInstanceOf(await decodeNumber(mockStreamBuffer("0.5.5")), SyntaxError);
  assertInstanceOf(await decodeNumber(mockStreamBuffer(".1")), SyntaxError);
});

const stringifiedNull = "null";
async function decodeNull(buffer: StreamBuffer): Promise<null | Error> {
  for (let i = 0; i < stringifiedNull.length; i++) {
    const char = await buffer.next();
    if (char === "") return UNEXPECTED_END;
    if (char !== stringifiedNull[i]) {
      return new SyntaxError(`Unexpected token ${char} at position x`);
    }
  }
  return null;
}

Deno.test({ name: "decodeNull" }, async () => {
  assertEquals(await decodeNull(mockStreamBuffer("null")), null);
  assertInstanceOf(await decodeNull(mockStreamBuffer("n")), SyntaxError);
  assertInstanceOf(await decodeNull(mockStreamBuffer("nu")), SyntaxError);
  assertInstanceOf(await decodeNull(mockStreamBuffer("nul")), SyntaxError);
  assertInstanceOf(await decodeNull(mockStreamBuffer("fake")), SyntaxError);
  assertInstanceOf(await decodeNull(mockStreamBuffer("xull")), SyntaxError);
  assertInstanceOf(await decodeNull(mockStreamBuffer("nxll")), SyntaxError);
  assertInstanceOf(await decodeNull(mockStreamBuffer("nuxl")), SyntaxError);
  assertInstanceOf(await decodeNull(mockStreamBuffer("nulx")), SyntaxError);
});

const stringifiedTrue = "true";
const stringifiedFalse = "false";
async function decodeBoolean(buffer: StreamBuffer): Promise<boolean | Error> {
  const firstChar = await buffer.peek();
  const match = firstChar === "t" ? stringifiedTrue : stringifiedFalse;
  for (let i = 0; i < match.length; i++) {
    const char = await buffer.next();
    if (char === undefined) return UNEXPECTED_END;
    if (char !== match[i]) {
      return new SyntaxError(`Unexpected token ${char} at position x`);
    }
  }
  return match === stringifiedTrue;
}

Deno.test({ name: "decodeBoolean" }, async () => {
  assertEquals(await decodeBoolean(mockStreamBuffer("true")), true);
  assertEquals(await decodeBoolean(mockStreamBuffer("tru")), UNEXPECTED_END);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("xrue")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("txue")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("trxe")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("trux")), SyntaxError);
  assertEquals(await decodeBoolean(mockStreamBuffer("false")), false);
  assertEquals(await decodeBoolean(mockStreamBuffer("fals")), UNEXPECTED_END);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("xalse")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("fxlse")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("faxse")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("falxe")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("falsx")), SyntaxError);
});

async function decodeArray(buffer: StreamBuffer): Promise<unknown[]> {
  const firstChar = await buffer.next();
  const secondChar = await buffer.peek();
  const arr: unknown[] = [];
  if (firstChar !== "[") {
    return Promise.reject(
      new SyntaxError(`Unexpected token ${firstChar} at position x`),
    );
  }
  if (secondChar === "]") return arr;

  try {
    const val = await decodeJSONValue(buffer);
    arr.push(val);

    return arr;
  } catch (err) {
    return err;
  }
}

Deno.test({ name: "decodeArray" }, async () => {
  assertEquals(await decodeArray(mockStreamBuffer("[]")), []);
  // TODO(calebmchenry): handle spaces
  assertEquals(await decodeArray(mockStreamBuffer("[true]")), [true]);
  // TODO(calebmchenry)
  // assertInstanceOf(decodeArray("[true"), SyntaxError);
});

async function decodeObject(
  _: string,
): Promise<{ [key: string]: unknown } | Error> {
  return {};
}

Deno.test({ name: "decodeObject" }, async () => {
  assertEquals(await decodeObject("{}"), {});
});

async function whichJSONValue(
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
  return Promise.resolve(undefined);
}

Deno.test({ name: "whichJSONValue" }, async () => {
  assertEquals(await whichJSONValue(mockStreamBuffer("true")), "JSONBoolean");
  assertEquals(await whichJSONValue(mockStreamBuffer("false")), "JSONBoolean");
  assertEquals(await whichJSONValue(mockStreamBuffer("null")), "JSONNull");
  assertEquals(await whichJSONValue(mockStreamBuffer('"Hello"')), "JSONString");
  assertEquals(await whichJSONValue(mockStreamBuffer("42")), "JSONNumber");
  assertEquals(await whichJSONValue(mockStreamBuffer("[ 4 ]")), "JSONArray");
  assertEquals(await whichJSONValue(mockStreamBuffer("{ 4 }")), "JSONObject");
  assertEquals(await whichJSONValue(mockStreamBuffer("bad")), undefined);
});

type DecodedJSONValue = boolean | null | string | number | unknown[] | {
  [key: string]: unknown;
};
async function decodeJSONValue(
  buffer: StreamBuffer,
): Promise<DecodedJSONValue | Error> {
  switch (await whichJSONValue(buffer)) {
    case "JSONBoolean":
      return await decodeBoolean(buffer);
    case "JSONNull":
      return await decodeNull(buffer);
    case "JSONString":
      return await decodeString(buffer);
    case "JSONNumber":
      return await decodeNumber(buffer);
    case "JSONArray":
      return [];
    case "JSONObject":
      return {};
    default:
      return Promise.reject(
        new Error(`[DEBUG]: unknown json value "${buffer}"`),
      );
  }
}

Deno.test({ name: "decodeJSONValue" }, async () => {
  assertEquals(await decodeJSONValue(mockStreamBuffer("true")), true);
  assertEquals(await decodeJSONValue(mockStreamBuffer("false")), false);
  assertEquals(await decodeJSONValue(mockStreamBuffer("null")), null);
  assertEquals(await decodeJSONValue(mockStreamBuffer('"Hello"')), "Hello");
  assertEquals(await decodeJSONValue(mockStreamBuffer("42")), 42);
  assertEquals(await decodeJSONValue(mockStreamBuffer("[]")), []);
  assertEquals(await decodeJSONValue(mockStreamBuffer("{}")), {});
});
