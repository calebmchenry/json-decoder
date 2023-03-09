import { assertEquals } from "https://deno.land/std@0.134.0/testing/asserts.ts";
import { StreamBuffer } from "./Buffer.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { mockReadableStream } from "./testutils.ts";
import { Decode } from "./decode.ts";
import { PrimativeValue, Token } from "./token.ts";

export type JSONValue =
  | "JSONBoolean"
  | "JSONNumber"
  | "JSONString"
  | "JSONNull"
  | "JSONArray"
  | "JSONObject";

const EOF = new Error("End of File");

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
  #nextTokenStack: Array<() => Promise<Token | Error>> = [
    this.#value.bind(this),
  ];
  constructor(stream: ReadableStream) {
    this.#buffer = new StreamBuffer(stream);
  }

  async decode(): Promise<unknown> {
    await this.#buffer.consumeWhitespace();
    const char = await this.#buffer.peek();
    if (char === ",") {
      await this.#buffer.next();
    }
    return Promise.resolve(await Decode.value(this.#buffer));
  }

  /** Returns true if there are more tokens to be consumed */
  async more(): Promise<boolean> {
    await this.#buffer.consumeWhitespace();
    const char = await this.#buffer.peek();
    return (char === ",") ? Promise.resolve(true) : Promise.resolve(false);
  }

  /** Consumes token */
  token(): Promise<Token | Error> {
    const fn = this.#nextTokenStack.pop();
    if (fn == null) return Promise.resolve(EOF);
    return fn();
  }

  // Private API
  async #value(): Promise<Token | Error> {
    await this.#buffer.consumeWhitespace();
    const char = await this.#buffer.peek();
    if (char === "{") {
      // consume {
      await this.#buffer.next();
      this.#nextTokenStack.push(this.#endObjectOrValue.bind(this));
      this.#nextTokenStack.push(this.#value.bind(this));
      this.#nextTokenStack.push(this.#key.bind(this));
      return Token.openObject();
    }
    if (char === "[") {
      // consume [
      await this.#buffer.next();
      this.#nextTokenStack.push(this.#endArrayOrValue.bind(this));
      this.#nextTokenStack.push(this.#value.bind(this));
      return Token.openArray();
    }
    const value = await Decode.value(this.#buffer);
    if (value instanceof Error) return value;
    // Since we have already manually checked for { and [ then we know this
    // value can't be an array or object and therefore must be a primative value
    return Token.value(value as PrimativeValue);
  }

  async #key(): Promise<Token | Error> {
    await this.#buffer.consumeWhitespace();
    const value = await Decode.string(this.#buffer);
    if (value instanceof Error) return value;
    await this.#buffer.consumeWhitespace();
    const colon = await this.#buffer.next();
    if (colon != ":") return unexpectedToken(colon);
    return Token.key(value);
  }

  async #endObjectOrValue(): Promise<Token | Error> {
    await this.#buffer.consumeWhitespace();
    const char = await this.#buffer.peek();
    if (char === "}") return this.#endObject();
    if (char === ",") {
      this.#nextTokenStack.push(this.#endObjectOrValue.bind(this));
      this.#nextTokenStack.push(this.#value.bind(this));
      return this.#key();
    }
    return unexpectedToken(char);
  }

  async #endObject(): Promise<Token | Error> {
    await this.#buffer.consumeWhitespace();
    const char = await this.#buffer.next();
    if (char !== "}") return unexpectedToken(char);
    return Token.closeObject();
  }

  async #endArrayOrValue(): Promise<Token | Error> {
    await this.#buffer.consumeWhitespace();
    const char = await this.#buffer.peek();
    if (char === "]") return this.#endArray();
    if (char === ",") {
      // consume ,
      await this.#buffer.next();
      this.#nextTokenStack.push(this.#endArrayOrValue.bind(this));
      return this.#value();
    }
    return unexpectedToken(char);
  }

  async #endArray(): Promise<Token | Error> {
    await this.#buffer.consumeWhitespace();
    const char = await this.#buffer.next();
    if (char !== "]") return unexpectedToken(char);
    return Token.closeArray();
  }

  async debug(): Promise<void> {
    console.log("\n[DEBUG] Decoder state:");
    console.log(await this.#buffer.peek());
    console.log(this.#nextTokenStack);
  }
}

describe("Decoder", () => {
  describe("token", () => {
    it("returns tokens", async () => {
      const stream = mockReadableStream('{"foo": ["bar", true, 42]}');
      const dec = new Decoder(stream);
      assertEquals(await dec.token(), Token.openObject());
      assertEquals(await dec.token(), Token.key("foo"));
      assertEquals(await dec.token(), Token.openArray());
      assertEquals(await dec.token(), Token.value("bar"));
      assertEquals(await dec.token(), Token.value(true));
      assertEquals(await dec.token(), Token.value(42));
      assertEquals(await dec.token(), Token.closeArray());
      assertEquals(await dec.token(), Token.closeObject());
    });
  });
});

function unexpectedToken(char: string) {
  return new SyntaxError(`Unexpected token ${char} in JSON position x`);
}
