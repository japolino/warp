// src/engine/expr.ts
class ExprError extends Error {
}
var OPS = ["<=", ">=", "==", "!=", "&&", "||", "+", "-", "*", "/", "%", "<", ">", "!", "(", ")", ",", ".", "?", ":"];
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || c === "." && /[0-9]/.test(src[i + 1] ?? "")) {
      const m = /^[0-9]*\.?[0-9]+/.exec(src.slice(i));
      out.push({ t: "num", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) {
          s += src[j + 1];
          j += 2;
          continue;
        }
        s += src[j++];
      }
      if (j >= src.length)
        throw new ExprError(`Unclosed quote starting at character ${i + 1}`);
      out.push({ t: "str", v: s, at: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      out.push({ t: "id", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op)
      throw new ExprError(`Unexpected "${c}" at character ${i + 1}`);
    out.push({ t: "op", v: op, at: i });
    i += op.length;
  }
  return out;
}
var BP = {
  or: 1,
  "||": 1,
  and: 2,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  "<=": 4,
  ">": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6
};

class Parser {
  toks;
  src;
  i = 0;
  constructor(toks, src) {
    this.toks = toks;
    this.src = src;
  }
  parse() {
    const n = this.expr(0);
    if (this.i < this.toks.length)
      this.fail(`Unexpected "${this.toks[this.i].v}"`);
    return n;
  }
  peek() {
    return this.toks[this.i];
  }
  fail(msg) {
    const at = this.peek()?.at;
    throw new ExprError(at === undefined ? `${msg} at end of expression` : `${msg} at character ${at + 1}`);
  }
  eat(v) {
    const t = this.peek();
    if (!t || t.v !== v)
      this.fail(`Expected "${v}"`);
    this.i++;
  }
  binOp(t) {
    if (!t)
      return null;
    if (t.t === "op" && t.v in BP)
      return t.v;
    if (t.t === "id" && (t.v === "and" || t.v === "or"))
      return t.v;
    return null;
  }
  expr(minBp) {
    let left = this.unary();
    for (;; ) {
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
      if (!op || BP[op] <= minBp)
        break;
      this.i++;
      const right = this.expr(BP[op]);
      left = { k: "bin", op: op === "&&" ? "and" : op === "||" ? "or" : op, a: left, b: right };
    }
    return left;
  }
  unary() {
    const t = this.peek();
    if (!t)
      this.fail("Expression ended too early");
    if (t.t === "op" && t.v === "-") {
      this.i++;
      return { k: "un", op: "-", a: this.unary() };
    }
    if (t.t === "op" && t.v === "!" || t.t === "id" && t.v === "not") {
      this.i++;
      return { k: "un", op: "not", a: this.unary() };
    }
    return this.primary();
  }
  primary() {
    const t = this.peek();
    if (!t)
      this.fail("Expression ended too early");
    this.i++;
    if (t.t === "num")
      return { k: "num", v: Number(t.v) };
    if (t.t === "str")
      return { k: "str", v: t.v };
    if (t.t === "op" && t.v === "(") {
      const n = this.expr(0);
      this.eat(")");
      return n;
    }
    if (t.t === "id") {
      if (t.v === "true")
        return { k: "lit", v: true };
      if (t.v === "false")
        return { k: "lit", v: false };
      if (t.v === "null")
        return { k: "lit", v: null };
      if (this.peek()?.v === "(") {
        this.i++;
        const args = [];
        if (this.peek()?.v !== ")") {
          for (;; ) {
            args.push(this.expr(0));
            if (this.peek()?.v === ",") {
              this.i++;
              continue;
            }
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
        if (!next || next.t !== "id")
          this.fail('Expected a name after "."');
        path.push(next.v);
        this.i++;
      }
      return { k: "id", path };
    }
    this.i--;
    this.fail(`Unexpected "${t.v}"`);
  }
}
var cache = new Map;
function compile(src) {
  const key = src.trim();
  let n = cache.get(key);
  if (!n) {
    n = new Parser(tokenize(key), key).parse();
    if (cache.size > 2000)
      cache.clear();
    cache.set(key, n);
  }
  return n;
}
var MATH = {
  min: (a) => Math.min(...a),
  max: (a) => Math.max(...a),
  clamp: ([v, lo, hi]) => Math.min(hi, Math.max(lo, v)),
  floor: ([v]) => Math.floor(v),
  ceil: ([v]) => Math.ceil(v),
  round: ([v]) => Math.round(v),
  abs: ([v]) => Math.abs(v)
};
function num(v) {
  if (typeof v === "number")
    return v;
  if (typeof v === "boolean")
    return v ? 1 : 0;
  if (v === null)
    return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function truthy(v) {
  return !(v === false || v === null || v === 0 || v === "");
}
function run(n, env, opts) {
  switch (n.k) {
    case "num":
    case "str":
    case "lit":
      return n.v;
    case "id": {
      const v = env.lookup(n.path);
      if (v === undefined) {
        opts.unknown?.add(n.path.join("."));
        return 0;
      }
      return v;
    }
    case "call": {
      const args = n.args.map((a) => run(a, env, opts));
      const math = MATH[n.name];
      if (math)
        return math(args.map(num));
      const v = env.call?.(n.name, args);
      if (v === undefined) {
        opts.unknown?.add(`${n.name}()`);
        return 0;
      }
      return v;
    }
    case "un": {
      const a = run(n.a, env, opts);
      return n.op === "-" ? -num(a) : !truthy(a);
    }
    case "tern":
      return truthy(run(n.c, env, opts)) ? run(n.a, env, opts) : run(n.b, env, opts);
    case "bin": {
      if (n.op === "and") {
        const a = run(n.a, env, opts);
        return truthy(a) ? run(n.b, env, opts) : a;
      }
      if (n.op === "or") {
        const a = run(n.a, env, opts);
        return truthy(a) ? a : run(n.b, env, opts);
      }
      const a = run(n.a, env, opts);
      const b = run(n.b, env, opts);
      switch (n.op) {
        case "+":
          return typeof a === "string" || typeof b === "string" ? `${a ?? ""}${b ?? ""}` : num(a) + num(b);
        case "-":
          return num(a) - num(b);
        case "*":
          return num(a) * num(b);
        case "/":
          return num(b) === 0 ? 0 : num(a) / num(b);
        case "%":
          return num(b) === 0 ? 0 : num(a) % num(b);
        case "<":
          return num(a) < num(b);
        case "<=":
          return num(a) <= num(b);
        case ">":
          return num(a) > num(b);
        case ">=":
          return num(a) >= num(b);
        case "==":
          return typeof a === "string" || typeof b === "string" ? String(a) === String(b) : num(a) === num(b);
        case "!=":
          return typeof a === "string" || typeof b === "string" ? String(a) !== String(b) : num(a) !== num(b);
      }
    }
  }
  return null;
}
function evaluate(src, env, opts = {}) {
  if (typeof src === "number" || typeof src === "boolean")
    return src;
  return run(compile(src), env, opts);
}
function evalNumber(src, env, fallback = 0, opts = {}) {
  if (src === undefined)
    return fallback;
  return num(evaluate(src, env, opts));
}
function evalBool(src, env, fallback = true, opts = {}) {
  if (src === undefined)
    return fallback;
  return truthy(evaluate(src, env, opts));
}

// src/engine/dice.ts
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0;i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  h = Math.imul(h ^ h >>> 16, 2246822507);
  h = Math.imul(h ^ h >>> 13, 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function seededRng(seed) {
  let a = hashSeed(seed);
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function randomSeed() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

class DiceError extends Error {
}
var TERM = /([+-]?)\s*(?:(\d*)d(\d+|%)(?:(kh|kl)(\d+))?(!)?|(\d+))/gy;
function parseDice(src) {
  const s = src.replace(/\s+/g, "").toLowerCase();
  if (!s)
    throw new DiceError("Dice notation is empty");
  const groups = [];
  let flat = 0;
  TERM.lastIndex = 0;
  let consumed = 0;
  let m;
  while (consumed < s.length && (m = TERM.exec(s))) {
    if (m[0] === "")
      break;
    if (consumed > 0 && !m[1])
      break;
    const sign = m[1] === "-" ? -1 : 1;
    if (m[7] !== undefined) {
      flat += sign * Number(m[7]);
    } else {
      const count = m[2] ? Number(m[2]) : 1;
      const sides = m[3] === "%" ? 100 : Number(m[3]);
      if (count < 1 || count > 100)
        throw new DiceError(`"${src}": dice count must be 1–100`);
      if (sides < 2 || sides > 1000)
        throw new DiceError(`"${src}": dice need 2–1000 sides`);
      const g = { count, sides, sign };
      if (m[4]) {
        const n = Number(m[5]);
        if (n < 1 || n > count)
          throw new DiceError(`"${src}": can't keep ${n} of ${count} dice`);
        g.keep = { mode: m[4], n };
      }
      if (m[6])
        g.explode = true;
      groups.push(g);
    }
    consumed = TERM.lastIndex;
  }
  if (consumed !== s.length)
    throw new DiceError(`"${src}" isn't valid dice notation (try d20, 2d6, d100, 4d6kh3)`);
  if (!groups.length)
    throw new DiceError(`"${src}" has no dice in it`);
  return { groups, flat, primarySides: Math.max(...groups.map((g) => g.sides)) };
}
function rollDice(notation, rng) {
  const parsed = parseDice(notation);
  const dice = [];
  let total = parsed.flat;
  let natural = null;
  parsed.groups.forEach((g, gi) => {
    const faces = [];
    for (let i = 0;i < g.count; i++) {
      let face = 1 + Math.floor(rng() * g.sides);
      faces.push(face);
      let chain = 0;
      while (g.explode && face === g.sides && chain++ < 20) {
        face = 1 + Math.floor(rng() * g.sides);
        faces.push(face);
      }
    }
    const order = faces.map((v, i) => ({ v, i }));
    let keptIdx = new Set(order.map((o) => o.i));
    if (g.keep) {
      order.sort((x, y) => g.keep.mode === "kh" ? y.v - x.v : x.v - y.v);
      keptIdx = new Set(order.slice(0, g.keep.n).map((o) => o.i));
    }
    faces.forEach((v, i) => {
      const kept = keptIdx.has(i);
      dice.push({ sides: g.sides, value: v, kept });
      if (kept)
        total += g.sign * v;
    });
    const keptFaces = faces.filter((_, i) => keptIdx.has(i));
    if (gi === 0 && keptFaces.length === 1)
      natural = keptFaces[0];
  });
  return { notation, dice, total, natural, primarySides: parsed.primarySides };
}

// src/engine/decide.ts
function normalize(p, keys) {
  const out = {};
  let sum = 0;
  for (const k of keys) {
    const v = Number(p[k]);
    out[k] = Number.isFinite(v) && v > 0 ? v : 0;
    sum += out[k];
  }
  if (sum <= 0)
    for (const k of keys)
      out[k] = 1 / keys.length;
  else
    for (const k of keys)
      out[k] /= sum;
  return out;
}
function sample(p, rng) {
  const keys = Object.keys(p);
  let x = rng();
  for (const k of keys) {
    x -= p[k];
    if (x <= 0)
      return k;
  }
  return keys[keys.length - 1];
}
function noulConfidence(p) {
  return Math.abs(2 * p - 1);
}

// src/engine/ruleset.ts
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function titleCase(id) {
  return id.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function slug(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
}
var DEFAULT_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function parseClockStart(v, weekdays) {
  if (typeof v === "number" && Number.isFinite(v))
    return Math.max(0, Math.floor(v));
  if (typeof v !== "string")
    return null;
  const s = v.trim();
  const m = /^(?:(?:day\s*(\d+))|([A-Za-z]{3,}))?\s*(\d{1,2}):(\d{2})$/i.exec(s);
  if (!m)
    return null;
  let day = 0;
  if (m[1])
    day = Math.max(0, Number(m[1]) - 1);
  else if (m[2]) {
    const idx = weekdays.findIndex((w) => w.toLowerCase().startsWith(m[2].toLowerCase().slice(0, 3)));
    if (idx < 0)
      return null;
    day = idx;
  }
  const h = Number(m[3]);
  const min = Number(m[4]);
  if (h > 23 || min > 59)
    return null;
  return day * 1440 + h * 60 + min;
}

class Ctx {
  issues = [];
  err(where, message) {
    this.issues.push({ level: "error", where, message });
  }
  warn(where, message) {
    this.issues.push({ level: "warning", where, message });
  }
  num(v, where, fallback) {
    if (v === undefined || v === null || v === "")
      return fallback;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) {
      this.warn(where, `"${v}" should be a number — using ${fallback}`);
      return fallback;
    }
    return n;
  }
  expr(v, where) {
    if (v === undefined || v === null)
      return;
    if (typeof v === "number")
      return v;
    if (typeof v === "boolean")
      return v ? 1 : 0;
    const s = String(v);
    try {
      compile(s);
      return s;
    } catch (e) {
      this.err(where, e instanceof ExprError ? `Formula "${s}": ${e.message}` : `Formula "${s}" couldn't be read`);
      return;
    }
  }
}
function toneFor(index, count, good) {
  if (good === "none" || count <= 1)
    return "neutral";
  const pos = index / (count - 1);
  const goodness = good === "high" ? pos : 1 - pos;
  return goodness >= 0.67 ? "good" : goodness >= 0.34 ? "warn" : "bad";
}
function normBands(raw, good, where, c) {
  if (raw === undefined || raw === null)
    return [];
  const list = [];
  if (Array.isArray(raw)) {
    raw.forEach((b, i) => {
      if (!isObj(b)) {
        c.warn(`${where} › #${i + 1}`, "each band needs `at` and `text`");
        return;
      }
      const at = c.num(b.at ?? b.from ?? b.min, `${where} › #${i + 1}`, NaN);
      if (!Number.isFinite(at) || typeof b.text !== "string") {
        c.warn(`${where} › #${i + 1}`, "each band needs a numeric `at` and a `text`");
        return;
      }
      const tone = ["good", "warn", "bad", "neutral"].includes(b.tone) ? b.tone : undefined;
      list.push({ at, text: b.text, tone });
    });
  } else if (isObj(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      const at = Number(k);
      if (!Number.isFinite(at)) {
        c.warn(where, `band key "${k}" should be a number (the value where this text starts)`);
        continue;
      }
      if (typeof v === "string")
        list.push({ at, text: v });
      else if (isObj(v) && typeof v.text === "string")
        list.push({ at, text: v.text, tone: v.tone });
      else
        c.warn(`${where} › ${k}`, "band should be a line of text");
    }
  } else {
    c.warn(where, "bands should be a map like `0: You feel fine.`");
  }
  list.sort((a, b) => a.at - b.at);
  return list.map((b, i) => ({ at: b.at, text: b.text, tone: b.tone ?? toneFor(i, list.length, good) }));
}
var KIND_ALIASES = {
  meter: "meter",
  bar: "meter",
  pool: "meter",
  resource: "meter",
  attribute: "attribute",
  attr: "attribute",
  stat: "attribute",
  skill: "skill",
  money: "money",
  currency: "money",
  hidden: "hidden"
};
function normStat(id, raw, where, c, forRel = false) {
  const r = isObj(raw) ? raw : typeof raw === "number" ? { start: raw } : {};
  if (!isObj(raw) && typeof raw !== "number" && raw !== null && raw !== undefined) {
    c.warn(where, "expected a stat definition — using defaults");
  }
  const kind = KIND_ALIASES[String(r.kind ?? r.type ?? (forRel ? "meter" : "meter")).toLowerCase()];
  if (!kind)
    c.warn(where, `unknown kind "${r.kind}" — use meter, attribute, skill, money or hidden`);
  const k = kind ?? "meter";
  const defaultMax = k === "money" ? 1000000000000 : k === "skill" ? 1000 : 100;
  const min = c.num(r.min, `${where} › min`, 0);
  let max = defaultMax;
  let maxExpr;
  if (typeof r.max === "string" && !Number.isFinite(Number(r.max))) {
    const e = c.expr(r.max, `${where} › max`);
    if (typeof e === "string") {
      maxExpr = e;
      max = defaultMax;
    }
  } else
    max = c.num(r.max, `${where} › max`, defaultMax);
  if (max <= min) {
    c.warn(where, `max (${max}) must be above min (${min})`);
    max = min + 100;
  }
  const goodRaw = String(r.good ?? (k === "meter" ? "high" : k === "hidden" ? "none" : "high")).toLowerCase();
  const good = goodRaw === "low" ? "low" : goodRaw === "none" || goodRaw === "neutral" ? "none" : "high";
  const showRaw = String(r.show ?? (r.bands ? "text" : "both")).toLowerCase();
  const show = ["text", "number", "both", "hidden"].includes(showRaw) ? showRaw : "both";
  let narrator = 0;
  if (r.narrator === true)
    narrator = Math.max(1, Math.round((max - min) / 10));
  else if (r.narrator !== undefined && r.narrator !== false)
    narrator = Math.abs(c.num(r.narrator, `${where} › narrator`, 0));
  const start = c.num(r.start ?? r.value, `${where} › start`, good === "low" ? min : k === "meter" ? max : min);
  const def = {
    id,
    label: typeof r.label === "string" ? r.label : titleCase(id),
    kind: k,
    min,
    max,
    maxExpr,
    start: Math.min(max, Math.max(min, start)),
    good,
    perHour: c.num(r.per_hour ?? r.perHour, `${where} › per_hour`, 0),
    show: k === "hidden" ? "hidden" : show,
    narrator,
    bands: normBands(r.bands, good, `${where} › bands`, c),
    color: typeof r.color === "string" ? r.color : undefined,
    desc: typeof r.desc === "string" ? r.desc : typeof r.description === "string" ? r.description : undefined
  };
  if (Array.isArray(r.grades) && r.grades.length)
    def.grades = r.grades.map(String);
  return def;
}
function emptyEffect() {
  return { stats: {}, set: {}, flags: {}, items: {}, rel: {}, addConditions: {}, removeConditions: [], decide: [] };
}
function normDecide(raw, where, c, known) {
  if (!isObj(raw)) {
    c.warn(where, "decide needs `ask:` and `options:`");
    return [];
  }
  const entries = typeof raw.ask === "string" ? [[slug(where), raw]] : Object.entries(raw);
  const out = [];
  for (const [id, spec] of entries) {
    const w = `${where} › ${id}`;
    if (!isObj(spec) || typeof spec.ask !== "string" || !isObj(spec.options)) {
      c.warn(w, "decide needs `ask:` (a question) and `options:`");
      continue;
    }
    const options = [];
    for (const [oid, o] of Object.entries(spec.options)) {
      const r = isObj(o) ? { ...o } : typeof o === "string" ? { desc: o } : {};
      const desc = typeof r.desc === "string" ? r.desc : typeof r.label === "string" ? r.label : titleCase(oid);
      const weight = c.num(r.weight, `${w} › ${oid} › weight`, 1);
      delete r.desc;
      delete r.label;
      delete r.weight;
      options.push({ id: oid, desc, weight: Math.max(0, weight), effect: normEffect(r, `${w} › ${oid}`, c, known) });
    }
    if (options.length < 2) {
      c.warn(w, "decide needs at least two options");
      continue;
    }
    out.push({ id: typeof spec.id === "string" ? spec.id : id, ask: spec.ask, options });
  }
  return out;
}
function normEffect(raw, where, c, known) {
  const e = emptyEffect();
  if (raw === undefined || raw === null)
    return e;
  if (typeof raw === "string") {
    e.hint = raw;
    return e;
  }
  if (!isObj(raw)) {
    c.warn(where, "expected a map of effects");
    return e;
  }
  for (const [k, v] of Object.entries(raw)) {
    const w = `${where} › ${k}`;
    switch (k) {
      case "stats":
      case "change":
        if (isObj(v))
          for (const [s, d] of Object.entries(v)) {
            const x = c.expr(d, `${w} › ${s}`);
            if (x !== undefined)
              e.stats[s] = x;
          }
        break;
      case "set":
        if (isObj(v))
          for (const [s, d] of Object.entries(v)) {
            const x = c.expr(d, `${w} › ${s}`);
            if (x !== undefined)
              e.set[s] = x;
          }
        break;
      case "flags":
      case "flag":
        if (isObj(v))
          Object.assign(e.flags, v);
        else if (typeof v === "string")
          e.flags[v] = true;
        break;
      case "items":
      case "give":
      case "take":
        if (isObj(v))
          for (const [it, n] of Object.entries(v))
            e.items[it] = (k === "take" ? -1 : 1) * c.num(n, `${w} › ${it}`, 1);
        else if (typeof v === "string")
          e.items[v] = k === "take" ? -1 : 1;
        else if (Array.isArray(v))
          for (const it of v)
            e.items[String(it)] = k === "take" ? -1 : 1;
        break;
      case "rel":
      case "relationships":
        if (isObj(v))
          for (const [who, m] of Object.entries(v)) {
            if (!isObj(m)) {
              c.warn(`${w} › ${who}`, "expected stat changes like `trust: +5`");
              continue;
            }
            e.rel[who] = {};
            for (const [s, d] of Object.entries(m)) {
              const x = c.expr(d, `${w} › ${who} › ${s}`);
              if (x !== undefined)
                e.rel[who][s] = x;
            }
          }
        break;
      case "move":
      case "go":
      case "location":
        e.move = String(v);
        break;
      case "time":
      case "minutes":
        e.time = c.num(v, w, 0);
        break;
      case "add_condition":
      case "add_conditions":
      case "condition":
        if (typeof v === "string")
          e.addConditions[v] = null;
        else if (Array.isArray(v))
          for (const x of v)
            e.addConditions[String(x)] = null;
        else if (isObj(v))
          for (const [x, d] of Object.entries(v))
            e.addConditions[x] = d === null || d === true ? null : c.num(d, `${w} › ${x}`, 60);
        break;
      case "remove_condition":
      case "remove_conditions":
      case "cure":
        if (typeof v === "string")
          e.removeConditions.push(v);
        else if (Array.isArray(v))
          e.removeConditions.push(...v.map(String));
        break;
      case "hint":
      case "narrate":
      case "text":
        e.hint = String(v);
        break;
      case "decide":
        e.decide.push(...normDecide(v, w, c, known));
        break;
      default:
        if (known.stats.has(k)) {
          const x = c.expr(v, w);
          if (x !== undefined)
            e.stats[k] = x;
        } else
          c.warn(w, `"${k}" isn't a stat or a known effect (stats, set, flags, give, take, rel, move, time, add_condition, remove_condition, hint)`);
    }
  }
  return e;
}
function normCheck(raw, where, c) {
  if (!isObj(raw)) {
    c.warn(where, "check should be a map, e.g. `chance: 40 + athletics / 10`");
    return;
  }
  let style;
  if (raw.chance !== undefined || raw.under !== undefined)
    style = "chance";
  else if (raw.style === "pbta" || raw.bands === "pbta" || raw.pbta !== undefined)
    style = "pbta";
  else if (raw.vs !== undefined || raw.dc !== undefined)
    style = "vs";
  else {
    c.err(where, "a check needs `chance:` (percent), `vs:` (difficulty) or `style: pbta`");
    return;
  }
  const dice = String(raw.dice ?? raw.roll ?? (style === "chance" ? "d100" : style === "pbta" ? "2d6" : "d20"));
  try {
    parseDice(dice);
  } catch (e) {
    c.err(`${where} › dice`, e instanceof DiceError ? e.message : "bad dice");
    return;
  }
  const target = c.expr(style === "chance" ? raw.chance ?? raw.under : raw.vs ?? raw.dc, `${where} › ${style === "chance" ? "chance" : "vs"}`);
  const add = c.expr(raw.add ?? raw.bonus ?? raw.mod ?? (style === "pbta" ? raw.pbta : undefined), `${where} › add`);
  return {
    style,
    dice,
    target,
    add,
    partialMargin: c.num(raw.partial ?? raw.partial_margin, `${where} › partial`, 0),
    label: typeof raw.label === "string" ? raw.label : typeof raw.skill === "string" ? raw.skill : undefined,
    crits: raw.crits !== false
  };
}
var TIER_KEYS = {
  crit_success: "crit_success",
  critical_success: "crit_success",
  crit: "crit_success",
  success: "success",
  pass: "success",
  partial: "partial",
  mixed: "partial",
  fail: "fail",
  failure: "fail",
  miss: "fail",
  crit_fail: "crit_fail",
  critical_fail: "crit_fail",
  fumble: "crit_fail"
};
function normAction(id, raw, where, c, known, order) {
  if (typeof raw === "string")
    raw = { label: raw };
  if (!isObj(raw)) {
    c.warn(where, "expected an action definition");
    return null;
  }
  const params = [];
  if (isObj(raw.params)) {
    for (const [pid, p] of Object.entries(raw.params)) {
      const pw = `${where} › params › ${pid}`;
      const opts = isObj(p) && isObj(p.options) ? p.options : isObj(p) ? p : null;
      if (!opts) {
        c.warn(pw, "params need options, e.g. `{ easy: 8, hard: 16 }`");
        continue;
      }
      const options = {};
      for (const [o, v] of Object.entries(opts))
        if (o !== "default" && o !== "label")
          options[o] = c.num(v, `${pw} › ${o}`, 0);
      const keys = Object.keys(options);
      if (!keys.length)
        continue;
      const def = isObj(p) && typeof p.default === "string" && keys.includes(p.default) ? p.default : keys[Math.floor(keys.length / 2)];
      params.push({ id: pid, label: isObj(p) && typeof p.label === "string" ? p.label : titleCase(pid), options, default: def });
    }
  }
  const outcomes = {};
  for (const [k, v] of Object.entries(raw)) {
    const tier = TIER_KEYS[k];
    if (tier)
      outcomes[tier] = normEffect(v, `${where} › ${k}`, c, known);
  }
  if (isObj(raw.outcomes))
    for (const [k, v] of Object.entries(raw.outcomes)) {
      const tier = TIER_KEYS[k];
      if (tier)
        outcomes[tier] = normEffect(v, `${where} › outcomes › ${k}`, c, known);
      else
        c.warn(`${where} › outcomes › ${k}`, "outcomes are crit_success, success, partial, fail, crit_fail");
    }
  const check = raw.check !== undefined ? normCheck(raw.check, `${where} › check`, c) : undefined;
  if (!check && Object.keys(outcomes).length)
    c.warn(where, "has outcomes but no check — put always-on changes under `effects:`");
  const at = raw.at === undefined ? [] : Array.isArray(raw.at) ? raw.at.map(String) : [String(raw.at)];
  const when = raw.when !== undefined ? c.expr(raw.when, `${where} › when`) : undefined;
  return {
    id,
    label: typeof raw.label === "string" ? raw.label : titleCase(id),
    say: typeof raw.say === "string" ? raw.say : undefined,
    desc: typeof raw.desc === "string" ? raw.desc : typeof raw.description === "string" ? raw.description : undefined,
    group: typeof raw.group === "string" ? raw.group : undefined,
    at,
    when: when === undefined ? undefined : String(when),
    hidden: raw.hidden === true,
    time: raw.time !== undefined ? c.num(raw.time, `${where} › time`, 0) : undefined,
    cost: normEffect(raw.cost ?? raw.costs, `${where} › cost`, c, known),
    check,
    outcomes,
    effects: normEffect(raw.effects ?? raw.effect, `${where} › effects`, c, known),
    params,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).toLowerCase()) : [],
    order: typeof raw.order === "number" ? raw.order : order
  };
}
var SEXUAL_TAGS = new Set(["sexual", "sex", "nsfw", "lewd", "explicit", "erotic", "smut"]);
function normalizeRuleset(raw) {
  const c = new Ctx;
  if (!isObj(raw)) {
    c.err("Ruleset", "is empty or isn't a YAML map");
    return { ruleset: null, issues: c.issues };
  }
  const weekdays = Array.isArray(raw.clock?.weekdays) ? raw.clock.weekdays.map(String) : DEFAULT_WEEKDAYS;
  const stats = {};
  const statOrder = [];
  if (raw.stats !== undefined && !isObj(raw.stats))
    c.err("Stats", "should be a map of stat names to definitions");
  for (const [id, def] of Object.entries(isObj(raw.stats) ? raw.stats : {})) {
    const s = normStat(id, def, `Stats › ${id}`, c);
    if (s) {
      stats[id] = s;
      statOrder.push(id);
    }
  }
  const known = { stats: new Set(statOrder) };
  const relRaw = isObj(raw.relationships) ? raw.relationships : isObj(raw.people) ? { people: raw.people } : {};
  const relStats = {};
  const relStatOrder = [];
  for (const [id, def] of Object.entries(isObj(relRaw.stats) ? relRaw.stats : {})) {
    const s = normStat(id, def, `Relationships › stats › ${id}`, c, true);
    if (s) {
      if (s.start === s.max && def?.start === undefined)
        s.start = s.min;
      relStats[id] = s;
      relStatOrder.push(id);
    }
  }
  const people = {};
  for (const [id, p] of Object.entries(isObj(relRaw.people) ? relRaw.people : {})) {
    const r = isObj(p) ? p : typeof p === "string" ? { name: p } : {};
    const start = {};
    if (isObj(r.start))
      for (const [s, v] of Object.entries(r.start))
        start[s] = c.num(v, `Relationships › people › ${id} › start › ${s}`, 0);
    people[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      age: r.age !== undefined ? c.num(r.age, `Relationships › people › ${id} › age`, 0) : undefined,
      start,
      desc: typeof r.desc === "string" ? r.desc : undefined
    };
  }
  const invRaw = isObj(raw.inventory) ? raw.inventory : {};
  const items = {};
  for (const [id, it] of Object.entries(isObj(raw.items) ? raw.items : isObj(invRaw.items) ? invRaw.items : {})) {
    const r = isObj(it) ? it : typeof it === "string" ? { name: it } : {};
    items[id] = { id, name: typeof r.name === "string" ? r.name : titleCase(id), desc: r.desc, tags: Array.isArray(r.tags) ? r.tags.map(String) : [] };
  }
  const locations = {};
  for (const [id, l] of Object.entries(isObj(raw.locations) ? raw.locations : {})) {
    const r = isObj(l) ? l : typeof l === "string" ? { name: l } : {};
    locations[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      desc: typeof r.desc === "string" ? r.desc : undefined,
      exits: Array.isArray(r.exits) ? r.exits.map(String) : [],
      travel: c.num(r.travel, `Locations › ${id} › travel`, 10)
    };
  }
  for (const l of Object.values(locations))
    for (const x of l.exits) {
      if (!locations[x])
        c.warn(`Locations › ${l.id} › exits`, `"${x}" isn't a declared location`);
    }
  const conditions = {};
  for (const [id, d] of Object.entries(isObj(raw.conditions) ? raw.conditions : {})) {
    const r = isObj(d) ? d : typeof d === "string" ? { label: d } : {};
    conditions[id] = {
      id,
      label: typeof r.label === "string" ? r.label : titleCase(id),
      tone: ["good", "warn", "bad", "neutral"].includes(r.tone) ? r.tone : "warn",
      desc: typeof r.desc === "string" ? r.desc : undefined,
      narrator: r.narrator === true
    };
  }
  const flags = {};
  for (const [id, d] of Object.entries(isObj(raw.flags) ? raw.flags : {})) {
    const r = isObj(d) ? d : { start: d };
    flags[id] = { id, label: r.label, narrator: r.narrator === true, start: r.start ?? false };
  }
  const startRaw = isObj(raw.start) ? raw.start : {};
  const startItems = {};
  const si = startRaw.items ?? invRaw.start;
  if (isObj(si))
    for (const [it, n] of Object.entries(si))
      startItems[it] = c.num(n, `Start › items › ${it}`, 1);
  else if (Array.isArray(si))
    for (const it of si)
      startItems[String(it)] = 1;
  if (isObj(startRaw.stats))
    for (const [s, v] of Object.entries(startRaw.stats)) {
      if (stats[s])
        stats[s].start = c.num(v, `Start › stats › ${s}`, stats[s].start);
      else
        c.warn(`Start › stats › ${s}`, "isn't a declared stat");
    }
  let startLocation = typeof startRaw.location === "string" ? startRaw.location : null;
  if (!startLocation && Object.keys(locations).length)
    startLocation = Object.keys(locations)[0];
  if (startLocation && Object.keys(locations).length && !locations[startLocation]) {
    c.warn("Start › location", `"${startLocation}" isn't a declared location`);
  }
  const clockRaw = isObj(raw.clock) ? raw.clock : {};
  const clockStartRaw = startRaw.time ?? clockRaw.start ?? "Mon 08:00";
  const clockStart = parseClockStart(clockStartRaw, weekdays);
  if (clockStart === null)
    c.warn("Clock › start", `"${clockStartRaw}" should look like "Mon 07:30" or "Day 1 07:30"`);
  const actions = {};
  const actionOrder = [];
  let i = 0;
  for (const [id, a] of Object.entries(isObj(raw.actions) ? raw.actions : {})) {
    const def = normAction(id, a, `Actions › ${id}`, c, known, i++);
    if (def) {
      actions[id] = def;
      actionOrder.push(id);
    }
  }
  actionOrder.sort((a, b) => actions[a].order - actions[b].order);
  for (const a of Object.values(actions))
    for (const loc of a.at) {
      if (Object.keys(locations).length && !locations[loc])
        c.warn(`Actions › ${a.id} › at`, `"${loc}" isn't a declared location`);
    }
  const triggers = [];
  const trigRaw = raw.triggers ?? raw.rules;
  const trigList = Array.isArray(trigRaw) ? trigRaw.map((t, n) => [isObj(t) && typeof t.id === "string" ? t.id : `rule_${n + 1}`, t]) : isObj(trigRaw) ? Object.entries(trigRaw) : [];
  for (const [id, t] of trigList) {
    const w = `Triggers › ${id}`;
    if (!isObj(t)) {
      c.warn(w, "expected `when:` and `do:`");
      continue;
    }
    const when = t.when ?? t.if;
    const whenExpr = when !== undefined ? c.expr(when, `${w} › when`) : undefined;
    const whenScene = typeof t.when_scene === "string" ? t.when_scene : typeof t.scene === "string" ? t.scene : undefined;
    if (whenExpr === undefined && !whenScene) {
      c.err(w, "needs `when:` (a formula) or `when_scene:` (a plain-language condition)");
      continue;
    }
    const effRaw = t.do ?? t.then ?? t.effects ?? {};
    const effects = normEffect(isObj(effRaw) ? { ...effRaw, ...t.hint ? { hint: t.hint } : {} } : effRaw, `${w} › do`, c, known);
    triggers.push({ id, when: whenExpr === undefined ? undefined : String(whenExpr), whenScene, repeat: t.repeat === true || t.every_turn === true, effects });
  }
  const hudRaw = isObj(raw.hud) ? raw.hud : {};
  const moneyStat = typeof hudRaw.money === "string" ? hudRaw.money : statOrder.find((s) => stats[s].kind === "money");
  const bars = Array.isArray(hudRaw.bars) ? hudRaw.bars.map(String).filter((b) => {
    if (!stats[b]) {
      c.warn("HUD › bars", `"${b}" isn't a declared stat`);
      return false;
    }
    return true;
  }) : statOrder.filter((s) => stats[s].kind === "meter");
  const narrRaw = isObj(raw.narration) ? raw.narration : {};
  const playerRaw = isObj(raw.player) ? raw.player : {};
  const ruleset = {
    name: typeof raw.name === "string" ? raw.name : "Untitled ruleset",
    description: typeof raw.description === "string" ? raw.description : undefined,
    player: {
      name: typeof playerRaw.name === "string" ? playerRaw.name : undefined,
      age: playerRaw.age !== undefined ? c.num(playerRaw.age, "Player › age", 0) : undefined
    },
    stats,
    statOrder,
    relStats,
    relStatOrder,
    people,
    peopleOpen: relRaw.open !== false && relStatOrder.length > 0,
    items,
    itemsOpen: invRaw.open !== false,
    startItems,
    locations,
    locationsOpen: raw.locations_open === true || Object.keys(locations).length === 0,
    startLocation,
    conditions,
    flags,
    actions,
    actionOrder,
    triggers,
    clock: {
      enabled: clockRaw.enabled !== false,
      start: clockStart ?? 480,
      minutesPerAction: c.num(clockRaw.minutes_per_action, "Clock › minutes_per_action", 10),
      narratorMax: c.num(clockRaw.narrator_max ?? clockRaw.narrator, "Clock › narrator_max", 480),
      weekdays
    },
    hud: { bars, money: moneyStat && stats[moneyStat] ? moneyStat : undefined, currency: typeof hudRaw.currency === "string" ? hudRaw.currency : "$" },
    narration: { notes: typeof narrRaw.notes === "string" ? narrRaw.notes : undefined, numbers: narrRaw.numbers === true }
  };
  const minors = [
    ...ruleset.player.age !== undefined && ruleset.player.age < 18 ? ["the player"] : [],
    ...Object.values(people).filter((p) => p.age !== undefined && p.age < 18).map((p) => p.name)
  ];
  const sexualActions = Object.values(actions).filter((a) => a.tags.some((t) => SEXUAL_TAGS.has(t)));
  if (minors.length && sexualActions.length) {
    c.err("Ruleset", `declares characters under 18 (${minors.join(", ")}) alongside sexual actions — Warp won't run this ruleset`);
    return { ruleset: null, issues: c.issues };
  }
  return { ruleset, issues: c.issues };
}

// src/engine/state.ts
function initialState(r) {
  const s = {
    stats: {},
    flags: {},
    items: { ...r.startItems },
    itemNames: {},
    rel: {},
    people: {},
    location: r.startLocation,
    locationName: r.startLocation ? r.locations[r.startLocation]?.name ?? r.startLocation : null,
    minutes: r.clock.start,
    conditions: {},
    triggers: {},
    turn: 0
  };
  for (const id of r.statOrder)
    s.stats[id] = r.stats[id].start;
  for (const f of Object.values(r.flags))
    s.flags[f.id] = f.start;
  for (const p of Object.values(r.people)) {
    s.people[p.id] = { name: p.name };
    s.rel[p.id] = {};
    for (const rs of r.relStatOrder)
      s.rel[p.id][rs] = p.start[rs] ?? r.relStats[rs].start;
  }
  return s;
}
function statMax(r, def, s) {
  if (!def.maxExpr)
    return def.max;
  const m = evalNumber(def.maxExpr, makeEnv(r, s), def.max);
  return Math.max(def.min + 1, m);
}
function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}
function applyEvent(s, e, r) {
  switch (e.t) {
    case "stat": {
      const def = r.stats[e.id];
      const cur = s.stats[e.id] ?? def?.start ?? 0;
      const next = e.set !== undefined ? e.set : cur + (e.d ?? 0);
      s.stats[e.id] = def ? clamp(next, def.min, statMax(r, def, s)) : next;
      break;
    }
    case "flag":
      s.flags[e.key] = e.v;
      break;
    case "item": {
      const n = (s.items[e.id] ?? 0) + e.d;
      if (n <= 0)
        delete s.items[e.id];
      else
        s.items[e.id] = n;
      if (e.name && !r.items[e.id])
        s.itemNames[e.id] = e.name;
      break;
    }
    case "person":
      s.people[e.id] = { name: e.name };
      if (!s.rel[e.id]) {
        s.rel[e.id] = {};
        for (const rs of r.relStatOrder)
          s.rel[e.id][rs] = r.relStats[rs].start;
      }
      break;
    case "rel": {
      if (!s.rel[e.who]) {
        s.rel[e.who] = {};
        for (const rs of r.relStatOrder)
          s.rel[e.who][rs] = r.relStats[rs].start;
      }
      const def = r.relStats[e.stat];
      const cur = s.rel[e.who][e.stat] ?? def?.start ?? 0;
      const next = e.set !== undefined ? e.set : cur + (e.d ?? 0);
      s.rel[e.who][e.stat] = def ? clamp(next, def.min, def.max) : next;
      break;
    }
    case "move":
      s.location = e.to;
      s.locationName = r.locations[e.to]?.name ?? e.name ?? e.to;
      break;
    case "time":
      s.minutes += Math.max(0, e.min);
      break;
    case "cond":
      if (e.on)
        s.conditions[e.id] = { until: e.until ?? null };
      else
        delete s.conditions[e.id];
      break;
    case "trig":
      s.triggers[e.id] = e.v;
      break;
    case "turn":
      s.turn += 1;
      break;
  }
}
function cloneState(s) {
  return structuredClone(s);
}
function makeEnv(r, s, extra = {}) {
  const day = Math.floor(s.minutes / 1440);
  const clockVars = {
    minutes: s.minutes,
    hour: Math.floor(s.minutes % 1440 / 60),
    minute: s.minutes % 60,
    day: day + 1,
    weekday: r.clock.weekdays[day % r.clock.weekdays.length] ?? "",
    turn: s.turn,
    location: s.location ?? ""
  };
  return {
    lookup(path) {
      const [head, ...rest] = path;
      if (rest.length === 0) {
        if (head in extra)
          return extra[head];
        if (head in s.stats)
          return s.stats[head];
        if (r.stats[head])
          return r.stats[head].start;
        if (head in clockVars)
          return clockVars[head];
        if (head in s.flags)
          return s.flags[head];
        if (r.flags[head])
          return r.flags[head].start;
        return;
      }
      if (head === "flags")
        return s.flags[rest[0]] ?? (r.flags[rest[0]] ? r.flags[rest[0]].start : false);
      if (head === "items")
        return s.items[rest[0]] ?? 0;
      if (head === "rel" && rest.length === 2)
        return s.rel[rest[0]]?.[rest[1]] ?? r.relStats[rest[1]]?.start ?? 0;
      if (s.rel[head] && rest.length === 1)
        return s.rel[head][rest[0]] ?? 0;
      if (r.people[head] && rest.length === 1)
        return r.relStats[rest[0]]?.start ?? 0;
      return;
    },
    call(name, args) {
      const a0 = String(args[0] ?? "");
      switch (name) {
        case "has":
          return (s.items[a0] ?? 0) >= (typeof args[1] === "number" ? args[1] : 1);
        case "count":
          return s.items[a0] ?? 0;
        case "flag":
          return s.flags[a0] ?? false;
        case "cond":
          return a0 in s.conditions;
        case "at":
          return s.location === a0;
        case "rel":
          return s.rel[a0]?.[String(args[1] ?? "")] ?? r.relStats[String(args[1] ?? "")]?.start ?? 0;
        case "met":
          return a0 in s.people;
        case "between": {
          const v = Number(args[0]);
          const lo = Number(args[1]);
          const hi = Number(args[2]);
          return lo <= hi ? v >= lo && v < hi : v >= lo || v < hi;
        }
      }
      return;
    }
  };
}
function bandFor(def, value) {
  let hit = null;
  for (const b of def.bands)
    if (value >= b.at)
      hit = b;
  return hit ?? def.bands[0] ?? null;
}
function gradeFor(def, value, max) {
  if (!def.grades?.length)
    return null;
  const span = max - def.min;
  if (span <= 0)
    return def.grades[0];
  const idx = Math.min(def.grades.length - 1, Math.floor((value - def.min) / span * def.grades.length));
  return def.grades[Math.max(0, idx)];
}
function formatClock(r, minutes) {
  const day = Math.floor(minutes / 1440);
  const h = Math.floor(minutes % 1440 / 60);
  const m = minutes % 60;
  const time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const wd = r.clock.weekdays[day % r.clock.weekdays.length] ?? "";
  const dayLabel = `${wd} · Day ${day + 1}`;
  const phase = h < 5 ? "night" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 21 ? "evening" : "night";
  return { label: `${dayLabel} · ${time}`, time, day: dayLabel, phase };
}
function formatNumber(n) {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
function itemName(r, s, id) {
  return r.items[id]?.name ?? s.itemNames[id] ?? id.replace(/[_-]+/g, " ");
}
function personName(r, s, id) {
  return s.people[id]?.name ?? r.people[id]?.name ?? id;
}

// src/engine/resolve.ts
class Working {
  r;
  s;
  rng;
  seed;
  odds;
  scene;
  events = [];
  hints = [];
  decisions = [];
  needs = [];
  constructor(r, s, rng = seededRng("effects"), seed = "effects", odds = {}, scene = {}) {
    this.r = r;
    this.s = s;
    this.rng = rng;
    this.seed = seed;
    this.odds = odds;
    this.scene = scene;
  }
  push(e) {
    applyEvent(this.s, e, this.r);
    this.events.push(e);
  }
  env(extra = {}) {
    const base = makeEnv(this.r, this.s, extra);
    return {
      lookup: base.lookup,
      call: (name, args) => {
        if (name === "roll") {
          try {
            return rollDice(String(args[0] ?? "d6"), this.rng).total;
          } catch {
            return 0;
          }
        }
        return base.call?.(name, args);
      }
    };
  }
}
var TRAVEL_PREFIX = "go:";
function travelTargets(r, s) {
  const here = s.location ? r.locations[s.location] : undefined;
  return here ? here.exits.filter((x) => r.locations[x]) : [];
}
function paramValues(a, chosen) {
  const out = {};
  for (const p of a.params) {
    const key = chosen?.[p.id] && p.options[chosen[p.id]] !== undefined ? chosen[p.id] : p.default;
    out[p.id] = p.options[key];
  }
  return out;
}
function isAvailable(r, s, a) {
  if (a.at.length && !a.at.includes(s.location ?? ""))
    return false;
  if (a.when && !evalBool(a.when, makeEnv(r, s, paramValues(a)), true))
    return false;
  return true;
}
function availableActions(r, s, lines = []) {
  const blocked = new Set(lines.map((l) => l.toLowerCase()));
  return r.actionOrder.map((id) => r.actions[id]).filter((a) => !a.tags.some((t) => blocked.has(t)) && isAvailable(r, s, a));
}
function tierFor(check, roll, add, target) {
  const total = roll.total + add;
  const sides = roll.primarySides;
  const single = roll.natural !== null;
  const critBand = Math.max(1, Math.floor(sides * 0.05));
  switch (check.style) {
    case "chance": {
      const t = target ?? 50;
      const ok = total <= t;
      if (check.crits && single && ok && roll.natural <= critBand)
        return "crit_success";
      if (check.crits && single && !ok && roll.natural > sides - critBand)
        return "crit_fail";
      return ok ? "success" : "fail";
    }
    case "vs": {
      const t = target ?? 10;
      if (check.crits && single && roll.natural === sides)
        return "crit_success";
      if (check.crits && single && roll.natural === 1)
        return "crit_fail";
      if (total >= t)
        return "success";
      if (check.partialMargin > 0 && total >= t - check.partialMargin)
        return "partial";
      return "fail";
    }
    case "pbta":
      if (check.crits && total >= 12)
        return "crit_success";
      if (total >= 10)
        return "success";
      if (total >= 7)
        return "partial";
      return "fail";
  }
}
function checkNumbers(r, s, a, params) {
  const check = a.check;
  const env = makeEnv(r, s, paramValues(a, params));
  const add = check.add !== undefined ? Math.round(evalNumber(check.add, env, 0)) : 0;
  let target = null;
  if (check.target !== undefined) {
    target = Math.round(evalNumber(check.target, env, check.style === "chance" ? 50 : 10));
    if (check.style === "chance")
      target = Math.max(0, Math.min(100, target));
  }
  return { add, target };
}
function odds(r, s, a, params) {
  const check = a.check;
  if (!check)
    return null;
  const { add, target } = checkNumbers(r, s, a, params);
  if (check.style === "chance" && check.dice === "d100" && target !== null) {
    return { success: target / 100, partial: 0 };
  }
  const rng = seededRng(`odds:${a.id}`);
  const N = 2000;
  let ok = 0, part = 0;
  for (let i = 0;i < N; i++) {
    const t = tierFor(check, rollDice(check.dice, rng), add, target);
    if (t === "success" || t === "crit_success")
      ok++;
    else if (t === "partial")
      part++;
  }
  return { success: ok / N, partial: part / N };
}
function flagValue(v, env) {
  if (typeof v !== "string")
    return v;
  try {
    const unknown = new Set;
    const out = evaluate(v, env, { unknown });
    return unknown.size ? v : out;
  } catch {
    return v;
  }
}
function effectToEvents(w, e, src, extra) {
  const r = w.r;
  for (const [id, d] of Object.entries(e.stats)) {
    const v = evalNumber(d, w.env(extra), 0);
    if (v !== 0)
      w.push({ t: "stat", id, d: v, src });
  }
  for (const [id, d] of Object.entries(e.set)) {
    w.push({ t: "stat", id, set: evalNumber(d, w.env(extra), 0), src });
  }
  for (const [key, v] of Object.entries(e.flags)) {
    w.push({ t: "flag", key, v: flagValue(v, w.env(extra)), src });
  }
  for (const [id, n] of Object.entries(e.items)) {
    if (n < 0 && !(w.s.items[id] > 0))
      continue;
    w.push({ t: "item", id, d: n, src });
  }
  for (const [who, m] of Object.entries(e.rel)) {
    if (!w.s.people[who])
      w.push({ t: "person", id: who, name: r.people[who]?.name ?? who, src });
    for (const [stat, d] of Object.entries(m)) {
      const v = evalNumber(d, w.env(extra), 0);
      if (v !== 0)
        w.push({ t: "rel", who, stat, d: v, src });
    }
  }
  if (e.move)
    w.push({ t: "move", to: e.move, src });
  for (const [id, dur] of Object.entries(e.addConditions)) {
    w.push({ t: "cond", id, on: true, until: dur === null ? null : w.s.minutes + dur, src });
  }
  for (const id of e.removeConditions)
    if (w.s.conditions[id])
      w.push({ t: "cond", id, on: false, src });
  if (e.time)
    advanceTime(w, e.time, src);
  if (e.hint)
    w.hints.push(e.hint);
  for (const d of e.decide)
    decide(w, d, src, extra);
}
function decide(w, d, src, extra) {
  if (w.decisions.some((x) => x.id === d.id))
    return;
  const keys = d.options.map((o) => o.id);
  const model = w.odds[d.id];
  if (!model)
    w.needs.push(d);
  const p = normalize(model ?? Object.fromEntries(d.options.map((o) => [o.id, o.weight])), keys);
  const picked = sample(p, seededRng(`${w.seed}:decide:${d.id}`));
  const opt = d.options.find((o) => o.id === picked);
  w.decisions.push({ id: d.id, ask: d.ask, picked, pickedDesc: opt.desc, p, source: model ? "model" : "weights" });
  effectToEvents(w, opt.effect, src, extra);
}
function advanceTime(w, minutes, src) {
  if (!w.r.clock.enabled || minutes <= 0)
    return;
  w.push({ t: "time", min: minutes, src });
  for (const id of w.r.statOrder) {
    const def = w.r.stats[id];
    if (!def.perHour)
      continue;
    const d = def.perHour * minutes / 60;
    if (Math.abs(d) > 0.000000001)
      w.push({ t: "stat", id, d, src: "drift" });
  }
  for (const [id, c] of Object.entries(w.s.conditions)) {
    if (c.until !== null && c.until <= w.s.minutes)
      w.push({ t: "cond", id, on: false, src: "drift", note: "expired" });
  }
}
function runTriggers(w, includeRepeat) {
  const fired = new Set;
  for (let pass = 0;pass < 5; pass++) {
    let changed = false;
    for (const t of w.r.triggers) {
      if (t.whenScene && !(t.id in w.scene))
        continue;
      const now = (t.when === undefined || evalBool(t.when, w.env(), false)) && (!t.whenScene || w.scene[t.id] === true);
      const prev = w.s.triggers[t.id] ?? false;
      if (now && !prev) {
        w.push({ t: "trig", id: t.id, v: true, src: "trigger" });
        effectToEvents(w, t.effects, "trigger", {});
        fired.add(t.id);
        changed = true;
      } else if (now && t.repeat && includeRepeat && !fired.has(t.id)) {
        effectToEvents(w, t.effects, "trigger", {});
        fired.add(t.id);
        changed = true;
      } else if (!now && prev) {
        w.push({ t: "trig", id: t.id, v: false, src: "trigger" });
        changed = true;
      }
    }
    if (!changed)
      break;
  }
}
var TIER_FALLBACK = {
  crit_success: ["crit_success", "success"],
  success: ["success"],
  partial: ["partial", "success"],
  fail: ["fail"],
  crit_fail: ["crit_fail", "fail"]
};
var TIER_LABEL = {
  crit_success: "Critical success",
  success: "Success",
  partial: "Partial success",
  fail: "Failure",
  crit_fail: "Critical failure"
};
function resolveTurnFull(r, before, intent, opts) {
  const needs = [];
  const record = resolveInner(r, before, intent, opts, needs);
  return { record, needs };
}
function resolveInner(r, before, intent, opts, needs) {
  const w = new Working(r, cloneState(before), seededRng(`${opts.seed}:fx`), opts.seed, opts.odds ?? {}, opts.scene ?? {});
  const rec = { v: 1, hints: [], events: [], at: Date.now() };
  const a = intent ? r.actions[intent.actionId] : undefined;
  if (intent?.actionId.startsWith(TRAVEL_PREFIX)) {
    const to = intent.actionId.slice(TRAVEL_PREFIX.length);
    const dest = r.locations[to];
    if (dest) {
      const from = before.location ? r.locations[before.location] : undefined;
      rec.action = { id: intent.actionId, label: `Go to ${dest.name}`, via: intent.via };
      w.push({ t: "move", to, src: "action" });
      advanceTime(w, from?.travel ?? dest.travel, "action");
      if (dest.desc)
        w.hints.push(`Arriving at ${dest.name}: ${dest.desc}`);
    }
  } else if (a) {
    const extra = paramValues(a, intent.params);
    rec.action = { id: a.id, label: a.label, via: intent.via, ...a.params.length ? { params: Object.fromEntries(a.params.map((p) => [p.id, intent.params?.[p.id] ?? p.default])) } : {} };
    effectToEvents(w, a.cost, "cost", extra);
    if (a.check) {
      const rng = seededRng(opts.seed);
      const { add, target } = checkNumbers(r, w.s, a, intent.params);
      const roll = rollDice(a.check.dice, rng);
      const tier = tierFor(a.check, roll, add, target);
      rec.check = {
        label: a.check.label ?? a.label,
        style: a.check.style,
        dice: a.check.dice,
        faces: roll.dice,
        roll: roll.total,
        add,
        total: roll.total + add,
        target,
        tier,
        seed: opts.seed
      };
      const key = TIER_FALLBACK[tier].find((t) => a.outcomes[t]);
      if (key)
        effectToEvents(w, a.outcomes[key], "check", extra);
      if (tier === "partial" && key === "success")
        w.hints.push("It works, but not cleanly — introduce a cost or complication.");
    } else {
      effectToEvents(w, a.effects, "action", extra);
    }
    advanceTime(w, a.time ?? r.clock.minutesPerAction, "action");
    const veils = new Set((opts.veils ?? []).map((v) => v.toLowerCase()));
    if (a.tags.some((t) => veils.has(t)))
      rec.veiled = true;
  }
  runTriggers(w, true);
  w.push({ t: "turn", src: "action" });
  rec.events = w.events;
  rec.hints = w.hints;
  if (w.decisions.length) {
    rec.decisions = w.decisions;
    for (const d of w.decisions)
      rec.hints.push(`${d.ask} → ${d.pickedDesc}`);
  }
  needs.push(...w.needs);
  return rec;
}
function clampAbs(v, lim) {
  return Math.max(-lim, Math.min(lim, v));
}
function findPerson(r, s, key) {
  const k = key.toLowerCase();
  for (const [id, p] of Object.entries(s.people))
    if (id === k || p.name.toLowerCase() === k)
      return id;
  for (const p of Object.values(r.people))
    if (p.id === k || p.name.toLowerCase() === k)
      return p.id;
  return null;
}
function applyProposal(r, before, p) {
  const w = new Working(r, cloneState(before), seededRng(`narrator:${before.turn}`));
  const src = "narrator";
  for (const person of p.people ?? []) {
    if (!person?.name || !r.peopleOpen)
      continue;
    if (findPerson(r, w.s, person.name))
      continue;
    const id = slug(person.id || person.name);
    if (!w.s.people[id])
      w.push({ t: "person", id, name: person.name, src });
  }
  for (const [id, d] of Object.entries(p.stats ?? {})) {
    const def = r.stats[id];
    if (!def || def.narrator <= 0 || typeof d !== "number" || !Number.isFinite(d))
      continue;
    const v = clampAbs(d, def.narrator);
    if (v !== 0)
      w.push({ t: "stat", id, d: v, src });
  }
  for (const [who, m] of Object.entries(p.rel ?? {})) {
    let id = findPerson(r, w.s, who);
    if (!id) {
      if (!r.peopleOpen)
        continue;
      id = slug(who);
      w.push({ t: "person", id, name: who, src });
    }
    for (const [stat, d] of Object.entries(m ?? {})) {
      const def = r.relStats[stat];
      if (!def || def.narrator <= 0 || typeof d !== "number" || !Number.isFinite(d))
        continue;
      const v = clampAbs(d, def.narrator);
      if (v !== 0)
        w.push({ t: "rel", who: id, stat, d: v, src });
    }
  }
  for (const [key, d] of Object.entries(p.items ?? {})) {
    if (typeof d !== "number" || !Number.isFinite(d) || d === 0)
      continue;
    const k = key.toLowerCase();
    const declared = Object.values(r.items).find((i) => i.id === k || i.name.toLowerCase() === k);
    const held = Object.keys(w.s.items).find((id) => id === k || (w.s.itemNames[id] ?? "").toLowerCase() === k);
    const id = declared?.id ?? held ?? slug(key);
    if (!declared && !r.itemsOpen)
      continue;
    const n = Math.round(clampAbs(d, 10));
    if (n < 0 && !(w.s.items[id] > 0))
      continue;
    w.push({ t: "item", id, d: n, ...declared ? {} : { name: key }, src });
  }
  if (p.move) {
    const k = p.move.toLowerCase();
    const loc = Object.values(r.locations).find((l) => l.id === k || l.name.toLowerCase() === k);
    if (loc && loc.id !== w.s.location)
      w.push({ t: "move", to: loc.id, src });
    else if (!loc && r.locationsOpen && k !== (w.s.locationName ?? "").toLowerCase())
      w.push({ t: "move", to: slug(p.move), name: p.move, src });
  }
  for (const id of p.conditions?.add ?? []) {
    const def = r.conditions[id];
    if (def?.narrator && !w.s.conditions[id])
      w.push({ t: "cond", id, on: true, until: null, src });
  }
  for (const id of p.conditions?.remove ?? []) {
    const def = r.conditions[id];
    if (def?.narrator && w.s.conditions[id])
      w.push({ t: "cond", id, on: false, src });
  }
  for (const [key, v] of Object.entries(p.flags ?? {})) {
    if (r.flags[key]?.narrator)
      w.push({ t: "flag", key, v, src });
  }
  if (typeof p.minutes === "number" && Number.isFinite(p.minutes) && p.minutes > 0) {
    advanceTime(w, Math.round(Math.min(p.minutes, r.clock.narratorMax)), src);
  }
  runTriggers(w, false);
  return w.events;
}
function manualSet(r, before, stat, value) {
  const w = new Working(r, cloneState(before));
  if (r.stats[stat])
    w.push({ t: "stat", id: stat, set: value, src: "manual" });
  runTriggers(w, false);
  return w.events;
}

// src/engine/templates/universal.ts
var universal = {
  id: "universal",
  name: "Universal",
  blurb: "Light mechanics for any card: time, place, health, energy, mood, money, relationships, and d20 checks the narrator can't fudge.",
  parts: [
    {
      label: "core",
      yaml: `# Warp ruleset — core settings.
# This lorebook is never sent to the model; Warp reads it directly.
name: Universal
description: Light mechanics that fit any card.

clock:
  start: Mon 09:00
  minutes_per_action: 10   # time an action takes unless it says otherwise
  narrator_max: 480        # the narrator may skip at most 8 hours per reply

hud:
  currency: "$"

narration:
  notes: Keep narration consistent with the state block. Never invent dice results.
`
    },
    {
      label: "stats",
      yaml: `stats:
  health:
    kind: meter
    narrator: 20          # the narrator may move this by at most 20 per reply
    bands:
      0: Near collapse.
      25: Badly hurt.
      50: Bruised and sore.
      80: Healthy.
  energy:
    kind: meter
    per_hour: -4          # drains slowly while awake
    narrator: 15
    bands:
      0: Exhausted.
      30: Tired.
      60: Alert.
  mood:
    kind: meter
    start: 60
    narrator: 10
    bands:
      0: Miserable.
      25: Low.
      50: Steady.
      75: In good spirits.
  money:
    kind: money
    start: 50
    narrator: 100

  body:
    kind: attribute
    max: 10
    start: 3
    desc: Strength, speed, endurance.
  mind:
    kind: attribute
    max: 10
    start: 3
    desc: Wits, knowledge, perception.
  charm:
    kind: attribute
    max: 10
    start: 3
    desc: Persuasion, presence, deceit.
`
    },
    {
      label: "people",
      yaml: `relationships:
  open: true              # new people the story introduces are tracked automatically
  stats:
    affection:
      start: 20
      narrator: 5
      bands:
        0: Hostile
        15: Cool
        35: Friendly
        60: Close
        85: Devoted
    trust:
      start: 20
      narrator: 5
      bands:
        0: Suspicious
        25: Wary
        50: Trusting
        80: Unshakeable
`
    },
    {
      label: "actions",
      yaml: `actions:
  look_around:
    label: Look around
    group: Explore
    say: "*I take a careful look around.*"
    time: 5
    check: { vs: 12, add: mind, label: Mind }
    success: { hint: "Reveal something useful or hidden that a careless person would miss." }
    fail: { hint: "Nothing stands out right now." }

  rest:
    label: Rest a while
    group: Rest
    say: "*I take some time to rest.*"
    time: 60
    effects: { energy: +25, health: +5 }

  sleep:
    label: Sleep
    group: Rest
    say: "*I turn in for the night.*"
    when: between(hour, 21, 5)
    time: 480
    effects: { energy: +100, health: +20, mood: +5 }

  wait:
    label: Wait an hour
    group: Rest
    say: "*I let some time pass.*"
    time: 60

  # Hidden actions never show as buttons. When you type something risky,
  # Warp's adjudicator picks one of these and a difficulty, and the dice decide.
  physical_feat:
    label: Physical feat
    hidden: true
    desc: Climbing, forcing, running, fighting, enduring pain — anything that tests the body.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: body, label: Body, partial: 3 }
    success: { hint: "It works." }
    fail: { energy: -10, hint: "It doesn't work, and it takes something out of {{user}}." }
    crit_fail: { health: -15, energy: -10, hint: "It goes badly wrong — a real setback or injury." }

  mental_feat:
    label: Mental feat
    hidden: true
    desc: Recalling facts, solving puzzles, spotting lies or danger, working something out.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: mind, label: Mind, partial: 3 }
    success: { hint: "The answer or insight comes clearly." }
    fail: { hint: "It doesn't add up — nothing useful comes of it." }

  social_feat:
    label: Social feat
    hidden: true
    desc: Persuading, lying, seducing, intimidating, calming someone down, haggling.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: charm, label: Charm, partial: 3 }
    success: { hint: "They're swayed." }
    fail: { mood: -5, hint: "It doesn't land. They're unconvinced, or put off." }
    crit_fail: { mood: -10, hint: "It backfires embarrassingly and they react badly." }
`
    },
    {
      label: "rules",
      yaml: `triggers:
  exhausted:
    when: energy <= 0
    do:
      add_condition: [exhausted]
      hint: "{{user}} is exhausted and struggling to stay upright."
  recovered:
    when: energy >= 30
    do:
      remove_condition: [exhausted]

conditions:
  exhausted:
    label: Exhausted
    tone: bad
    desc: Running on empty.
`
    }
  ]
};

// src/engine/templates/hometown.ts
var hometown = {
  id: "hometown",
  name: "Hometown (life-sim)",
  blurb: "Survival life-sim: Pain, Arousal, Fatigue, Stress, Trauma, Control and Allure described in words, graded skills, a clock, a small town map, and meters that feed into each other.",
  parts: [
    {
      label: "core",
      yaml: `name: Hometown
description: A survival life-sim in a small coastal university town.

player:
  age: 20                 # a university student

clock:
  start: Mon 07:00
  minutes_per_action: 15
  narrator_max: 240

start:
  location: apartment
  items: { phone: 1, keys: 1 }

hud:
  currency: "£"
  bars: [pain, arousal, fatigue, stress, trauma, control, allure]

narration:
  notes: >-
    Describe {{user}}'s condition through the state lines, not numbers.
    High fatigue, stress or trauma should visibly colour their behaviour.
`
    },
    {
      label: "stats",
      yaml: `stats:
  # Every meter runs 0–100, so hand edits and author formulas stay readable.
  pain:
    kind: meter
    good: low
    per_hour: -6
    narrator: 20
    bands:
      0: You feel okay.
      15: You're a little sore.
      40: You're in pain.
      65: You're in agony!
  arousal:
    kind: meter
    good: none
    start: 0
    per_hour: -3
    narrator: 25
    color: "#e0569b"
    bands:
      0: You feel cold.
      20: You feel warm.
      50: You feel aroused.
      80: You're shaking with arousal.
  fatigue:
    kind: meter
    good: low
    start: 8
    per_hour: 3             # about a point every 20 minutes awake
    narrator: 15
    bands:
      0: You are wide awake.
      30: You are alert.
      60: You are tired.
      85: You are exhausted.
  stress:
    kind: meter
    good: low
    start: 0
    per_hour: -0.4
    narrator: 15
    bands:
      0: You are calm.
      30: You are stressed.
      60: You are strained.
      80: You are distressed.
  trauma:
    kind: meter
    good: low
    start: 0
    narrator: 8
    bands:
      0: You feel fine.
      20: You are uneasy.
      50: You are nervous.
      80: You feel numb.
  control:
    kind: meter
    good: high
    start: 100
    narrator: 25
    bands:
      0: You are terrified.
      20: You are scared.
      40: You are insecure.
      70: You are confident.
  allure:
    kind: meter
    good: none
    start: 8
    narrator: 15
    bands:
      0: You don't stand out.
      10: You attract glances.
      30: You stand out.
      60: You look like you want trouble.
  money:
    kind: money
    start: 60
    narrator: 200

  athletics:   { kind: skill, max: 100, start: 10, grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  swimming:    { kind: skill, max: 100, start: 5,   grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  dancing:     { kind: skill, max: 100, start: 0,   grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  skulduggery: { kind: skill, max: 100, start: 0,   grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  tending:     { kind: skill, max: 100, start: 5,   grades: [F, F+, D, D+, C, C+, B, B+, A, A+, S] }
  studies:     { kind: skill, max: 100, start: 20,  grades: [F, E, D, C, B, A, "A*"] }
  crime:
    kind: hidden
    good: low
    per_hour: -0.04
`
    },
    {
      label: "people",
      yaml: `relationships:
  open: true
  stats:
    love:
      start: 0
      narrator: 5
      bands: { 0: Indifferent, 10: Fond, 40: Smitten, 75: In love }
    lust:
      start: 0
      narrator: 8
      good: none
      bands: { 0: Uninterested, 20: Curious, 50: Wanting, 80: Obsessed }
    trust:
      start: 10
      narrator: 5
      bands: { 0: Distrustful, 15: Wary, 45: Trusting, 80: Devoted }
    dominance:
      start: 0
      min: -100
      max: 100
      good: none
      narrator: 5
      bands: { -100: Submissive, -30: Deferential, -10: Even, 10: Assertive, 40: Domineering }
`
    },
    {
      label: "world",
      yaml: `locations:
  apartment:
    name: Your Apartment
    desc: A cramped one-bedroom above a chip shop. Thin walls, a lock that sticks.
    exits: [high_street]
  high_street:
    name: High Street
    desc: Shops, a café, a busy bus stop. Crowded by day, emptier at night.
    exits: [apartment, campus, park, docks, the_strip]
  campus:
    name: University Campus
    desc: Lecture halls, a library, a gym with a pool.
    exits: [high_street]
    travel: 15
  park:
    name: Seaview Park
    desc: Lawns, a duck pond, dense woods at the far end.
    exits: [high_street]
  docks:
    name: The Docks
    desc: Warehouses and cargo ships. Rough, and rougher after dark.
    exits: [high_street]
    travel: 20
  the_strip:
    name: The Strip
    desc: Bars and clubs, neon and noise until dawn.
    exits: [high_street]

items:
  phone: Phone
  keys: Apartment keys
  coffee: Coffee

conditions:
  exhausted: { label: Exhausted, tone: bad, desc: Stress builds fast while this tired. }
  scared: { label: Scared, tone: bad, desc: Low control — trauma comes to the surface. }
  shaken: { label: Shaken, tone: warn, desc: Recently overwhelmed. }
  wanted: { label: Wanted, tone: bad, desc: The police are looking for you. }
`
    },
    {
      label: "actions",
      yaml: `actions:
  sleep:
    label: Sleep
    group: Home
    at: apartment
    say: "*I get into bed and sleep.*"
    time: 480
    effects: { fatigue: -100, stress: -15, pain: -30, control: +10 }
  shower:
    label: Shower
    group: Home
    at: apartment
    say: "*I take a long shower.*"
    time: 20
    effects: { stress: -3, arousal: -5 }

  attend_lecture:
    label: Attend lecture
    group: Campus
    at: campus
    when: between(hour, 9, 16) and weekday != 'Sat' and weekday != 'Sun'
    say: "*I head into a lecture and try to focus.*"
    time: 90
    effects: { studies: +1.5, fatigue: +5 }
  study:
    label: Study in the library
    group: Campus
    at: campus
    say: "*I find a quiet corner in the library and study.*"
    time: 60
    check: { chance: 50 + studies / 2 - fatigue / 2, label: Studies }
    success: { studies: +1.2, hint: "The material clicks." }
    fail: { studies: +0.3, stress: +2, hint: "The words swim; very little sticks." }
  swim:
    label: Swim laps
    group: Campus
    at: campus
    say: "*I swim laps in the university pool.*"
    time: 45
    effects: { swimming: +1, athletics: +0.4, fatigue: +12, stress: -3 }

  jog:
    label: Go for a jog
    group: Park
    at: park
    say: "*I go for a jog around the park.*"
    time: 40
    check: { chance: 60 + athletics / 2 - fatigue * 2 / 3, label: Athletics }
    success: { athletics: +1, fatigue: +10, stress: -4 }
    fail: { athletics: +0.4, fatigue: +17, pain: +10, hint: "{{user}} pushes too hard and ends up aching and winded." }

  cafe_shift:
    label: Work a café shift
    group: Work
    at: high_street
    when: between(hour, 7, 18)
    say: "*I put on an apron and work a shift at the café.*"
    time: 240
    check: { chance: 55 + tending / 1.5, label: Tending }
    success: { money: 45 + tending / 2, tending: +1.2, fatigue: +20, hint: "A smooth shift — good tips." }
    fail: { money: 30, tending: +0.6, fatigue: +22, stress: +6, hint: "A rough shift: rude customers and a smashed tray." }
  buy_coffee:
    label: Buy a coffee (£3)
    group: Shops
    at: high_street
    when: money >= 3
    say: "*I grab a coffee.*"
    time: 10
    effects: { money: -3, fatigue: -4 }

  pickpocket:
    label: Pick a pocket
    group: Crime
    at: [high_street, the_strip]
    say: "*I pick out a distracted mark and go for their wallet.*"
    tags: [crime]
    time: 10
    check: { chance: 15 + skulduggery / 1.2 - allure / 8, label: Skulduggery }
    crit_success: { money: roll('4d10') + 20, skulduggery: +1.5, hint: "A fat wallet, and nobody noticed a thing." }
    success: { money: roll('2d10') + 5, skulduggery: +1, hint: "Clean lift. Nobody noticed." }
    fail: { crime: +6, stress: +8, skulduggery: +0.3, hint: "The mark catches {{user}}'s wrist and starts shouting." }
    crit_fail: { crime: +16, stress: +15, pain: +20, hint: "Caught red-handed by someone who doesn't wait for the police." }

  dance:
    label: Dance at a club
    group: Nightlife
    at: the_strip
    when: hour >= 20 or hour < 4
    say: "*I hit the dance floor.*"
    time: 60
    check: { chance: 40 + dancing / 1.2, label: Dancing }
    success: { dancing: +1.2, stress: -6, allure: +3, fatigue: +10, hint: "{{user}} moves well and draws eyes." }
    fail: { dancing: +0.5, stress: +2, fatigue: +10, hint: "Awkward, off the beat, and a little embarrassing." }
  drink:
    label: Have a drink (£6)
    group: Nightlife
    at: the_strip
    when: money >= 6
    say: "*I order a drink.*"
    time: 30
    effects: { money: -6, stress: -5, control: -2 }

  wander:
    label: Wander around
    group: Explore
    say: "*I wander and see what's going on.*"
    time: 30
    effects:
      # The decision model weighs these against the scene (time, place, allure…); the engine rolls.
      decide:
        ask: What does the town throw at {{user}} while they wander?
        options:
          windfall: { desc: "A small windfall", weight: 2, money: roll('2d6'), hint: "{{user}} stumbles on a little luck — some dropped cash." }
          friendly: { desc: "A friendly face", weight: 3, stress: -3, hint: "Someone friendly strikes up a conversation." }
          quiet: { desc: "Nothing much happens", weight: 3, stress: -1, hint: "A quiet, uneventful walk." }
          trouble: { desc: "Someone unpleasant takes an interest", weight: 2, stress: +4, hint: "Trouble finds {{user}}: someone unpleasant takes an interest." }

  endure:
    label: Endure
    hidden: true
    desc: Resisting pain, fear, temptation or pressure; keeping composure.
    params:
      difficulty: { easy: 75, normal: 50, hard: 30, extreme: 15 }
    check: { chance: difficulty + control / 4 - stress / 4, label: Control }
    success: { hint: "{{user}} holds it together." }
    fail: { stress: +5, control: -4, hint: "{{user}} cracks under it." }
  escape:
    label: Escape
    hidden: true
    desc: Running away, struggling free, slipping out of a bad situation.
    params:
      difficulty: { easy: 75, normal: 50, hard: 30, extreme: 15 }
    check: { chance: difficulty + athletics / 2.5 - fatigue / 3 - pain * 0.8, label: Athletics }
    success: { fatigue: +7, hint: "{{user}} gets away." }
    fail: { fatigue: +10, pain: +10, hint: "{{user}} doesn't get away." }
  sneak:
    label: Sneak
    hidden: true
    desc: Staying unseen, lockpicking, shoplifting, anything sly.
    tags: [crime]
    params:
      difficulty: { easy: 70, normal: 45, hard: 25, extreme: 10 }
    check: { chance: difficulty + skulduggery / 1.5, label: Skulduggery }
    success: { skulduggery: +0.8 }
    fail: { crime: +3, stress: +3, skulduggery: +0.2, hint: "{{user}} is noticed." }
`
    },
    {
      label: "rules",
      yaml: `# Meters that feed into each other.
triggers:
  exhaustion:
    when: fatigue >= 85
    do:
      add_condition: [exhausted]
      hint: "{{user}} is swaying on their feet from exhaustion."
  exhaustion_stress:
    when: fatigue >= 85
    repeat: true
    do: { stress: +2.5 }
  rested:
    when: fatigue < 60
    do: { remove_condition: [exhausted] }

  breakdown:
    when: stress >= 100
    do:
      set: { stress: 60 }
      trauma: +12
      control: -20
      add_condition: { shaken: 240 }
      hint: "The pressure finally overwhelms {{user}} — they break down."

  scared:
    when: control < 40
    do:
      add_condition: [scared]
      hint: "{{user}}'s nerve is gone; old fears are surfacing."
  steady:
    when: control >= 40
    do: { remove_condition: [scared] }
  trauma_eats_control:
    when: trauma >= 50
    repeat: true
    do: { control: -1 }

  # Judged by the decision model each turn, in plain language.
  threatened:
    when_scene: "{{user}} is being threatened, cornered or attacked"
    do:
      stress: +4
      control: -3
  wanted:
    when: crime >= 30
    do:
      add_condition: [wanted]
      hint: "Word is out: the police are asking about {{user}}."
  cleared:
    when: crime < 16
    do: { remove_condition: [wanted] }
`
    }
  ]
};

// src/engine/templates/starfarer.ts
var starfarer = {
  id: "starfarer",
  name: "Starfarer (sci-fi RPG)",
  blurb: "Sci-fi RPG: Physique, Reflexes, Aim, Intelligence, Willpower and Libido capped at 5× level; Shields/HP/Lust/Energy pools; credits; XP and levels; a ship; combat moves that appear during fights.",
  parts: [
    {
      label: "core",
      yaml: `name: Starfarer
description: A frontier sci-fi RPG aboard your own ship.

clock:
  start: Day 1 08:00
  minutes_per_action: 10
  narrator_max: 720

start:
  location: bridge
  items: { holdout_pistol: 1, medkit: 2, codex: 1 }

hud:
  currency: "₡"
  bars: [shields, hp, lust, energy, xp]

flags:
  in_combat: { narrator: true }     # the narrator starts/ends fights
  enemy_defense: { start: 12, narrator: true }
`
    },
    {
      label: "stats",
      yaml: `stats:
  level:
    kind: attribute
    start: 1
    max: 20
  xp:
    kind: meter
    label: XP
    start: 0
    max: level * 100
    good: none
    narrator: 60
  shields:
    kind: meter
    max: 10 + level * 8
    start: 18
    per_hour: 30
    narrator: 15
  hp:
    kind: meter
    label: HP
    max: 20 + physique * 2 + level * 10
    start: 36
    per_hour: 4
    narrator: 20
    bands:
      0: Down.
      10: Critical.
      40: Wounded.
      75: Healthy.
  lust:
    kind: meter
    good: low
    start: 10
    per_hour: -5
    narrator: 20
    bands:
      0: Cool-headed.
      30: Warm.
      60: Flushed.
      90: Can barely think.
  energy:
    kind: meter
    start: 100
    per_hour: 15
    narrator: 20
  credits:
    kind: money
    start: 500
    narrator: 300

  physique:     { kind: attribute, start: 3, max: level * 5, desc: Melee power and HP. }
  reflexes:     { kind: attribute, start: 3, max: level * 5, desc: Evasion, speed, flight. }
  aim:          { kind: attribute, start: 3, max: level * 5, desc: Ranged accuracy and damage. }
  intelligence: { kind: attribute, start: 3, max: level * 5, desc: Tech, sensing, knowledge. }
  willpower:    { kind: attribute, start: 3, max: level * 5, desc: Resisting physical, mental and sexual pressure. }
  libido:       { kind: attribute, start: 15, max: 100, good: none, desc: Tease power and how quickly lust rises. }
`
    },
    {
      label: "people",
      yaml: `relationships:
  open: true
  stats:
    affinity:
      start: 10
      narrator: 5
      bands: { 0: Hostile, 10: Neutral, 35: Friendly, 65: Close, 90: Devoted }
    attraction:
      start: 0
      narrator: 8
      good: none
      bands: { 0: None, 25: Curious, 55: Interested, 85: Infatuated }
`
    },
    {
      label: "world",
      yaml: `locations:
  bridge:
    name: Ship — Bridge
    desc: Your ship's cramped cockpit and nav console.
    exits: [quarters, cargo_bay]
    travel: 2
  quarters:
    name: Ship — Quarters
    desc: A bunk, a shower, a locker.
    exits: [bridge]
    travel: 2
  cargo_bay:
    name: Ship — Cargo Bay
    desc: The loading ramp opens onto whatever dock you're berthed at.
    exits: [bridge, concourse, jungle_edge]
    travel: 2
  concourse:
    name: Station Concourse
    desc: Merchants, a bar, and a notice board full of bounties.
    exits: [cargo_bay, bar, merchant]
    travel: 10
  bar:
    name: The Dry Dock (bar)
    desc: Spacers, mercs, and rumours.
    exits: [concourse]
  merchant:
    name: Gear Merchant
    desc: Guns, armour, gadgets — for a price.
    exits: [concourse]
  jungle_edge:
    name: Frontier Jungle
    desc: Hot, wet, and full of things that bite. Or worse.
    exits: [cargo_bay]
    travel: 30

items:
  holdout_pistol: Holdout pistol
  medkit: Medkit
  codex: Codex
  shield_booster: Shield booster

conditions:
  stunned: { label: Stunned, tone: bad, narrator: true }
  grappled: { label: Grappled, tone: bad, narrator: true }
  burning: { label: Burning, tone: bad, narrator: true }
`
    },
    {
      label: "actions",
      yaml: `actions:
  # ── Combat (only while in_combat is true) ──
  shoot:
    label: Shoot
    group: Combat
    when: in_combat
    say: "*I draw and fire.*"
    time: 1
    cost: { energy: -5 }
    check: { vs: enemy_defense, add: floor(aim / 2), label: Aim }
    crit_success: { hint: "A perfect shot — devastating damage, the enemy reels." }
    success: { hint: "The shot lands solidly." }
    fail: { shields: -6, hint: "Missed — and the enemy answers with a hit of their own." }
    crit_fail: { shields: -6, hp: -8, hint: "A bad miss that leaves {{user}} wide open to a painful counter." }
  melee:
    label: Melee
    group: Combat
    when: in_combat
    say: "*I close in and strike.*"
    time: 1
    cost: { energy: -8 }
    check: { vs: enemy_defense, add: floor(physique / 2), label: Physique }
    success: { hint: "A heavy blow connects." }
    fail: { shields: -8, hint: "Blocked, and the counterattack hurts." }
    crit_fail: { hp: -10, hint: "Overextended — {{user}} takes a brutal hit." }
  tease:
    label: Tease
    group: Combat
    when: in_combat
    say: "*I put on a show to throw them off.*"
    time: 1
    check: { vs: enemy_defense, add: floor(libido / 10), label: Libido }
    success: { hint: "The enemy is visibly flustered and distracted." }
    fail: { lust: +8, hint: "They don't bite — and the attempt leaves {{user}} a little hot and bothered." }
  sense:
    label: Sense
    group: Combat
    when: in_combat
    say: "*I study my opponent for weaknesses.*"
    time: 1
    check: { vs: 12, add: floor(intelligence / 2), label: Intelligence }
    success: { flags: { enemy_defense: enemy_defense - 3 }, hint: "Reveal the enemy's weak point and what they like and dislike." }
    fail: { hint: "Nothing useful gleaned." }
  flee:
    label: Flee
    group: Combat
    when: in_combat
    say: "*I try to break away and run.*"
    time: 1
    check: { vs: 13, add: floor(reflexes / 2), label: Reflexes }
    success: { flags: { in_combat: false }, energy: -10, hint: "{{user}} escapes." }
    fail: { shields: -6, hint: "Cut off — the fight goes on." }
  use_medkit:
    label: Use a medkit
    group: Combat
    when: has('medkit')
    say: "*I slap a medkit on.*"
    time: 2
    effects: { take: medkit, hp: +25 }

  # ── Out of combat ──
  rest_quarters:
    label: Rest in your bunk
    group: Ship
    at: quarters
    when: not in_combat
    say: "*I crash in my bunk for a few hours.*"
    time: 240
    effects: { hp: +40, shields: +100, energy: +100, lust: -20 }
  scan:
    label: Scan the area
    group: Explore
    when: not in_combat
    say: "*I sweep the area with my codex scanner.*"
    time: 5
    check: { vs: 12, add: floor(intelligence / 2), label: Intelligence }
    success: { hint: "The scan reveals something valuable: a hidden route, loot, or a threat before it strikes." }
    fail: { hint: "Interference. Nothing useful." }
  explore:
    label: Explore
    group: Explore
    at: jungle_edge
    when: not in_combat
    say: "*I push deeper into the jungle.*"
    time: 45
    check: { vs: 11, add: floor(reflexes / 3), label: Reflexes }
    success: { xp: +15, credits: roll('3d20'), hint: "A discovery: salvage or something worth selling." }
    fail: { flags: { in_combat: true }, hint: "Something hostile ambushes {{user}} — a fight begins." }
  buy_booster:
    label: Buy shield booster (₡150)
    group: Trade
    at: merchant
    when: credits >= 150
    say: "*I buy a shield booster.*"
    effects: { credits: -150, give: shield_booster }
  drink:
    label: Have a drink (₡20)
    group: Social
    at: bar
    when: credits >= 20
    say: "*I order a drink and listen for rumours.*"
    time: 30
    check: { vs: 10, add: floor(intelligence / 3), label: Intelligence }
    success: { credits: -20, lust: +5, hint: "A useful rumour: a job, a lead, or a warning." }
    fail: { credits: -20, lust: +5, hint: "Just noise tonight." }

  # ── Free-text only ──
  resist:
    label: Resist
    hidden: true
    desc: Resisting seduction, grapples, mind games, drugs or pain.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: floor(willpower / 2), label: Willpower }
    success: { hint: "{{user}} holds firm." }
    fail: { lust: +10, hint: "{{user}}'s resolve slips." }
  tech:
    label: Tech
    hidden: true
    desc: Hacking, repairs, piloting tricks, anything technical.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: floor(intelligence / 2), label: Intelligence, partial: 3 }
    success: { xp: +5, hint: "It works." }
    fail: { hint: "It doesn't work." }
`
    },
    {
      label: "rules",
      yaml: `triggers:
  # Fights start and end from the story itself, judged each turn by the decision model.
  fight_starts:
    when_scene: "A fight has broken out and {{user}} is in it"
    do:
      flags: { in_combat: true }
      hint: "Combat! {{user}} squares up."
  fight_over:
    when: in_combat
    when_scene: "The fight is over — enemies fled, surrendered, or are down"
    do:
      flags: { in_combat: false }
  level_up:
    when: xp >= level * 100
    do:
      set: { xp: 0 }
      level: +1
      physique: +1
      reflexes: +1
      aim: +1
      intelligence: +1
      willpower: +1
      hint: "Level up! {{user}} feels stronger, faster, sharper."
  shields_down:
    when: shields <= 0 and in_combat
    do:
      hint: "{{user}}'s shields are down — hits now land on flesh."
  defeated_hp:
    when: hp <= 0
    do:
      flags: { in_combat: false }
      set: { hp: 1 }
      credits: -100
      hint: "{{user}} is knocked out. They wake later, robbed of some credits."
  defeated_lust:
    when: lust >= 100
    do:
      flags: { in_combat: false }
      set: { lust: 40 }
      hint: "{{user}} is overwhelmed by lust and can't keep fighting — the enemy has their way."
`
    }
  ]
};

// src/engine/templates/index.ts
var TEMPLATES = [universal, hometown, starfarer];
function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id);
}

// src/backend/host.ts
function host() {
  return spindle;
}
function send(msg, userId) {
  spindle.sendToFrontend(msg, userId);
}
function toast(level, message, userId) {
  try {
    spindle.toast[level](message, { title: "Warp", ...userId ? { userId } : {} });
  } catch {
    send({ type: "toast", level, message }, userId);
  }
}
function logError(where, err) {
  const msg = err instanceof Error ? err.message : String(err);
  try {
    spindle.log.error(`[warp] ${where}: ${msg}`);
  } catch {}
}

// src/backend/ledger.ts
function warpMeta(m) {
  const w = m.metadata?.warp;
  return w && typeof w === "object" ? w : {};
}
function activeRecord(m) {
  return warpMeta(m).swipes?.[String(m.swipe_id ?? 0)] ?? null;
}
async function getMessages(chatId) {
  const msgs = await host().chat.getMessages(chatId);
  return [...msgs].sort((a, b) => a.index_in_chat - b.index_in_chat);
}
function foldPath(r, msgs) {
  let s = initialState(r);
  const steps = [];
  for (const m of msgs) {
    const rec = activeRecord(m);
    if (!rec?.events?.length)
      continue;
    const before = s;
    const after = cloneState(s);
    for (const e of rec.events)
      applyEvent(after, e, r);
    steps.push({ message: m, record: rec, before, after });
    s = after;
  }
  return { state: s, steps };
}
async function patchWarpMeta(chatId, messageId, fn) {
  const msgs = await getMessages(chatId);
  const m = msgs.find((x) => x.id === messageId);
  if (!m)
    throw new Error("Message not found");
  const meta = { ...m.metadata ?? {} };
  meta.warp = fn({ ...warpMeta(m) });
  await host().chat.updateMessage(chatId, messageId, { metadata: meta, skipChunkRebuild: true });
}
async function writeRecord(chatId, messageId, swipe, rec) {
  await patchWarpMeta(chatId, messageId, (w) => ({ ...w, swipes: { ...w.swipes ?? {}, [String(swipe)]: rec } }));
}
async function shiftAfterSwipeDelete(chatId, messageId, deleted) {
  await patchWarpMeta(chatId, messageId, (w) => {
    const next = {};
    for (const [k, v] of Object.entries(w.swipes ?? {})) {
      const i = Number(k);
      if (i === deleted)
        continue;
      next[String(i > deleted ? i - 1 : i)] = v;
    }
    return { ...w, swipes: next };
  });
}

// src/shared/protocol.ts
var DEFAULT_SETTINGS = {
  enabled: true,
  freeTextChecks: true,
  narratorUpdates: true,
  swipesReroll: true,
  helperConnectionId: "",
  showOdds: true,
  showDiceChips: true,
  hotkeys: true,
  lines: [],
  veils: [],
  decider: "llm",
  jevModel: "jev-latest",
  autoConfidence: 0.75,
  askConfidence: 0.4,
  consistencyCheck: false
};

// src/backend/settings.ts
var cache2 = new Map;
var key = (userId) => userId ?? "_";
async function getSettings(userId) {
  const hit = cache2.get(key(userId));
  if (hit)
    return hit;
  let stored = {};
  try {
    stored = await host().userStorage.getJson("settings.json", { fallback: {}, userId });
  } catch {}
  const s = { ...DEFAULT_SETTINGS, ...stored };
  cache2.set(key(userId), s);
  return s;
}
async function patchSettings(patch, userId) {
  const cur = await getSettings(userId);
  const next = { ...cur, ...patch };
  next.lines = (next.lines ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  next.veils = (next.veils ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
  cache2.set(key(userId), next);
  await host().userStorage.setJson("settings.json", next, { indent: 2, userId });
  return next;
}

// node_modules/js-yaml/dist/js-yaml.mjs
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var jsYaml = {};
var loader = {};
var common = {};
var hasRequiredCommon;
function requireCommon() {
  if (hasRequiredCommon)
    return common;
  hasRequiredCommon = 1;
  function isNothing(subject) {
    return typeof subject === "undefined" || subject === null;
  }
  function isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }
  function toArray(sequence) {
    if (Array.isArray(sequence))
      return sequence;
    else if (isNothing(sequence))
      return [];
    return [sequence];
  }
  function extend(target, source) {
    if (source) {
      const sourceKeys = Object.keys(source);
      for (let index = 0, length = sourceKeys.length;index < length; index += 1) {
        const key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    let result = "";
    for (let cycle = 0;cycle < count; cycle += 1) {
      result += string;
    }
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  common.isNothing = isNothing;
  common.isObject = isObject;
  common.toArray = toArray;
  common.repeat = repeat;
  common.isNegativeZero = isNegativeZero;
  common.extend = extend;
  return common;
}
var exception;
var hasRequiredException;
function requireException() {
  if (hasRequiredException)
    return exception;
  hasRequiredException = 1;
  function formatError(exception2, compact) {
    let where = "";
    const message = exception2.reason || "(unknown reason)";
    if (!exception2.mark)
      return message;
    if (exception2.mark.name) {
      where += 'in "' + exception2.mark.name + '" ';
    }
    where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
    if (!compact && exception2.mark.snippet) {
      where += `

` + exception2.mark.snippet;
    }
    return message + " " + where;
  }
  function YAMLException2(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack || "";
    }
  }
  YAMLException2.prototype = Object.create(Error.prototype);
  YAMLException2.prototype.constructor = YAMLException2;
  YAMLException2.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  exception = YAMLException2;
  return exception;
}
var snippet;
var hasRequiredSnippet;
function requireSnippet() {
  if (hasRequiredSnippet)
    return snippet;
  hasRequiredSnippet = 1;
  const common2 = requireCommon();
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    let head = "";
    let tail = "";
    const maxHalfLength = Math.floor(maxLineLength / 2) - 1;
    if (position - lineStart > maxHalfLength) {
      head = " ... ";
      lineStart = position - maxHalfLength + head.length;
    }
    if (lineEnd - position > maxHalfLength) {
      tail = " ...";
      lineEnd = position + maxHalfLength - tail.length;
    }
    return {
      str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "→") + tail,
      pos: position - lineStart + head.length
    };
  }
  function padStart(string, max) {
    return common2.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer)
      return null;
    if (!options.maxLength)
      options.maxLength = 79;
    if (typeof options.indent !== "number")
      options.indent = 1;
    if (typeof options.linesBefore !== "number")
      options.linesBefore = 3;
    if (typeof options.linesAfter !== "number")
      options.linesAfter = 2;
    const re = /\r?\n|\r|\0/g;
    const lineStarts = [0];
    const lineEnds = [];
    let match;
    let foundLineNo = -1;
    while (match = re.exec(mark.buffer)) {
      lineEnds.push(match.index);
      lineStarts.push(match.index + match[0].length);
      if (mark.position <= match.index && foundLineNo < 0) {
        foundLineNo = lineStarts.length - 2;
      }
    }
    if (foundLineNo < 0)
      foundLineNo = lineStarts.length - 1;
    let result = "";
    const lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    const maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (let i = 1;i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0)
        break;
      const line2 = getLine(mark.buffer, lineStarts[foundLineNo - i], lineEnds[foundLineNo - i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]), maxLineLength);
      result = common2.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line2.str + `
` + result;
    }
    const line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common2.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + `
`;
    result += common2.repeat("-", options.indent + lineNoLength + 3 + line.pos) + `^
`;
    for (let i = 1;i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length)
        break;
      const line2 = getLine(mark.buffer, lineStarts[foundLineNo + i], lineEnds[foundLineNo + i], mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]), maxLineLength);
      result += common2.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line2.str + `
`;
    }
    return result.replace(/\n$/, "");
  }
  snippet = makeSnippet;
  return snippet;
}
var type;
var hasRequiredType;
function requireType() {
  if (hasRequiredType)
    return type;
  hasRequiredType = 1;
  const YAMLException2 = requireException();
  const TYPE_CONSTRUCTOR_OPTIONS = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ];
  const YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map2) {
    const result = {};
    if (map2 !== null) {
      Object.keys(map2).forEach(function(style) {
        map2[style].forEach(function(alias) {
          result[String(alias)] = style;
        });
      });
    }
    return result;
  }
  function Type2(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
        throw new YAMLException2('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
      }
    });
    this.options = options;
    this.tag = tag;
    this.kind = options["kind"] || null;
    this.resolve = options["resolve"] || function() {
      return true;
    };
    this.construct = options["construct"] || function(data) {
      return data;
    };
    this.instanceOf = options["instanceOf"] || null;
    this.predicate = options["predicate"] || null;
    this.represent = options["represent"] || null;
    this.representName = options["representName"] || null;
    this.defaultStyle = options["defaultStyle"] || null;
    this.multi = options["multi"] || false;
    this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
      throw new YAMLException2('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
    }
  }
  type = Type2;
  return type;
}
var schema;
var hasRequiredSchema;
function requireSchema() {
  if (hasRequiredSchema)
    return schema;
  hasRequiredSchema = 1;
  const YAMLException2 = requireException();
  const Type2 = requireType();
  function compileList(schema2, name) {
    const result = [];
    schema2[name].forEach(function(currentType) {
      let newIndex = result.length;
      result.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
          newIndex = previousIndex;
        }
      });
      result[newIndex] = currentType;
    });
    return result;
  }
  function compileMap() {
    const result = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    };
    function collectType(type2) {
      if (type2.multi) {
        result.multi[type2.kind].push(type2);
        result.multi["fallback"].push(type2);
      } else {
        result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
      }
    }
    for (let index = 0, length = arguments.length;index < length; index += 1) {
      arguments[index].forEach(collectType);
    }
    return result;
  }
  function Schema2(definition) {
    return this.extend(definition);
  }
  Schema2.prototype.extend = function extend(definition) {
    let implicit = [];
    let explicit = [];
    if (definition instanceof Type2) {
      explicit.push(definition);
    } else if (Array.isArray(definition)) {
      explicit = explicit.concat(definition);
    } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit)
        implicit = implicit.concat(definition.implicit);
      if (definition.explicit)
        explicit = explicit.concat(definition.explicit);
    } else {
      throw new YAMLException2("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    }
    implicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
      if (type2.loadKind && type2.loadKind !== "scalar") {
        throw new YAMLException2("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      }
      if (type2.multi) {
        throw new YAMLException2("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
      }
    });
    explicit.forEach(function(type2) {
      if (!(type2 instanceof Type2)) {
        throw new YAMLException2("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
    });
    const result = Object.create(Schema2.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  schema = Schema2;
  return schema;
}
var str;
var hasRequiredStr;
function requireStr() {
  if (hasRequiredStr)
    return str;
  hasRequiredStr = 1;
  const Type2 = requireType();
  str = new Type2("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
  return str;
}
var seq;
var hasRequiredSeq;
function requireSeq() {
  if (hasRequiredSeq)
    return seq;
  hasRequiredSeq = 1;
  const Type2 = requireType();
  seq = new Type2("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
  return seq;
}
var map;
var hasRequiredMap;
function requireMap() {
  if (hasRequiredMap)
    return map;
  hasRequiredMap = 1;
  const Type2 = requireType();
  map = new Type2("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
  return map;
}
var failsafe;
var hasRequiredFailsafe;
function requireFailsafe() {
  if (hasRequiredFailsafe)
    return failsafe;
  hasRequiredFailsafe = 1;
  const Schema2 = requireSchema();
  failsafe = new Schema2({
    explicit: [
      requireStr(),
      requireSeq(),
      requireMap()
    ]
  });
  return failsafe;
}
var _null;
var hasRequired_null;
function require_null() {
  if (hasRequired_null)
    return _null;
  hasRequired_null = 1;
  const Type2 = requireType();
  function resolveYamlNull(data) {
    if (data === null)
      return true;
    const max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  _null = new Type2("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  });
  return _null;
}
var bool;
var hasRequiredBool;
function requireBool() {
  if (hasRequiredBool)
    return bool;
  hasRequiredBool = 1;
  const Type2 = requireType();
  function resolveYamlBoolean(data) {
    if (data === null)
      return false;
    const max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  bool = new Type2("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object) {
        return object ? "true" : "false";
      },
      uppercase: function(object) {
        return object ? "TRUE" : "FALSE";
      },
      camelcase: function(object) {
        return object ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  });
  return bool;
}
var int;
var hasRequiredInt;
function requireInt() {
  if (hasRequiredInt)
    return int;
  hasRequiredInt = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  function isHexCode(c) {
    return c >= 48 && c <= 57 || c >= 65 && c <= 70 || c >= 97 && c <= 102;
  }
  function isOctCode(c) {
    return c >= 48 && c <= 55;
  }
  function isDecCode(c) {
    return c >= 48 && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null)
      return false;
    const max = data.length;
    let index = 0;
    let hasDigits = false;
    if (!max)
      return false;
    let ch = data[index];
    if (ch === "-" || ch === "+") {
      ch = data[++index];
    }
    if (ch === "0") {
      if (index + 1 === max)
        return true;
      ch = data[++index];
      if (ch === "b") {
        index++;
        for (;index < max; index++) {
          ch = data[index];
          if (ch !== "0" && ch !== "1")
            return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "x") {
        index++;
        for (;index < max; index++) {
          if (!isHexCode(data.charCodeAt(index)))
            return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
      if (ch === "o") {
        index++;
        for (;index < max; index++) {
          if (!isOctCode(data.charCodeAt(index)))
            return false;
          hasDigits = true;
        }
        return hasDigits && isFinite(parseYamlInteger(data));
      }
    }
    for (;index < max; index++) {
      if (!isDecCode(data.charCodeAt(index))) {
        return false;
      }
      hasDigits = true;
    }
    if (!hasDigits)
      return false;
    return isFinite(parseYamlInteger(data));
  }
  function parseYamlInteger(data) {
    let value = data;
    let sign = 1;
    let ch = value[0];
    if (ch === "-" || ch === "+") {
      if (ch === "-")
        sign = -1;
      value = value.slice(1);
      ch = value[0];
    }
    if (value === "0")
      return 0;
    if (ch === "0") {
      if (value[1] === "b")
        return sign * parseInt(value.slice(2), 2);
      if (value[1] === "x")
        return sign * parseInt(value.slice(2), 16);
      if (value[1] === "o")
        return sign * parseInt(value.slice(2), 8);
    }
    return sign * parseInt(value, 10);
  }
  function constructYamlInteger(data) {
    return parseYamlInteger(data);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common2.isNegativeZero(object));
  }
  int = new Type2("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
      binary: function(obj) {
        return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
      },
      octal: function(obj) {
        return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
      },
      decimal: function(obj) {
        return obj.toString(10);
      },
      hexadecimal: function(obj) {
        return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  });
  return int;
}
var float;
var hasRequiredFloat;
function requireFloat() {
  if (hasRequiredFloat)
    return float;
  hasRequiredFloat = 1;
  const common2 = requireCommon();
  const Type2 = requireType();
  const YAML_FLOAT_PATTERN = new RegExp("^(?:[-+]?(?:[0-9]+)(?:\\.[0-9]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
  const YAML_FLOAT_SPECIAL_PATTERN = new RegExp("^(?:[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
  function resolveYamlFloat(data) {
    if (data === null)
      return false;
    if (!YAML_FLOAT_PATTERN.test(data)) {
      return false;
    }
    if (isFinite(parseFloat(data, 10))) {
      return true;
    }
    return YAML_FLOAT_SPECIAL_PATTERN.test(data);
  }
  function constructYamlFloat(data) {
    let value = data.toLowerCase();
    const sign = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) {
      value = value.slice(1);
    }
    if (value === ".inf") {
      return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    } else if (value === ".nan") {
      return NaN;
    }
    return sign * parseFloat(value, 10);
  }
  const SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    if (isNaN(object)) {
      switch (style) {
        case "lowercase":
          return ".nan";
        case "uppercase":
          return ".NAN";
        case "camelcase":
          return ".NaN";
      }
    } else if (Number.POSITIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return ".inf";
        case "uppercase":
          return ".INF";
        case "camelcase":
          return ".Inf";
      }
    } else if (Number.NEGATIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return "-.inf";
        case "uppercase":
          return "-.INF";
        case "camelcase":
          return "-.Inf";
      }
    } else if (common2.isNegativeZero(object)) {
      return "-0.0";
    }
    const res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common2.isNegativeZero(object));
  }
  float = new Type2("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
  return float;
}
var json;
var hasRequiredJson;
function requireJson() {
  if (hasRequiredJson)
    return json;
  hasRequiredJson = 1;
  json = requireFailsafe().extend({
    implicit: [
      require_null(),
      requireBool(),
      requireInt(),
      requireFloat()
    ]
  });
  return json;
}
var core;
var hasRequiredCore;
function requireCore() {
  if (hasRequiredCore)
    return core;
  hasRequiredCore = 1;
  core = requireJson();
  return core;
}
var timestamp;
var hasRequiredTimestamp;
function requireTimestamp() {
  if (hasRequiredTimestamp)
    return timestamp;
  hasRequiredTimestamp = 1;
  const Type2 = requireType();
  const YAML_DATE_REGEXP = new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$");
  const YAML_TIMESTAMP_REGEXP = new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
  function resolveYamlTimestamp(data) {
    if (data === null)
      return false;
    if (YAML_DATE_REGEXP.exec(data) !== null)
      return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null)
      return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    let fraction = 0;
    let delta = null;
    let match = YAML_DATE_REGEXP.exec(data);
    if (match === null)
      match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null)
      throw new Error("Date resolve error");
    const year = +match[1];
    const month = +match[2] - 1;
    const day = +match[3];
    if (!match[4]) {
      return new Date(Date.UTC(year, month, day));
    }
    const hour = +match[4];
    const minute = +match[5];
    const second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) {
        fraction += "0";
      }
      fraction = +fraction;
    }
    if (match[9]) {
      const tzHour = +match[10];
      const tzMinute = +(match[11] || 0);
      delta = (tzHour * 60 + tzMinute) * 60000;
      if (match[9] === "-")
        delta = -delta;
    }
    const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta)
      date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  timestamp = new Type2("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
  return timestamp;
}
var merge;
var hasRequiredMerge;
function requireMerge() {
  if (hasRequiredMerge)
    return merge;
  hasRequiredMerge = 1;
  const Type2 = requireType();
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  merge = new Type2("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
  return merge;
}
var binary;
var hasRequiredBinary;
function requireBinary() {
  if (hasRequiredBinary)
    return binary;
  hasRequiredBinary = 1;
  const Type2 = requireType();
  const BASE64_MAP = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=
\r`;
  function resolveYamlBinary(data) {
    if (data === null)
      return false;
    let bitlen = 0;
    const max = data.length;
    const map2 = BASE64_MAP;
    for (let idx = 0;idx < max; idx++) {
      const code = map2.indexOf(data.charAt(idx));
      if (code > 64)
        continue;
      if (code < 0)
        return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    const input = data.replace(/[\r\n=]/g, "");
    const max = input.length;
    const map2 = BASE64_MAP;
    let bits = 0;
    const result = [];
    for (let idx = 0;idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map2.indexOf(input.charAt(idx));
    }
    const tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    } else if (tailbits === 18) {
      result.push(bits >> 10 & 255);
      result.push(bits >> 2 & 255);
    } else if (tailbits === 12) {
      result.push(bits >> 4 & 255);
    }
    return new Uint8Array(result);
  }
  function representYamlBinary(object) {
    let result = "";
    let bits = 0;
    const max = object.length;
    const map2 = BASE64_MAP;
    for (let idx = 0;idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map2[bits >> 18 & 63];
        result += map2[bits >> 12 & 63];
        result += map2[bits >> 6 & 63];
        result += map2[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    const tail = max % 3;
    if (tail === 0) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    } else if (tail === 2) {
      result += map2[bits >> 10 & 63];
      result += map2[bits >> 4 & 63];
      result += map2[bits << 2 & 63];
      result += map2[64];
    } else if (tail === 1) {
      result += map2[bits >> 2 & 63];
      result += map2[bits << 4 & 63];
      result += map2[64];
      result += map2[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  binary = new Type2("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
  return binary;
}
var omap;
var hasRequiredOmap;
function requireOmap() {
  if (hasRequiredOmap)
    return omap;
  hasRequiredOmap = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const _toString = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null)
      return true;
    const objectKeys = {};
    const object = data;
    for (let index = 0, length = object.length;index < length; index += 1) {
      const pair = object[index];
      let pairHasKey = false;
      if (_toString.call(pair) !== "[object Object]")
        return false;
      let pairKey;
      for (pairKey in pair) {
        if (_hasOwnProperty.call(pair, pairKey)) {
          if (!pairHasKey)
            pairHasKey = true;
          else
            return false;
        }
      }
      if (!pairHasKey)
        return false;
      if (_hasOwnProperty.call(objectKeys, pairKey))
        return false;
      Object.defineProperty(objectKeys, pairKey, { value: true });
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  omap = new Type2("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
  return omap;
}
var pairs;
var hasRequiredPairs;
function requirePairs() {
  if (hasRequiredPairs)
    return pairs;
  hasRequiredPairs = 1;
  const Type2 = requireType();
  const _toString = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null)
      return true;
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length;index < length; index += 1) {
      const pair = object[index];
      if (_toString.call(pair) !== "[object Object]")
        return false;
      const keys = Object.keys(pair);
      if (keys.length !== 1)
        return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null)
      return [];
    const object = data;
    const result = new Array(object.length);
    for (let index = 0, length = object.length;index < length; index += 1) {
      const pair = object[index];
      const keys = Object.keys(pair);
      result[index] = [keys[0], pair[keys[0]]];
    }
    return result;
  }
  pairs = new Type2("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
  return pairs;
}
var set;
var hasRequiredSet;
function requireSet() {
  if (hasRequiredSet)
    return set;
  hasRequiredSet = 1;
  const Type2 = requireType();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null)
      return true;
    const object = data;
    for (const key in object) {
      if (_hasOwnProperty.call(object, key)) {
        if (object[key] !== null)
          return false;
      }
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  set = new Type2("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
  return set;
}
var _default;
var hasRequired_default;
function require_default() {
  if (hasRequired_default)
    return _default;
  hasRequired_default = 1;
  _default = requireCore().extend({
    implicit: [
      requireTimestamp(),
      requireMerge()
    ],
    explicit: [
      requireBinary(),
      requireOmap(),
      requirePairs(),
      requireSet()
    ]
  });
  return _default;
}
var hasRequiredLoader;
function requireLoader() {
  if (hasRequiredLoader)
    return loader;
  hasRequiredLoader = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const makeSnippet = requireSnippet();
  const DEFAULT_SCHEMA2 = require_default();
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CONTEXT_FLOW_IN = 1;
  const CONTEXT_FLOW_OUT = 2;
  const CONTEXT_BLOCK_IN = 3;
  const CONTEXT_BLOCK_OUT = 4;
  const CHOMPING_CLIP = 1;
  const CHOMPING_STRIP = 2;
  const CHOMPING_KEEP = 3;
  const PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  const PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  const PATTERN_FLOW_INDICATORS = /[,\[\]{}]/;
  const PATTERN_TAG_HANDLE = /^(?:!|!!|![0-9A-Za-z-]+!)$/;
  const PATTERN_TAG_URI = /^(?:!|[^,\[\]{}])(?:%[0-9a-f]{2}|[0-9a-z\-#;/?:@&=+$,_.!~*'()\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function isEol(c) {
    return c === 10 || c === 13;
  }
  function isWhiteSpace(c) {
    return c === 9 || c === 32;
  }
  function isWsOrEol(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function isFlowIndicator(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    const lc = c | 32;
    if (lc >= 97 && lc <= 102) {
      return lc - 97 + 10;
    }
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) {
      return 2;
    }
    if (c === 117) {
      return 4;
    }
    if (c === 85) {
      return 8;
    }
    return 0;
  }
  function fromDecimalCode(c) {
    if (c >= 48 && c <= 57) {
      return c - 48;
    }
    return -1;
  }
  function simpleEscapeSequence(c) {
    switch (c) {
      case 48:
        return "\x00";
      case 97:
        return "\x07";
      case 98:
        return "\b";
      case 116:
        return "\t";
      case 9:
        return "\t";
      case 110:
        return `
`;
      case 118:
        return "\v";
      case 102:
        return "\f";
      case 114:
        return "\r";
      case 101:
        return "\x1B";
      case 32:
        return " ";
      case 34:
        return '"';
      case 47:
        return "/";
      case 92:
        return "\\";
      case 78:
        return "";
      case 95:
        return " ";
      case 76:
        return "\u2028";
      case 80:
        return "\u2029";
      default:
        return "";
    }
  }
  function charFromCodepoint(c) {
    if (c <= 65535) {
      return String.fromCharCode(c);
    }
    return String.fromCharCode((c - 65536 >> 10) + 55296, (c - 65536 & 1023) + 56320);
  }
  function setProperty(object, key, value) {
    if (key === "__proto__") {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value
      });
    } else {
      object[key] = value;
    }
  }
  const simpleEscapeCheck = new Array(256);
  const simpleEscapeMap = new Array(256);
  for (let i = 0;i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  function State(input, options) {
    this.input = input;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.maxDepth = typeof options["maxDepth"] === "number" ? options["maxDepth"] : 100;
    this.maxTotalMergeKeys = typeof options["maxTotalMergeKeys"] === "number" ? options["maxTotalMergeKeys"] : 1e4;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.depth = 0;
    this.totalMergeKeys = 0;
    this.firstTabInLine = -1;
    this.documents = [];
    this.anchorMapTransactions = [];
  }
  function generateError(state, message) {
    const mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = makeSnippet(mark);
    return new YAMLException2(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) {
      state.onWarning.call(null, generateError(state, message));
    }
  }
  function storeAnchor(state, name, value) {
    const transactions = state.anchorMapTransactions;
    if (transactions.length !== 0) {
      const transaction = transactions[transactions.length - 1];
      if (!_hasOwnProperty.call(transaction, name)) {
        transaction[name] = {
          existed: _hasOwnProperty.call(state.anchorMap, name),
          value: state.anchorMap[name]
        };
      }
    }
    state.anchorMap[name] = value;
  }
  function beginAnchorTransaction(state) {
    state.anchorMapTransactions.push(/* @__PURE__ */ Object.create(null));
  }
  function commitAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const transactions = state.anchorMapTransactions;
    if (transactions.length === 0)
      return;
    const parent = transactions[transactions.length - 1];
    const names = Object.keys(transaction);
    for (let index = 0, length = names.length;index < length; index += 1) {
      const name = names[index];
      if (!_hasOwnProperty.call(parent, name)) {
        parent[name] = transaction[name];
      }
    }
  }
  function rollbackAnchorTransaction(state) {
    const transaction = state.anchorMapTransactions.pop();
    const names = Object.keys(transaction);
    for (let index = names.length - 1;index >= 0; index -= 1) {
      const entry = transaction[names[index]];
      if (entry.existed) {
        state.anchorMap[names[index]] = entry.value;
      } else {
        delete state.anchorMap[names[index]];
      }
    }
  }
  function snapshotState(state) {
    return {
      position: state.position,
      line: state.line,
      lineStart: state.lineStart,
      lineIndent: state.lineIndent,
      firstTabInLine: state.firstTabInLine,
      tag: state.tag,
      anchor: state.anchor,
      kind: state.kind,
      result: state.result
    };
  }
  function restoreState(state, snapshot) {
    state.position = snapshot.position;
    state.line = snapshot.line;
    state.lineStart = snapshot.lineStart;
    state.lineIndent = snapshot.lineIndent;
    state.firstTabInLine = snapshot.firstTabInLine;
    state.tag = snapshot.tag;
    state.anchor = snapshot.anchor;
    state.kind = snapshot.kind;
    state.result = snapshot.result;
  }
  const directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      if (state.version !== null) {
        throwError(state, "duplication of %YAML directive");
      }
      if (args.length !== 1) {
        throwError(state, "YAML directive accepts exactly one argument");
      }
      const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) {
        throwError(state, "ill-formed argument of the YAML directive");
      }
      const major = parseInt(match[1], 10);
      const minor = parseInt(match[2], 10);
      if (major !== 1) {
        throwError(state, "unacceptable YAML version of the document");
      }
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) {
        throwWarning(state, "unsupported YAML version of the document");
      }
    },
    TAG: function handleTagDirective(state, name, args) {
      let prefix;
      if (args.length !== 2) {
        throwError(state, "TAG directive accepts exactly two arguments");
      }
      const handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) {
        throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      }
      if (_hasOwnProperty.call(state.tagMap, handle)) {
        throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      }
      if (!PATTERN_TAG_URI.test(prefix)) {
        throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      }
      try {
        prefix = decodeURIComponent(prefix);
      } catch (err) {
        throwError(state, "tag prefix is malformed: " + prefix);
      }
      state.tagMap[handle] = prefix;
    }
  };
  function captureSegment(state, start, end, checkJson) {
    if (start < end) {
      const _result = state.input.slice(start, end);
      if (checkJson) {
        for (let _position = 0, _length = _result.length;_position < _length; _position += 1) {
          const _character = _result.charCodeAt(_position);
          if (!(_character === 9 || _character >= 32 && _character <= 1114111)) {
            throwError(state, "expected valid JSON character");
          }
        }
      } else if (PATTERN_NON_PRINTABLE.test(_result)) {
        throwError(state, "the stream contains non-printable characters");
      }
      state.result += _result;
    }
  }
  function chargeMergeWork(state) {
    state.totalMergeKeys++;
    if (state.maxTotalMergeKeys !== -1 && state.totalMergeKeys > state.maxTotalMergeKeys) {
      throwError(state, "merge keys exceeded maxTotalMergeKeys (" + state.maxTotalMergeKeys + ")");
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    if (!common2.isObject(source)) {
      throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    chargeMergeWork(state);
    const sourceKeys = Object.keys(source);
    for (let index = 0, quantity = sourceKeys.length;index < quantity; index += 1) {
      const key = sourceKeys[index];
      chargeMergeWork(state);
      if (!_hasOwnProperty.call(destination, key)) {
        setProperty(destination, key, source[key]);
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (let index = 0, quantity = keyNode.length;index < quantity; index += 1) {
        if (Array.isArray(keyNode[index])) {
          throwError(state, "nested arrays are not supported inside keys");
        }
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
          keyNode[index] = "[object Object]";
        }
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
      keyNode = "[object Object]";
    }
    keyNode = String(keyNode);
    if (_result === null) {
      _result = {};
    }
    if (keyTag === "tag:yaml.org,2002:merge") {
      if (Array.isArray(valueNode)) {
        if (valueNode.length > 100) {
          throwError(state, "abnormal merge sequence size");
        }
        for (let index = 0, quantity = valueNode.length;index < quantity; index += 1) {
          mergeMappings(state, _result, valueNode[index], overridableKeys);
        }
      } else {
        mergeMappings(state, _result, valueNode, overridableKeys);
      }
    } else {
      if (!state.json && !_hasOwnProperty.call(overridableKeys, keyNode) && _hasOwnProperty.call(_result, keyNode)) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        throwError(state, "duplicated mapping key");
      }
      setProperty(_result, keyNode, valueNode);
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    const ch = state.input.charCodeAt(state.position);
    if (ch === 10) {
      state.position++;
    } else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) {
        state.position++;
      }
    } else {
      throwError(state, "a line break is expected");
    }
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) {
          state.firstTabInLine = state.position;
        }
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 10 && ch !== 13 && ch !== 0);
      }
      if (isEol(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else {
        break;
      }
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
      throwWarning(state, "deficient indentation");
    }
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    let _position = state.position;
    let ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || isWsOrEol(ch)) {
        return true;
      }
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) {
      state.result += " ";
    } else if (count > 1) {
      state.result += common2.repeat(`
`, count - 1);
    }
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    let captureStart;
    let captureEnd;
    let hasPendingContent;
    let _line;
    let _lineStart;
    let _lineIndent;
    const _kind = state.kind;
    const _result = state.result;
    let ch = state.input.charCodeAt(state.position);
    if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
      return false;
    }
    if (ch === 63 || ch === 45) {
      const following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
        return false;
      }
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
          break;
        }
      } else if (ch === 35) {
        const preceding = state.input.charCodeAt(state.position - 1);
        if (isWsOrEol(preceding)) {
          break;
        }
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) {
        break;
      } else if (isEol(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        skipSeparationSpace(state, false, -1);
        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        captureSegment(state, captureStart, captureEnd, false);
        writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }
      if (!isWhiteSpace(ch)) {
        captureEnd = state.position + 1;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) {
      return true;
    }
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 39) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 39) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (ch === 39) {
          captureStart = state.position;
          state.position++;
          captureEnd = state.position;
        } else {
          return true;
        }
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a single quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    let captureStart;
    let captureEnd;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 34) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 34) {
        captureSegment(state, captureStart, state.position, true);
        state.position++;
        return true;
      } else if (ch === 92) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (isEol(ch)) {
          skipSeparationSpace(state, false, nodeIndent);
        } else if (ch < 256 && simpleEscapeCheck[ch]) {
          state.result += simpleEscapeMap[ch];
          state.position++;
        } else if ((tmp = escapedHexLen(ch)) > 0) {
          let hexLength = tmp;
          let hexResult = 0;
          for (;hexLength > 0; hexLength--) {
            ch = state.input.charCodeAt(++state.position);
            if ((tmp = fromHexCode(ch)) >= 0) {
              hexResult = (hexResult << 4) + tmp;
            } else {
              throwError(state, "expected hexadecimal character");
            }
          }
          state.result += charFromCodepoint(hexResult);
          state.position++;
        } else {
          throwError(state, "unknown escape sequence");
        }
        captureStart = captureEnd = state.position;
      } else if (isEol(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a double quoted scalar");
      } else {
        state.position++;
        if (!isWhiteSpace(ch)) {
          captureEnd = state.position;
        }
      }
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    let readNext = true;
    let _line;
    let _lineStart;
    let _pos;
    const _tag = state.tag;
    let _result;
    const _anchor = state.anchor;
    let terminator;
    let isPair;
    let isExplicitPair;
    let isMapping;
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyNode;
    let keyTag;
    let valueNode;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 91) {
      terminator = 93;
      isMapping = false;
      _result = [];
    } else if (ch === 123) {
      terminator = 125;
      isMapping = true;
      _result = {};
    } else {
      return false;
    }
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    ch = state.input.charCodeAt(++state.position);
    while (ch !== 0) {
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else if (!readNext) {
        throwError(state, "missed comma between flow collection entries");
      } else if (ch === 44) {
        throwError(state, "expected the node content, but found ','");
      }
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        const following = state.input.charCodeAt(state.position + 1);
        if (isWsOrEol(following)) {
          isPair = isExplicitPair = true;
          state.position++;
          skipSeparationSpace(state, true, nodeIndent);
        }
      }
      _line = state.line;
      _lineStart = state.lineStart;
      _pos = state.position;
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if ((isExplicitPair || state.line === _line) && ch === 58) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        skipSeparationSpace(state, true, nodeIndent);
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        valueNode = state.result;
      }
      if (isMapping) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      } else if (isPair) {
        _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      } else {
        _result.push(keyNode);
      }
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else {
        readNext = false;
      }
    }
    throwError(state, "unexpected end of the stream within a flow collection");
  }
  function readBlockScalar(state, nodeIndent) {
    let folding;
    let chomping = CHOMPING_CLIP;
    let didReadContent = false;
    let detectedIndent = false;
    let textIndent = nodeIndent;
    let emptyLines = 0;
    let atMoreIndented = false;
    let tmp;
    let ch = state.input.charCodeAt(state.position);
    if (ch === 124) {
      folding = false;
    } else if (ch === 62) {
      folding = true;
    } else {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) {
        if (CHOMPING_CLIP === chomping) {
          chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
        } else {
          throwError(state, "repeat of a chomping mode identifier");
        }
      } else if ((tmp = fromDecimalCode(ch)) >= 0) {
        if (tmp === 0) {
          throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
        } else if (!detectedIndent) {
          textIndent = nodeIndent + tmp - 1;
          detectedIndent = true;
        } else {
          throwError(state, "repeat of an indentation width identifier");
        }
      } else {
        break;
      }
    }
    if (isWhiteSpace(ch)) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (isWhiteSpace(ch));
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (!isEol(ch) && ch !== 0);
      }
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) {
        textIndent = state.lineIndent;
      }
      if (isEol(ch)) {
        emptyLines++;
        continue;
      }
      if (!detectedIndent && textIndent === 0) {
        throwError(state, "missing indentation for block scalar");
      }
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) {
          state.result += common2.repeat(`
`, didReadContent ? 1 + emptyLines : emptyLines);
        } else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) {
            state.result += `
`;
          }
        }
        break;
      }
      if (folding) {
        if (isWhiteSpace(ch)) {
          atMoreIndented = true;
          state.result += common2.repeat(`
`, didReadContent ? 1 + emptyLines : emptyLines);
        } else if (atMoreIndented) {
          atMoreIndented = false;
          state.result += common2.repeat(`
`, emptyLines + 1);
        } else if (emptyLines === 0) {
          if (didReadContent) {
            state.result += " ";
          }
        } else {
          state.result += common2.repeat(`
`, emptyLines);
        }
      } else {
        state.result += common2.repeat(`
`, didReadContent ? 1 + emptyLines : emptyLines);
      }
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = state.position;
      while (!isEol(ch) && ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
      }
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = [];
    let detected = false;
    if (state.firstTabInLine !== -1)
      return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) {
        break;
      }
      const following = state.input.charCodeAt(state.position + 1);
      if (!isWsOrEol(following)) {
        break;
      }
      detected = true;
      state.position++;
      if (skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }
      const _line = state.line;
      composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
      _result.push(state.result);
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a sequence entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }
  function readBlockMapping(state, nodeIndent, flowIndent) {
    let allowCompact;
    let _keyLine;
    let _keyLineStart;
    let _keyPos;
    const _tag = state.tag;
    const _anchor = state.anchor;
    const _result = {};
    const overridableKeys = /* @__PURE__ */ Object.create(null);
    let keyTag = null;
    let keyNode = null;
    let valueNode = null;
    let atExplicitKey = false;
    let detected = false;
    if (state.firstTabInLine !== -1)
      return false;
    if (state.anchor !== null) {
      storeAnchor(state, state.anchor, _result);
    }
    let ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      const following = state.input.charCodeAt(state.position + 1);
      const _line = state.line;
      if ((ch === 63 || ch === 58) && isWsOrEol(following)) {
        if (ch === 63) {
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else {
          throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        }
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
          break;
        }
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (isWhiteSpace(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!isWsOrEol(ch)) {
              throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            }
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) {
            throwError(state, "can not read an implicit mapping pair; a colon is missed");
          } else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) {
          throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      }
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
          if (atExplicitKey) {
            keyNode = state.result;
          } else {
            valueNode = state.result;
          }
        }
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a mapping entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (atExplicitKey) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }
    return detected;
  }
  function readTagProperty(state) {
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle;
    let tagName;
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 33)
      return false;
    if (state.tag !== null) {
      throwError(state, "duplication of a tag property");
    }
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else {
      tagHandle = "!";
    }
    let _position = state.position;
    if (isVerbatim) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else {
        throwError(state, "unexpected end of the stream within a verbatim tag");
      }
    } else {
      while (ch !== 0 && !isWsOrEol(ch)) {
        if (ch === 33) {
          if (!isNamed) {
            tagHandle = state.input.slice(_position - 1, state.position + 1);
            if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
              throwError(state, "named tag handle cannot contain such characters");
            }
            isNamed = true;
            _position = state.position + 1;
          } else {
            throwError(state, "tag suffix cannot contain exclamation marks");
          }
        }
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) {
        throwError(state, "tag suffix cannot contain flow indicator characters");
      }
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) {
      throwError(state, "tag name cannot contain such characters: " + tagName);
    }
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) {
      state.tag = tagName;
    } else if (_hasOwnProperty.call(state.tagMap, tagHandle)) {
      state.tag = state.tagMap[tagHandle] + tagName;
    } else if (tagHandle === "!") {
      state.tag = "!" + tagName;
    } else if (tagHandle === "!!") {
      state.tag = "tag:yaml.org,2002:" + tagName;
    } else {
      throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    }
    return true;
  }
  function readAnchorProperty(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 38)
      return false;
    if (state.anchor !== null) {
      throwError(state, "duplication of an anchor property");
    }
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an anchor node must contain at least one character");
    }
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    let ch = state.input.charCodeAt(state.position);
    if (ch !== 42)
      return false;
    ch = state.input.charCodeAt(++state.position);
    const _position = state.position;
    while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an alias node must contain at least one character");
    }
    const alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty.call(state.anchorMap, alias)) {
      throwError(state, 'unidentified alias "' + alias + '"');
    }
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function tryReadBlockMappingFromProperty(state, propertyStart, nodeIndent, flowIndent) {
    const fallbackState = snapshotState(state);
    beginAnchorTransaction(state);
    restoreState(state, propertyStart);
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    if (readBlockMapping(state, nodeIndent, flowIndent) && state.kind === "mapping") {
      commitAnchorTransaction(state);
      return true;
    }
    rollbackAnchorTransaction(state);
    restoreState(state, fallbackState);
    return false;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    let allowBlockScalars;
    let allowBlockCollections;
    let indentStatus = 1;
    let atNewLine = false;
    let hasContent = false;
    let propertyStart = null;
    let type2;
    let flowIndent;
    let blockIndent;
    if (state.depth >= state.maxDepth) {
      throwError(state, "nesting exceeded maxDepth (" + state.maxDepth + ")");
    }
    state.depth += 1;
    if (state.listener !== null) {
      state.listener("open", state);
    }
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      }
    }
    if (indentStatus === 1) {
      while (true) {
        const ch = state.input.charCodeAt(state.position);
        const propertyState = snapshotState(state);
        if (atNewLine && (ch === 33 && state.tag !== null || ch === 38 && state.anchor !== null)) {
          break;
        }
        if (!readTagProperty(state) && !readAnchorProperty(state)) {
          break;
        }
        if (propertyStart === null) {
          propertyStart = propertyState;
        }
        if (skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          allowBlockCollections = allowBlockStyles;
          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        } else {
          allowBlockCollections = false;
        }
      }
    }
    if (allowBlockCollections) {
      allowBlockCollections = atNewLine || allowCompact;
    }
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
        flowIndent = parentIndent;
      } else {
        flowIndent = parentIndent + 1;
      }
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) {
        if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
          hasContent = true;
        } else {
          const ch = state.input.charCodeAt(state.position);
          if (propertyStart !== null && allowBlockStyles && !allowBlockCollections && ch !== 124 && ch !== 62 && tryReadBlockMappingFromProperty(state, propertyStart, propertyStart.position - propertyStart.lineStart, flowIndent)) {
            hasContent = true;
          } else if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
            hasContent = true;
          } else if (readAlias(state)) {
            hasContent = true;
            if (state.tag !== null || state.anchor !== null) {
              throwError(state, "alias node should not have any properties");
            }
          } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
            hasContent = true;
            if (state.tag === null) {
              state.tag = "?";
            }
          }
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
        }
      } else if (indentStatus === 0) {
        hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
      }
    }
    if (state.tag === null) {
      if (state.anchor !== null) {
        storeAnchor(state, state.anchor, state.result);
      }
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") {
        throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      }
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length;typeIndex < typeQuantity; typeIndex += 1) {
        type2 = state.implicitTypes[typeIndex];
        if (type2.resolve(state.result)) {
          state.result = type2.construct(state.result);
          state.tag = type2.tag;
          if (state.anchor !== null) {
            storeAnchor(state, state.anchor, state.result);
          }
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty.call(state.typeMap[state.kind || "fallback"], state.tag)) {
        type2 = state.typeMap[state.kind || "fallback"][state.tag];
      } else {
        type2 = null;
        const typeList = state.typeMap.multi[state.kind || "fallback"];
        for (let typeIndex = 0, typeQuantity = typeList.length;typeIndex < typeQuantity; typeIndex += 1) {
          if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
            type2 = typeList[typeIndex];
            break;
          }
        }
      }
      if (!type2) {
        throwError(state, "unknown tag !<" + state.tag + ">");
      }
      if (state.result !== null && type2.kind !== state.kind) {
        throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
      }
      if (!type2.resolve(state.result, state.tag)) {
        throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      } else {
        state.result = type2.construct(state.result, state.tag);
        if (state.anchor !== null) {
          storeAnchor(state, state.anchor, state.result);
        }
      }
    }
    if (state.listener !== null) {
      state.listener("close", state);
    }
    state.depth -= 1;
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    const documentStart = state.position;
    let hasDirectives = false;
    let ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = /* @__PURE__ */ Object.create(null);
    state.anchorMap = /* @__PURE__ */ Object.create(null);
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if (state.lineIndent > 0 || ch !== 37) {
        break;
      }
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      let _position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      const directiveName = state.input.slice(_position, state.position);
      const directiveArgs = [];
      if (directiveName.length < 1) {
        throwError(state, "directive name must not be less than one character in length");
      }
      while (ch !== 0) {
        while (isWhiteSpace(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 0 && !isEol(ch));
          break;
        }
        if (isEol(ch))
          break;
        _position = state.position;
        while (ch !== 0 && !isWsOrEol(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0)
        readLineBreak(state);
      if (_hasOwnProperty.call(directiveHandlers, directiveName)) {
        directiveHandlers[directiveName](state, directiveName, directiveArgs);
      } else {
        throwWarning(state, 'unknown document directive "' + directiveName + '"');
      }
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) {
      throwError(state, "directives end mark is expected");
    }
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
      throwWarning(state, "non-ASCII line breaks are interpreted as content");
    }
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) {
      throwError(state, "end of the stream or a document separator is expected");
    }
  }
  function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
      if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
        input += `
`;
      }
      if (input.charCodeAt(0) === 65279) {
        input = input.slice(1);
      }
    }
    const state = new State(input, options);
    const nullpos = input.indexOf("\x00");
    if (nullpos !== -1) {
      state.position = nullpos;
      throwError(state, "null byte is not allowed in input");
    }
    state.input += "\x00";
    while (state.input.charCodeAt(state.position) === 32) {
      state.lineIndent += 1;
      state.position += 1;
    }
    while (state.position < state.length - 1) {
      readDocument(state);
    }
    return state.documents;
  }
  function loadAll2(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    const documents = loadDocuments(input, options);
    if (typeof iterator !== "function") {
      return documents;
    }
    for (let index = 0, length = documents.length;index < length; index += 1) {
      iterator(documents[index]);
    }
  }
  function load2(input, options) {
    const documents = loadDocuments(input, options);
    if (documents.length === 0) {
      return;
    } else if (documents.length === 1) {
      return documents[0];
    }
    throw new YAMLException2("expected a single document in the stream, but found more");
  }
  loader.loadAll = loadAll2;
  loader.load = load2;
  return loader;
}
var dumper = {};
var hasRequiredDumper;
function requireDumper() {
  if (hasRequiredDumper)
    return dumper;
  hasRequiredDumper = 1;
  const common2 = requireCommon();
  const YAMLException2 = requireException();
  const DEFAULT_SCHEMA2 = require_default();
  const _toString = Object.prototype.toString;
  const _hasOwnProperty = Object.prototype.hasOwnProperty;
  const CHAR_BOM = 65279;
  const CHAR_TAB = 9;
  const CHAR_LINE_FEED = 10;
  const CHAR_CARRIAGE_RETURN = 13;
  const CHAR_SPACE = 32;
  const CHAR_EXCLAMATION = 33;
  const CHAR_DOUBLE_QUOTE = 34;
  const CHAR_SHARP = 35;
  const CHAR_PERCENT = 37;
  const CHAR_AMPERSAND = 38;
  const CHAR_SINGLE_QUOTE = 39;
  const CHAR_ASTERISK = 42;
  const CHAR_COMMA = 44;
  const CHAR_MINUS = 45;
  const CHAR_COLON = 58;
  const CHAR_EQUALS = 61;
  const CHAR_GREATER_THAN = 62;
  const CHAR_QUESTION = 63;
  const CHAR_COMMERCIAL_AT = 64;
  const CHAR_LEFT_SQUARE_BRACKET = 91;
  const CHAR_RIGHT_SQUARE_BRACKET = 93;
  const CHAR_GRAVE_ACCENT = 96;
  const CHAR_LEFT_CURLY_BRACKET = 123;
  const CHAR_VERTICAL_LINE = 124;
  const CHAR_RIGHT_CURLY_BRACKET = 125;
  const ESCAPE_SEQUENCES = {};
  ESCAPE_SEQUENCES[0] = "\\0";
  ESCAPE_SEQUENCES[7] = "\\a";
  ESCAPE_SEQUENCES[8] = "\\b";
  ESCAPE_SEQUENCES[9] = "\\t";
  ESCAPE_SEQUENCES[10] = "\\n";
  ESCAPE_SEQUENCES[11] = "\\v";
  ESCAPE_SEQUENCES[12] = "\\f";
  ESCAPE_SEQUENCES[13] = "\\r";
  ESCAPE_SEQUENCES[27] = "\\e";
  ESCAPE_SEQUENCES[34] = "\\\"";
  ESCAPE_SEQUENCES[92] = "\\\\";
  ESCAPE_SEQUENCES[133] = "\\N";
  ESCAPE_SEQUENCES[160] = "\\_";
  ESCAPE_SEQUENCES[8232] = "\\L";
  ESCAPE_SEQUENCES[8233] = "\\P";
  const DEPRECATED_BOOLEANS_SYNTAX = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ];
  const DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema2, map2) {
    if (map2 === null)
      return {};
    const result = {};
    const keys = Object.keys(map2);
    for (let index = 0, length = keys.length;index < length; index += 1) {
      let tag = keys[index];
      let style = String(map2[tag]);
      if (tag.slice(0, 2) === "!!") {
        tag = "tag:yaml.org,2002:" + tag.slice(2);
      }
      const type2 = schema2.compiledTypeMap["fallback"][tag];
      if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
        style = type2.styleAliases[style];
      }
      result[tag] = style;
    }
    return result;
  }
  function encodeHex(character) {
    let handle;
    let length;
    const string = character.toString(16).toUpperCase();
    if (character <= 255) {
      handle = "x";
      length = 2;
    } else if (character <= 65535) {
      handle = "u";
      length = 4;
    } else if (character <= 4294967295) {
      handle = "U";
      length = 8;
    } else {
      throw new YAMLException2("code point within a string may not be greater than 0xFFFFFFFF");
    }
    return "\\" + handle + common2.repeat("0", length - string.length) + string;
  }
  const QUOTING_TYPE_SINGLE = 1;
  const QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || DEFAULT_SCHEMA2;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common2.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
    this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
    this.sortKeys = options["sortKeys"] || false;
    this.lineWidth = options["lineWidth"] || 80;
    this.noRefs = options["noRefs"] || false;
    this.noCompatMode = options["noCompatMode"] || false;
    this.condenseFlow = options["condenseFlow"] || false;
    this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
    this.forceQuotes = options["forceQuotes"] || false;
    this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = "";
    this.duplicates = [];
    this.usedDuplicates = null;
  }
  function indentString(string, spaces) {
    const ind = common2.repeat(" ", spaces);
    let position = 0;
    let result = "";
    const length = string.length;
    while (position < length) {
      let line;
      const next = string.indexOf(`
`, position);
      if (next === -1) {
        line = string.slice(position);
        position = length;
      } else {
        line = string.slice(position, next + 1);
        position = next + 1;
      }
      if (line.length && line !== `
`)
        result += ind;
      result += line;
    }
    return result;
  }
  function generateNextLine(state, level) {
    return `
` + common2.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str2) {
    for (let index = 0, length = state.implicitTypes.length;index < length; index += 1) {
      const type2 = state.implicitTypes[index];
      if (type2.resolve(str2)) {
        return true;
      }
    }
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return c >= 32 && c <= 126 || c >= 161 && c <= 55295 && c !== 8232 && c !== 8233 || c >= 57344 && c <= 65533 && c !== CHAR_BOM || c >= 65536 && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    const cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    const cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (inblock ? cIsNsCharOrWhitespace : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar;
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    const first = string.charCodeAt(pos);
    let second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) {
        return (first - 55296) * 1024 + second - 56320 + 65536;
      }
    }
    return first;
  }
  function needIndentIndicator(string) {
    const leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string);
  }
  const STYLE_PLAIN = 1;
  const STYLE_SINGLE = 2;
  const STYLE_LITERAL = 3;
  const STYLE_FOLDED = 4;
  const STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    let i;
    let char = 0;
    let prevChar = null;
    let hasLineBreak = false;
    let hasFoldableLine = false;
    const shouldTrackWidth = lineWidth !== -1;
    let previousLineBreak = -1;
    let plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) {
      for (i = 0;i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
    } else {
      for (i = 0;i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) {
        return STYLE_PLAIN;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) {
      return STYLE_DOUBLE;
    }
    if (!forceQuotes) {
      return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = function() {
      if (string.length === 0) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      }
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
        }
      }
      const indent = state.indent * Math.max(1, level);
      const lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
      const singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(string, singleLineOnly, state.indent, lineWidth, testAmbiguity, state.quotingType, state.forceQuotes && !iskey, inblock)) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
        case STYLE_DOUBLE:
          return '"' + escapeString(string) + '"';
        default:
          throw new YAMLException2("impossible error: invalid scalar style");
      }
    }();
  }
  function blockHeader(string, indentPerLevel) {
    const indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    const clip = string[string.length - 1] === `
`;
    const keep = clip && (string[string.length - 2] === `
` || string === `
`);
    const chomp = keep ? "+" : clip ? "" : "-";
    return indentIndicator + chomp + `
`;
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === `
` ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    const lineRe = /(\n+)([^\n]*)/g;
    let result = function() {
      let nextLF = string.indexOf(`
`);
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    }();
    let prevMoreIndented = string[0] === `
` || string[0] === " ";
    let moreIndented;
    let match;
    while (match = lineRe.exec(string)) {
      const prefix = match[1];
      const line = match[2];
      moreIndented = line[0] === " ";
      result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? `
` : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ")
      return line;
    const breakRe = / [^ ]/g;
    let match;
    let start = 0;
    let end;
    let curr = 0;
    let next = 0;
    let result = "";
    while (match = breakRe.exec(line)) {
      next = match.index;
      if (next - start > width) {
        end = curr > start ? curr : next;
        result += `
` + line.slice(start, end);
        start = end + 1;
      }
      curr = next;
    }
    result += `
`;
    if (line.length - start > width && curr > start) {
      result += line.slice(start, curr) + `
` + line.slice(curr + 1);
    } else {
      result += line.slice(start);
    }
    return result.slice(1);
  }
  function escapeString(string) {
    let result = "";
    let char = 0;
    for (let i = 0;i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      const escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result += string[i];
        if (char >= 65536)
          result += string[i + 1];
      } else {
        result += escapeSeq || encodeHex(char);
      }
    }
    return result;
  }
  function writeFlowSequence(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length;index < length; index += 1) {
      let value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "")
          _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    for (let index = 0, length = object.length;index < length; index += 1) {
      let value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") {
          _result += generateNextLine(state, level);
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          _result += "-";
        } else {
          _result += "- ";
        }
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = _result || "[]";
  }
  function writeFlowMapping(state, level, object) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    for (let index = 0, length = objectKeyList.length;index < length; index += 1) {
      let pairBuffer = "";
      if (_result !== "")
        pairBuffer += ", ";
      if (state.condenseFlow)
        pairBuffer += '"';
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level, objectKey, false, false)) {
        continue;
      }
      if (state.dump.length > 1024)
        pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) {
        continue;
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = "{" + _result + "}";
  }
  function writeBlockMapping(state, level, object, compact) {
    let _result = "";
    const _tag = state.tag;
    const objectKeyList = Object.keys(object);
    if (state.sortKeys === true) {
      objectKeyList.sort();
    } else if (typeof state.sortKeys === "function") {
      objectKeyList.sort(state.sortKeys);
    } else if (state.sortKeys) {
      throw new YAMLException2("sortKeys must be a boolean or a function");
    }
    for (let index = 0, length = objectKeyList.length;index < length; index += 1) {
      let pairBuffer = "";
      if (!compact || _result !== "") {
        pairBuffer += generateNextLine(state, level);
      }
      const objectKey = objectKeyList[index];
      let objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level + 1, objectKey, true, true, true)) {
        continue;
      }
      const explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) {
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          pairBuffer += "?";
        } else {
          pairBuffer += "? ";
        }
      }
      pairBuffer += state.dump;
      if (explicitPair) {
        pairBuffer += generateNextLine(state, level);
      }
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
        continue;
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += ":";
      } else {
        pairBuffer += ": ";
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    const typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (let index = 0, length = typeList.length;index < length; index += 1) {
      const type2 = typeList[index];
      if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
        if (explicit) {
          if (type2.multi && type2.representName) {
            state.tag = type2.representName(object);
          } else {
            state.tag = type2.tag;
          }
        } else {
          state.tag = "?";
        }
        if (type2.represent) {
          const style = state.styleMap[type2.tag] || type2.defaultStyle;
          let _result;
          if (_toString.call(type2.represent) === "[object Function]") {
            _result = type2.represent(object, style);
          } else if (_hasOwnProperty.call(type2.represent, style)) {
            _result = type2.represent[style](object, style);
          } else {
            throw new YAMLException2("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
          }
          state.dump = _result;
        }
        return true;
      }
    }
    return false;
  }
  function writeNode(state, level, object, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) {
      detectType(state, object, true);
    }
    const type2 = _toString.call(state.dump);
    const inblock = block;
    if (block) {
      block = state.flowLevel < 0 || state.flowLevel > level;
    }
    const objectOrArray = type2 === "[object Object]" || type2 === "[object Array]";
    let duplicateIndex;
    let duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
      compact = false;
    }
    if (duplicate && state.usedDuplicates[duplicateIndex]) {
      state.dump = "*ref_" + duplicateIndex;
    } else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
        state.usedDuplicates[duplicateIndex] = true;
      }
      if (type2 === "[object Object]") {
        if (block && Object.keys(state.dump).length !== 0) {
          writeBlockMapping(state, level, state.dump, compact);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowMapping(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object Array]") {
        if (block && state.dump.length !== 0) {
          if (state.noArrayIndent && !isblockseq && level > 0) {
            writeBlockSequence(state, level - 1, state.dump, compact);
          } else {
            writeBlockSequence(state, level, state.dump, compact);
          }
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowSequence(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object String]") {
        if (state.tag !== "?") {
          writeScalar(state, state.dump, level, iskey, inblock);
        }
      } else if (type2 === "[object Undefined]") {
        return false;
      } else {
        if (state.skipInvalid)
          return false;
        throw new YAMLException2("unacceptable kind of an object to dump " + type2);
      }
      if (state.tag !== null && state.tag !== "?") {
        let tagStr = encodeURI(state.tag[0] === "!" ? state.tag.slice(1) : state.tag).replace(/!/g, "%21");
        if (state.tag[0] === "!") {
          tagStr = "!" + tagStr;
        } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
          tagStr = "!!" + tagStr.slice(18);
        } else {
          tagStr = "!<" + tagStr + ">";
        }
        state.dump = tagStr + " " + state.dump;
      }
    }
    return true;
  }
  function getDuplicateReferences(object, state) {
    const objects = [];
    const duplicatesIndexes = [];
    inspectNode(object, objects, duplicatesIndexes);
    const length = duplicatesIndexes.length;
    for (let index = 0;index < length; index += 1) {
      state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    if (object !== null && typeof object === "object") {
      const index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) {
          duplicatesIndexes.push(index);
        }
      } else {
        objects.push(object);
        if (Array.isArray(object)) {
          for (let i = 0, length = object.length;i < length; i += 1) {
            inspectNode(object[i], objects, duplicatesIndexes);
          }
        } else {
          const objectKeyList = Object.keys(object);
          for (let i = 0, length = objectKeyList.length;i < length; i += 1) {
            inspectNode(object[objectKeyList[i]], objects, duplicatesIndexes);
          }
        }
      }
    }
  }
  function dump2(input, options) {
    options = options || {};
    const state = new State(options);
    if (!state.noRefs)
      getDuplicateReferences(input, state);
    let value = input;
    if (state.replacer) {
      value = state.replacer.call({ "": value }, "", value);
    }
    if (writeNode(state, 0, value, true, true))
      return state.dump + `
`;
    return "";
  }
  dumper.dump = dump2;
  return dumper;
}
var hasRequiredJsYaml;
function requireJsYaml() {
  if (hasRequiredJsYaml)
    return jsYaml;
  hasRequiredJsYaml = 1;
  const loader2 = requireLoader();
  const dumper2 = requireDumper();
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  jsYaml.Type = requireType();
  jsYaml.Schema = requireSchema();
  jsYaml.FAILSAFE_SCHEMA = requireFailsafe();
  jsYaml.JSON_SCHEMA = requireJson();
  jsYaml.CORE_SCHEMA = requireCore();
  jsYaml.DEFAULT_SCHEMA = require_default();
  jsYaml.load = loader2.load;
  jsYaml.loadAll = loader2.loadAll;
  jsYaml.dump = dumper2.dump;
  jsYaml.YAMLException = requireException();
  jsYaml.types = {
    binary: requireBinary(),
    float: requireFloat(),
    map: requireMap(),
    null: require_null(),
    pairs: requirePairs(),
    set: requireSet(),
    timestamp: requireTimestamp(),
    bool: requireBool(),
    int: requireInt(),
    merge: requireMerge(),
    omap: requireOmap(),
    seq: requireSeq(),
    str: requireStr()
  };
  jsYaml.safeLoad = renamed("safeLoad", "load");
  jsYaml.safeLoadAll = renamed("safeLoadAll", "loadAll");
  jsYaml.safeDump = renamed("safeDump", "dump");
  return jsYaml;
}
var jsYamlExports = requireJsYaml();
var yaml = /* @__PURE__ */ getDefaultExportFromCjs(jsYamlExports);
var {
  Type,
  Schema,
  FAILSAFE_SCHEMA,
  JSON_SCHEMA,
  CORE_SCHEMA,
  DEFAULT_SCHEMA,
  load,
  loadAll,
  dump,
  YAMLException,
  types,
  safeLoad,
  safeLoadAll,
  safeDump
} = yaml;

// src/engine/loader.ts
var ENTRY_RE = /^\s*(?:\[[^\]]*\]\s*)?warp[-_ ]?ruleset\b/i;
var BOOK_RE = /^\s*warp[-_ ]?ruleset\b/i;
function isRulesetEntryTitle(comment) {
  return !!comment && ENTRY_RE.test(comment);
}
function isRulesetBookName(name) {
  return !!name && BOOK_RE.test(name);
}
function stripFences(s) {
  const m = /^\s*```[a-z]*\s*\n([\s\S]*?)\n?```\s*$/i.exec(s);
  return m ? m[1] : s;
}
var isObj2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function deepMerge(a, b) {
  if (Array.isArray(a) && Array.isArray(b))
    return [...a, ...b];
  if (isObj2(a) && isObj2(b)) {
    const out = { ...a };
    for (const [k, v] of Object.entries(b))
      out[k] = k in out ? deepMerge(out[k], v) : v;
    return out;
  }
  return b === undefined ? a : b;
}
function loadRuleset(parts) {
  const issues = [];
  let merged = {};
  const sorted = [...parts].sort((x, y) => x.order - y.order || x.label.localeCompare(y.label));
  for (const p of sorted) {
    const text = stripFences(p.content ?? "");
    if (!text.trim())
      continue;
    try {
      const doc = yaml.load(text, { schema: yaml.CORE_SCHEMA });
      if (doc === null || doc === undefined)
        continue;
      if (!isObj2(doc)) {
        issues.push({ level: "error", where: p.label, message: "should be YAML key/value pairs (like `stats:`), not a list or plain text" });
        continue;
      }
      merged = deepMerge(merged, doc);
    } catch (e) {
      const err = e;
      const where = err.mark ? `${p.label}, line ${err.mark.line + 1}` : p.label;
      issues.push({ level: "error", where, message: `YAML couldn't be read: ${err.reason ?? err.message ?? "syntax error"}. This entry was skipped.` });
    }
  }
  if (!parts.length)
    return { ruleset: null, issues };
  const { ruleset, issues: more } = normalizeRuleset(merged);
  return { ruleset, issues: [...issues, ...more] };
}

// src/engine/lint.ts
function distance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1;j <= b.length; j++)
    dp[0][j] = j;
  for (let i = 1;i <= a.length; i++)
    for (let j = 1;j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
function suggest(name, pool) {
  let best = "";
  let bestD = Infinity;
  for (const p of pool) {
    const d = distance(name.toLowerCase(), p.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best && bestD <= Math.max(2, Math.floor(name.length / 3)) ? ` — did you mean "${best}"?` : "";
}
function lintRuleset(r) {
  const issues = [];
  const s = initialState(r);
  const names = [
    ...r.statOrder,
    ...Object.keys(r.flags),
    "minutes",
    "hour",
    "minute",
    "day",
    "weekday",
    "turn",
    "location"
  ];
  const check = (src, where, extra = {}) => {
    if (src === undefined || typeof src === "number")
      return;
    const base = makeEnv(r, s, extra);
    const env = { lookup: base.lookup, call: (n, a) => n === "roll" ? 1 : base.call?.(n, a) };
    const unknown = new Set;
    try {
      evaluate(src, env, { unknown });
    } catch {
      return;
    }
    for (const u of unknown) {
      const isCall = u.endsWith("()");
      const msg = isCall ? `"${u}" isn't a known function (has, count, flag, cond, at, rel, met, between, roll, min, max, clamp, floor, ceil, round, abs)` : `"${u}" isn't a stat, flag or clock value${suggest(u, [...names, ...Object.keys(extra)])}`;
      issues.push({ level: "warning", where, message: msg });
    }
  };
  const checkEffect = (e, where, extra = {}) => {
    for (const [id, v] of Object.entries(e.stats)) {
      if (!r.stats[id])
        issues.push({ level: "warning", where, message: `changes "${id}", which isn't a stat${suggest(id, r.statOrder)}` });
      check(v, `${where} › ${id}`, extra);
    }
    for (const [id, v] of Object.entries(e.set)) {
      if (!r.stats[id])
        issues.push({ level: "warning", where, message: `sets "${id}", which isn't a stat${suggest(id, r.statOrder)}` });
      check(v, `${where} › set › ${id}`, extra);
    }
    for (const [who, m] of Object.entries(e.rel))
      for (const [stat, v] of Object.entries(m)) {
        if (!r.relStats[stat])
          issues.push({ level: "warning", where, message: `"${stat}" isn't a relationship stat${suggest(stat, r.relStatOrder)}` });
        check(v, `${where} › ${who} › ${stat}`, extra);
      }
    for (const id of Object.keys(e.addConditions)) {
      if (!r.conditions[id])
        issues.push({ level: "warning", where, message: `adds condition "${id}", which isn't declared under conditions:` });
    }
    for (const d of e.decide)
      for (const o of d.options)
        checkEffect(o.effect, `${where} › decide › ${d.id} › ${o.id}`, extra);
    if (e.move && Object.keys(r.locations).length && !r.locations[e.move]) {
      issues.push({ level: "warning", where, message: `moves to "${e.move}", which isn't a declared location${suggest(e.move, Object.keys(r.locations))}` });
    }
  };
  for (const id of r.statOrder)
    check(r.stats[id].maxExpr, `Stats › ${id} › max`);
  for (const a of Object.values(r.actions)) {
    const w = `Actions › ${a.id}`;
    const extra = Object.fromEntries(a.params.map((p) => [p.id, p.options[p.default]]));
    check(a.when, `${w} › when`, extra);
    if (a.check) {
      check(a.check.target, `${w} › check`, extra);
      check(a.check.add, `${w} › check › add`, extra);
    }
    checkEffect(a.cost, `${w} › cost`, extra);
    checkEffect(a.effects, `${w} › effects`, extra);
    for (const [tier, e] of Object.entries(a.outcomes))
      if (e)
        checkEffect(e, `${w} › ${tier}`, extra);
  }
  for (const t of r.triggers) {
    check(t.when, `Triggers › ${t.id} › when`);
    checkEffect(t.effects, `Triggers › ${t.id}`);
  }
  for (const id of r.hud.bars)
    if (!r.stats[id])
      issues.push({ level: "warning", where: "HUD › bars", message: `"${id}" isn't a stat` });
  return issues;
}

// src/backend/source.ts
var TTL_MS = 8000;
var byCharacter = new Map;
var chatCharacter = new Map;
var knownRulesetEntryIds = new Set;
var knownRulesetBookIds = new Set;
async function listAllEntries(bookId, userId) {
  const out = [];
  for (let offset = 0;offset < 5000; offset += 200) {
    const page = await host().world_books.entries.list(bookId, { limit: 200, offset, userId });
    out.push(...page.data);
    if (out.length >= page.total || page.data.length === 0)
      break;
  }
  return out;
}
async function characterForChat(chatId, userId) {
  if (chatCharacter.has(chatId))
    return chatCharacter.get(chatId);
  const chat = await host().chats.get(chatId, userId);
  const id = chat?.character_id || null;
  chatCharacter.set(chatId, id);
  return id;
}
async function loadForCharacter(characterId, userId) {
  const character = await host().characters.get(characterId, userId);
  const base = {
    characterId,
    characterName: character?.name ?? null,
    ruleset: null,
    issues: [],
    source: null,
    entryIds: [],
    bookIds: [],
    at: Date.now()
  };
  if (!character)
    return base;
  const parts = [];
  const books = [];
  for (const bookId of character.world_book_ids ?? []) {
    const book = await host().world_books.get(bookId, userId);
    if (!book)
      continue;
    const wholeBook = isRulesetBookName(book.name);
    const entries = await listAllEntries(bookId, userId);
    let found = 0;
    for (const e of entries) {
      if (!wholeBook && !isRulesetEntryTitle(e.comment))
        continue;
      parts.push({ label: e.comment?.trim() || `${book.name} entry`, content: e.content, order: e.order_value ?? 100 });
      base.entryIds.push(e.id);
      knownRulesetEntryIds.add(e.id);
      found++;
    }
    if (wholeBook)
      knownRulesetBookIds.add(bookId);
    if (found)
      books.push(`${book.name} (${found} ${found === 1 ? "entry" : "entries"})`);
    if (found)
      base.bookIds.push(bookId);
  }
  if (!parts.length)
    return base;
  const { ruleset, issues } = loadRuleset(parts);
  base.ruleset = ruleset;
  base.issues = ruleset ? [...issues, ...lintRuleset(ruleset)] : issues;
  base.source = books.join(", ");
  return base;
}
async function getRuleset(chatId, userId, force = false) {
  if (!chatId)
    return null;
  let characterId;
  try {
    characterId = await characterForChat(chatId, userId);
  } catch (e) {
    logError("characterForChat", e);
    return null;
  }
  if (!characterId)
    return null;
  const hit = byCharacter.get(characterId);
  if (hit && !force && Date.now() - hit.at < TTL_MS)
    return hit;
  try {
    const loaded = await loadForCharacter(characterId, userId);
    byCharacter.set(characterId, loaded);
    return loaded;
  } catch (e) {
    logError("loadForCharacter", e);
    return hit ?? null;
  }
}
function invalidateCharacter(characterId) {
  if (characterId)
    byCharacter.delete(characterId);
  else
    byCharacter.clear();
}
function statusOf(l) {
  if (!l || !l.source) {
    return { state: "none", name: null, source: null, issues: l?.issues ?? [], characterName: l?.characterName ?? null, tags: [] };
  }
  const tags = new Set;
  for (const a of Object.values(l.ruleset?.actions ?? {}))
    for (const t of a.tags)
      tags.add(t);
  return {
    state: l.ruleset ? "ok" : "broken",
    name: l.ruleset?.name ?? null,
    source: l.source,
    issues: l.issues,
    characterName: l.characterName,
    tags: [...tags].sort()
  };
}
async function installTemplate(chatId, templateId, userId) {
  const t = getTemplate(templateId);
  if (!t)
    throw new Error("Unknown template");
  const characterId = await characterForChat(chatId, userId);
  if (!characterId)
    throw new Error("This chat has no character to attach a ruleset to");
  const character = await host().characters.get(characterId, userId);
  if (!character)
    throw new Error("Character not found");
  const book = await host().world_books.create({
    name: "warp-ruleset",
    description: `Warp game rules for ${character.name} (${t.name}). Warp reads these entries directly; they are never sent to the model.`,
    metadata: { warp: { template: t.id } }
  }, userId);
  let order = 10;
  for (const part of t.parts) {
    let content = part.yaml;
    if (part.label === "people" && /relationships:/.test(content) && character.name) {
      const id = character.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "companion";
      content += `  people:
    ${id}:
      name: ${JSON.stringify(character.name)}
`;
    }
    await host().world_books.entries.create(book.id, {
      comment: `warp-ruleset · ${part.label}`,
      content,
      key: [],
      disabled: true,
      constant: false,
      order_value: order
    }, userId);
    order += 10;
  }
  const ids = [...character.world_book_ids ?? [], book.id];
  await host().characters.update(characterId, { world_book_ids: ids }, userId);
  invalidateCharacter(characterId);
  knownRulesetBookIds.add(book.id);
  return t.name;
}

// src/engine/view.ts
function pct(v, min, max) {
  return max > min ? Math.max(0, Math.min(1, (v - min) / (max - min))) : 0;
}
function toneFromPct(p, good) {
  if (good === "none")
    return "neutral";
  const g = good === "high" ? p : 1 - p;
  return g >= 0.67 ? "good" : g >= 0.34 ? "warn" : "bad";
}
function statDisplay(def, v, max, currency) {
  if (def.kind === "money")
    return `${currency}${formatNumber(v)}`;
  if (def.kind === "meter" && max !== 100)
    return `${formatNumber(v)} / ${formatNumber(max)}`;
  return formatNumber(v);
}
function buildHud(r, s) {
  const bars = r.hud.bars.map((id) => {
    const def = r.stats[id];
    const v = s.stats[id] ?? def.start;
    const max = statMax(r, def, s);
    const band = bandFor(def, v);
    const p = pct(v, def.min, max);
    return {
      id,
      label: def.label,
      value: v,
      min: def.min,
      max,
      display: statDisplay(def, v, max, r.hud.currency),
      pct: p,
      text: band?.text ?? null,
      tone: band?.tone ?? toneFromPct(p, def.good),
      good: def.good,
      color: def.color,
      desc: def.desc
    };
  });
  const skills = r.statOrder.filter((id) => (r.stats[id].kind === "attribute" || r.stats[id].kind === "skill") && !r.hud.bars.includes(id)).map((id) => {
    const def = r.stats[id];
    const v = s.stats[id] ?? def.start;
    const max = statMax(r, def, s);
    const band = bandFor(def, v);
    return {
      id,
      label: def.label,
      display: formatNumber(v),
      grade: gradeFor(def, v, max),
      pct: pct(v, def.min, max),
      kind: def.kind,
      text: band?.text ?? null,
      tone: band?.tone ?? "neutral"
    };
  });
  const people = Object.entries(s.people).map(([id, p]) => ({
    id,
    name: p.name,
    stats: r.relStatOrder.map((rs) => {
      const def = r.relStats[rs];
      const v = s.rel[id]?.[rs] ?? def.start;
      const band = bandFor(def, v);
      const pp = pct(v, def.min, def.max);
      return { id: rs, label: def.label, display: formatNumber(v), pct: pp, text: band?.text ?? null, tone: band?.tone ?? toneFromPct(pp, def.good) };
    })
  }));
  const items = Object.entries(s.items).map(([id, count]) => ({ id, name: itemName(r, s, id), count }));
  const conditions = Object.entries(s.conditions).map(([id, c]) => {
    const def = r.conditions[id];
    const left = c.until !== null ? c.until - s.minutes : null;
    return {
      id,
      label: def?.label ?? id,
      tone: def?.tone ?? "warn",
      desc: def?.desc,
      remaining: left !== null && left > 0 ? left >= 60 ? `${Math.round(left / 60)}h` : `${left}m` : undefined
    };
  });
  const money = r.hud.money ? statDisplay(r.stats[r.hud.money], s.stats[r.hud.money] ?? 0, 0, r.hud.currency) : null;
  const loc = s.location ? r.locations[s.location] : undefined;
  return {
    rulesetName: r.name,
    clock: r.clock.enabled ? formatClock(r, s.minutes) : null,
    location: s.locationName ? { name: s.locationName, desc: loc?.desc } : null,
    money,
    bars: bars.filter((b) => r.stats[b.id].kind !== "money"),
    skills,
    people,
    items,
    conditions,
    turn: s.turn
  };
}
function buildChoices(r, s, opts) {
  const veils = new Set(opts.veils.map((v) => v.toLowerCase()));
  const travel = travelTargets(r, s).map((id) => ({
    id: `${TRAVEL_PREFIX}${id}`,
    label: `Go to ${r.locations[id].name}`,
    group: "Travel",
    desc: r.locations[id].desc ?? null,
    odds: null,
    partialOdds: null,
    checkLabel: null,
    veiled: false,
    params: []
  }));
  const actions = availableActions(r, s, opts.lines).filter((a) => !a.hidden).map((a) => {
    const o = odds(r, s, a);
    return {
      id: a.id,
      label: a.label,
      group: a.group ?? null,
      desc: a.desc ?? null,
      odds: o ? o.success : null,
      partialOdds: o && o.partial > 0 ? o.partial : null,
      checkLabel: a.check?.label ?? null,
      veiled: a.tags.some((t) => veils.has(t)),
      params: a.params.map((p) => ({ id: p.id, label: p.label, options: Object.keys(p.options), default: p.default }))
    };
  });
  return [...actions, ...travel];
}
function signed(n) {
  const f = formatNumber(n);
  return n > 0 ? `+${f}` : f;
}
function summarizeEvents(r, before, after, events) {
  const out = [];
  const statAgg = new Map;
  const relAgg = new Map;
  const itemAgg = new Map;
  const timeAgg = { min: 0, idx: [], narrIdx: [] };
  events.forEach((e, i) => {
    if (e.src === "drift")
      return;
    switch (e.t) {
      case "stat": {
        const key = `${e.id}|${e.src === "narrator" ? "n" : "e"}`;
        const a = statAgg.get(key) ?? { d: 0, idx: [], src: e.src, set: false };
        a.d += e.d ?? 0;
        if (e.set !== undefined)
          a.set = true;
        a.idx.push(i);
        statAgg.set(key, a);
        break;
      }
      case "rel": {
        const key = `${e.who}|${e.stat}|${e.src === "narrator" ? "n" : "e"}`;
        const a = relAgg.get(key) ?? { d: 0, idx: [], src: e.src };
        a.d += e.d ?? 0;
        a.idx.push(i);
        relAgg.set(key, a);
        break;
      }
      case "item": {
        const key = `${e.id}|${e.src === "narrator" ? "n" : "e"}`;
        const a = itemAgg.get(key) ?? { d: 0, idx: [], src: e.src };
        a.d += e.d;
        a.idx.push(i);
        itemAgg.set(key, a);
        break;
      }
      case "move":
        out.push({ text: `→ ${after.locationName ?? e.to}`, tone: "neutral", src: e.src, undo: [i] });
        break;
      case "time":
        timeAgg.min += e.min;
        timeAgg.idx.push(i);
        if (e.src === "narrator")
          timeAgg.narrIdx.push(i);
        break;
      case "cond": {
        const label = r.conditions[e.id]?.label ?? e.id;
        if (e.note === "expired")
          break;
        out.push({ text: e.on ? `${label}` : `${label} ended`, tone: e.on ? r.conditions[e.id]?.tone ?? "warn" : "good", src: e.src, undo: [i] });
        break;
      }
      case "person":
        out.push({ text: `Met ${e.name}`, tone: "neutral", src: e.src, undo: [i] });
        break;
    }
  });
  if (timeAgg.min >= 1) {
    const m = timeAgg.min;
    out.unshift({ text: m >= 60 ? `⏱ +${formatNumber(m / 60)}h` : `⏱ +${Math.round(m)}m`, tone: "neutral", src: timeAgg.narrIdx.length === timeAgg.idx.length ? "narrator" : "action" });
  }
  for (const [key, a] of statAgg) {
    const id = key.split("|")[0];
    const def = r.stats[id];
    if (!def || def.kind === "hidden")
      continue;
    const d = a.set ? (after.stats[id] ?? 0) - (before.stats[id] ?? 0) : a.d;
    if (Math.abs(d) < 0.05)
      continue;
    const bBefore = bandFor(def, before.stats[id] ?? def.start);
    const bAfter = bandFor(def, after.stats[id] ?? def.start);
    const good = def.good === "none" ? null : d > 0 === (def.good === "high");
    out.push({
      text: def.kind === "money" ? `${d > 0 ? "+" : "−"}${r.hud.currency}${formatNumber(Math.abs(d))}` : `${def.label} ${signed(d)}`,
      tone: good === null ? "neutral" : good ? "good" : "bad",
      src: a.src,
      band: bAfter && bBefore !== bAfter ? bAfter.text : undefined,
      undo: a.idx
    });
  }
  for (const [key, a] of relAgg) {
    const [who, stat] = key.split("|");
    const def = r.relStats[stat];
    if (!def || Math.abs(a.d) < 0.05)
      continue;
    const good = def.good === "none" ? null : a.d > 0 === (def.good === "high");
    out.push({ text: `${personName(r, after, who)} · ${def.label} ${signed(a.d)}`, tone: good === null ? "neutral" : good ? "good" : "bad", src: a.src, undo: a.idx });
  }
  for (const [key, a] of itemAgg) {
    const id = key.split("|")[0];
    if (a.d === 0)
      continue;
    const name = itemName(r, after.items[id] ? after : before, id);
    out.push({ text: `${a.d > 0 ? "+" : "−"} ${name}${Math.abs(a.d) > 1 ? ` ×${Math.abs(a.d)}` : ""}`, tone: "neutral", src: a.src, undo: a.idx });
  }
  return out;
}
function checkSummary(c) {
  const addTxt = c.add ? ` ${c.add > 0 ? "+" : "−"} ${Math.abs(c.add)}` : "";
  switch (c.style) {
    case "chance":
      return `${c.dice}: ${c.roll}${addTxt}${c.add ? ` = ${c.total}` : ""}, needed ${c.target} or less`;
    case "vs":
      return `${c.dice}: ${c.roll}${addTxt} = ${c.total} vs ${c.target}`;
    case "pbta":
      return `${c.dice}: ${c.roll}${addTxt} = ${c.total} (10+ hit, 7–9 mixed)`;
  }
}
function buildRecordView(r, messageId, swipe, rec, before, after) {
  return {
    messageId,
    swipe,
    action: rec.action?.label ?? null,
    via: rec.action?.via ?? null,
    check: rec.check ? {
      label: rec.check.label,
      dice: rec.check.dice,
      faces: rec.check.faces,
      roll: rec.check.roll,
      add: rec.check.add,
      total: rec.check.total,
      target: rec.check.target,
      style: rec.check.style,
      tier: rec.check.tier,
      tierLabel: TIER_LABEL[rec.check.tier],
      summary: checkSummary(rec.check)
    } : null,
    changes: summarizeEvents(r, before, after, rec.events),
    hints: rec.hints,
    veiled: !!rec.veiled,
    confidence: rec.confidence ?? null,
    decisions: (rec.decisions ?? []).map((d) => {
      const spec = findDecide(r, d.id);
      return {
        ask: d.ask,
        picked: d.pickedDesc,
        p: d.p[d.picked] ?? 0,
        source: d.source,
        odds: Object.entries(d.p).map(([k, p]) => ({ desc: spec?.options.find((o) => o.id === k)?.desc ?? k, p })).sort((a, b) => b.p - a.p)
      };
    }),
    contradiction: rec.contradiction ?? null,
    redoFrom: null
  };
}
function findDecide(r, id) {
  const effects = [
    ...Object.values(r.actions).flatMap((a) => [a.cost, a.effects, ...Object.values(a.outcomes)]),
    ...r.triggers.map((t) => t.effects)
  ];
  const stack = [...effects];
  while (stack.length) {
    const e = stack.pop();
    if (!e)
      continue;
    for (const d of e.decide) {
      if (d.id === id)
        return d;
      stack.push(...d.options.map((o) => o.effect));
    }
  }
  return;
}
function statLine(r, def, s, forceNumbers) {
  if (def.show === "hidden")
    return null;
  const v = s.stats[def.id] ?? def.start;
  const max = statMax(r, def, s);
  const band = bandFor(def, v);
  const grade = gradeFor(def, v, max);
  const num = def.kind === "money" ? `${r.hud.currency}${formatNumber(v)}` : grade ? `${grade}` : `${formatNumber(v)}/${formatNumber(max)}`;
  const showNum = forceNumbers || def.show === "number" || def.show === "both" || !band;
  const showText = (def.show === "text" || def.show === "both") && band;
  if (showText && showNum)
    return `${def.label}: ${band.text} (${num})`;
  if (showText)
    return `${def.label}: ${band.text}`;
  return `${def.label}: ${num}`;
}
function stateDigest(r, s) {
  const lines = [];
  const head = [];
  if (r.clock.enabled) {
    const c = formatClock(r, s.minutes);
    head.push(`${c.day}, ${c.time} (${c.phase})`);
  }
  if (s.locationName)
    head.push(`Location: ${s.locationName}`);
  if (head.length)
    lines.push(head.join(" · "));
  const meters = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "meter" || d.kind === "money");
  const other = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "attribute" || d.kind === "skill");
  const ml = meters.map((d) => statLine(r, d, s, r.narration.numbers)).filter(Boolean);
  if (ml.length)
    lines.push(ml.join(" · "));
  const ol = other.map((d) => statLine(r, d, s, r.narration.numbers)).filter(Boolean);
  if (ol.length)
    lines.push(`Abilities: ${ol.join(" · ")}`);
  const conds = Object.keys(s.conditions).map((id) => r.conditions[id]?.label ?? id);
  if (conds.length)
    lines.push(`Conditions: ${conds.join(", ")}`);
  const inv = Object.entries(s.items).map(([id, n]) => `${itemName(r, s, id)}${n > 1 ? ` ×${n}` : ""}`);
  if (inv.length)
    lines.push(`Carrying: ${inv.join(", ")}`);
  const ppl = Object.entries(s.people).map(([id, p]) => {
    const parts = r.relStatOrder.map((rs) => {
      const def = r.relStats[rs];
      if (def.show === "hidden")
        return null;
      const v = s.rel[id]?.[rs] ?? def.start;
      const band = bandFor(def, v);
      return band && def.show !== "number" ? `${def.label} ${band.text}` : `${def.label} ${formatNumber(v)}`;
    }).filter(Boolean);
    return parts.length ? `${p.name} (${parts.join(", ")})` : p.name;
  });
  if (ppl.length)
    lines.push(`Relationships: ${ppl.join("; ")}`);
  return lines.join(`
`);
}
function outcomePacket(r, rec, before, after, playerName) {
  const lines = [];
  if (rec.action)
    lines.push(`${playerName} chose: ${rec.action.label}`);
  if (rec.check)
    lines.push(`Check: ${rec.check.label} — ${checkSummary(rec.check)} → ${TIER_LABEL[rec.check.tier].toUpperCase()}`);
  const changes = summarizeEvents(r, before, after, rec.events).map((c) => c.band ? `${c.text} (${c.band})` : c.text);
  if (changes.length)
    lines.push(`Already applied: ${changes.join(" · ")}`);
  for (const h of rec.hints)
    lines.push(`Direction: ${h}`);
  if (rec.veiled)
    lines.push("Handle this beat off-screen: fade to black and describe only the aftermath and consequences.");
  if (!lines.length)
    return null;
  return lines.join(`
`);
}

// src/backend/state-push.ts
var busyChats = new Set;
var activeChat = new Map;
var timers = new Map;
var key2 = (userId) => userId ?? "_";
function setActiveChat(userId, chatId) {
  activeChat.set(key2(userId), chatId);
}
function getActiveChat(userId) {
  return activeChat.get(key2(userId)) ?? null;
}
var MAX_RECORDS = 60;
async function pushState(chatId, userId, force = false) {
  try {
    const loaded = await getRuleset(chatId, userId, force);
    const status = statusOf(loaded);
    if (!chatId || !loaded?.ruleset) {
      send({ type: "state", chatId, status, hud: null, choices: [], records: [], suggestions: [], latestMessageId: null, choicesAnchor: null, busy: false }, userId);
      return;
    }
    const r = loaded.ruleset;
    const settings = await getSettings(userId);
    const msgs = await getMessages(chatId);
    const { state, steps } = foldPath(r, msgs);
    const redoable = (userMsgId) => {
      const i = msgs.findIndex((m) => m.id === userMsgId);
      return i >= 0 && msgs[i].is_user && msgs.length - 1 - i <= 1;
    };
    const indexOf = new Map(msgs.map((m, i) => [m.id, i]));
    const records = steps.slice(-MAX_RECORDS).map((st) => {
      const v = buildRecordView(r, st.message.id, st.message.swipe_id ?? 0, st.record, st.before, st.after);
      const prev = msgs[(indexOf.get(st.message.id) ?? 0) - 1];
      if (st.record.action?.via === "adjudicator" && prev?.is_user && redoable(prev.id))
        v.redoFrom = prev.id;
      return v;
    }).filter((v) => v.check || v.changes.length || v.action || v.decisions.length || (v.contradiction ?? 0) >= 0.6);
    const suggestions = [];
    for (const m of msgs.slice(-6)) {
      const w = warpMeta(m);
      if (!m.is_user || !w.suggest || w.intent)
        continue;
      suggestions.push({ messageId: m.id, actionId: w.suggest.actionId, params: w.suggest.params, label: w.suggest.label, confidence: w.suggest.confidence, canRedo: redoable(m.id) });
    }
    const latest = msgs[msgs.length - 1] ?? null;
    const anchor = latest && !latest.is_user ? latest.id : null;
    send({
      type: "state",
      chatId,
      status,
      hud: settings.enabled ? buildHud(r, state) : null,
      choices: settings.enabled ? buildChoices(r, state, settings) : [],
      records: settings.enabled ? records : [],
      suggestions: settings.enabled ? suggestions.filter((s) => s.canRedo) : [],
      latestMessageId: latest?.id ?? null,
      choicesAnchor: anchor,
      busy: busyChats.has(chatId)
    }, userId);
  } catch (e) {
    logError("pushState", e);
  }
}
function schedulePush(chatId, userId, delay = 150) {
  if (!chatId)
    return;
  const active = getActiveChat(userId);
  if (active && active !== chatId)
    return;
  const k = `${key2(userId)}:${chatId}`;
  const t = timers.get(k);
  if (t)
    clearTimeout(t);
  timers.set(k, setTimeout(() => {
    timers.delete(k);
    pushState(chatId, userId);
  }, delay));
}
async function connectionsFor(userId) {
  try {
    const list = await host().connections.list(userId);
    return list.map((c) => ({ id: c.id, name: `${c.name} — ${c.model}` }));
  } catch {
    return [];
  }
}

// src/backend/decisions.ts
var NONE = "none";
function clip(s, n) {
  return s.length > n ? `…${s.slice(-n)}` : s;
}
function fill(text, player) {
  return text.replace(/\{\{user\}\}/gi, player);
}
async function safeAsk(d, state, q, timeoutMs, what) {
  if (!Object.keys(q).length)
    return {};
  try {
    return await d.ask(state, q, { timeoutMs });
  } catch (e) {
    logError(`${what} (${d.id})`, e);
    return {};
  }
}
var DIFFICULTY = [
  "Trivial or easy for an ordinary person in this situation",
  "A fair challenge",
  "Hard — most people would struggle",
  "Extreme — only the exceptional could pull it off"
];
async function readTurn(opts) {
  const { decider, r, s, settings, playerText, player } = opts;
  const q = {};
  const actions = playerText ? availableActions(r, s, settings.lines) : [];
  const travel = playerText ? travelTargets(r, s) : [];
  if (playerText && (actions.length || travel.length)) {
    const criteria = {
      [NONE]: "None of these: dialogue, thoughts, feelings, plans, questions, or something trivial that can't fail"
    };
    for (const a of actions)
      criteria[a.id] = `${a.label}${a.desc ? ` — ${a.desc}` : ""}`;
    for (const t of travel)
      criteria[`${TRAVEL_PREFIX}${t}`] = `Go to ${r.locations[t].name}`;
    q.action = { type: "choice", instructions: `Which of these does ${player}'s latest message actually attempt right now?`, criteria };
    if (actions.some((a) => a.params.length)) {
      q.difficulty = { type: "score", instructions: `How hard is what ${player} is attempting, given the scene?`, criteria: DIFFICULTY };
    }
  }
  for (const t of r.triggers) {
    if (t.whenScene)
      q[`scene:${t.id}`] = { type: "noul", instructions: fill(t.whenScene, player) };
  }
  const state = {
    game_state: stateDigest(r, s),
    scene_so_far: clip(opts.sceneText, 2000) || "(start of story)",
    ...playerText ? { player_message: clip(playerText, 1500) } : {}
  };
  const ans = await safeAsk(decider, state, q, opts.timeoutMs, "read turn");
  const scene = {};
  for (const t of r.triggers) {
    const a = ans[`scene:${t.id}`];
    if (t.whenScene && a?.type === "noul" && noulConfidence(a.noul) >= 0.3)
      scene[t.id] = a.noul >= 0.5;
  }
  const out = { intent: null, suggestion: null, confidence: 0, scene };
  const act = ans.action;
  if (act?.type !== "choice" || act.choice === NONE)
    return out;
  const id = act.choice;
  const conf = act.probabilities[id] ?? act.confidence;
  out.confidence = conf;
  let intent = null;
  let label = id;
  if (id.startsWith(TRAVEL_PREFIX)) {
    const to = id.slice(TRAVEL_PREFIX.length);
    if (!travel.includes(to))
      return out;
    intent = { actionId: id, via: "adjudicator" };
    label = `Go to ${r.locations[to].name}`;
  } else {
    const a = actions.find((x) => x.id === id);
    if (!a)
      return out;
    label = a.label;
    const params = {};
    const level = ans.difficulty?.type === "score" ? ans.difficulty.score / (DIFFICULTY.length - 1) : null;
    for (const p of a.params) {
      const keys = Object.keys(p.options);
      params[p.id] = level === null ? p.default : keys[Math.round(level * (keys.length - 1))];
    }
    intent = { actionId: a.id, via: "adjudicator", ...a.params.length ? { params } : {} };
  }
  if (conf >= settings.autoConfidence)
    out.intent = intent;
  else if (conf >= settings.askConfidence)
    out.suggestion = { ...intent, label, confidence: conf };
  return out;
}
async function odds2(opts) {
  const q = {};
  for (const d of opts.specs) {
    q[`decide:${d.id}`] = {
      type: "choice",
      instructions: fill(d.ask, opts.player),
      criteria: Object.fromEntries(d.options.map((o) => [o.id, fill(o.desc, opts.player)]))
    };
  }
  const state = {
    game_state: stateDigest(opts.r, opts.s),
    scene_so_far: clip(opts.sceneText, 2000),
    player_message: clip(opts.playerText, 1200)
  };
  const ans = await safeAsk(opts.decider, state, q, opts.timeoutMs, "decide odds");
  const out = {};
  for (const d of opts.specs) {
    const a = ans[`decide:${d.id}`];
    if (a?.type === "choice")
      out[d.id] = normalize(a.probabilities, d.options.map((o) => o.id));
  }
  return out;
}
var STEP_FACTOR = { down_lot: -1, down: -1 / 3, same: 0, up: 1 / 3, up_lot: 1 };
var TIME_LEVELS = [
  "No meaningful time — a few seconds or a single exchange",
  "A few minutes",
  "Around half an hour",
  "About an hour",
  "A few hours",
  "Most of a day or night"
];
var TIME_MINUTES = [0, 5, 30, 60, 180, 480];
function stepDelta(step, limit) {
  const raw = STEP_FACTOR[step] * limit;
  const rounded = Math.round(raw);
  return rounded === 0 && raw !== 0 ? Math.sign(raw) * Math.min(1, Math.abs(limit)) : rounded;
}
function stepCriteria(what) {
  return {
    down_lot: `${what} dropped sharply`,
    down: `${what} went down a little`,
    same: `${what} didn't change, or the reply doesn't say`,
    up: `${what} went up a little`,
    up_lot: `${what} rose sharply`
  };
}
function confident(a) {
  return a?.type === "choice" && a.confidence >= 0.5;
}
async function bookkeeping(opts) {
  const { r, s, player } = opts;
  const q = {};
  if (r.clock.enabled)
    q.time = { type: "score", instructions: "How much in-story time passes during the narrator's reply?", criteria: TIME_LEVELS };
  for (const id of r.statOrder) {
    const d = r.stats[id];
    if (d.narrator <= 0)
      continue;
    q[`stat:${id}`] = { type: "choice", instructions: `During the reply, how did ${player}'s ${d.label}${d.desc ? ` (${d.desc})` : ""} change?`, criteria: stepCriteria(d.label) };
  }
  const lower = opts.reply.toLowerCase();
  const mentioned = Object.keys(s.people).filter((pid) => lower.includes(personName(r, s, pid).toLowerCase().split(" ")[0]));
  for (const pid of mentioned)
    for (const rs of r.relStatOrder) {
      const d = r.relStats[rs];
      if (d.narrator <= 0)
        continue;
      const name = personName(r, s, pid);
      q[`rel:${pid}:${rs}`] = { type: "choice", instructions: `How did ${name}'s ${d.label} toward ${player} change during the reply?`, criteria: stepCriteria(`${name}'s ${d.label}`) };
    }
  const locs = Object.values(r.locations);
  if (locs.length && !r.locationsOpen) {
    q.move = {
      type: "choice",
      instructions: `Where is ${player} at the end of the reply?`,
      criteria: { stay: `Still at ${s.locationName ?? "the same place"}`, ...Object.fromEntries(locs.filter((l) => l.id !== s.location).map((l) => [l.id, l.name])) }
    };
  }
  for (const c of Object.values(r.conditions)) {
    if (!c.narrator)
      continue;
    q[`cond:${c.id}`] = { type: "noul", instructions: `At the end of the reply, ${player} is ${c.label.toLowerCase()}${c.desc ? ` (${c.desc})` : ""}` };
  }
  for (const f of Object.values(r.flags)) {
    if (f.narrator && typeof f.start === "boolean")
      q[`flag:${f.id}`] = { type: "noul", instructions: `At the end of the reply, this is true: ${f.label ?? f.id.replace(/_/g, " ")}` };
  }
  if (r.peopleOpen)
    q["gate:people"] = { type: "noul", instructions: "The reply introduces a named character who wasn't in the game state before" };
  if (r.itemsOpen)
    q["gate:items"] = { type: "noul", instructions: `${player} gains, loses or uses up an item during the reply` };
  if (r.locationsOpen)
    q["gate:move"] = { type: "noul", instructions: `${player} ends the reply somewhere different from ${s.locationName ?? "where they started"}` };
  const state = { game_state: stateDigest(r, s), player_message: clip(opts.playerText, 1200), narrator_reply: clip(opts.reply, 6000) };
  const ans = await safeAsk(opts.decider, state, q, 12000, "bookkeeping");
  const p = {};
  const t = ans.time;
  if (t?.type === "score" && t.confidence >= 0.4) {
    const lo = Math.floor(t.score), hi = Math.min(TIME_MINUTES.length - 1, lo + 1), f = t.score - lo;
    p.minutes = Math.round(TIME_MINUTES[lo] + (TIME_MINUTES[hi] - TIME_MINUTES[lo]) * f);
  }
  for (const id of r.statOrder) {
    const a = ans[`stat:${id}`];
    if (!confident(a) || a.choice === "same")
      continue;
    (p.stats ??= {})[id] = stepDelta(a.choice, r.stats[id].narrator);
  }
  for (const [key, a] of Object.entries(ans)) {
    if (!key.startsWith("rel:") || !confident(a) || a.choice === "same")
      continue;
    const [, pid, rs] = key.split(":");
    ((p.rel ??= {})[personName(r, s, pid)] ??= {})[rs] = stepDelta(a.choice, r.relStats[rs].narrator);
  }
  if (confident(ans.move) && ans.move.choice !== "stay")
    p.move = ans.move.choice;
  for (const c of Object.values(r.conditions)) {
    const a = ans[`cond:${c.id}`];
    if (a?.type !== "noul" || noulConfidence(a.noul) < 0.4)
      continue;
    const on = a.noul >= 0.5;
    if (on && !s.conditions[c.id])
      ((p.conditions ??= {}).add ??= []).push(c.id);
    if (!on && s.conditions[c.id])
      ((p.conditions ??= {}).remove ??= []).push(c.id);
  }
  for (const f of Object.values(r.flags)) {
    const a = ans[`flag:${f.id}`];
    if (a?.type === "noul" && noulConfidence(a.noul) >= 0.4)
      (p.flags ??= {})[f.id] = a.noul >= 0.5;
  }
  const needsWriting = new Set;
  for (const g of ["people", "items", "move"]) {
    const a = ans[`gate:${g}`];
    if (a?.type === "noul" && a.noul >= 0.6)
      needsWriting.add(g);
  }
  return { proposal: p, needsWriting };
}
async function contradiction(opts) {
  const q = {
    contradicts: {
      type: "noul",
      instructions: "The narrator's reply contradicts the game state or the decided outcome (wrong location, items, injuries, relationships, time of day, or a different result than the dice gave)"
    }
  };
  const state = { game_state: stateDigest(opts.r, opts.s), decided_outcome: opts.outcome ?? "(none)", narrator_reply: clip(opts.reply, 6000) };
  const ans = await safeAsk(opts.decider, state, q, 8000, "consistency");
  const a = ans.contradicts;
  return a?.type === "noul" ? a.noul : null;
}

// src/backend/deciders.ts
var JEV_KEY = "jev_api_key";
var JEV_URL = "https://api.typesafe.ai/v1/systemone";

class DeciderError extends Error {
}
async function post(url, headers, body, timeoutMs) {
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new DeciderError("Decision model timed out")), timeoutMs));
  const call = (async () => {
    try {
      const r = await host().cors(url, { method: "POST", headers, body });
      return { status: r.status, body: r.body };
    } catch (e) {
      if (typeof fetch !== "function")
        throw e;
      const r = await fetch(url, { method: "POST", headers, body });
      return { status: r.status, body: await r.text() };
    }
  })();
  return Promise.race([call, timeout]);
}

class JevDecider {
  key;
  model;
  id = "jev";
  canWrite = false;
  constructor(key, model) {
    this.key = key;
    this.model = model;
  }
  async ask(state, questions, opts = {}) {
    if (!Object.keys(questions).length)
      return {};
    const body = JSON.stringify({ model: this.model || "jev-latest", state, questions });
    const headers = { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" };
    let delay = 400;
    for (let attempt = 0;; attempt++) {
      const res = await post(JEV_URL, headers, body, opts.timeoutMs ?? 8000);
      if (res.status === 200) {
        const parsed = JSON.parse(res.body);
        return parsed.answers ?? {};
      }
      if ((res.status === 429 || res.status === 529) && attempt < 2) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 3;
        continue;
      }
      const hint = res.status === 401 ? "the Jev API key was rejected" : res.status === 422 ? "Jev rejected the request" : `Jev returned ${res.status}`;
      throw new DeciderError(`${hint}${res.body ? `: ${res.body.slice(0, 200)}` : ""}`);
    }
  }
}
function firstJson(text) {
  const s = text.replace(/```(?:json)?/gi, "");
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start)
    return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

class LlmDecider {
  settings;
  userId;
  id = "llm";
  canWrite = true;
  constructor(settings, userId) {
    this.settings = settings;
    this.userId = userId;
  }
  async ask(state, questions, opts = {}) {
    const ids = Object.keys(questions);
    if (!ids.length)
      return {};
    const lines = ids.map((id) => {
      const q = questions[id];
      if (q.type === "choice")
        return `${id} (choice) — ${q.instructions}
${Object.entries(q.criteria).map(([k, v]) => `    "${k}": ${v}`).join(`
`)}`;
      if (q.type === "score")
        return `${id} (score 0–${q.criteria.length - 1}) — ${q.instructions}
${q.criteria.map((c, i) => `    ${i}: ${c}`).join(`
`)}`;
      return `${id} (yes/no) — ${q.instructions}`;
    });
    const system = [
      "You answer typed questions about a roleplay game's current situation. You never write story.",
      "Answer every question. Reply with JSON only, one key per question id:",
      '  choice → {"choice": "<option key>", "confidence": 0.0–1.0}',
      '  score  → {"level": <integer>, "confidence": 0.0–1.0}',
      '  yes/no → {"p": <probability it is true, 0.0–1.0>}',
      "Be honest about confidence: 0.5 means a coin flip."
    ].join(`
`);
    const user = `State:
${typeof state === "string" ? state : JSON.stringify(state, null, 1)}

Questions:
${lines.join(`

`)}`;
    const res = await host().generate.quiet({
      type: "quiet",
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      connection_id: this.settings.helperConnectionId || undefined,
      reasoning: { source: "off" },
      parameters: { temperature: 0, max_tokens: 60 + ids.length * 30 },
      userId: this.userId,
      signal: opts.signal ?? AbortSignal.timeout(Math.max(3000, opts.timeoutMs ?? 20000))
    });
    const raw = firstJson(typeof res === "string" ? res : res?.content ?? "") ?? {};
    const out = {};
    for (const id of ids) {
      const q = questions[id];
      const a = raw[id] ?? {};
      const conf = clamp01(Number(a.confidence ?? 0.6));
      if (q.type === "choice") {
        const keys = Object.keys(q.criteria);
        const pick = typeof a.choice === "string" && keys.includes(a.choice) ? a.choice : null;
        if (!pick)
          continue;
        const rest = keys.length > 1 ? (1 - conf) / (keys.length - 1) : 0;
        out[id] = { type: "choice", choice: pick, confidence: conf, probabilities: Object.fromEntries(keys.map((k) => [k, k === pick ? conf : rest])) };
      } else if (q.type === "score") {
        const n = q.criteria.length;
        const level = Math.max(0, Math.min(n - 1, Math.round(Number(a.level))));
        if (!Number.isFinite(level))
          continue;
        const rest = n > 1 ? (1 - conf) / (n - 1) : 0;
        out[id] = { type: "score", score: level, confidence: conf, probabilities: Object.fromEntries(q.criteria.map((_, i) => [String(i), i === level ? conf : rest])) };
      } else {
        const p = Number(a.p ?? a.probability ?? a.noul);
        if (Number.isFinite(p))
          out[id] = { type: "noul", noul: clamp01(p) };
      }
    }
    return out;
  }
}
var STOP = new Set("a an the to of and or in on at for with my i me you your it is be do try tries trying".split(" "));
var words = (s) => new Set(s.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !STOP.has(w)));

class RulesDecider {
  id = "rules";
  canWrite = false;
  async ask(state, questions) {
    const text = typeof state === "string" ? state : JSON.stringify(state?.player_message ?? state);
    const have = words(text);
    const out = {};
    for (const [id, q] of Object.entries(questions)) {
      if (q.type === "choice") {
        const keys = Object.keys(q.criteria);
        const scores = {};
        for (const k of keys) {
          const want = words(`${k.replace(/_/g, " ")} ${q.criteria[k]}`);
          let hit = 0;
          for (const w of want)
            if (have.has(w))
              hit++;
          scores[k] = 0.15 + hit;
        }
        const p = normalize(scores, keys);
        const best = keys.reduce((a, b) => p[b] > p[a] ? b : a);
        out[id] = { type: "choice", choice: best, probabilities: p, confidence: Math.min(0.6, p[best]) };
      } else if (q.type === "score") {
        const mid = Math.floor((q.criteria.length - 1) / 2);
        out[id] = { type: "score", score: mid, confidence: 0.2, probabilities: Object.fromEntries(q.criteria.map((_, i) => [String(i), 1 / q.criteria.length])) };
      } else {
        out[id] = { type: "noul", noul: 0.5 };
      }
    }
    return out;
  }
}
function clamp01(n) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}
async function getDecider(settings, userId) {
  if (settings.decider === "rules")
    return new RulesDecider;
  if (settings.decider === "jev") {
    let key = null;
    try {
      key = await host().enclave.get(JEV_KEY, userId);
    } catch {}
    if (key)
      return new JevDecider(key, settings.jevModel);
  }
  return new LlmDecider(settings, userId);
}

// src/backend/helpers.ts
function firstJson2(text) {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  if (start < 0)
    return null;
  let depth = 0;
  let inStr = false;
  for (let i = start;i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (c === "\\")
        i++;
      else if (c === '"')
        inStr = false;
      continue;
    }
    if (c === '"')
      inStr = true;
    else if (c === "{")
      depth++;
    else if (c === "}" && --depth === 0) {
      try {
        return JSON.parse(cleaned.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
async function ask(system, user, settings, userId, timeoutMs) {
  const res = await host().generate.quiet({
    type: "quiet",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    connection_id: settings.helperConnectionId || undefined,
    reasoning: { source: "off" },
    parameters: { temperature: 0.1, max_tokens: 500 },
    userId,
    signal: AbortSignal.timeout(Math.max(3000, timeoutMs))
  });
  return typeof res === "string" ? res : res?.content ?? "";
}
function clip2(s, n) {
  return s.length > n ? `…${s.slice(-n)}` : s;
}
async function extract(r, s, playerText, reply, settings, userId, only) {
  const stats = r.statOrder.map((id) => r.stats[id]).filter((d) => d.narrator > 0);
  const rels = r.relStatOrder.map((id) => r.relStats[id]).filter((d) => d.narrator > 0);
  const conds = Object.values(r.conditions).filter((c) => c.narrator);
  const flags = Object.values(r.flags).filter((f) => f.narrator);
  const locs = Object.values(r.locations);
  const want = (k) => !only || only.has(k);
  const allowed = [];
  if (want("minutes") && r.clock.enabled)
    allowed.push(`- "minutes": how much in-story time the reply covers (0–${r.clock.narratorMax}).`);
  if (want("stats") && stats.length)
    allowed.push(`- "stats": changes (deltas) to: ${stats.map((d) => `${d.id} (±${formatNumber(d.narrator)})`).join(", ")}`);
  if (want("rel") && rels.length)
    allowed.push(`- "rel": per person name, deltas to: ${rels.map((d) => `${d.id} (±${formatNumber(d.narrator)})`).join(", ")}`);
  if (want("people") && r.peopleOpen)
    allowed.push(`- "people": newly introduced named characters, as [{"name": "..."}]`);
  if (want("items") && (r.itemsOpen || Object.keys(r.items).length))
    allowed.push(`- "items": item name → count gained (+) or lost (−). Held: ${Object.keys(s.items).map((id) => itemName(r, s, id)).join(", ") || "nothing"}`);
  if (want("move") && (locs.length || r.locationsOpen))
    allowed.push(`- "move": where the player character ends up, if they moved${locs.length && !r.locationsOpen ? ` (one of: ${locs.map((l) => l.name).join(", ")})` : ""}`);
  if (want("conditions") && conds.length)
    allowed.push(`- "conditions": {"add": [...], "remove": [...]} from: ${conds.map((c) => c.id).join(", ")}`);
  if (want("flags") && flags.length)
    allowed.push(`- "flags": set any of: ${flags.map((f) => f.id).join(", ")}`);
  if (!allowed.length)
    return null;
  const system = [
    "You are the bookkeeper for a text roleplay game. You never write story.",
    "Read the narrator's latest reply and record only what CLEARLY happened in it.",
    "Small, sensible deltas. Omit anything unchanged. Do not re-apply dice outcomes that were already applied.",
    "You may report:",
    ...allowed,
    'Reply with JSON only, e.g. {"minutes": 20, "stats": {"stress": 300}, "rel": {"Robin": {"trust": 3}}}. Use {} if nothing changed.'
  ].join(`
`);
  const user = [
    "Current state:",
    stateDigest(r, s),
    "",
    "Player's message:",
    clip2(playerText, 1200) || "(none)",
    "",
    "Narrator's reply:",
    clip2(reply, 4000)
  ].join(`
`);
  try {
    const out = firstJson2(await ask(system, user, settings, userId, 30000));
    return out ?? null;
  } catch (e) {
    logError("extractor", e);
    return null;
  }
}

// src/backend/turn.ts
var pending = new Map;
var playerNames = new Map;
var started = new Map;
function ctxInfo(ctx) {
  const raw = ctx;
  const s = started.get(ctx.chatId);
  const fresh = s && Date.now() - s.at < 5 * 60000 ? s : undefined;
  return {
    isDryRun: raw.isDryRun === true || raw.dryRun === true,
    generationId: typeof raw.generationId === "string" && raw.generationId || fresh?.generationId || null,
    targetMessageId: typeof raw.excludeMessageId === "string" && raw.excludeMessageId || fresh?.targetMessageId || null
  };
}
async function playerName(chatId, userId) {
  const hit = playerNames.get(chatId);
  if (hit)
    return hit;
  try {
    const { text } = await host().macros.resolve("{{user}}", { chatId, commit: false });
    const name = text && text !== "{{user}}" ? text : "The player";
    playerNames.set(chatId, name);
    return name;
  } catch {
    return "The player";
  }
}
function fillNames(text, player) {
  return text.replace(/\{\{user\}\}/gi, player);
}
function buildInjection(r, rec, before, after, player) {
  const parts = [];
  parts.push(`[Warp — current game state. The rules engine owns these facts; keep narration consistent with them.]
${stateDigest(r, after)}`);
  if (r.narration.notes)
    parts.push(`[Warp — narrator notes]
${r.narration.notes}`);
  const packet = rec ? outcomePacket(r, rec, before, after, player) : null;
  if (packet && (rec?.action || rec?.hints.length)) {
    parts.push(`[Warp — this turn's outcome, already decided by the dice. Narrate it faithfully and do not change the result.]
${packet}`);
  }
  return fillNames(parts.join(`

`), player);
}
function injectInto(messages, text) {
  const out = [...messages];
  let idx = -1;
  for (let i = out.length - 1;i >= 0; i--)
    if (out[i].role === "user") {
      idx = i;
      break;
    }
  const block = `

<warp>
${text}
</warp>`;
  if (idx >= 0) {
    const m = out[idx];
    out[idx] = typeof m.content === "string" ? { ...m, content: m.content + block } : { ...m, content: [...m.content, { type: "text", text: block }] };
    return { messages: out, index: idx };
  }
  out.push({ role: "user", content: block.trim() });
  return { messages: out, index: out.length - 1 };
}
function targetOf(ctx, targetId, msgs) {
  if (targetId) {
    const hit = msgs.find((m) => m.id === targetId);
    if (hit)
      return hit;
  }
  if (ctx.generationType === "swipe" || ctx.generationType === "regenerate" || ctx.generationType === "continue") {
    for (let i = msgs.length - 1;i >= 0; i--)
      if (!msgs[i].is_user)
        return msgs[i];
  }
  const last = msgs[msgs.length - 1];
  if (last && !last.is_user && !last.content.trim())
    return last;
  return null;
}
async function interceptor(messages, ctx) {
  if (ctx.generationType === "impersonate" || ctx.generationType === "quiet")
    return messages;
  try {
    const settings = await getSettings(ctx.userId);
    if (!settings.enabled)
      return messages;
    const loaded = await getRuleset(ctx.chatId, ctx.userId);
    const r = loaded?.ruleset;
    if (!r)
      return messages;
    const info = ctxInfo(ctx);
    const msgs = await getMessages(ctx.chatId);
    const target = targetOf(ctx, info.targetMessageId, msgs);
    const history = target ? msgs.filter((m) => m.index_in_chat < target.index_in_chat) : msgs;
    const { state: before } = foldPath(r, history);
    const player = await playerName(ctx.chatId, ctx.userId);
    let rec = null;
    let after = before;
    if (ctx.generationType === "continue" && target) {
      rec = activeRecord(target);
      if (rec) {
        after = cloneState(before);
        for (const e of rec.events)
          applyEvent(after, e, r);
      }
    } else {
      const lastUser = history[history.length - 1]?.is_user ? history[history.length - 1] : null;
      const meta = lastUser ? warpMeta(lastUser) : {};
      let intent = meta.intent ?? null;
      let verdict;
      let scene = {};
      let confidence;
      const sceneText = [...history].reverse().find((m) => !m.is_user)?.content ?? "";
      const budget = () => Math.min(20000, (typeof ctx.interceptorDeadlineAt === "number" ? ctx.interceptorDeadlineAt : Date.now() + 20000) - Date.now() - 2000);
      const decider = info.isDryRun ? null : await getDecider(settings, ctx.userId);
      if (decider) {
        const readText = !intent && !meta.judged && lastUser && settings.freeTextChecks ? lastUser.content : null;
        const reading = await readTurn({ decider, r, s: before, settings, playerText: readText, sceneText, player, timeoutMs: budget() });
        scene = reading.scene;
        if (readText !== null && lastUser) {
          intent = reading.intent;
          confidence = reading.confidence;
          verdict = { messageId: lastUser.id, intent, suggestion: reading.suggestion };
        }
      }
      const seed = settings.swipesReroll ? randomSeed() : `${lastUser?.id ?? "start"}:${intent?.actionId ?? "none"}`;
      let res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, scene });
      if (decider && res.needs.length) {
        const o = await odds2({ decider, r, s: before, specs: res.needs, playerText: lastUser?.content ?? "", sceneText, player, timeoutMs: budget() });
        if (Object.keys(o).length)
          res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, scene, odds: o });
      }
      rec = res.record;
      if (confidence !== undefined && rec.action)
        rec.confidence = confidence;
      after = cloneState(before);
      for (const e of rec.events)
        applyEvent(after, e, r);
      if (!info.isDryRun) {
        pending.set(info.generationId ?? ctx.chatId, {
          chatId: ctx.chatId,
          userId: ctx.userId,
          rec,
          after,
          playerText: lastUser?.content ?? "",
          ruleset: r,
          at: Date.now(),
          verdict,
          outcome: outcomePacket(r, rec, before, after, player),
          player
        });
        if (rec.check)
          host().sendToFrontend({ type: "busy", chatId: ctx.chatId, busy: true, label: `${rec.check.label}: ${rec.check.tier.replace("_", " ")}` }, ctx.userId);
      }
    }
    const text = buildInjection(r, rec, before, after, player);
    const { messages: out, index } = injectInto(messages, text);
    return { messages: out, breakdown: [{ messageIndex: index, name: "Warp game state" }] };
  } catch (e) {
    logError("interceptor", e);
    return messages;
  }
}
async function proposeChanges(decider, r, p, reply, settings, userId) {
  if (decider.id === "llm")
    return extract(r, p.after, p.playerText, reply, settings, userId);
  if (decider.id === "rules")
    return null;
  const { proposal, needsWriting } = await bookkeeping({ decider, r, s: p.after, playerText: p.playerText, reply, player: p.player });
  if (needsWriting.size) {
    const named = await extract(r, p.after, p.playerText, reply, settings, userId, needsWriting);
    if (named?.people)
      proposal.people = named.people;
    if (named?.items)
      proposal.items = { ...proposal.items ?? {}, ...named.items };
    if (named?.move && !proposal.move)
      proposal.move = named.move;
  }
  return proposal;
}
async function onGenerationStarted(payload, userId) {
  const { chatId } = payload;
  started.set(chatId, { generationId: payload.generationId, targetMessageId: payload.targetMessageId, generationType: payload.generationType, at: Date.now() });
  busyChats.add(chatId);
  host().sendToFrontend({ type: "busy", chatId, busy: true }, userId);
}
async function onGenerationEnded(payload, userId) {
  busyChats.delete(payload.chatId);
  if (started.get(payload.chatId)?.generationId === payload.generationId)
    started.delete(payload.chatId);
  const key = pending.has(payload.generationId) ? payload.generationId : payload.chatId;
  const p = pending.get(key);
  pending.delete(key);
  for (const [id, x] of pending)
    if (Date.now() - x.at > 10 * 60000)
      pending.delete(id);
  if (!p || payload.error || !payload.messageId) {
    await pushState(payload.chatId, userId);
    return;
  }
  try {
    const msgs = await getMessages(payload.chatId);
    const msg = msgs.find((m) => m.id === payload.messageId);
    if (!msg)
      return;
    const swipe = msg.swipe_id ?? 0;
    await writeRecord(payload.chatId, msg.id, swipe, p.rec);
    if (p.verdict) {
      const { messageId, intent, suggestion } = p.verdict;
      await patchWarpMeta(payload.chatId, messageId, (w) => ({
        ...w,
        judged: true,
        ...intent ? { intent } : {},
        ...suggestion ? { suggest: suggestion } : {}
      })).catch((e) => logError("save verdict", e));
    }
    await pushState(payload.chatId, userId);
    const settings = await getSettings(userId);
    if (!payload.content || !settings.narratorUpdates && !settings.consistencyCheck)
      return;
    host().sendToFrontend({ type: "busy", chatId: payload.chatId, busy: true, label: "Updating state…" }, userId);
    const decider = await getDecider(settings, userId);
    const r = p.ruleset;
    const [proposal, contra] = await Promise.all([
      settings.narratorUpdates ? proposeChanges(decider, r, p, payload.content, settings, userId) : Promise.resolve(null),
      settings.consistencyCheck && decider.id !== "rules" ? contradiction({ decider, r, s: p.after, reply: payload.content, outcome: p.outcome }) : Promise.resolve(null)
    ]);
    const rec = { ...p.rec };
    if (proposal) {
      const events = applyProposal(r, p.after, proposal);
      if (events.length)
        rec.events = [...rec.events, ...events];
    }
    if (contra !== null)
      rec.contradiction = contra;
    if (rec.events !== p.rec.events || contra !== null)
      await writeRecord(payload.chatId, msg.id, swipe, rec);
  } catch (e) {
    logError("generation ended", e);
  } finally {
    host().sendToFrontend({ type: "busy", chatId: payload.chatId, busy: false }, userId);
    schedulePush(payload.chatId, userId, 0);
  }
}

// src/backend.ts
spindle.registerInterceptor(interceptor, 60);
spindle.registerWorldInfoInterceptor(async (ctx) => {
  const disabled = ctx.entries.filter((e) => knownRulesetEntryIds.has(e.id) || knownRulesetBookIds.has(e.world_book_id) || isRulesetEntryTitle(e.comment)).map((e) => e.id);
  return disabled.length ? { disabled } : undefined;
}, 10);
var chatIdOf = (p) => {
  const x = p;
  return x?.chatId ?? x?.message?.chat_id ?? null;
};
spindle.on("CHAT_SWITCHED", (p, userId) => {
  const chatId = p.chatId;
  setActiveChat(userId, chatId);
  pushState(chatId, userId);
});
spindle.on("GENERATION_STARTED", (p, userId) => {
  onGenerationStarted(p, userId);
});
spindle.on("GENERATION_ENDED", (p, userId) => {
  onGenerationEnded(p, userId);
});
spindle.on("GENERATION_STOPPED", (p, userId) => {
  const chatId = chatIdOf(p);
  if (chatId)
    send({ type: "busy", chatId, busy: false }, userId);
  schedulePush(chatId, userId);
});
spindle.on("MESSAGE_SWIPED", (p, userId) => {
  if (p.action === "deleted") {
    shiftAfterSwipeDelete(p.chatId, p.message.id, p.swipeId).catch((e) => logError("swipe delete", e)).finally(() => schedulePush(p.chatId, userId));
    return;
  }
  schedulePush(p.chatId, userId);
});
for (const ev of ["MESSAGE_SENT", "MESSAGE_DELETED", "MESSAGE_EDITED", "SWIPE_EDITED", "CHAT_CHANGED"]) {
  spindle.on(ev, (p, userId) => schedulePush(chatIdOf(p), userId, 250));
}
spindle.on("CHARACTER_EDITED", (p, userId) => {
  const id = p?.character?.id ?? p?.characterId;
  invalidateCharacter(id ?? null);
});
spindle.commands.register([
  { id: "open", label: "Warp: Open character sheet", description: "Stats, skills, people, inventory and settings", keywords: ["stats", "sheet", "hud", "game"], scope: "chat" },
  { id: "install", label: "Warp: Add a ruleset to this character", description: "Pick a starter game (Universal, life-sim, sci-fi RPG)", keywords: ["ruleset", "template", "game", "setup"], scope: "chat" },
  { id: "reload", label: "Warp: Reload ruleset", description: "Re-read the character's warp-ruleset lorebook", keywords: ["refresh", "ruleset"], scope: "chat" }
]);
spindle.commands.onInvoked((id, context) => {
  if (id === "reload") {
    pushState(context.chatId ?? null, undefined, true).then(() => toast("info", "Ruleset reloaded"));
    return;
  }
  send({ type: "command", command: id });
});
async function sendSettings(userId) {
  const settings = await getSettings(userId);
  let jevKeySet = false;
  try {
    jevKeySet = await spindle.enclave.has(JEV_KEY, userId);
  } catch {}
  send({
    type: "settings",
    settings,
    jevKeySet,
    templates: TEMPLATES.map(({ id, name, blurb }) => ({ id, name, blurb })),
    connections: await connectionsFor(userId)
  }, userId);
}
spindle.onFrontendMessage(async (raw, userId) => {
  const msg = raw;
  try {
    switch (msg.type) {
      case "hello": {
        setActiveChat(userId, msg.chatId);
        await sendSettings(userId);
        await pushState(msg.chatId, userId);
        break;
      }
      case "refresh":
        setActiveChat(userId, msg.chatId);
        await pushState(msg.chatId, userId);
        break;
      case "reload":
        await pushState(msg.chatId, userId, true);
        break;
      case "act": {
        const loaded = await getRuleset(msg.chatId, userId);
        const r = loaded?.ruleset;
        if (!r)
          return;
        const settings = await getSettings(userId);
        const { state } = foldPath(r, await getMessages(msg.chatId));
        let say;
        if (msg.actionId.startsWith(TRAVEL_PREFIX)) {
          const to = msg.actionId.slice(TRAVEL_PREFIX.length);
          if (!travelTargets(r, state).includes(to)) {
            toast("warning", "You can't get there from here.", userId);
            await pushState(msg.chatId, userId);
            return;
          }
          say = `*I head to ${r.locations[to].name}.*`;
        } else {
          const a = availableActions(r, state, settings.lines).find((x) => x.id === msg.actionId);
          if (!a) {
            toast("warning", "That choice isn't available anymore.", userId);
            await pushState(msg.chatId, userId);
            return;
          }
          say = a.say ?? `*${a.label}*`;
        }
        await spindle.chat.appendMessage(msg.chatId, {
          role: "user",
          content: say,
          metadata: { warp: { intent: { actionId: msg.actionId, params: msg.params, via: "choice" } } }
        }, { triggerGeneration: true });
        break;
      }
      case "undo": {
        await patchWarpMeta(msg.chatId, msg.messageId, (w) => {
          const rec = w.swipes?.[String(msg.swipe)];
          if (!rec)
            return w;
          const drop = new Set(msg.events.filter((i) => rec.events[i]?.src === "narrator" || rec.events[i]?.src === "manual"));
          const next = { ...rec, events: rec.events.filter((_, i) => !drop.has(i)) };
          return { ...w, swipes: { ...w.swipes, [String(msg.swipe)]: next } };
        });
        await pushState(msg.chatId, userId);
        break;
      }
      case "adjust": {
        const loaded = await getRuleset(msg.chatId, userId);
        const r = loaded?.ruleset;
        if (!r || !r.stats[msg.stat])
          return;
        const msgs = await getMessages(msg.chatId);
        const last = msgs[msgs.length - 1];
        if (!last) {
          toast("warning", "Send a message first — edits attach to the latest message.", userId);
          return;
        }
        const { state } = foldPath(r, msgs);
        const events = manualSet(r, state, msg.stat, msg.value);
        const swipe = last.swipe_id ?? 0;
        const existing = warpMeta(last).swipes?.[String(swipe)];
        const rec = existing ? { ...existing, events: [...existing.events, ...events] } : { v: 1, hints: [], events, at: Date.now() };
        await writeRecord(msg.chatId, last.id, swipe, rec);
        await pushState(msg.chatId, userId);
        break;
      }
      case "settings": {
        await patchSettings(msg.patch, userId);
        await sendSettings(userId);
        schedulePush(getActiveChat(userId), userId, 0);
        break;
      }
      case "set_jev_key": {
        const key = msg.key.trim();
        if (key)
          await spindle.enclave.put(JEV_KEY, key, userId);
        else
          await spindle.enclave.delete(JEV_KEY, userId);
        await sendSettings(userId);
        toast(key ? "success" : "info", key ? "Jev key saved (encrypted)." : "Jev key removed.", userId);
        break;
      }
      case "test_decider": {
        const settings = await getSettings(userId);
        const decider = await getDecider(settings, userId);
        const t0 = Date.now();
        const ans = await decider.ask({ player_message: "I try to climb over the wall before the guard turns around." }, { action: { type: "choice", instructions: "What is the player attempting?", criteria: { climb: "Climbing", talk: "Talking", none: "Nothing" } } });
        const a = ans.action;
        const ms = Date.now() - t0;
        if (a?.type === "choice")
          toast("success", `${decider.id.toUpperCase()} answered "${a.choice}" at ${Math.round(a.confidence * 100)}% confidence in ${ms} ms.`, userId);
        else
          toast("warning", `${decider.id.toUpperCase()} replied in ${ms} ms but gave no usable answer.`, userId);
        break;
      }
      case "dismiss_suggestion": {
        await patchWarpMeta(msg.chatId, msg.messageId, (w) => {
          const next = { ...w };
          delete next.suggest;
          return next;
        });
        await pushState(msg.chatId, userId);
        break;
      }
      case "redo": {
        const msgs = await getMessages(msg.chatId);
        const i = msgs.findIndex((m) => m.id === msg.userMessageId);
        if (i < 0 || !msgs[i].is_user || msgs.length - 1 - i > 1) {
          toast("warning", "Only the latest turn can be redone.", userId);
          return;
        }
        const user = msgs[i];
        const reply = msgs[i + 1];
        const meta = { ...user.metadata ?? {} };
        const w = { ...warpMeta(user) };
        delete w.suggest;
        delete w.intent;
        w.judged = true;
        if (msg.actionId)
          w.intent = { actionId: msg.actionId, params: msg.params, via: "confirmed" };
        meta.warp = w;
        if (reply)
          await spindle.chat.deleteMessage(msg.chatId, reply.id);
        await spindle.chat.deleteMessage(msg.chatId, user.id);
        await spindle.chat.appendMessage(msg.chatId, { role: "user", content: user.content, metadata: meta }, { triggerGeneration: true });
        break;
      }
      case "install_template": {
        if (!msg.chatId)
          return;
        const name = await installTemplate(msg.chatId, msg.templateId, userId);
        toast("success", `Added the ${name} ruleset. It lives in the "warp-ruleset" lorebook — edit it there any time.`, userId);
        await pushState(msg.chatId, userId, true);
        break;
      }
    }
  } catch (e) {
    logError(`frontend ${msg.type}`, e);
    toast("error", `Warp: ${e instanceof Error ? e.message : String(e)}`, userId);
  }
});
