var __esm = (fn, res, err) => () => {
  if (fn)
    try {
      res = fn(fn = 0);
    } catch (e) {
      err = [e];
    }
  if (err)
    throw err[0];
  return res;
};

// src/engine/expr.ts
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
    if (t.t === "op" && t.v === "+") {
      this.i++;
      return this.unary();
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
var ExprError, OPS, BP, cache, MATH;
var init_expr = __esm(() => {
  ExprError = class ExprError extends Error {
  };
  OPS = ["<=", ">=", "==", "!=", "&&", "||", "+", "-", "*", "/", "%", "<", ">", "!", "(", ")", ",", ".", "?", ":"];
  BP = {
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
  cache = new Map;
  MATH = {
    min: (a) => Math.min(...a),
    max: (a) => Math.max(...a),
    clamp: ([v, lo, hi]) => Math.min(hi, Math.max(lo, v)),
    floor: ([v]) => Math.floor(v),
    ceil: ([v]) => Math.ceil(v),
    round: ([v]) => Math.round(v),
    abs: ([v]) => Math.abs(v)
  };
});

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
var DiceError, TERM;
var init_dice = __esm(() => {
  DiceError = class DiceError extends Error {
  };
  TERM = /([+-]?)\s*(?:(\d*)d(\d+|%)(?:(kh|kl)(\d+))?(!)?|(\d+))/gy;
});

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

// src/engine/dungeon/content.ts
var m = (id, name, tier, s, skills, xp, gold, sprite = id) => ({ id, name, sprite, tier, ...s, skills, xp, gold }), BESTIARY, DEFAULT_BOSSES, sk = (id, name, target, kind, power, mp = 0, tp = 0, extra = {}) => ({ id, name, target, kind, power, mp, tp, ...extra }), SKILLS, CLASSES, CLASS_IDS, PARTY_SPRITES, out = (o = {}) => ({ ...o, effect: emptyEffect() }), ch = (id, label, success, extra = {}) => ({ id, label, success, ...extra }), ev = (id, text, choices, minDepth = 1, weight = 1) => ({ id, text, choices, minDepth, weight }), BUILTIN_EVENTS, BUILTIN_ROMANCE, SHOP;
var init_content = __esm(() => {
  init_ruleset();
  BESTIARY = Object.fromEntries([
    m("rat", "Giant Rat", 1, { hp: 26, mp: 0, atk: 8, def: 3, mat: 2, mdf: 2, agi: 12 }, ["bite"], 6, 3),
    m("bat", "Cave Bat", 1, { hp: 22, mp: 0, atk: 7, def: 2, mat: 2, mdf: 3, agi: 16 }, ["bite"], 6, 2),
    m("jackal", "Jackal", 1, { hp: 28, mp: 0, atk: 9, def: 3, mat: 2, mdf: 2, agi: 13 }, ["bite"], 7, 3),
    m("kobold", "Kobold", 1, { hp: 32, mp: 0, atk: 9, def: 5, mat: 3, mdf: 3, agi: 10 }, ["attack", "smash"], 8, 6),
    m("goblin", "Goblin", 1, { hp: 34, mp: 0, atk: 10, def: 5, mat: 4, mdf: 4, agi: 11 }, ["attack", "smash"], 9, 8),
    m("ooze", "Ooze", 1, { hp: 44, mp: 0, atk: 8, def: 7, mat: 6, mdf: 8, agi: 5 }, ["attack", "acid"], 9, 4),
    m("spider", "Cave Spider", 1, { hp: 28, mp: 0, atk: 10, def: 4, mat: 4, mdf: 3, agi: 14 }, ["bite", "venom"], 8, 3),
    m("frog", "Giant Frog", 1, { hp: 36, mp: 0, atk: 9, def: 4, mat: 2, mdf: 3, agi: 12 }, ["bite"], 7, 3),
    m("hobgoblin", "Hobgoblin", 2, { hp: 55, mp: 0, atk: 13, def: 9, mat: 5, mdf: 6, agi: 10 }, ["attack", "smash"], 18, 14),
    m("gnoll", "Gnoll", 2, { hp: 51, mp: 0, atk: 14, def: 8, mat: 5, mdf: 6, agi: 12 }, ["attack", "smash"], 18, 12),
    m("orc", "Orc", 2, { hp: 58, mp: 0, atk: 13, def: 10, mat: 5, mdf: 6, agi: 9 }, ["attack", "smash"], 19, 14),
    m("orc_warrior", "Orc Warrior", 2, { hp: 65, mp: 0, atk: 15, def: 11, mat: 5, mdf: 6, agi: 9 }, ["attack", "smash"], 22, 16),
    m("orc_priest", "Orc Priest", 2, { hp: 48, mp: 0, atk: 9, def: 8, mat: 14, mdf: 11, agi: 10 }, ["attack", "curse", "mend"], 21, 16),
    m("wolf", "Wolf", 2, { hp: 49, mp: 0, atk: 14, def: 7, mat: 4, mdf: 5, agi: 16 }, ["bite"], 17, 6),
    m("ghoul", "Ghoul", 2, { hp: 62, mp: 0, atk: 13, def: 9, mat: 8, mdf: 10, agi: 8 }, ["bite", "drain"], 21, 10),
    m("scorpion", "Giant Scorpion", 2, { hp: 56, mp: 0, atk: 15, def: 12, mat: 4, mdf: 6, agi: 11 }, ["attack", "venom"], 20, 8),
    m("wolf_spider", "Wolf Spider", 2, { hp: 46, mp: 0, atk: 14, def: 8, mat: 6, mdf: 6, agi: 15 }, ["bite", "venom"], 18, 6),
    m("big_kobold", "Big Kobold", 2, { hp: 60, mp: 0, atk: 13, def: 10, mat: 4, mdf: 5, agi: 10 }, ["attack", "smash"], 18, 14),
    m("ogre", "Ogre", 3, { hp: 121, mp: 0, atk: 23, def: 14, mat: 6, mdf: 8, agi: 8 }, ["attack", "smash"], 38, 26),
    m("orc_knight", "Orc Knight", 3, { hp: 104, mp: 0, atk: 21, def: 17, mat: 8, mdf: 10, agi: 10 }, ["attack", "smash"], 36, 28),
    m("orc_wizard", "Orc Wizard", 3, { hp: 77, mp: 0, atk: 12, def: 11, mat: 22, mdf: 16, agi: 11 }, ["attack", "firebolt", "curse"], 36, 30),
    m("mummy", "Mummy", 3, { hp: 109, mp: 0, atk: 19, def: 15, mat: 14, mdf: 14, agi: 7 }, ["attack", "curse"], 35, 24),
    m("wraith", "Wraith", 3, { hp: 84, mp: 0, atk: 18, def: 12, mat: 20, mdf: 18, agi: 14 }, ["attack", "drain"], 37, 22),
    m("troll", "Deep Troll", 3, { hp: 132, mp: 0, atk: 24, def: 13, mat: 6, mdf: 8, agi: 9 }, ["attack", "smash"], 40, 24),
    m("harpy", "Harpy", 3, { hp: 79, mp: 0, atk: 19, def: 11, mat: 10, mdf: 11, agi: 18 }, ["attack", "rend"], 34, 20),
    m("naga", "Naga", 3, { hp: 99, mp: 0, atk: 18, def: 13, mat: 18, mdf: 16, agi: 11 }, ["attack", "venom", "firebolt"], 37, 28),
    m("basilisk", "Basilisk", 3, { hp: 106, mp: 0, atk: 20, def: 16, mat: 16, mdf: 14, agi: 10 }, ["bite", "gaze"], 38, 22),
    m("bear", "Cave Bear", 3, { hp: 125, mp: 0, atk: 23, def: 13, mat: 4, mdf: 8, agi: 11 }, ["attack", "rend"], 36, 10),
    m("clay_golem", "Clay Golem", 3, { hp: 150, mp: 0, atk: 20, def: 20, mat: 4, mdf: 14, agi: 5 }, ["attack", "smash"], 40, 20),
    m("minotaur", "Minotaur", 4, { hp: 202, mp: 0, atk: 32, def: 19, mat: 8, mdf: 12, agi: 12 }, ["attack", "smash", "rend"], 66, 44),
    m("cyclops", "Cyclops", 4, { hp: 229, mp: 0, atk: 33, def: 20, mat: 8, mdf: 12, agi: 8 }, ["attack", "smash"], 68, 46),
    m("hill_giant", "Hill Giant", 4, { hp: 246, mp: 0, atk: 31, def: 18, mat: 6, mdf: 10, agi: 7 }, ["attack", "smash"], 66, 50),
    m("death_knight", "Death Knight", 4, { hp: 194, mp: 0, atk: 30, def: 24, mat: 22, mdf: 20, agi: 11 }, ["attack", "smash", "drain"], 72, 56),
    m("lich", "Lich", 4, { hp: 158, mp: 0, atk: 16, def: 16, mat: 34, mdf: 28, agi: 12 }, ["curse", "firebolt", "frost"], 74, 60),
    m("iron_golem", "Iron Golem", 4, { hp: 264, mp: 0, atk: 30, def: 30, mat: 6, mdf: 18, agi: 6 }, ["attack", "smash"], 70, 40),
    m("greater_naga", "Greater Naga", 4, { hp: 185, mp: 0, atk: 26, def: 20, mat: 28, mdf: 22, agi: 12 }, ["attack", "venom", "frost"], 70, 54),
    m("executioner", "Executioner", 4, { hp: 211, mp: 0, atk: 36, def: 18, mat: 14, mdf: 16, agi: 13 }, ["attack", "rend"], 72, 50),
    m("fire_giant", "Fire Giant", 4, { hp: 255, mp: 0, atk: 32, def: 21, mat: 26, mdf: 18, agi: 8 }, ["attack", "firebolt", "breath"], 76, 58),
    m("elf_knight", "Deep Elf Knight", 4, { hp: 176, mp: 0, atk: 29, def: 22, mat: 24, mdf: 22, agi: 15 }, ["attack", "rend", "frost"], 70, 60),
    m("orc_warlord", "Orc Warlord", 5, { hp: 340, mp: 0, atk: 19, def: 12, mat: 10, mdf: 10, agi: 11 }, ["attack", "smash", "rally"], 150, 120),
    m("hydra", "Five-Headed Hydra", 5, { hp: 900, mp: 0, atk: 30, def: 18, mat: 22, mdf: 16, agi: 10 }, ["bite", "rend", "breath"], 320, 240),
    m("bone_dragon", "Bone Dragon", 5, { hp: 1400, mp: 0, atk: 38, def: 24, mat: 32, mdf: 24, agi: 11 }, ["rend", "breath", "curse"], 520, 380),
    m("golden_dragon", "Golden Dragon", 5, { hp: 2100, mp: 0, atk: 46, def: 30, mat: 42, mdf: 32, agi: 13 }, ["rend", "breath", "smash"], 800, 600),
    m("ancient_lich", "Ancient Lich", 5, { hp: 2400, mp: 0, atk: 30, def: 28, mat: 56, mdf: 44, agi: 14 }, ["curse", "frost", "breath", "drain"], 1000, 800),
    m("mimic", "Mimic", 1, { hp: 40, mp: 0, atk: 11, def: 8, mat: 4, mdf: 6, agi: 9 }, ["bite", "smash"], 16, 30)
  ].map((x) => [x.id, x]));
  DEFAULT_BOSSES = ["orc_warlord", "hydra", "bone_dragon", "golden_dragon", "ancient_lich"];
  SKILLS = Object.fromEntries([
    sk("attack", "Attack", "foe", "phys", 1),
    sk("guard", "Guard", "self", "guard", 0),
    sk("strike", "Power Strike", "foe", "phys", 1.9, 0, 35),
    sk("cleave", "Cleave", "foes", "phys", 1.1, 0, 60),
    sk("stab", "Backstab", "foe", "phys", 1.4, 4, 0, { crit: 0.3 }),
    sk("fire", "Fire", "foe", "magic", 1.8, 5),
    sk("blizzard", "Blizzard", "foes", "magic", 1.2, 12),
    sk("smite", "Smite", "foe", "magic", 1.3, 4),
    sk("heal", "Heal", "ally", "heal", 1, 6),
    sk("holy", "Holy Light", "allies", "heal", 0.6, 12),
    sk("bite", "Bite", "foe", "phys", 1.1),
    sk("smash", "Smash", "foe", "phys", 1.6),
    sk("rend", "Rend", "foe", "phys", 1.35, 0, 0, { crit: 0.15 }),
    sk("acid", "Acid Splash", "foe", "magic", 1.2),
    sk("venom", "Venom", "foe", "magic", 1.3),
    sk("curse", "Curse", "foe", "magic", 1.4),
    sk("firebolt", "Firebolt", "foe", "magic", 1.6),
    sk("frost", "Frost Wave", "foes", "magic", 1),
    sk("breath", "Breath", "foes", "magic", 1.2),
    sk("gaze", "Petrifying Gaze", "foe", "magic", 1.5),
    sk("drain", "Drain", "foe", "magic", 1.1, 0, 0, { drain: 0.5 }),
    sk("mend", "Mend", "ally", "heal", 0.8),
    sk("rally", "War Cry", "allies", "heal", 0.35)
  ].map((x) => [x.id, x]));
  CLASSES = {
    adventurer: { hp: 72, mp: 22, atk: 13, def: 9, mat: 11, mdf: 9, agi: 11, skills: ["strike", "fire", "heal"] },
    fighter: { hp: 84, mp: 10, atk: 14, def: 11, mat: 5, mdf: 7, agi: 9, skills: ["strike", "cleave"] },
    mage: { hp: 52, mp: 42, atk: 7, def: 6, mat: 16, mdf: 12, agi: 10, skills: ["fire", "blizzard"] },
    healer: { hp: 60, mp: 38, atk: 8, def: 8, mat: 13, mdf: 13, agi: 9, skills: ["heal", "holy", "smite"] },
    rogue: { hp: 60, mp: 18, atk: 13, def: 8, mat: 8, mdf: 8, agi: 15, skills: ["stab", "strike"] }
  };
  CLASS_IDS = Object.keys(CLASSES);
  PARTY_SPRITES = {
    adventurer: ["pc_adventurer_1", "pc_adventurer_2", "pc_adventurer_3", "pc_adventurer_4"],
    fighter: ["pc_fighter_1", "pc_fighter_2", "pc_fighter_3", "pc_fighter_4"],
    mage: ["pc_mage_1", "pc_mage_2", "pc_mage_3", "pc_mage_4"],
    healer: ["pc_healer_1", "pc_healer_2", "pc_healer_3"],
    rogue: ["pc_rogue_1", "pc_rogue_2", "pc_rogue_3"]
  };
  BUILTIN_EVENTS = Object.fromEntries([
    ev("shrine", "A crumbling shrine glows faintly in an alcove.", [
      ch("pray", "Pray at the shrine", out({ heal: 40, mana: 30, text: "A gentle warmth washes over the party; wounds close." }), { chance: 65, fail: out({ hurt: 10, text: "The glow turns cold and bites at them." }) }),
      ch("leave", "Leave it be", out({ text: "The party leaves the shrine undisturbed." }))
    ]),
    ev("wounded_stranger", "A wounded adventurer sits slumped against the wall, clutching their side.", [
      ch("help", "Give them a potion", out({ bag: { potion: -1 }, gold: "15 + depth * 6", xp: 12, text: "The stranger thanks them and presses a pouch of coins into their hand." }), { when: "bag('potion') >= 1" }),
      ch("ask", "Ask what happened", out({ xp: 6, text: "The stranger warns them about what waits deeper down before limping away." })),
      ch("leave", "Walk past", out({ text: "They leave the stranger to fend for themselves." }))
    ]),
    ev("pool", "A still, dark pool shimmers with a faint blue light.", [
      ch("drink", "Drink from it", out({ mana: 100, heal: 15, text: "The water is cold and sweet; strength and focus return." }), { chance: 55, fail: out({ hurt: 14, text: "The water burns going down." }) }),
      ch("leave", "Don't risk it", out({ text: "They leave the pool alone." }))
    ]),
    ev("locked_chest", "An iron-bound chest sits in the middle of the room, its lock rusted shut.", [
      ch("force", "Force it open", out({ gold: "25 + depth * 12", bag: { potion: 1 }, text: "The lock gives; the chest is full of coin." }), { chance: 60, fail: out({ hurt: 12, text: "A hidden needle snaps out of the lock." }) }),
      ch("leave", "Leave it", out({ text: "They decide the chest isn't worth it." }))
    ]),
    ev("statue", "A statue of a forgotten hero stands here. Something seems to whisper from it.", [
      ch("listen", "Listen closely", out({ xp: "10 + depth * 4", text: "The whispers tell of old battles; the party learns from them." })),
      ch("leave", "Move on", out({ text: "They move on, unsettled." }))
    ]),
    ev("collapsed", "The tunnel ahead has partly collapsed; something glints under the rubble.", [
      ch("dig", "Dig through", out({ gold: "20 + depth * 10", text: "Under the rubble: a dead explorer's purse." }), { chance: 70, fail: out({ hurt: 10, text: "Loose rock tumbles down on them." }) }),
      ch("around", "Find a way around", out({ text: "They find another way through." }))
    ]),
    ev("ghost_merchant", "A translucent merchant beckons from behind a floating counter.", [
      ch("trade", "Buy two potions (30 gold)", out({ gold: -30, bag: { potion: 2 }, text: "The ghost hands over two potions with a hollow laugh." }), { cost: 30 }),
      ch("leave", "Decline", out({ text: "The merchant fades away." }))
    ], 2),
    ev("gambler", "A goblin with a crooked grin shakes a cup of dice. 'Twenty gold says you lose.'", [
      ch("bet", "Bet 20 gold", out({ gold: 40, text: "The dice fall their way; the goblin pays up, grumbling." }), { chance: 45, cost: 20, fail: out({ gold: -20, text: "The goblin cackles and pockets their coins." }) }),
      ch("leave", "Refuse", out({ text: "They ignore the goblin's jeers." }))
    ]),
    ev("ambush", "Voices ahead — a band of monsters is resting around the next corner.", [
      ch("sneak", "Sneak past", out({ xp: "8 + depth * 3", text: "They slip past unseen." }), { chance: 60, fail: out({ fight: "enemy", text: "A twig snaps. The monsters leap to their feet." }) }),
      ch("charge", "Charge them", out({ fight: "enemy", text: "They charge before the monsters can react." }))
    ]),
    ev("blood_altar", "A stone altar is stained dark. An inscription promises knowledge for blood.", [
      ch("offer", "Offer blood", out({ hurt: 15, xp: "20 + depth * 6", text: "Pain, then sudden clarity." })),
      ch("leave", "Step away", out({ text: "They back away from the altar." }))
    ], 3)
  ].map((x) => [x.id, x]));
  BUILTIN_ROMANCE = Object.fromEntries([
    ev("campfire", "The party makes a small fire in a quiet side chamber. {target} sits down close beside {{user}}.", [
      ch("talk", "Talk with {target}", out({ bond: 3, heal: 10, text: "They talk quietly by the fire; {target} opens up a little." })),
      ch("close", "Pull {target} closer", out({ bond: 2, desire: 4, text: "{target} doesn't pull away." }), { chance: "40 + rel_bond(target) / 2", fail: out({ bond: -1, text: "{target} stiffens and shifts away, awkward." }) }),
      ch("watch", "Keep watch so {target} can rest", out({ bond: 2, text: "{target} sleeps a while, trusting {{user}} to keep watch." }))
    ]),
    ev("close_call", "A ledge crumbles under {{user}}'s feet — {target} grabs their hand and hauls them back.", [
      ch("thank", "Thank {target}", out({ bond: 3, text: "{target} brushes it off, but holds on a moment longer than needed." })),
      ch("tease", "Tease {target} about it", out({ bond: 1, desire: 3, text: "{target} laughs, flustered." }), { chance: "50 + rel_bond(target) / 3", fail: out({ bond: -1, text: "{target} isn't in the mood for jokes." }) })
    ]),
    ev("wounds", "{target} is quietly nursing a cut from the last fight.", [
      ch("tend", "Tend {target}'s wound", out({ bond: 3, heal: 20, text: "{{user}} cleans and binds the cut; {target} watches them the whole time." })),
      ch("potion", "Give {target} a potion", out({ bond: 2, heal: 50, bag: { potion: -1 }, text: "{target} is touched by the gesture." }), { when: "bag('potion') >= 1" })
    ]),
    ev("confession", "In the dark between torches, {target} stops and says there's something they want to tell {{user}}.", [
      ch("listen", "Listen", out({ bond: 4, text: "{target} shares something they've never told anyone." })),
      ch("kiss", "Kiss {target}", out({ bond: 3, desire: 5, text: "{target} kisses back." }), { chance: "20 + rel_bond(target) * 0.8", fail: out({ bond: -2, text: "{target} turns away — it wasn't that." }) })
    ], 3)
  ].map((x) => [x.id, x]));
  SHOP = {
    potion: { name: "Potion", price: (d) => 12 + d * 3, sprite: "potion", desc: "Restores half of one ally's HP." },
    ether: { name: "Ether", price: (d) => 16 + d * 3, sprite: "ether", desc: "Restores half of one ally's MP." },
    bomb: { name: "Bomb", price: (d) => 20 + d * 4, sprite: "bomb", desc: "Hits every enemy." }
  };
});

// src/engine/dungeon/types.ts
var DEALT_KINDS, THEMES;
var init_types = __esm(() => {
  DEALT_KINDS = ["empty", "enemy", "elite", "treasure", "trap", "rest", "shop", "event", "surprise", "romance"];
  THEMES = ["cave", "crypt", "ruins", "hell", "lair"];
});

// src/engine/dungeon/defs.ts
function normOutcome(raw, where, c, known) {
  const r = isObj(raw) ? raw : typeof raw === "string" ? { text: raw } : {};
  const o = { effect: normEffect(Object.fromEntries(Object.entries(r).filter(([k]) => !OUTCOME_KEYS.has(k))), where, c, known) };
  if (typeof r.text === "string")
    o.text = r.text;
  for (const k of ["heal", "hurt", "mana", "bond", "desire", "xp"]) {
    if (r[k] !== undefined) {
      const x = k === "xp" ? c.expr(r[k], `${where} › ${k}`) : c.num(r[k], `${where} › ${k}`, 0);
      if (x !== undefined)
        o[k] = x;
    }
  }
  if (r.gold !== undefined) {
    const x = c.expr(r.gold, `${where} › gold`);
    if (x !== undefined)
      o.gold = x;
  }
  if (isObj(r.bag))
    o.bag = Object.fromEntries(Object.entries(r.bag).map(([k, v]) => [k, c.num(v, `${where} › bag › ${k}`, 1)]));
  if (typeof r.fight === "string")
    o.fight = r.fight;
  return o;
}
function normEvents(raw, where, c, known) {
  const out = {};
  for (const [id, e] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `${where} › ${id}`;
    if (!isObj(e) || typeof e.text !== "string") {
      c.warn(w, "needs `text:` and `choices:`");
      continue;
    }
    const choices = [];
    for (const [cid, chRaw] of Object.entries(isObj(e.choices) ? e.choices : {})) {
      const cw = `${w} › ${cid}`;
      const r = isObj(chRaw) ? chRaw : typeof chRaw === "string" ? { label: chRaw } : {};
      const successRaw = r.success ?? Object.fromEntries(Object.entries(r).filter(([k]) => !CHOICE_KEYS.has(k)));
      const chance = r.chance !== undefined ? c.expr(r.chance, `${cw} › chance`) : undefined;
      const when = r.when !== undefined ? c.expr(r.when, `${cw} › when`) : undefined;
      choices.push({
        id: cid,
        label: typeof r.label === "string" ? r.label : titleCase(cid),
        success: normOutcome(successRaw, `${cw} › success`, c, known),
        ...r.fail !== undefined ? { fail: normOutcome(r.fail, `${cw} › fail`, c, known) } : {},
        ...chance !== undefined ? { chance } : {},
        ...when !== undefined ? { when: String(when) } : {},
        ...r.cost !== undefined ? { cost: c.num(r.cost, `${cw} › cost`, 0) } : {}
      });
    }
    if (!choices.length) {
      c.warn(w, "needs at least one choice");
      continue;
    }
    out[id] = { id, text: e.text, choices, minDepth: c.num(e.min_depth, `${w} › min_depth`, 1), weight: Math.max(0, c.num(e.weight, `${w} › weight`, 1)) };
  }
  return out;
}
function normMonsters(raw, where, c) {
  const out = {};
  for (const [id, mRaw] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `${where} › ${id}`;
    if (!isObj(mRaw)) {
      c.warn(w, "expected a monster definition");
      continue;
    }
    const base = BESTIARY[typeof mRaw.like === "string" ? mRaw.like : id];
    const tier = Math.max(1, Math.min(5, Math.round(c.num(mRaw.tier, `${w} › tier`, base?.tier ?? 1))));
    const stat = (k, d) => Math.max(k === "hp" ? 1 : 0, c.num(mRaw[k], `${w} › ${k}`, base?.[k] ?? d));
    const skills = list(mRaw.skills).filter((s) => {
      if (SKILLS[s])
        return true;
      c.warn(`${w} › skills`, `"${s}" isn't a skill (${Object.keys(SKILLS).join(", ")})`);
      return false;
    });
    out[id] = {
      id,
      name: typeof mRaw.name === "string" ? mRaw.name : base?.name ?? titleCase(id),
      sprite: typeof mRaw.sprite === "string" ? mRaw.sprite : base?.sprite ?? "skull",
      tier,
      hp: stat("hp", 30 * tier),
      mp: 0,
      atk: stat("atk", 8 * tier),
      def: stat("def", 4 * tier),
      mat: stat("mat", 4 * tier),
      mdf: stat("mdf", 4 * tier),
      agi: stat("agi", 10),
      skills: skills.length ? skills : base?.skills ?? ["attack"],
      xp: c.num(mRaw.xp, `${w} › xp`, base?.xp ?? 8 * tier),
      gold: c.num(mRaw.gold, `${w} › gold`, base?.gold ?? 5 * tier)
    };
  }
  return out;
}
function normDungeons(raw, c, known) {
  const out = {};
  if (raw === undefined)
    return out;
  if (!isObj(raw)) {
    c.warn("Dungeons", "should be a map of dungeon names to definitions");
    return out;
  }
  for (const [id, dRaw] of Object.entries(raw)) {
    const w = `Dungeons › ${id}`;
    const r = isObj(dRaw) ? dRaw : typeof dRaw === "string" ? { name: dRaw } : {};
    const theme = THEMES.includes(r.theme) ? r.theme : "cave";
    if (r.theme !== undefined && !THEMES.includes(r.theme))
      c.warn(`${w} › theme`, `use one of ${THEMES.join(", ")}`);
    const tiles = { ...DEFAULT_TILES };
    if (isObj(r.tiles))
      for (const [k, v] of Object.entries(r.tiles)) {
        if (DEALT_KINDS.includes(k))
          tiles[k] = Math.max(0, c.num(v, `${w} › tiles › ${k}`, tiles[k]));
        else
          c.warn(`${w} › tiles › ${k}`, `tile kinds are ${DEALT_KINDS.join(", ")} (start, stairs and boss are placed for you)`);
      }
    const custom = normMonsters(r.monsters, `${w} › monsters`, c);
    const allowed = Array.isArray(r.bestiary) ? list(r.bestiary) : null;
    for (const b of allowed ?? [])
      if (!BESTIARY[b])
        c.warn(`${w} › bestiary`, `"${b}" isn't a built-in monster`);
    const monsters = {};
    for (const mon of Object.values(BESTIARY))
      if (!allowed || allowed.includes(mon.id) || mon.tier === 5 || mon.id === "mimic")
        monsters[mon.id] = mon;
    Object.assign(monsters, custom);
    const bosses = Array.isArray(r.bosses) ? list(r.bosses).filter((b) => {
      if (monsters[b])
        return true;
      c.warn(`${w} › bosses`, `"${b}" isn't a monster here`);
      return false;
    }) : DEFAULT_BOSSES;
    const events = { ...r.builtin_events === false ? {} : BUILTIN_EVENTS, ...normEvents(r.events, `${w} › events`, c, known) };
    const romance = { ...r.builtin_romance === false ? {} : BUILTIN_ROMANCE, ...normEvents(r.romance, `${w} › romance`, c, known) };
    const loot = [];
    if (isObj(r.loot))
      for (const [item, v] of Object.entries(r.loot)) {
        const lr = isObj(v) ? v : { weight: v };
        loot.push({ item, weight: Math.max(0, c.num(lr.weight, `${w} › loot › ${item}`, 1)), minDepth: c.num(lr.min_depth, `${w} › loot › ${item} › min_depth`, 1) });
      }
    const partyRaw = isObj(r.party) ? r.party : {};
    const classes = {};
    for (const [who, cls] of Object.entries(isObj(partyRaw.classes) ? partyRaw.classes : {})) {
      if (CLASS_IDS.includes(cls))
        classes[who] = cls;
      else
        c.warn(`${w} › party › classes › ${who}`, `classes are ${CLASS_IDS.join(", ")}`);
    }
    const partyWhen = partyRaw.when !== undefined ? c.expr(partyRaw.when, `${w} › party › when`) : undefined;
    const playerRaw = isObj(r.player) ? r.player : {};
    const player = { class: CLASS_IDS.includes(playerRaw.class) ? playerRaw.class : "adventurer" };
    for (const k of STAT_KEYS)
      if (playerRaw[k] !== undefined) {
        const x = c.expr(playerRaw[k], `${w} › player › ${k}`);
        if (x !== undefined)
          player[k] = x;
      }
    if (typeof playerRaw.sprite === "string")
      player.sprite = playerRaw.sprite;
    const when = r.when !== undefined ? c.expr(r.when, `${w} › when`) : undefined;
    out[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      ...typeof r.desc === "string" ? { desc: r.desc } : {},
      at: list(r.at ?? r.entrance),
      ...when !== undefined ? { when: String(when) } : {},
      theme,
      size: Math.max(3, Math.min(9, Math.round(c.num(r.size, `${w} › size`, 5)))),
      floors: Math.max(0, Math.round(c.num(r.floors ?? r.depth, `${w} › floors`, 0))),
      bossEvery: Math.max(0, Math.round(c.num(r.boss_every, `${w} › boss_every`, 5))),
      tiles,
      monsters,
      bosses: bosses.length ? bosses : DEFAULT_BOSSES,
      events,
      romance,
      loot,
      party: { max: Math.max(0, Math.min(3, Math.round(c.num(partyRaw.max, `${w} › party › max`, 3)))), ...partyWhen !== undefined ? { when: String(partyWhen) } : {}, classes },
      player,
      ...typeof r.currency === "string" ? { currency: r.currency } : {},
      onLeave: normEffect(r.on_leave, `${w} › on_leave`, c, known),
      onDefeat: normEffect(r.on_defeat, `${w} › on_defeat`, c, known),
      narrate: r.narrate === "all" ? "all" : "highlights"
    };
  }
  return out;
}
var DEFAULT_TILES, OUTCOME_KEYS, CHOICE_KEYS, STAT_KEYS;
var init_defs = __esm(() => {
  init_ruleset();
  init_content();
  init_types();
  DEFAULT_TILES = {
    empty: 7,
    enemy: 6,
    elite: 1,
    treasure: 2.5,
    trap: 1.5,
    rest: 1,
    shop: 0.6,
    event: 2,
    surprise: 1.5,
    romance: 1.2
  };
  OUTCOME_KEYS = new Set(["text", "heal", "hurt", "mana", "gold", "xp", "bag", "fight", "bond", "desire"]);
  CHOICE_KEYS = new Set(["label", "chance", "when", "cost", "fail", "success"]);
  STAT_KEYS = ["hp", "mp", "atk", "def", "mat", "mdf", "agi"];
});

// src/engine/ruleset.ts
function titleCase(id) {
  return id.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function slug(s) {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "x";
}
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

class Ctx2 {
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
  return {
    stats: {},
    set: {},
    flags: {},
    items: {},
    rel: {},
    addConditions: {},
    removeConditions: [],
    decide: [],
    foe: {},
    unlock: [],
    wear: [],
    undress: [],
    damage: {},
    front: {},
    reveal: []
  };
}
function normDecide(raw, where, c, known, minOptions = 2) {
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
    if (options.length < minOptions) {
      c.warn(w, minOptions > 1 ? "decide needs at least two options" : "needs at least one option");
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
      case "foe":
        if (isObj(v))
          for (const [s, d] of Object.entries(v)) {
            const x = c.expr(d, `${w} › ${s}`);
            if (x !== undefined)
              e.foe[s] = x;
          }
        else
          c.warn(w, "expected foe stat changes like `hp: -8`");
        break;
      case "end":
      case "end_encounter":
        e.end = v === true ? "ended" : String(v);
        break;
      case "start_encounter":
      case "encounter":
        e.startEncounter = String(v);
        break;
      case "unlock":
      case "codex":
        e.unlock.push(...list(v));
        break;
      case "wear":
      case "put_on":
        e.wear.push(...list(v));
        break;
      case "undress":
      case "take_off":
        e.undress.push(...list(v));
        break;
      case "damage":
        if (isObj(v))
          for (const [slot, d] of Object.entries(v)) {
            const x = c.expr(d, `${w} › ${slot}`);
            if (x !== undefined)
              e.damage[slot] = x;
          }
        else
          c.warn(w, "expected clothing damage by slot, like `top: 30`");
        break;
      case "front":
      case "fronts":
        if (isObj(v))
          for (const [id, d] of Object.entries(v)) {
            const x = c.expr(d, `${w} › ${id}`);
            if (x !== undefined)
              e.front[id] = x;
          }
        else
          c.warn(w, "expected clock changes like `gangs: -20`");
        break;
      case "reveal":
        e.reveal.push(...list(v));
        break;
      case "gauge":
      case "events_gauge": {
        const x = c.expr(v, w);
        if (x !== undefined)
          e.gauge = x;
        break;
      }
      default:
        if (known.stats.has(k)) {
          const x = c.expr(v, w);
          if (x !== undefined)
            e.stats[k] = x;
        } else
          c.warn(w, `"${k}" isn't a stat or a known effect (stats, set, flags, give, take, rel, move, time, add_condition, remove_condition, hint, decide, foe, end, start_encounter, unlock, wear, undress, damage, front, reveal, gauge)`);
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
    order: typeof raw.order === "number" ? raw.order : order,
    perPerson: raw.per_person === true || raw.with === "person" || raw.with === "people"
  };
}
function parseDate(v) {
  if (isObj(v)) {
    const m = Number(v.month), d = Number(v.day);
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { month: m, day: d } : null;
  }
  if (typeof v !== "string")
    return null;
  const s = v.trim().toLowerCase();
  const a = /^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?$/.exec(s);
  const b = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,})\.?$/.exec(s);
  const name = a?.[1] ?? b?.[2];
  const day = Number(a?.[2] ?? b?.[1]);
  const month = name ? MONTHS.indexOf(name.slice(0, 3)) + 1 : 0;
  return month >= 1 && day >= 1 && day <= 31 ? { month, day } : null;
}
function normWeather(raw, c) {
  const def = {
    enabled: false,
    kinds: DEFAULT_WEATHER,
    seasonTemps: { spring: 12, summer: 22, autumn: 11, winter: 3 },
    seasons: { spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11], winter: [12, 1, 2] },
    swing: 5,
    changeHours: 6,
    indoorTemp: 20
  };
  if (raw === undefined || raw === false)
    return def;
  def.enabled = true;
  if (!isObj(raw))
    return def;
  if (isObj(raw.kinds)) {
    const kinds = [];
    for (const [id, k] of Object.entries(raw.kinds)) {
      const r = isObj(k) ? k : {};
      const w = `Weather › kinds › ${id}`;
      kinds.push({
        id,
        label: typeof r.label === "string" ? r.label : titleCase(id),
        icon: typeof r.icon === "string" ? r.icon : "",
        weight: Math.max(0, c.num(r.weight, `${w} › weight`, 1)),
        temp: c.num(r.temp, `${w} › temp`, 0),
        seasons: r.seasons === undefined ? null : list(r.seasons),
        tags: list(r.tags)
      });
    }
    if (kinds.length)
      def.kinds = kinds;
  }
  if (isObj(raw.temps))
    for (const [s, t] of Object.entries(raw.temps))
      def.seasonTemps[s] = c.num(t, `Weather › temps › ${s}`, 10);
  if (isObj(raw.seasons)) {
    def.seasons = {};
    for (const [s, m] of Object.entries(raw.seasons))
      def.seasons[s] = (Array.isArray(m) ? m : [m]).map(Number).filter((n) => n >= 1 && n <= 12);
  }
  def.swing = c.num(raw.swing, "Weather › swing", def.swing);
  def.changeHours = Math.max(1, c.num(raw.change_hours ?? raw.changes_every, "Weather › change_hours", def.changeHours));
  def.indoorTemp = c.num(raw.indoors ?? raw.indoor_temp, "Weather › indoors", def.indoorTemp);
  return def;
}
function normWardrobe(raw, items, c) {
  const clothing = Object.values(items).some((i) => i.slot);
  const def = { enabled: clothing, slots: [], cover: ["top", "bottom"], startWorn: [], narrator: true };
  const r = isObj(raw) ? raw : {};
  if (raw === false)
    def.enabled = false;
  if (isObj(raw))
    def.enabled = true;
  const slotIds = Array.isArray(r.slots) ? r.slots.map(String) : DEFAULT_SLOTS;
  def.slots = slotIds.map((id) => ({ id, label: titleCase(id) }));
  if (Array.isArray(r.cover))
    def.cover = r.cover.map(String);
  def.startWorn = list(r.start ?? r.worn);
  def.narrator = r.narrator !== false;
  for (const it of Object.values(items)) {
    if (it.slot && !slotIds.includes(it.slot))
      c.warn(`Items › ${it.id} › slot`, `"${it.slot}" isn't a wardrobe slot (${slotIds.join(", ")})`);
  }
  return def;
}
function normEncounter(id, raw, c, known) {
  const w = `Encounters › ${id}`;
  if (!isObj(raw)) {
    c.warn(w, "expected an encounter definition");
    return null;
  }
  const foeRaw = isObj(raw.foe) ? raw.foe : {};
  const stats = [];
  for (const [sid, s] of Object.entries(isObj(foeRaw.stats) ? foeRaw.stats : {})) {
    const r = isObj(s) ? s : { start: s };
    const start = c.num(r.start, `${w} › foe › ${sid}`, 10);
    const goodRaw = String(r.good ?? "low").toLowerCase();
    stats.push({
      id: sid,
      label: typeof r.label === "string" ? r.label : titleCase(sid),
      start,
      max: c.num(r.max, `${w} › foe › ${sid} › max`, Math.max(start, 1)),
      good: goodRaw === "high" ? "high" : goodRaw === "none" ? "none" : "low"
    });
  }
  const actions = {};
  const actionOrder = [];
  let i = 0;
  for (const [aid, a] of Object.entries(isObj(raw.actions) ? raw.actions : {})) {
    const def = normAction(aid, a, `${w} › actions › ${aid}`, c, known, i++);
    if (def) {
      actions[aid] = def;
      actionOrder.push(aid);
    }
  }
  if (!actionOrder.length)
    c.warn(w, "has no player `actions:` — the player can't do anything during it");
  let foeMoves = null;
  const movesRaw = raw.foe_moves ?? raw.moves;
  if (isObj(movesRaw)) {
    const specs = normDecide({ ask: typeof raw.foe_ask === "string" ? raw.foe_ask : `What does ${typeof foeRaw.name === "string" ? foeRaw.name : "the opponent"} do next?`, options: movesRaw }, `${w} › foe_moves`, c, known, 1);
    foeMoves = specs[0] ? { ...specs[0], id: `enc_${id}_foe` } : null;
  }
  const endWhen = [];
  for (const [outcome, when] of Object.entries(isObj(raw.end_when) ? raw.end_when : {})) {
    const x = c.expr(when, `${w} › end_when › ${outcome}`);
    if (x !== undefined)
      endWhen.push({ outcome, when: String(x) });
  }
  const outcomes = {};
  for (const [o, e] of Object.entries(isObj(raw.outcomes) ? raw.outcomes : {}))
    outcomes[o] = normEffect(e, `${w} › outcomes › ${o}`, c, known);
  const startRaw = raw.start ?? (typeof raw.start_hint === "string" ? { hint: raw.start_hint } : undefined);
  return {
    id,
    name: typeof raw.name === "string" ? raw.name : titleCase(id),
    desc: typeof raw.desc === "string" ? raw.desc : undefined,
    tags: list(raw.tags).map((t) => t.toLowerCase()),
    foe: { name: typeof foeRaw.name === "string" ? foeRaw.name : "Opponent", stats },
    actions,
    actionOrder,
    foeMoves,
    endWhen,
    outcomes,
    start: normEffect(startRaw, `${w} › start`, c, known)
  };
}
function normSecrets(raw, c) {
  const out = {};
  if (raw === undefined)
    return out;
  if (!isObj(raw)) {
    c.warn("Secrets", "should be a map of secret names to definitions");
    return out;
  }
  for (const [id, sRaw] of Object.entries(raw)) {
    const w = `Secrets › ${id}`;
    const r = isObj(sRaw) ? sRaw : typeof sRaw === "string" ? { stages: [sRaw] } : {};
    const stages = [];
    if (typeof r.cue === "string")
      stages.push({ text: r.cue, lore: [] });
    const stageList = Array.isArray(r.stages) ? r.stages : typeof r.text === "string" ? [{ text: r.text, when: r.when, lore: r.lore }] : [];
    stageList.forEach((st, i) => {
      const sw = `${w} › stage ${i + 1}`;
      const sr = isObj(st) ? st : typeof st === "string" ? { text: st } : {};
      if (typeof sr.text !== "string" || !sr.text.trim()) {
        c.warn(sw, "each stage needs `text:`");
        return;
      }
      const when = sr.when !== undefined ? c.expr(sr.when, `${sw} › when`) : undefined;
      stages.push({ text: sr.text, lore: list(sr.lore), ...when !== undefined ? { when: String(when) } : {} });
    });
    if (!stages.length) {
      c.warn(w, "has no stages — add `cue:` and/or `stages:`");
      continue;
    }
    const tell = r.tell === true || r.tell === "exists" ? "exists" : "none";
    out[id] = { id, about: typeof r.about === "string" ? r.about : titleCase(id), tell, stages };
  }
  return out;
}
function normFronts(raw, c, known) {
  const out = {};
  if (raw === undefined)
    return out;
  if (!isObj(raw)) {
    c.warn("Fronts", "should be a map of front names to definitions");
    return out;
  }
  for (const [id, fRaw] of Object.entries(raw)) {
    const w = `Fronts › ${id}`;
    if (!isObj(fRaw)) {
      c.warn(w, "expected a front definition with `per_day:` and `stages:`");
      continue;
    }
    const max = Math.max(1, c.num(fRaw.max, `${w} › max`, 100));
    const start = Math.max(0, Math.min(max, c.num(fRaw.start, `${w} › start`, 0)));
    const rate = c.expr(fRaw.per_day ?? fRaw.rate ?? 0, `${w} › per_day`) ?? 0;
    const perTurn = c.expr(fRaw.per_turn ?? 0, `${w} › per_turn`) ?? 0;
    const when = fRaw.when !== undefined ? c.expr(fRaw.when, `${w} › when`) : undefined;
    const raws = [];
    (Array.isArray(fRaw.stages) ? fRaw.stages : []).forEach((st, i) => {
      if (!isObj(st)) {
        c.warn(`${w} › stage ${i + 1}`, "each stage needs `at:` and a `surface:`");
        return;
      }
      raws.push(st);
    });
    raws.sort((a, b) => Number(a.at) - Number(b.at));
    const stages = [];
    let prev = start;
    raws.forEach((st, i) => {
      const sw = `${w} › stage ${i + 1}`;
      const at = c.num(st.at, `${sw} › at`, NaN);
      if (!Number.isFinite(at)) {
        c.warn(sw, "needs a numeric `at:` (the clock value where it surfaces)");
        return;
      }
      if (at > max)
        c.warn(sw, `at ${at} is above the clock's max (${max}) — it can never surface`);
      const str = (k) => typeof st[k] === "string" && st[k].trim() ? st[k] : undefined;
      stages.push({
        at,
        hintAt: st.hint_at !== undefined ? c.num(st.hint_at, `${sw} › hint_at`, at) : prev + (at - prev) / 2,
        hint: str("hint"),
        backstage: str("backstage"),
        surface: str("surface"),
        news: str("news"),
        effects: normEffect(st.do ?? st.effects, `${sw} › do`, c, known)
      });
      prev = at;
    });
    if (!stages.length)
      c.warn(w, "has no stages — nothing will ever surface");
    const pushes = [];
    const story = fRaw.story ?? fRaw.pushed_by;
    if (isObj(story))
      for (const [scene, n] of Object.entries(story))
        pushes.push({ scene, add: c.num(n, `${w} › story › ${scene}`, 0) });
    else if (Array.isArray(story))
      story.forEach((p, i) => {
        if (isObj(p) && typeof (p.if ?? p.when_scene) === "string")
          pushes.push({ scene: String(p.if ?? p.when_scene), add: c.num(p.add, `${w} › story #${i + 1}`, 0) });
        else
          c.warn(`${w} › story #${i + 1}`, 'expected `{ if: "plain-language event", add: 10 }`');
      });
    out[id] = {
      id,
      label: typeof fRaw.label === "string" ? fRaw.label : titleCase(id),
      rate,
      perTurn,
      max,
      start,
      stages,
      pushes,
      ...when !== undefined ? { when: String(when) } : {}
    };
  }
  return out;
}
function normRandomEvents(raw, c, known) {
  const def = { enabled: false, perDay: 25, perTurn: 0, jitter: 0.3, restDays: 1, omenAt: 80, events: {} };
  if (raw === undefined || raw === false)
    return def;
  if (!isObj(raw)) {
    c.warn("Random events", "should be a map with `events:`");
    return def;
  }
  const pace = isObj(raw.pace) ? raw.pace : raw;
  def.perDay = c.expr(pace.per_day ?? def.perDay, "Random events › per_day") ?? def.perDay;
  def.perTurn = c.expr(pace.per_turn ?? 0, "Random events › per_turn") ?? 0;
  def.jitter = Math.max(0, Math.min(0.9, c.num(pace.jitter, "Random events › jitter", def.jitter)));
  def.restDays = Math.max(0, c.num(pace.rest_days ?? pace.cooldown, "Random events › rest_days", def.restDays));
  def.omenAt = Math.max(0, Math.min(99, c.num(pace.omen_at, "Random events › omen_at", def.omenAt)));
  const evRaw = isObj(raw.events) ? raw.events : isObj(raw.list) ? raw.list : {};
  for (const [id, e] of Object.entries(evRaw)) {
    const w = `Random events › ${id}`;
    const r = isObj(e) ? e : typeof e === "string" ? { text: e } : {};
    if (typeof r.text !== "string" || !r.text.trim()) {
      c.warn(w, "needs `text:` — what happens, for the narrator");
      continue;
    }
    const when = r.when !== undefined ? c.expr(r.when, `${w} › when`) : undefined;
    def.events[id] = {
      id,
      label: typeof r.label === "string" ? r.label : titleCase(id),
      weight: Math.max(0, c.num(r.weight, `${w} › weight`, 1)),
      cooldownDays: Math.max(0, c.num(r.cooldown, `${w} › cooldown`, 3)),
      text: r.text,
      ...typeof r.omen === "string" && r.omen.trim() ? { omen: r.omen } : {},
      ...typeof r.news === "string" ? { news: r.news } : {},
      ...when !== undefined ? { when: String(when) } : {},
      effects: normEffect(r.do ?? r.effects, `${w} › do`, c, known)
    };
  }
  def.enabled = Object.keys(def.events).length > 0;
  if (!def.enabled)
    c.warn("Random events", "has no events — add some under `events:`");
  return def;
}
function normLiveChoices(raw, c, known) {
  const def = { enabled: false, label: "Right now", count: 3, tags: {} };
  if (raw === undefined || raw === false)
    return def;
  if (!isObj(raw)) {
    c.warn("Live choices", "should be a map with `tags:`");
    return def;
  }
  def.label = typeof raw.label === "string" ? raw.label : def.label;
  def.count = Math.max(1, Math.min(6, Math.round(c.num(raw.count, "Live choices › count", def.count))));
  if (raw.when !== undefined) {
    const x = c.expr(raw.when, "Live choices › when");
    if (x !== undefined)
      def.when = String(x);
  }
  if (typeof raw.guide === "string")
    def.guide = raw.guide;
  let i = 0;
  for (const [id, t] of Object.entries(isObj(raw.tags) ? raw.tags : {})) {
    const a = normAction(id, typeof t === "string" ? { desc: t } : t, `Live choices › tags › ${id}`, c, known, i++);
    if (!a)
      continue;
    if (!a.desc)
      c.warn(`Live choices › tags › ${id}`, "add `desc:` — it tells the writer when to use this tag");
    def.tags[id] = a;
  }
  def.enabled = Object.keys(def.tags).length > 0;
  if (!def.enabled)
    c.warn("Live choices", "has no tags — add some under `tags:`");
  return def;
}
function normalizeRuleset(raw) {
  const c = new Ctx2;
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
    const schedule = [];
    const sched = r.schedule ?? r.routine;
    const schedList = Array.isArray(sched) ? sched : typeof sched === "string" ? [{ at: sched }] : isObj(sched) ? Object.entries(sched).map(([at, when]) => ({ at, when })) : [];
    schedList.forEach((e, n) => {
      const sw = `Relationships › people › ${id} › schedule #${n + 1}`;
      if (!isObj(e) || typeof e.at !== "string") {
        c.warn(sw, "each schedule entry needs `at:` (a location) and optionally `when:`");
        return;
      }
      const when = e.when === undefined || e.when === true ? undefined : c.expr(e.when, `${sw} › when`);
      schedule.push({ at: e.at, ...when !== undefined ? { when: String(when) } : {} });
    });
    people[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      age: r.age !== undefined ? c.num(r.age, `Relationships › people › ${id} › age`, 0) : undefined,
      start,
      desc: typeof r.desc === "string" ? r.desc : undefined,
      schedule,
      traits: list(r.traits)
    };
  }
  const invRaw = isObj(raw.inventory) ? raw.inventory : {};
  const items = {};
  for (const [id, it] of Object.entries(isObj(raw.items) ? raw.items : isObj(invRaw.items) ? invRaw.items : {})) {
    const r = isObj(it) ? it : typeof it === "string" ? { name: it } : {};
    const w = `Items › ${id}`;
    items[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      desc: r.desc,
      tags: list(r.tags),
      ...typeof r.slot === "string" ? { slot: r.slot } : {},
      warmth: c.num(r.warmth, `${w} › warmth`, 0),
      integrity: Math.max(1, c.num(r.integrity, `${w} › integrity`, 100)),
      reveal: c.num(r.reveal, `${w} › reveal`, 0),
      traits: list(r.traits).map((t) => t.toLowerCase())
    };
  }
  const locations = {};
  for (const [id, l] of Object.entries(isObj(raw.locations) ? raw.locations : {})) {
    const r = isObj(l) ? l : typeof l === "string" ? { name: l } : {};
    locations[id] = {
      id,
      name: typeof r.name === "string" ? r.name : titleCase(id),
      desc: typeof r.desc === "string" ? r.desc : undefined,
      exits: Array.isArray(r.exits) ? r.exits.map(String) : [],
      travel: c.num(r.travel, `Locations › ${id} › travel`, 10),
      indoors: r.indoors === true || r.inside === true,
      ...Array.isArray(r.pos) && r.pos.length === 2 && r.pos.every((n) => Number.isFinite(Number(n))) ? { pos: [Number(r.pos[0]), Number(r.pos[1])] } : {}
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
  const dateRaw = clockRaw.date ?? clockRaw.start_date ?? startRaw.date;
  const startDate = dateRaw === undefined ? null : parseDate(dateRaw);
  if (dateRaw !== undefined && !startDate)
    c.warn("Clock › date", `"${dateRaw}" should look like "Sep 4"`);
  const worldRaw = { weather: raw.weather, wardrobe: raw.wardrobe };
  const weather = normWeather(worldRaw.weather, c);
  const wardrobe = normWardrobe(worldRaw.wardrobe, items, c);
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
  const encounters = {};
  for (const [id, e] of Object.entries(isObj(raw.encounters) ? raw.encounters : {})) {
    const def = normEncounter(id, e, c, known);
    if (def)
      encounters[id] = def;
  }
  const codex = {};
  for (const [id, e] of Object.entries(isObj(raw.codex) ? raw.codex : {})) {
    const w = `Codex › ${id}`;
    const r = isObj(e) ? e : typeof e === "string" ? { text: e } : {};
    const unlock = r.unlock !== undefined ? c.expr(r.unlock, `${w} › unlock`) : undefined;
    codex[id] = {
      id,
      title: typeof r.title === "string" ? r.title : titleCase(id),
      text: typeof r.text === "string" ? r.text : "",
      ...typeof r.category === "string" ? { category: r.category } : {},
      ...unlock !== undefined ? { unlock: String(unlock) } : {},
      lore: list(r.lore)
    };
  }
  const feats = {};
  for (const [id, f] of Object.entries(isObj(raw.feats) ? raw.feats : {})) {
    const w = `Feats › ${id}`;
    if (!isObj(f)) {
      c.warn(w, "a feat needs `unlock:` (a formula)");
      continue;
    }
    const unlock = c.expr(f.unlock ?? f.when, `${w} › unlock`);
    if (unlock === undefined) {
      c.warn(w, "a feat needs `unlock:` (a formula)");
      continue;
    }
    feats[id] = {
      id,
      name: typeof f.name === "string" ? f.name : titleCase(id),
      desc: typeof f.desc === "string" ? f.desc : "",
      unlock: String(unlock),
      reward: normEffect(f.reward, `${w} › reward`, c, known),
      hidden: f.hidden === true
    };
  }
  const perksRaw = isObj(raw.perks) ? raw.perks : {};
  const perkList = isObj(perksRaw.list) ? perksRaw.list : Object.fromEntries(Object.entries(perksRaw).filter(([k]) => k !== "points"));
  const perks = {};
  for (const [id, p] of Object.entries(perkList)) {
    const w = `Perks › ${id}`;
    if (!isObj(p)) {
      c.warn(w, "expected a perk definition");
      continue;
    }
    const req = p.requires !== undefined ? c.expr(p.requires, `${w} › requires`) : undefined;
    perks[id] = {
      id,
      name: typeof p.name === "string" ? p.name : titleCase(id),
      desc: typeof p.desc === "string" ? p.desc : "",
      cost: c.num(p.cost, `${w} › cost`, 1),
      ...req !== undefined ? { requires: String(req) } : {},
      effects: normEffect(p.effects, `${w} › effects`, c, known)
    };
  }
  const perkPoints = typeof perksRaw.points === "string" ? perksRaw.points : undefined;
  if (perkPoints && !stats[perkPoints])
    c.warn("Perks › points", `"${perkPoints}" isn't a declared stat`);
  const secrets = normSecrets(raw.secrets, c);
  const fronts = normFronts(raw.fronts, c, known);
  const randomEvents = normRandomEvents(raw.random_events ?? raw.events, c, known);
  const liveChoices = normLiveChoices(raw.live_choices, c, known);
  const dungeons = normDungeons(raw.dungeons, c, known);
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
      weekdays,
      startDate
    },
    hud: { bars, money: moneyStat && stats[moneyStat] ? moneyStat : undefined, currency: typeof hudRaw.currency === "string" ? hudRaw.currency : "$" },
    narration: { notes: typeof narrRaw.notes === "string" ? narrRaw.notes : undefined, numbers: narrRaw.numbers === true },
    weather,
    wardrobe,
    encounters,
    codex,
    feats,
    perks,
    ...perkPoints && stats[perkPoints] ? { perkPoints } : {},
    secrets,
    fronts,
    randomEvents,
    liveChoices,
    dungeons
  };
  for (const p of Object.values(people))
    for (const e of p.schedule) {
      if (Object.keys(locations).length && !locations[e.at])
        c.warn(`Relationships › people › ${p.id} › schedule`, `"${e.at}" isn't a declared location`);
    }
  for (const id of wardrobe.startWorn) {
    if (!items[id]?.slot)
      c.warn("Wardrobe › start", `"${id}" isn't a declared clothing item (items need a \`slot:\`)`);
    else if (!(startItems[id] > 0))
      startItems[id] = 1;
  }
  const minors = [
    ...ruleset.player.age !== undefined && ruleset.player.age < 18 ? ["the player"] : [],
    ...Object.values(people).filter((p) => p.age !== undefined && p.age < 18).map((p) => p.name)
  ];
  const sexualActions = [
    ...Object.values(actions),
    ...Object.values(encounters).flatMap((e) => Object.values(e.actions).map((a) => ({ ...a, tags: [...a.tags, ...e.tags] }))),
    ...Object.values(liveChoices.tags)
  ].filter((a) => a.tags.some((t) => SEXUAL_TAGS.has(t)));
  if (minors.length && sexualActions.length) {
    c.err("Ruleset", `declares characters under 18 (${minors.join(", ")}) alongside sexual actions — Warp won't run this ruleset`);
    return { ruleset: null, issues: c.issues };
  }
  return { ruleset, issues: c.issues };
}
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v), DEFAULT_WEEKDAYS, KIND_ALIASES, list = (v) => Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [], TIER_KEYS, MONTHS, DEFAULT_WEATHER, DEFAULT_SLOTS, SEXUAL_TAGS;
var init_ruleset = __esm(() => {
  init_expr();
  init_dice();
  init_defs();
  DEFAULT_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  KIND_ALIASES = {
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
  TIER_KEYS = {
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
  MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  DEFAULT_WEATHER = [
    { id: "clear", label: "Clear", icon: "☀️", weight: 4, temp: 1, seasons: null, tags: [] },
    { id: "cloudy", label: "Overcast", icon: "☁️", weight: 3, temp: -1, seasons: null, tags: [] },
    { id: "rain", label: "Rain", icon: "\uD83C\uDF27️", weight: 2, temp: -3, seasons: null, tags: ["wet"] },
    { id: "storm", label: "Storm", icon: "⛈️", weight: 1, temp: -4, seasons: ["summer", "autumn"], tags: ["wet", "windy"] },
    { id: "snow", label: "Snow", icon: "❄️", weight: 2, temp: -6, seasons: ["winter"], tags: ["wet", "cold"] }
  ];
  DEFAULT_SLOTS = ["head", "outer", "top", "bottom", "under_top", "under_bottom", "legs", "feet"];
  SEXUAL_TAGS = new Set(["sexual", "sex", "nsfw", "lewd", "explicit", "erotic", "smut"]);
});

// src/engine/world.ts
function ordinal(n) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}
function dateAt(r, minutes) {
  const start = r.clock.startDate;
  if (!start)
    return null;
  let month = start.month - 1;
  const elapsed = Math.floor(minutes / 1440) - Math.floor(r.clock.start / 1440);
  let day = start.day - 1 + Math.max(0, elapsed);
  while (day >= MONTH_DAYS[month]) {
    day -= MONTH_DAYS[month];
    month = (month + 1) % 12;
  }
  return { month: month + 1, day: day + 1, monthName: MONTH_NAMES[month] };
}
function seasonAt(r, minutes) {
  const d = dateAt(r, minutes);
  if (!d)
    return null;
  for (const [season, months] of Object.entries(r.weather.seasons))
    if (months.includes(d.month))
      return season;
  return null;
}
function weatherAt(r, s) {
  if (!r.weather.enabled || !r.weather.kinds.length)
    return null;
  const season = seasonAt(r, s.minutes);
  const pool = r.weather.kinds.filter((k) => !k.seasons || season !== null && k.seasons.includes(season));
  const kinds = pool.length ? pool : r.weather.kinds;
  const block = Math.floor(s.minutes / (r.weather.changeHours * 60));
  const rng = seededRng(`${s.seed ?? "world"}:weather:${block}`);
  const total = kinds.reduce((a, k) => a + k.weight, 0) || 1;
  let x = rng() * total;
  for (const k of kinds) {
    x -= k.weight;
    if (x <= 0)
      return k;
  }
  return kinds[kinds.length - 1];
}
function isIndoors(r, s) {
  return !!(s.location && r.locations[s.location]?.indoors);
}
function temperatureAt(r, s) {
  if (!r.weather.enabled)
    return null;
  if (isIndoors(r, s))
    return r.weather.indoorTemp;
  const season = seasonAt(r, s.minutes);
  const base = season !== null ? r.weather.seasonTemps[season] ?? 12 : 14;
  const hour = s.minutes % 1440 / 60;
  const swing = r.weather.swing * Math.cos((hour - 15) / 24 * 2 * Math.PI);
  const w = weatherAt(r, s);
  return Math.round((base + swing + (w?.temp ?? 0)) * 10) / 10;
}
function wornItems(r, s) {
  return Object.values(s.worn).filter((id) => !!id);
}
function warmthOf(r, s) {
  let total = 0;
  for (const id of wornItems(r, s)) {
    const def = r.items[id];
    if (!def)
      continue;
    const health = (s.integrity[id] ?? def.integrity) / def.integrity;
    total += def.warmth * Math.max(0, Math.min(1, health));
  }
  return Math.round(total * 10) / 10;
}
function warmthNeeded(temp) {
  const ideal = Math.max(0, Math.round((20 - temp) * 0.9));
  return { min: Math.max(0, ideal - 6), max: ideal + 12 };
}
function revealOf(r, s) {
  return wornItems(r, s).reduce((a, id) => a + (r.items[id]?.reveal ?? 0), 0);
}
function exposedSlots(r, s) {
  if (!r.wardrobe.enabled)
    return [];
  return r.wardrobe.cover.filter((slot) => !s.worn[slot]);
}
function hasTrait(r, s, trait) {
  const t = trait.toLowerCase();
  return wornItems(r, s).some((id) => r.items[id]?.traits.includes(t));
}
function personLocation(r, s, id, env) {
  const p = r.people[id];
  if (!p?.schedule.length)
    return null;
  for (const e of p.schedule)
    if (e.when === undefined || evalBool(e.when, env, false))
      return e.at;
  return null;
}
function presentPeople(r, s, env) {
  if (!s.location)
    return [];
  return Object.keys(r.people).filter((id) => !s.forgotten[id] && personLocation(r, s, id, env) === s.location);
}
var MONTH_NAMES, MONTH_DAYS;
var init_world = __esm(() => {
  init_dice();
  init_expr();
  MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
});

// src/engine/state.ts
function timeKey(r, s) {
  return r.clock.enabled ? s.minutes : s.turn;
}
function initialState(r) {
  const s = {
    seed: null,
    worn: {},
    integrity: {},
    encounter: null,
    codex: {},
    feats: {},
    perks: {},
    calibrated: {},
    forgotten: {},
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
    turn: 0,
    secrets: {},
    fronts: {},
    gauge: { v: 0, rest: 0, next: null, last: {} },
    notices: [],
    news: [],
    dungeon: null,
    deepest: {}
  };
  for (const id of r.statOrder)
    s.stats[id] = r.stats[id].start;
  for (const sec of Object.values(r.secrets)) {
    let open = -1;
    while (open + 1 < sec.stages.length && !sec.stages[open + 1].when)
      open++;
    s.secrets[sec.id] = open;
  }
  for (const f of Object.values(r.fronts))
    s.fronts[f.id] = { v: f.start, stage: -1 };
  for (const f of Object.values(r.flags))
    s.flags[f.id] = f.start;
  for (const p of Object.values(r.people)) {
    s.people[p.id] = { name: p.name };
    s.rel[p.id] = {};
    for (const rs of r.relStatOrder)
      s.rel[p.id][rs] = p.start[rs] ?? r.relStats[rs].start;
    if (Object.keys(p.start).length)
      s.calibrated[p.id] = true;
  }
  for (const id of r.wardrobe.startWorn) {
    const slot = r.items[id]?.slot;
    if (slot)
      s.worn[slot] = id;
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
      if (n <= 0) {
        delete s.items[e.id];
        for (const [slot, id] of Object.entries(s.worn))
          if (id === e.id)
            delete s.worn[slot];
        delete s.integrity[e.id];
      } else
        s.items[e.id] = n;
      if (e.name && !r.items[e.id])
        s.itemNames[e.id] = e.name;
      break;
    }
    case "seed":
      if (!s.seed)
        s.seed = e.v;
      break;
    case "wear":
      if (e.item) {
        if (!(s.items[e.item] > 0))
          s.items[e.item] = 1;
        for (const [slot, id] of Object.entries(s.worn))
          if (id === e.item)
            delete s.worn[slot];
        s.worn[e.slot] = e.item;
      } else
        delete s.worn[e.slot];
      break;
    case "dmg": {
      const def = r.items[e.item];
      const max = def?.integrity ?? 100;
      const next = Math.min(max, (s.integrity[e.item] ?? max) + e.d);
      if (next <= 0) {
        delete s.integrity[e.item];
        for (const [slot, id] of Object.entries(s.worn))
          if (id === e.item)
            delete s.worn[slot];
        const n = (s.items[e.item] ?? 1) - 1;
        if (n <= 0)
          delete s.items[e.item];
        else
          s.items[e.item] = n;
      } else if (next >= max)
        delete s.integrity[e.item];
      else
        s.integrity[e.item] = next;
      break;
    }
    case "enc":
      s.encounter = e.id ? { id: e.id, round: 0, foe: { ...e.foe ?? {} } } : null;
      break;
    case "foe": {
      if (!s.encounter)
        break;
      const def = r.encounters[s.encounter.id]?.foe.stats.find((x) => x.id === e.stat);
      const cur = s.encounter.foe[e.stat] ?? def?.start ?? 0;
      const next = e.set !== undefined ? e.set : cur + (e.d ?? 0);
      s.encounter.foe[e.stat] = def ? clamp(next, 0, def.max) : next;
      break;
    }
    case "round":
      if (s.encounter)
        s.encounter.round += 1;
      break;
    case "codex":
      s.codex[e.id] = true;
      break;
    case "feat":
      s.feats[e.id] = true;
      break;
    case "perk":
      s.perks[e.id] = true;
      break;
    case "calib":
      s.calibrated[e.who] = true;
      break;
    case "forget":
      delete s.people[e.who];
      delete s.rel[e.who];
      delete s.calibrated[e.who];
      s.forgotten[e.who] = true;
      break;
    case "person":
      s.people[e.id] = { name: e.name };
      delete s.forgotten[e.id];
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
    case "secret":
      s.secrets[e.id] = Math.max(s.secrets[e.id] ?? -1, e.stage);
      break;
    case "clock": {
      const def = r.fronts[e.id];
      const f = s.fronts[e.id] ?? { v: def?.start ?? 0, stage: -1 };
      f.v = clamp(f.v + e.d, 0, def?.max ?? 100);
      s.fronts[e.id] = f;
      break;
    }
    case "stage": {
      const def = r.fronts[e.id];
      const f = s.fronts[e.id] ?? { v: def?.start ?? 0, stage: -1 };
      if (e.n > f.stage) {
        f.stage = e.n;
        const st = def?.stages[e.n];
        const line = st?.news ?? st?.surface;
        if (line)
          s.news = [...s.news, { text: line, at: s.minutes }].slice(-NEWS_KEPT);
      }
      s.fronts[e.id] = f;
      break;
    }
    case "gauge":
      s.gauge.v = clamp(e.set !== undefined ? e.set : s.gauge.v + (e.d ?? 0), 0, 100);
      break;
    case "rest":
      s.gauge.rest = Math.max(0, e.days);
      break;
    case "omen":
      s.gauge.next = e.id;
      break;
    case "happen": {
      s.gauge.last[e.id] = timeKey(r, s);
      const def = r.randomEvents.events[e.id];
      const line = def?.news ?? def?.text;
      if (line)
        s.news = [...s.news, { text: line, at: s.minutes }].slice(-NEWS_KEPT);
      break;
    }
    case "notice":
      s.notices = [...s.notices, e.text];
      break;
    case "noticed":
      s.notices = [];
      break;
    case "dg_enter":
      s.dungeon = structuredClone(e.run);
      s.deepest[e.run.id] = Math.max(s.deepest[e.run.id] ?? 0, e.run.depth);
      break;
    case "dg_exit":
      s.dungeon = null;
      break;
    default:
      if (s.dungeon)
        applyDungeon(s, s.dungeon, e);
  }
}
function applyDungeon(s, d, e) {
  switch (e.t) {
    case "dg_step": {
      d.pos = [e.x, e.y];
      const k = `${e.x},${e.y}`;
      if (!d.seen.includes(k))
        d.seen = [...d.seen, k];
      break;
    }
    case "dg_clear":
      if (!d.cleared.includes(e.key))
        d.cleared = [...d.cleared, e.key];
      break;
    case "dg_down":
      d.depth += 1;
      d.pos = e.pos;
      d.seen = [`${e.pos[0]},${e.pos[1]}`];
      d.cleared = [];
      d.pending = null;
      s.deepest[d.id] = Math.max(s.deepest[d.id] ?? 0, d.depth);
      break;
    case "dg_party":
      d.party = e.party.map((p) => ({ ...p }));
      break;
    case "dg_xp":
      d.xp = Math.max(0, d.xp + e.d);
      break;
    case "dg_gold":
      d.gold = Math.max(0, d.gold + e.d);
      break;
    case "dg_bag": {
      const n = (d.bag[e.item] ?? 0) + e.d;
      d.bag = { ...d.bag, [e.item]: Math.max(0, n) };
      break;
    }
    case "dg_loot": {
      const n = (d.loot[e.item] ?? 0) + e.d;
      const loot = { ...d.loot };
      if (n > 0)
        loot[e.item] = n;
      else
        delete loot[e.item];
      d.loot = loot;
      break;
    }
    case "dg_battle":
      d.battle = e.battle ? structuredClone(e.battle) : null;
      break;
    case "dg_pending":
      d.pending = e.pending ? { ...e.pending } : null;
      break;
    case "dg_log":
      d.log = [...d.log, e.text].slice(-DG_LOG_KEPT);
      d.untold = [...d.untold ?? [], e.text].slice(-DG_LOG_KEPT);
      break;
    case "dg_told":
      d.untold = [];
      break;
  }
}
function cloneState(s) {
  return structuredClone(s);
}
function makeEnv(r, s, extra = {}) {
  const day = Math.floor(s.minutes / 1440);
  const date = dateAt(r, s.minutes);
  let world = null;
  const worldVars = () => {
    if (world)
      return world;
    const temp = temperatureAt(r, s);
    const need = temp === null ? null : warmthNeeded(temp);
    const warmth = warmthOf(r, s);
    const exposed = exposedSlots(r, s).length;
    const indoors = isIndoors(r, s);
    world = {
      month: date?.month ?? 0,
      date: date?.day ?? 0,
      season: seasonAt(r, s.minutes) ?? "",
      weather: weatherAt(r, s)?.id ?? "",
      temperature: temp ?? 20,
      indoors,
      outside: !indoors,
      warmth,
      warmth_min: need?.min ?? 0,
      warmth_max: need?.max ?? 99,
      too_cold: need ? warmth < need.min : false,
      too_hot: need ? warmth > need.max : false,
      reveal: revealOf(r, s),
      exposed,
      naked: r.wardrobe.enabled && exposed === r.wardrobe.cover.length && r.wardrobe.cover.length > 0,
      in_encounter: !!s.encounter,
      in_dungeon: !!s.dungeon,
      dungeon_depth: s.dungeon?.depth ?? 0,
      round: s.encounter?.round ?? 0,
      target: ""
    };
    return world;
  };
  const clockVars = {
    minutes: s.minutes,
    hour: Math.floor(s.minutes % 1440 / 60),
    minute: s.minutes % 60,
    day: day + 1,
    weekday: r.clock.weekdays[day % r.clock.weekdays.length] ?? "",
    turn: s.turn,
    location: s.location ?? ""
  };
  const scheduleEnv = () => ({ lookup: base.lookup, call: (n, a) => n === "present" || n === "where" ? undefined : base.call(n, a) });
  const base = {
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
        const w = worldVars();
        if (head in w)
          return w[head];
        return;
      }
      if (head === "foe") {
        if (!s.encounter)
          return 0;
        const def = r.encounters[s.encounter.id]?.foe.stats.find((x) => x.id === rest[0]);
        return s.encounter.foe[rest[0]] ?? def?.start ?? 0;
      }
      if (head === "target" && typeof extra.target === "string" && rest.length === 1) {
        return s.rel[extra.target]?.[rest[0]] ?? r.relStats[rest[0]]?.start ?? 0;
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
        case "wearing":
          return Object.values(s.worn).includes(a0);
        case "worn":
          return s.worn[a0] ?? "";
        case "trait":
          return hasTrait(r, s, a0);
        case "present":
          return personLocation(r, s, a0, scheduleEnv()) === s.location && !!s.location;
        case "where":
          return personLocation(r, s, a0, scheduleEnv()) ?? "";
        case "codex":
          return a0 in s.codex;
        case "feat":
          return a0 in s.feats;
        case "perk":
          return a0 in s.perks;
        case "secret":
          return (s.secrets[a0] ?? -1) + 1;
        case "front":
          return s.fronts[a0]?.v ?? r.fronts[a0]?.start ?? 0;
        case "front_stage":
          return (s.fronts[a0]?.stage ?? -1) + 1;
        case "happened":
          return a0 in s.gauge.last;
        case "deepest":
          return s.deepest[a0] ?? 0;
      }
      return;
    }
  };
  return base;
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
var DG_LOG_KEPT = 12, NEWS_KEPT = 30, BUILTIN_NAMES;
var init_state = __esm(() => {
  init_expr();
  init_world();
  BUILTIN_NAMES = [
    "minutes",
    "hour",
    "minute",
    "day",
    "weekday",
    "turn",
    "location",
    "month",
    "date",
    "season",
    "weather",
    "temperature",
    "indoors",
    "outside",
    "warmth",
    "warmth_min",
    "warmth_max",
    "too_cold",
    "too_hot",
    "reveal",
    "exposed",
    "naked",
    "in_encounter",
    "round",
    "target",
    "in_dungeon",
    "dungeon_depth"
  ];
});

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
  pendingEnd = null;
  needs = [];
  defer = true;
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
function travelTargets(r, s) {
  if (s.encounter)
    return [];
  const here = s.location ? r.locations[s.location] : undefined;
  return here ? here.exits.filter((x) => r.locations[x]) : [];
}
function paramValues(a, chosen, target) {
  const out = {};
  for (const p of a.params) {
    const key = chosen?.[p.id] && p.options[chosen[p.id]] !== undefined ? chosen[p.id] : p.default;
    out[p.id] = p.options[key];
  }
  if (target)
    out.target = target;
  return out;
}
function actionPool(r, s) {
  const enc = s.encounter ? r.encounters[s.encounter.id] : undefined;
  if (enc)
    return { defs: enc.actions, order: enc.actionOrder, tags: enc.tags };
  return { defs: r.actions, order: r.actionOrder, tags: [] };
}
function isAvailable(r, s, a, target) {
  if (!s.encounter && a.at.length && !a.at.includes(s.location ?? ""))
    return false;
  if (a.when && !evalBool(a.when, makeEnv(r, s, paramValues(a, undefined, target)), true))
    return false;
  return true;
}
function availableActions(r, s, lines = []) {
  const blocked = new Set(lines.map((l) => l.toLowerCase()));
  const pool = actionPool(r, s);
  if (pool.tags.some((t) => blocked.has(t)))
    return [];
  return pool.order.map((id) => pool.defs[id]).filter((a) => !a.tags.some((t) => blocked.has(t)) && (a.perPerson || isAvailable(r, s, a)));
}
function availableChoices(r, s, lines = []) {
  const out = [];
  const here = presentPeople(r, s, makeEnv(r, s));
  for (const a of availableActions(r, s, lines)) {
    if (!a.perPerson) {
      out.push({ id: a.id, a, label: a.label });
      continue;
    }
    for (const pid of here) {
      if (!isAvailable(r, s, a, pid))
        continue;
      const name = personName(r, s, pid);
      const label = /\btarget\b|\{\{target\}\}|\{target\}/i.test(a.label) ? a.label.replace(/\{\{target\}\}|\{target\}/gi, name) : `${a.label} (${name})`;
      out.push({ id: `${a.id}${TARGET_SEP}${pid}`, a, target: pid, label });
    }
  }
  return out;
}
function findAction(r, s, actionId) {
  const [base, target] = actionId.split(TARGET_SEP);
  const a = base.startsWith(LIVE_PREFIX) ? r.liveChoices.tags[base.slice(LIVE_PREFIX.length)] : actionPool(r, s).defs[base];
  return a ? { a, ...target ? { target } : {} } : null;
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
function checkNumbers(r, s, a, params, who) {
  const check = a.check;
  const env = makeEnv(r, s, paramValues(a, params, who));
  const add = check.add !== undefined ? Math.round(evalNumber(check.add, env, 0)) : 0;
  let target = null;
  if (check.target !== undefined) {
    target = Math.round(evalNumber(check.target, env, check.style === "chance" ? 50 : 10));
    if (check.style === "chance")
      target = Math.max(0, Math.min(100, target));
  }
  return { add, target };
}
function odds(r, s, a, params, who) {
  const check = a.check;
  if (!check)
    return null;
  const { add, target } = checkNumbers(r, s, a, params, who);
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
  for (const [key, m] of Object.entries(e.rel)) {
    const who = key === "target" && typeof extra.target === "string" ? extra.target : key;
    if (key === "target" && who === "target")
      continue;
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
  for (const id of e.wear) {
    const slot = r.items[id]?.slot;
    if (slot && w.s.worn[slot] !== id)
      w.push({ t: "wear", slot, item: id, src });
  }
  for (const slot of e.undress)
    if (w.s.worn[slot])
      w.push({ t: "wear", slot, item: null, src });
  for (const [slot, d] of Object.entries(e.damage)) {
    const item = w.s.worn[slot];
    const v = evalNumber(d, w.env(extra), 0);
    if (item && v > 0)
      w.push({ t: "dmg", item, d: -v, src });
  }
  if (w.s.encounter) {
    for (const [stat, d] of Object.entries(e.foe)) {
      const v = evalNumber(d, w.env(extra), 0);
      if (v !== 0)
        w.push({ t: "foe", stat, d: v, src });
    }
    if (e.end)
      w.pendingEnd = e.end;
  }
  if (e.startEncounter && !w.s.encounter)
    startEncounter(w, e.startEncounter, src);
  for (const id of e.unlock)
    if (w.r.codex[id] && !w.s.codex[id])
      w.push({ t: "codex", id, src });
  for (const [id, d] of Object.entries(e.front)) {
    if (!r.fronts[id])
      continue;
    const v = evalNumber(d, w.env(extra), 0);
    if (v !== 0)
      w.push({ t: "clock", id, d: v, src });
  }
  for (const id of e.reveal) {
    const sec = r.secrets[id];
    const cur = w.s.secrets[id] ?? -1;
    if (sec && cur + 1 < sec.stages.length)
      w.push({ t: "secret", id, stage: cur + 1, src });
  }
  if (e.gauge !== undefined && r.randomEvents.enabled) {
    const v = evalNumber(e.gauge, w.env(extra), 0);
    if (v !== 0)
      w.push({ t: "gauge", d: v, src });
  }
  if (e.time)
    advanceTime(w, e.time, src);
  if (e.hint)
    announce(w, fillTarget(w, e.hint, extra));
  for (const d of e.decide)
    decide(w, d, src, extra);
}
function announce(w, text) {
  if (w.defer)
    w.push({ t: "notice", text, src: "world" });
  else
    w.hints.push(text);
}
function openSecrets(w) {
  for (const sec of Object.values(w.r.secrets)) {
    let cur = w.s.secrets[sec.id] ?? -1;
    while (cur + 1 < sec.stages.length) {
      const st = sec.stages[cur + 1];
      if (st.when && !evalBool(st.when, w.env(), false))
        break;
      cur++;
      w.push({ t: "secret", id: sec.id, stage: cur, src: "trigger" });
    }
  }
}
function openFrontStages(w) {
  for (const f of Object.values(w.r.fronts)) {
    for (let n = (w.s.fronts[f.id]?.stage ?? -1) + 1;n < f.stages.length; n++) {
      const st = f.stages[n];
      if ((w.s.fronts[f.id]?.v ?? f.start) < st.at)
        break;
      w.push({ t: "stage", id: f.id, n, src: "world" });
      effectToEvents(w, st.effects, "world", {});
      if (st.surface)
        announce(w, `In the wider world: ${st.surface}`);
    }
  }
}
function eligibleEvents(w) {
  const now = timeKey(w.r, w.s);
  const unit = w.r.clock.enabled ? 1440 : 1;
  return Object.values(w.r.randomEvents.events).filter((e) => {
    if (e.weight <= 0)
      return false;
    const last = w.s.gauge.last[e.id];
    if (last !== undefined && (now - last) / unit < e.cooldownDays)
      return false;
    return !e.when || evalBool(e.when, w.env(), false);
  });
}
function pickEvent(w, candidates) {
  const keys = candidates.map((e) => e.id);
  const model = w.odds[NEXT_EVENT];
  if (!model && !w.needs.some((n) => n.id === NEXT_EVENT)) {
    w.needs.push({
      id: NEXT_EVENT,
      ask: "Which of these would the story most plausibly bring next, given everything so far?",
      options: candidates.map((e) => ({ id: e.id, desc: e.text, weight: e.weight, effect: emptyEffect() }))
    });
  }
  const p = model ? normalize(Object.fromEntries(candidates.map((e) => [e.id, (model[e.id] ?? 0) * e.weight])), keys) : normalize(Object.fromEntries(candidates.map((e) => [e.id, e.weight])), keys);
  return sample(p, seededRng(`${w.seed}:event:${w.s.turn}:${Math.floor(w.s.minutes)}`));
}
function tickGauge(w, days, turns) {
  const ev = w.r.randomEvents;
  if (!ev.enabled)
    return;
  let fillDays = days;
  if (w.s.gauge.rest > 0 && days > 0) {
    const used = Math.min(w.s.gauge.rest, days);
    w.push({ t: "rest", days: w.s.gauge.rest - used, src: "world" });
    fillDays -= used;
  }
  const candidates = eligibleEvents(w);
  if (!candidates.length) {
    if (w.s.gauge.next)
      w.push({ t: "omen", id: null, src: "world" });
    return;
  }
  if (w.s.gauge.rest <= 0) {
    const env = w.env();
    const base = evalNumber(ev.perDay, env, 0) * Math.max(0, fillDays) + evalNumber(ev.perTurn, env, 0) * turns;
    if (base > 0) {
      const rng = seededRng(`${w.seed}:gauge:${w.s.turn}:${Math.floor(w.s.minutes)}`);
      const fill = base * (1 + ev.jitter * (rng() * 2 - 1));
      if (fill > 0)
        w.push({ t: "gauge", d: fill, src: "world" });
    }
  }
  const g = w.s.gauge;
  if (g.v >= 100) {
    const id = g.next && candidates.some((c) => c.id === g.next) ? g.next : pickEvent(w, candidates);
    const e = ev.events[id];
    w.push({ t: "happen", id, src: "world" });
    w.push({ t: "gauge", set: 0, src: "world" });
    if (w.s.gauge.next)
      w.push({ t: "omen", id: null, src: "world" });
    if (ev.restDays > 0)
      w.push({ t: "rest", days: ev.restDays, src: "world" });
    effectToEvents(w, e.effects, "world", {});
    announce(w, e.text);
  } else if (ev.omenAt > 0 && g.v >= ev.omenAt && !g.next) {
    w.push({ t: "omen", id: pickEvent(w, candidates), src: "world" });
  } else if (g.next && (ev.omenAt <= 0 || g.v < ev.omenAt)) {
    w.push({ t: "omen", id: null, src: "world" });
  }
}
function tickWorld(w, days, turns) {
  for (const f of Object.values(w.r.fronts)) {
    if (f.when && !evalBool(f.when, w.env(), false))
      continue;
    let add = 0;
    if (days > 0)
      add += evalNumber(f.rate, w.env(), 0) * days;
    if (turns > 0)
      add += evalNumber(f.perTurn, w.env(), 0) * turns;
    f.pushes.forEach((p, i) => {
      if (w.scene[`front:${f.id}:${i}`] === true)
        add += p.add;
    });
    if (Math.abs(add) > 0.000000001)
      w.push({ t: "clock", id: f.id, d: add, src: "world" });
  }
  openFrontStages(w);
  tickGauge(w, days, turns);
}
function startEncounter(w, id, src) {
  const enc = w.r.encounters[id];
  if (!enc)
    return;
  const foe = Object.fromEntries(enc.foe.stats.map((s) => [s.id, s.start]));
  w.push({ t: "enc", id, foe, src });
  announce(w, `An encounter begins: ${enc.name}${enc.desc ? ` — ${enc.desc}` : ""}. Opponent: ${enc.foe.name}.`);
  effectToEvents(w, enc.start, src, {});
}
function encounterOutcome(w) {
  const s = w.s.encounter;
  if (!s)
    return null;
  if (w.pendingEnd)
    return w.pendingEnd;
  const enc = w.r.encounters[s.id];
  for (const e of enc?.endWhen ?? [])
    if (evalBool(e.when, w.env(), false))
      return e.outcome;
  return null;
}
function endEncounter(w, outcome, src) {
  const s = w.s.encounter;
  if (!s)
    return;
  const enc = w.r.encounters[s.id];
  w.pendingEnd = null;
  w.push({ t: "enc", id: null, outcome, src });
  announce(w, `The encounter ends: ${outcome.replace(/_/g, " ")}.`);
  const eff = enc?.outcomes[outcome];
  if (eff)
    effectToEvents(w, eff, src, {});
}
function encounterRound(w, src) {
  if (!w.s.encounter)
    return;
  let out = encounterOutcome(w);
  if (out) {
    endEncounter(w, out, src);
    return;
  }
  w.push({ t: "round", src });
  const enc = w.r.encounters[w.s.encounter.id];
  if (enc?.foeMoves)
    decide(w, enc.foeMoves, src, {});
  out = encounterOutcome(w);
  if (out)
    endEncounter(w, out, src);
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
  w.decisions.push({ id: d.id, ask: fillTarget(w, d.ask, extra), picked, pickedDesc: fillTarget(w, opt.desc, extra), p, source: model ? "model" : "weights" });
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
  for (const c of Object.values(w.r.codex)) {
    if (c.unlock && !w.s.codex[c.id] && evalBool(c.unlock, w.env(), false))
      w.push({ t: "codex", id: c.id, src: "trigger" });
  }
  for (const f of Object.values(w.r.feats)) {
    if (!w.s.feats[f.id] && evalBool(f.unlock, w.env(), false)) {
      w.push({ t: "feat", id: f.id, src: "trigger" });
      effectToEvents(w, f.reward, "trigger", {});
    }
  }
  openSecrets(w);
  openFrontStages(w);
}
function resolveTurnFull(r, before, intent, opts) {
  const needs = [];
  const record = resolveInner(r, before, intent, opts, needs);
  return { record, needs };
}
function resolveInner(r, before, intent, opts, needs) {
  const w = new Working(r, cloneState(before), seededRng(`${opts.seed}:fx`), opts.seed, opts.odds ?? {}, opts.scene ?? {});
  w.defer = false;
  const rec = { v: 1, hints: [], events: [], at: Date.now() };
  if (!w.s.seed)
    w.push({ t: "seed", v: opts.seed, src: "start" });
  if (before.notices.length) {
    w.hints.push(...before.notices);
    w.push({ t: "noticed", src: "world" });
  }
  const found = intent && !intent.actionId.startsWith(TRAVEL_PREFIX) ? findAction(r, before, intent.actionId) : null;
  const a = found?.a;
  const inEncounter = !!before.encounter;
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
    const who = found?.target;
    const extra = paramValues(a, intent.params, who);
    const label = intent.label ?? (who ? `${a.label} (${personName(r, before, who)})` : a.label);
    rec.action = { id: intent.actionId, label, via: intent.via, ...a.params.length ? { params: Object.fromEntries(a.params.map((p) => [p.id, intent.params?.[p.id] ?? p.default])) } : {} };
    effectToEvents(w, a.cost, "cost", extra);
    if (a.check) {
      const rng = seededRng(opts.seed);
      const { add, target } = checkNumbers(r, w.s, a, intent.params, who);
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
    advanceTime(w, a.time ?? (inEncounter ? 1 : r.clock.minutesPerAction), "action");
    const veils = new Set((opts.veils ?? []).map((v) => v.toLowerCase()));
    const encTags = inEncounter ? r.encounters[before.encounter.id]?.tags ?? [] : [];
    if ([...a.tags, ...encTags].some((t) => veils.has(t)))
      rec.veiled = true;
    if (inEncounter)
      encounterRound(w, "action");
  } else if (inEncounter && w.s.encounter) {
    encounterRound(w, "action");
  }
  runTriggers(w, true);
  const days = r.clock.enabled ? (w.s.minutes - before.minutes) / 1440 : 1;
  const worldBefore = w.events.length;
  tickWorld(w, days, 1);
  if (w.events.length > worldBefore)
    runTriggers(w, false);
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
    const known = findPerson(r, w.s, person.name);
    if (known) {
      if (person.feelings)
        calibrate(w, known, person.feelings, src);
      continue;
    }
    const id = slug(person.id || person.name);
    if (!w.s.people[id])
      w.push({ t: "person", id, name: person.name, src });
    calibrate(w, id, person.feelings ?? {}, src);
  }
  for (const [who, feelings] of Object.entries(p.feelings ?? {})) {
    const id = findPerson(r, w.s, who);
    if (id)
      calibrate(w, id, feelings ?? {}, src);
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
  if (r.wardrobe.enabled && r.wardrobe.narrator) {
    for (const slot of p.undress ?? [])
      if (w.s.worn[slot])
        w.push({ t: "wear", slot, item: null, src });
    for (const id of p.wear ?? []) {
      const slot = r.items[id]?.slot;
      if (slot && w.s.items[id] > 0 && w.s.worn[slot] !== id)
        w.push({ t: "wear", slot, item: id, src });
    }
  }
  if (typeof p.minutes === "number" && Number.isFinite(p.minutes) && p.minutes > 0) {
    advanceTime(w, Math.round(Math.min(p.minutes, r.clock.narratorMax)), src);
  }
  runTriggers(w, false);
  if (r.clock.enabled && w.s.minutes > before.minutes) {
    const n = w.events.length;
    tickWorld(w, (w.s.minutes - before.minutes) / 1440, 0);
    if (w.events.length > n)
      runTriggers(w, false);
  }
  return w.events;
}
function buildTurn(r, before, seed, fn) {
  const w = new Working(r, cloneState(before), seededRng(`${seed}:fx`), seed);
  fn({
    r,
    get s() {
      return w.s;
    },
    seed,
    push: (e) => w.push(e),
    env: (extra = {}) => w.env(extra),
    apply: (effect, src, extra = {}) => effectToEvents(w, effect, src, extra),
    time: (minutes, src) => advanceTime(w, minutes, src),
    announce: (text) => announce(w, text)
  });
  runTriggers(w, false);
  if (r.clock.enabled && w.s.minutes > before.minutes) {
    const n = w.events.length;
    tickWorld(w, (w.s.minutes - before.minutes) / 1440, 0);
    if (w.events.length > n)
      runTriggers(w, false);
  }
  return w.events;
}
function manualSet(r, before, stat, value) {
  const w = new Working(r, cloneState(before));
  if (r.stats[stat])
    w.push({ t: "stat", id: stat, set: value, src: "manual" });
  runTriggers(w, false);
  return w.events;
}
function changeClothes(r, before, slot, item) {
  if (!r.wardrobe.enabled)
    return "This ruleset has no wardrobe.";
  if (item) {
    const def = r.items[item];
    if (!def?.slot)
      return "That isn't clothing.";
    if (!(before.items[item] > 0))
      return "You don't have that.";
    slot = def.slot;
  } else if (!before.worn[slot]) {
    return "Nothing is worn there.";
  }
  const w = new Working(r, cloneState(before));
  w.push({ t: "wear", slot, item, src: "manual" });
  runTriggers(w, false);
  return w.events;
}
function perkBlocker(r, s, id) {
  const p = r.perks[id];
  if (!p)
    return "Unknown perk.";
  if (s.perks[id])
    return "Already taken.";
  if (p.requires && !evalBool(p.requires, makeEnv(r, s), false))
    return "Requirements not met.";
  if (r.perkPoints && (s.stats[r.perkPoints] ?? 0) < p.cost)
    return `Needs ${p.cost} point${p.cost === 1 ? "" : "s"}.`;
  return null;
}
function buyPerk(r, before, id) {
  const blocked = perkBlocker(r, before, id);
  if (blocked)
    return blocked;
  const p = r.perks[id];
  const w = new Working(r, cloneState(before));
  w.push({ t: "perk", id, src: "manual" });
  if (r.perkPoints && p.cost)
    w.push({ t: "stat", id: r.perkPoints, d: -p.cost, src: "manual" });
  effectToEvents(w, p.effects, "manual", {});
  runTriggers(w, false);
  return w.events;
}
function fillTarget(w, text, extra) {
  if (typeof extra.target !== "string" || !extra.target || !text.includes("{target}"))
    return text;
  return text.replace(/\{target\}/g, personName(w.r, w.s, extra.target));
}
function calibrate(w, who, feelings, src) {
  if (w.s.calibrated[who])
    return;
  let read = false;
  for (const [stat, v] of Object.entries(feelings)) {
    const def = w.r.relStats[stat];
    if (!def || def.narrator <= 0 || typeof v !== "number" || !Number.isFinite(v))
      continue;
    read = true;
    const value = Math.max(def.min, Math.min(def.max, v));
    if (value !== (w.s.rel[who]?.[stat] ?? def.start))
      w.push({ t: "rel", who, stat, set: value, src });
  }
  if (read)
    w.push({ t: "calib", who, src });
}
function manualSetRel(r, before, who, stat, value) {
  if (!before.people[who])
    return "Unknown person.";
  if (!r.relStats[stat])
    return "Unknown relationship stat.";
  const w = new Working(r, cloneState(before));
  w.push({ t: "rel", who, stat, set: value, src: "manual" });
  if (!w.s.calibrated[who])
    w.push({ t: "calib", who, src: "manual" });
  runTriggers(w, false);
  return w.events;
}
function forgetPerson(r, before, who) {
  if (!before.people[who])
    return "Unknown person.";
  return [{ t: "forget", who, src: "manual" }];
}
var TRAVEL_PREFIX = "go:", TARGET_SEP = "@", LIVE_PREFIX = "live:", NEXT_EVENT = "world:next_event", TIER_FALLBACK, TIER_LABEL;
var init_resolve = __esm(() => {
  init_expr();
  init_dice();
  init_ruleset();
  init_state();
  init_world();
  TIER_FALLBACK = {
    crit_success: ["crit_success", "success"],
    success: ["success"],
    partial: ["partial", "success"],
    fail: ["fail"],
    crit_fail: ["crit_fail", "fail"]
  };
  TIER_LABEL = {
    crit_success: "Critical success",
    success: "Success",
    partial: "Partial success",
    fail: "Failure",
    crit_fail: "Critical failure"
  };
});

// src/engine/templates/universal.ts
var universal;
var init_universal = __esm(() => {
  universal = {
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
    success: { body: +0.2, hint: "It works." }
    fail: { energy: -10, hint: "It doesn't work, and it takes something out of {{user}}." }
    crit_fail: { health: -15, energy: -10, hint: "It goes badly wrong — a real setback or injury." }

  mental_feat:
    label: Mental feat
    hidden: true
    desc: Recalling facts, solving puzzles, spotting lies or danger, working something out.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: mind, label: Mind, partial: 3 }
    success: { mind: +0.2, hint: "The answer or insight comes clearly." }
    fail: { hint: "It doesn't add up — nothing useful comes of it." }

  social_feat:
    label: Social feat
    hidden: true
    desc: Persuading, lying, seducing, intimidating, calming someone down, haggling.
    params:
      difficulty: { easy: 8, normal: 12, hard: 16, extreme: 20 }
    check: { vs: difficulty, add: charm, label: Charm, partial: 3 }
    success: { charm: +0.2, hint: "They're swayed." }
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
      },
      {
        label: "story",
        yaml: `# Choices written for each moment. A writer phrases them from the story; each must
# carry one of these tags, and the tag decides the roll — the writer can't.
# Add secrets:, fronts: and random_events: here for a card-specific living world.
live_choices:
  label: Right now
  count: 3
  when: not in_encounter
  tags:
    bold:
      desc: "A daring, physical or risky move"
      check: { vs: 12, add: body, label: Body, partial: 3 }
      success: { mood: +3 }
      fail: { health: -5, mood: -3 }
    clever:
      desc: "Noticing, working something out, or a clever trick"
      check: { vs: 12, add: mind, label: Mind, partial: 3 }
      success: { mood: +2 }
      fail: { mood: -2 }
    charm:
      desc: "Persuading, charming or flirting with someone here"
      per_person: true
      check: { vs: 12, add: charm, label: Charm, partial: 3 }
      success: { rel: { target: { affection: +3, trust: +2 } } }
      fail: { mood: -3, rel: { target: { trust: -2 } } }
    kind:
      desc: "Something kind or supportive toward someone here"
      per_person: true
      effects: { mood: +2, rel: { target: { trust: +3 } } }
    careful:
      desc: "The cautious option: waiting, watching, backing off"
      effects: { energy: +2 }
`
      }
    ]
  };
});

