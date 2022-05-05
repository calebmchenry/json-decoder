import {
  assertEquals,
  assertInstanceOf,
} from "https://deno.land/std@0.134.0/testing/asserts.ts";
import { StreamBuffer } from "./Buffer.ts";
import { describe, it } from "https://deno.land/std@0.136.0/testing/bdd.ts";
import {mockStreamBuffer, mockReadableStream} from './testutils.ts'
import {Decode} from './decode.ts'

export type JSONValue =
  | "JSONBoolean"
  | "JSONNumber"
  | "JSONString"
  | "JSONNull"
  | "JSONArray"
  | "JSONObject";

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
	} ,
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

const EOF = new Error("End of File");
function assertNever(_: never) {}

// value -> EOF
// |
// -> { -> }
//      -> key -> value -> , -> key -> value
//											-> }
// -> [ -> ] 
//      -> value -> ]
//               -> , -> value
// -> primative
//

/**
 * Streaming JSON Decoder. Able to parse JSON on demand from a ReadableStream.
 * If you don't need to parse JSON from a stream then you should probably use
 * `JSON.parse` instead
 *
 * ```ts
 * import {Decoder} from "./Decoder.ts"
 *
 * const stream = new ReadableStream({
 *   start(control) {
 *     control.enqueue('{"foo": ["bar, "fizz", "buzz"]}');
 *     control.close();
 *   },
 * });
 *
 * const dec = new Decoder(stream)
 *
 * await dec.token()
 *
 * let strings = []
 * while(await dec.more()) {
 *   strings.push(await dec.decode())
 * }
 *
 * console.log(strings) // ["bar", "fizz", "buzz"]
 * ```
 */
export class Decoder {
  #buffer: StreamBuffer;
  #nextTokenStack: Array<() => Promise<JSONToken | Error>> = [
    this.#value.bind(this),
  ];
  constructor(stream: ReadableStream) {
    this.#buffer = new StreamBuffer(stream);
  }

  async decode(): Promise<unknown> {
    await consumeWhitespace(this.#buffer);
    const char = await this.#buffer.peek();
    if (char === ",") {
      await this.#buffer.next();
    }
    return Promise.resolve(await Decode.value(this.#buffer));
  }

  /** Returns true if there are more tokens to be consumed */
  async more(): Promise<boolean> {
    await consumeWhitespace(this.#buffer);
    const char = await this.#buffer.peek();
    return (char === ",")
      ? Promise.resolve(true)
      : Promise.resolve(false);
  }

  /** Consumes token */
  token(): Promise<JSONToken | Error> {
    const fn = this.#nextTokenStack.pop();
    if (fn == null) return Promise.resolve(EOF);
    return fn();
  }

  // Private API
  async #value(): Promise<JSONToken | Error> {
    await consumeWhitespace(this.#buffer);
    const char = await this.#buffer.peek();
    if (char === "{") {
      this.#nextTokenStack.push(this.#endObjectOrValue.bind(this));
      this.#nextTokenStack.push(this.#value.bind(this));
      this.#nextTokenStack.push(this.#key.bind(this));
      return JSONToken.openObject();
    }
    if (char === "[") {
      this.#nextTokenStack.push(this.#endArrayOrValue.bind(this));
      this.#nextTokenStack.push(this.#value.bind(this));
      return JSONToken.openArray();
    }
    const value = await Decode.value(this.#buffer);
    if (value instanceof Error) return value;
    // Since we have already manually checked for { and [ then we know this
    // value can't be an array or object and therefore must be a primative value
    return JSONToken.value(value as JSONPrimativeValue);
  }

  async #key(): Promise<JSONToken | Error> {
    const value = await Decode.string(this.#buffer);
    if (value instanceof Error) return value;
    consumeWhitespace(this.#buffer);
    const colon = await this.#buffer.next();
    if (colon != ":") return unexpectedToken(colon);
    this.#nextTokenStack.push(this.#value.bind(this));
    return JSONToken.key(value);
  }

  async #endObjectOrValue(): Promise<JSONToken | Error> {
    await consumeWhitespace(this.#buffer);
    const char = await this.#buffer.peek();
    if (char === "}") return this.#endObject();
    if (char === ",") {
      this.#nextTokenStack.push(this.#endObjectOrValue.bind(this));
      return this.#value();
    }
    return unexpectedToken(char);
  }

  async #endObject(): Promise<JSONToken | Error> {
    await consumeWhitespace(this.#buffer);
    const char = await this.#buffer.next();
    if (char !== "}") return unexpectedToken(char);
    return JSONToken.closeObject();
  }

  async #endArrayOrValue(): Promise<JSONToken | Error> {
    await consumeWhitespace(this.#buffer);
    const char = await this.#buffer.peek();
    if (char === "]") return this.#endArray();
    if (char === ",") {
      this.#nextTokenStack.push(this.#endArrayOrValue.bind(this));
      return this.#value();
    }
    return unexpectedToken(char);
  }

  async #endArray(): Promise<JSONToken | Error> {
    await consumeWhitespace(this.#buffer);
    const char = await this.#buffer.next();
    if (char !== "]") return unexpectedToken(char);
    return JSONToken.closeArray();
  }
}

describe("Decoder", () => {
  describe("token", () => {
    it("token", async () => {
      const stream = mockReadableStream('{"foo": ["bar", true, 42}');
      const dec = new Decoder(stream);
      assertEquals(await dec.token(), JSONToken.openObject());
      assertEquals(await dec.token(), JSONToken.key("foo"));
      assertEquals(await dec.token(), JSONToken.openArray());
    });
  });
});

function unexpectedEnd() {
  return new SyntaxError("Unexpected end of JSON input");
}

function unexpectedToken(char: string) {
  return new SyntaxError(`Unexpected token ${char} in JSON position x`);
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

Deno.test({ name: "isWhitespace" }, () => {
  assertEquals(isWhitespace(" "), true);
  assertEquals(isWhitespace("\t"), true);
  assertEquals(isWhitespace("\r"), true);
  assertEquals(isWhitespace("\n"), true);
  assertEquals(isWhitespace(""), false);
  assertEquals(isWhitespace("n"), false);
});

async function consumeWhitespace(buffer: StreamBuffer): Promise<void> {
  while (isWhitespace(await buffer.peek())) {
    await buffer.next();
  }
}

Deno.test({ name: "consumeWhitespace" }, async () => {
  const buffer = mockStreamBuffer("1 2\t3\n4\r5 \r\t\n\t\r 6");
  await consumeWhitespace(buffer);
  assertEquals(await buffer.peek(), "1");
  await buffer.next();
  await consumeWhitespace(buffer);
  assertEquals(await buffer.peek(), "2");
  await buffer.next();
  await consumeWhitespace(buffer);
  assertEquals(await buffer.peek(), "3");
  await buffer.next();
  await consumeWhitespace(buffer);
  assertEquals(await buffer.peek(), "4");
  await buffer.next();
  await consumeWhitespace(buffer);
  assertEquals(await buffer.peek(), "5");
  await buffer.next();
  await consumeWhitespace(buffer);
  assertEquals(await buffer.peek(), "6");
  await buffer.next();
  await consumeWhitespace(buffer);
  assertEquals(await buffer.peek(), "");
});

type DecodedJSONValue = boolean | null | string | number | unknown[] | {
  [key: string]: unknown;
};

