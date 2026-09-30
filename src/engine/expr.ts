// A tiny, safe expression language for rulesets.
//
//   20 + skulduggery / 12 - here.security
//   has('lockpick') and hour >= 20
//   stress > 8000 ? 2 : 0
//
// Parsed into an AST and interpreted — no eval, no Function constructor.

export type Value = number | string | boolean | null;

type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "lit"; v: boolean | null }
  | { k: "id"; path: string[] }
  | { k: "call"; name: string; args: Node[] }
  | { k: "un"; op: "-" | "not"; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "tern"; c: Node; a: Node; b: Node };

export interface ExprEnv {
  /** Resolve an identifier path like ["stress"] or ["flags", "door_open"]. Return undefined when unknown. */
  lookup(path: string[]): Value | undefined;
  /** Ruleset-specific functions (has, count, flag, rel…). Built-in math functions are always available. */
  call?(name: string, args: Value[]): Value | undefined;
}

export class ExprError extends Error {}

type Tok = { t: "num" | "str" | "id" | "op"; v: string; at: number };

const OPS = ["<=", ">=", "==", "!=", "&&", "||", "+", "-", "*", "/", "%", "<", ">", "!", "(", ")", ",", ".", "?", ":"];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i))!;
      out.push({ t: "num", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) { s += src[j + 1]; j += 2; continue; }
        s += src[j++];
      }
      if (j >= src.length) throw new ExprError(`Unclosed quote starting at character ${i + 1}`);
      out.push({ t: "str", v: s, at: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`Unexpected "${c}" at character ${i + 1}`);
    out.push({ t: "op", v: op, at: i });
    i += op.length;
  }
  return out;
}

// Binding power for binary operators (higher binds tighter).
const BP: Record<string, number> = {
  or: 1, "||": 1,
  and: 2, "&&": 2,
  "==": 3, "!=": 3,
  "<": 4, "<=": 4, ">": 4, ">=": 4,
  "+": 5, "-": 5,
  "*": 6, "/": 6, "%": 6,
};

class Parser {
  private i = 0;
  constructor(private toks: Tok[], private src: string) {}

  parse(): Node {
    const n = this.expr(0);
    if (this.i < this.toks.length) this.fail(`Unexpected "${this.toks[this.i].v}"`);
    return n;
  }

  private peek() { return this.toks[this.i]; }
  private fail(msg: string): never {
    const at = this.peek()?.at;
    throw new ExprError(at === undefined ? `${msg} at end of expression` : `${msg} at character ${at + 1}`);
  }
  private eat(v: string) {
    const t = this.peek();
    if (!t || t.v !== v) this.fail(`Expected "${v}"`);
    this.i++;
  }

  private binOp(t: Tok | undefined): string | null {
    if (!t) return null;
    if (t.t === "op" && t.v in BP) return t.v;
    if (t.t === "id" && (t.v === "and" || t.v === "or")) return t.v;
    return null;
  }

  private expr(minBp: number): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.t === "op" && t.v === "?" && minBp === 0) {
        this.i++;
        const a = this.expr(0);
        this.eat(":");
        const b = this.expr(0);
        left = { k: "tern", c: left, a, b };
        continue;
      }
      const op = this.binOp(t);
      if (!op || BP[op] <= minBp) break;
      this.i++;
      const right = this.expr(BP[op]);
      left = { k: "bin", op: op === "&&" ? "and" : op === "||" ? "or" : op, a: left, b: right };
    }
    return left;
  }

  private unary(): Node {
    const t = this.peek();
    if (!t) this.fail("Expression ended too early");
    if (t.t === "op" && t.v === "-") { this.i++; return { k: "un", op: "-", a: this.unary() }; }
    if ((t.t === "op" && t.v === "!") || (t.t === "id" && t.v === "not")) { this.i++; return { k: "un", op: "not", a: this.unary() }; }
    return this.primary();
  }

  private primary(): Node {
    const t = this.peek();
    if (!t) this.fail("Expression ended too early");
    this.i++;
    if (t.t === "num") return { k: "num", v: Number(t.v) };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.t === "op" && t.v === "(") {
      const n = this.expr(0);
      this.eat(")");
      return n;
    }
    if (t.t === "id") {
      if (t.v === "true") return { k: "lit", v: true };
      if (t.v === "false") return { k: "lit", v: false };
      if (t.v === "null") return { k: "lit", v: null };
      if (this.peek()?.v === "(") {
        this.i++;
        const args: Node[] = [];
        if (this.peek()?.v !== ")") {
          for (;;) {
            args.push(this.expr(0));
            if (this.peek()?.v === ",") { this.i++; continue; }
            break;
          }
        }
        this.eat(")");
        return { k: "call", name: t.v, args };
      }
      const path = [t.v];
      while (this.peek()?.v === ".") {
        this.i++;
        const next = this.peek();
        if (!next || next.t !== "id") this.fail('Expected a name after "."');
        path.push(next.v);
        this.i++;
      }
      return { k: "id", path };
    }
    this.i--;
    this.fail(`Unexpected "${t.v}"`);
  }
}