// src/engine/templates/hometown.ts
var hometown;
var init_hometown = __esm(() => {
  hometown = {
    id: "hometown",
    name: "Hometown (life-sim)",
    blurb: "Survival life-sim: Pain, Arousal, Fatigue, Stress, Trauma, Control and Allure described in words, graded skills, a calendar with weather and temperature, clothing that matters, townsfolk on schedules, a mugging encounter, and meters that feed into each other.",
    parts: [
      {
        label: "core",
        yaml: `name: Hometown
description: A survival life-sim in a small coastal university town.

player:
  age: 20                 # a university student

clock:
  start: Mon 07:00
  date: Sep 4
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
  # Townsfolk keep their own hours; they show up as "here" when you share a place.
  people:
    jo:
      name: Jo
      desc: Runs the café on the High Street. Brisk, fair, secretly kind.
      schedule:
        - { when: "between(hour, 7, 18) and weekday != 'Sun'", at: high_street }
        - { when: "(weekday == 'Fri' or weekday == 'Sat') and (hour >= 21 or hour < 2)", at: the_strip }
    professor_ward:
      name: Professor Ward
      desc: Your tutor. Exacting, dry, notices everything.
      schedule:
        - { when: "between(hour, 9, 17) and weekday != 'Sat' and weekday != 'Sun'", at: campus }
    dex:
      name: Dex
      desc: Works the docks at night. Knows people who know people.
      schedule:
        - { when: "hour >= 19 or hour < 4", at: docks }
`
      },
      {
        label: "world",
        yaml: `weather:
  temps: { spring: 12, summer: 21, autumn: 11, winter: 3 }

locations:
  apartment:
    name: Your Apartment
    desc: A cramped one-bedroom above a chip shop. Thin walls, a lock that sticks.
    indoors: true
    exits: [high_street]
  high_street:
    name: High Street
    desc: Shops, a café, a busy bus stop. Crowded by day, emptier at night.
    exits: [apartment, campus, park, docks, the_strip]
  campus:
    name: University Campus
    desc: Lecture halls, a library, a gym with a pool.
    indoors: true
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
  # Clothing: slot, warmth, how revealing, traits.
  t_shirt: { name: T-shirt, slot: top, warmth: 2 }
  hoodie: { name: Hoodie, slot: top, warmth: 6 }
  jeans: { name: Jeans, slot: bottom, warmth: 4 }
  skirt: { name: Short skirt, slot: bottom, warmth: 1, reveal: 3 }
  undershirt: { name: Undershirt, slot: under_top, warmth: 1 }
  underwear: { name: Underwear, slot: under_bottom, warmth: 1 }
  trainers: { name: Trainers, slot: feet, warmth: 1 }
  raincoat: { name: Raincoat, slot: outer, warmth: 4, traits: [rainproof] }
  winter_coat: { name: Winter coat, slot: outer, warmth: 12 }
  swimsuit: { name: Swimsuit, slot: under_bottom, warmth: 0, reveal: 5, traits: [swimwear] }

wardrobe:
  slots: [outer, top, bottom, under_top, under_bottom, feet]
  cover: [top, bottom]
  start: [t_shirt, jeans, undershirt, underwear, trainers]

start:
  items: { hoodie: 1, skirt: 1 }

conditions:
  exhausted: { label: Exhausted, tone: bad, desc: Stress builds fast while this tired. }
  scared: { label: Scared, tone: bad, desc: Low control — trauma comes to the surface. }
  shaken: { label: Shaken, tone: warn, desc: Recently overwhelmed. }
  wanted: { label: Wanted, tone: bad, desc: The police are looking for you. }
  cold: { label: Cold, tone: bad, desc: Underdressed for the weather. }
  overheating: { label: Overheating, tone: warn, desc: Overdressed for the weather. }
  soaked: { label: Soaked, tone: warn, desc: Caught in the rain without a coat. }
  exposed: { label: Exposed, tone: bad, desc: Not decently covered in public. }
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
    success: { money: 45 + tending / 2, tending: +1.2, fatigue: +20, flags: { worked: true }, hint: "A smooth shift — good tips." }
    fail: { money: 30, tending: +0.6, fatigue: +22, stress: +6, flags: { worked: true }, hint: "A rough shift: rude customers and a smashed tray." }
  buy_raincoat:
    label: Buy a raincoat (£30)
    group: Shops
    at: high_street
    when: money >= 30 and not has('raincoat')
    say: "*I buy a raincoat.*"
    time: 15
    effects: { money: -30, give: raincoat }
  buy_coat:
    label: Buy a winter coat (£60)
    group: Shops
    at: high_street
    when: money >= 60 and not has('winter_coat')
    say: "*I buy a proper winter coat.*"
    time: 15
    effects: { money: -60, give: winter_coat }
  buy_swimsuit:
    label: Buy a swimsuit (£20)
    group: Shops
    at: high_street
    when: money >= 20 and not has('swimsuit')
    say: "*I pick up a swimsuit.*"
    time: 15
    effects: { money: -20, give: swimsuit }
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
          mugged: { desc: "A mugger corners them", weight: 1, start_encounter: mugging }

  # One button per person here. {target} is their name; rel: { target: … } changes how they feel.
  chat:
    label: Chat with {target}
    group: People
    per_person: true
    say: "*I strike up a conversation with {target}.*"
    time: 20
    effects: { rel: { target: { trust: +2, love: +1 } }, stress: -2 }
  flirt:
    label: Flirt with {target}
    group: People
    per_person: true
    say: "*I flirt with {target}.*"
    time: 15
    check: { chance: 30 + allure / 2 + target.love / 2 + target.trust / 4, label: Allure }
    success: { rel: { target: { love: +3, lust: +4 } }, arousal: +3, hint: "{target} is charmed." }
    fail: { rel: { target: { trust: -2 } }, stress: +3, hint: "It lands badly; {target} is put off." }
    crit_fail: { rel: { target: { trust: -4, love: -2 } }, stress: +6, hint: "Mortifying. {target} makes it clear they're not interested." }
  ask_favour:
    label: Ask {target} for help
    group: People
    per_person: true
    when: target.trust >= 30
    say: "*I ask {target} for a favour.*"
    time: 20
    effects:
      decide:
        ask: Does {target} agree to help {{user}}?
        options:
          yes: { desc: "Helps gladly", weight: 3, stress: -5, rel: { target: { love: +1 } } }
          grudging: { desc: "Helps, but grudgingly", weight: 2, rel: { target: { trust: -1 } } }
          no: { desc: "Refuses", weight: 1, stress: +3 }

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

  # Weather and clothing.
  cold:
    when: too_cold and outside
    do:
      add_condition: [cold]
      hint: "{{user}} is shivering — badly underdressed for the weather."
  cold_bites:
    when: too_cold and outside
    repeat: true
    do: { stress: +1, fatigue: +1 }
  warmed_up:
    when: not too_cold or indoors
    do: { remove_condition: [cold] }
  overheating:
    when: too_hot
    do: { add_condition: [overheating] }
  cooled_down:
    when: not too_hot
    do: { remove_condition: [overheating] }
  soaked:
    when: (weather == 'rain' or weather == 'storm') and outside and not trait('rainproof')
    do:
      add_condition: { soaked: 120 }
      hint: "The rain soaks {{user}} through."
  exposed:
    when: exposed > 0 and outside
    do:
      add_condition: [exposed]
      hint: "{{user}} is out in public without being decently covered, and people notice."
  exposed_stress:
    when: exposed > 0 and outside
    repeat: true
    do: { stress: +3, allure: +2 }
  covered:
    when: exposed == 0 or indoors
    do: { remove_condition: [exposed] }
`
      },
      {
        label: "encounters",
        yaml: `# Turn-based encounters. Your moves replace the normal choices until it ends;
# the mugger's move each round is rolled (odds weighed by the decision model if you use one).
encounters:
  mugging:
    name: Mugging
    desc: Someone blocks {{user}}'s way and wants their money.
    tags: [violence]
    foe:
      name: Mugger
      stats:
        nerve: { label: Nerve, start: 10, max: 10 }
    actions:
      fight_back:
        label: Fight back
        check: { chance: 30 + athletics / 2 - fatigue / 3 - pain / 3, label: Athletics }
        success: { foe: { nerve: -6 }, hint: "{{user}} lands a solid hit." }
        fail: { pain: +10, hint: "{{user}}'s swing misses and they take a blow." }
      shout:
        label: Shout for help
        check: { chance: 35 + control / 4, label: Control }
        success: { foe: { nerve: -4 }, hint: "Heads turn at the shouting." }
        fail: { stress: +4, hint: "Nobody comes." }
      hand_over:
        label: Hand over your money
        effects: { money: "-min(money, 20)", end: robbed }
      run:
        label: Run
        check: { chance: 35 + athletics / 2 - fatigue / 3 - pain / 2, label: Athletics }
        success: { fatigue: +5, end: escaped }
        fail: { pain: +5, hint: "{{user}} is caught before getting far." }
    foe_moves:
      grab: { desc: "Grabs and shoves {{user}}", weight: 2, pain: +8, stress: +4, damage: { top: 20 } }
      threaten: { desc: "Makes an ugly threat", weight: 2, stress: +6, control: -3 }
      snatch: { desc: "Snatches at their pockets", weight: 1, money: "-min(money, 10)" }
    end_when:
      won: foe.nerve <= 0
      beaten: pain >= 80
    outcomes:
      won: { stress: -5, control: +5, flags: { fought_off_mugger: true }, hint: "The mugger loses their nerve and bolts." }
      robbed: { stress: +8, control: -8, hint: "They take the money and vanish." }
      escaped: { stress: +3, hint: "{{user}} gets clear." }
      beaten: { trauma: +5, money: "-min(money, 30)", hint: "{{user}} is left hurt on the pavement, pockets emptied." }

# Roguelike diving: floors of face-down tiles with one way down. Leave whenever you
# like and keep what you found; get wiped out and you lose it.
dungeons:
  old_mines:
    name: The Old Mines
    desc: Flooded tunnels under the docks, abandoned when the seam ran dry. People say things live down there now.
    at: [docks]
    theme: cave
    floors: 15
    party: { max: 3 }
    player: { atk: "12 + athletics / 10", agi: "10 + athletics / 12" }
    on_leave: { fatigue: +15 }
    on_defeat: { pain: +40, trauma: +8, control: -10 }
`
      },
      {
        label: "journal",
        yaml: `# Codex entries unlock as you play. Add "lore: [Lorebook entry title]" to one and that
# lorebook entry stays off until the codex entry unlocks.
codex:
  apartment: { title: Your Apartment, category: Places, text: "Above the chip shop. The landlord never fixes anything.", unlock: "turn >= 1" }
  campus: { title: University Campus, category: Places, text: "Sprawling and old; the pool is open late on weekdays.", unlock: "location == 'campus'" }
  docks: { title: The Docks, category: Places, text: "Cargo, cranes and people who don't ask questions.", unlock: "location == 'docks'" }
  the_strip: { title: The Strip, category: Places, text: "Where the town goes to forget itself.", unlock: "location == 'the_strip'" }
  jo: { title: Jo, category: People, text: "Runs the café. Pays fairly, expects the same.", unlock: "met('jo') and rel('jo', 'trust') >= 15" }

feats:
  first_pay: { name: First paycheque, desc: "Finish a shift at the café.", unlock: "flag('worked')", reward: { stress: -5 } }
  night_owl: { name: Night owl, desc: "Be out on the Strip after 2am.", unlock: "location == 'the_strip' and between(hour, 2, 5)" }
  stood_ground: { name: Stood your ground, desc: "Fight off a mugger.", unlock: "flag('fought_off_mugger')", reward: { control: +10 } }
  well_dressed: { name: Dressed for it, desc: "Own a raincoat and a winter coat.", unlock: "has('raincoat') and has('winter_coat')" }
`
      },
      {
        label: "story",
        yaml: `# Secrets reach the narrator one stage at a time — a stage that isn't open is never
# in its prompt, so it can't leak. Fronts are hidden clocks that fill with game time
# and surface in the story. Random events come from a hidden gauge, with an omen first.
# Live choices are written for each moment; their tag, not the writer, decides the roll.
secrets:
  ward_observatory:
    about: Professor Ward
    cue: "Ward goes very still whenever the old observatory on campus comes up, and changes the subject."
    tell: exists
    stages:
      - when: "rel('professor_ward', 'trust') >= 45"
        text: "Years ago a student fell from the observatory roof during a night session Ward supervised. Ward has never forgiven themself."
      - when: "rel('professor_ward', 'trust') >= 70"
        text: "Ward signed the safety report saying the roof hatch was locked. It wasn't, and nobody else knows."
  dex_debt:
    about: Dex
    cue: "Dex checks the street whenever a black car passes, and never stays in one spot for long."
    tell: exists
    stages:
      - when: "rel('dex', 'trust') >= 40"
        text: "Dex owes a lot of money to the people who run the docks, and is running out of time to pay."

fronts:
  dock_crew:
    label: The dock crew
    per_day: 5
    story:
      "{{user}} draws the attention of the people who run the docks": 12
      "{{user}} helps Dex stay out of trouble": -8
    stages:
      - at: 30
        hint: "More people than usual loiter by the docks after dark, watching who comes and goes."
        backstage: "The dock crew has started collecting protection money from the High Street shops."
        surface: "Jo's café window is smashed overnight. Jo is sweeping up glass and won't say who did it."
        news: "Jo's café window was smashed overnight."
        do: { flags: { cafe_hit: true } }
      - at: 65
        hint: "Dex hasn't been seen at the docks for a couple of nights."
        backstage: "The crew gave Dex one week to pay what they owe."
        surface: "Word on the street: the dock crew is looking for Dex, and for anyone who knows where Dex is."
        news: "The dock crew is looking for Dex."
        do: { flags: { dex_hunted: true } }
      - at: 100
        backstage: "The crew caught up with Dex."
        surface: "Dex turns up badly beaten. The docks go quiet and nobody is talking."
        news: "Dex was found badly beaten."
        do: { flags: { dex_beaten: true } }

random_events:
  pace: { per_day: 30, jitter: 0.35, rest_days: 1, omen_at: 80 }
  events:
    landlord:
      label: The landlord
      omen: "An unopened letter from the landlord is waiting by the door."
      text: "The landlord turns up unannounced, wants to inspect the flat, and hints that the rent is going up."
      cooldown: 14
      do: { stress: +6 }
    power_cut:
      label: Power cut
      omen: "The lights in the building keep flickering."
      text: "The power cuts out across the whole block."
      cooldown: 10
    found_wallet:
      label: A dropped wallet
      when: outside
      text: "{{user}} spots a wallet lying on the pavement, stuffed with cash."
      cooldown: 20
    party:
      label: A party invite
      when: "weekday == 'Fri' or weekday == 'Sat'"
      omen: "People on campus keep talking about a party this weekend."
      text: "Someone from {{user}}'s course invites them to a house party tonight."
      weight: 2
      cooldown: 6
    old_friend:
      label: An old friend
      text: "An old school friend of {{user}}'s calls out to them from across the street, delighted."
      cooldown: 21

live_choices:
  label: Right now
  count: 3
  when: not in_encounter
  guide: "Grounded, everyday options. Include one that's a little risky."
  tags:
    bold:
      desc: "A daring, risky or impulsive move"
      check: { chance: 45 + control / 4 - stress / 5, label: Nerve }
      success: { control: +3, stress: -2 }
      fail: { stress: +6, control: -2 }
    charm:
      desc: "Charming, flirting with or winning over someone here"
      per_person: true
      check: { chance: 35 + allure / 2 + target.trust / 4, label: Allure }
      success: { rel: { target: { love: +3, trust: +2 } } }
      fail: { stress: +3, rel: { target: { trust: -1 } } }
    kind:
      desc: "Something kind, generous or supportive toward someone here"
      per_person: true
      effects: { stress: -2, rel: { target: { trust: +3 } } }
    sly:
      desc: "Something sneaky, dishonest or against the rules"
      tags: [crime]
      check: { chance: 30 + skulduggery / 1.5, label: Skulduggery }
      success: { skulduggery: +0.5 }
      fail: { crime: +4, stress: +4 }
    careful:
      desc: "The cautious, sensible option: stepping back, waiting, leaving"
      effects: { stress: -1 }
`
      }
    ]
  };
});

