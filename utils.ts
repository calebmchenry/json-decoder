export function assertNever(_: never) {
}

export function isWhitespace(char: string) {
  return " " === char || "\t" === char || "\n" === char || "\r" === char;
}

const allowedNumbers = new Set([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
]);
export function isNumber(char: string): boolean {
  return allowedNumbers.has(char);
}
