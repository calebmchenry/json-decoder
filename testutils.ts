import {StreamBuffer} from './Buffer.ts'

export function mockStreamBuffer(str: string) {
  const stream = new ReadableStream({
    start(control) {
      control.enqueue(str);
      control.close();
    },
  });
  return new StreamBuffer(stream);
}

export function mockReadableStream(str: string) {
  const stream = new ReadableStream({
    start(control) {
      control.enqueue(str);
      control.close();
    },
  });
  return stream;
}
