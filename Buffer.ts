import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { mockReadableStream } from "./testutils.ts";
import { isWhitespace } from "./utils.ts";

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

  async consumeWhitespace(): Promise<void> {
    while (isWhitespace(await this.peek())) {
      await this.next();
    }
  }
}

describe("StreamBuffer", () => {
  it("next", async () => {
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

  it("peek", async () => {
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

  it("consumeWhitespace", async () => {
    const stream = mockReadableStream("1 2\t3\n4\r5 \r\t\n\t\r 6");
    const buffer = new StreamBuffer(stream);
    await buffer.consumeWhitespace();
    assertEquals(await buffer.peek(), "1");
    await buffer.next();
    await buffer.consumeWhitespace();
    assertEquals(await buffer.peek(), "2");
    await buffer.next();
    await buffer.consumeWhitespace();
    assertEquals(await buffer.peek(), "3");
    await buffer.next();
    await buffer.consumeWhitespace();
    assertEquals(await buffer.peek(), "4");
    await buffer.next();
    await buffer.consumeWhitespace();
    assertEquals(await buffer.peek(), "5");
    await buffer.next();
    await buffer.consumeWhitespace();
    assertEquals(await buffer.peek(), "6");
    await buffer.next();
    await buffer.consumeWhitespace();
    assertEquals(await buffer.peek(), "");
  });
});