// src/engine/templates/starfarer.ts
var starfarer;
var init_starfarer = __esm(() => {
  starfarer = {
    id: "starfarer",
    name: "Starfarer (sci-fi RPG)",
    blurb: "Sci-fi RPG: Physique, Reflexes, Aim, Intelligence, Willpower and Libido capped at 5× level; Shields/HP/Lust/Energy pools; credits; XP, levels and perks; a ship and a frontier world; turn-based combat you can win by force or by seduction; a codex that fills in as you explore.",
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
  perk_points:
    kind: attribute
    label: Perk points
    start: 1
    max: 20
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
  people:
    vex:
      name: Vex
      desc: Bartender at the Dry Dock. Sells rumours by the glass.
      schedule:
        - { when: "hour >= 16 or hour < 4", at: bar }
    kade:
      name: Kade
      desc: Gear merchant. Haggles like it's a blood sport.
      schedule:
        - { when: "between(hour, 8, 20)", at: merchant }
`
      },
      {
        label: "world",
        yaml: `locations:
  bridge:
    name: Ship — Bridge
    desc: Your ship's cramped cockpit and nav console.
    indoors: true
    exits: [quarters, cargo_bay]
    travel: 2
  quarters:
    name: Ship — Quarters
    desc: A bunk, a shower, a locker.
    indoors: true
    exits: [bridge]
    travel: 2
  cargo_bay:
    name: Ship — Cargo Bay
    desc: The loading ramp opens onto whatever dock you're berthed at.
    indoors: true
    exits: [bridge, concourse, jungle_edge]
    travel: 2
  concourse:
    name: Station Concourse
    desc: Merchants, a bar, and a notice board full of bounties.
    indoors: true
    exits: [cargo_bay, bar, merchant]
    travel: 10
  bar:
    name: The Dry Dock (bar)
    desc: Spacers, mercs, and rumours.
    indoors: true
    exits: [concourse]
  merchant:
    name: Gear Merchant
    desc: Guns, armour, gadgets — for a price.
    indoors: true
    exits: [concourse]
  jungle_edge:
    name: Frontier Jungle
    desc: Hot, wet, and full of things that bite. Or worse.
    exits: [cargo_bay, jungle_deep]
    travel: 30
  jungle_deep:
    name: Deep Jungle
    desc: The canopy closes overhead. Old ruins, older predators.
    exits: [jungle_edge]
    travel: 45

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
  rest_quarters:
    label: Rest in your bunk
    group: Ship
    at: quarters
    say: "*I crash in my bunk for a few hours.*"
    time: 240
    effects: { hp: +40, shields: +100, energy: +100, lust: -20 }
  scan:
    label: Scan the area
    group: Explore
    say: "*I sweep the area with my codex scanner.*"
    time: 5
    check: { vs: 12, add: floor(intelligence / 2), label: Intelligence }
    success: { hint: "The scan reveals something valuable: a hidden route, loot, or a threat before it strikes." }
    fail: { hint: "Interference. Nothing useful." }
  explore:
    label: Explore
    group: Explore
    at: [jungle_edge, jungle_deep]
    say: "*I push deeper into the jungle.*"
    time: 45
    check: { vs: 11, add: floor(reflexes / 3), label: Reflexes }
    success: { xp: +15, credits: roll('3d20'), hint: "A discovery: salvage or something worth selling." }
    fail: { start_encounter: ambush }
  use_booster:
    label: Use a shield booster
    group: Gear
    when: has('shield_booster')
    say: "*I pop a shield booster.*"
    time: 1
    effects: { take: shield_booster, shields: +30 }
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
  talk:
    label: Talk to {target}
    group: Social
    per_person: true
    say: "*I strike up a conversation with {target}.*"
    time: 15
    effects: { rel: { target: { affinity: +2 } } }
  flirt:
    label: Flirt with {target}
    group: Social
    per_person: true
    say: "*I flirt with {target}.*"
    time: 15
    check: { vs: 12, add: floor(libido / 10) + floor(target.affinity / 20), label: Libido }
    success: { rel: { target: { attraction: +5 } }, lust: +5 }
    fail: { rel: { target: { affinity: -2 } } }

  # Free-text only
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
        label: "encounters",
        yaml: `# Turn-based combat. Shields soak damage first; win by knocking the foe out
# or by driving their lust to the limit — and lose the same two ways.
encounters:
  ambush:
    name: Ambush
    desc: A hostile scavenger jumps {{user}}.
    foe:
      name: Scavenger
      stats:
        shields: { label: Shields, start: 12, max: 12 }
        hp: { label: HP, start: 30, max: 30 }
        lust: { label: Lust, start: 0, max: 100, good: low }
    actions:
      shoot:
        label: Shoot
        cost: { energy: -5 }
        check: { vs: 12, add: floor(aim / 2), label: Aim }
        crit_success: { foe: { shields: -14, hp: "foe.shields <= 0 ? -12 : 0" }, hint: "A perfect shot." }
        success: { foe: { shields: -8, hp: "foe.shields <= 0 ? -7 : 0" }, hint: "The shot lands." }
        fail: { hint: "Missed." }
      melee:
        label: Melee
        cost: { energy: -8 }
        check: { vs: 12, add: floor(physique / 2), label: Physique }
        success: { foe: { hp: "-(6 + floor(physique / 2))" }, hint: "A heavy blow gets past their shields." }
        fail: { hint: "Blocked." }
      tease:
        label: Tease
        check: { vs: 11, add: floor(libido / 10), label: Libido }
        success: { foe: { lust: "+(12 + floor(libido / 5))" }, hint: "They're visibly flustered." }
        fail: { lust: +5, hint: "They don't bite — and it leaves {{user}} a little hot and bothered." }
      medkit:
        label: Use a medkit
        when: has('medkit')
        effects: { take: medkit, hp: +25 }
      flee:
        label: Flee
        check: { vs: 13, add: floor(reflexes / 2), label: Reflexes }
        success: { energy: -10, end: fled }
        fail: { hint: "Cut off — the fight goes on." }
    foe_moves:
      blast: { desc: "Fires a blaster", weight: 3, shields: -8, hp: "shields <= 0 ? -6 : 0" }
      grapple: { desc: "Tries to grapple", weight: 1, hp: -4, add_condition: { grappled: 2 } }
      taunt: { desc: "Puts on a lewd display", weight: 1, lust: "+(8 + floor(libido / 10))" }
    end_when:
      won: foe.hp <= 0
      seduced: foe.lust >= 100
      downed: hp <= 0
      overwhelmed: lust >= 100
    outcomes:
      won: { xp: +40, credits: roll('4d20'), hint: "The scavenger goes down." }
      seduced: { xp: +40, lust: +10, hint: "The scavenger gives up the fight, overcome with desire." }
      fled: { hint: "{{user}} gets away." }
      downed: { set: { hp: 1 }, credits: -100, hint: "{{user}} is knocked out and wakes later, robbed." }
      overwhelmed: { set: { lust: 40 }, hint: "{{user}} is overwhelmed by lust and can't keep fighting — the scavenger has their way." }

# Roguelike diving in the pre-colonial ruins. Leave whenever you like and keep the
# salvage; get wiped out and you lose it.
dungeons:
  ruins:
    name: The Deep Ruins
    desc: Pre-colonial vaults under the jungle, still humming with power and full of things that don't like visitors.
    at: [jungle_deep]
    theme: ruins
    floors: 20
    party: { max: 3 }
    player: { class: fighter, hp: "40 + physique * 6 + level * 8", atk: "6 + aim * 1.5", def: "6 + physique", mat: "6 + intelligence * 1.5", agi: "6 + reflexes * 1.2" }
    currency: credits
    loot: { shield_booster: 3, medkit: 2 }
    on_leave: { energy: -20 }
    on_defeat: { hp: -20, credits: "-min(credits, 150)" }
`
      },
      {
        label: "journal",
        yaml: `# Perks cost points (one per level). Codex entries unlock as you explore.
perks:
  points: perk_points
  sharpshooter: { name: Sharpshooter, desc: "+2 Aim.", cost: 1, effects: { aim: +2 } }
  bruiser: { name: Bruiser, desc: "+2 Physique.", cost: 1, effects: { physique: +2 } }
  iron_will: { name: Iron Will, desc: "+2 Willpower.", cost: 1, effects: { willpower: +2 } }
  silver_tongue: { name: Silver Tongue, desc: "+10 Libido.", cost: 1, effects: { libido: +10 } }
  tactician: { name: Tactician, desc: "+2 Intelligence and Reflexes.", cost: 2, requires: "level >= 3", effects: { intelligence: +2, reflexes: +2 } }

codex:
  station: { title: The Station, category: Places, text: "A trade hub bolted onto an asteroid. Everything's for sale.", unlock: "location == 'concourse'" }
  jungle: { title: The Frontier Jungle, category: Places, text: "Humid, hostile, and dotted with pre-colonial ruins.", unlock: "location == 'jungle_edge'" }
  ruins: { title: The Ruins, category: Places, text: "Whoever built them left in a hurry — and left things behind.", unlock: "location == 'jungle_deep'" }
  scavengers: { title: Scavengers, category: Threats, text: "Desperate, armed, and occasionally persuadable.", unlock: "turn > 0 and in_encounter" }

feats:
  first_blood: { name: First blood, desc: "Win a fight.", unlock: "xp >= 40 or level >= 2" }
  explorer: { name: Explorer, desc: "Reach the deep jungle.", unlock: "location == 'jungle_deep'", reward: { xp: +20 } }
`
      },
      {
        label: "rules",
        yaml: `triggers:
  # Fights can also start from the story itself, judged each turn by the decision model.
  fight_starts:
    when_scene: "A fight has broken out and {{user}} is in it"
    do: { start_encounter: ambush }
  level_up:
    when: xp >= level * 100
    do:
      set: { xp: 0 }
      level: +1
      perk_points: +1
      physique: +1
      reflexes: +1
      aim: +1
      intelligence: +1
      willpower: +1
      hint: "Level up! {{user}} feels stronger, faster, sharper."
  shields_down:
    when: shields <= 0 and in_encounter
    do:
      hint: "{{user}}'s shields are down — hits now land on flesh."
`
      },
      {
        label: "story",
        yaml: `# Secrets reach the narrator one stage at a time; fronts are hidden clocks that fill
# with game time; random events come from a hidden gauge with an omen first; live
# choices are written for each moment, and their tag decides the roll.
secrets:
  vex_informant:
    about: Vex
    cue: "Vex always seems to know which ships are carrying what, and goes quiet when anyone mentions the Red Veil."
    tell: exists
    stages:
      - when: "rel('vex', 'affinity') >= 50"
        text: "Vex sells shipping manifests to the Red Veil syndicate. It's how Vex pays off an old debt to them."
      - when: "rel('vex', 'affinity') >= 80"
        text: "Vex passed the Red Veil {{user}}'s ship registry weeks ago, before they ever became friends."

fronts:
  red_veil:
    label: The Red Veil syndicate
    per_day: 8
    story:
      "{{user}} makes enemies of pirates or the Red Veil": 15
      "{{user}} lies low or covers their tracks": -10
    stages:
      - at: 35
        hint: "The same unmarked shuttle has docked near {{user}}'s ship two days running."
        backstage: "The Red Veil has marked {{user}}'s ship as a target worth taking."
        surface: "Someone has been aboard {{user}}'s ship: the cargo bay lock is scorched and a crate is missing."
        news: "Someone broke into the cargo bay."
        do: { credits: -150 }
      - at: 70
        hint: "Station security keeps finding reasons to walk past {{user}}'s berth."
        backstage: "The Red Veil paid a station security officer to look the other way."
        surface: "A Red Veil scavenger crew makes its move against {{user}}."
        news: "The Red Veil made its move."
        do: { start_encounter: ambush }

random_events:
  pace: { per_day: 20, jitter: 0.3, rest_days: 2, omen_at: 80 }
  events:
    distress_call:
      label: Distress call
      omen: "The comm panel keeps catching fragments of a looping signal."
      text: "A distress beacon pings {{user}}'s comm — a small ship in trouble on the jungle edge."
      cooldown: 10
    customs:
      label: Customs inspection
      when: "location == 'concourse' or location == 'bar' or location == 'merchant'"
      omen: "Customs officers are working their way along the docking ring."
      text: "Station customs flag {{user}} for a random inspection."
      cooldown: 8
      do: { energy: -10 }
    ion_storm:
      label: Ion storm
      omen: "Static crawls across every screen on the station."
      text: "An ion storm rolls over the station; shields and comms flicker."
      cooldown: 12
      do: { shields: -10 }

live_choices:
  label: Right now
  count: 3
  when: not in_encounter
  tags:
    daring:
      desc: "A fast, daring or reckless move"
      check: { vs: 12, add: floor(reflexes / 2), label: Reflexes }
      success: { xp: +10 }
      fail: { hp: -6 }
    charm:
      desc: "Charming, flirting with or winning over someone here"
      per_person: true
      check: { vs: 11, add: floor(libido / 10), label: Libido }
      success: { rel: { target: { affinity: +4, attraction: +3 } } }
      fail: { lust: +5 }
    tech:
      desc: "Hacking, scanning or working a piece of tech"
      check: { vs: 12, add: floor(intelligence / 2), label: Intelligence }
      success: { xp: +10 }
      fail: { energy: -8 }
    careful:
      desc: "The cautious option: holding back, waiting, walking away"
      effects: { energy: +5 }
`
      }
    ]
  };
});

