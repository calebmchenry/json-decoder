import {
  assertEquals,
  assertInstanceOf,
  fail,
} from "https://deno.land/std@0.134.0/testing/asserts.ts";
import {
  decodeArray,
  decodeBoolean,
  decodeNull,
  decodeNumber,
  decodeObject,
  decodeString,
  decodeValue,
  whichJSONValue,
} from "./decode.ts";
import { Err } from "./err.ts";
import { mockStreamBuffer } from "./testutils.ts";
Deno.test({ name: "whichJSONValue" }, async () => {
  assertEquals(await whichJSONValue(mockStreamBuffer("true")), "JSONBoolean");
  assertEquals(await whichJSONValue(mockStreamBuffer("false")), "JSONBoolean");
  assertEquals(await whichJSONValue(mockStreamBuffer("null")), "JSONNull");
  assertEquals(await whichJSONValue(mockStreamBuffer('"Hello"')), "JSONString");
  assertEquals(await whichJSONValue(mockStreamBuffer("42")), "JSONNumber");
  assertEquals(await whichJSONValue(mockStreamBuffer("[ 4 ]")), "JSONArray");
  assertEquals(await whichJSONValue(mockStreamBuffer("{ 4 }")), "JSONObject");
  try {
    await whichJSONValue(mockStreamBuffer("bad"));
    fail("Expected bad json to throw an error");
  } catch (err) {
    assertEquals(err, new Error('[DEBUG]: unexpected start of token "b"'));
  }
});

Deno.test({ name: "decodeValue" }, async () => {
  assertEquals(await decodeValue(mockStreamBuffer("true")), true);
  assertEquals(await decodeValue(mockStreamBuffer("false")), false);
  assertEquals(await decodeValue(mockStreamBuffer("null")), null);
  assertEquals(await decodeValue(mockStreamBuffer('"Hello"')), "Hello");
  assertEquals(await decodeValue(mockStreamBuffer("42")), 42);
  assertEquals(await decodeValue(mockStreamBuffer("[]")), []);
  assertEquals(await decodeValue(mockStreamBuffer("{}")), {});
});

Deno.test({ name: "decodeArray" }, async () => {
  assertEquals(await decodeArray(mockStreamBuffer("[]")), []);
  assertEquals(await decodeArray(mockStreamBuffer("[true]")), [true]);
  assertEquals(
    await decodeArray(mockStreamBuffer('[ true , false , 4 , "foo" , null ]')),
    [
      true,
      false,
      4,
      "foo",
      null,
    ],
  );
  assertEquals(
    await decodeArray(mockStreamBuffer('[["foo", "bar"], {"fizz": "buzz"}]')),
    [["foo", "bar"], { "fizz": "buzz" }],
  );
});

Deno.test({ name: "decodeObject" }, async () => {
  assertEquals(await decodeObject(mockStreamBuffer("{}")), {});
  assertEquals(await decodeObject(mockStreamBuffer('{ "foo" : "bar"}')), {
    foo: "bar",
  });
  assertEquals(
    await decodeObject(
      mockStreamBuffer('{ "foo" : {"bar": {"fizz": "buzz"}} }'),
    ),
    { foo: { bar: { fizz: "buzz" } } },
  );
  assertEquals(
    await decodeObject(
      mockStreamBuffer('{ "foo" : [["bar"],{"fizz": "buzz"}] }'),
    ),
    { foo: [["bar"], { fizz: "buzz" }] },
  );
});

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

Deno.test({ name: "decodeBoolean" }, async () => {
  assertEquals(await decodeBoolean(mockStreamBuffer("true")), true);
  assertEquals(
    await decodeBoolean(mockStreamBuffer("tru")),
    Err.unexpectedEnd(),
  );
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("xrue")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("txue")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("trxe")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("trux")), SyntaxError);
  assertEquals(await decodeBoolean(mockStreamBuffer("false")), false);
  assertEquals(
    await decodeBoolean(mockStreamBuffer("fals")),
    Err.unexpectedEnd(),
  );
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("xalse")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("fxlse")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("faxse")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("falxe")), SyntaxError);
  assertInstanceOf(await decodeBoolean(mockStreamBuffer("falsx")), SyntaxError);
});

Deno.test({ name: "decodeNumber" }, async () => {
  assertEquals(await decodeNumber(mockStreamBuffer("0")), 0);
  assertEquals(await decodeNumber(mockStreamBuffer("1")), 1);
  assertEquals(await decodeNumber(mockStreamBuffer("123")), 123);
  assertEquals(await decodeNumber(mockStreamBuffer("0.5")), 0.5);
  assertInstanceOf(await decodeNumber(mockStreamBuffer("0.5.5")), SyntaxError);
  assertInstanceOf(await decodeNumber(mockStreamBuffer(".1")), SyntaxError);
});

Deno.test("decodeString", async () => {
  const fooStream = mockStreamBuffer(JSON.stringify("foo"));
  assertEquals(await decodeString(fooStream), "foo");

  const quoteStream = mockStreamBuffer(JSON.stringify('f"oo'));
  assertEquals(await decodeString(quoteStream), 'f"oo');
});
