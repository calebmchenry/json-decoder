import { assertEquals } from "https://deno.land/std/testing/asserts.ts";
export class Buffer {
  private content: string;
  private pointer = 0;

  constructor(str: string) {
    this.content = str;
  }
	
  /** Returns the next character in the buffer and progresses the buffer by 1*/
  next(): string {
    const slice = this.content.substring(this.pointer, this.pointer + 1);
    this.pointer++;
    return slice;
  }

  /** Returns the next character in the buffer and does not progress the buffer */
  peek(): string {
    return this.content.substring(this.pointer, this.pointer + 1);
  }
}

Deno.test({ name: "Buffer.next" }, () => {
  const buffer = new Buffer("foo");
  assertEquals(buffer.next(), "f");
  assertEquals(buffer.next(), "o");
  assertEquals(buffer.next(), "o");
  assertEquals(buffer.next(), "");
});

Deno.test({ name: "Buffer.peek" }, () => {
  const buffer = new Buffer("foo");
  assertEquals(buffer.peek(), "f");
  assertEquals(buffer.peek(), "f");
  assertEquals(buffer.next(), "f");
  buffer.next();
  buffer.next();
  assertEquals(buffer.peek(), "");
});

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
				control.enqueue("foo")	
				control.close()
		}
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
				control.enqueue("foo")	
				control.close()
		}
	});
  const buffer = new StreamBuffer(stream);
  assertEquals(await buffer.peek(), "f");
  assertEquals(await buffer.peek(), "f");
  assertEquals(await buffer.next(), "f");
  await buffer.next();
  await buffer.next();
  assertEquals(await buffer.peek(), "");
});
