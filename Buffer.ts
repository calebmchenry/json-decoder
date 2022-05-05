import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { mockReadableStream, mockStreamBuffer } from "./testutils.ts";

export class StreamBuffer {
  private reader: ReadableStreamReader;
  private content = "";

  constructor(stream: ReadableStream) {
    this.reader = stream.getReader();
  }

  /** Returns the next character in the buffer and progresses the buffer by 1*/
  async next(): Promise<string> {
    if (this.content === "") {
      const { done, value } = await this.reader.read();
      if (done) return "";
      this.content += value;
    }
    const char = this.content[0];
    this.content = this.content.substring(1);
    return char;
  }

  /** Returns the next character in the buffer and does not progress the buffer */
  async peek(): Promise<string> {
    if (this.content === "") {
      const { done, value } = await this.reader.read();
      if (done) return "";
      this.content += value;
    }
    return this.content[0];
  }
}

Deno.test({ name: "StreamBuffer.next" }, async () => {
  const stream = new ReadableStream({
    start(control) {
      control.enqueue("foo");
      control.close();
    },
  });
  const buffer = new StreamBuffer(stream);
  assertEquals(await buffer.next(), "f");
  assertEquals(await buffer.next(), "o");
  assertEquals(await buffer.next(), "o");
  assertEquals(await buffer.next(), "");
});

Deno.test({ name: "StreamBuffer.peek" }, async () => {
  const stream = new ReadableStream({
    start(control) {
      control.enqueue("foo");
      control.close();
    },
  });
  const buffer = new StreamBuffer(stream);
  assertEquals(await buffer.peek(), "f");
  assertEquals(await buffer.peek(), "f");
  assertEquals(await buffer.next(), "f");
  await buffer.next();
  await buffer.next();
  assertEquals(await buffer.peek(), "");
});

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