const cache = new Map<string, Node>();

export function compile(src: string): Node {
  const key = src.trim();
  let n = cache.get(key);
  if (!n) {
    n = new Parser(tokenize(key), key).parse();
    if (cache.size > 2000) cache.clear();
    cache.set(key, n);
  }
  return n;
}

const MATH: Record<string, (a: number[]) => number> = {
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  clamp: ([v, lo, hi]) => Math.min(hi, Math.max(lo, v)),
  floor: ([v]) => Math.floor(v),
  ceil: ([v]) => Math.ceil(v),
  round: ([v]) => Math.round(v),
  abs: ([v]) => Math.abs(v),
};

function num(v: Value): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function truthy(v: Value): boolean {
  return !(v === false || v === null || v === 0 || v === "");
}

export interface EvalOptions {
  /** Collects identifiers/functions that could not be resolved (used by the validator). */
  unknown?: Set<string>;
}

function run(n: Node, env: ExprEnv, opts: EvalOptions): Value {
  switch (n.k) {
    case "num": case "str": case "lit": return n.v;
    case "id": {
      const v = env.lookup(n.path);
      if (v === undefined) { opts.unknown?.add(n.path.join(".")); return 0; }
      return v;
    }
    case "call": {
      const args = n.args.map((a) => run(a, env, opts));
      const math = MATH[n.name];
      if (math) return math(args.map(num));
      const v = env.call?.(n.name, args);
      if (v === undefined) { opts.unknown?.add(`${n.name}()`); return 0; }
      return v;
    }
    case "un": {
      const a = run(n.a, env, opts);
      return n.op === "-" ? -num(a) : !truthy(a);
    }
    case "tern": return truthy(run(n.c, env, opts)) ? run(n.a, env, opts) : run(n.b, env, opts);
    case "bin": {
      if (n.op === "and") { const a = run(n.a, env, opts); return truthy(a) ? run(n.b, env, opts) : a; }
      if (n.op === "or") { const a = run(n.a, env, opts); return truthy(a) ? a : run(n.b, env, opts); }
      const a = run(n.a, env, opts);
      const b = run(n.b, env, opts);
      switch (n.op) {
        case "+": return typeof a === "string" || typeof b === "string" ? `${a ?? ""}${b ?? ""}` : num(a) + num(b);
        case "-": return num(a) - num(b);
        case "*": return num(a) * num(b);
        case "/": return num(b) === 0 ? 0 : num(a) / num(b);
        case "%": return num(b) === 0 ? 0 : num(a) % num(b);
        case "<": return num(a) < num(b);
        case "<=": return num(a) <= num(b);
        case ">": return num(a) > num(b);
        case ">=": return num(a) >= num(b);
        case "==": return typeof a === "string" || typeof b === "string" ? String(a) === String(b) : num(a) === num(b);
        case "!=": return typeof a === "string" || typeof b === "string" ? String(a) !== String(b) : num(a) !== num(b);
      }
    }
  }
  return null;
}

/** Evaluate an expression. Numbers pass through untouched so literal YAML numbers work everywhere expressions do. */
export function evaluate(src: string | number | boolean, env: ExprEnv, opts: EvalOptions = {}): Value {
  if (typeof src === "number" || typeof src === "boolean") return src;
  return run(compile(src), env, opts);
}

export function evalNumber(src: string | number | boolean | undefined, env: ExprEnv, fallback = 0, opts: EvalOptions = {}): number {
  if (src === undefined) return fallback;
  return num(evaluate(src, env, opts));
}

export function evalBool(src: string | number | boolean | undefined, env: ExprEnv, fallback = true, opts: EvalOptions = {}): boolean {
  if (src === undefined) return fallback;
  return truthy(evaluate(src, env, opts));
}
