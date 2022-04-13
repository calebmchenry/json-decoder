import {
  assertEquals,
  assertInstanceOf,
} from "https://deno.land/std/testing/asserts.ts";

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

function decodeString(str: string): string | Error {
  let jsonString = "";
  let escaped = false;
  for (let i = 1; i < str.length; i++) {
    const char = str[i];
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

Deno.test({ name: "decodeString" }, () => {
  const NEW_LINE = "\n";
  assertEquals(decodeString(JSON.stringify("")), "");
  assertEquals(decodeString(JSON.stringify("a")), "a");
  assertEquals(decodeString(JSON.stringify("abc")), "abc");
  assertEquals(decodeString('"abc"q'), "abc");
  assertEquals(decodeString(JSON.stringify('abc"d')), 'abc"d');
  assertEquals(decodeString(JSON.stringify('abc\\"d')), 'abc\\"d');
  assertEquals(
    decodeString(JSON.stringify(`abc${NEW_LINE}"d`)),
    `abc${NEW_LINE}"d`,
  );
  // TODO(calebmchenry): handle no closing "
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
function decodeNumber(str: string): number | Error {
  let jsonNumber = "";
  let hasDecimal = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
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

Deno.test({ name: "decodeNumber" }, () => {
  assertEquals(decodeNumber("0"), 0);
  assertEquals(decodeNumber("1"), 1);
  assertEquals(decodeNumber("123"), 123);
  assertEquals(decodeNumber("0.5"), 0.5);
  assertInstanceOf(decodeNumber("0.5.5"), SyntaxError);
  assertInstanceOf(decodeNumber(".1"), SyntaxError);
});

const stringifiedNull = "null";
function decodeNull(str: string): null | Error {
  for (let i = 0; i < stringifiedNull.length; i++) {
   	const char = str[i];
    if (char === undefined) return UNEXPECTED_END;
    if (char !== stringifiedNull[i]) {
      return new SyntaxError(`Unexpected token ${str[i]} at position x`);
    }
  }
  return null;
}

Deno.test({ name: "decodeNull" }, () => {
  assertEquals(decodeNull("null"), null);
  assertInstanceOf(decodeNull("n"), SyntaxError);
  assertInstanceOf(decodeNull("nu"), SyntaxError);
  assertInstanceOf(decodeNull("nul"), SyntaxError);
  assertInstanceOf(decodeNull("fake"), SyntaxError);
  assertInstanceOf(decodeNull("xull"), SyntaxError);
  assertInstanceOf(decodeNull("nxll"), SyntaxError);
  assertInstanceOf(decodeNull("nuxl"), SyntaxError);
  assertInstanceOf(decodeNull("nulx"), SyntaxError);
});

const stringifiedTrue = "true";
const stringifiedFalse = "false";
function decodeBoolean(str: string): boolean | Error {
  const firstChar = str[0];
  const match = firstChar === "t" ? stringifiedTrue : stringifiedFalse;
  for (let i = 0; i < match.length; i++) {
    const char = str[i];
    if (char === undefined) return UNEXPECTED_END;
    if (char !== match[i]) {
      return new SyntaxError(`Unexpected token ${str[i]} at position x`);
    }
  }
  return match === stringifiedTrue;
}

Deno.test({ name: "decodeBoolean" }, () => {
  assertEquals(decodeBoolean("true"), true);
  assertEquals(decodeBoolean("tru"), UNEXPECTED_END);
  assertInstanceOf(decodeBoolean("xrue"), SyntaxError);
  assertInstanceOf(decodeBoolean("txue"), SyntaxError);
  assertInstanceOf(decodeBoolean("trxe"), SyntaxError);
  assertInstanceOf(decodeBoolean("trux"), SyntaxError);
  assertEquals(decodeBoolean("false"), false);
  assertEquals(decodeBoolean("fals"), UNEXPECTED_END);
  assertInstanceOf(decodeBoolean("xalse"), SyntaxError);
  assertInstanceOf(decodeBoolean("fxlse"), SyntaxError);
  assertInstanceOf(decodeBoolean("faxse"), SyntaxError);
  assertInstanceOf(decodeBoolean("falxe"), SyntaxError);
  assertInstanceOf(decodeBoolean("falsx"), SyntaxError);
});

function decodeArray(str: string): unknown[] | Error {
	const firstChar = str[0]
	const secondChar = str[1]
	let arr: unknown[] = []
	if(firstChar !== '[') return SyntaxError(`Unexpected token ${firstChar} at position x`)
	if(secondChar === ']') return arr

	const val = decodeJSONValue(str.substring(1))
	if(val instanceof Error) {return val}
	arr.push(val)

	return arr
}

Deno.test({ name: "decodeArray" }, () => {
  assertEquals(decodeArray("[]"), []);
	// TODO(calebmchenry): handle spaces
  assertEquals(decodeArray("[true]"), [true]);
	// TODO(calebmchenry)
  // assertInstanceOf(decodeArray("[true"), SyntaxError);
});

function decodeObject(): { [key: string]: unknown } | Error {
  return {};
}

Deno.test({ name: "decodeObject" }, () => {
});

function whichJSONValue(str: string): JSONValue | undefined {
  const firstChar = str[0];
  if (firstChar === "t") return "JSONBoolean";
  if (firstChar === "f") return "JSONBoolean";
  if (firstChar === "n") return "JSONNull";
  if (firstChar === '"') return "JSONString";
  if (isNumber(firstChar)) return "JSONNumber";
  if (firstChar === "[") return "JSONArray";
  if (firstChar === "{") return "JSONObject";
  return;
}

Deno.test({ name: "whichJSONValue" }, () => {
  assertEquals(whichJSONValue("true"), "JSONBoolean");
  assertEquals(whichJSONValue("false"), "JSONBoolean");
  assertEquals(whichJSONValue("null"), "JSONNull");
  assertEquals(whichJSONValue('"Hello"'), "JSONString");
  assertEquals(whichJSONValue("42"), "JSONNumber");
  assertEquals(whichJSONValue("[ 4 ]"), "JSONArray");
  assertEquals(whichJSONValue("{ 4 }"), "JSONObject");
  assertEquals(whichJSONValue("bad"), undefined);
});

type DecodedJSONValue = boolean | null | string | number | unknown[] | {
  [key: string]: unknown;
};
function decodeJSONValue(str: string): DecodedJSONValue | Error {
  switch (whichJSONValue(str)) {
    case "JSONBoolean":
      return decodeBoolean(str);
    case "JSONNull":
      return decodeNull(str);
    case "JSONString":
      return decodeString(str);
    case "JSONNumber":
      return decodeNumber(str);
    case "JSONArray":
      return [];
    case "JSONObject":
      return {};
    default:
      return new Error(`[DEBUG]: unknown json value "${str}"`);
  }
}

Deno.test({ name: "decodeJSONValue" }, () => {
  assertEquals(decodeJSONValue("true"), true);
  assertEquals(decodeJSONValue("false"), false);
  assertEquals(decodeJSONValue("null"), null);
  assertEquals(decodeJSONValue('"Hello"'), "Hello");
  assertEquals(decodeJSONValue("42"), 42);
  assertEquals(decodeJSONValue("[]"), []);
  assertEquals(decodeJSONValue("{}"), {});
});
