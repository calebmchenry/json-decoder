import { assertEquals } from "https://deno.land/std@0.134.0/testing/asserts.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { mockReadableStream } from "./testutils.ts";
import { Decoder } from "./Decoder.ts";
import { Token } from "./token.ts";
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
    it("handles nested objects and arrays", async () => {
      const stream = mockReadableStream(
        JSON.stringify({
          foo: {
            bar: { bazz: ["fizz", { buzz: [1, 2, 3, ["a", "b", "c"]] }] },
          },
        }),
      );
      const dec = new Decoder(stream);
      assertEquals(await dec.token(), Token.openObject());
      assertEquals(await dec.token(), Token.key("foo"));
      assertEquals(await dec.token(), Token.openObject());
      assertEquals(await dec.token(), Token.key("bar"));
      assertEquals(await dec.token(), Token.openObject());
      assertEquals(await dec.token(), Token.key("bazz"));
      assertEquals(await dec.token(), Token.openArray());
      assertEquals(await dec.token(), Token.value("fizz"));
      assertEquals(await dec.token(), Token.openObject());
      assertEquals(await dec.token(), Token.key("buzz"));
      assertEquals(await dec.token(), Token.openArray());
      assertEquals(await dec.token(), Token.value(1));
      assertEquals(await dec.token(), Token.value(2));
      assertEquals(await dec.token(), Token.value(3));
      assertEquals(await dec.token(), Token.openArray());
      assertEquals(await dec.token(), Token.value("a"));
      assertEquals(await dec.token(), Token.value("b"));
      assertEquals(await dec.token(), Token.value("c"));
      assertEquals(await dec.token(), Token.closeArray());
      assertEquals(await dec.token(), Token.closeArray());
      assertEquals(await dec.token(), Token.closeObject());
      assertEquals(await dec.token(), Token.closeArray());
      assertEquals(await dec.token(), Token.closeObject());
    });
    it("handles multiple entries in objects", async () => {
      const stream = mockReadableStream(
        JSON.stringify({
          foo: 1,
          bar: false,
          fizz: "a",
          buzz: null,
        }),
      );
      const dec = new Decoder(stream);
      assertEquals(await dec.token(), Token.openObject());
      assertEquals(await dec.token(), Token.key("foo"));
      assertEquals(await dec.token(), Token.value(1));
      assertEquals(await dec.token(), Token.key("bar"));
      assertEquals(await dec.token(), Token.value(false));
      assertEquals(await dec.token(), Token.key("fizz"));
      assertEquals(await dec.token(), Token.value("a"));
      assertEquals(await dec.token(), Token.key("buzz"));
      assertEquals(await dec.token(), Token.value(null));
    });
  });
  describe("more", () => {
    it("handles infinite json", async () => {
      const stream = new ReadableStream({
        start: (control) => {
          control.enqueue("[");
        },
        pull: (control) => {
          control.enqueue('"foo",');
        },
      });
      const dec = new Decoder(stream);
      const start = Date.now();
      await dec.token();
      while (await dec.more()) {
        assertEquals(await dec.token(), Token.value("foo"));
        // This causes the loop to run ~200k times
        if (Date.now() - start >= 500) break;
      }
    });
  });
  describe("decode", () => {
    it("handles decoding in the middle of tokenizing", async () => {
      const stream = mockReadableStream('{"foo": ["bar", true, 42]}');
      const dec = new Decoder(stream);
      assertEquals(await dec.token(), Token.openObject());
      assertEquals(await dec.token(), Token.key("foo"));
      assertEquals(await dec.token(), Token.openArray());
      assertEquals(await dec.decode(), "bar");
      assertEquals(await dec.token(), Token.value(true));
    });
  });
});
