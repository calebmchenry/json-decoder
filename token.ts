import { assertNever } from "./utils.ts";

export type PrimativeValue = string | number | boolean | null;

export type ValueToken = { kind: "VALUE"; value: PrimativeValue };
export type OpenObjectToken = { kind: "{"; value: "{" };
export type KeyToken = { kind: "KEY"; value: string };
export type CloseObjectToken = { kind: "}"; value: "}" };
export type OpenArrayToken = { kind: "["; value: "[" };
export type CloseArrayToken = { kind: "]"; value: "]" };

export type Token =
  | ValueToken
  | OpenObjectToken
  | KeyToken
  | CloseObjectToken
  | OpenArrayToken
  | CloseArrayToken;
export const Token = {
  key(key: string): KeyToken {
    return { kind: "KEY", value: key };
  },
  value(value: PrimativeValue): ValueToken {
    return { kind: "VALUE", value };
  },
  openObject(): OpenObjectToken {
    return { kind: "{", value: "{" };
  },
  closeObject(): CloseObjectToken {
    return { kind: "}", value: "}" };
  },
  openArray(): OpenArrayToken {
    return { kind: "[", value: "[" };
  },
  closeArray(): CloseArrayToken {
    return { kind: "]", value: "]" };
  },
  match(
    token: Token,
    matches: {
      "key"?: () => void;
      "value"?: () => void;
      "{"?: () => void;
      "}"?: () => void;
      "["?: () => void;
      "]"?: () => void;
      "_"?: () => void;
    } = {
      "key": undefined,
      "value": undefined,
      "{": undefined,
      "}": undefined,
      "[": undefined,
      "]": undefined,
      "_": () => {},
    },
  ): void {
    const fn = () => {};
    switch (token.kind) {
      case "KEY":
        return (matches.key ?? matches["_"] ?? fn)();
      case "VALUE":
        return (matches.value ?? matches["_"] ?? fn)();
      case "{":
        return (matches["{"] ?? matches["_"] ?? fn)();
      case "}":
        return (matches["}"] ?? matches["_"] ?? fn)();
      case "[":
        return (matches["["] ?? matches["_"] ?? fn)();
      case "]":
        return (matches["]"] ?? matches["_"] ?? fn)();
      default:
        assertNever(token);
    }
  },
};