// src/engine/templates/index.ts
function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id);
}
function looksLikeScenario(c) {
  const tags = (c.tags ?? []).map((t) => t.toLowerCase());
  if (tags.some((t) => /scenario|\brpg\b|narrator|simulator|multiple characters|multi-?char|multi-?character|\bgroup\b|text adventure|\bworld\b|setting|dungeon|sandbox/.test(t)))
    return true;
  const text = `${c.description ?? ""}
${c.personality ?? ""}
${c.scenario ?? ""}`.toLowerCase();
  const narratorPhrases = [
    /\b(?:the )?narrator\b/,
    /\bgame ?master\b/,
    /\bdungeon master\b/,
    /\bstoryteller\b/,
    /\{\{char\}\} (?:is|will be) (?:not a (?:single |specific )?character|the (?:narrator|world|setting|game))/,
    /\{\{char\}\} (?:will )?(?:play|voice|control)s? (?:all |every |each )?(?:of )?(?:the )?(?:other )?(?:characters|npcs|side characters|cast)/,
    /\bmultiple characters\b/,
    /\bvarious characters\b/,
    /\ball (?:the )?npcs\b/
  ];
  if (narratorPhrases.some((re) => re.test(text)))
    return true;
  const settingName = /\b(simulator|scenario|rpg|academy|world|kingdom|empire|city|town|village|school|university|dungeon|adventure|quest|game|isekai|apocalypse|station)\b/i;
  return settingName.test(c.name) && !(c.personality ?? "").trim();
}
function withCharacter(yaml, name) {
  if (!/^relationships:/m.test(yaml))
    return yaml;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "companion";
  if (new RegExp(`^    ${id}:`, "m").test(yaml))
    return yaml;
  const entry = `    ${id}:
      name: ${JSON.stringify(name)}
`;
  const m = /^  people:[^\n]*\n/m.exec(yaml);
  if (m)
    return yaml.slice(0, m.index + m[0].length) + entry + yaml.slice(m.index + m[0].length);
  return `${yaml.replace(/\n*$/, `
`)}  people:
${entry}`;
}
var TEMPLATES;
var init_templates = __esm(() => {
  init_universal();
  init_hometown();
  init_starfarer();
  TEMPLATES = [universal, hometown, starfarer];
});

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
function liveChoicesOf(m) {
  if (!m || m.is_user)
    return [];
  return warpMeta(m).live?.[String(m.swipe_id ?? 0)] ?? [];
}
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
async function patchMeta(chatId, messageId, key, value) {
  const msgs = await getMessages(chatId);
  const m = msgs.find((x) => x.id === messageId);
  if (!m)
    return;
  const meta = { ...m.metadata ?? {} };
  if (JSON.stringify(meta[key]) === JSON.stringify(value))
    return;
  if (value === undefined)
    delete meta[key];
  else
    meta[key] = value;
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
var init_ledger = __esm(() => {
  init_state();
});

// src/shared/protocol.ts
var DEFAULT_SETTINGS;
var init_protocol = __esm(() => {
  DEFAULT_SETTINGS = {
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
});

// src/backend/settings.ts
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
var cache2, key = (userId) => userId ?? "_";
var init_settings = __esm(() => {
  init_protocol();
  cache2 = new Map;
});

// node_modules/js-yaml/dist/js-yaml.mjs
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
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
function requireCore() {
  if (hasRequiredCore)
    return core;
  hasRequiredCore = 1;
  core = requireJson();
  return core;
}
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
var jsYaml, loader, common, hasRequiredCommon, exception, hasRequiredException, snippet, hasRequiredSnippet, type, hasRequiredType, schema, hasRequiredSchema, str, hasRequiredStr, seq, hasRequiredSeq, map, hasRequiredMap, failsafe, hasRequiredFailsafe, _null, hasRequired_null, bool, hasRequiredBool, int, hasRequiredInt, float, hasRequiredFloat, json, hasRequiredJson, core, hasRequiredCore, timestamp, hasRequiredTimestamp, merge, hasRequiredMerge, binary, hasRequiredBinary, omap, hasRequiredOmap, pairs, hasRequiredPairs, set, hasRequiredSet, _default, hasRequired_default, hasRequiredLoader, dumper, hasRequiredDumper, hasRequiredJsYaml, jsYamlExports, yaml, Type, Schema, FAILSAFE_SCHEMA, JSON_SCHEMA, CORE_SCHEMA, DEFAULT_SCHEMA, load, loadAll, dump, YAMLException, types, safeLoad, safeLoadAll, safeDump;
var init_js_yaml = __esm(() => {
  jsYaml = {};
  loader = {};
  common = {};
  dumper = {};
  jsYamlExports = requireJsYaml();
  yaml = /* @__PURE__ */ getDefaultExportFromCjs(jsYamlExports);
  ({
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
  } = yaml);
});

// src/engine/loader.ts
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
var ENTRY_RE, BOOK_RE, isObj2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var init_loader = __esm(() => {
  init_js_yaml();
  init_ruleset();
  ENTRY_RE = /^\s*(?:\[[^\]]*\]\s*)?warp[-_ ]?ruleset\b/i;
  BOOK_RE = /^\s*warp[-_ ]?ruleset\b/i;
});

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
  const names = [...r.statOrder, ...Object.keys(r.flags), ...BUILTIN_NAMES];
  const check = (src, where, extra = {}, dungeon = false) => {
    if (src === undefined || typeof src === "number")
      return;
    const base = makeEnv(r, s, extra);
    const env = { lookup: base.lookup, call: (n, a) => n === "roll" ? 1 : dungeon && (n === "bag" || n === "rel_bond") ? 0 : base.call?.(n, a) };
    const unknown = new Set;
    try {
      evaluate(src, env, { unknown });
    } catch {
      return;
    }
    for (const u of unknown) {
      const isCall = u.endsWith("()");
      const msg = isCall ? `"${u}" isn't a known function (${FUNCTIONS.join(", ")})` : `"${u}" isn't a stat, flag or clock value${suggest(u, [...names, ...Object.keys(extra)])}`;
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
    for (const id of e.wear) {
      if (!r.items[id]?.slot)
        issues.push({ level: "warning", where, message: `wears "${id}", which isn't clothing (an item with a slot)${suggest(id, Object.keys(r.items))}` });
    }
    const slots = r.wardrobe.slots.map((s) => s.id);
    for (const slot of [...e.undress, ...Object.keys(e.damage)]) {
      if (!slots.includes(slot))
        issues.push({ level: "warning", where, message: `"${slot}" isn't a wardrobe slot${suggest(slot, slots)}` });
    }
    for (const [slot, v] of Object.entries(e.damage))
      check(v, `${where} › damage › ${slot}`, extra);
    if (e.startEncounter && !r.encounters[e.startEncounter]) {
      issues.push({ level: "warning", where, message: `starts encounter "${e.startEncounter}", which doesn't exist${suggest(e.startEncounter, Object.keys(r.encounters))}` });
    }
    for (const id of e.unlock) {
      if (!r.codex[id])
        issues.push({ level: "warning", where, message: `unlocks codex "${id}", which doesn't exist${suggest(id, Object.keys(r.codex))}` });
    }
    for (const [stat, v] of Object.entries(e.foe)) {
      const known = Object.values(r.encounters).some((enc) => enc.foe.stats.some((s) => s.id === stat));
      if (!known)
        issues.push({ level: "warning", where, message: `changes foe stat "${stat}", which no encounter declares` });
      check(v, `${where} › foe › ${stat}`, extra);
    }
    for (const [id, v] of Object.entries(e.front)) {
      if (!r.fronts[id])
        issues.push({ level: "warning", where, message: `moves front "${id}", which doesn't exist${suggest(id, Object.keys(r.fronts))}` });
      check(v, `${where} › front › ${id}`, extra);
    }
    for (const id of e.reveal) {
      if (!r.secrets[id])
        issues.push({ level: "warning", where, message: `reveals secret "${id}", which doesn't exist${suggest(id, Object.keys(r.secrets))}` });
    }
    if (e.gauge !== undefined) {
      if (!r.randomEvents.enabled)
        issues.push({ level: "warning", where, message: "moves the event gauge, but there are no random events" });
      check(e.gauge, `${where} › gauge`, extra);
    }
  };
  for (const id of r.statOrder)
    check(r.stats[id].maxExpr, `Stats › ${id} › max`);
  const checkAction = (a, w) => {
    const extra = Object.fromEntries(a.params.map((p) => [p.id, p.options[p.default]]));
    if (a.perPerson)
      extra.target = Object.keys(r.people)[0] ?? "someone";
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
  };
  for (const a of Object.values(r.actions))
    checkAction(a, `Actions › ${a.id}`);
  for (const t of r.triggers) {
    check(t.when, `Triggers › ${t.id} › when`);
    checkEffect(t.effects, `Triggers › ${t.id}`);
  }
  for (const p of Object.values(r.people))
    p.schedule.forEach((e, i) => check(e.when, `People › ${p.id} › schedule #${i + 1}`));
  for (const c of Object.values(r.codex))
    check(c.unlock, `Codex › ${c.id} › unlock`);
  for (const f of Object.values(r.feats)) {
    check(f.unlock, `Feats › ${f.id} › unlock`);
    checkEffect(f.reward, `Feats › ${f.id} › reward`);
  }
  for (const p of Object.values(r.perks)) {
    check(p.requires, `Perks › ${p.id} › requires`);
    checkEffect(p.effects, `Perks › ${p.id}`);
  }
  for (const enc of Object.values(r.encounters)) {
    const w = `Encounters › ${enc.id}`;
    for (const a of Object.values(enc.actions))
      checkAction(a, `${w} › actions › ${a.id}`);
    if (enc.foeMoves)
      for (const o of enc.foeMoves.options)
        checkEffect(o.effect, `${w} › foe_moves › ${o.id}`);
    for (const e of enc.endWhen)
      check(e.when, `${w} › end_when › ${e.outcome}`);
    for (const [o, e] of Object.entries(enc.outcomes))
      checkEffect(e, `${w} › outcomes › ${o}`);
    checkEffect(enc.start, `${w} › start`);
    if (!enc.endWhen.length && !Object.values(enc.actions).some((a) => [a.effects, ...Object.values(a.outcomes)].some((e) => e?.end))) {
      issues.push({ level: "warning", where: w, message: "has no way to end — add `end_when:` or an action with `end:`" });
    }
  }
  for (const id of r.hud.bars)
    if (!r.stats[id])
      issues.push({ level: "warning", where: "HUD › bars", message: `"${id}" isn't a stat` });
  for (const sec of Object.values(r.secrets))
    sec.stages.forEach((st, i) => check(st.when, `Secrets › ${sec.id} › stage ${i + 1} › when`));
  for (const f of Object.values(r.fronts)) {
    const w = `Fronts › ${f.id}`;
    check(f.rate, `${w} › per_day`);
    check(f.perTurn, `${w} › per_turn`);
    check(f.when, `${w} › when`);
    f.stages.forEach((st, i) => checkEffect(st.effects, `${w} › stage ${i + 1}`));
    const moved = f.pushes.length > 0 || f.rate !== 0 || f.perTurn !== 0;
    if (!moved)
      issues.push({ level: "warning", where: w, message: "never moves on its own — give it `per_day:`, `per_turn:` or `story:` pushes (or move it with `front:` effects)" });
  }
  if (r.randomEvents.enabled) {
    check(r.randomEvents.perDay, "Random events › per_day");
    check(r.randomEvents.perTurn, "Random events › per_turn");
    for (const e of Object.values(r.randomEvents.events)) {
      check(e.when, `Random events › ${e.id} › when`);
      checkEffect(e.effects, `Random events › ${e.id}`);
    }
  }
  check(r.liveChoices.when, "Live choices › when");
  for (const d of Object.values(r.dungeons)) {
    const w = `Dungeons › ${d.id}`;
    const dx = { depth: 1, target: Object.keys(r.people)[0] ?? "someone" };
    check(d.when, `${w} › when`);
    check(d.party.when, `${w} › party › when`, dx);
    for (const [k, v] of Object.entries(d.player))
      if (k !== "class" && k !== "sprite")
        check(v, `${w} › player › ${k}`);
    for (const loc of d.at)
      if (Object.keys(r.locations).length && !r.locations[loc])
        issues.push({ level: "warning", where: `${w} › at`, message: `"${loc}" isn't a declared location${suggest(loc, Object.keys(r.locations))}` });
    for (const l of d.loot)
      if (!r.items[l.item] && !r.itemsOpen)
        issues.push({ level: "warning", where: `${w} › loot`, message: `"${l.item}" isn't a declared item` });
    if (d.currency && !r.stats[d.currency])
      issues.push({ level: "warning", where: `${w} › currency`, message: `"${d.currency}" isn't a stat` });
    checkEffect(d.onLeave, `${w} › on_leave`);
    checkEffect(d.onDefeat, `${w} › on_defeat`);
    for (const [kind, list] of [["events", d.events], ["romance", d.romance]]) {
      for (const ev of Object.values(list))
        for (const c of ev.choices) {
          const cw = `${w} › ${kind} › ${ev.id} › ${c.id}`;
          check(c.chance, `${cw} › chance`, dx, true);
          check(c.when, `${cw} › when`, dx, true);
          for (const o of [c.success, c.fail]) {
            if (!o)
              continue;
            check(o.gold, `${cw} › gold`, dx, true);
            check(o.xp, `${cw} › xp`, dx, true);
            checkEffect(o.effect, cw, dx);
            if (o.fight && o.fight !== "enemy" && o.fight !== "elite" && !d.monsters[o.fight])
              issues.push({ level: "warning", where: cw, message: `fights "${o.fight}", which isn't a monster here` });
          }
        }
    }
    for (const m of Object.values(d.monsters))
      for (const sk of m.skills)
        if (!SKILLS[sk])
          issues.push({ level: "warning", where: `${w} › monsters › ${m.id}`, message: `"${sk}" isn't a skill` });
  }
  for (const a of Object.values(r.liveChoices.tags))
    checkAction(a, `Live choices › tags › ${a.id}`);
  return issues;
}
var FUNCTIONS;
var init_lint = __esm(() => {
  init_expr();
  init_state();
  init_content();
  FUNCTIONS = [
    "has",
    "count",
    "flag",
    "cond",
    "at",
    "rel",
    "met",
    "between",
    "roll",
    "wearing",
    "worn",
    "trait",
    "present",
    "where",
    "codex",
    "feat",
    "perk",
    "secret",
    "front",
    "front_stage",
    "happened",
    "deepest",
    "min",
    "max",
    "clamp",
    "floor",
    "ceil",
    "round",
    "abs"
  ];
});

// src/backend/source.ts
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
    cardKind: character && looksLikeScenario(character) ? "scenario" : "character",
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
    return { state: "none", name: null, source: null, issues: l?.issues ?? [], characterName: l?.characterName ?? null, cardKind: l?.cardKind ?? "character", tags: [] };
  }
  const tags = new Set;
  for (const a of Object.values(l.ruleset?.actions ?? {}))
    for (const t of a.tags)
      tags.add(t);
  for (const a of Object.values(l.ruleset?.liveChoices.tags ?? {}))
    for (const t of a.tags)
      tags.add(t);
  return {
    state: l.ruleset ? "ok" : "broken",
    name: l.ruleset?.name ?? null,
    source: l.source,
    issues: l.issues,
    characterName: l.characterName,
    cardKind: l.cardKind,
    tags: [...tags].sort()
  };
}
async function installTemplate(chatId, templateId, userId, trackCharacter) {
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
    const track = trackCharacter ?? !looksLikeScenario(character);
    if (part.label === "people" && character.name && track)
      content = withCharacter(content, character.name);
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
var TTL_MS = 8000, byCharacter, chatCharacter, knownRulesetEntryIds, knownRulesetBookIds;
var init_source = __esm(() => {
  init_loader();
  init_lint();
  init_templates();
  byCharacter = new Map;
  chatCharacter = new Map;
  knownRulesetEntryIds = new Set;
  knownRulesetBookIds = new Set;
});

// src/engine/dungeon/battle.ts
function say(b, line) {
  b.log = [...b.log, line].slice(-LOG_KEPT);
}
function rngFor(b, seed, who) {
  return seededRng(`${seed}:${b.at}:${b.round}:${b.queue.length}:${who}:${b.log.length}`);
}
function variance(rng) {
  return 0.85 + rng() * 0.3;
}
function skillCost(s) {
  return s.mp ? `${s.mp} MP` : s.tp ? `${s.tp} TP` : "";
}
function canUse(f, s) {
  if (f.side === "foe")
    return true;
  return f.mp >= s.mp && f.tp >= s.tp;
}
function hit(b, a, t, s, rng, ignoreGuard = false) {
  let dmg;
  if (s.kind === "phys")
    dmg = Math.max(1, a.atk * 3 - t.def * 1.5) * s.power;
  else
    dmg = Math.max(1, 15 + a.mat * 2.5 - t.mdf) * s.power;
  dmg *= variance(rng);
  const crit = s.kind === "phys" && rng() < 0.05 + (s.crit ?? 0);
  if (crit)
    dmg *= 1.8;
  if (t.guard && !ignoreGuard)
    dmg *= 0.5;
  const n = Math.max(1, Math.round(dmg));
  t.hp = Math.max(0, t.hp - n);
  t.tp = Math.min(100, t.tp + Math.round(n / Math.max(1, t.mhp) * 40));
  say(b, `${a.name} ${s.id === "attack" ? "hits" : `uses ${s.name} on`} ${t.name} for ${n}${crit ? " (critical!)" : ""}.${t.hp <= 0 ? ` ${t.name} ${t.side === "foe" ? "is defeated" : "goes down"}!` : ""}`);
  if (s.drain && n > 0)
    a.hp = Math.min(a.mhp, a.hp + Math.round(n * s.drain));
  return n;
}
function heal(b, a, t, s, rng) {
  const n = Math.round((20 + a.mat * 2.5) * s.power * variance(rng));
  const before = t.hp;
  t.hp = Math.min(t.mhp, t.hp + n);
  say(b, `${a.name} uses ${s.name}${t.id === a.id ? "" : ` on ${t.name}`} (+${t.hp - before} HP).`);
}
function targetsFor(b, a, s, chosen, rng) {
  const mine = b.fighters.filter((f) => f.side === a.side && alive(f));
  const theirs = b.fighters.filter((f) => f.side !== a.side && alive(f));
  const byId = (list) => list.find((f) => f.id === chosen);
  switch (s.target) {
    case "self":
      return [a];
    case "foes":
      return theirs;
    case "allies":
      return mine;
    case "ally": {
      const t = byId(mine);
      if (t)
        return [t];
      return mine.length ? [mine.reduce((x, y) => y.hp / y.mhp < x.hp / x.mhp ? y : x)] : [];
    }
    case "foe": {
      const t = byId(theirs);
      if (t)
        return [t];
      return theirs.length ? [theirs[Math.floor(rng() * theirs.length)]] : [];
    }
  }
}
function useSkill(b, a, s, target, rng) {
  if (a.side === "party") {
    a.mp -= s.mp;
    a.tp -= s.tp;
  }
  if (s.kind === "guard") {
    a.guard = true;
    a.tp = Math.min(100, a.tp + 10);
    say(b, `${a.name} guards.`);
    return;
  }
  const ts = targetsFor(b, a, s, target, rng);
  for (const t of ts) {
    if (s.kind === "heal")
      heal(b, a, t, s, rng);
    else
      hit(b, a, t, s, rng);
  }
  if (a.side === "party" && s.tp === 0)
    a.tp = Math.min(100, a.tp + 6);
}
function outcome(b) {
  if (!foesOf(b).some(alive))
    return "won";
  if (!partyOf(b).some(alive))
    return "lost";
  return null;
}
function newRound(b, seed) {
  b.round += 1;
  const rng = seededRng(`${seed}:${b.at}:order:${b.round}`);
  b.queue = b.fighters.filter(alive).map((f) => ({ id: f.id, v: f.agi * (0.8 + rng() * 0.4) })).sort((x, y) => y.v - x.v).map((x) => x.id);
}
function foeTurn(b, f, seed) {
  const rng = rngFor(b, seed, f.id);
  const allies = foesOf(b).filter(alive);
  const hurtAlly = allies.some((x) => x.hp < x.mhp * 0.5);
  const options = f.skills.map((id) => SKILLS[id]).filter((s) => !!s && (s.kind !== "heal" || hurtAlly));
  if (!options.length)
    options.push(SKILLS.attack);
  const weights = options.map((_, i) => i === 0 ? 3 : 1);
  let x = rng() * weights.reduce((n, w) => n + w, 0);
  let pick = options[0];
  for (let i = 0;i < options.length; i++) {
    x -= weights[i];
    if (x <= 0) {
      pick = options[i];
      break;
    }
  }
  useSkill(b, f, pick, undefined, rng);
}
function advance(b, seed) {
  for (let guard = 0;guard < 200 && !b.over; guard++) {
    if (!b.queue.length)
      newRound(b, seed);
    const id = b.queue[0];
    const f = b.fighters.find((x) => x.id === id);
    if (!f || !alive(f)) {
      b.queue.shift();
      continue;
    }
    f.guard = false;
    if (f.side === "party") {
      b.active = f.id;
      return b;
    }
    b.queue.shift();
    foeTurn(b, f, seed);
    b.over = outcome(b);
  }
  b.active = null;
  return b;
}
function startBattle(kind, at, party, foes, seed) {
  const b = { kind, at, round: 0, fighters: [...party, ...foes].map((f) => ({ ...f, guard: false })), queue: [], active: null, log: [], over: null };
  say(b, foes.length === 1 ? `${foes[0].name} attacks!` : `${foes.length} enemies attack!`);
  return advance(b, seed);
}
function command(prev, cmd, seed, opts) {
  const b = structuredClone(prev);
  const a = b.fighters.find((f) => f.id === b.active);
  if (!a || b.over)
    return { b: prev, used: null, error: "Nobody is waiting to act." };
  const rng = rngFor(b, seed, a.id);
  let used = null;
  if ("escape" in cmd) {
    if (b.kind === "boss")
      return { b: prev, used: null, error: "There's no escaping this fight." };
    const avg = (xs) => xs.reduce((n, f) => n + f.agi, 0) / Math.max(1, xs.length);
    const chance = Math.min(0.9, Math.max(0.15, 0.5 + (avg(partyOf(b).filter(alive)) - avg(foesOf(b).filter(alive))) * 0.03));
    if (rng() < chance) {
      say(b, "The party escapes!");
      b.over = "fled";
      b.active = null;
      return { b, used };
    }
    say(b, "The party tries to flee, but can't get away!");
  } else if ("item" in cmd) {
    used = cmd.item;
    if (cmd.item === "bomb") {
      for (const t of foesOf(b).filter(alive)) {
        const n = Math.round((25 + opts.depth * 8) * variance(rng));
        t.hp = Math.max(0, t.hp - n);
        say(b, `The bomb blasts ${t.name} for ${n}.${t.hp <= 0 ? ` ${t.name} is defeated!` : ""}`);
      }
    } else {
      const mine = partyOf(b).filter(alive);
      const t = mine.find((f) => f.id === cmd.target) ?? a;
      if (cmd.item === "potion") {
        const before = t.hp;
        t.hp = Math.min(t.mhp, t.hp + Math.ceil(t.mhp / 2));
        say(b, `${a.name} uses a potion${t.id === a.id ? "" : ` on ${t.name}`} (+${t.hp - before} HP).`);
      } else {
        const before = t.mp;
        t.mp = Math.min(t.mmp, t.mp + Math.ceil(t.mmp / 2));
        say(b, `${a.name} uses an ether${t.id === a.id ? "" : ` on ${t.name}`} (+${t.mp - before} MP).`);
      }
    }
  } else {
    const s = SKILLS[cmd.skill];
    if (!s || s.id !== "attack" && s.id !== "guard" && !a.skills.includes(s.id))
      return { b: prev, used: null, error: "Unknown skill." };
    if (!canUse(a, s))
      return { b: prev, used: null, error: `Not enough ${s.mp ? "MP" : "TP"}.` };
    useSkill(b, a, s, cmd.target, rng);
  }
  b.queue.shift();
  b.active = null;
  b.over = outcome(b);
  return { b: advance(b, seed), used };
}
function autoCommand(b, bag) {
  const a = b.fighters.find((f) => f.id === b.active);
  const mine = partyOf(b).filter(alive);
  const theirs = foesOf(b).filter(alive);
  const low = mine.filter((f) => f.hp < f.mhp * 0.35).sort((x, y) => x.hp / x.mhp - y.hp / y.mhp)[0];
  const usable = a.skills.map((id) => SKILLS[id]).filter((s) => !!s && canUse(a, s));
  if (low) {
    const h = usable.find((s) => s.kind === "heal");
    if (h)
      return { skill: h.id, target: low.id };
    if ((bag.potion ?? 0) > 0 && low.hp < low.mhp * 0.25)
      return { item: "potion", target: low.id };
  }
  const weakest = theirs.sort((x, y) => x.hp - y.hp)[0];
  const aoe = usable.find((s) => s.target === "foes" && s.kind !== "heal");
  if (aoe && theirs.length >= 2)
    return { skill: aoe.id };
  const strong = usable.filter((s) => s.target === "foe" && s.kind !== "heal").sort((x, y) => y.power - x.power)[0];
  if (strong && (strong.tp > 0 || strong.mp <= a.mp - 4 || a.mmp === 0))
    return { skill: strong.id, target: weakest?.id };
  return { skill: "attack", target: weakest?.id };
}
var LOG_KEPT = 14, alive = (f) => f.hp > 0, partyOf = (b) => b.fighters.filter((f) => f.side === "party"), foesOf = (b) => b.fighters.filter((f) => f.side === "foe");
var init_battle = __esm(() => {
  init_dice();
  init_content();
});

// src/engine/dungeon/floor.ts
function floorSize(d, depth) {
  return Math.min(9, Math.max(3, d.size + Math.floor((depth - 1) / 3)));
}
function isBossFloor(d, depth) {
  return d.bossEvery > 0 && depth % d.bossEvery === 0;
}
function pick(weights, rng) {
  const total = weights.reduce((n, [, w]) => n + Math.max(0, w), 0);
  let x = rng() * total;
  for (const [k, w] of weights) {
    x -= Math.max(0, w);
    if (x <= 0)
      return k;
  }
  return weights[weights.length - 1][0];
}
function generateFloor(d, seed, depth) {
  const rng = seededRng(`${seed}:floor:${depth}`);
  const n = floorSize(d, depth);
  const start = [Math.floor(rng() * n), n - 1];
  const far = [];
  let best = [0, 0];
  let bestD = -1;
  for (let y = 0;y < n; y++)
    for (let x = 0;x < n; x++) {
      const dist = Math.abs(x - start[0]) + Math.abs(y - start[1]);
      if (dist >= Math.ceil(n * 0.8))
        far.push([x, y]);
      if (dist > bestD) {
        bestD = dist;
        best = [x, y];
      }
    }
  const stairs = far.length ? far[Math.floor(rng() * far.length)] : best;
  const boss = isBossFloor(d, depth);
  const tiles = Array.from({ length: n }, () => Array(n).fill("empty"));
  const counts = {};
  const weights = Object.entries(d.tiles);
  for (let y = 0;y < n; y++)
    for (let x = 0;x < n; x++) {
      if (x === start[0] && y === start[1]) {
        tiles[y][x] = "start";
        continue;
      }
      if (x === stairs[0] && y === stairs[1]) {
        tiles[y][x] = boss ? "boss" : "stairs";
        continue;
      }
      const nearStart = Math.abs(x - start[0]) + Math.abs(y - start[1]) <= 1;
      const allowed = weights.filter(([k]) => (CAPS[k] === undefined || (counts[k] ?? 0) < CAPS[k]) && !(nearStart && k === "elite"));
      const kind = pick(allowed, rng);
      counts[kind] = (counts[kind] ?? 0) + 1;
      tiles[y][x] = kind;
    }
  return { size: n, depth, start, stairs, boss, tiles };
}
function tileAt(f, x, y) {
  return x >= 0 && y >= 0 && x < f.size && y < f.size ? f.tiles[y][x] : null;
}
function adjacent(a, b) {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;
}
var key2 = (x, y) => `${x},${y}`, CAPS;
var init_floor = __esm(() => {
  init_dice();
  CAPS = { elite: 2, shop: 1, rest: 1, romance: 2 };
});

// src/engine/dungeon/run.ts
function hash(s) {
  let h = 2166136261;
  for (let i = 0;i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function dungeonOf(r, run) {
  return r.dungeons[run.id] ?? null;
}
function dgEnv(t, run, extra = {}) {
  const base = makeEnv(t.r, t.s, { depth: run?.depth ?? 1, ...extra });
  return {
    lookup: base.lookup,
    call(name, args) {
      if (name === "bag")
        return run?.bag[String(args[0])] ?? 0;
      if (name === "rel_bond")
        return bondOf(t.r, t.s, String(args[0] ?? ""));
      return base.call?.(name, args);
    }
  };
}
function bondOf(r, s, who) {
  const stats = r.relStatOrder.map((id) => r.relStats[id]).filter((d) => d.good === "high");
  if (!stats.length)
    return 0;
  return stats.reduce((n, d) => n + (s.rel[who]?.[d.id] ?? d.start), 0) / stats.length;
}
function classFor(d, who) {
  if (who === PLAYER)
    return d.player.class;
  return d.party.classes[who] ?? CLASS_IDS.filter((c) => c !== "adventurer")[hash(who) % 4];
}
function memberFighter(r, s, d, run, m) {
  const cls = classFor(d, m.id);
  const base = CLASSES[cls];
  const env = makeEnv(r, s);
  const scale = levelScale(levelOf(run.xp));
  const stat = (k) => {
    const f = m.id === PLAYER ? d.player[k] : undefined;
    const v = f !== undefined ? evalNumber(f, env, base[k]) : base[k];
    return Math.max(k === "hp" ? 1 : 0, Math.round(v * scale));
  };
  const mhp = stat("hp"), mmp = stat("mp");
  const name = m.id === PLAYER ? "{{user}}" : personName(r, s, m.id);
  return {
    id: m.id,
    side: "party",
    name,
    sprite: m.id === PLAYER && d.player.sprite ? d.player.sprite : PARTY_SPRITES[cls][hash(m.id === PLAYER ? "player" : name) % PARTY_SPRITES[cls].length],
    hp: Math.min(m.hp, mhp),
    mhp,
    mp: Math.min(m.mp, mmp),
    mmp,
    tp: m.tp,
    atk: stat("atk"),
    def: stat("def"),
    mat: stat("mat"),
    mdf: stat("mdf"),
    agi: stat("agi"),
    skills: base.skills,
    guard: false
  };
}
function fullVitals(r, s, d, run, id) {
  const f = memberFighter(r, s, d, run, { id, hp: 1e9, mp: 1e9, tp: 0 });
  return { id, hp: f.mhp, mp: f.mmp, tp: 0 };
}
function dungeonsHere(r, s) {
  if (s.dungeon || s.encounter)
    return [];
  const env = makeEnv(r, s);
  return Object.values(r.dungeons).filter((d) => (!d.at.length || d.at.includes(s.location ?? "")) && (!d.when || evalBool(d.when, env, true)));
}
function eligibleCompanions(r, s, d) {
  const here = new Set(presentPeople(r, s, makeEnv(r, s)));
  return Object.keys(s.people).filter((id) => !s.forgotten[id]).filter((id) => !d.party.when || evalBool(d.party.when, makeEnv(r, s, { target: id }), true)).map((id) => ({ id, name: personName(r, s, id), present: here.has(id), cls: classFor(d, id) }));
}
function log(t, text) {
  t.push({ t: "dg_log", text, src: "action" });
}
function party(t, members) {
  t.push({ t: "dg_party", party: members, src: "action" });
}
function changeVitals(t, d, run, opts) {
  const next = run.party.map((m) => {
    if (opts.only && !opts.only.includes(m.id))
      return m;
    const f = memberFighter(t.r, t.s, d, run, m);
    let hp = m.hp;
    if (opts.heal)
      hp = Math.min(f.mhp, hp + Math.ceil(f.mhp * opts.heal / 100));
    if (opts.hurt)
      hp = Math.max(m.id === PLAYER ? 1 : 0, hp - Math.ceil(f.mhp * opts.hurt / 100));
    const mp = opts.mana ? Math.min(f.mmp, m.mp + Math.ceil(f.mmp * opts.mana / 100)) : m.mp;
    return { ...m, hp, mp };
  });
  party(t, next);
}
function tell(t, d, run, moment) {
  const recent = (t.s.dungeon?.untold ?? []).slice(-6);
  const where = `${d.name}, floor ${run.depth}`;
  t.announce(`Dungeon (${where})${recent.length ? ` — since last time: ${recent.join(" ")}` : ""} Now: ${moment}`);
  t.push({ t: "dg_told", src: "action" });
}
function weighted(items, weight, rng) {
  const total = items.reduce((n, x) => n + Math.max(0, weight(x)), 0);
  if (total <= 0)
    return null;
  let x = rng() * total;
  for (const it of items) {
    x -= Math.max(0, weight(it));
    if (x <= 0)
      return it;
  }
  return items[items.length - 1] ?? null;
}
function foeFrom(mon, id, depth, from, extra = {}) {
  const k = depthScale(depth, from) * (extra.scale ?? 1);
  const hpk = extra.elite ? 1.8 : 1;
  const hp = Math.round(mon.hp * k * hpk);
  return {
    id,
    side: "foe",
    name: extra.elite ? `Elite ${mon.name}` : mon.name,
    sprite: mon.sprite,
    hp,
    mhp: hp,
    mp: 0,
    mmp: 0,
    tp: 0,
    atk: Math.round(mon.atk * k * (extra.elite ? 1.15 : 1)),
    def: Math.round(mon.def * k),
    mat: Math.round(mon.mat * k),
    mdf: Math.round(mon.mdf * k),
    agi: Math.round(mon.agi * (1 + 0.03 * Math.max(0, depth - from))),
    skills: mon.skills,
    guard: false,
    xp: Math.round(mon.xp * k * (extra.elite ? 2.2 : extra.boss ? 1 : 1)),
    gold: Math.round(mon.gold * k * (extra.elite ? 2 : 1)),
    ...extra.elite ? { elite: true } : {},
    ...extra.boss ? { boss: true } : {}
  };
}
function nameDupes(foes) {
  const counts = new Map;
  for (const f of foes)
    counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
  const seen = new Map;
  return foes.map((f) => {
    if ((counts.get(f.name) ?? 0) < 2)
      return f;
    const n = (seen.get(f.name) ?? 0) + 1;
    seen.set(f.name, n);
    return { ...f, name: `${f.name} ${String.fromCharCode(64 + n)}` };
  });
}
function rollFoes(d, run, at, kind, pick) {
  const rng = seededRng(`${run.seed}:foes:${run.depth}:${at}:${kind}`);
  const depth = run.depth;
  const monsters = Object.values(d.monsters).filter((m) => m.tier <= 4 && m.id !== "mimic");
  const inTier = (tier) => {
    for (let t = tier;t >= 1; t--) {
      const list = monsters.filter((m) => m.tier === t);
      if (list.length)
        return list;
    }
    return monsters.length ? monsters : [];
  };
  const bandStart = (tier) => 1 + (tier - 1) * 3;
  const one = (tier) => {
    const list = inTier(tier);
    return list[Math.floor(rng() * list.length)];
  };
  if (pick && d.monsters[pick])
    return [foeFrom(d.monsters[pick], `${pick}#1`, depth, bandStart(d.monsters[pick].tier))];
  if (kind === "mimic")
    return [foeFrom(d.monsters.mimic ?? monsters[0], "mimic#1", depth, 1)];
  if (kind === "boss") {
    const n = Math.max(1, Math.floor(depth / Math.max(1, d.bossEvery)));
    const id = d.bosses[Math.min(n, d.bosses.length) - 1];
    const extra = n > d.bosses.length ? 1 + 0.35 * (n - d.bosses.length) : 1;
    const boss = foeFrom(d.monsters[id], `${id}#1`, depth, depth, { boss: true, scale: extra });
    return [boss];
  }
  const tier = tierFor2(depth);
  if (kind === "elite") {
    const t = Math.min(4, tier + 1);
    const mon = one(t);
    const out = [foeFrom(mon, `${mon.id}#e`, depth, bandStart(t) + 1, { elite: true })];
    if (rng() < 0.5) {
      const m2 = one(tier);
      out.push(foeFrom(m2, `${m2.id}#1`, depth, bandStart(tier)));
    }
    return nameDupes(out);
  }
  const count = 1 + (rng() < 0.55 ? 1 : 0) + (depth >= 3 && rng() < 0.35 ? 1 : 0);
  const out = [];
  for (let i = 0;i < count; i++) {
    const mon = rng() < 0.2 && tier > 1 ? one(tier - 1) : one(tier);
    if (mon)
      out.push(foeFrom(mon, `${mon.id}#${i + 1}`, depth, bandStart(mon.tier)));
  }
  return nameDupes(out);
}
function beginBattle(t, d, run, at, kind, pick) {
  const foes = rollFoes(d, run, at, kind, pick);
  const members = run.party.map((m) => memberFighter(t.r, t.s, d, run, m));
  const b = startBattle(kind, at, members, foes, `${run.seed}:${run.depth}:${at}`);
  t.push({ t: "dg_battle", battle: b, src: "action" });
  log(t, kind === "boss" ? `${foes[0].name} blocks the way down!` : `Ambushed by ${foes.map((f) => f.name).join(", ")}.`);
}
function enterDungeon(r, s, id, companions, seed) {
  const d = r.dungeons[id];
  if (!d)
    return fail("There's no such dungeon.");
  if (s.dungeon)
    return fail("You're already in a dungeon.");
  if (!dungeonsHere(r, s).some((x) => x.id === id))
    return fail(`${d.name} can't be entered from here.`);
  const allowed = new Set(eligibleCompanions(r, s, d).map((c) => c.id));
  const chosen = [...new Set(companions)].filter((c) => allowed.has(c)).slice(0, d.party.max);
  const events = buildTurn(r, s, seed, (t) => {
    const floor = generateFloor(d, seed, 1);
    const run = {
      id,
      seed,
      depth: 1,
      pos: floor.start,
      seen: [key2(...floor.start)],
      cleared: [key2(...floor.start)],
      party: [],
      xp: 0,
      gold: 0,
      bag: { potion: 2, ether: 0, bomb: 0 },
      loot: {},
      battle: null,
      pending: null,
      log: [],
      untold: []
    };
    run.party = [PLAYER, ...chosen].map((m) => fullVitals(t.r, t.s, d, run, m));
    t.push({ t: "dg_enter", run, src: "action" });
    t.time(10, "action");
    const withWho = chosen.length ? ` with ${chosen.map((c) => personName(r, s, c)).join(" and ")}` : " alone";
    tell(t, d, run, `{{user}} goes down into ${d.name}${withWho}.${d.desc ? ` ${d.desc}` : ""}`);
  });
  return { events, narrate: { say: `*I head down into ${d.name}.*` } };
}
function moveTo(r, s, x, y) {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d)
    return fail("You're not in a dungeon.");
  if (run.battle)
    return fail("Finish the fight first.");
  if (run.pending)
    return fail("Decide what to do here first.");
  const floor = generateFloor(d, run.seed, run.depth);
  const kind = tileAt(floor, x, y);
  if (!kind)
    return fail("That's outside the floor.");
  if (!adjacent(run.pos, [x, y]))
    return fail("You can only move to a neighbouring tile.");
  const k = key2(x, y);
  let narrate;
  const events = buildTurn(r, s, `${run.seed}:${run.depth}:${k}`, (t) => {
    t.push({ t: "dg_step", x, y, src: "action" });
    t.time(5, "action");
    if (run.cleared.includes(k) || kind === "stairs" || kind === "shop" && run.seen.includes(k))
      return;
    narrate = resolveTile(t, d, t.s.dungeon, floor, k, kind);
  });
  return { events, ...narrate ? { narrate } : {} };
}
function resolveTile(t, d, run, floor, k, kind) {
  const rng = seededRng(`${run.seed}:tile:${run.depth}:${k}`);
  const clear = () => t.push({ t: "dg_clear", key: k, src: "action" });
  switch (kind) {
    case "start":
    case "empty":
      clear();
      return;
    case "enemy":
    case "elite":
    case "boss":
      beginBattle(t, d, run, k, kind);
      return;
    case "treasure":
      treasure(t, d, run, rng, 1);
      clear();
      return;
    case "trap": {
      const agi = Math.max(...run.party.filter((m) => m.hp > 0).map((m) => memberFighter(t.r, t.s, d, run, m).agi));
      const chance = Math.min(0.9, Math.max(0.1, 0.35 + agi * 0.02));
      if (rng() < chance)
        log(t, "A trap clicks underfoot — the party spots it in time.");
      else {
        const pct = 8 + Math.floor(rng() * 8);
        changeVitals(t, d, run, { hurt: pct });
        log(t, `A trap springs! Darts pepper the party (−${pct}% HP).`);
      }
      clear();
      return;
    }
    case "rest":
      changeVitals(t, d, run, { heal: 35, mana: 35 });
      t.time(30, "action");
      log(t, "A quiet spring. The party rests and recovers.");
      clear();
      return;
    case "shop":
      log(t, "A travelling merchant has set up shop here.");
      return;
    case "event": {
      const ev = pickEvent2(t, d, run, Object.values(d.events), rng);
      clear();
      if (!ev)
        return;
      t.push({ t: "dg_pending", pending: { kind: "event", id: ev.id, at: k }, src: "action" });
      log(t, fillText(ev.text, t, null));
      return;
    }
    case "romance": {
      const mates = run.party.filter((m) => m.id !== PLAYER && m.hp > 0 && isAdult(t.r, m.id));
      clear();
      if (!mates.length) {
        changeVitals(t, d, run, { heal: 10 });
        log(t, "A peaceful grotto. {{user}} takes a moment to breathe.");
        return;
      }
      const who = mates[Math.floor(rng() * mates.length)].id;
      const ev = pickEvent2(t, d, run, Object.values(d.romance), rng);
      if (!ev)
        return;
      t.push({ t: "dg_pending", pending: { kind: "romance", id: ev.id, at: k, target: who }, src: "action" });
      log(t, fillText(ev.text, t, who));
      return;
    }
    case "surprise": {
      const roll = weighted(["treasure", "mimic", "event", "trap", "rest"], (x) => ({ treasure: 30, mimic: 20, event: 25, trap: 10, rest: 15 })[x], rng);
      log(t, "Something unexpected…");
      if (roll === "treasure") {
        treasure(t, d, run, rng, 2);
        clear();
        return;
      }
      if (roll === "mimic") {
        log(t, "The chest has teeth! A mimic!");
        beginBattle(t, d, run, k, "mimic");
        return;
      }
      return resolveTile(t, d, run, floor, k, roll);
    }
  }
  return;
}
function pickEvent2(t, d, run, list, rng) {
  return weighted(list.filter((e) => e.minDepth <= run.depth), (e) => e.weight, rng);
}
function treasure(t, d, run, rng, mult) {
  const gold = Math.round((8 + rng() * 10) * (1 + 0.3 * (run.depth - 1)) * mult);
  const found = [`${gold} gold`];
  t.push({ t: "dg_gold", d: gold, src: "action" });
  const roll = rng();
  if (roll < 0.3) {
    t.push({ t: "dg_bag", item: "potion", d: 1, src: "action" });
    found.push("a potion");
  } else if (roll < 0.45) {
    t.push({ t: "dg_bag", item: "ether", d: 1, src: "action" });
    found.push("an ether");
  } else if (roll < 0.55) {
    t.push({ t: "dg_bag", item: "bomb", d: 1, src: "action" });
    found.push("a bomb");
  }
  const loot = d.loot.filter((l) => l.minDepth <= run.depth);
  if (loot.length && rng() < 0.2 * mult) {
    const l = weighted(loot, (x) => x.weight, rng);
    if (l) {
      t.push({ t: "dg_loot", item: l.item, d: 1, src: "action" });
      found.push(itemName(t.r, t.s, l.item));
    }
  }
  log(t, `A chest! Inside: ${found.join(", ")}.`);
}
function fillText(text, t, who) {
  return who ? text.replace(/\{target\}/g, personName(t.r, t.s, who)) : text;
}
function choicesFor(r, s) {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run?.pending || !d)
    return null;
  const ev = (run.pending.kind === "romance" ? d.romance : d.events)[run.pending.id];
  if (!ev)
    return null;
  const env = dgEnv({ r, s }, run, { target: run.pending.target ?? "" });
  const choices = ev.choices.filter((c) => !c.when || evalBool(c.when, env, true)).map((c) => ({ ...c, ok: !c.cost || run.gold >= c.cost }));
  return { ev, choices, ...run.pending.target ? { target: run.pending.target } : {} };
}
function chooseEvent(r, s, choiceId) {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  const open = choicesFor(r, s);
  if (!run || !d || !open)
    return fail("There's nothing to decide here.");
  const c = open.choices.find((x) => x.id === choiceId);
  if (!c)
    return fail("That option isn't available.");
  if (!c.ok)
    return fail(`You need ${c.cost} gold for that.`);
  const who = open.target ?? null;
  let label = fillText(c.label, { r, s }, who);
  const events = buildTurn(r, s, `${run.seed}:${run.depth}:choice:${run.pending.at}`, (t) => {
    const rng = seededRng(`${run.seed}:choice:${run.depth}:${run.pending.at}:${c.id}`);
    const env = dgEnv(t, run, { target: who ?? "" });
    const chance = c.chance === undefined ? 100 : evalNumber(c.chance, env, 50);
    const ok = rng() * 100 < chance;
    const o = ok || !c.fail ? c.success : c.fail;
    t.push({ t: "dg_pending", pending: null, src: "action" });
    applyOutcome(t, d, run, o, who, run.pending.at);
    const text = fillText(`${fillText(open.ev.text, t, who)} {{user}} chose: ${label}.${o.text ? ` ${o.text}` : ""}`, t, who);
    log(t, fillText(`${label}${c.chance !== undefined ? ok ? " — it works." : " — it goes wrong." : "."}${o.text ? ` ${o.text}` : ""}`, t, who));
    tell(t, d, t.s.dungeon ?? run, text);
  });
  label = label.replace(/\{\{user\}\}/g, "I");
  return { events, narrate: { say: `*${label}*` } };
}
function applyOutcome(t, d, run, o, who, at) {
  const live = () => t.s.dungeon ?? run;
  if (o.heal || o.hurt || o.mana)
    changeVitals(t, d, live(), { heal: o.heal, hurt: o.hurt, mana: o.mana });
  const env = dgEnv(t, live(), { target: who ?? "" });
  if (o.gold !== undefined) {
    const g = Math.round(evalNumber(o.gold, env, 0));
    if (g)
      t.push({ t: "dg_gold", d: g, src: "action" });
  }
  if (o.xp !== undefined) {
    const x = Math.round(evalNumber(o.xp, env, 0));
    if (x)
      t.push({ t: "dg_xp", d: x, src: "action" });
  }
  for (const [item, n] of Object.entries(o.bag ?? {}))
    if (n)
      t.push({ t: "dg_bag", item, d: n, src: "action" });
  if (who && (o.bond || o.desire)) {
    for (const rs of t.r.relStatOrder) {
      const def = t.r.relStats[rs];
      const span = (def.max - def.min) / 100;
      if (o.bond && def.good === "high")
        t.push({ t: "rel", who, stat: rs, d: Math.round(o.bond * span * 10) / 10, src: "action" });
      if (o.desire && /lust|attract|desire|arous|passion/i.test(`${rs} ${def.label}`))
        t.push({ t: "rel", who, stat: rs, d: Math.round(o.desire * span * 10) / 10, src: "action" });
    }
  }
  t.apply(o.effect, "action", who ? { target: who } : {});
  if (o.fight) {
    const kind = o.fight === "elite" ? "elite" : "event";
    beginBattle(t, d, live(), `${at}:fight`, kind, o.fight !== "enemy" && o.fight !== "elite" ? o.fight : undefined);
  }
}
function battleCommand(r, s, cmd) {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d || !run.battle)
    return fail("There's no fight going on.");
  let b = run.battle;
  const bag = { ...run.bag };
  const seed = `${run.seed}:${run.depth}:${b.at}`;
  const startRound = b.round;
  const used = [];
  for (let n = 0;n < 60 && !b.over && b.active; n++) {
    const c = "auto" in cmd ? autoCommand(b, bag) : cmd;
    if ("item" in c) {
      if ((bag[c.item] ?? 0) < 1)
        return fail(`You have no ${SHOP[c.item]?.name.toLowerCase() ?? c.item}s left.`);
    }
    const res = command(b, c, seed, { depth: run.depth });
    if (res.error)
      return fail(res.error);
    b = res.b;
    if (res.used) {
      bag[res.used] = (bag[res.used] ?? 0) - 1;
      used.push(res.used);
    }
    if (!("auto" in cmd) || cmd.auto === "turn")
      break;
    if (cmd.auto === "round" && b.round > startRound)
      break;
  }
  let narrate;
  const events = buildTurn(r, s, `${seed}:cmd:${b.round}:${b.log.length}`, (t) => {
    for (const item of used)
      t.push({ t: "dg_bag", item, d: -1, src: "action" });
    t.push({ t: "dg_battle", battle: b, src: "action" });
    if (b.over)
      narrate = finishBattle(t, d, t.s.dungeon, b);
  });
  return { events, ...narrate ? { narrate } : {} };
}
function finishBattle(t, d, run, b) {
  const foes = b.fighters.filter((f) => f.side === "foe");
  const names = foes.map((f) => f.name).join(", ");
  const partyAfter = run.party.map((m) => {
    const f = b.fighters.find((x) => x.id === m.id);
    return f ? { id: m.id, hp: f.hp, mp: f.mp, tp: f.tp } : m;
  });
  t.push({ t: "dg_battle", battle: null, src: "action" });
  t.time(5, "action");
  const highlight = d.narrate === "all" || b.kind === "elite" || b.kind === "boss" || b.kind === "mimic";
  const beats = b.log.slice(-6).join(" ");
  if (b.over === "lost")
    return defeat(t, d, run, names);
  if (b.over === "fled") {
    party(t, partyAfter);
    log(t, `The party fled from ${names}.`);
    if (highlight) {
      tell(t, d, t.s.dungeon, `The party fled from ${names}. ${beats}`);
      return { say: "*We run for it!*" };
    }
    return;
  }
  party(t, partyAfter.map((m) => m.hp <= 0 ? { ...m, hp: 1 } : m));
  const xp = foes.reduce((n, f) => n + (f.xp ?? 0), 0);
  const gold = foes.reduce((n, f) => n + (f.gold ?? 0), 0);
  const before = levelOf(run.xp);
  if (xp)
    t.push({ t: "dg_xp", d: xp, src: "action" });
  if (gold)
    t.push({ t: "dg_gold", d: gold, src: "action" });
  if (!b.at.endsWith(":fight"))
    t.push({ t: "dg_clear", key: b.at, src: "action" });
  const after = levelOf(run.xp + xp);
  log(t, `Defeated ${names}. +${xp} XP, +${gold} gold.${after > before ? ` The party reaches level ${after}!` : ""}`);
  if (b.kind === "boss")
    log(t, "The way down is open.");
  if (highlight) {
    tell(t, d, t.s.dungeon, `The party defeated ${names}${b.kind === "boss" ? " — the guardian of this floor" : ""}. How it went: ${beats}`);
    return { say: b.kind === "boss" ? "*It's over. The way down is clear.*" : "*We catch our breath after the fight.*" };
  }
  return;
}
function defeat(t, d, run, by) {
  const lostGold = run.gold;
  const lostLoot = Object.keys(run.loot).length;
  tell(t, d, run, `The party is overwhelmed by ${by} on floor ${run.depth}. Everything found on this run is lost${lostGold ? ` (${lostGold} gold${lostLoot ? " and the treasures" : ""})` : ""}. {{user}} comes to later, back outside the dungeon, battered.`);
  t.push({ t: "dg_exit", src: "action" });
  t.apply(d.onDefeat, "action");
  t.time(120, "action");
  return { say: "*Everything goes dark…*" };
}
function descend(r, s) {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d)
    return fail("You're not in a dungeon.");
  if (run.battle || run.pending)
    return fail("Deal with what's here first.");
  const floor = generateFloor(d, run.seed, run.depth);
  const here = key2(...run.pos);
  if (here !== key2(...floor.stairs))
    return fail("The way down isn't here.");
  if (floor.boss && !run.cleared.includes(here))
    return fail("The guardian still blocks the way.");
  if (d.floors && run.depth >= d.floors)
    return fail("This is as deep as it goes.");
  const next = generateFloor(d, run.seed, run.depth + 1);
  let narrate;
  const events = buildTurn(r, s, `${run.seed}:down:${run.depth}`, (t) => {
    t.push({ t: "dg_down", pos: next.start, src: "action" });
    t.push({ t: "dg_clear", key: key2(...next.start), src: "action" });
    changeVitals(t, d, t.s.dungeon, { heal: 20, mana: 20 });
    t.time(10, "action");
    log(t, `The party descends to floor ${run.depth + 1}.${next.boss ? " Something powerful waits on this floor." : ""}`);
    if (d.narrate === "all" || next.boss) {
      tell(t, d, t.s.dungeon, `The party descends to floor ${run.depth + 1}.${next.boss ? " A powerful presence waits somewhere on this floor." : ""}`);
      narrate = { say: "*We head down the stairs.*" };
    }
  });
  return { events, ...narrate ? { narrate } : {} };
}
function leaveDungeon(r, s) {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d)
    return fail("You're not in a dungeon.");
  const events = buildTurn(r, s, `${run.seed}:leave:${run.depth}`, (t) => {
    const money = d.currency ?? r.hud.money;
    const found = [];
    if (run.gold && money && r.stats[money]) {
      t.push({ t: "stat", id: money, d: run.gold, src: "action" });
      found.push(`${formatNumber(run.gold)} gold`);
    }
    for (const [item, n] of Object.entries(run.loot)) {
      t.push({ t: "item", id: item, d: n, src: "action" });
      found.push(itemName(r, s, item));
    }
    tell(t, d, run, `{{user}}'s party climbs back out of ${d.name} from floor ${run.depth}${found.length ? `, carrying ${found.join(", ")}` : ", empty-handed"}.`);
    t.push({ t: "dg_exit", src: "action" });
    t.apply(d.onLeave, "action");
    t.time(Math.min(120, 10 * run.depth), "action");
  });
  return { events, narrate: { say: "*We make our way back out of the dungeon.*" } };
}
function useItem(r, s, item, target) {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d)
    return fail("You're not in a dungeon.");
  if (run.battle)
    return battleCommand(r, s, { item, target });
  if (item !== "potion" && item !== "ether")
    return fail("That can only be used in a fight.");
  if ((run.bag[item] ?? 0) < 1)
    return fail(`You have no ${item}s left.`);
  const m = run.party.find((p) => p.id === target);
  if (!m)
    return fail("They're not in the party.");
  const events = buildTurn(r, s, `${run.seed}:use:${run.depth}:${run.log.length}`, (t) => {
    t.push({ t: "dg_bag", item, d: -1, src: "action" });
    const f = memberFighter(r, s, d, run, m);
    const next = run.party.map((p) => p.id !== target ? p : item === "potion" ? { ...p, hp: Math.min(f.mhp, Math.max(p.hp, 0) + Math.ceil(f.mhp / 2)) } : { ...p, mp: Math.min(f.mmp, p.mp + Math.ceil(f.mmp / 2)) });
    party(t, next);
    log(t, `${f.name} drinks ${item === "potion" ? "a potion" : "an ether"}.`);
  });
  return { events };
}
function shopBuy(r, s, item) {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d)
    return fail("You're not in a dungeon.");
  const floor = generateFloor(d, run.seed, run.depth);
  if (tileAt(floor, ...run.pos) !== "shop")
    return fail("There's no merchant here.");
  const ware = SHOP[item];
  if (!ware)
    return fail("The merchant doesn't sell that.");
  const price = ware.price(run.depth);
  if (run.gold < price)
    return fail(`That costs ${price} gold.`);
  const events = buildTurn(r, s, `${run.seed}:buy:${run.depth}:${run.log.length}`, (t) => {
    t.push({ t: "dg_gold", d: -price, src: "action" });
    t.push({ t: "dg_bag", item, d: 1, src: "action" });
    log(t, `Bought a ${ware.name.toLowerCase()} for ${price} gold.`);
  });
  return { events };
}
var PLAYER = "you", DUNGEON_ACTION = "dungeon", fail = (error) => ({ events: [], error }), levelOf = (xp) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 12)), levelScale = (level) => 1 + 0.12 * (level - 1), depthScale = (depth, from) => 1 + 0.12 * Math.max(0, depth - from), tierFor2 = (depth) => Math.min(4, 1 + Math.floor((depth - 1) / 3)), isAdult = (r, id) => (r.people[id]?.age ?? 18) >= 18;
var init_run = __esm(() => {
  init_dice();
  init_expr();
  init_resolve();
  init_state();
  init_world();
  init_battle();
  init_content();
  init_floor();
});

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
  const env = makeEnv(r, s);
  const here = new Set(presentPeople(r, s, env));
  const people = Object.entries(s.people).map(([id, p]) => {
    const where = r.people[id]?.schedule.length ? personLocation(r, s, id, env) : null;
    return {
      id,
      name: p.name,
      stats: r.relStatOrder.map((rs) => {
        const def = r.relStats[rs];
        const v = s.rel[id]?.[rs] ?? def.start;
        const band = bandFor(def, v);
        const pp = pct(v, def.min, def.max);
        return { id: rs, label: def.label, value: v, min: def.min, max: def.max, display: formatNumber(v), pct: pp, text: band?.text ?? null, tone: band?.tone ?? toneFromPct(pp, def.good) };
      }),
      present: here.has(id),
      whereabouts: where ? r.locations[where]?.name ?? where : null
    };
  }).sort((a, b) => Number(b.present) - Number(a.present));
  const wornIds = new Set(Object.values(s.worn));
  const clothingView = (id) => {
    const d = r.items[id];
    return {
      id,
      name: itemName(r, s, id),
      slot: d?.slot ?? "",
      warmth: d?.warmth ?? 0,
      reveal: d?.reveal ?? 0,
      traits: d?.traits ?? [],
      integrity: d && s.integrity[id] !== undefined ? Math.round(s.integrity[id] / d.integrity * 100) : null,
      worn: wornIds.has(id)
    };
  };
  const items = Object.entries(s.items).map(([id, count]) => ({ id, name: itemName(r, s, id), count, worn: wornIds.has(id) }));
  const clothing = Object.keys(s.items).filter((id) => r.items[id]?.slot).map(clothingView);
  const outfit = r.wardrobe.enabled ? r.wardrobe.slots.map((sl) => ({ slot: sl.id, label: sl.label, item: s.worn[sl.id] ? clothingView(s.worn[sl.id]) : null })) : null;
  const temp = temperatureAt(r, s);
  const wx = weatherAt(r, s);
  const date = dateAt(r, s.minutes);
  let warmth = null;
  if (r.wardrobe.enabled && temp !== null) {
    const need = warmthNeeded(temp);
    const value = warmthOf(r, s);
    const cold = value < need.min, hot = value > need.max;
    warmth = {
      value,
      min: need.min,
      max: need.max,
      tone: cold || hot ? Math.min(Math.abs(value - need.min), Math.abs(value - need.max)) > 6 ? "bad" : "warn" : "good",
      text: cold ? "You're underdressed for this." : hot ? "You're overdressed and sweltering." : "Dressed right for the weather."
    };
  }
  let encounter = null;
  if (s.encounter) {
    const enc = r.encounters[s.encounter.id];
    encounter = {
      name: enc?.name ?? s.encounter.id,
      foe: enc?.foe.name ?? "Opponent",
      round: s.encounter.round,
      stats: (enc?.foe.stats ?? []).map((fs) => {
        const v = s.encounter.foe[fs.id] ?? fs.start;
        const p = pct(v, 0, fs.max);
        return { id: fs.id, label: fs.label, value: v, max: fs.max, pct: p, tone: toneFromPct(p, fs.good === "none" ? "none" : fs.good === "high" ? "high" : "low") };
      })
    };
  }
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
    date: date ? `${r.clock.weekdays[Math.floor(s.minutes / 1440) % r.clock.weekdays.length] ?? ""} ${ordinal(date.day)} ${date.monthName}`.trim() : null,
    weather: temp !== null ? { icon: isIndoors(r, s) ? "\uD83C\uDFE0" : wx?.icon ?? "", label: isIndoors(r, s) ? "Indoors" : wx?.label ?? "", temp, season: seasonAt(r, s.minutes), indoors: isIndoors(r, s) } : null,
    location: s.locationName ? { name: s.locationName, desc: loc?.desc } : null,
    money,
    bars: bars.filter((b) => r.stats[b.id].kind !== "money"),
    skills,
    people,
    items,
    conditions,
    warmth,
    outfit,
    clothing,
    exposed: exposedSlots(r, s),
    encounter,
    codex: Object.values(r.codex).filter((c) => s.codex[c.id]).map((c) => ({ id: c.id, title: c.title, text: c.text, category: c.category ?? null })),
    codexTotal: Object.keys(r.codex).length,
    feats: Object.values(r.feats).filter((f) => !f.hidden || s.feats[f.id]).map((f) => ({ id: f.id, name: f.name, desc: f.desc, unlocked: !!s.feats[f.id] })),
    perks: Object.values(r.perks).map((p) => ({ id: p.id, name: p.name, desc: p.desc, cost: p.cost, owned: !!s.perks[p.id], blocker: s.perks[p.id] ? null : perkBlocker(r, s, p.id) })),
    perkPoints: r.perkPoints ? s.stats[r.perkPoints] ?? 0 : null,
    news: s.news.slice().reverse().slice(0, 12).map((n) => ({ text: n.text, when: r.clock.enabled ? formatClock(r, n.at).day : null })),
    turn: s.turn
  };
}
function buildMap(r, s) {
  const ids = Object.keys(r.locations);
  if (ids.length < 2)
    return null;
  const pos = new Map;
  if (ids.every((id) => r.locations[id].pos)) {
    for (const id of ids)
      pos.set(id, r.locations[id].pos);
  } else {
    const root = ids.reduce((best, id) => r.locations[id].exits.length > r.locations[best].exits.length ? id : best, r.startLocation && r.locations[r.startLocation] ? r.startLocation : ids[0]);
    const children = new Map;
    const depth = new Map([[root, 0]]);
    const queue = [root];
    while (queue.length) {
      const id = queue.shift();
      for (const x of r.locations[id].exits) {
        if (!r.locations[x] || depth.has(x))
          continue;
        depth.set(x, depth.get(id) + 1);
        children.set(id, [...children.get(id) ?? [], x]);
        queue.push(x);
      }
    }
    for (const id of ids)
      if (!depth.has(id)) {
        depth.set(id, 3);
        children.set(root, [...children.get(root) ?? [], id]);
      }
    const size = (id) => 1 + (children.get(id) ?? []).reduce((a, c) => a + size(c), 0);
    const place = (id, a0, a1) => {
      const d = depth.get(id);
      const a = (a0 + a1) / 2;
      pos.set(id, [Math.cos(a) * d * 110, Math.sin(a) * d * 110]);
      const kids = children.get(id) ?? [];
      const total = kids.reduce((n, c) => n + size(c), 0) || 1;
      let start = a0;
      for (const c of kids) {
        const span = (a1 - a0) * size(c) / total;
        place(c, start, start + span);
        start += span;
      }
    };
    place(root, -Math.PI / 2, 3 * Math.PI / 2);
  }
  const env = makeEnv(r, s);
  const peopleAt = new Map;
  for (const pid of Object.keys(r.people).filter((id) => !s.forgotten[id])) {
    const at = personLocation(r, s, pid, env);
    if (at)
      peopleAt.set(at, [...peopleAt.get(at) ?? [], personName(r, s, pid)]);
  }
  const reach = new Set(travelTargets(r, s));
  const edges = [];
  const seen = new Set;
  for (const id of ids)
    for (const x of r.locations[id].exits) {
      const k = [id, x].sort().join("|");
      if (r.locations[x] && !seen.has(k)) {
        seen.add(k);
        edges.push([id, x]);
      }
    }
  return {
    nodes: ids.map((id) => {
      const [x, y] = pos.get(id) ?? [0, 0];
      return { id, name: r.locations[id].name, x, y, here: s.location === id, reachable: reach.has(id), indoors: r.locations[id].indoors, people: peopleAt.get(id) ?? [] };
    }),
    edges
  };
}
function buildChoices(r, s, opts) {
  const veils = new Set(opts.veils.map((v) => v.toLowerCase()));
  const lines = new Set(opts.lines.map((v) => v.toLowerCase()));
  const live = [];
  const plain = (id, label, group, desc = null) => ({ id, label, group, desc, odds: null, partialOdds: null, checkLabel: null, veiled: false, params: [] });
  if (s.dungeon) {
    const d = dungeonOf(r, s.dungeon);
    return [
      plain("dungeon:open", s.dungeon.battle ? "Back to the fight" : s.dungeon.pending ? "Decide what to do" : "Keep exploring", d?.name ?? "Dungeon", "Open the dungeon map"),
      plain("dungeon:leave", "Leave the dungeon", d?.name ?? "Dungeon", "Climb back out with what you've found")
    ];
  }
  const dungeons = dungeonsHere(r, s).map((d) => plain(`dungeon:enter:${d.id}`, `Enter ${d.name}`, "Dungeon", d.desc ?? null));
  if (!s.encounter)
    (opts.live ?? []).forEach((c, i) => {
      const a = r.liveChoices.tags[c.tag];
      if (!a || a.tags.some((t) => lines.has(t)))
        return;
      const o = odds(r, s, a, undefined, c.target);
      live.push({
        id: `${LIVE_PREFIX}${i}`,
        label: c.label,
        group: r.liveChoices.label,
        desc: a.desc ?? null,
        odds: o ? o.success : null,
        partialOdds: o && o.partial > 0 ? o.partial : null,
        checkLabel: a.check?.label ?? null,
        veiled: a.tags.some((t) => veils.has(t)),
        params: []
      });
    });
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
  const encName = s.encounter ? r.encounters[s.encounter.id]?.name ?? "Encounter" : null;
  const actions = availableChoices(r, s, opts.lines).filter(({ a }) => !a.hidden).map(({ id, a, target, label }) => {
    const o = odds(r, s, a, undefined, target);
    return {
      id,
      label,
      group: encName ?? a.group ?? null,
      desc: a.desc ?? null,
      odds: o ? o.success : null,
      partialOdds: o && o.partial > 0 ? o.partial : null,
      checkLabel: a.check?.label ?? null,
      veiled: a.tags.some((t) => veils.has(t)),
      params: a.params.map((p) => ({ id: p.id, label: p.label, options: Object.keys(p.options), default: p.default }))
    };
  });
  return [...live, ...actions, ...dungeons, ...travel];
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
        const a = relAgg.get(key) ?? { d: 0, idx: [], src: e.src, set: false };
        if (e.set !== undefined)
          a.set = true;
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
      case "wear": {
        const prev = before.worn[e.slot];
        if (e.item)
          out.push({ text: `\uD83D\uDC55 Put on ${itemName(r, after, e.item)}`, tone: "neutral", src: e.src, undo: [i] });
        else if (prev)
          out.push({ text: `\uD83D\uDC55 Took off ${itemName(r, before, prev)}`, tone: "neutral", src: e.src, undo: [i] });
        break;
      }
      case "dmg": {
        const gone = !(after.items[e.item] > 0);
        out.push({ text: gone ? `\uD83D\uDCA5 ${itemName(r, before, e.item)} destroyed` : `\uD83E\uDDF5 ${itemName(r, after, e.item)} damaged`, tone: "bad", src: e.src, undo: [i] });
        break;
      }
      case "enc":
        if (e.id)
          out.push({ text: `⚔ ${r.encounters[e.id]?.name ?? "Encounter"}`, tone: "warn", src: e.src });
        else
          out.push({ text: `⚔ Over: ${(e.outcome ?? "ended").replace(/_/g, " ")}`, tone: "neutral", src: e.src });
        break;
      case "foe": {
        const enc = before.encounter ?? after.encounter;
        const def = enc ? r.encounters[enc.id] : undefined;
        const fs = def?.foe.stats.find((x) => x.id === e.stat);
        if (e.d)
          out.push({ text: `${def?.foe.name ?? "Foe"} ${fs?.label ?? e.stat} ${signed(e.d)}`, tone: e.d < 0 === (fs?.good !== "high") ? "good" : "bad", src: e.src });
        break;
      }
      case "codex":
        out.push({ text: `\uD83D\uDCD6 ${r.codex[e.id]?.title ?? e.id}`, tone: "good", src: e.src });
        break;
      case "feat":
        out.push({ text: `\uD83C\uDFC6 ${r.feats[e.id]?.name ?? e.id}`, tone: "good", src: e.src });
        break;
      case "perk":
        out.push({ text: `★ ${r.perks[e.id]?.name ?? e.id}`, tone: "good", src: e.src });
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
    if (!def)
      continue;
    const d = a.set ? (after.rel[who]?.[stat] ?? def.start) - (before.rel[who]?.[stat] ?? def.start) : a.d;
    if (Math.abs(d) < 0.05)
      continue;
    const good = def.good === "none" ? null : d > 0 === (def.good === "high");
    const band = a.set ? bandFor(def, after.rel[who]?.[stat] ?? def.start)?.text : undefined;
    out.push({ text: `${personName(r, after, who)} · ${def.label} ${signed(d)}`, tone: good === null ? "neutral" : good ? "good" : "bad", src: a.src, ...band ? { band } : {}, undo: a.idx });
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
    clock: r.clock.enabled ? formatClock(r, after.minutes).label : null,
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
  const hud = buildHud(r, s);
  if (r.clock.enabled) {
    const c = formatClock(r, s.minutes);
    head.push(`${hud.date ?? c.day}, ${c.time} (${c.phase})`);
  }
  if (s.locationName)
    head.push(`Location: ${s.locationName}${hud.weather?.indoors ? " (indoors)" : ""}`);
  if (hud.weather)
    head.push(hud.weather.indoors ? `${hud.weather.temp}°C inside` : `${hud.weather.label}, ${hud.weather.temp}°C${hud.weather.season ? ` (${hud.weather.season})` : ""}`);
  if (head.length)
    lines.push(head.join(" · "));
  if (hud.encounter) {
    const e = hud.encounter;
    lines.push(`ENCOUNTER in progress: ${e.name} vs ${e.foe}, round ${e.round}${e.stats.length ? ` — ${e.stats.map((x) => `${x.label} ${formatNumber(x.value)}/${formatNumber(x.max)}`).join(", ")}` : ""}`);
  }
  if (hud.outfit) {
    const worn = hud.outfit.filter((o) => o.item).map((o) => `${o.item.name}${o.item.integrity !== null && o.item.integrity < 60 ? " (torn)" : ""}`);
    const exposure = hud.exposed.length ? ` — exposed: ${hud.exposed.join(", ")}` : "";
    lines.push(`Wearing: ${worn.length ? worn.join(", ") : "nothing"}${exposure}${hud.warmth && hud.warmth.tone !== "good" ? ` · ${hud.warmth.text}` : ""}`);
  }
  const here = hud.people.filter((p) => p.present).map((p) => p.name);
  if (s.dungeon) {
    const run = s.dungeon;
    const d = dungeonOf(r, run);
    if (d) {
      const party = run.party.map((m) => {
        const f = memberFighter(r, s, d, run, m);
        return `${f.name} ${f.hp <= 0 ? "down" : `HP ${f.hp}/${f.mhp}`}`;
      });
      lines.push(`IN A DUNGEON: ${d.name}, floor ${run.depth} (party level ${levelOf(run.xp)}). Party: ${party.join(", ")}. Carrying ${run.gold} gold from this run.`);
      if (run.battle)
        lines.push(`Fighting: ${run.battle.fighters.filter((f) => f.side === "foe" && f.hp > 0).map((f) => f.name).join(", ")}.`);
    }
  } else if (here.length)
    lines.push(`Present here: ${here.join(", ")}`);
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
  const wornSet = new Set(Object.values(s.worn));
  const inv = Object.entries(s.items).filter(([id]) => !wornSet.has(id)).map(([id, n]) => `${itemName(r, s, id)}${n > 1 ? ` ×${n}` : ""}`);
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
function narratorKnowledge(r, s) {
  const lines = [];
  for (const sec of Object.values(r.secrets)) {
    const open = s.secrets[sec.id] ?? -1;
    for (let i = 0;i <= open && i < sec.stages.length; i++)
      lines.push(`${sec.about}: ${sec.stages[i].text}`);
    if (sec.tell === "exists" && open < sec.stages.length - 1) {
      lines.push(`${sec.about} is keeping something you don't know. If pressed, they deflect or change the subject — don't invent what it is.`);
    }
  }
  for (const f of Object.values(r.fronts)) {
    const st = s.fronts[f.id] ?? { v: f.start, stage: -1 };
    for (let i = 0;i <= st.stage && i < f.stages.length; i++) {
      if (f.stages[i].backstage)
        lines.push(`Behind the scenes (${f.label}): ${f.stages[i].backstage}`);
    }
    const next = f.stages[st.stage + 1];
    if (next?.hint && st.v >= next.hintAt)
      lines.push(`In the background: ${next.hint} (a sign only — don't explain it or make anything happen)`);
  }
  const omen = s.gauge.next ? r.randomEvents.events[s.gauge.next]?.omen : undefined;
  if (omen)
    lines.push(`In the background: ${omen} (you don't know what it means — don't explain it or make anything happen)`);
  return lines.length ? lines.join(`
`) : null;
}
function sceneHints(r, s) {
  const moods = {};
  const here = presentPeople(r, s, makeEnv(r, s));
  for (const id of here) {
    if (!s.people[id])
      continue;
    const parts = r.relStatOrder.map((rs) => {
      const def = r.relStats[rs];
      if (def.show === "hidden")
        return null;
      const band = bandFor(def, s.rel[id]?.[rs] ?? def.start);
      return band ? `${def.label.toLowerCase()}: ${band.text}` : null;
    }).filter(Boolean);
    if (parts.length)
      moods[personName(r, s, id)] = parts.join("; ");
  }
  const notes = [];
  if (s.encounter)
    notes.push(`In a fight or tense encounter: ${r.encounters[s.encounter.id]?.name ?? s.encounter.id}`);
  if (s.dungeon)
    notes.push("Exploring a dungeon");
  return Object.keys(moods).length || notes.length ? { moods, notes } : null;
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
var init_view = __esm(() => {
  init_ruleset();
  init_state();
  init_resolve();
  init_world();
  init_run();
});

// src/engine/dungeon/view.ts
function fighterView(f, active) {
  return {
    id: f.id,
    name: f.name,
    side: f.side,
    sprite: f.sprite,
    hp: f.hp,
    mhp: f.mhp,
    mp: f.mp,
    mmp: f.mmp,
    tp: f.tp,
    alive: f.hp > 0,
    active: f.id === active,
    guard: f.guard,
    ...f.elite ? { elite: true } : {},
    ...f.boss ? { boss: true } : {}
  };
}
function buildDungeonEntries(r, s) {
  return dungeonsHere(r, s).map((d) => ({
    id: d.id,
    name: d.name,
    desc: d.desc ?? null,
    theme: d.theme,
    deepest: s.deepest[d.id] ?? 0,
    floors: d.floors,
    max: d.party.max,
    companions: eligibleCompanions(r, s, d)
  }));
}
function buildDungeonView(r, s) {
  const run = s.dungeon;
  const d = run && dungeonOf(r, run);
  if (!run || !d)
    return null;
  const floor = generateFloor(d, run.seed, run.depth);
  const seen = new Set(run.seen);
  const cleared = new Set(run.cleared);
  const busy = !!run.battle || !!run.pending;
  const tiles = [];
  for (let y = 0;y < floor.size; y++)
    for (let x = 0;x < floor.size; x++) {
      const k = key2(x, y);
      const kind = floor.tiles[y][x];
      const here = run.pos[0] === x && run.pos[1] === y;
      const known = seen.has(k);
      const shown = known ? kind === "boss" && cleared.has(k) ? "stairs" : kind : null;
      tiles.push({
        x,
        y,
        kind: shown,
        state: here ? "here" : known ? "seen" : "hidden",
        cleared: cleared.has(k),
        reachable: !busy && adjacent(run.pos, [x, y])
      });
    }
  const hereKind = floor.tiles[run.pos[1]][run.pos[0]];
  const hereKey = key2(...run.pos);
  const onStairs = hereKey === key2(...floor.stairs) && (!floor.boss || cleared.has(hereKey));
  const level = levelOf(run.xp);
  const open = choicesFor(r, s);
  const event = open ? {
    text: open.ev.text.replace(/\{target\}/g, open.target ? s.people[open.target]?.name ?? open.target : ""),
    romance: run.pending?.kind === "romance",
    choices: open.choices.map((c) => {
      let chance = null;
      if (c.chance !== undefined) {
        const e = makeEnv(r, s, { depth: run.depth, target: open.target ?? "" });
        try {
          chance = Math.max(0, Math.min(100, Math.round(evalNumber(c.chance, { lookup: e.lookup, call: (n, a) => n === "rel_bond" ? bondOf(r, s, String(a[0] ?? "")) : n === "bag" ? run.bag[String(a[0])] ?? 0 : e.call?.(n, a) }, 50))));
        } catch {
          chance = null;
        }
      }
      return { id: c.id, label: c.label.replace(/\{target\}/g, open.target ? s.people[open.target]?.name ?? open.target : ""), ok: c.ok, chance, cost: c.cost ?? null };
    })
  } : null;
  const b = run.battle;
  let battle = null;
  if (b) {
    const active = b.fighters.find((f) => f.id === b.active) ?? null;
    battle = {
      kind: b.kind,
      round: b.round,
      active: b.active,
      fighters: b.fighters.map((f) => fighterView(f, b.active)),
      skills: active ? ["attack", ...active.skills, "guard"].map((id) => SKILLS[id]).filter(Boolean).map((sk) => ({
        id: sk.id,
        name: sk.name,
        cost: skillCost(sk),
        target: sk.target,
        usable: canUse(active, sk)
      })) : [],
      log: b.log,
      canEscape: b.kind !== "boss",
      over: b.over
    };
  }
  return {
    id: d.id,
    name: d.name,
    theme: d.theme,
    depth: run.depth,
    floors: d.floors,
    size: floor.size,
    boss: floor.boss,
    tiles,
    here: {
      kind: hereKind === "boss" && cleared.has(hereKey) ? "stairs" : hereKind,
      canDescend: onStairs && !busy && (!d.floors || run.depth < d.floors),
      bottom: !!d.floors && run.depth >= d.floors && onStairs,
      shop: hereKind === "shop" && !busy ? Object.entries(SHOP).map(([id, w]) => ({ id, name: w.name, price: w.price(run.depth), sprite: w.sprite, desc: w.desc, affordable: run.gold >= w.price(run.depth) })) : null
    },
    event,
    battle,
    party: run.party.map((m) => fighterView(memberFighter(r, s, d, run, m), null)),
    level,
    xp: run.xp,
    xpNext: 12 * level * level,
    gold: run.gold,
    bag: Object.entries(run.bag).filter(([, n]) => n > 0).map(([id, count]) => ({ id, name: SHOP[id]?.name ?? id, count, sprite: SHOP[id]?.sprite ?? "potion" })),
    loot: Object.entries(run.loot).map(([id, count]) => ({ name: itemName(r, s, id), count })),
    log: run.log.slice().reverse()
  };
}
var init_view2 = __esm(() => {
  init_expr();
  init_state();
  init_battle();
  init_content();
  init_floor();
  init_run();
});

// src/backend/decisions.ts
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
async function readTurn(opts) {
  const { decider, r, s, settings, playerText, player } = opts;
  const q = {};
  const actions = playerText ? availableChoices(r, s, settings.lines) : [];
  const travel = playerText ? travelTargets(r, s) : [];
  if (playerText && (actions.length || travel.length)) {
    const criteria = {
      [NONE]: "None of these: dialogue, thoughts, feelings, plans, questions, or something trivial that can't fail"
    };
    for (const c of actions)
      criteria[c.id] = `${c.label}${c.a.desc ? ` — ${c.a.desc}` : ""}`;
    for (const t of travel)
      criteria[`${TRAVEL_PREFIX}${t}`] = `Go to ${r.locations[t].name}`;
    q.action = { type: "choice", instructions: `Which of these does ${player}'s latest message actually attempt right now?`, criteria };
    if (actions.some((c) => c.a.params.length)) {
      q.difficulty = { type: "score", instructions: `How hard is what ${player} is attempting, given the scene?`, criteria: DIFFICULTY };
    }
  }
  for (const t of r.triggers) {
    if (t.whenScene)
      q[`scene:${t.id}`] = { type: "noul", instructions: fill(t.whenScene, player) };
  }
  for (const f of Object.values(r.fronts))
    f.pushes.forEach((p, i) => {
      q[`front:${f.id}:${i}`] = { type: "noul", instructions: `In the latest exchange: ${fill(p.scene, player)}` };
    });
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
  for (const [key, a] of Object.entries(ans)) {
    if (key.startsWith("front:") && a.type === "noul" && a.noul >= 0.65)
      scene[key] = true;
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
    const c = actions.find((x) => x.id === id);
    const a = c?.a;
    if (!a)
      return out;
    label = c.label;
    const params = {};
    const level = ans.difficulty?.type === "score" ? ans.difficulty.score / (DIFFICULTY.length - 1) : null;
    for (const p of a.params) {
      const keys = Object.keys(p.options);
      params[p.id] = level === null ? p.default : keys[Math.round(level * (keys.length - 1))];
    }
    intent = { actionId: c.id, via: "adjudicator", ...a.params.length ? { params } : {} };
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
function feelLevels(d) {
  if (d.bands.length >= 2) {
    return d.bands.map((b, i) => {
      const next = d.bands[i + 1]?.at ?? d.max;
      return { text: b.text, value: Math.round((b.at + next) / 2) };
    });
  }
  const names = ["Very low", "Low", "Middling", "High", "Very high"];
  return names.map((text, i) => ({ text, value: Math.round(d.min + (d.max - d.min) * i / (names.length - 1)) }));
}
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
      if (!s.calibrated[pid]) {
        const levels = feelLevels(d);
        q[`feel:${pid}:${rs}`] = { type: "score", instructions: `Right now, how does ${name} feel toward ${player} — ${d.label}?`, criteria: levels.map((l) => l.text) };
      } else {
        q[`rel:${pid}:${rs}`] = { type: "choice", instructions: `How did ${name}'s ${d.label} toward ${player} change during the reply?`, criteria: stepCriteria(`${name}'s ${d.label}`) };
      }
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
  if (r.wardrobe.enabled && r.wardrobe.narrator) {
    for (const [slot, id] of Object.entries(s.worn)) {
      q[`cloth:${slot}`] = { type: "noul", instructions: `By the end of the reply, ${player} no longer has their ${r.items[id]?.name ?? id} on (taken off, removed or lost)` };
    }
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
    if (!key.startsWith("feel:") || a.type !== "score" || a.confidence < 0.3)
      continue;
    const [, pid, rs] = key.split(":");
    const levels = feelLevels(r.relStats[rs]);
    const i = Math.max(0, Math.min(levels.length - 1, Math.round(a.score)));
    ((p.feelings ??= {})[personName(r, s, pid)] ??= {})[rs] = levels[i].value;
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
  for (const slot of Object.keys(s.worn)) {
    const a = ans[`cloth:${slot}`];
    if (a?.type === "noul" && a.noul >= 0.7)
      (p.undress ??= []).push(slot);
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
var NONE = "none", DIFFICULTY, STEP_FACTOR, TIME_LEVELS, TIME_MINUTES;
var init_decisions = __esm(() => {
  init_resolve();
  init_state();
  init_view();
  DIFFICULTY = [
    "Trivial or easy for an ordinary person in this situation",
    "A fair challenge",
    "Hard — most people would struggle",
    "Extreme — only the exceptional could pull it off"
  ];
  STEP_FACTOR = { down_lot: -1, down: -1 / 3, same: 0, up: 1 / 3, up_lot: 1 };
  TIME_LEVELS = [
    "No meaningful time — a few seconds or a single exchange",
    "A few minutes",
    "Around half an hour",
    "About an hour",
    "A few hours",
    "Most of a day or night"
  ];
  TIME_MINUTES = [0, 5, 30, 60, 180, 480];
});

// src/backend/deciders.ts
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
var JEV_KEY = "jev_api_key", JEV_URL = "https://api.typesafe.ai/v1/systemone", DeciderError, STOP, words = (s) => new Set(s.toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length > 2 && !STOP.has(w)));
var init_deciders = __esm(() => {
  DeciderError = class DeciderError extends Error {
  };
  STOP = new Set("a an the to of and or in on at for with my i me you your it is be do try tries trying".split(" "));
});

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
async function ask(system, user, settings, userId, timeoutMs, opts = {}) {
  const res = await host().generate.quiet({
    type: "quiet",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    connection_id: settings.helperConnectionId || undefined,
    reasoning: { source: "off" },
    parameters: { temperature: opts.temperature ?? 0.1, max_tokens: opts.maxTokens ?? 500 },
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
  const feelScale = rels.map((d) => `${d.id} ${d.min}–${d.max}${d.bands.length ? ` (${d.bands.map((b) => `${b.at}=${b.text}`).join(", ")})` : ""}`).join("; ");
  if (want("people") && r.peopleOpen) {
    allowed.push(`- "people": characters who appear for the first time, as [{"name": "...", "feelings": {<how they feel toward the player RIGHT NOW, absolute values>}}]${rels.length ? ` — scales: ${feelScale}` : ""}`);
  }
  const uncalibrated = Object.keys(s.people).filter((id) => !s.calibrated[id]).map((id) => s.people[id].name);
  if (want("people") && rels.length && uncalibrated.length) {
    allowed.push(`- "feelings": for these tracked people who appear in the reply, where they stand toward the player right now (absolute values, same scales): ${uncalibrated.join(", ")} — as {"Name": {"stat": value}}`);
  }
  if (want("items") && (r.itemsOpen || Object.keys(r.items).length))
    allowed.push(`- "items": item name → count gained (+) or lost (−). Held: ${Object.keys(s.items).map((id) => itemName(r, s, id)).join(", ") || "nothing"}`);
  if (want("move") && (locs.length || r.locationsOpen))
    allowed.push(`- "move": where the player character ends up, if they moved${locs.length && !r.locationsOpen ? ` (one of: ${locs.map((l) => l.name).join(", ")})` : ""}`);
  if (want("conditions") && conds.length)
    allowed.push(`- "conditions": {"add": [...], "remove": [...]} from: ${conds.map((c) => c.id).join(", ")}`);
  if (want("flags") && flags.length)
    allowed.push(`- "flags": set any of: ${flags.map((f) => f.id).join(", ")}`);
  if (want("wardrobe") && r.wardrobe.enabled && r.wardrobe.narrator) {
    const worn = Object.entries(s.worn).map(([slot, id]) => `${slot}: ${itemName(r, s, id)}`).join(", ") || "nothing";
    const owned = Object.keys(s.items).filter((id) => r.items[id]?.slot && !Object.values(s.worn).includes(id));
    allowed.push(`- "undress": slots whose clothing came off (currently worn — ${worn})`);
    if (owned.length)
      allowed.push(`- "wear": ids of owned clothing put on (${owned.join(", ")})`);
  }
  if (!allowed.length)
    return null;
  const system = [
    "You are the bookkeeper for a text roleplay game. You never write story.",
    "Read the narrator's latest reply and record only what CLEARLY happened in it.",
    "Small, sensible deltas for changes. Omit anything unchanged. Do not re-apply dice outcomes that were already applied.",
    'Exception: "feelings" (and people.feelings) are where someone stands overall right now — read them from how they act, even if that means strong values.',
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
var init_helpers = __esm(() => {
  init_state();
  init_view();
});

// src/backend/live.ts
function clip3(s, n) {
  return s.length > n ? `…${s.slice(-n)}` : s;
}
function usableTags(r, settings) {
  const blocked = new Set(settings.lines.map((l) => l.toLowerCase()));
  return Object.values(r.liveChoices.tags).filter((a) => !a.tags.some((t) => blocked.has(t)));
}
function repairTag(tags, raw) {
  if (typeof raw !== "string" || !raw.trim())
    return null;
  const k = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const exact = tags.find((a) => a.id.toLowerCase() === k || a.label.toLowerCase() === raw.trim().toLowerCase());
  if (exact)
    return exact.id;
  const loose = tags.find((a) => k.startsWith(a.id.toLowerCase()) || a.id.toLowerCase().startsWith(k));
  return loose?.id ?? null;
}
function personId(s, name) {
  if (typeof name !== "string" || !name.trim())
    return null;
  const n = name.trim().toLowerCase();
  for (const [id, p] of Object.entries(s.people)) {
    const full = p.name.toLowerCase();
    if (full === n || id === n || full.split(" ")[0] === n.split(" ")[0])
      return id;
  }
  return null;
}
function cleanChoices(r, s, tags, raw, count) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set;
  for (const item of list) {
    if (!item || typeof item !== "object")
      continue;
    const o = item;
    const label = typeof o.label === "string" ? o.label.trim().replace(/^[*"']+|[*"']+$/g, "").slice(0, 90) : "";
    const tag = repairTag(tags, o.tag);
    if (!label || !tag || seen.has(label.toLowerCase()))
      continue;
    const a = r.liveChoices.tags[tag];
    const target = personId(s, o.target);
    if (a.perPerson && !target)
      continue;
    seen.add(label.toLowerCase());
    out.push({ label, tag, ...a.perPerson && target ? { target } : {} });
    if (out.length >= count)
      break;
  }
  return out;
}
async function pickTags(decider, r, s, tags, reply, player) {
  if (decider.id !== "jev" || tags.length <= 1)
    return null;
  const ans = await decider.ask({ game_state: stateDigest(r, s), narrator_reply: clip3(reply, 4000) }, {
    kinds: {
      type: "choice",
      instructions: `Right after this reply, which kind of move would be most natural and interesting for ${player} to make next?`,
      criteria: Object.fromEntries(tags.map((a) => [a.id, a.desc ?? a.label]))
    }
  });
  const a = ans.kinds;
  if (a?.type !== "choice")
    return null;
  const ranked = Object.entries(a.probabilities).filter(([id]) => r.liveChoices.tags[id]).sort((x, y) => y[1] - x[1]);
  const picked = ranked.filter(([, p]) => p >= 0.04).slice(0, r.liveChoices.count).map(([id]) => id);
  return picked.length ? picked : ranked.slice(0, 1).map(([id]) => id);
}
async function writeLiveChoices(opts) {
  const { r, s, settings } = opts;
  const lc = r.liveChoices;
  if (!lc.enabled || s.encounter || s.dungeon)
    return [];
  if (lc.when && !evalBool(lc.when, makeEnv(r, s), true))
    return [];
  const tags = usableTags(r, settings);
  if (!tags.length)
    return [];
  let wanted = null;
  try {
    wanted = await pickTags(opts.decider, r, s, tags, opts.reply, opts.player);
  } catch (e) {
    logError("live choice kinds", e);
  }
  const count = wanted?.length ?? lc.count;
  const people = Object.values(s.people).map((p) => p.name);
  const tagLines = tags.map((a) => `- ${a.id}: ${a.desc ?? a.label}${a.perPerson ? ` (also give "target": the name of the person it's aimed at${people.length ? ` — one of ${people.join(", ")}` : ""})` : ""}`);
  const system = [
    "You write the clickable choices for a text roleplay game. You never write story.",
    `Write ${count} short options for what ${opts.player} could do right now, given the narrator's latest reply.`,
    `Each is 3–10 words, phrased as an action ${opts.player} takes (e.g. "Ask Jo about the letter", "Slip out the back door").`,
    "Make them specific to this moment and different from each other. Never decide how they turn out.",
    wanted ? `Write exactly one option for each of these tags, in this order: ${wanted.join(", ")}. The tags:` : "Tag each option with the kind of move it is, from this list only:",
    ...tagLines,
    ...lc.guide ? [`Author's note: ${lc.guide}`] : [],
    'Reply with JSON only: {"choices": [{"label": "...", "tag": "...", "target": "..."}]}'
  ].join(`
`);
  const user = ["Current state:", stateDigest(r, s), "", "Narrator's latest reply:", clip3(opts.reply, 4000)].join(`
`);
  try {
    const out = firstJson2(await ask(system, user, settings, opts.userId, 25000, { temperature: 0.8, maxTokens: 450 }));
    return cleanChoices(r, s, tags, out?.choices, count);
  } catch (e) {
    logError("live choices", e);
    return [];
  }
}
var init_live = __esm(() => {
  init_expr();
  init_state();
  init_view();
  init_helpers();
});

// src/backend/turn.ts
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
function fillHints(h, player) {
  return { v: 1, source: "warp", moods: h.moods, notes: h.notes.map((n) => fillNames(n, player)) };
}
function buildInjection(r, rec, before, after, player) {
  const parts = [];
  parts.push(`[Warp — current game state. The rules engine owns these facts; keep narration consistent with them.]
${stateDigest(r, after)}`);
  if (r.narration.notes)
    parts.push(`[Warp — narrator notes]
${r.narration.notes}`);
  const known = narratorKnowledge(r, after);
  if (known)
    parts.push(`[Warp — background only you know. The player hasn't seen it. Play it as subtext: never explain it, and reveal no more than the scene earns.]
${known}`);
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
        if (lastUser) {
          const hints = sceneHints(r, after);
          patchMeta(ctx.chatId, lastUser.id, "vn_hints", hints ? fillHints(hints, player) : undefined).catch((e) => logError("scene hints", e));
        }
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
    if (named?.feelings)
      proposal.feelings = { ...proposal.feelings ?? {}, ...named.feelings };
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
    const r = p.ruleset;
    const wantLive = r.liveChoices.enabled;
    if (!payload.content || !settings.narratorUpdates && !settings.consistencyCheck && !wantLive)
      return;
    host().sendToFrontend({ type: "busy", chatId: payload.chatId, busy: true, label: "Updating state…" }, userId);
    const decider = await getDecider(settings, userId);
    const [proposal, contra, live] = await Promise.all([
      settings.narratorUpdates ? proposeChanges(decider, r, p, payload.content, settings, userId) : Promise.resolve(null),
      settings.consistencyCheck && decider.id !== "rules" ? contradiction({ decider, r, s: p.after, reply: payload.content, outcome: p.outcome }) : Promise.resolve(null),
      wantLive ? writeLiveChoices({ r, s: p.after, reply: payload.content, player: p.player, settings, userId, decider }) : Promise.resolve([])
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
    if (live.length) {
      await patchWarpMeta(payload.chatId, msg.id, (w) => ({ ...w, live: { ...w.live ?? {}, [String(swipe)]: live } }));
    }
  } catch (e) {
    logError("generation ended", e);
  } finally {
    host().sendToFrontend({ type: "busy", chatId: payload.chatId, busy: false }, userId);
    schedulePush(payload.chatId, userId, 0);
  }
}
var pending, playerNames, started;
var init_turn = __esm(() => {
  init_dice();
  init_resolve();
  init_state();
  init_view();
  init_decisions();
  init_deciders();
  init_helpers();
  init_ledger();
  init_live();
  init_settings();
  init_source();
  init_state_push();
  pending = new Map;
  playerNames = new Map;
  started = new Map;
});

// src/backend/state-push.ts
function setActiveChat(userId, chatId) {
  activeChat.set(key3(userId), chatId);
}
function getActiveChat(userId) {
  return activeChat.get(key3(userId)) ?? null;
}
async function pushState(chatId, userId, force = false) {
  try {
    const loaded = await getRuleset(chatId, userId, force);
    const status = statusOf(loaded);
    if (!chatId || !loaded?.ruleset) {
      send({ type: "state", chatId, status, hud: null, map: null, choices: [], records: [], suggestions: [], latestMessageId: null, choicesAnchor: null, busy: false, dungeon: null, dungeonEntries: [] }, userId);
      return;
    }
    const r = loaded.ruleset;
    const settings = await getSettings(userId);
    const msgs = await getMessages(chatId);
    const { state, steps } = foldPath(r, msgs);
    lastStates.set(chatId, state);
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
      map: settings.enabled ? buildMap(r, state) : null,
      choices: settings.enabled ? buildChoices(r, state, { ...settings, live: liveChoicesOf(latest) }) : [],
      records: settings.enabled ? records : [],
      suggestions: settings.enabled ? suggestions.filter((s) => s.canRedo) : [],
      latestMessageId: latest?.id ?? null,
      choicesAnchor: anchor,
      busy: busyChats.has(chatId),
      dungeon: settings.enabled ? await withName(buildDungeonView(r, state), chatId, userId) : null,
      dungeonEntries: settings.enabled ? buildDungeonEntries(r, state) : []
    }, userId);
  } catch (e) {
    logError("pushState", e);
  }
}
async function withName(v, chatId, userId) {
  if (!v)
    return v;
  await Promise.resolve().then(() => init_turn());
  const name = await playerName(chatId, userId).catch(() => "You");
  const safe = JSON.stringify(name).slice(1, -1);
  return JSON.parse(JSON.stringify(v).replace(/\{\{user\}\}/g, () => safe));
}
function schedulePush(chatId, userId, delay = 150) {
  if (!chatId)
    return;
  const active = getActiveChat(userId);
  if (active && active !== chatId)
    return;
  const k = `${key3(userId)}:${chatId}`;
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
var lastStates, busyChats, activeChat, timers, key3 = (userId) => userId ?? "_", MAX_RECORDS = 60;
var init_state_push = __esm(() => {
  init_view();
  init_view2();
  init_ledger();
  init_settings();
  init_source();
  lastStates = new Map;
  busyChats = new Set;
  activeChat = new Map;
  timers = new Map;
});

// src/backend.ts
init_resolve();
init_templates();
init_ledger();
init_settings();
init_source();
init_state_push();
init_turn();
init_loader();
init_deciders();

// src/backend/dungeon.ts
init_dice();
init_run();
init_ledger();
init_source();
init_state_push();
function run2(r, s, op) {
  switch (op.op) {
    case "enter":
      return enterDungeon(r, s, op.id, op.companions, randomSeed());
    case "move":
      return moveTo(r, s, op.x, op.y);
    case "choose":
      return chooseEvent(r, s, op.choice);
    case "battle":
      if (op.auto)
        return battleCommand(r, s, { auto: op.auto });
      if (op.escape)
        return battleCommand(r, s, { escape: true });
      if (op.item)
        return battleCommand(r, s, { item: op.item, target: op.target });
      return battleCommand(r, s, { skill: op.skill ?? "attack", target: op.target });
    case "descend":
      return descend(r, s);
    case "leave":
      return leaveDungeon(r, s);
    case "use":
      return useItem(r, s, op.item, op.target);
    case "buy":
      return shopBuy(r, s, op.item);
  }
}
async function runDungeonOp(msg, userId) {
  const loaded = await getRuleset(msg.chatId, userId);
  const r = loaded?.ruleset;
  if (!r)
    return;
  if (busyChats.has(msg.chatId)) {
    toast("info", "Wait for the story to catch up first.", userId);
    return;
  }
  const msgs = await getMessages(msg.chatId);
  const last = msgs[msgs.length - 1];
  if (!last) {
    toast("warning", "Send a message first — the dungeon attaches to the latest message.", userId);
    return;
  }
  const { state } = foldPath(r, msgs);
  const res = run2(r, state, msg);
  if (res.error) {
    toast("warning", res.error, userId);
    await pushState(msg.chatId, userId);
    return;
  }
  if (res.events.length) {
    const swipe = last.swipe_id ?? 0;
    const existing = warpMeta(last).swipes?.[String(swipe)];
    const rec = existing ? { ...existing, events: [...existing.events, ...res.events] } : { v: 1, hints: [], events: res.events, at: Date.now() };
    await writeRecord(msg.chatId, last.id, swipe, rec);
  }
  await pushState(msg.chatId, userId);
  if (res.narrate) {
    await spindle.chat.appendMessage(msg.chatId, {
      role: "user",
      content: res.narrate.say,
      metadata: { warp: { intent: { actionId: DUNGEON_ACTION, via: "choice", label: res.narrate.say } } }
    }, { triggerGeneration: true });
  }
}

// src/engine/balance.ts
init_dice();
init_expr();
init_state();
init_resolve();
function effectsOf(r) {
  const out = [];
  const add = (e) => {
    if (!e)
      return;
    out.push(e);
    for (const d of e.decide)
      for (const o of d.options)
        add(o.effect);
  };
  const addAction = (a) => {
    add(a.cost);
    add(a.effects);
    for (const e of Object.values(a.outcomes))
      add(e);
  };
  Object.values(r.actions).forEach(addAction);
  for (const t of r.triggers)
    add(t.effects);
  for (const enc of Object.values(r.encounters)) {
    Object.values(enc.actions).forEach(addAction);
    for (const o of enc.foeMoves?.options ?? [])
      add(o.effect);
    Object.values(enc.outcomes).forEach(add);
    add(enc.start);
  }
  for (const f of Object.values(r.feats))
    add(f.reward);
  for (const p of Object.values(r.perks))
    add(p.effects);
  for (const f of Object.values(r.fronts))
    for (const st of f.stages)
      add(st.effects);
  for (const e of Object.values(r.randomEvents.events))
    add(e.effects);
  Object.values(r.liveChoices.tags).forEach(addAction);
  return out;
}
function reviewBalance(r) {
  const out = [];
  const start = initialState(r);
  for (const a of Object.values(r.actions)) {
    if (!a.check || a.perPerson)
      continue;
    const s = cloneState(start);
    if (a.at.length)
      s.location = a.at[0];
    const o = odds(r, s, a);
    if (!o)
      continue;
    const p = o.success + o.partial / 2;
    if (p < 0.12)
      out.push({ id: `odds:${a.id}`, part: "actions", text: `“${a.label}” succeeds only ${Math.round(p * 100)}% of the time at the start.`, fix: `Make the "${a.id}" action's check noticeably easier at the start (aim for 30–50% success), keeping it harder than it will be later.` });
    else if (p > 0.95)
      out.push({ id: `odds:${a.id}`, part: "actions", text: `“${a.label}” succeeds ${Math.round(p * 100)}% of the time — the roll barely matters.`, fix: `Make the "${a.id}" action's check less of a sure thing (aim for 60–80% success at the start).` });
  }
  for (const id of r.statOrder) {
    const d = r.stats[id];
    if (!d.perHour)
      continue;
    const toEdge = d.perHour > 0 ? d.max - d.start : d.start - d.min;
    const hours = toEdge / Math.abs(d.perHour);
    const bad = d.perHour > 0 && d.good === "low" || d.perHour < 0 && d.good === "high";
    if (bad && hours < 8) {
      out.push({ id: `drift:${id}`, part: "stats", text: `${d.label} reaches its worst in about ${Math.max(1, Math.round(hours))}h of game time on its own.`, fix: `Slow down the per_hour drift of the "${id}" stat so it takes at least a day of game time to reach its worst.` });
    }
  }
  const env = makeEnv(r, start);
  const meaningful = (e) => Object.keys(e.stats).length + Object.keys(e.set).length + Object.keys(e.addConditions).length + Object.keys(e.items).length + Object.keys(e.rel).length + e.decide.length + e.wear.length + e.undress.length > 0 || !!e.move || !!e.startEncounter || !!e.hint;
  for (const t of r.triggers) {
    if (t.when && !t.whenScene && meaningful(t.effects) && evalBool(t.when, env, false) && !t.repeat) {
      out.push({ id: `trig:${t.id}`, part: "rules", text: `Rule “${t.id}” fires immediately on turn one.`, fix: `Adjust the "${t.id}" trigger (or the starting values it checks) so it doesn't fire at the very start.` });
    }
  }
  for (const f of Object.values(r.fronts)) {
    const last = f.stages[f.stages.length - 1];
    const rate = evalNumber(f.rate, env, 0);
    if (!last || rate <= 0)
      continue;
    const days = (last.at - f.start) / rate;
    if (days < 2) {
      out.push({ id: `front:${f.id}`, part: "story", text: `“${f.label}” runs through all its stages in about ${Math.max(1, Math.round(days * 24))}h of game time.`, fix: `Slow the "${f.id}" front down (lower per_day or space its stages out) so it takes at least a week or two of game time to play out.` });
    }
  }
  if (r.randomEvents.enabled) {
    const perDay = evalNumber(r.randomEvents.perDay, env, 0);
    if (perDay > 0 && 100 / perDay < 0.75) {
      out.push({ id: "events:pace", part: "story", text: `A random event roughly every ${Math.max(1, Math.round(100 / perDay * 24))}h of game time — that's a lot.`, fix: "Lower random_events per_day so events come every few days of game time rather than several times a day." });
    }
  }
  const touched = new Set;
  for (const e of effectsOf(r)) {
    Object.keys(e.stats).forEach((k) => touched.add(k));
    Object.keys(e.set).forEach((k) => touched.add(k));
  }
  for (const id of r.statOrder) {
    const d = r.stats[id];
    if (d.kind === "money" && d.narrator > 0)
      continue;
    if (!touched.has(id) && !d.perHour && d.narrator <= 0) {
      out.push({ id: `dead:${id}`, part: "stats", text: `${d.label} never changes — no action, rule or story update touches it.`, fix: `Give the "${id}" stat a way to change: at least one action or rule that raises or lowers it, or allow the narrator to adjust it.` });
    }
  }
  for (const enc of Object.values(r.encounters)) {
    const sim = simulateEncounter(r, start, enc.id, 120);
    if (!sim)
      continue;
    const goodEnds = Object.keys(enc.outcomes).filter((o) => /won|win|victory|escaped|fled|seduced/i.test(o));
    const wins = goodEnds.reduce((n, o) => n + (sim.outcomes[o] ?? 0), 0) / sim.runs;
    if (sim.stuck / sim.runs > 0.2) {
      out.push({ id: `enc-stuck:${enc.id}`, part: "encounters", text: `“${enc.name}” often doesn't end within 25 rounds.`, fix: `Make the "${enc.id}" encounter reliably end within about 4–10 rounds (stronger effects on foe stats or tighter end_when conditions).` });
    } else if (goodEnds.length && wins < 0.2) {
      out.push({ id: `enc-hard:${enc.id}`, part: "encounters", text: `“${enc.name}” is won or escaped only ${Math.round(wins * 100)}% of the time with random play.`, fix: `Make the "${enc.id}" encounter fairer for the player (aim for roughly half of random playthroughs ending well).` });
    } else if (goodEnds.length && wins > 0.95) {
      out.push({ id: `enc-easy:${enc.id}`, part: "encounters", text: `“${enc.name}” almost always goes the player's way — there's little risk.`, fix: `Make the "${enc.id}" encounter more dangerous (foe moves hit harder or the player's options are riskier).` });
    }
  }
  return out;
}
function simulateEncounter(r, from, id, runs) {
  const enc = r.encounters[id];
  if (!enc)
    return null;
  const outcomes = {};
  let stuck = 0, rounds = 0;
  const rng = seededRng(`sim:${id}`);
  for (let i = 0;i < runs; i++) {
    const s = cloneState(from);
    applyEvent(s, { t: "enc", id, foe: Object.fromEntries(enc.foe.stats.map((x) => [x.id, x.start])), src: "start" }, r);
    let ended = null;
    for (let n = 0;n < 25 && s.encounter; n++) {
      const choices = availableChoices(r, s);
      const pick = choices.length ? choices[Math.floor(rng() * choices.length)].id : null;
      const { record } = resolveTurnFull(r, s, pick ? { actionId: pick, via: "choice" } : null, { seed: `sim:${id}:${i}:${n}` });
      for (const e of record.events) {
        applyEvent(s, e, r);
        if (e.t === "enc" && !e.id)
          ended = e.outcome ?? "ended";
      }
      rounds++;
    }
    if (ended)
      outcomes[ended] = (outcomes[ended] ?? 0) + 1;
    else
      stuck++;
  }
  return { runs, outcomes, stuck, rounds: rounds / runs };
}

// src/backend/builder.ts
init_loader();
init_lint();

// src/engine/reference.ts
var PART_LABELS = ["core", "stats", "people", "world", "actions", "encounters", "journal", "rules", "story"];
var PART_CONTENTS = {
  core: "name, description, player, clock, start, hud, narration",
  stats: "stats",
  people: "relationships (stats + people with schedules)",
  world: "weather, locations, items (incl. clothing), wardrobe, conditions, flags, start.items",
  actions: "actions",
  encounters: "encounters, dungeons",
  journal: "codex, feats, perks",
  rules: "triggers",
  story: "secrets, fronts, random_events, live_choices"
};
function partForIssue(where) {
  const w = where.replace(/^warp-ruleset\s*·\s*/i, "");
  const head = w.split(/[›,]/)[0].trim().toLowerCase();
  if (PART_LABELS.includes(head))
    return head;
  if (head.startsWith("stats"))
    return "stats";
  if (head.startsWith("relationships") || head.startsWith("people"))
    return "people";
  if (["locations", "items", "wardrobe", "weather", "conditions", "flags"].some((k) => head.startsWith(k)))
    return "world";
  if (head.startsWith("actions"))
    return "actions";
  if (head.startsWith("encounters") || head.startsWith("dungeons"))
    return "encounters";
  if (["codex", "feats", "perks"].some((k) => head.startsWith(k)))
    return "journal";
  if (head.startsWith("triggers") || head.startsWith("rules"))
    return "rules";
  if (["secrets", "fronts", "random events", "live choices"].some((k) => head.startsWith(k)))
    return "story";
  return "core";
}
var REFERENCE = `WARP RULESET FORMAT (YAML). Numbers may be formulas in quotes. Meters are 0–100 unless there's a reason.

stats:            # kinds: meter (bar) | attribute | skill | money | hidden
  stress: { kind: meter, good: low, start: 0, per_hour: -0.5, narrator: 10, bands: { 0: You are calm., 30: You are stressed., 70: You are distressed. } }
  athletics: { kind: skill, max: 100, start: 10, grades: [F, D, C, B, A, S] }
  money: { kind: money, start: 50, narrator: 50 }
  # good: high|low|none (colours); per_hour: drift; narrator: max change the story may make per reply (0 = rules only); max may be a formula ("level * 5")

relationships:
  open: true                       # track new people the story introduces
  stats: { trust: { start: 10, narrator: 5, bands: { 0: Wary, 40: Trusting } } }
  people:
    jo:
      name: Jo
      desc: Runs the café.
      schedule:                    # first matching entry wins; entry without when = default; no match = not around
        - { when: "between(hour, 7, 18) and weekday != 'Sun'", at: high_street }

clock: { start: "Mon 07:00", date: "Sep 4", minutes_per_action: 15, narrator_max: 240 }
start: { location: home, items: { phone: 1 } }
hud: { currency: "$", bars: [health, stress] }
narration: { notes: "Guidance for the narrator." }
player: { age: 20 }

weather: { temps: { spring: 12, summer: 22, autumn: 11, winter: 3 } }     # enables weather + temperature
locations:
  home: { name: Home, desc: "...", indoors: true, exits: [street], travel: 10 }   # exits become travel buttons
items:
  phone: Phone
  raincoat: { name: Raincoat, slot: outer, warmth: 5, reveal: 0, traits: [rainproof] }   # clothing = item with a slot
wardrobe: { slots: [outer, top, bottom, under_top, under_bottom, feet], cover: [top, bottom], start: [t_shirt, jeans] }
conditions: { cold: { label: Cold, tone: bad } }
flags: { met_boss: { start: false, narrator: true } }

actions:
  pick_lock:
    label: Pick the lock
    group: Explore
    say: "*I kneel and work the lock.*"
    at: [street]                   # optional location filter
    when: "has('lockpick') and between(hour, 20, 6)"
    time: 10                       # minutes
    cost: { fatigue: +2 }
    tags: [crime]
    check: { chance: "20 + skulduggery / 2", label: Skulduggery }      # d100 roll-under percent
    # or check: { vs: 12, add: "floor(dex / 2)", partial: 3 }          # d20 + add vs 12
    # or check: { style: pbta, add: cool }                             # 2d6: 10+ hit, 7–9 mixed
    success: { flags: { door_open: true }, skulduggery: +1 }
    fail: { stress: +5, hint: "The pick snaps." }
    # tiers: crit_success, success, partial, fail, crit_fail; without a check use effects:
  chat:
    label: Chat with {target}
    per_person: true               # one button per person present; {target} = their name
    effects: { rel: { target: { trust: +2 } } }
  sneak:
    hidden: true                   # free-text only: the referee maps typed attempts to it
    desc: Staying unseen.
    params: { difficulty: { easy: 70, normal: 45, hard: 25, extreme: 10 } }   # easiest → hardest
    check: { chance: "difficulty + skulduggery / 2" }

EFFECTS (any success/fail/effects/cost/do block):
  stat shorthand (fatigue: +5, may be a quoted formula), set: { stress: 50 }, flags: { x: true }, give: item / take: item,
  rel: { jo: { trust: +3 } }, move: location, time: 30, add_condition: [cold] or { cold: 120 }, remove_condition: [cold],
  hint: "direction for the narrator", wear: [raincoat], undress: [top], damage: { top: 20 },
  start_encounter: id, foe: { hp: -6 }, end: outcome_id, unlock: [codex_id],
  decide: { ask: "How does Jo react?", options: { yes: { desc: "Agrees", weight: 2, rel: { jo: { trust: +2 } } }, no: { desc: "Refuses", weight: 1 } } }
  Formulas with commas MUST be quoted: money: "-min(money, 20)".

encounters:
  mugging:
    name: Mugging
    tags: [violence]
    foe: { name: Mugger, stats: { nerve: { start: 10, max: 10 } } }
    actions: { fight: { label: Fight back, check: { chance: "30 + athletics / 2" }, success: { foe: { nerve: -6 } }, fail: { pain: +10 } }, run: { label: Run, effects: { end: escaped } } }
    foe_moves: { grab: { desc: "Grabs you", weight: 2, pain: +8 }, threaten: { desc: "Threatens", weight: 1, stress: +6 } }
    end_when: { won: "foe.nerve <= 0", beaten: "pain >= 80" }
    outcomes: { won: { hint: "They flee." }, escaped: { stress: +3 }, beaten: { money: "-min(money, 30)" } }

dungeons:         # roguelike diving: floors of face-down tiles, one way down, quit any time (keep the loot; get wiped out and lose it)
  old_mines:
    name: The Old Mines
    at: [docks]                    # entrance locations (empty = anywhere)
    theme: cave                    # cave | crypt | ruins | hell | lair
    floors: 10                     # 0 = endless; a guardian every boss_every floors (default 5)
    tiles: { enemy: 6, elite: 1, treasure: 2.5, trap: 1.5, rest: 1, shop: 0.6, event: 2, surprise: 1.5, romance: 1.2, empty: 7 }
    loot: { lockpick: 2 }          # ruleset items that can turn up in chests
    party: { max: 3, when: "rel(target, 'trust') >= 30", classes: { jo: healer } }   # fighter | mage | healer | rogue | adventurer
    player: { class: adventurer, atk: "10 + athletics / 10" }                       # battle stats from ruleset stats (optional)
    on_leave: { fatigue: +15 }
    on_defeat: { pain: +40, stress: +20 }
    events:                        # added to the built-ins (builtin_events: false to drop them); romance: works the same with {target}
      smugglers_cache: { text: "A smugglers' cache behind a loose stone.", choices: { take: { label: Take it, gold: "30 + depth * 10", crime: +5 }, leave: { label: Leave it } } }
    # choice outcome keys: text, heal, hurt, mana (percent), gold, xp, bag { potion: 1 }, fight (enemy|elite|monster id), bond, desire, plus any effect; chance: "60" rolls d100
    # monsters: { id: { name, like: goblin, tier: 1-4, hp, atk, def, mat, mdf, agi, skills: [attack, smash], xp, gold } }; bosses: [orc_warlord, hydra]

codex: { docks: { title: The Docks, category: Places, text: "...", unlock: "location == 'docks'", lore: [Lorebook entry title] } }
feats: { night_owl: { name: Night owl, desc: "...", unlock: "hour >= 2 and hour < 5", reward: { stress: -5 } } }
perks: { points: perk_points, sharp: { name: Sharpshooter, desc: "+2 Aim", cost: 1, requires: "level >= 2", effects: { aim: +2 } } }

triggers:
  exhausted: { when: "fatigue >= 85", do: { add_condition: [exhausted], hint: "..." } }         # fires once when it becomes true
  drain: { when: "fatigue >= 85", repeat: true, do: { stress: +2 } }                           # every turn while true
  danger: { when_scene: "{{user}} is in immediate danger", do: { stress: +5 } }                # judged in plain language

STORY MACHINERY (the "story" part):
secrets:          # only opened stages ever reach the narrator — what isn't in the prompt can't leak
  ward_accident:
    about: Professor Ward
    cue: "Ward goes quiet whenever the old observatory comes up."    # known from the start: behaviour, never the reason
    tell: exists                   # narrator is told there's more it doesn't know, so it deflects instead of inventing
    stages:                        # a ladder: each opens when its when holds, in order, and never closes
      - { when: "rel('ward', 'trust') >= 60", text: "A student died in an observatory accident on Ward's watch.", lore: [Lorebook entry title] }
      - { when: "flag('found_logbook')", text: "Ward falsified the safety log to protect the department." }
fronts:           # hidden world clocks that fill with in-game time; each stage surfaces once in the story
  harbour_gangs:
    label: The harbour gangs
    per_day: 6                     # clock points per in-game day (formula); per_turn also allowed; max defaults to 100
    when: "not flag('gangs_broken')"
    story: { "{{user}} stirs up trouble with the gangs": 10, "{{user}} helps the police against the gangs": -10 }   # judged each turn
    stages:
      - { at: 30, hint: "More broken windows along the harbour road.", backstage: "The Kestrels took over the fish market.", surface: "A harbour shop is torched overnight.", do: { flags: { harbour_unrest: true } } }
      # hint = a sign with no reason, shown from halfway to this stage; backstage stays hidden until the stage surfaces
random_events:    # a hidden gauge fills with in-game time, not per reply; near the top it picks the next event and shows its omen
  pace: { per_day: 25, jitter: 0.3, rest_days: 1, omen_at: 80 }     # per_day 25 ≈ one event every 4 days
  events:
    storm: { when: "season == 'autumn'", weight: 2, cooldown: 7, omen: "Gulls are flying inland.", text: "A storm rolls in off the sea.", do: { add_condition: [soaked] } }
live_choices:     # a writer phrases options for the moment; each must carry one of these tags, and the TAG decides what happens
  label: Right now
  count: 3
  when: "not in_encounter"
  tags:
    bold: { desc: "A daring or risky move", check: { vs: 12, add: "floor(nerve / 10)" }, success: { nerve: +1 }, fail: { stress: +5 } }
    kind: { desc: "Something kind toward someone here", per_person: true, effects: { rel: { target: { trust: +3 } } } }
    careful: { desc: "The cautious, safe option" }
STORY EFFECTS: front: { harbour_gangs: -20 }, reveal: [ward_accident] (opens its next stage), gauge: +30 (brings the next event closer).

FORMULA NAMES: stats, flags, hour, minute, day, weekday, month, date, season, weather, temperature, indoors, outside,
warmth, warmth_min, warmth_max, too_cold, too_hot, reveal, exposed, naked, in_encounter, round, foe.<stat>, target.<relstat>, location.
FUNCTIONS: has(item[, n]), count(item), flag(x), cond(x), at(loc), rel(person, stat), met(person), between(v, lo, hi), roll('2d6'),
wearing(item), worn(slot), trait(t), present(person), where(person), codex(id), feat(id), perk(id),
secret(id) (stages the narrator knows), front(id) (clock value), front_stage(id) (stages surfaced), happened(event),
deepest(dungeon) (deepest floor reached), in_dungeon, dungeon_depth,
min, max, clamp, floor, ceil, round, abs.
Operators: + - * / % < <= > >= == != and or not, a ? b : c. Strings in single quotes.
`;

// src/backend/builder.ts
init_state();
init_templates();
init_view();
init_source();
var sessions = new Map;
var key4 = (userId, characterId) => `${userId ?? "_"}:${characterId}`;
var path = (characterId) => `builder/${characterId}.json`;
async function save(s, userId) {
  s.updatedAt = Date.now();
  sessions.set(key4(userId, s.characterId), s);
  try {
    await host().userStorage.setJson(path(s.characterId), s, { userId });
  } catch (e) {
    logError("builder save", e);
  }
}
function emit(s, userId) {
  send({ type: "builder", session: s }, userId);
}
async function progress(s, label, userId) {
  s.busy = label;
  if (label)
    s.error = null;
  emit(s, userId);
  if (!label)
    await save(s, userId);
}
async function sessionFor(chatId, userId) {
  const characterId = await characterForChat(chatId, userId);
  if (!characterId)
    return null;
  const hit = sessions.get(key4(userId, characterId));
  if (hit)
    return hit;
  try {
    const stored = await host().userStorage.getJson(path(characterId), { fallback: null, userId });
    if (stored) {
      stored.busy = null;
      sessions.set(key4(userId, characterId), stored);
      return stored;
    }
  } catch {}
  return null;
}
async function llm(s, system, user, userId, maxTokens = 3000) {
  const res = await host().generate.quiet({
    type: "quiet",
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
    connection_id: s.connectionId || undefined,
    parameters: { temperature: s.creative ? 0.8 : 0.4, max_tokens: maxTokens },
    userId,
    signal: AbortSignal.timeout(180000)
  });
  return typeof res === "string" ? res : res?.content ?? "";
}
function parseJson(text) {
  const t = text.replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a)
    return null;
  try {
    return JSON.parse(t.slice(a, b + 1));
  } catch {
    return null;
  }
}
function extractYaml(text) {
  const fenced = /```(?:ya?ml)?\s*\n([\s\S]*?)```/i.exec(text);
  let y = fenced ? fenced[1] : text;
  const lines = y.split(`
`);
  const first = lines.findIndex((l) => /^[A-Za-z_][\w-]*:/.test(l) || /^#/.test(l));
  if (first > 0)
    y = lines.slice(first).join(`
`);
  return y.trim() + `
`;
}
async function cardText(characterId, userId) {
  const c = await host().characters.get(characterId, userId);
  if (!c)
    throw new Error("Character not found");
  const clip = (v, n) => v.length > n ? `${v.slice(0, n)}…` : v;
  const parts = [
    `Name: ${c.name}`,
    c.description && `Description:
${clip(c.description, 4000)}`,
    c.personality && `Personality:
${clip(c.personality, 1500)}`,
    c.scenario && `Scenario:
${clip(c.scenario, 1500)}`,
    c.first_mes && `Greeting:
${clip(c.first_mes, 2500)}`,
    c.creator_notes && `Creator notes:
${clip(c.creator_notes, 1000)}`
  ].filter(Boolean);
  let hasRuleset = false;
  const lore = [];
  for (const bookId of c.world_book_ids ?? []) {
    const book = await host().world_books.get(bookId, userId);
    if (!book)
      continue;
    if (isRulesetBookName(book.name)) {
      hasRuleset = true;
      continue;
    }
    const page = await host().world_books.entries.list(bookId, { limit: 60, userId });
    for (const e of page.data) {
      if (isRulesetEntryTitle(e.comment)) {
        hasRuleset = true;
        continue;
      }
      if (lore.length < 40)
        lore.push(`- ${e.comment || e.key.join(", ") || "entry"}: ${clip(e.content.replace(/\s+/g, " "), 220)}`);
    }
  }
  if (lore.length)
    parts.push(`Lorebook (excerpts):
${lore.join(`
`)}`);
  return { name: c.name, text: parts.join(`

`), hasRuleset };
}
var SYSTEMS = [
  { id: "needs", label: "Needs & condition (fatigue, stress…)" },
  { id: "relationships", label: "Relationships" },
  { id: "money", label: "Money & work" },
  { id: "skills", label: "Skills that grow" },
  { id: "clothing", label: "Clothing, weather & temperature" },
  { id: "schedules", label: "NPC schedules & places" },
  { id: "encounters", label: "Encounters / combat" },
  { id: "dungeon", label: "Dungeon diving (roguelike floors, party battles)" },
  { id: "crime", label: "Crime & consequences" },
  { id: "journal", label: "Codex & feats" },
  { id: "perks", label: "Levels & perks" },
  { id: "story", label: "Secrets, a living world & choices for the moment" }
];
function coreQuestions(defaultSystems) {
  return [
    {
      id: "tone",
      core: true,
      kind: "single",
      text: "What tone should the game have?",
      default: "dramatic",
      options: ["cozy", "dramatic", "dark", "chaotic", "romantic", "gritty"].map((t) => ({ id: t, label: t[0].toUpperCase() + t.slice(1) }))
    },
    { id: "systems", core: true, kind: "multi", text: "Which systems do you want?", default: defaultSystems, options: SYSTEMS },
    {
      id: "difficulty",
      core: true,
      kind: "scale",
      text: "How hard should checks be?",
      default: 3,
      options: [{ id: "1", label: "Forgiving" }, { id: "3", label: "Fair" }, { id: "5", label: "Punishing" }]
    },
    {
      id: "relationship_depth",
      core: true,
      kind: "single",
      text: "How deep should relationship tracking go?",
      default: "simple",
      options: [
        { id: "simple", label: "Simple — affection & trust" },
        { id: "deep", label: "Deep — love, lust, trust, dominance" },
        { id: "custom", label: "Custom — I'll describe it below" }
      ]
    }
  ];
}
function normQuestions(raw, prefix) {
  if (!Array.isArray(raw))
    return [];
  const out = [];
  raw.slice(0, 5).forEach((q, i) => {
    if (!q || typeof q !== "object")
      return;
    const r = q;
    const text = typeof r.text === "string" ? r.text : typeof r.question === "string" ? r.question : "";
    if (!text)
      return;
    const kind = ["single", "multi", "scale", "text"].find((k) => k === r.kind) ?? (Array.isArray(r.options) ? "single" : "text");
    const options = Array.isArray(r.options) ? r.options.slice(0, 8).map((o, j) => typeof o === "string" ? { id: `o${j}`, label: o } : { id: String(o.id ?? `o${j}`), label: String(o.label ?? o.text ?? `Option ${j + 1}`) }) : undefined;
    out.push({ id: `${prefix}${i}`, text, kind, ...options?.length ? { options } : {}, ...typeof r.why === "string" ? { why: r.why } : {} });
  });
  return out;
}
function answerText(q, a) {
  if (a === undefined || a === "" || Array.isArray(a) && !a.length)
    return "(no answer)";
  const label = (id) => q.options?.find((o) => o.id === id)?.label ?? id;
  if (Array.isArray(a))
    return a.map(label).join(", ");
  if (q.kind === "scale")
    return `${a} of 5 (1 = forgiving, 5 = punishing)`;
  return typeof a === "string" ? label(a) : String(a);
}
function brief(s) {
  const qa = s.rounds.flatMap((r) => r.questions.map((q) => `- ${q.text} → ${answerText(q, r.answers[q.id] ?? q.default)}`));
  const adds = s.additions.filter((a) => a.name.trim()).map((a) => `- ${a.kind}: ${a.name}${a.note ? ` — ${a.note}` : ""}`);
  return [
    `Character: ${s.characterName}`,
    s.analysis ? `Card summary: ${s.analysis.summary}` : "",
    s.analysis?.statusBlock?.found ? `The card currently makes the model print a status block with: ${s.analysis.statusBlock.fields.join(", ")}. Cover these as proper stats; the narrator should no longer print status blocks.` : "",
    s.analysis?.cardType === "scenario" ? `This is a scenario/narrator card: "${s.characterName}" is the setting, NOT a person — never add it to people.` : "",
    s.analysis?.cast?.length ? `Main cast — add each to relationships.people with a start: block that matches how they feel about {{user}} at the beginning (use the relationship stats' scales; strong feelings mean strong numbers):
${s.analysis.cast.map((c) => `- ${c.name}: ${c.relation}`).join(`
`)}` : "",
    qa.length ? `The player's answers:
${qa.join(`
`)}` : "",
    adds.length ? `The player's own additions (build each in — the stat/item/place/etc., what changes it, and which actions check it):
${adds.join(`
`)}` : "",
    s.creative ? "Style: be inventive — add fitting systems, places and actions beyond the starting point where they serve the card." : "Style: stay close to the starting point — rename, retune, trim and extend it to fit the card, rather than inventing whole new systems."
  ].filter(Boolean).join(`

`);
}
function chosenSystems(s) {
  const q = s.rounds[0]?.questions.find((x) => x.id === "systems");
  const a = s.rounds[0]?.answers.systems ?? q?.default;
  return new Set(Array.isArray(a) ? a : SYSTEMS.map((x) => x.id));
}
function merged(parts) {
  return parts.map((p, i) => ({ label: `warp-ruleset · ${p.label}`, content: p.yaml, order: i }));
}
function check(parts) {
  const { ruleset, issues } = loadRuleset(merged(parts));
  const all = ruleset ? [...issues, ...lintRuleset(ruleset)] : issues;
  for (const p of parts) {
    p.issues = all.filter((i) => partForIssue(i.where) === p.label);
    p.status = p.issues.some((i) => i.level === "error") ? "error" : p.issues.length ? "warn" : "ok";
  }
  return { ruleset, issues: all };
}
function contextOf(parts) {
  const { ruleset: r } = loadRuleset(merged(parts.filter((p) => p.yaml.trim())));
  if (!r)
    return "";
  const list = (label, ids) => ids.length ? `${label}: ${ids.join(", ")}` : "";
  return [
    list("Stats", r.statOrder.map((id) => `${id} (${r.stats[id].kind}${r.stats[id].kind === "meter" ? ` ${r.stats[id].min}–${r.stats[id].max}` : ""})`)),
    list("Relationship stats", r.relStatOrder),
    list("People", Object.keys(r.people)),
    list("Locations", Object.keys(r.locations)),
    list("Items", Object.keys(r.items).map((id) => r.items[id].slot ? `${id} [${r.items[id].slot}]` : id)),
    list("Wardrobe slots", r.wardrobe.enabled ? r.wardrobe.slots.map((x) => x.id) : []),
    list("Conditions", Object.keys(r.conditions)),
    list("Flags", Object.keys(r.flags)),
    list("Encounters", Object.keys(r.encounters)),
    list("Codex", Object.keys(r.codex))
  ].filter(Boolean).join(`
`);
}
var SYSTEM_PROMPT = `You write sections of a Warp ruleset: YAML that a game engine runs underneath a roleplay chat.
Output ONLY the YAML for the requested section — no prose, no explanations. Use only the formats below.
Use snake_case ids. Keep numbers readable (meters 0–100). Quote any formula that contains a comma.
Write in-world text (bands, hints, descriptions) in a voice that suits the card. Refer to the player as {{user}}.

${REFERENCE}`;
async function draftPart(s, label, base, context, userId, note, current) {
  const user = [
    brief(s),
    `Write the "${label}" section. It may contain only: ${PART_CONTENTS[label]}.`,
    base ? `Starting point for this section (adapt it):
${base}` : "There's no starting point for this section — write it from scratch.",
    current ? `The current version of this section:
${current}` : "",
    context ? `Ids defined in the other sections (reuse them exactly; don't redefine them here):
${context}` : "",
    note ? `The player asked for this change: ${note}` : ""
  ].filter(Boolean).join(`

`);
  return extractYaml(await llm(s, SYSTEM_PROMPT, user, userId, 3500));
}
async function repair(s, parts, userId, includeWarnings = true) {
  for (let round = 0;round < 2; round++) {
    check(parts);
    const broken = parts.filter((p) => p.status === "error" || includeWarnings && round === 0 && p.status === "warn");
    if (!broken.length)
      return;
    await progress(s, `Fixing ${broken.map((p) => p.label).join(", ")}…`, userId);
    const context = contextOf(parts);
    await Promise.all(broken.map(async (p) => {
      const msgs = p.issues.map((i) => `- ${i.where}: ${i.message}`).join(`
`);
      const user = `This "${p.label}" section has problems reported by the checker. Return the corrected YAML for the whole section.

Problems:
${msgs}

Section:
${p.yaml}

Ids in the other sections:
${context}`;
      try {
        p.yaml = extractYaml(await llm(s, SYSTEM_PROMPT, user, userId, 3500));
      } catch (e) {
        logError("builder repair", e);
      }
    }));
  }
  check(parts);
}
function buildPreview(s) {
  const { ruleset: r } = check(s.parts);
  if (!r) {
    s.preview = null;
    return;
  }
  const st = initialState(r);
  const counts = {
    meters: r.statOrder.filter((id) => r.stats[id].kind === "meter").length,
    skills: r.statOrder.filter((id) => ["skill", "attribute"].includes(r.stats[id].kind)).length,
    people: Object.keys(r.people).length,
    places: Object.keys(r.locations).length,
    items: Object.keys(r.items).length,
    actions: Object.keys(r.actions).length,
    encounters: Object.keys(r.encounters).length,
    dungeons: Object.keys(r.dungeons).length,
    rules: r.triggers.length,
    codex: Object.keys(r.codex).length,
    feats: Object.keys(r.feats).length,
    perks: Object.keys(r.perks).length,
    secrets: Object.keys(r.secrets).length,
    fronts: Object.keys(r.fronts).length,
    events: Object.keys(r.randomEvents.events).length
  };
  const phrase = Object.entries(counts).filter(([, n]) => n).map(([k, n]) => `${n} ${n === 1 ? k.replace(/s$/, "").replace(/^people$/, "person").replace(/^codex$/, "codex entry") : k}`).join(", ");
  const extras = [
    r.weather.enabled ? "weather & temperature" : "",
    r.wardrobe.enabled ? "a wardrobe" : "",
    r.clock.startDate ? "a calendar" : "",
    r.liveChoices.enabled ? "choices written for the moment" : ""
  ].filter(Boolean);
  s.preview = {
    summary: `${r.name}: ${phrase}${extras.length ? `, plus ${extras.join(", ")}` : ""}.`,
    counts,
    hud: buildHud(r, st),
    choices: buildChoices(r, st, { lines: [], veils: [] }),
    warnings: reviewBalance(r).map((w) => ({ id: w.id, part: w.part, text: w.text }))
  };
}
async function builderOpen(chatId, mode, userId) {
  const characterId = await characterForChat(chatId, userId);
  if (!characterId)
    throw new Error("Open a chat with a character first.");
  const existing = await sessionFor(chatId, userId);
  if (existing && existing.mode === mode && existing.step !== "done") {
    emit(existing, userId);
    return;
  }
  const card = await cardText(characterId, userId);
  const s = {
    characterId,
    characterName: card.name,
    mode,
    step: "start",
    connectionId: existing?.connectionId ?? "",
    creative: existing?.creative ?? false,
    base: "",
    analysis: null,
    rounds: [],
    additions: [],
    parts: [],
    preview: null,
    request: null,
    changeSummary: null,
    busy: null,
    error: null,
    updatedAt: Date.now()
  };
  if (mode === "refine") {
    s.parts = await currentParts(characterId, userId);
    if (!s.parts.length)
      throw new Error("This character has no ruleset to refine yet.");
    s.step = "review";
    buildPreview(s);
  }
  await save(s, userId);
  emit(s, userId);
}
async function builderStart(chatId, opts, userId) {
  const s = await sessionFor(chatId, userId);
  if (!s)
    throw new Error("No builder open.");
  s.connectionId = opts.connectionId;
  s.creative = opts.creative;
  await progress(s, "Reading the card…", userId);
  try {
    const card = await cardText(s.characterId, userId);
    const templates = TEMPLATES.map((t) => `- ${t.id}: ${t.blurb}`).join(`
`);
    const system = `You help set up a game ruleset for a roleplay character card. Reply with JSON only.`;
    const user = `${card.text}

Available starting templates:
${templates}
- blank: nothing, build from scratch

Systems the player can pick from: ${SYSTEMS.map((x) => x.id).join(", ")}.

Reply with JSON:
{"summary": "2–3 sentences: who this is, the setting, the likely kind of story",
 "suggestedTemplate": "<template id>",
 "reason": "one sentence: why that template fits",
 "systems": ["<system ids that fit this card>"],
 "statusBlock": {"found": <does the card tell the model to print a status/stat block?>, "fields": ["<fields it tracks>"]},
 "cardType": "character" if the card IS one character, "scenario" if it is a narrator / world / multi-character card (its name is a setting or premise, not a person),
 "cast": [ the main named characters in the story (for a character card, the character first) with how each feels about the player at the start, e.g. {"name": "Aina", "relation": "secretly adores {{user}} but hides it behind insults"} ],
 "followUps": [ up to 5 questions specific to THIS card, e.g. {"text": "Aina gets jealous easily. Track jealousy as its own meter?", "kind": "single", "options": ["Yes", "No"], "why": "The description mentions jealousy"} — kinds: single, multi, text ]}`;
    const out = parseJson(await llm(s, system, user, userId, 1500)) ?? {};
    const suggested = typeof out.suggestedTemplate === "string" && (getTemplate(out.suggestedTemplate) || out.suggestedTemplate === "blank") ? out.suggestedTemplate : "universal";
    const sb = out.statusBlock;
    s.analysis = {
      summary: typeof out.summary === "string" ? out.summary : `${card.name}.`,
      suggestedTemplate: suggested,
      reason: typeof out.reason === "string" ? out.reason : "",
      statusBlock: sb && sb.found === true ? { found: true, fields: Array.isArray(sb.fields) ? sb.fields.map(String).slice(0, 12) : [] } : null,
      cardType: out.cardType === "scenario" ? "scenario" : "character",
      cast: Array.isArray(out.cast) ? out.cast.slice(0, 12).map((c) => ({ name: String(c?.name ?? ""), relation: String(c?.relation ?? "") })).filter((c) => c.name) : []
    };
    s.base = opts.base || suggested;
    const defaults = Array.isArray(out.systems) ? out.systems.map(String).filter((x) => SYSTEMS.some((y) => y.id === x)) : ["needs", "relationships", "money", "skills", "story"];
    s.rounds = [{ questions: [...coreQuestions(defaults), ...normQuestions(out.followUps, "f1_")], answers: {} }];
    s.step = "questions";
  } catch (e) {
    s.error = `Couldn't read the card: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}
async function builderAnswer(chatId, answers, additions, more, userId) {
  const s = await sessionFor(chatId, userId);
  if (!s || !s.rounds.length)
    throw new Error("No questions to answer.");
  for (const r of s.rounds)
    for (const q of r.questions)
      if (q.id in answers)
        r.answers[q.id] = answers[q.id];
  s.additions = additions.filter((a) => a.name.trim());
  if (more && s.rounds.length < 3) {
    await progress(s, "Thinking of more questions…", userId);
    try {
      const card = await cardText(s.characterId, userId);
      const user = `${card.text}

${brief(s)}

Ask up to 4 more short questions that would change how the game ruleset is built — things still unclear or worth customising for this card. Don't repeat earlier questions. Reply with JSON: {"followUps": [{"text": "...", "kind": "single|multi|text", "options": ["..."], "why": "..."}]}`;
      const out = parseJson(await llm(s, "You help set up a game ruleset for a roleplay character card. Reply with JSON only.", user, userId, 1000)) ?? {};
      const qs = normQuestions(out.followUps, `f${s.rounds.length + 1}_`).slice(0, 4);
      if (qs.length)
        s.rounds.push({ questions: qs, answers: {} });
      else
        s.error = "No more questions — you can build it now.";
    } catch (e) {
      s.error = `Couldn't get more questions: ${e instanceof Error ? e.message : String(e)}`;
    }
    await progress(s, null, userId);
    return;
  }
  await draftAll(s, userId);
}
async function draftAll(s, userId) {
  const t = getTemplate(s.base);
  const systems = chosenSystems(s);
  const want = (label) => {
    if (label === "encounters")
      return systems.has("encounters") || systems.has("dungeon");
    if (label === "journal")
      return systems.has("journal") || systems.has("perks");
    if (label === "story")
      return systems.has("story");
    return true;
  };
  const baseOf = (label) => {
    const y = t?.parts.find((p) => p.label === label)?.yaml ?? null;
    return y && label === "people" && s.analysis?.cardType !== "scenario" ? withCharacter(y, s.characterName) : y;
  };
  const labels = PART_LABELS.filter(want);
  s.parts = labels.map((label) => ({ label, yaml: "", status: "ok", issues: [] }));
  const byLabel = (l) => s.parts.find((p) => p.label === l);
  try {
    const phaseA = ["core", "stats", "world"];
    await progress(s, "Drafting the foundations: core, stats, world…", userId);
    await Promise.all(phaseA.map(async (l) => {
      byLabel(l).yaml = await draftPart(s, l, baseOf(l), "", userId);
    }));
    const phaseB = labels.filter((l) => !phaseA.includes(l));
    await progress(s, `Drafting ${phaseB.join(", ")}…`, userId);
    const ctx = contextOf(s.parts);
    await Promise.all(phaseB.map(async (l) => {
      byLabel(l).yaml = await draftPart(s, l, baseOf(l), ctx, userId);
    }));
    await repair(s, s.parts, userId);
    buildPreview(s);
    s.step = "review";
  } catch (e) {
    s.error = `Drafting failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}
async function builderRedo(chatId, label, note, userId) {
  const s = await sessionFor(chatId, userId);
  const part = s?.parts.find((p) => p.label === label);
  if (!s || !part)
    throw new Error("Nothing to redo.");
  await progress(s, `Rewriting ${label}…`, userId);
  try {
    const ctx = contextOf(s.parts.filter((p) => p !== part));
    const t = getTemplate(s.base);
    part.yaml = await draftPart(s, label, t?.parts.find((p) => p.label === label)?.yaml ?? null, ctx, userId, note || "Write a fresh, better version.", part.yaml);
    part.changed = true;
    await repair(s, s.parts, userId);
    buildPreview(s);
  } catch (e) {
    s.error = `Couldn't rewrite ${label}: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}
async function builderFix(chatId, warningId, userId) {
  const s = await sessionFor(chatId, userId);
  if (!s)
    throw new Error("No builder open.");
  const { ruleset } = check(s.parts);
  const w = ruleset ? reviewBalance(ruleset).find((x) => x.id === warningId) : undefined;
  if (!w) {
    buildPreview(s);
    emit(s, userId);
    return;
  }
  await builderRedo(chatId, w.part, w.fix, userId);
}
async function builderRefine(chatId, request, userId) {
  const s = await sessionFor(chatId, userId);
  if (!s || !s.parts.length)
    throw new Error("Nothing to refine.");
  s.request = request;
  await progress(s, "Working out what to change…", userId);
  try {
    const all = s.parts.map((p) => `### ${p.label}
${p.yaml}`).join(`

`);
    const user = `${brief(s)}

The current ruleset, section by section:

${all}

The player wants: ${request}

Change only what's needed. Reply with JSON: {"summary": "one or two sentences on what you changed", "parts": {"<section label>": "<the whole new YAML for that section>"}} — include only sections you changed. Section labels: ${s.parts.map((p) => p.label).join(", ")}${s.parts.length < PART_LABELS.length ? ` (you may also add: ${PART_LABELS.filter((l) => !s.parts.some((p) => p.label === l)).join(", ")})` : ""}.`;
    const out = parseJson(await llm(s, SYSTEM_PROMPT, user, userId, 6000)) ?? {};
    const changed = out.parts && typeof out.parts === "object" ? out.parts : {};
    for (const p of s.parts)
      p.changed = false;
    for (const [label, yaml] of Object.entries(changed)) {
      if (typeof yaml !== "string" || !PART_LABELS.includes(label))
        continue;
      const existing = s.parts.find((p) => p.label === label);
      if (existing) {
        existing.yaml = extractYaml(yaml);
        existing.changed = true;
      } else
        s.parts.push({ label, yaml: extractYaml(yaml), status: "ok", issues: [], changed: true });
    }
    s.changeSummary = typeof out.summary === "string" ? out.summary : Object.keys(changed).length ? `Changed: ${Object.keys(changed).join(", ")}.` : "The model didn't change anything — try rephrasing.";
    await repair(s, s.parts, userId);
    buildPreview(s);
  } catch (e) {
    s.error = `Couldn't refine: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}
async function builderBack(chatId, userId) {
  const s = await sessionFor(chatId, userId);
  if (!s)
    return;
  if (s.step === "review" && s.mode === "build")
    s.step = "questions";
  else if (s.step === "questions") {
    if (s.rounds.length > 1)
      s.rounds.pop();
    else
      s.step = "start";
  }
  s.error = null;
  await save(s, userId);
  emit(s, userId);
}
async function builderClose(chatId, userId) {
  const characterId = await characterForChat(chatId, userId);
  if (!characterId)
    return;
  sessions.delete(key4(userId, characterId));
  try {
    await host().userStorage.delete(path(characterId), userId);
  } catch {}
  emit(null, userId);
}
async function builderCurrent(chatId, userId) {
  emit(chatId ? await sessionFor(chatId, userId) : null, userId);
}
function labelOf(comment) {
  return comment.replace(/^\s*(?:\[[^\]]*\]\s*)?warp[-_ ]?ruleset\s*[·:\-–—|]?\s*/i, "").trim().toLowerCase() || "core";
}
async function rulesetEntries(characterId, userId) {
  const c = await host().characters.get(characterId, userId);
  const entries = [];
  let rulesetBook = null;
  for (const bookId of c?.world_book_ids ?? []) {
    const book = await host().world_books.get(bookId, userId);
    if (!book)
      continue;
    const whole = isRulesetBookName(book.name);
    if (whole && !rulesetBook)
      rulesetBook = bookId;
    for (let offset = 0;offset < 2000; offset += 200) {
      const page = await host().world_books.entries.list(bookId, { limit: 200, offset, userId });
      for (const e of page.data)
        if (whole || isRulesetEntryTitle(e.comment))
          entries.push({ id: e.id, bookId, label: labelOf(e.comment ?? ""), content: e.content });
      if (page.data.length < 200)
        break;
    }
  }
  return { entries, rulesetBook, bookIds: c?.world_book_ids ?? [] };
}
async function currentParts(characterId, userId) {
  const { entries } = await rulesetEntries(characterId, userId);
  const parts = entries.map((e) => ({ label: e.label, yaml: e.content, status: "ok", issues: [] }));
  check(parts);
  return parts;
}
async function builderInstall(chatId, userId) {
  const s = await sessionFor(chatId, userId);
  if (!s || !s.parts.length)
    throw new Error("Nothing to install.");
  const { ruleset } = check(s.parts);
  if (!ruleset)
    throw new Error("The ruleset still has errors — fix or redo the sections marked in red first.");
  await progress(s, "Saving to the lorebook…", userId);
  try {
    const { entries, rulesetBook, bookIds } = await rulesetEntries(s.characterId, userId);
    let bookId = rulesetBook;
    if (!bookId) {
      const book = await host().world_books.create({ name: "warp-ruleset", description: `Warp game rules for ${s.characterName}. Warp reads these entries directly; they are never sent to the model.` }, userId);
      bookId = book.id;
      await host().characters.update(s.characterId, { world_book_ids: [...bookIds, book.id] }, userId);
      knownRulesetBookIds.add(book.id);
    }
    const used = new Set;
    let order = 10;
    for (const p of s.parts) {
      const hit = entries.find((e) => e.label === p.label && !used.has(e.id));
      if (hit) {
        used.add(hit.id);
        await host().world_books.entries.update(hit.id, { content: p.yaml, disabled: true, order_value: order }, userId);
      } else {
        await host().world_books.entries.create(bookId, { comment: `warp-ruleset · ${p.label}`, content: p.yaml, key: [], disabled: true, constant: false, order_value: order }, userId);
      }
      order += 10;
    }
    for (const e of entries) {
      if (used.has(e.id))
        continue;
      await host().world_books.entries.update(e.id, { content: `# Replaced by the Warp builder on ${new Date().toISOString().slice(0, 10)}.
`, disabled: true }, userId);
    }
    invalidateCharacter(s.characterId);
    s.step = "done";
  } catch (e) {
    s.error = `Couldn't save: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}

// src/backend.ts
spindle.registerInterceptor(interceptor, 60);
spindle.registerWorldInfoInterceptor(async (ctx) => {
  const disabled = ctx.entries.filter((e) => knownRulesetEntryIds.has(e.id) || knownRulesetBookIds.has(e.world_book_id) || isRulesetEntryTitle(e.comment)).map((e) => e.id);
  const forced = [];
  try {
    const loaded = await getRuleset(ctx.chatId, ctx.userId);
    const r = loaded?.ruleset;
    const gates = [];
    if (r) {
      for (const c of Object.values(r.codex))
        if (c.lore.length)
          gates.push({ lore: c.lore, open: (s) => !!s.codex[c.id] });
      for (const sec of Object.values(r.secrets))
        sec.stages.forEach((st, i) => {
          if (st.lore.length)
            gates.push({ lore: st.lore, open: (s) => (s.secrets[sec.id] ?? -1) >= i });
        });
    }
    if (r && gates.length) {
      let state = lastStates.get(ctx.chatId);
      if (!state)
        state = foldPath(r, await getMessages(ctx.chatId)).state;
      const title = (s) => s.replace(/^\s*\[[^\]]*\]\s*/, "").trim().toLowerCase();
      for (const g of gates) {
        const names = new Set(g.lore.map(title));
        const open = g.open(state);
        for (const e of ctx.entries) {
          if (!names.has(title(e.comment ?? "")))
            continue;
          if (open)
            forced.push(e.id);
          else
            disabled.push(e.id);
        }
      }
    }
  } catch (e) {
    logError("codex lore gate", e);
  }
  return disabled.length || forced.length ? { ...disabled.length ? { disabled } : {}, ...forced.length ? { forced } : {} } : undefined;
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
  { id: "dungeon", label: "Warp: Open the dungeon", description: "Explore, fight and loot — or pick a dungeon to enter", keywords: ["dungeon", "explore", "battle", "roguelike"], scope: "chat" },
  { id: "reload", label: "Warp: Reload ruleset", description: "Re-read the character's warp-ruleset lorebook", keywords: ["refresh", "ruleset"], scope: "chat" }
]);
spindle.commands.onInvoked((id, context) => {
  if (id === "reload") {
    pushState(context.chatId ?? null, undefined, true).then(() => toast("info", "Ruleset reloaded"));
    return;
  }
  send({ type: "command", command: id });
});
async function applyManual(chatId, userId, make) {
  const loaded = await getRuleset(chatId, userId);
  const r = loaded?.ruleset;
  if (!r)
    return false;
  const msgs = await getMessages(chatId);
  const last = msgs[msgs.length - 1];
  if (!last) {
    toast("warning", "Send a message first — changes attach to the latest message.", userId);
    return false;
  }
  const { state } = foldPath(r, msgs);
  const events = make(r, state);
  if (typeof events === "string") {
    toast("warning", events, userId);
    return false;
  }
  const swipe = last.swipe_id ?? 0;
  const existing = warpMeta(last).swipes?.[String(swipe)];
  const rec = existing ? { ...existing, events: [...existing.events, ...events] } : { v: 1, hints: [], events, at: Date.now() };
  await writeRecord(chatId, last.id, swipe, rec);
  await pushState(chatId, userId);
  return true;
}
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
        await builderCurrent(msg.chatId, userId);
        break;
      }
      case "refresh":
        setActiveChat(userId, msg.chatId);
        await pushState(msg.chatId, userId);
        await builderCurrent(msg.chatId, userId);
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
        const msgs = await getMessages(msg.chatId);
        const { state } = foldPath(r, msgs);
        let say;
        let intent = { actionId: msg.actionId, params: msg.params, via: "choice" };
        if (msg.actionId.startsWith(LIVE_PREFIX)) {
          const c = liveChoicesOf(msgs[msgs.length - 1])[Number(msg.actionId.slice(LIVE_PREFIX.length))];
          if (!c || !r.liveChoices.tags[c.tag]) {
            toast("warning", "That choice isn't available anymore.", userId);
            await pushState(msg.chatId, userId);
            return;
          }
          say = `*${c.label}*`;
          intent = { actionId: `${LIVE_PREFIX}${c.tag}${c.target ? `${TARGET_SEP}${c.target}` : ""}`, via: "choice", label: c.label };
        } else if (msg.actionId.startsWith(TRAVEL_PREFIX)) {
          const to = msg.actionId.slice(TRAVEL_PREFIX.length);
          if (!travelTargets(r, state).includes(to)) {
            toast("warning", "You can't get there from here.", userId);
            await pushState(msg.chatId, userId);
            return;
          }
          say = `*I head to ${r.locations[to].name}.*`;
        } else {
          const c = availableChoices(r, state, settings.lines).find((x) => x.id === msg.actionId);
          if (!c) {
            toast("warning", "That choice isn't available anymore.", userId);
            await pushState(msg.chatId, userId);
            return;
          }
          const who = c.target ? state.people[c.target]?.name ?? c.target : "";
          say = c.a.say ? c.a.say.replace(/\{\{target\}\}|\{target\}/gi, who) : `*${c.label}*`;
        }
        await spindle.chat.appendMessage(msg.chatId, {
          role: "user",
          content: say,
          metadata: { warp: { intent } }
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
        await applyManual(msg.chatId, userId, (r, state) => r.stats[msg.stat] ? manualSet(r, state, msg.stat, msg.value) : "Unknown stat.");
        break;
      }
      case "wear": {
        await applyManual(msg.chatId, userId, (r, state) => changeClothes(r, state, msg.slot, msg.item));
        break;
      }
      case "adjust_rel": {
        await applyManual(msg.chatId, userId, (r, state) => manualSetRel(r, state, msg.who, msg.stat, msg.value));
        break;
      }
      case "forget": {
        await applyManual(msg.chatId, userId, (r, state) => forgetPerson(r, state, msg.who));
        break;
      }
      case "dungeon": {
        await runDungeonOp(msg, userId);
        break;
      }
      case "buy_perk": {
        const ok = await applyManual(msg.chatId, userId, (r, state) => buyPerk(r, state, msg.perk));
        if (ok)
          toast("success", "Perk taken.", userId);
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
      case "builder_open":
        await builderOpen(msg.chatId, msg.mode, userId);
        break;
      case "builder_start":
        await builderStart(msg.chatId, { connectionId: msg.connectionId, creative: msg.creative, base: msg.base }, userId);
        break;
      case "builder_answer":
        await builderAnswer(msg.chatId, msg.answers, msg.additions, msg.more, userId);
        break;
      case "builder_redo":
        await builderRedo(msg.chatId, msg.part, msg.note, userId);
        break;
      case "builder_fix":
        await builderFix(msg.chatId, msg.warning, userId);
        break;
      case "builder_refine":
        await builderRefine(msg.chatId, msg.request, userId);
        break;
      case "builder_back":
        await builderBack(msg.chatId, userId);
        break;
      case "builder_close":
        await builderClose(msg.chatId, userId);
        break;
      case "builder_install": {
        await builderInstall(msg.chatId, userId);
        await pushState(msg.chatId, userId, true);
        toast("success", "Ruleset saved to the character's warp-ruleset lorebook.", userId);
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
        const name = await installTemplate(msg.chatId, msg.templateId, userId, msg.trackCharacter);
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
