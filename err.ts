const EOF = new Error("EOF");
export const Err = { EOF, unexpectedEnd, unexpectedToken };

function unexpectedEnd() {
  return new SyntaxError("Unexpected end of JSON input");
}

function unexpectedToken(char: string) {
  return new SyntaxError(`Unexpected token ${char} in JSON position x`);
}
