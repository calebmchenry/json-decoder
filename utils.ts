export function assertNever(_: never) {
}

export function isWhitespace(char: string) {
  return " " === char || "\t" === char || "\n" === char || "\r" === char;
}
