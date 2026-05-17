/**
 * Tiny boolean expression evaluator for `visibleWhen` / `disabledWhen` in UI schemas.
 *
 * Supported grammar (kept intentionally small):
 *   expression  = or ;
 *   or          = and ( "||" and )* ;
 *   and         = unary ( "&&" unary )* ;
 *   unary       = "!" unary | comparison | grouping ;
 *   grouping    = "(" expression ")" ;
 *   comparison  = primary ( ("==" | "!=") primary )? ;
 *   primary     = identifier | number | string | "true" | "false" | "null" ;
 *
 * Identifiers look up keys from `scope`. Strings are single- or double-quoted.
 */

export type Scope = Record<string, unknown>;

interface Token {
  type:
    | "ident"
    | "string"
    | "number"
    | "bool"
    | "null"
    | "&&"
    | "||"
    | "=="
    | "!="
    | "!"
    | "("
    | ")";
  value?: string | number | boolean | null;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "&" && input[i + 1] === "&") {
      tokens.push({ type: "&&" });
      i += 2;
      continue;
    }
    if (c === "|" && input[i + 1] === "|") {
      tokens.push({ type: "||" });
      i += 2;
      continue;
    }
    if (c === "=" && input[i + 1] === "=") {
      tokens.push({ type: "==" });
      i += 2;
      continue;
    }
    if (c === "!" && input[i + 1] === "=") {
      tokens.push({ type: "!=" });
      i += 2;
      continue;
    }
    if (c === "!") {
      tokens.push({ type: "!" });
      i += 1;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "(" });
      i += 1;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: ")" });
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = input.indexOf(c, i + 1);
      if (end < 0) {
        throw new Error(`unterminated string in expression near "${input.slice(i)}"`);
      }
      tokens.push({ type: "string", value: input.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) {
        j += 1;
      }
      tokens.push({ type: "number", value: Number(input.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_.]/.test(input[j])) {
        j += 1;
      }
      const word = input.slice(i, j);
      if (word === "true" || word === "false") {
        tokens.push({ type: "bool", value: word === "true" });
      } else if (word === "null") {
        tokens.push({ type: "null", value: null });
      } else {
        tokens.push({ type: "ident", value: word });
      }
      i = j;
      continue;
    }
    throw new Error(`unexpected character "${c}" in expression`);
  }
  return tokens;
}

function lookupIdent(name: string, scope: Scope): unknown {
  if (Object.prototype.hasOwnProperty.call(scope, name)) {
    return scope[name];
  }
  if (!name.includes(".")) return undefined;
  let target: unknown = scope;
  for (const part of name.split(".")) {
    if (target == null || typeof target !== "object") return undefined;
    target = (target as Record<string, unknown>)[part];
  }
  return target;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): (scope: Scope) => unknown {
    const node = this.parseOr();
    if (this.pos !== this.tokens.length) {
      throw new Error("expression has trailing tokens");
    }
    return node;
  }

  private parseOr() {
    let left = this.parseAnd();
    while (this.peek("||")) {
      this.advance();
      const right = this.parseAnd();
      const prev = left;
      left = (scope) => Boolean(prev(scope)) || Boolean(right(scope));
    }
    return left;
  }

  private parseAnd() {
    let left = this.parseUnary();
    while (this.peek("&&")) {
      this.advance();
      const right = this.parseUnary();
      const prev = left;
      left = (scope) => Boolean(prev(scope)) && Boolean(right(scope));
    }
    return left;
  }

  private parseUnary(): (scope: Scope) => unknown {
    if (this.peek("!")) {
      this.advance();
      const inner = this.parseUnary();
      return (scope) => !inner(scope);
    }
    return this.parseComparison();
  }

  private parseComparison() {
    const left = this.parsePrimary();
    if (this.peek("==") || this.peek("!=")) {
      const op = this.tokens[this.pos].type;
      this.advance();
      const right = this.parsePrimary();
      if (op === "==") {
        return (scope: Scope) => left(scope) === right(scope);
      }
      return (scope: Scope) => left(scope) !== right(scope);
    }
    return left;
  }

  private parsePrimary(): (scope: Scope) => unknown {
    if (this.pos >= this.tokens.length) {
      throw new Error("unexpected end of expression");
    }
    const token = this.tokens[this.pos];
    if (token.type === "(") {
      this.advance();
      const inner = this.parseOr();
      if (!this.peek(")")) {
        throw new Error("missing closing parenthesis");
      }
      this.advance();
      return inner;
    }
    if (token.type === "ident") {
      this.advance();
      return (scope) => lookupIdent(token.value as string, scope);
    }
    if (
      token.type === "string" ||
      token.type === "number" ||
      token.type === "bool" ||
      token.type === "null"
    ) {
      this.advance();
      const value = token.value ?? null;
      return () => value;
    }
    throw new Error(`unexpected token: ${token.type}`);
  }

  private peek(type: Token["type"]) {
    return this.tokens[this.pos]?.type === type;
  }

  private advance() {
    this.pos += 1;
  }
}

export function evalBool(expression: string | undefined, scope: Scope): boolean {
  if (!expression) return true;
  try {
    const tokens = tokenize(expression);
    const node = new Parser(tokens).parse();
    return Boolean(node(scope));
  } catch (error) {
    if (import.meta.env.DEV) {
       
      console.warn(`[ui-schema] expression "${expression}" failed:`, error);
    }
    return true;
  }
}
