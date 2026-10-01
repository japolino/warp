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
function identifiers(src) {
  if (typeof src !== "string")
    return [];
  const out = new Set;
  const walk = (n) => {
    switch (n.k) {
      case "id":
        n.path.forEach((p) => out.add(p));
        break;
      case "call":
        n.args.forEach(walk);
        break;
      case "un":
        walk(n.a);
        break;
      case "bin":
        walk(n.a);
        walk(n.b);
        break;
      case "tern":
        walk(n.c);
        walk(n.a);
        walk(n.b);
        break;
    }
  };
  try {
    walk(compile(src));
  } catch {}
  return [...out];
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

// src/engine/date/content.ts
function venueTags(v) {
  return [...new Set(v.activities.flatMap((a) => a.tags))];
}
var DEFAULT_CATEGORIES, DEFAULT_STAGES, TOPICS, DEFAULT_TOPICS, act = (id, label, tags, romantic = false) => ({ id, label, tags, romantic }), ev2 = (id, text, enjoy, weight = 1) => ({ id, text, enjoy, weight }), DEFAULT_VENUES;
var init_content2 = __esm(() => {
  DEFAULT_CATEGORIES = [
    { id: "small_talk", label: "Small talk", icon: "\uD83D\uDCAC" },
    { id: "interests", label: "Interests", icon: "\uD83C\uDFA8" },
    { id: "personal", label: "Personal", icon: "\uD83E\uDEC2" },
    { id: "charm", label: "Charm", icon: "✨" },
    { id: "romance", label: "Romance", icon: "\uD83D\uDC97" }
  ];
  DEFAULT_STAGES = [
    { id: "stranger", label: "Stranger", at: 0, partner: false },
    { id: "acquaintance", label: "Acquaintance", at: 10, partner: false },
    { id: "friend", label: "Friend", at: 30, partner: false },
    { id: "close", label: "Close", at: 55, partner: false },
    { id: "partner", label: "Partner", at: 80, partner: true }
  ];
  TOPICS = {
    weather: { label: "The weather", category: "small_talk", desc: "Safe, if a little dull" },
    their_day: { label: "How their day went", category: "small_talk" },
    local_news: { label: "What's going on around here", category: "small_talk" },
    gossip: { label: "Gossip", category: "small_talk", desc: "Who's doing what with whom" },
    hobbies: { label: "Hobbies", category: "interests" },
    music: { label: "Music", category: "interests" },
    books_films: { label: "Books and films", category: "interests" },
    games: { label: "Games", category: "interests" },
    sport: { label: "Sport", category: "interests" },
    food: { label: "Food", category: "interests" },
    travel: { label: "Travel", category: "interests" },
    nature: { label: "The outdoors", category: "interests" },
    fashion: { label: "Fashion", category: "interests" },
    work: { label: "Work or studies", category: "personal", stage: 1 },
    family: { label: "Family", category: "personal", stage: 1 },
    dreams: { label: "Dreams and ambitions", category: "personal", stage: 1 },
    past: { label: "Their past", category: "personal", stage: 2, weight: 1.3 },
    worries: { label: "What's worrying them", category: "personal", stage: 2, weight: 1.3 },
    secrets: { label: "Share a secret", category: "personal", stage: 3, weight: 1.5 },
    compliment_looks: { label: "Compliment their looks", category: "charm", stage: 1 },
    compliment_mind: { label: "Praise their mind", category: "charm" },
    joke: { label: "Tell a joke", category: "charm" },
    tease: { label: "Tease them", category: "charm", stage: 1 },
    flirt: { label: "Flirt", category: "romance", stage: 1, romantic: true },
    ideal_partner: { label: "Their ideal partner", category: "romance", stage: 2, romantic: true },
    love_life: { label: "Their love life", category: "romance", stage: 2, romantic: true },
    the_two_of_you: { label: "The two of you", category: "romance", stage: 3, romantic: true, weight: 1.5 }
  };
  DEFAULT_TOPICS = Object.fromEntries(Object.entries(TOPICS).map(([id, t]) => [id, {
    id,
    weight: 1,
    romantic: false,
    stage: 0,
    ...t
  }]));
  DEFAULT_VENUES = {
    cafe: {
      id: "cafe",
      name: "A café",
      desc: "Coffee, cake and a corner table.",
      cost: 10,
      romantic: false,
      activities: [
        act("order_for_them", "Order for them", ["food"]),
        act("share_dessert", "Share a dessert", ["food", "sweet"]),
        act("people_watch", "People-watch and make up stories", ["observation", "humor"]),
        act("talk_for_hours", "Lose track of time talking", ["conversation"])
      ],
      events: [
        ev2("spill", "A clumsy moment: a drink goes over.", -6),
        ev2("song", "The café plays a song that fits the moment perfectly.", 8),
        ev2("friend", "Someone who knows {target} stops by the table.", 0)
      ]
    },
    park: {
      id: "park",
      name: "A walk in the park",
      desc: "Paths, trees, a pond.",
      cost: 0,
      romantic: false,
      activities: [
        act("feed_birds", "Feed the birds", ["nature", "animals"]),
        act("picnic", "Have a picnic", ["food", "nature"]),
        act("watch_sky", "Sit and watch the sky", ["calm", "nature"]),
        act("hold_hands", "Walk hand in hand", ["romance"], true)
      ],
      events: [
        ev2("rain", "It starts to rain.", -6),
        ev2("dog", "A friendly dog bounds over to say hello.", 6),
        ev2("sunset", "The light turns gold; it's genuinely beautiful.", 10)
      ]
    },
    cinema: {
      id: "cinema",
      name: "The cinema",
      desc: "Something on the big screen.",
      cost: 15,
      romantic: false,
      activities: [
        act("their_pick", "Let them pick the film", ["film"]),
        act("horror", "Watch a horror film", ["film", "thrill"]),
        act("popcorn", "Share popcorn", ["food"]),
        act("dark_hands", "Hold hands in the dark", ["romance"], true)
      ],
      events: [
        ev2("great_film", "The film turns out to be great.", 10),
        ev2("loud_row", "Someone behind talks through the whole film.", -8)
      ]
    },
    dinner: {
      id: "dinner",
      name: "Dinner out",
      desc: "A proper restaurant.",
      cost: 40,
      romantic: false,
      activities: [
        act("fancy_order", "Order something fancy", ["food", "luxury"]),
        act("wine", "Share a bottle of wine", ["drink", "luxury"]),
        act("toast", "Make a toast to them", ["humor", "conversation"]),
        act("candlelight", "Talk by candlelight", ["romance", "conversation"], true)
      ],
      events: [
        ev2("wrong_order", "The kitchen gets the order wrong.", -5),
        ev2("dessert_free", "The waiter brings a dessert on the house.", 7)
      ]
    },
    arcade: {
      id: "arcade",
      name: "The arcade",
      desc: "Lights, noise, tickets.",
      cost: 10,
      romantic: false,
      activities: [
        act("compete", "Compete at the machines", ["games", "competition"]),
        act("claw", "Win them a prize", ["games", "gift"]),
        act("dance_game", "Try the dance game", ["dance", "music"]),
        act("photo_booth", "Squeeze into the photo booth", ["fun", "romance"])
      ],
      events: [
        ev2("jackpot", "The machine pays out a jackpot of tickets.", 9),
        ev2("broken", "A machine eats their coins.", -5)
      ]
    },
    bar: {
      id: "bar",
      name: "A bar",
      desc: "Low lights and a crowd.",
      cost: 20,
      romantic: false,
      activities: [
        act("drinks", "Get a round in", ["drink"]),
        act("dance", "Dance", ["dance", "music"]),
        act("karaoke", "Do karaoke", ["music", "performance"]),
        act("quiet_corner", "Find a quiet corner", ["conversation", "romance"], true)
      ],
      events: [
        ev2("band", "A band starts playing, and it's good.", 8),
        ev2("creep", "A stranger won't leave {target} alone.", -8)
      ]
    }
  };
});

// src/engine/date/types.ts
var REACTIONS, REACTION_VALUE, REACTION_LABEL, DATE_PREFIX = "date:";
var init_types2 = __esm(() => {
  REACTIONS = ["love", "like", "neutral", "dislike", "hate"];
  REACTION_VALUE = { love: 2, like: 1, neutral: 0, dislike: -1, hate: -2 };
  REACTION_LABEL = { love: "Loved it", like: "Liked it", neutral: "Indifferent", dislike: "Didn't like it", hate: "Hated it" };
});

// src/engine/date/defs.ts
function disabledDating() {
  return {
    enabled: false,
    love: "love",
    fear: "fear",
    stages: DEFAULT_STAGES,
    hostileAt: 60,
    hostileLabel: "Hostile",
    categories: DEFAULT_CATEGORIES,
    topics: {},
    topicOrder: [],
    venues: {},
    people: {},
    minutesPerTopic: 5,
    fatiguePerTopic: 12,
    beats: 4,
    minutesPerBeat: 30,
    romance: true
  };
}
function defaultRelStat(id, kind) {
  const love = kind === "love";
  return {
    id,
    label: titleCase(id),
    kind: "meter",
    min: 0,
    max: 100,
    start: 0,
    good: love ? "high" : "low",
    perHour: 0,
    show: "text",
    narrator: 5,
    growth: 0,
    bands: love ? [{ at: 0, text: "Indifferent", tone: "neutral" }, { at: 20, text: "Fond", tone: "warn" }, { at: 50, text: "Smitten", tone: "good" }, { at: 80, text: "In love", tone: "good" }] : [{ at: 0, text: "At ease", tone: "good" }, { at: 30, text: "Wary", tone: "warn" }, { at: 60, text: "Afraid", tone: "bad" }]
  };
}
function normTopic(id, raw, base, where, c, cats, stageIds) {
  const r = isObj(raw) ? raw : typeof raw === "string" ? { label: raw } : raw === true ? {} : {};
  if (!isObj(raw) && typeof raw !== "string" && raw !== true) {
    c.warn(where, "expected a topic (`label:`, `category:`) or `false` to remove it");
    return null;
  }
  const category = typeof r.category === "string" ? r.category : base?.category ?? "small_talk";
  if (!cats.has(category))
    c.warn(`${where} › category`, `"${category}" isn't a category (${[...cats].join(", ")})`);
  let stage = base?.stage ?? 0;
  if (r.stage !== undefined) {
    const i = typeof r.stage === "number" ? r.stage : stageIds.indexOf(String(r.stage));
    if (i < 0 || i >= stageIds.length)
      c.warn(`${where} › stage`, `"${r.stage}" isn't a stage (${stageIds.join(", ")})`);
    else
      stage = i;
  }
  const when = r.when !== undefined ? c.expr(r.when, `${where} › when`) : undefined;
  return {
    id,
    label: typeof r.label === "string" ? r.label : base?.label ?? titleCase(id),
    category,
    stage,
    romantic: r.romantic !== undefined ? r.romantic === true : base?.romantic ?? category === "romance",
    weight: Math.max(0, c.num(r.weight, `${where} › weight`, base?.weight ?? 1)),
    ...typeof r.desc === "string" ? { desc: r.desc } : base?.desc ? { desc: base.desc } : {},
    ...typeof r.say === "string" ? { say: r.say } : base?.say ? { say: base.say } : {},
    ...when !== undefined ? { when: String(when) } : base?.when ? { when: base.when } : {}
  };
}
function normVenue(id, raw, base, where, c) {
  if (!isObj(raw) && raw !== true && typeof raw !== "string") {
    c.warn(where, "expected a venue (`name:`, `activities:`) or `false` to remove it");
    return null;
  }
  const r = isObj(raw) ? raw : typeof raw === "string" ? { name: raw } : {};
  const activities = [];
  for (const [aid, a] of Object.entries(isObj(r.activities) ? r.activities : {})) {
    const ar = isObj(a) ? a : typeof a === "string" ? { label: a } : {};
    activities.push({
      id: aid,
      label: typeof ar.label === "string" ? ar.label : titleCase(aid),
      tags: list(ar.tags).map((t) => t.toLowerCase()),
      romantic: ar.romantic === true,
      ...typeof ar.say === "string" ? { say: ar.say } : {}
    });
  }
  const events = [];
  for (const [eid, e] of Object.entries(isObj(r.events) ? r.events : {})) {
    const er = isObj(e) ? e : typeof e === "string" ? { text: e } : {};
    if (typeof er.text !== "string") {
      c.warn(`${where} › events › ${eid}`, "needs `text:`");
      continue;
    }
    events.push({ id: eid, text: er.text, weight: Math.max(0, c.num(er.weight, `${where} › events › ${eid} › weight`, 1)), enjoy: c.num(er.enjoy, `${where} › events › ${eid} › enjoy`, 0) });
  }
  const when = r.when !== undefined ? c.expr(r.when, `${where} › when`) : undefined;
  const v = {
    id,
    name: typeof r.name === "string" ? r.name : base?.name ?? titleCase(id),
    cost: Math.max(0, c.num(r.cost, `${where} › cost`, base?.cost ?? 0)),
    romantic: r.romantic !== undefined ? r.romantic === true : base?.romantic ?? false,
    activities: activities.length ? activities : base?.activities ?? [],
    events: events.length ? events : base?.events ?? [],
    ...typeof r.desc === "string" ? { desc: r.desc } : base?.desc ? { desc: base.desc } : {},
    ...typeof r.at === "string" ? { at: r.at } : base?.at ? { at: base.at } : {},
    ...when !== undefined ? { when: String(when) } : base?.when ? { when: base.when } : {}
  };
  if (v.activities.length < 2)
    c.warn(where, "needs at least two `activities:` to make an outing of it");
  return v;
}
function normDating(raw, c, rel, people) {
  const def = disabledDating();
  if (raw === undefined || raw === false || raw === null)
    return def;
  if (raw !== true && !isObj(raw)) {
    c.warn("Dating", "should be `true` or a map");
    return def;
  }
  const r = isObj(raw) ? raw : {};
  def.enabled = true;
  def.romance = r.romance !== false;
  for (const k of ["love", "fear"]) {
    const id = typeof r[k] === "string" ? String(r[k]) : k;
    def[k] = id;
    if (!rel.stats[id]) {
      rel.stats[id] = defaultRelStat(id, k);
      rel.order.push(id);
    }
  }
  if (isObj(r.categories)) {
    const cats = [];
    for (const [id, cr] of Object.entries(r.categories)) {
      const x = isObj(cr) ? cr : typeof cr === "string" ? { label: cr } : {};
      cats.push({ id, label: typeof x.label === "string" ? x.label : titleCase(id), icon: typeof x.icon === "string" ? x.icon : "\uD83D\uDCAC" });
    }
    if (cats.length)
      def.categories = r.builtin_topics === false ? cats : [...DEFAULT_CATEGORIES.filter((d) => !cats.some((x) => x.id === d.id)), ...cats];
  }
  if (isObj(r.stages)) {
    const stages = [];
    for (const [id, sr] of Object.entries(r.stages)) {
      const x = isObj(sr) ? sr : { at: sr };
      stages.push({ id, label: typeof x.label === "string" ? x.label : titleCase(id), at: c.num(x.at, `Dating › stages › ${id}`, 0), partner: x.partner === true });
    }
    stages.sort((a, b) => a.at - b.at);
    if (stages.length >= 2)
      def.stages = stages;
    else
      c.warn("Dating › stages", "needs at least two stages — using the built-in ladder");
  }
  const hostile = isObj(r.hostile) ? r.hostile : r.hostile !== undefined ? { at: r.hostile } : {};
  def.hostileAt = Math.max(1, Math.min(100, c.num(hostile.at, "Dating › hostile", def.hostileAt)));
  if (typeof hostile.label === "string")
    def.hostileLabel = hostile.label;
  const cats = new Set(def.categories.map((x) => x.id));
  const stageIds = def.stages.map((s) => s.id);
  const topics = r.builtin_topics === false ? {} : { ...DEFAULT_TOPICS };
  for (const [id, t] of Object.entries(isObj(r.topics) ? r.topics : {})) {
    if (t === false) {
      delete topics[id];
      continue;
    }
    const n = normTopic(id, t, topics[id], `Dating › topics › ${id}`, c, cats, stageIds);
    if (n)
      topics[id] = n;
  }
  for (const t of Object.values(topics))
    if (t.stage >= def.stages.length)
      t.stage = def.stages.length - 1;
  def.topics = topics;
  def.topicOrder = Object.keys(topics);
  if (!def.topicOrder.length)
    c.warn("Dating", "has no topics — add some under `topics:`");
  const venues = r.builtin_venues === false ? {} : { ...DEFAULT_VENUES };
  for (const [id, v] of Object.entries(isObj(r.venues) ? r.venues : {})) {
    if (v === false) {
      delete venues[id];
      continue;
    }
    const n = normVenue(id, v, venues[id], `Dating › venues › ${id}`, c);
    if (n)
      venues[id] = n;
  }
  def.venues = venues;
  for (const [pid, pr] of Object.entries(isObj(r.people) ? r.people : {})) {
    const w = `Dating › people › ${pid}`;
    if (!people.has(pid))
      c.warn(w, `"${pid}" isn't a declared person`);
    if (!isObj(pr)) {
      c.warn(w, "expected tastes like `loves: [music]`");
      continue;
    }
    const tastes = {};
    for (const [k, v] of Object.entries(pr)) {
      const as = REACTION_KEYS[k];
      if (as) {
        for (const key of list(v))
          tastes[key] = as;
        continue;
      }
      const val = REACTION_KEYS[String(v)];
      if (val)
        tastes[k] = val;
      else
        c.warn(`${w} › ${k}`, `use one of ${REACTIONS.join(", ")}`);
    }
    def.people[pid] = tastes;
  }
  if (r.with !== undefined) {
    const x = c.expr(r.with, "Dating › with");
    if (x !== undefined)
      def.with = String(x);
  }
  const pace = isObj(r.pace) ? r.pace : r;
  def.minutesPerTopic = Math.max(0, c.num(pace.minutes_per_topic, "Dating › minutes_per_topic", def.minutesPerTopic));
  def.fatiguePerTopic = Math.max(1, c.num(pace.fatigue_per_topic, "Dating › fatigue_per_topic", def.fatiguePerTopic));
  def.beats = Math.max(1, Math.min(10, Math.round(c.num(pace.beats, "Dating › beats", def.beats))));
  def.minutesPerBeat = Math.max(0, c.num(pace.minutes_per_beat, "Dating › minutes_per_beat", def.minutesPerBeat));
  return def;
}
var REACTION_KEYS;
var init_defs2 = __esm(() => {
  init_ruleset();
  init_content2();
  init_types2();
  REACTION_KEYS = { loves: "love", love: "love", likes: "like", like: "like", neutral: "neutral", dislikes: "dislike", dislike: "dislike", hates: "hate", hate: "hate" };
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

class Ctx3 {
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
function normGate(r, where, c) {
  const g = {};
  if (r.narrator_when !== undefined) {
    const x = c.expr(r.narrator_when, `${where} › narrator_when`);
    if (x !== undefined)
      g.when = String(x);
  }
  const words = list(r.narrator_words ?? r.narrator_keywords).map((w) => w.toLowerCase()).filter(Boolean);
  if (words.length)
    g.words = words;
  const actions = list(r.narrator_actions).map((a) => a.toLowerCase()).filter(Boolean);
  if (actions.length)
    g.actions = actions;
  return g.when || g.words || g.actions ? g : undefined;
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
      const at = Number(k.replace(/%\s*$/, ""));
      if (!Number.isFinite(at)) {
        c.warn(where, `band key "${k}" should be a number (the value where this text starts), or a percentage like 75%`);
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
  const gate = narrator > 0 ? normGate(r, where, c) : undefined;
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
    ...gate ? { gate } : {},
    growth: 0,
    bands: normBands(r.bands, good, `${where} › bands`, c),
    ...isObj(r.bands) && Object.keys(r.bands).some((k) => /%\s*$/.test(k)) ? { pctBands: true } : {},
    color: typeof r.color === "string" ? r.color : undefined,
    desc: typeof r.desc === "string" ? r.desc : typeof r.description === "string" ? r.description : undefined
  };
  if (Array.isArray(r.grades) && r.grades.length)
    def.grades = r.grades.map(String);
  const grows = k === "skill" || k === "attribute";
  def.growth = r.growth === false ? 0 : r.growth === true ? 1 : r.growth !== undefined ? Math.max(0, c.num(r.growth, `${where} › growth`, grows ? 1 : 0)) : grows ? 1 : 0;
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
    reveal: [],
    body: {},
    transform: {},
    arc: {},
    bond: {},
    learn: []
  };
}
function normTraits(raw, where, c) {
  const out = {};
  if (!isObj(raw)) {
    c.warn(where, "expected parts with traits, like `hair: { color: red }`");
    return out;
  }
  for (const [part, traits] of Object.entries(raw)) {
    if (typeof traits === "string") {
      out[part] = { type: traits };
      continue;
    }
    if (!isObj(traits)) {
      c.warn(`${where} › ${part}`, "expected traits, like `{ color: red }`");
      continue;
    }
    out[part] = Object.fromEntries(Object.entries(traits).map(([k, v]) => [k, v === null || v === false ? null : String(v)]));
  }
  return out;
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
      case "momentum":
      case "swing": {
        const x = c.expr(v, w);
        if (x !== undefined)
          e.momentum = x;
        break;
      }
      case "body":
        if (known.stats.has(k) && !isObj(v)) {
          const x = c.expr(v, w);
          if (x !== undefined)
            e.stats[k] = x;
        } else
          Object.assign(e.body, normTraits(v, w, c));
        break;
      case "transform":
        if (isObj(v))
          for (const [id, n] of Object.entries(v)) {
            const x = c.expr(n, `${w} › ${id}`);
            if (x !== undefined)
              e.transform[id] = x;
          }
        else
          for (const id of list(v))
            e.transform[id] = 1;
        break;
      case "conceive":
      case "pregnancy": {
        const x = isObj(v) ? v : { with: v };
        const chance = c.expr(x.chance ?? 100, `${w} › chance`) ?? 100;
        e.conceive = { with: String(x.with ?? "target"), carrier: String(x.carrier ?? "player"), chance };
        break;
      }
      case "arc":
        if (isObj(v))
          for (const [id, n] of Object.entries(v)) {
            const x = c.expr(n, `${w} › ${id}`);
            if (x !== undefined)
              e.arc[id] = x;
          }
        else
          c.warn(w, "expected arc changes by companion, like `jo: +5`");
        break;
      case "harm": {
        const x = c.expr(v, w);
        if (x !== undefined)
          e.harm = x;
        break;
      }
      case "learn":
        e.learn.push(...list(v));
        break;
      case "bond":
      case "bonds":
        if (isObj(v))
          for (const [a, m] of Object.entries(v)) {
            if (!isObj(m)) {
              c.warn(`${w} › ${a}`, "expected feelings toward others, like `dex: +3`");
              continue;
            }
            e.bond[a] = {};
            for (const [b, n] of Object.entries(m)) {
              const x = c.expr(n, `${w} › ${a} › ${b}`);
              if (x !== undefined)
                e.bond[a][b] = x;
            }
          }
        break;
      default:
        if (known.stats.has(k)) {
          const x = c.expr(v, w);
          if (x !== undefined)
            e.stats[k] = x;
        } else
          c.warn(w, `"${k}" isn't a stat or a known effect (stats, set, flags, give, take, rel, move, time, add_condition, remove_condition, hint, decide, foe, end, start_encounter, unlock, wear, undress, damage, front, reveal, gauge, momentum, body, transform, arc, bond, conceive, harm, learn)`);
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
    ...typeof raw.why_not === "string" ? { whyNot: raw.why_not } : typeof raw.locked === "string" ? { whyNot: raw.locked } : {},
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
function applyItemUse(it, r, w, c, known, drafted) {
  if (r.keep === true)
    it.keep = true;
  if (isObj(r.bonus)) {
    for (const [stat, v] of Object.entries(r.bonus)) {
      if (!known.stats.has(stat)) {
        c.warn(`${w} › bonus › ${stat}`, `"${stat}" isn't a declared stat`);
        continue;
      }
      it.bonus[stat] = c.num(v, `${w} › bonus › ${stat}`, 0);
    }
  }
  const u = r.use;
  if (u !== undefined && u !== false) {
    const raw = isObj(u) ? u : typeof u === "string" ? { hint: u } : {};
    const action = {};
    const rest = {};
    for (const [k, v] of Object.entries(raw))
      (USE_KEYS.has(k) || TIER_KEYS[k] ? action : rest)[k] = v;
    if (Object.keys(rest).length && !action.effects && !action.check)
      action.effects = rest;
    const has = `has('${it.id}')`;
    action.when = action.when !== undefined ? `(${String(action.when)}) and ${has}` : has;
    if (!action.label)
      action.label = `Use the ${it.name}`;
    const def = normAction(`item:${it.id}`, action, `${w} › use`, c, known, 0);
    if (def) {
      def.tags = [...new Set([...def.tags, "item"])];
      it.use = def;
    }
  }
  if (drafted && (it.use || Object.keys(it.bonus).length))
    it.drafted = true;
}
function statNums(v, where, c, known) {
  const out = {};
  if (!isObj(v))
    return out;
  for (const [stat, n] of Object.entries(v)) {
    if (!known.stats.has(stat)) {
      c.warn(`${where} › ${stat}`, `"${stat}" isn't a declared stat`);
      continue;
    }
    out[stat] = c.num(n, `${where} › ${stat}`, 0);
  }
  return out;
}
function pct(v, where, c) {
  const t = String(v).trim();
  const n = Number(t.replace(/%$/, "").replace(/^\+/, ""));
  if (!Number.isFinite(n)) {
    c.warn(where, "expected a percentage like -30%");
    return null;
  }
  return t.endsWith("%") || Math.abs(n) > 1 ? n / 100 : n;
}
function normEdges(v, where, c, known) {
  const out = [];
  for (const [i, x] of (Array.isArray(v) ? v : v === undefined ? [] : [v]).entries()) {
    const w = `${where}${Array.isArray(v) ? ` › ${i + 1}` : ""}`;
    if (!isObj(x)) {
      c.warn(w, "expected `stats:` and `when:`");
      continue;
    }
    const raw = isObj(x.stats) ? x.stats : Object.fromEntries(Object.entries(x).filter(([k]) => k !== "when"));
    const when = x.when !== undefined ? c.expr(x.when, `${w} › when`) : undefined;
    const stats = statNums(raw, `${w} › stats`, c, known);
    if (Object.keys(stats).length)
      out.push({ stats, ...when !== undefined ? { when: String(when) } : {} });
  }
  return out;
}
function normPerkRules(v, where, c, known) {
  const out = [];
  if (!isObj(v))
    return out;
  for (const [k, x] of Object.entries(v)) {
    const w = `${where} › ${k}`;
    if (k === "reroll" || k === "soften") {
      const r = isObj(x) ? x : {};
      const stats = list(r.stats ?? r.stat).filter((s) => known.stats.has(s) || (c.warn(`${w} › stats`, `"${s}" isn't a declared stat`), false));
      out.push({ kind: k, stats, tags: list(r.tags), perDay: Math.max(0, Math.round(c.num(r.per_day ?? (x === true ? 0 : 1), `${w} › per_day`, 1))) });
    } else if (k === "gains" || k === "losses") {
      if (!isObj(x)) {
        c.warn(w, "expected stats with a percentage, like `scent: -30%`");
        continue;
      }
      for (const [stat, n] of Object.entries(x)) {
        if (!known.stats.has(stat)) {
          c.warn(`${w} › ${stat}`, `"${stat}" isn't a declared stat`);
          continue;
        }
        const p = pct(n, `${w} › ${stat}`, c);
        if (p !== null && p !== 0)
          out.push({ kind: k, stat, pct: Math.max(-1, p) });
      }
    } else
      c.warn(w, "isn't a perk rule (reroll, soften, gains, losses)");
  }
  return out;
}
function normPerk(id, p, w, c, known, abilities) {
  const req = p.requires !== undefined ? c.expr(p.requires, `${w} › requires`) : undefined;
  const bonus = statNums(p.bonus, `${w} › bonus`, c, known);
  const rules = normPerkRules(p.rule ?? p.rules, `${w} › rule`, c, known);
  let drawback;
  if (typeof p.drawback === "string")
    drawback = p.drawback;
  else if (isObj(p.drawback)) {
    const d = p.drawback;
    if (typeof d.desc === "string")
      drawback = d.desc;
    for (const [stat, n] of Object.entries(statNums(d.bonus, `${w} › drawback › bonus`, c, known)))
      bonus[stat] = (bonus[stat] ?? 0) + n;
    rules.push(...normPerkRules({ ...d.gains ? { gains: d.gains } : {}, ...d.losses ? { losses: d.losses } : {} }, `${w} › drawback`, c, known));
  }
  const taught = list(p.abilities ?? p.grants ?? p.teaches);
  for (const a of taught)
    if (!abilities[a])
      c.warn(`${w} › abilities`, `"${a}" isn't a declared ability`);
  return {
    id,
    name: typeof p.name === "string" ? p.name : titleCase(id),
    desc: typeof p.desc === "string" ? p.desc : "",
    cost: c.num(p.cost, `${w} › cost`, 1),
    ...req !== undefined ? { requires: String(req) } : {},
    effects: normEffect(p.effects, `${w} › effects`, c, known),
    tags: list(p.tags).map((t) => t.toLowerCase()),
    bonus,
    edges: normEdges(p.edge ?? p.edges, `${w} › edge`, c, known),
    rules,
    abilities: taught.filter((a) => abilities[a]),
    ...typeof p.narrator === "string" ? { narrator: p.narrator } : {},
    excludes: list(p.excludes),
    weight: Math.max(0, c.num(p.weight, `${w} › weight`, 1)),
    ...drawback ? { drawback } : {}
  };
}
function normAbilities(raw, c, known) {
  const out = {};
  for (const [id, a] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `Abilities › ${id}`;
    if (!isObj(a)) {
      c.warn(w, "expected an ability (label, cost, check or effects)");
      continue;
    }
    const action = {};
    const rest = {};
    for (const [k, v] of Object.entries(a)) {
      if (ABILITY_META.has(k))
        continue;
      (USE_KEYS.has(k) || TIER_KEYS[k] ? action : rest)[k] = v;
    }
    if (Object.keys(rest).length) {
      if (!action.check)
        action.effects = { ...isObj(action.effects) ? action.effects : {}, ...rest };
      else if (!action.success)
        action.success = rest;
      else
        c.warn(w, `${Object.keys(rest).join(", ")}: put these under success: or fail: when the ability rolls`);
    }
    const name = typeof a.name === "string" ? a.name : typeof a.label === "string" ? a.label : titleCase(id);
    if (!action.label)
      action.label = name;
    const def = normAction(`ability:${id}`, action, w, c, known, 0);
    if (!def)
      continue;
    def.tags = [...new Set([...def.tags, "ability"])];
    const k = a.known;
    out[id] = {
      id,
      name,
      action: def,
      ...typeof a.desc === "string" ? { desc: a.desc } : {},
      known: k === undefined ? DEFAULT_KNOWN : typeof k === "boolean" ? k : String(c.expr(k, `${w} › known`) ?? false),
      perDay: Math.max(0, Math.round(c.num(a.per_day, `${w} › per_day`, 0))),
      perEncounter: Math.max(0, Math.round(c.num(a.per_encounter, `${w} › per_encounter`, 0))),
      where: a.where === "encounter" || a.where === "story" ? a.where : "any"
    };
  }
  return out;
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
  let momentum = null;
  if (raw.momentum !== undefined && raw.momentum !== false) {
    const m = isObj(raw.momentum) ? raw.momentum : {};
    const swing = { crit_success: 40, success: 25, partial: 10, fail: -20, crit_fail: -35 };
    if (isObj(m.swing))
      for (const [k, v] of Object.entries(m.swing)) {
        const tier = TIER_KEYS[k];
        if (tier)
          swing[tier] = c.num(v, `${w} › momentum › swing › ${k}`, swing[tier]);
        else
          c.warn(`${w} › momentum › swing › ${k}`, "tiers are crit_success, success, partial, fail, crit_fail");
      }
    const win = typeof m.win === "string" ? m.win : "won";
    const lose = typeof m.lose === "string" ? m.lose : "lost";
    momentum = { win, lose, start: Math.max(-99, Math.min(99, c.num(m.start, `${w} › momentum › start`, 0))), swing };
  }
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
    start: normEffect(startRaw, `${w} › start`, c, known),
    momentum,
    fromStory: raw.from_story !== false,
    narrate: raw.narrate === true || raw.narrate === "rounds",
    ...typeof raw.goal === "string" ? { goal: raw.goal } : {},
    ...typeof raw.danger === "string" ? { danger: raw.danger } : {},
    labels: Object.fromEntries(Object.entries(isObj(raw.labels) ? raw.labels : {}).filter(([, v]) => typeof v === "string"))
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
function normFronts(raw, c, known, where = (id) => `Fronts › ${id}`) {
  const out = {};
  if (raw === undefined)
    return out;
  if (!isObj(raw)) {
    c.warn("Fronts", "should be a map of front names to definitions");
    return out;
  }
  for (const [id, fRaw] of Object.entries(raw)) {
    const w = where(id);
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
function normMind(raw, c) {
  const def = { overrides: [], perception: [] };
  if (raw === undefined)
    return def;
  if (!isObj(raw)) {
    c.warn("Mind", "should be a map with `overrides:` and/or `perception:`");
    return def;
  }
  for (const [id, o] of Object.entries(isObj(raw.overrides) ? raw.overrides : {})) {
    const w = `Mind › overrides › ${id}`;
    if (!isObj(o)) {
      c.warn(w, "expected `when:`, `chance:` and `do:`");
      continue;
    }
    const when = c.expr(o.when ?? true, `${w} › when`);
    const chance = c.expr(o.chance ?? 100, `${w} › chance`);
    if (when === undefined || chance === undefined)
      continue;
    const act = typeof o.do === "string" ? o.do : "fail";
    def.overrides.push({
      id,
      when: String(when),
      chance,
      on: list(o.on).map((x) => x.toLowerCase()),
      do: act,
      cause: typeof o.cause === "string" ? o.cause : titleCase(id),
      ...typeof o.text === "string" ? { text: o.text } : {}
    });
  }
  const per = Array.isArray(raw.perception) ? raw.perception : [];
  per.forEach((p, i) => {
    const w = `Mind › perception #${i + 1}`;
    if (!isObj(p) || typeof p.text !== "string") {
      c.warn(w, "expected `{ when: ..., text: ... }`");
      return;
    }
    const when = c.expr(p.when ?? true, `${w} › when`);
    if (when !== undefined)
      def.perception.push({ when: String(when), text: p.text });
  });
  return def;
}
function normKeep(raw, where, c, dflt = {}) {
  const k = { codex: false, feats: false, perks: false, secrets: false, people: false, dating: false, deepest: false, stats: [], flags: [], items: [], rel: [], ...dflt };
  if (raw === undefined)
    return k;
  const entries = Array.isArray(raw) ? raw.flatMap((x) => isObj(x) ? Object.entries(x) : [[String(x), true]]) : isObj(raw) ? Object.entries(raw) : typeof raw === "string" ? [[raw, true]] : [];
  for (const [key, v] of entries) {
    if (KEEP_FLAGS.includes(key))
      k[key] = v !== false;
    else if (KEEP_LISTS.includes(key))
      k[key] = list(v);
    else
      c.warn(`${where} › ${key}`, `can keep ${[...KEEP_FLAGS, ...KEEP_LISTS].join(", ")}`);
  }
  return k;
}
function normCheckpoints(raw, endings, c, known) {
  const def = { enabled: endings, slots: 3, keep: normKeep(undefined, "", c), auto: false, loop: null, hard: false };
  if (raw === undefined || raw === false)
    return def;
  def.enabled = true;
  if (!isObj(raw))
    return def;
  def.slots = Math.max(0, Math.min(9, Math.round(c.num(raw.slots, "Checkpoints › slots", 3))));
  def.keep = normKeep(raw.keep, "Checkpoints › keep", c);
  def.auto = raw.auto === true || raw.auto === "day";
  def.hard = raw.hard === true;
  if (isObj(raw.loop)) {
    const when = c.expr(raw.loop.when, "Checkpoints › loop › when");
    if (when === undefined)
      c.warn("Checkpoints › loop", "needs `when:` — the moment the day rewinds");
    else
      def.loop = {
        when: String(when),
        to: raw.loop.to !== undefined ? String(raw.loop.to) : def.auto ? "auto" : "start",
        text: typeof raw.loop.text === "string" ? raw.loop.text : "Time rewinds. Only {{user}} remembers what happened.",
        effects: normEffect(raw.loop.do ?? raw.loop.effects, "Checkpoints › loop › do", c, known)
      };
  }
  return def;
}
function normEndings(raw, c) {
  const out = {};
  for (const [id, e] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `Endings › ${id}`;
    if (!isObj(e)) {
      c.warn(w, "needs `when:` and `text:`");
      continue;
    }
    const when = c.expr(e.when, `${w} › when`);
    if (when === undefined) {
      c.warn(w, "needs `when:` — the formula that ends the story");
      continue;
    }
    out[id] = {
      id,
      when: String(when),
      title: typeof e.title === "string" ? e.title : titleCase(id),
      kind: e.kind === "good" || e.kind === "bad" ? e.kind : "neutral",
      text: typeof e.text === "string" ? e.text : ""
    };
  }
  return out;
}
function normBody(raw, c) {
  const def = { enabled: false, narrator: true, open: true, parts: {}, hiddenBy: {}, transforms: {} };
  if (raw === undefined || raw === false)
    return def;
  if (!isObj(raw)) {
    c.warn("Body", "should be a map with `parts:`");
    return def;
  }
  def.enabled = true;
  def.narrator = raw.narrator !== false;
  def.open = raw.open !== false;
  for (const [part, traits] of Object.entries(normTraits(raw.parts ?? {}, "Body › parts", c))) {
    def.parts[part] = Object.fromEntries(Object.entries(traits).filter(([, v]) => v !== null));
  }
  if (isObj(raw.hidden_by))
    for (const [part, slots] of Object.entries(raw.hidden_by))
      def.hiddenBy[part] = list(slots);
  for (const [id, t] of Object.entries(isObj(raw.transforms) ? raw.transforms : {})) {
    const w = `Body › transforms › ${id}`;
    if (!isObj(t) || !Array.isArray(t.stages) || !t.stages.length) {
      c.warn(w, "needs `stages:` — a list of `{ set: { part: { trait: value } }, text }`");
      continue;
    }
    const chance = c.expr(t.chance ?? 100, `${w} › chance`) ?? 100;
    const stages = t.stages.map((st, i) => {
      const sr = isObj(st) ? st : {};
      return { set: normTraits(sr.set ?? {}, `${w} › stage ${i + 1}`, c), ...typeof sr.text === "string" ? { text: sr.text } : {} };
    });
    def.transforms[id] = { id, label: typeof t.label === "string" ? t.label : titleCase(id), chance, stages };
  }
  return def;
}
function normCompanions(raw, c, known, fronts, bonds) {
  const out = {};
  for (const [id, cr] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `Companions › ${id}`;
    if (!isObj(cr)) {
      c.warn(w, "expected `goal:`, `arc:`, `daily:`…");
      continue;
    }
    let arc = null;
    if (isObj(cr.arc)) {
      const f = normFronts({ [`arc_${id}`]: { label: `${titleCase(id)}'s arc`, ...cr.arc } }, c, known, () => `${w} › arc`);
      const def = f[`arc_${id}`];
      if (def) {
        def.when = def.when ? `met('${id}') and (${def.when})` : `met('${id}')`;
        fronts[`arc_${id}`] = def;
        arc = `arc_${id}`;
      }
    }
    let daily = null;
    if (isObj(cr.daily)) {
      const d = { ...cr.daily, options: Object.fromEntries(Object.entries(isObj(cr.daily.options) ? cr.daily.options : {}).map(([oid, o]) => {
        if (!isObj(o))
          return [oid, o];
        const x = { ...o };
        if (x.arc !== undefined && !isObj(x.arc))
          x.arc = { [id]: x.arc };
        if (isObj(x.bond) && !Object.values(x.bond).some(isObj))
          x.bond = { [id]: x.bond };
        return [oid, x];
      })) };
      daily = normDecide(d, `${w} › daily`, c, known)[0] ?? null;
      if (daily)
        daily = { ...daily, id: `companion_${id}_daily` };
    }
    if (isObj(cr.bonds)) {
      bonds[id] = {};
      for (const [b, n] of Object.entries(cr.bonds))
        bonds[id][b] = Math.max(-100, Math.min(100, c.num(n, `${w} › bonds › ${b}`, 0)));
    }
    out[id] = {
      id,
      arc,
      daily,
      ...typeof cr.goal === "string" ? { goal: cr.goal } : {},
      jealousOf: list(cr.jealous_of ?? cr.jealous),
      knows: list(cr.knows)
    };
  }
  return out;
}
function normLineage(raw, c, known) {
  const def = { enabled: false, weeks: 36, stages: [], speed: 1, joinAt: 18, inherit: [], names: CHILD_NAMES };
  if (raw === undefined || raw === false)
    return def;
  const r = isObj(raw) ? raw : {};
  def.enabled = true;
  const preg = isObj(r.pregnancy) ? r.pregnancy : r;
  def.weeks = Math.max(1, c.num(preg.weeks, "Lineage › weeks", 36));
  (Array.isArray(preg.stages) ? preg.stages : []).forEach((st, i) => {
    if (!isObj(st) || typeof st.text !== "string") {
      c.warn(`Lineage › stage ${i + 1}`, "needs `week:` and `text:`");
      return;
    }
    def.stages.push({ week: c.num(st.week, `Lineage › stage ${i + 1} › week`, 1), text: st.text, effects: normEffect(st.do ?? st.effects, `Lineage › stage ${i + 1} › do`, c, known) });
  });
  def.stages.sort((a, b) => a.week - b.week);
  const kids = isObj(r.children) ? r.children : r;
  def.speed = Math.max(0.01, c.num(kids.speed, "Lineage › children › speed", 1));
  def.joinAt = Math.max(18, c.num(kids.join_at, "Lineage › children › join_at", 18));
  def.inherit = list(kids.inherit);
  if (Array.isArray(kids.names) && kids.names.length)
    def.names = kids.names.map(String);
  return def;
}
function normObligations(raw, c, known, money) {
  const out = {};
  for (const [id, o] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `Obligations › ${id}`;
    if (!isObj(o)) {
      c.warn(w, "needs `amount:` and `every:`");
      continue;
    }
    const amount = c.expr(o.amount ?? 0, `${w} › amount`) ?? 0;
    const payWith = typeof o.pay_with === "string" ? o.pay_with : money;
    if (!payWith) {
      c.warn(w, "needs `pay_with:` (a stat) — the ruleset has no money stat");
      continue;
    }
    const every = Math.max(0, c.num(o.every, `${w} › every`, 7));
    let late = null;
    if (isObj(o.late))
      late = normDecide({ ask: o.late.ask ?? `${titleCase(id)} is overdue. What happens?`, options: o.late.options ?? o.late }, `${w} › late`, c, known)[0] ?? null;
    out[id] = {
      id,
      label: typeof o.label === "string" ? o.label : titleCase(id),
      amount,
      every,
      first: Math.max(0, c.num(o.first, `${w} › first`, every || 7)),
      payWith,
      grace: Math.max(0, c.num(o.grace, `${w} › grace`, 1)),
      at: list(o.at),
      late: late ? { ...late, id: `due_${id}_late` } : null,
      ...typeof o.creditor === "string" ? { creditor: o.creditor } : {}
    };
  }
  return out;
}
function normJobs(raw, c, known) {
  const out = {};
  for (const [id, j] of Object.entries(isObj(raw) ? raw : {})) {
    const w = `Jobs › ${id}`;
    if (!isObj(j)) {
      c.warn(w, "needs `patrons:` and `styles:`");
      continue;
    }
    const styles = {};
    for (const [k, v] of Object.entries(isObj(j.styles) ? j.styles : {}))
      styles[k] = typeof v === "string" ? v : titleCase(k);
    if (!Object.keys(styles).length)
      Object.assign(styles, { quick: "Serve them quickly", friendly: "Be warm and chatty", careful: "Take care to get it exactly right" });
    const patrons = [];
    (Array.isArray(j.patrons) ? j.patrons : []).forEach((p, i) => {
      const pr = isObj(p) ? p : typeof p === "string" ? { who: p } : {};
      if (typeof pr.who !== "string") {
        c.warn(`${w} › patrons #${i + 1}`, "needs `who:`");
        return;
      }
      const want = typeof pr.want === "string" ? pr.want : Object.keys(styles)[0];
      if (!styles[want])
        c.warn(`${w} › patrons #${i + 1}`, `wants "${want}", which isn't one of the styles (${Object.keys(styles).join(", ")})`);
      patrons.push({ who: pr.who, want });
    });
    if (!patrons.length) {
      c.warn(w, "needs `patrons:` — who comes in, and what they want");
      continue;
    }
    const when = j.when !== undefined ? c.expr(j.when, `${w} › when`) : undefined;
    out[id] = {
      id,
      label: typeof j.label === "string" ? j.label : `Work: ${titleCase(id)}`,
      at: list(j.at),
      customers: Math.max(1, Math.min(8, Math.round(c.num(j.customers, `${w} › customers`, 3)))),
      pay: c.expr(j.pay ?? 0, `${w} › pay`) ?? 0,
      tip: c.expr(j.tip ?? 0, `${w} › tip`) ?? 0,
      gain: normEffect(j.gain ?? j.effects, `${w} › gain`, c, known),
      minutes: Math.max(0, c.num(j.minutes, `${w} › minutes`, 45)),
      patrons,
      styles,
      ...typeof j.skill === "string" ? { skill: j.skill } : {},
      ...when !== undefined ? { when: String(when) } : {}
    };
  }
  return out;
}
function normObservers(raw, c, known) {
  const def = { enabled: false, when: "exposed > 0", crowd: 2, reactions: {}, rumours: true };
  if (raw === undefined || raw === false)
    return def;
  const r = isObj(raw) ? raw : {};
  def.enabled = true;
  if (r.when !== undefined) {
    const x = c.expr(r.when, "Observers › when");
    if (x !== undefined)
      def.when = String(x);
  }
  def.crowd = Math.max(0, Math.min(6, Math.round(c.num(r.crowd, "Observers › crowd", 2))));
  def.rumours = r.rumours !== false;
  for (const [k, v] of Object.entries(isObj(r.reactions) ? r.reactions : {})) {
    if (!SEEN_REACTIONS.includes(k)) {
      c.warn(`Observers › reactions › ${k}`, `reactions are ${SEEN_REACTIONS.join(", ")}`);
      continue;
    }
    def.reactions[k] = normEffect(v, `Observers › reactions › ${k}`, c, known);
  }
  return def;
}
function normImprovise(raw, c, known, stats, order) {
  const usable = order.filter((id) => stats[id].kind === "skill" || stats[id].kind === "attribute");
  const def = { enabled: true, dc: { easy: 8, fair: 12, hard: 16, extreme: 20 }, bonus: 10, partial: 3, stats: usable, outcomes: {} };
  if (raw === undefined || raw === true)
    return def;
  if (raw === false)
    return { ...def, enabled: false };
  if (!isObj(raw)) {
    c.warn("Improvise", "expected `improvise: false` or a map of settings");
    return def;
  }
  if (raw.enabled === false)
    def.enabled = false;
  if (isObj(raw.dc)) {
    for (const d of DIFFICULTIES)
      if (raw.dc[d] !== undefined)
        def.dc[d] = c.num(raw.dc[d], `Improvise › dc › ${d}`, def.dc[d]);
  }
  def.bonus = c.num(raw.bonus, "Improvise › bonus", 10);
  def.partial = Math.max(0, c.num(raw.partial, "Improvise › partial", 3));
  if (raw.stats !== undefined) {
    const want = list(raw.stats);
    for (const id of want)
      if (!stats[id])
        c.warn("Improvise › stats", `"${id}" isn't a stat`);
    def.stats = want.filter((id) => stats[id]);
  }
  if (raw.time !== undefined)
    def.time = Math.max(0, c.num(raw.time, "Improvise › time", 10));
  if (isObj(raw.outcomes))
    for (const [k, v] of Object.entries(raw.outcomes)) {
      const tier = TIER_KEYS[k];
      if (tier)
        def.outcomes[tier] = normEffect(v, `Improvise › outcomes › ${k}`, c, known);
      else
        c.warn(`Improvise › outcomes › ${k}`, "tiers are crit_success, success, partial, fail, crit_fail");
    }
  return def;
}
function normGrowth(raw, c) {
  const def = { enabled: true, rate: 1, attributes: 0.5, train: true };
  if (raw === undefined || raw === true)
    return def;
  if (raw === false)
    return { ...def, enabled: false };
  if (typeof raw === "number")
    return { ...def, rate: Math.max(0, raw), enabled: raw > 0 };
  if (!isObj(raw)) {
    c.warn("Growth", "expected `growth: false`, a speed, or a map of settings");
    return def;
  }
  if (raw.enabled === false)
    def.enabled = false;
  def.rate = Math.max(0, c.num(raw.rate, "Growth › rate", 1));
  def.attributes = Math.max(0, c.num(raw.attributes, "Growth › attributes", 0.5));
  def.train = raw.train !== false;
  return def;
}
function normDiscovery(raw, c) {
  const def = { enabled: false, at: [], chance: 25, max: 12, time: 60, label: "Explore around here" };
  if (raw === undefined || raw === false)
    return def;
  const r = isObj(raw) ? raw : {};
  def.enabled = true;
  def.at = list(r.at);
  def.chance = c.expr(r.chance ?? 25, "Discovery › chance") ?? 25;
  def.max = Math.max(0, Math.round(c.num(r.max, "Discovery › max", 12)));
  def.time = Math.max(0, c.num(r.time, "Discovery › time", 60));
  if (typeof r.label === "string")
    def.label = r.label;
  if (typeof r.guide === "string")
    def.guide = r.guide;
  return def;
}
function normalizeRuleset(raw) {
  const c = new Ctx3;
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
      traits: list(r.traits).map((t) => t.toLowerCase()),
      uses: Math.max(0, Math.round(c.num(r.uses ?? r.charges, `${w} › uses`, list(r.tags).map((t) => t.toLowerCase()).includes("consumable") ? 1 : 0))),
      keep: r.keep === true,
      bonus: {}
    };
    applyItemUse(items[id], r, w, c, known, false);
  }
  for (const [id, u] of Object.entries(isObj(raw.item_uses) ? raw.item_uses : {})) {
    const it = items[id];
    if (!it) {
      c.warn(`Item uses › ${id}`, `"${id}" isn't a declared item`);
      continue;
    }
    if (!isObj(u))
      continue;
    if (it.use || Object.keys(it.bonus).length)
      continue;
    const { bonus, keep, drafted, use, ...rest } = u;
    const raw = { bonus, keep, use: use ?? (Object.keys(rest).length ? rest : undefined) };
    applyItemUse(it, raw, `Item uses › ${id}`, c, known, drafted === true);
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
    const gate = normGate(r, `Conditions › ${id}`, c);
    conditions[id] = {
      id,
      label: typeof r.label === "string" ? r.label : titleCase(id),
      tone: ["good", "warn", "bad", "neutral"].includes(r.tone) ? r.tone : "warn",
      desc: typeof r.desc === "string" ? r.desc : undefined,
      narrator: r.narrator === true,
      ...gate ? { gate } : {},
      bonus: statNums(r.bonus, `Conditions › ${id} › bonus`, c, known)
    };
  }
  const flags = {};
  for (const [id, d] of Object.entries(isObj(raw.flags) ? raw.flags : {})) {
    const r = isObj(d) ? d : { start: d };
    const gate = normGate(r, `Flags › ${id}`, c);
    flags[id] = { id, label: r.label, narrator: r.narrator === true, start: r.start ?? false, ...gate ? { gate } : {} };
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
  const abilities = normAbilities(raw.abilities, c, known);
  const perksRaw = isObj(raw.perks) ? raw.perks : {};
  const perkList = isObj(perksRaw.list) ? perksRaw.list : Object.fromEntries(Object.entries(perksRaw).filter(([k]) => !PERK_META.has(k)));
  const perks = {};
  for (const [id, p] of Object.entries(perkList)) {
    const w = `Perks › ${id}`;
    if (!isObj(p)) {
      c.warn(w, "expected a perk definition");
      continue;
    }
    perks[id] = normPerk(id, p, w, c, known, abilities);
  }
  for (const p of Object.values(perks))
    for (const x of p.excludes)
      if (!perks[x])
        c.warn(`Perks › ${p.id} › excludes`, `"${x}" isn't a declared perk`);
  const taught = new Set(Object.values(perks).flatMap((p) => p.abilities));
  for (const a of Object.values(abilities))
    if (a.known === DEFAULT_KNOWN)
      a.known = !taught.has(a.id);
  const perkPoints = typeof perksRaw.points === "string" ? perksRaw.points : undefined;
  if (perkPoints && !stats[perkPoints])
    c.warn("Perks › points", `"${perkPoints}" isn't a declared stat`);
  const perkPick = Math.max(0, Math.round(c.num(perksRaw.pick ?? perksRaw.offer, "Perks › pick", 0)));
  const secrets = normSecrets(raw.secrets, c);
  const fronts = normFronts(raw.fronts, c, known);
  const randomEvents = normRandomEvents(raw.random_events ?? raw.events, c, known);
  const liveChoices = normLiveChoices(raw.live_choices, c, known);
  const dungeons = normDungeons(raw.dungeons, c, known);
  const dating = normDating(raw.dating, c, { stats: relStats, order: relStatOrder }, new Set(Object.keys(people)));
  const mind = normMind(raw.mind, c);
  const endingsRaw = isObj(raw.endings) ? raw.endings : {};
  const endings = normEndings(Object.fromEntries(Object.entries(endingsRaw).filter(([k]) => k !== "legacy")), c);
  const legacy = normKeep(endingsRaw.legacy, "Endings › legacy", c, { codex: true, feats: true, perks: true });
  const checkpoints = normCheckpoints(raw.checkpoints, Object.keys(endings).length > 0, c, known);
  const body = normBody(raw.body, c);
  const bonds = {};
  const companions = normCompanions(raw.companions, c, known, fronts, bonds);
  const lineage = normLineage(raw.lineage, c, known);
  const moneyId = typeof hudRaw.money === "string" ? hudRaw.money : statOrder.find((s) => stats[s].kind === "money");
  const obligations = normObligations(raw.obligations ?? raw.debts, c, known, moneyId);
  const jobs = normJobs(raw.jobs, c, known);
  const observers = normObservers(raw.observers ?? raw.being_seen, c, known);
  const discovery = normDiscovery(raw.discovery, c);
  const improvise = normImprovise(raw.improvise ?? raw.improvised, c, known, stats, statOrder);
  const growth = normGrowth(raw.growth ?? raw.practice, c);
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
    perkPick,
    abilities,
    secrets,
    fronts,
    randomEvents,
    liveChoices,
    dungeons,
    dating,
    mind,
    checkpoints,
    endings,
    legacy,
    body,
    companions,
    bonds,
    lineage,
    obligations,
    jobs,
    observers,
    discovery,
    improvise,
    growth
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
    ...Object.values(liveChoices.tags),
    ...Object.values(abilities).map((a) => a.action)
  ].filter((a) => a.tags.some((t) => SEXUAL_TAGS.has(t)));
  if (minors.length && sexualActions.length) {
    c.err("Ruleset", `declares characters under 18 (${minors.join(", ")}) alongside sexual actions — Warp won't run this ruleset`);
    return { ruleset: null, issues: c.issues };
  }
  return { ruleset, issues: c.issues };
}
var SEEN_REACTIONS, DIFFICULTIES, isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v), DEFAULT_WEEKDAYS, KIND_ALIASES, list = (v) => Array.isArray(v) ? v.map(String) : typeof v === "string" ? [v] : [], TIER_KEYS, MONTHS, DEFAULT_WEATHER, DEFAULT_SLOTS, USE_KEYS, PERK_META, DEFAULT_KNOWN = "\x00default", ABILITY_META, KEEP_FLAGS, KEEP_LISTS, CHILD_NAMES, SEXUAL_TAGS;
var init_ruleset = __esm(() => {
  init_expr();
  init_dice();
  init_defs();
  init_defs2();
  SEEN_REACTIONS = ["unnoticed", "glance", "interested", "disapproving", "predatory"];
  DIFFICULTIES = ["easy", "fair", "hard", "extreme"];
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
  USE_KEYS = new Set(["label", "say", "desc", "description", "when", "time", "tags", "check", "params", "why_not", "locked", "group", "cost", "effects", "effect", "outcomes", "per_person", "hidden", "at", "order", "success", "fail", "partial", "crit_success", "crit_fail", "critical_success", "critical_fail", "failure"]);
  PERK_META = new Set(["points", "pick", "offer", "list"]);
  ABILITY_META = new Set(["name", "known", "per_day", "per_encounter", "where"]);
  KEEP_FLAGS = ["codex", "feats", "perks", "secrets", "people", "dating", "deepest"];
  KEEP_LISTS = ["stats", "flags", "items", "rel"];
  CHILD_NAMES = ["Ada", "Ben", "Cleo", "Dan", "Elin", "Finn", "Greta", "Hugo", "Iris", "Jonah", "Kira", "Leo", "Maya", "Nico", "Orla", "Pip", "Rosa", "Sam", "Tess", "Theo", "Uma", "Vic", "Wren", "Zoe"];
  SEXUAL_TAGS = new Set(["sexual", "sex", "nsfw", "lewd", "explicit", "erotic", "smut"]);
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

// src/engine/date/stage.ts
function relPct(r, s, who, stat) {
  const def = r.relStats[stat];
  if (!def)
    return 0;
  const v = s.rel[who]?.[stat] ?? def.start;
  return def.max > def.min ? Math.max(0, Math.min(100, (v - def.min) / (def.max - def.min) * 100)) : 0;
}
function isHostile(r, s, who) {
  return r.dating.enabled && relPct(r, s, who, r.dating.fear) >= r.dating.hostileAt;
}
function stageIndex(r, s, who) {
  if (!r.dating.enabled)
    return 0;
  if (isHostile(r, s, who))
    return -1;
  const love = relPct(r, s, who, r.dating.love);
  let idx = 0;
  r.dating.stages.forEach((st, i) => {
    if (love >= st.at && (!st.partner || s.dating.partners[who]))
      idx = i;
  });
  const partner = r.dating.stages.findIndex((st) => st.partner);
  if (partner >= 0 && s.dating.partners[who])
    idx = Math.max(idx, partner);
  return idx;
}
function stageLabel(r, s, who) {
  const i = stageIndex(r, s, who);
  return i < 0 ? r.dating.hostileLabel : r.dating.stages[i]?.label ?? "";
}

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
function sceneWord(s, id) {
  const w = s.scene?.[id];
  return w && w.loc === s.location && s.minutes - w.at <= SCENE_HOLDS ? w.here : null;
}
function presentPeople(r, s, env) {
  const out = [];
  for (const id of Object.keys(s.people)) {
    if (s.forgotten[id])
      continue;
    const word = sceneWord(s, id);
    if (word !== null) {
      if (word)
        out.push(id);
      continue;
    }
    if (s.location && personLocation(r, s, id, env) === s.location)
      out.push(id);
  }
  return out;
}
var MONTH_NAMES, MONTH_DAYS, SCENE_HOLDS;
var init_world = __esm(() => {
  init_dice();
  init_expr();
  MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  SCENE_HOLDS = 6 * 60;
});

// src/engine/state.ts
function kinAge(r, s, id) {
  const k = s.kin[id];
  return k ? Math.floor((s.minutes - k.born) / 1440 / 365 * r.lineage.speed) : 0;
}
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
    learned: {},
    charges: {},
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
    deepest: {},
    date: null,
    dating: { prefs: {}, known: {}, partners: {}, dates: {} },
    saves: {},
    runs: 1,
    loops: 0,
    ended: null,
    body: structuredClone(r.body.parts),
    tf: {},
    bonds: structuredClone(r.bonds),
    pregnancy: null,
    kin: {},
    dues: {},
    job: null,
    seen: {},
    explored: {},
    discovered: [],
    practice: {},
    scene: {},
    lastLocation: null,
    uses: {}
  };
  for (const o of Object.values(r.obligations)) {
    const owed = typeof o.amount === "number" ? o.amount : evalNumber(o.amount, makeEnv(r, s), 0);
    s.dues[o.id] = { due: r.clock.start + o.first * 1440, owed: Math.max(0, owed), missed: 0 };
  }
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
function foeName(r, s) {
  if (!s.encounter)
    return "Opponent";
  return s.encounter.foeName ?? r.encounters[s.encounter.id]?.foe.name ?? "Opponent";
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
        if (s.uses[e.id] !== undefined) {
          const u = { ...s.uses };
          delete u[e.id];
          s.uses = u;
        }
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
      if (!e.id && s.encounter)
        s.lastEncounter = { id: s.encounter.id, ...s.encounter.foeName ? { foeName: s.encounter.foeName } : {}, outcome: e.outcome ?? "ended", at: s.minutes, loc: s.location };
      s.encounter = e.id ? { id: e.id, round: 0, foe: { ...e.foe ?? {} }, ...e.momentum !== undefined ? { momentum: e.momentum } : {}, ...e.foeName ? { foeName: e.foeName } : {}, at: s.minutes } : null;
      break;
    case "swing":
      if (s.encounter && s.encounter.momentum !== undefined)
        s.encounter.momentum = clamp(s.encounter.momentum + e.d, -100, 100);
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
    case "learn":
      (s.learned ??= {})[e.id] = true;
      break;
    case "charge": {
      const charges = s.charges ??= {};
      const c = charges[e.key];
      const today = c && c.day === e.day ? c.n : 0;
      const here = c && e.enc && c.enc === e.enc ? c.encN : 0;
      charges[e.key] = { day: e.day, n: today + 1, ...e.enc ? { enc: e.enc } : {}, encN: e.enc ? here + 1 : 0 };
      break;
    }
    case "calib":
      s.calibrated[e.who] = true;
      break;
    case "forget":
      if (s.scene[e.who]) {
        const sc = { ...s.scene };
        delete sc[e.who];
        s.scene = sc;
      }
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
      if (e.to !== s.location)
        s.lastLocation = s.location;
      s.location = e.to;
      s.locationName = r.locations[e.to]?.name ?? e.name ?? e.to;
      break;
    case "practice":
      s.practice = { ...s.practice, [e.id]: Math.max(0, (s.practice[e.id] ?? 0) + e.d) };
      break;
    case "scene":
      s.scene = { ...s.scene, [e.who]: { here: e.here, loc: s.location, at: s.minutes } };
      break;
    case "use": {
      const per = r.items[e.id]?.uses ?? 0;
      let have = s.items[e.id] ?? 0;
      if (per <= 0 || have <= 0 || e.n <= 0)
        break;
      let left = (s.uses[e.id] ?? per) - e.n;
      while (left <= 0 && have > 0) {
        have -= 1;
        left += per;
      }
      const uses = { ...s.uses };
      if (have <= 0) {
        delete s.items[e.id];
        for (const [slot, id] of Object.entries(s.worn))
          if (id === e.id)
            delete s.worn[slot];
        delete uses[e.id];
      } else {
        s.items[e.id] = have;
        if (left >= per)
          delete uses[e.id];
        else
          uses[e.id] = left;
      }
      s.uses = uses;
      break;
    }
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
    case "dt_start":
      s.date = structuredClone(e.session);
      break;
    case "dt_patch":
      if (s.date)
        s.date = { ...s.date, ...structuredClone(e.patch) };
      break;
    case "dt_end":
      s.date = null;
      break;
    case "dt_pref":
      s.dating.prefs = { ...s.dating.prefs, [e.who]: { ...s.dating.prefs[e.who] ?? {}, [e.key]: e.v } };
      break;
    case "dt_seen":
      s.dating.known = { ...s.dating.known, [e.who]: { ...s.dating.known[e.who] ?? {}, [e.topic]: e.reaction } };
      break;
    case "dt_partner": {
      const partners = { ...s.dating.partners };
      if (e.on)
        partners[e.who] = true;
      else
        delete partners[e.who];
      s.dating.partners = partners;
      break;
    }
    case "body": {
      const part = { ...s.body[e.part] ?? {} };
      if (e.v === null)
        delete part[e.trait];
      else
        part[e.trait] = e.v;
      const next = { ...s.body };
      if (Object.keys(part).length)
        next[e.part] = part;
      else
        delete next[e.part];
      s.body = next;
      break;
    }
    case "tf":
      s.tf = { ...s.tf, [e.id]: Math.max(s.tf[e.id] ?? 0, e.stage) };
      break;
    case "conceive":
      if (!s.pregnancy)
        s.pregnancy = { carrier: e.carrier, with: e.with, since: s.minutes, told: 0 };
      break;
    case "preg_stage":
      if (s.pregnancy)
        s.pregnancy = { ...s.pregnancy, told: Math.max(s.pregnancy.told, e.n) };
      break;
    case "birth":
      s.pregnancy = null;
      s.kin = { ...s.kin, [e.id]: structuredClone(e.kin) };
      break;
    case "kin_join": {
      const k = s.kin[e.id];
      if (!k || k.joined)
        break;
      s.kin = { ...s.kin, [e.id]: { ...k, joined: true } };
      s.people[e.id] = { name: k.name };
      if (!s.rel[e.id]) {
        s.rel[e.id] = {};
        for (const rs of r.relStatOrder)
          s.rel[e.id][rs] = r.relStats[rs].start;
      }
      break;
    }
    case "due": {
      const cur = s.dues[e.id] ?? { due: 0, owed: 0, missed: 0 };
      s.dues = { ...s.dues, [e.id]: { due: e.due ?? cur.due, owed: Math.max(0, e.owed ?? cur.owed), missed: e.missed ?? cur.missed } };
      break;
    }
    case "seen":
      if (!e.heard || !s.seen[e.who])
        s.seen = { ...s.seen, [e.who]: { what: e.what, at: s.minutes, where: e.where, ...e.heard ? { heard: true } : {} } };
      break;
    case "explored":
      s.explored = { ...s.explored, [e.loc]: e.found ? 0 : (s.explored[e.loc] ?? 0) + 1 };
      break;
    case "discovered":
      if (!s.discovered.includes(e.id))
        s.discovered = [...s.discovered, e.id];
      break;
    case "job":
      s.job = e.job ? structuredClone(e.job) : null;
      break;
    case "news":
      s.news = [...s.news, { text: e.text, at: s.minutes }].slice(-NEWS_KEPT);
      break;
    case "bond":
      s.bonds = { ...s.bonds, [e.a]: { ...s.bonds[e.a] ?? {}, [e.b]: clamp((s.bonds[e.a]?.[e.b] ?? 0) + e.d, -100, 100) } };
      break;
    case "save":
      s.saves = { ...s.saves, [e.slot]: { at: s.minutes, turn: s.turn, label: e.label, snap: snapshotOf(s) } };
      break;
    case "load": {
      const base = e.slot === "start" ? initialState(r) : s.saves[e.slot] ? structuredClone(s.saves[e.slot].snap) : null;
      if (!base)
        break;
      rewind(r, s, base, r.checkpoints.keep);
      s.loops += 1;
      break;
    }
    case "restart": {
      rewind(r, s, initialState(r), r.legacy);
      s.saves = {};
      s.runs += 1;
      s.loops = 0;
      break;
    }
    case "end":
      if (!s.ended)
        s.ended = { id: e.id, at: s.minutes, told: e.told };
      break;
    case "end_told":
      if (s.ended)
        s.ended = { ...s.ended, told: true };
      break;
    case "unend":
      s.ended = null;
      break;
    case "dt_dated": {
      const prev = s.dating.dates[e.who] ?? { count: 0, best: 0 };
      s.dating.dates = { ...s.dating.dates, [e.who]: { count: prev.count + 1, best: Math.max(prev.best, e.enjoy) } };
      break;
    }
    default:
      if (s.dungeon)
        applyDungeon(s, s.dungeon, e);
  }
}
function snapshotOf(s) {
  const snap = structuredClone({ ...s, saves: {} });
  return snap;
}
function rewind(r, s, base, keep) {
  const from = structuredClone(s);
  const next = structuredClone(base);
  const fresh = initialState(r);
  for (const [k, v] of Object.entries(fresh))
    if (next[k] === undefined)
      next[k] = v;
  if (keep.codex)
    next.codex = { ...next.codex, ...from.codex };
  if (keep.feats)
    next.feats = { ...next.feats, ...from.feats };
  if (keep.perks)
    next.perks = { ...next.perks, ...from.perks };
  if (keep.secrets)
    for (const [id, st] of Object.entries(from.secrets))
      next.secrets[id] = Math.max(next.secrets[id] ?? -1, st);
  if (keep.deepest)
    for (const [id, d] of Object.entries(from.deepest))
      next.deepest[id] = Math.max(next.deepest[id] ?? 0, d);
  if (keep.dating)
    next.dating = from.dating;
  if (keep.people) {
    next.people = { ...next.people, ...from.people };
    for (const id of Object.keys(from.people))
      next.rel[id] ??= from.rel[id];
  }
  for (const id of keep.stats)
    if (id in from.stats)
      next.stats[id] = from.stats[id];
  for (const id of keep.flags)
    if (id in from.flags)
      next.flags[id] = from.flags[id];
  for (const id of keep.items) {
    if (from.items[id] > 0)
      next.items[id] = from.items[id];
    else
      delete next.items[id];
  }
  for (const stat of keep.rel)
    for (const [who, m] of Object.entries(from.rel))
      if (stat in m)
        (next.rel[who] ??= {})[stat] = m[stat];
  next.seed = from.seed;
  next.saves = from.saves;
  next.runs = from.runs;
  next.loops = from.loops;
  next.ended = null;
  next.turn = from.turn;
  Object.assign(s, next);
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
function dayOf(s) {
  return Math.floor(s.minutes / 1440);
}
function encounterKey(s) {
  return s.encounter ? `${s.encounter.id}@${s.encounter.at ?? 0}` : undefined;
}
function usesOf(s, key) {
  const c = s.charges?.[key];
  const enc = encounterKey(s);
  return { today: c && c.day === dayOf(s) ? c.n : 0, here: c && enc && c.enc === enc ? c.encN : 0 };
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
      momentum: s.encounter?.momentum ?? 0,
      in_dungeon: !!s.dungeon,
      dungeon_depth: s.dungeon?.depth ?? 0,
      in_date: !!s.date,
      loops: s.loops,
      runs: s.runs,
      at_work: !!s.job,
      pregnant: !!s.pregnancy && s.pregnancy.carrier === "player",
      pregnancy_weeks: s.pregnancy ? Math.floor((s.minutes - s.pregnancy.since) / 1440 / 7) : 0,
      on_outing: s.date?.kind === "outing",
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
        case "partner":
          return a0 in s.dating.partners;
        case "stage":
          return stageIndex(r, s, a0);
        case "saved":
          return a0 in s.saves;
        case "body":
          return s.body[a0]?.[String(args[1] ?? "type")] ?? "";
        case "transformed":
          return s.tf[a0] ?? 0;
        case "bond":
          return s.bonds[a0]?.[String(args[1] ?? "")] ?? 0;
        case "arc":
          return s.fronts[`arc_${a0}`]?.v ?? 0;
        case "age":
          return s.kin[a0] ? kinAge(r, s, a0) : r.people[a0]?.age ?? 0;
        case "children":
          return Object.keys(s.kin).length;
        case "owed":
          return s.dues[a0]?.owed ?? 0;
        case "seen_by":
          return !!s.seen[a0] && !s.seen[a0].heard;
        case "fame":
          return Object.keys(s.seen).length;
        case "missed":
          return s.dues[a0]?.missed ?? 0;
        case "days_until":
          return s.dues[a0] ? Math.floor((s.dues[a0].due - s.minutes) / 1440) : 0;
        case "dates":
          return s.dating.dates[a0]?.count ?? 0;
      }
      return;
    }
  };
  return base;
}
function bandFor(def, value, max) {
  let hit = null;
  const top = max ?? def.max;
  const v = def.pctBands ? top > def.min ? (value - def.min) / (top - def.min) * 100 : 0 : value;
  for (const b of def.bands)
    if (v >= b.at)
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
    "momentum",
    "target",
    "in_dungeon",
    "dungeon_depth",
    "in_date",
    "on_outing",
    "loops",
    "runs",
    "pregnant",
    "pregnancy_weeks",
    "at_work"
  ];
});

// src/engine/encounter-view.ts
function thresholds(enc) {
  const out = [];
  for (const e of enc.endWhen) {
    for (const part of e.when.split(/\s+or\s+/i)) {
      const m = /^\(?\s*(foe\.)?([a-z_]\w*)\s*(<=|>=|<|>|==)\s*(-?\d+(?:\.\d+)?)\s*\)?$/i.exec(part.trim());
      if (m)
        out.push({ outcome: e.outcome, foe: !!m[1], stat: m[2], op: m[3], value: Number(m[4]) });
    }
  }
  return out;
}
function outcomeLabel(enc, outcome) {
  return enc?.labels[outcome] ?? titleCase(outcome);
}
function isLoss(enc, outcome) {
  if (enc?.momentum)
    return outcome === enc.momentum.lose;
  return FAILURE.test(outcome);
}
function endsIn(e) {
  return e?.end ?? null;
}
function directEnds(enc) {
  const out = [];
  for (const id of enc.actionOrder) {
    const a = enc.actions[id];
    for (const e of [a.effects, a.outcomes.success, a.outcomes.crit_success, a.outcomes.partial]) {
      const o = endsIn(e);
      if (o && !out.some((x) => x.outcome === o && x.action === a.label))
        out.push({ action: a.label, outcome: o });
    }
  }
  return out;
}
function encounterGuide(r, s) {
  const st = s.encounter;
  const enc = st ? r.encounters[st.id] : undefined;
  if (!st || !enc)
    return null;
  const th = thresholds(enc);
  const progress = [];
  const goals = [];
  for (const t of th.filter((x) => x.foe && !isLoss(enc, x.outcome))) {
    const fs = enc.foe.stats.find((f) => f.id === t.stat);
    if (!fs)
      continue;
    progress.push({ label: fs.label, value: st.foe[fs.id] ?? fs.start, target: t.value, max: fs.max });
    goals.push(`${t.op.startsWith("<") ? "bring" : "push"} their ${fs.label.toLowerCase()} to ${t.value}`);
  }
  if (enc.momentum)
    goals.push("swing the fight all the way your way");
  for (const d of directEnds(enc))
    if (!isLoss(enc, d.outcome))
      goals.push(`${d.action.toLowerCase()} (${d.outcome.replace(/_/g, " ")})`);
  const goal = enc.goal ?? (goals.length ? cap(joinOr(goals)) : null);
  const danger = [];
  for (const t of th.filter((x) => !x.foe && isLoss(enc, x.outcome))) {
    const def = r.stats[t.stat];
    if (!def)
      continue;
    const value = s.stats[t.stat] ?? def.start;
    const span = Math.max(1, def.max - def.min);
    const gap = t.op.startsWith(">") ? t.value - value : value - t.value;
    danger.push({ label: def.label, value, at: t.value, text: `${def.label} ${Math.round(value)}, out at ${t.value}`, close: gap / span <= 0.2 });
  }
  danger.sort((a, b) => Math.abs(a.at - a.value) - Math.abs(b.at - b.value));
  const loss = th.find((x) => !x.foe && isLoss(enc, x.outcome));
  const dangerText = enc.danger ?? (danger.length ? `${danger.slice(0, 2).map((d) => `${d.label} at ${d.at}`).join(" or ")} and you're ${outcomeLabel(enc, loss.outcome).toLowerCase()}` : null);
  return { goal, progress, danger, dangerText };
}
function joinOr(xs) {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} — or ${xs[xs.length - 1]}`;
}
function roundCard(r, rec, before, after, odds) {
  const enc = before.encounter ? r.encounters[before.encounter.id] : undefined;
  const changes = [];
  if (enc && before.encounter) {
    const fin = after.encounter?.id === before.encounter.id ? after.encounter : null;
    for (const fs of enc.foe.stats) {
      const from = before.encounter.foe[fs.id] ?? fs.start;
      const touched = rec.events.some((e) => e.t === "foe" && e.stat === fs.id);
      const to = fin ? fin.foe[fs.id] ?? fs.start : from + rec.events.reduce((n, e) => n + (e.t === "foe" && e.stat === fs.id ? e.set !== undefined ? e.set - from : e.d ?? 0 : 0), 0);
      if (touched && to !== from)
        changes.push({ label: `${foeName(r, before)}: ${fs.label}`, from, to: Math.max(0, to), of: fs.max, good: to < from === (fs.good !== "high") });
    }
    if (before.encounter.momentum !== undefined) {
      const to = fin?.momentum ?? before.encounter.momentum + rec.events.reduce((n, e) => n + (e.t === "swing" ? e.d : 0), 0);
      if (to !== before.encounter.momentum)
        changes.push({ label: "Momentum", from: before.encounter.momentum, to, of: 100, good: to > before.encounter.momentum });
    }
  }
  const watched = new Set(enc ? thresholds(enc).filter((t) => !t.foe).map((t) => t.stat) : []);
  for (const id of r.statOrder) {
    const from = before.stats[id], to = after.stats[id];
    if (from === undefined || to === undefined || Math.abs(to - from) < 0.5)
      continue;
    if (!watched.has(id) && !rec.events.some((e) => e.t === "stat" && e.id === id && e.src !== "drift"))
      continue;
    const def = r.stats[id];
    if (def.kind === "hidden")
      continue;
    const at = enc ? thresholds(enc).find((t) => !t.foe && t.stat === id && isLoss(enc, t.outcome))?.value ?? null : null;
    changes.push({ label: def.label, from: Math.round(from), to: Math.round(to), of: at ?? (def.kind === "meter" ? def.max : null), good: def.good === "low" ? to < from : def.good === "high" ? to > from : true });
  }
  const endEv = rec.events.find((e) => e.t === "enc" && e.id === null);
  const foeDec = enc?.foeMoves ? rec.decisions?.find((d) => d.id === enc.foeMoves.id) : undefined;
  return {
    move: rec.action?.label ?? "No clear move",
    check: rec.check ? { label: rec.check.label, tier: TIER_WORD[rec.check.tier] ?? rec.check.tier, odds, gear: rec.check.gear ?? [] } : null,
    foe: foeDec ? foeDec.pickedDesc : null,
    changes,
    ended: endEv ? { outcome: endEv.outcome ?? "ended", label: outcomeLabel(enc, endEv.outcome ?? "ended"), loss: isLoss(enc, endEv.outcome ?? "") } : null,
    round: (before.encounter?.round ?? 0) + 1
  };
}
function effectStats(a) {
  const stats = new Map;
  const adds = [], removes = [];
  let foe = false, ends = false;
  for (const e of [a.effects, ...Object.values(a.outcomes)]) {
    if (!e)
      continue;
    for (const [k, v] of Object.entries(e.stats))
      stats.set(k, (stats.get(k) ?? 0) + (typeof v === "number" ? v : 0));
    adds.push(...Object.keys(e.addConditions));
    removes.push(...e.removeConditions);
    if (Object.keys(e.foe).length)
      foe = true;
    if (e.end)
      ends = true;
  }
  return { stats, adds, removes, foe, ends };
}
function encounterReads(enc) {
  const ids = new Set;
  for (const a of Object.values(enc.actions)) {
    if (a.check)
      for (const x of [...identifiers(a.check.add), ...identifiers(a.check.target)])
        ids.add(x);
    if (a.when)
      for (const x of identifiers(a.when))
        ids.add(x);
  }
  for (const e of enc.endWhen)
    for (const x of identifiers(e.when))
      ids.add(x);
  return ids;
}
function itemRelevance(r, s, a) {
  const fx = effectStats(a);
  let score = 0;
  let best = null;
  const add = (w, why) => {
    score += w;
    if (!best || w > best.w)
      best = { w, why };
  };
  const enc = s.encounter ? r.encounters[s.encounter.id] : undefined;
  const reads = enc ? encounterReads(enc) : new Set;
  for (const [id, d] of fx.stats) {
    const def = r.stats[id];
    if (!def || !d)
      continue;
    const v = s.stats[id] ?? def.start;
    const p = (v - def.min) / Math.max(1, statMax(r, def, s) - def.min);
    const bad = def.good === "low" ? p >= 0.5 : def.good === "high" ? p <= 0.5 : false;
    const helps = def.good === "low" ? d < 0 : def.good === "high" ? d > 0 : false;
    if (bad && helps)
      add(1.5 + p, `${def.label} is ${def.good === "low" ? "high" : "low"}`);
    if (enc && reads.has(id))
      add(1.5, `Changes ${def.label}, which this encounter turns on`);
  }
  for (const c of fx.removes)
    if (s.conditions[c])
      add(3, `Clears ${r.conditions[c]?.label ?? c}`);
  if (enc && fx.foe)
    add(2, `Works on ${foeName(r, s)}`);
  if (enc && fx.ends)
    add(1, "Can end the encounter");
  return { score, why: best?.why ?? null };
}
var FAILURE, cap = (t) => t.charAt(0).toUpperCase() + t.slice(1), TIER_WORD;
var init_encounter_view = __esm(() => {
  init_ruleset();
  init_state();
  init_expr();
  FAILURE = /^(lost|lose|loss|beaten|defeat(ed)?|overwhelmed|caught|captured|ko|knocked_out|downed|fallen|slain|killed|dead|died|wiped(_out)?|fled_in_panic|broken|failed?)$/i;
  TIER_WORD = { crit_success: "great success", success: "success", partial: "partial", fail: "failed", crit_fail: "badly failed" };
});

// src/engine/freeform.ts
function improvStats(r) {
  return r.improvise.stats.filter((id) => r.stats[id]);
}
function isDifficulty(v) {
  return typeof v === "string" && DIFFICULTIES.includes(v);
}
function position(r, s, stat) {
  const def = r.stats[stat];
  const max = statMax(r, def, s);
  const v = s.stats[stat] ?? def.start;
  return max > def.min ? Math.max(0, Math.min(1, (v - def.min) / (max - def.min))) : 0;
}
function improvBonus(r, s, stat) {
  return r.stats[stat] ? Math.round(position(r, s, stat) * r.improvise.bonus) : 0;
}
function improvAction(r, s, actionId) {
  if (!r.improvise.enabled || !actionId.startsWith(IMPROV))
    return null;
  const stat = actionId.slice(IMPROV.length);
  if (stat && !r.stats[stat])
    return null;
  const label = stat ? r.stats[stat].label : "Luck";
  return {
    id: actionId,
    label: `Attempt (${label})`,
    at: [],
    hidden: true,
    ...r.improvise.time !== undefined ? { time: r.improvise.time } : {},
    cost: emptyEffect(),
    check: { style: "vs", dice: "d20", target: "difficulty", add: stat ? improvBonus(r, s, stat) : 0, partialMargin: r.improvise.partial, label, crits: true },
    outcomes: r.improvise.outcomes,
    effects: emptyEffect(),
    params: [{ id: "difficulty", label: "Difficulty", options: Object.fromEntries(DIFFICULTIES.map((d) => [d, r.improvise.dc[d]])), default: "fair" }],
    tags: ["improvised"],
    order: 0,
    perPerson: false
  };
}
function checkStats(r, a) {
  if (a.id.startsWith(IMPROV)) {
    const st = a.id.slice(IMPROV.length);
    return st && r.stats[st] ? [st] : [];
  }
  if (!a.check)
    return [];
  const names = new Set([...identifiers(a.check.add), ...identifiers(a.check.target)]);
  return r.statOrder.filter((id) => names.has(id) && (r.stats[id].kind === "skill" || r.stats[id].kind === "attribute"));
}
function practiceGain(r, s, stat, hardness, learn) {
  const def = r.stats[stat];
  if (!def || !r.growth.enabled || def.growth <= 0)
    return 0;
  const max = statMax(r, def, s);
  if ((s.stats[stat] ?? def.start) >= max)
    return 0;
  const kind = def.kind === "attribute" ? r.growth.attributes : 1;
  return (max - def.min) * 0.02 * r.growth.rate * def.growth * kind * hardness * learn * (1 - 0.6 * position(r, s, stat));
}
function hardnessFrom(success, difficulty) {
  if (isDifficulty(difficulty))
    return HARDNESS[difficulty];
  return success === null ? 1 : 0.5 + 1.5 * (1 - Math.max(0, Math.min(1, success)));
}
function checkGains(r, s, stats, hardness, tier) {
  const out = {};
  for (const id of stats) {
    const g = practiceGain(r, s, id, hardness, LEARN[tier]);
    if (g > 0)
      out[id] = g;
  }
  return out;
}
function trainingGain(r, s, stat, minutes) {
  if (!r.growth.train)
    return 0;
  const hours = Math.max(0.5, Math.min(4, (minutes ?? 60) / 60));
  return practiceGain(r, s, stat, 1, 1.5 * hours);
}
function practise(t, gains, why) {
  for (const [id, g] of Object.entries(gains)) {
    const def = t.r.stats[id];
    if (!def || !(g > 0))
      continue;
    const pool = (t.s.practice[id] ?? 0) + g;
    const room = Math.max(0, statMax(t.r, def, t.s) - (t.s.stats[id] ?? def.start));
    const up = Math.min(Math.floor(pool), Math.floor(room));
    const left = room - up < 1 ? 0 : pool - up;
    const d = left - (t.s.practice[id] ?? 0);
    if (Math.abs(d) > 0.000000001)
      t.push({ t: "practice", id, d, src: "check", why });
    if (up > 0)
      t.push({ t: "stat", id, d: up, src: "check", why: `${why} — ${def.label} improved with practice` });
  }
}
function practiceProgress(r, s, stat) {
  const def = r.stats[stat];
  if (!def || !r.growth.enabled || def.growth <= 0)
    return null;
  if ((s.stats[stat] ?? def.start) >= statMax(r, def, s))
    return null;
  return Math.max(0, Math.min(0.999, s.practice[stat] ?? 0));
}
var IMPROV = "try:", DIFFICULTY_WORD, HARDNESS, LEARN, IMPROV_DIRECTION;
var init_freeform = __esm(() => {
  init_expr();
  init_ruleset();
  init_state();
  DIFFICULTY_WORD = { easy: "easy", fair: "a fair challenge", hard: "hard", extreme: "extreme" };
  HARDNESS = { easy: 0.5, fair: 1, hard: 1.5, extreme: 2 };
  LEARN = { crit_success: 1.2, success: 1, partial: 1, fail: 0.7, crit_fail: 0.5 };
  IMPROV_DIRECTION = {
    crit_success: "It goes better than {{user}} could have hoped — a clean success with something extra.",
    success: "It works.",
    partial: "It works, but not cleanly — add a cost, a complication or a price.",
    fail: "It doesn't work. Show the failure and a consequence that makes things harder.",
    crit_fail: "It goes badly wrong — a failure that costs {{user}} something real."
  };
});

// src/engine/chronicle.ts
function runSummary(r, s) {
  const lines = [];
  if (r.clock.enabled)
    lines.push(`It lasted until ${formatClock(r, s.minutes).label}.`);
  if (s.runs > 1)
    lines.push(`This was playthrough ${s.runs}.`);
  if (s.loops > 0)
    lines.push(`Time rewound ${s.loops} time${s.loops === 1 ? "" : "s"}.`);
  const people = Object.keys(s.people).map((id) => {
    const name = personName(r, s, id);
    if (s.dating.partners[id])
      return `${name} (together)`;
    if (r.dating.enabled)
      return `${name} (${stageLabel(r, s, id).toLowerCase()})`;
    const first = r.relStatOrder[0];
    const def = first ? r.relStats[first] : undefined;
    const band = def ? bandFor(def, s.rel[id]?.[first] ?? def.start) : null;
    return band ? `${name} (${def.label.toLowerCase()}: ${band.text.toLowerCase()})` : name;
  });
  if (people.length)
    lines.push(`People: ${people.join(", ")}.`);
  const dates = Object.entries(s.dating.dates).map(([id, d]) => `${d.count} with ${personName(r, s, id)}`);
  if (dates.length)
    lines.push(`Dates: ${dates.join(", ")}.`);
  const feats = Object.keys(s.feats).map((id) => r.feats[id]?.name ?? id);
  if (feats.length)
    lines.push(`Feats: ${feats.join(", ")}.`);
  const codex = Object.keys(s.codex).length;
  if (codex)
    lines.push(`Discovered ${codex} codex entr${codex === 1 ? "y" : "ies"}.`);
  const deep = Object.entries(s.deepest).map(([id, d]) => `floor ${d} of ${r.dungeons[id]?.name ?? id}`);
  if (deep.length)
    lines.push(`Deepest dive: ${deep.join(", ")}.`);
  const news = s.news.slice(-5).map((n) => n.text);
  if (news.length)
    lines.push(`What happened in the world: ${news.join(" ")}`);
  return lines.join(" ");
}
function endingDirection(r, s, e) {
  return `THE STORY REACHES AN ENDING — "${e.title}" (${e.kind}). ${e.text} Write this reply as the ending: close the story with an epilogue that draws on what actually happened. ${runSummary(r, s)} Don't carry the story on past it.`;
}
var init_chronicle = __esm(() => {
  init_state();
});

// src/engine/date/talk.ts
function isMinor(r, s, who) {
  const age = r.people[who]?.age;
  if (age !== undefined)
    return age < 18;
  const a = s.dating.prefs[who]?.[ADULT_KEY];
  return a === undefined ? null : a < 0;
}
function romanceOk(r, s, who) {
  if (!r.dating.enabled || !r.dating.romance)
    return false;
  if (s.kin[who])
    return false;
  if (r.player.age !== undefined && r.player.age < 18)
    return false;
  return isMinor(r, s, who) === false;
}
function canTalkTo(r, s, who) {
  if (!s.people[who] || s.forgotten[who])
    return false;
  return !r.dating.with || evalBool(r.dating.with, makeEnv(r, s, { target: who }), true);
}
function dateCandidates(r, s) {
  if (!r.dating.enabled || s.dungeon || s.encounter || activeSession(r, s))
    return [];
  const here = new Set(presentPeople(r, s, makeEnv(r, s)));
  return Object.keys(s.people).filter((id) => (here.has(id) || r.people[id] && !r.people[id].schedule.length && sceneWord(s, id) === null) && canTalkTo(r, s, id));
}
function talkablePeople(r, s) {
  if (!r.dating.enabled || s.dungeon || s.encounter)
    return [];
  return Object.keys(s.people).filter((id) => canTalkTo(r, s, id));
}
function activeSession(r, s) {
  const d = s.date;
  if (!d || !r.dating.enabled || !s.people[d.who])
    return null;
  if (d.kind !== "outing" && d.at !== s.location)
    return null;
  return d;
}
function seededPref(s, who, key) {
  const rng = seededRng(`pref:${s.seed ?? ""}:${who}:${key}`);
  let x = rng();
  let pick = "neutral";
  for (const [k, p] of SEEDED) {
    x -= p;
    if (x <= 0) {
      pick = k;
      break;
    }
  }
  return REACTION_VALUE[pick] + (rng() - 0.5) * 0.4;
}
function authoredPref(r, who, keys) {
  const t = r.dating.people[who];
  if (!t)
    return;
  for (const k of keys)
    if (t[k])
      return REACTION_VALUE[t[k]];
  return;
}
function aliases(key, extra = []) {
  const bare = key.includes(":") ? key.slice(key.indexOf(":") + 1) : key;
  return [key, ...bare !== key ? [bare] : [], ...extra];
}
function prefOf(r, s, who, key, extra = []) {
  return authoredPref(r, who, aliases(key, extra)) ?? s.dating.prefs[who]?.[key] ?? seededPref(s, who, key);
}
function topicPref(r, s, who, t) {
  return prefOf(r, s, who, t.id, [t.category]);
}
function activityPref(r, s, who, a) {
  const authored = authoredPref(r, who, [`act:${a.id}`, a.id]);
  if (authored !== undefined)
    return authored;
  if (!a.tags.length)
    return 0;
  return a.tags.reduce((sum, tag) => sum + prefOf(r, s, who, `tag:${tag}`), 0) / a.tags.length;
}
function tasteSpec(id, ask) {
  return { id, ask, options: REACTIONS.map((x) => ({ id: x, desc: TASTE_DESC[x], weight: 1, effect: emptyEffect() })) };
}
function learnTastes(t, who, keys) {
  const { r } = t;
  const name = personName(r, t.s, who);
  for (const k of keys) {
    if (authoredPref(r, who, aliases(k.key, k.extra)) !== undefined || t.s.dating.prefs[who]?.[k.key] !== undefined)
      continue;
    const odds = t.modelOdds(tasteSpec(`date:pref:${who}:${k.key}`, `From everything known about ${name} — personality, history, tastes — how would ${name} feel about ${k.about}?`));
    const v = odds ? REACTIONS.reduce((sum, x) => sum + (odds[x] ?? 0) * REACTION_VALUE[x], 0) : seededPref(t.s, who, k.key);
    t.push({ t: "dt_pref", who, key: k.key, v: Math.round(v * 100) / 100, src: "action" });
  }
}
function learnAge(t, who) {
  if (isMinor(t.r, t.s, who) !== null)
    return;
  const name = personName(t.r, t.s, who);
  const odds = t.modelOdds({
    id: `date:adult:${who}`,
    ask: `Is ${name} an adult (18 or older), going by the story and the character card?`,
    options: [
      { id: "adult", desc: "Clearly an adult", weight: 1, effect: emptyEffect() },
      { id: "minor", desc: "Under 18", weight: 1, effect: emptyEffect() },
      { id: "unclear", desc: "Can't tell", weight: 1, effect: emptyEffect() }
    ]
  });
  if (odds)
    t.push({ t: "dt_pref", who, key: ADULT_KEY, v: (odds.adult ?? 0) >= 0.8 ? 1 : -1, src: "action" });
}
function reactionPrior(r, s, sess, who, pref, opts = {}) {
  let c = pref + sess.mood * 0.35;
  if (sess.fatigue >= 80)
    c -= 1;
  else if (sess.fatigue >= 60)
    c -= 0.5;
  c -= 0.8 * (opts.repeat ?? 0);
  const st = stageIndex(r, s, who);
  if (st < 0)
    c -= 1;
  else if ((opts.stage ?? 0) > st)
    c -= 1.2 * ((opts.stage ?? 0) - st);
  if (relPct(r, s, who, r.dating.fear) >= r.dating.hostileAt / 2)
    c -= 0.4;
  c = Math.max(-2.5, Math.min(2.5, c));
  const raw = Object.fromEntries(REACTIONS.map((x) => [x, Math.exp(-((REACTION_VALUE[x] - c) ** 2) / (2 * 0.85 ** 2))]));
  const sum = REACTIONS.reduce((a, x) => a + raw[x], 0);
  for (const x of REACTIONS)
    raw[x] /= sum;
  return raw;
}
function warmth(p) {
  return (p.love ?? 0) + (p.like ?? 0);
}
function combine(prior, model, k = 0.6) {
  if (!model)
    return prior;
  const out = {};
  for (const key of Object.keys(prior))
    out[key] = Math.pow(Math.max(prior[key], 0.000001), k) * Math.max(model[key] ?? 0, 0.000001);
  return out;
}
function unit(r, stat) {
  const d = r.relStats[stat];
  return d ? (d.max - d.min) / 100 : 1;
}
function moodOf(m) {
  let hit = MOODS[0];
  for (const x of MOODS)
    if (m >= x.at - 0.25)
      hit = x;
  return hit;
}
function relMove(t, who, love, fear) {
  const { r } = t;
  const l = Math.round(love * unit(r, r.dating.love) * 10) / 10;
  const f = Math.round(fear * unit(r, r.dating.fear) * 10) / 10;
  if (l)
    t.push({ t: "rel", who, stat: r.dating.love, d: l, src: "action" });
  if (f)
    t.push({ t: "rel", who, stat: r.dating.fear, d: f, src: "action" });
}
function watchStage(t, who, fn) {
  const before = stageIndex(t.r, t.s, who);
  fn();
  const after = stageIndex(t.r, t.s, who);
  if (after === before)
    return;
  const name = personName(t.r, t.s, who);
  if (after < 0)
    t.announce(`${name} has turned hostile toward {{user}} — cold, guarded, or openly angry.`);
  else if (before < 0)
    t.announce(`${name} is no longer hostile toward {{user}}.`);
  else if (after > before)
    t.announce(`${name} now sees {{user}} as ${articled(stageLabel(t.r, t.s, who).toLowerCase())}.`);
  else
    t.announce(`${name} has cooled toward {{user}}: more ${stageLabel(t.r, t.s, who).toLowerCase()} than before.`);
}
function react(t, who, reaction, o) {
  const { r } = t;
  const sess = t.s.date;
  const name = personName(r, t.s, who);
  const mult = reaction === "love" || reaction === "like" ? 1 + 0.25 * Math.min(sess.combo, 4) : 1;
  watchStage(t, who, () => relMove(t, who, LOVE[reaction] * o.scale * mult * (o.activity ? 0.7 : 1), FEAR[reaction]));
  const warm = reaction === "love" || reaction === "like";
  const combo = warm ? sess.combo + 1 : reaction === "neutral" ? sess.combo : 0;
  const fatigue = Math.max(0, Math.min(100, sess.fatigue + (o.activity ? 3 : r.dating.fatiguePerTopic) + (reaction === "dislike" ? 5 : reaction === "hate" ? 10 : reaction === "love" ? -4 : 0)));
  const patch = {
    mood: clampMood(sess.mood + MOOD[reaction]),
    combo,
    fatigue,
    used: { ...sess.used, [o.key]: (sess.used[o.key] ?? 0) + 1 },
    last: { topic: o.key, label: o.label, reaction }
  };
  if (sess.kind === "outing")
    patch.enjoy = Math.max(0, Math.min(100, sess.enjoy + (o.activity ? ENJOY[reaction] : Math.round(ENJOY[reaction] / 2))));
  t.push({ t: "dt_patch", patch, src: "action" });
  if (o.seen)
    t.push({ t: "dt_seen", who, topic: o.seen, reaction, src: "action" });
  t.announce(LINE[reaction](name));
  if (combo >= 3 && warm && combo > sess.combo)
    t.announce(`The conversation is flowing: ${combo} good moments in a row.`);
  if (fatigue >= 80 && sess.fatigue < 80)
    t.announce(`${name} is getting tired of talking.`);
  if (sess.kind !== "outing" && fatigue >= 100) {
    t.announce(`${name} has had enough talking for now and politely wraps it up.`);
    t.push({ t: "dt_end", src: "action" });
    return false;
  }
  if (reaction === "hate" && sess.mood <= -1) {
    t.announce(`${name} has had enough: they end the ${sess.kind === "outing" ? "date" : "conversation"} and leave, or tell {{user}} to.`);
    relMove(t, who, 0, 3);
    if (sess.kind === "outing")
      t.push({ t: "dt_dated", who, enjoy: Math.max(0, (t.s.date?.enjoy ?? 0) - 20), src: "action" });
    t.push({ t: "dt_end", src: "action" });
    return false;
  }
  return true;
}
function topicAvailable(r, s, who, tp, lines) {
  if (tp.romantic && (!romanceOk(r, s, who) || lines.has("romance") || lines.has("romantic")))
    return false;
  const st = stageIndex(r, s, who);
  if (st < 0 ? tp.stage > 0 : tp.stage > st)
    return false;
  return !tp.when || evalBool(tp.when, makeEnv(r, s, { target: who }), true);
}
function topicLock(r, s, who, tp, lines = new Set) {
  if (tp.romantic && (lines.has("romance") || lines.has("romantic")))
    return "Turned off in Lines & Veils";
  if (tp.romantic && !r.dating.romance)
    return "Romance is off";
  if (tp.romantic && !romanceOk(r, s, who))
    return isMinor(r, s, who) === true || (r.player.age ?? 18) < 18 ? "Not with anyone under 18" : "Not known to be an adult";
  const st = stageIndex(r, s, who);
  if (st < 0 && tp.stage > 0)
    return `${r.dating.hostileLabel} — apologise first`;
  if (tp.stage > st)
    return `Needs ${r.dating.stages[tp.stage]?.label ?? "a closer bond"}`;
  if (tp.when && !evalBool(tp.when, makeEnv(r, s, { target: who }), true))
    return "Not right now";
  return null;
}
function giftable(r, s) {
  return Object.keys(s.items).filter((id) => s.items[id] > 0 && !Object.values(s.worn).includes(id) && r.items[id]?.tags.includes("gift"));
}
function money(r, s) {
  return r.hud.money ? s.stats[r.hud.money] ?? r.stats[r.hud.money]?.start ?? 0 : null;
}
function venueOk(r, s, who, v) {
  if (v.romantic && !romanceOk(r, s, who))
    return false;
  if (v.when && !evalBool(v.when, makeEnv(r, s, { target: who }), true))
    return false;
  const cash = money(r, s);
  return cash === null || cash >= v.cost;
}
function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}
function askOutPrior(r, s, sess, who) {
  const z = (relPct(r, s, who, r.dating.love) - 20) / 12 + sess.mood * 0.6 - (sess.fatigue >= 70 ? 1 : 0) + (s.dating.partners[who] ? 3 : 0) - 1.2 * (sess.used.ask_out ?? 0);
  const yes = sigmoid(z);
  return { yes, later: (1 - yes) * 0.6, no: (1 - yes) * 0.4 };
}
function confessPrior(r, s, sess, who) {
  const z = (relPct(r, s, who, r.dating.love) - 60) / 9 + sess.mood * 0.5 + ((s.dating.dates[who]?.count ?? 0) > 0 ? 0.5 : 0) - (sess.used.confess ?? 0) * 1.5;
  const yes = sigmoid(z);
  return { returns: yes, unsure: (1 - yes) * 0.55, rejects: (1 - yes) * 0.45 };
}
function kissPrior(r, s, sess, who) {
  const z = (relPct(r, s, who, r.dating.love) - 45) / 10 + sess.mood * 0.7 + (sess.kind === "outing" ? (sess.enjoy - 50) / 15 : 0) + (s.dating.partners[who] ? 2 : 0) - (sess.used.kiss ?? 0);
  const yes = sigmoid(z);
  return { welcome: yes, hesitant: (1 - yes) * 0.5, refuse: (1 - yes) * 0.5 };
}
function featuredTopics(r, s, sess, who, list, n) {
  const known = s.dating.known[who] ?? {};
  const good = list.filter((tp) => (known[tp.id] === "love" || known[tp.id] === "like") && !sess.used[tp.id]);
  const fresh = list.filter((tp) => !known[tp.id] && !sess.used[tp.id]);
  const rest = list.filter((tp) => !good.includes(tp) && !fresh.includes(tp) && known[tp.id] !== "hate" && known[tp.id] !== "dislike");
  const shuffled = shuffle(fresh, seededRng(`feature:${who}:${s.turn}`));
  const pick = [...good.slice(0, Math.ceil(n / 2)), ...shuffled, ...rest].slice(0, n);
  return new Set(pick.map((tp) => tp.id));
}
function dateMoves(r, s, lines = []) {
  if (!r.dating.enabled)
    return [];
  const blocked = new Set(lines.map((l) => l.toLowerCase()));
  const sess = activeSession(r, s);
  if (!sess) {
    const featured = new Set(dateCandidates(r, s).slice(0, 4));
    return talkablePeople(r, s).map((who) => {
      const name = personName(r, s, who);
      return {
        id: `${DATE_PREFIX}talk@${who}`,
        label: `Talk with ${name}`,
        say: `*I strike up a conversation with ${name}.*`,
        group: "People",
        desc: `${stageLabel(r, s, who)} · start a conversation`,
        odds: null,
        romantic: false,
        featured: featured.has(who),
        kind: "start"
      };
    });
  }
  const who = sess.who;
  const name = personName(r, s, who);
  const out = [];
  const special = (id, label, say, desc, odds, romantic = false, featured = true) => out.push({ id: `${DATE_PREFIX}${id}`, label, say, group: name, desc, odds, romantic, featured, kind: "special" });
  if (sess.kind === "plan") {
    for (const v of Object.values(r.dating.venues)) {
      if (!venueOk(r, s, who, v))
        continue;
      out.push({
        id: `${DATE_PREFIX}venue:${v.id}`,
        label: v.name,
        say: `*I suggest we go to ${v.name.replace(/^(a|an|the) /i, (m) => m.toLowerCase())}.*`,
        group: "Where to?",
        desc: `${v.desc ?? ""}${v.cost ? `${v.desc ? " · " : ""}Costs ${r.hud.currency}${v.cost}` : ""}` || null,
        odds: null,
        romantic: v.romantic,
        featured: true,
        kind: "venue"
      });
    }
    special("later", "Maybe another time", `*"Maybe another time," I say.*`, "Stay and keep talking", null);
    return out;
  }
  const topics = r.dating.topicOrder.map((id) => r.dating.topics[id]).filter((tp) => topicAvailable(r, s, who, tp, blocked));
  if (!sess.closing) {
    const shown = featuredTopics(r, s, sess, who, topics, sess.kind === "outing" ? 3 : 6);
    const known = s.dating.known[who] ?? {};
    for (const tp of topics) {
      const p = reactionPrior(r, s, sess, who, topicPref(r, s, who, tp), { stage: tp.stage, repeat: sess.used[tp.id] ?? 0 });
      out.push({
        id: `${DATE_PREFIX}topic:${tp.id}`,
        label: tp.label,
        say: (tp.say ?? `*I bring up ${tp.label.charAt(0).toLowerCase()}${tp.label.slice(1)}.*`).replace(/\{\{target\}\}|\{target\}/gi, name),
        group: sess.kind === "outing" ? "Talk" : `Talk with ${name}`,
        desc: [tp.desc, known[tp.id] ? `Last time: ${REACTION_LABEL[known[tp.id]].toLowerCase()}` : "You don't know how they feel about this yet"].filter(Boolean).join(" · "),
        odds: known[tp.id] ? warmth(p) : null,
        romantic: tp.romantic,
        featured: shown.has(tp.id),
        kind: "topic"
      });
    }
  }
  if (sess.kind === "outing") {
    const v = r.dating.venues[sess.venue ?? ""];
    if (v && !sess.closing)
      for (const aid of sess.offer) {
        const a = v.activities.find((x) => x.id === aid);
        if (!a || a.romantic && (!romanceOk(r, s, who) || blocked.has("romance")))
          continue;
        out.push({
          id: `${DATE_PREFIX}act:${a.id}`,
          label: a.label,
          say: a.say ?? `*${a.label}.*`,
          group: v.name,
          desc: a.tags.length ? a.tags.join(", ") : null,
          odds: null,
          romantic: a.romantic,
          featured: true,
          kind: "activity"
        });
      }
  }
  const st = stageIndex(r, s, who);
  const romance = romanceOk(r, s, who) && !blocked.has("romance");
  if (sess.kind === "talk" && st >= 1 && Object.values(r.dating.venues).some((v) => venueOk(r, s, who, v))) {
    special("ask_out", romance ? `Ask ${name} out` : `Suggest hanging out`, romance ? `*I ask ${name} if they'd like to go out with me.*` : `*I ask ${name} if they'd like to hang out somewhere.*`, "Pick somewhere to go together", askOutPrior(r, s, sess, who).yes);
  }
  const partnerStage = r.dating.stages.findIndex((x) => x.partner);
  if (sess.kind === "talk" && romance && !s.dating.partners[who] && partnerStage > 0 && st >= partnerStage - 1) {
    special("confess", "Confess your feelings", `*I tell ${name} how I feel about them.*`, "It could change everything", confessPrior(r, s, sess, who).returns, true);
  }
  if (romance && st >= 2 && (sess.closing || sess.kind === "talk" && st >= 3 || sess.kind === "outing")) {
    special("kiss", sess.closing ? "Lean in for a kiss" : `Kiss ${name}`, `*I lean in to kiss ${name}.*`, "Read the moment", kissPrior(r, s, sess, who).welcome, true, sess.closing);
  }
  if (!sess.closing)
    for (const item of giftable(r, s).slice(0, 6)) {
      const label = itemName(r, s, item);
      special(`gift:${item}`, `Give ${label}`, `*I give ${name} my ${label}.*`, "A gift they may or may not like", null, false, false);
    }
  if (sess.mood < 0 || relPct(r, s, who, r.dating.fear) >= 20 || st < 0) {
    special("apologize", "Apologise", `*I apologise to ${name}.*`, "Smooth things over", null);
  }
  if (sess.kind === "outing" && !sess.closing)
    special("goodbye", "Call it a night", `*I suggest we call it a night.*`, "End the date early", null);
  else
    special("goodbye", sess.closing ? "Say goodnight" : "Say goodbye", sess.closing ? `*I say goodnight to ${name}.*` : `*I say goodbye to ${name}.*`, sess.kind === "outing" ? "End the date" : "End the conversation", null);
  return out;
}
function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1;i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
function offerFor(v, beat, seed, used = {}) {
  const mixed = shuffle(v.activities, seededRng(`${seed}:offer:${v.id}:${beat}`));
  const fresh = mixed.filter((a) => !used[`act:${a.id}`]);
  return [...fresh, ...mixed.filter((a) => used[`act:${a.id}`])].slice(0, 3).map((a) => a.id);
}
function startTalk(t, who) {
  const { r } = t;
  if (!t.s.people[who] || !canTalkTo(r, t.s, who))
    return null;
  if (t.s.date)
    t.push({ t: "dt_end", src: "action" });
  learnAge(t, who);
  learnTastes(t, who, Object.values(r.dating.topics).map((tp) => ({ key: tp.id, about: `talking about ${tp.label.toLowerCase()}${tp.desc ? ` (${tp.desc.toLowerCase()})` : ""} with {{user}}`, extra: [tp.category] })));
  const love = relPct(r, t.s, who, r.dating.love);
  const fear = relPct(r, t.s, who, r.dating.fear);
  const session = {
    who,
    kind: "talk",
    at: t.s.location,
    venue: null,
    beat: 0,
    beats: 0,
    fatigue: 0,
    mood: clampMood((love - fear) / 40),
    combo: 0,
    enjoy: 0,
    used: {},
    last: null,
    offer: [],
    closing: false,
    started: t.s.minutes
  };
  t.push({ t: "dt_start", session, src: "action" });
  const name = personName(r, t.s, who);
  t.announce(`{{user}} starts a conversation with ${name}. ${name} sees {{user}} as ${articled(stageLabel(r, t.s, who).toLowerCase())}${t.s.dating.partners[who] ? " (they're together)" : ""}; right now they seem ${moodOf(session.mood).label.toLowerCase()}. Let ${name} respond in character.`);
  t.time(Math.max(1, Math.round(r.dating.minutesPerTopic / 2)), "action");
  return `Talk with ${name}`;
}
function endOuting(t, who, early) {
  const { r } = t;
  const sess = t.s.date;
  const enjoy = Math.max(0, sess.enjoy - (early ? 10 : 0));
  const name = personName(r, t.s, who);
  const tier = enjoy >= 80 ? ["wonderful", 10] : enjoy >= 60 ? ["good", 6] : enjoy >= 40 ? ["okay", 2] : ["awkward", -3];
  watchStage(t, who, () => relMove(t, who, tier[1], tier[1] < 0 ? 1 : -1));
  t.push({ t: "dt_dated", who, enjoy, src: "action" });
  t.announce(`${early ? "The date ends early. " : "The date is winding down. "}Overall it was ${tier[0]} for ${name} (${Math.round(enjoy)}% enjoyed).${!early && romanceOk(r, t.s, who) && enjoy >= 60 ? " There may be a moment at the end, if {{user}} takes it." : ""}`);
}
function nextBeat(t, who) {
  const { r } = t;
  const sess = t.s.date;
  if (!sess || sess.kind !== "outing")
    return;
  const v = r.dating.venues[sess.venue ?? ""];
  const beat = sess.beat + 1;
  t.time(r.dating.minutesPerBeat, "action");
  const rng = seededRng(`${t.seed}:venue_event:${beat}`);
  if (v?.events.length && beat < sess.beats && rng() < 0.3) {
    const total = v.events.reduce((a, e) => a + e.weight, 0);
    let x = rng() * total;
    const e = v.events.find((ev) => (x -= ev.weight) <= 0) ?? v.events[0];
    t.announce(`Meanwhile: ${e.text.replace(/\{\{target\}\}|\{target\}/gi, personName(r, t.s, who))}`);
    if (e.enjoy)
      t.push({ t: "dt_patch", patch: { enjoy: Math.max(0, Math.min(100, (t.s.date?.enjoy ?? 50) + e.enjoy)) }, src: "action" });
  }
  if (beat >= sess.beats) {
    t.push({ t: "dt_patch", patch: { beat, closing: true, offer: [] }, src: "action" });
    endOuting(t, who, false);
  } else if (v) {
    t.push({ t: "dt_patch", patch: { beat, offer: offerFor(v, beat, t.seed, t.s.date?.used) }, src: "action" });
  }
}
function resolveDate(t, intent) {
  const { r } = t;
  const id = intent.actionId.slice(DATE_PREFIX.length);
  if (id.startsWith("talk@")) {
    const label = startTalk(t, id.slice(5));
    return label ? { label, tags: [] } : null;
  }
  const sess = activeSession(r, t.s);
  if (!sess) {
    if (t.s.date)
      t.push({ t: "dt_end", src: "action" });
    return null;
  }
  const who = sess.who;
  const name = personName(r, t.s, who);
  const minutes = sess.kind === "outing" ? 0 : r.dating.minutesPerTopic;
  const romantic = { tags: ["romance"] };
  if (id === "say")
    return saidLine(t, sess, who, name);
  if (id.startsWith("topic:")) {
    const tp = r.dating.topics[id.slice(6)];
    if (!tp || sess.closing || !topicAvailable(r, t.s, who, tp, new Set))
      return null;
    const p = reactionPrior(r, t.s, sess, who, topicPref(r, t.s, who, tp), { stage: tp.stage, repeat: sess.used[tp.id] ?? 0 });
    const reaction = t.roll(`date:topic:${tp.id}`, `How does ${name} take it?`, p, REACTION_LABEL, "weights");
    t.announce(`{{user}} brings up ${tp.label.toLowerCase()}.`);
    const going = react(t, who, reaction, { key: tp.id, label: tp.label, scale: tp.weight, seen: tp.id });
    if (going && sess.kind === "outing")
      nextBeat(t, who);
    else
      t.time(minutes, "action");
    return { label: `\uD83D\uDCAC ${tp.label}`, tags: tp.romantic ? romantic.tags : [] };
  }
  if (id.startsWith("act:")) {
    const v = r.dating.venues[sess.venue ?? ""];
    const a = v?.activities.find((x) => x.id === id.slice(4));
    if (!v || !a || sess.kind !== "outing" || sess.closing || !sess.offer.includes(a.id))
      return null;
    if (a.romantic && !romanceOk(r, t.s, who))
      return null;
    const p = reactionPrior(r, t.s, sess, who, activityPref(r, t.s, who, a), { repeat: sess.used[`act:${a.id}`] ?? 0 });
    const reaction = t.roll(`date:act:${a.id}`, `How does ${name} enjoy it?`, p, REACTION_LABEL, "weights");
    t.announce(`On the date, {{user}} and ${name}: ${a.label.charAt(0).toLowerCase()}${a.label.slice(1)}.`);
    if (react(t, who, reaction, { key: `act:${a.id}`, label: a.label, scale: 1, seen: `act:${a.id}`, activity: true }))
      nextBeat(t, who);
    return { label: `✨ ${a.label}`, tags: a.romantic ? romantic.tags : [] };
  }
  if (id === "ask_out") {
    if (sess.kind !== "talk" || stageIndex(r, t.s, who) < 1)
      return null;
    const prior = askOutPrior(r, t.s, sess, who);
    const model = t.modelOdds({ id: "date:ask_out", ask: `{{user}} asks ${name} out. Would ${name} agree to go somewhere together right now?`, options: [
      { id: "yes", desc: "Says yes", weight: prior.yes, effect: emptyEffect() },
      { id: "later", desc: "Not now, maybe another time", weight: prior.later, effect: emptyEffect() },
      { id: "no", desc: "Turns them down", weight: prior.no, effect: emptyEffect() }
    ] });
    const pick = t.roll("date:ask_out", `Will ${name} go out with {{user}}?`, combine(prior, model), { yes: "Says yes", later: "Maybe another time", no: "Turns them down" }, model ? "model" : "weights");
    t.push({ t: "dt_patch", patch: { used: { ...sess.used, ask_out: (sess.used.ask_out ?? 0) + 1 } }, src: "action" });
    if (pick === "yes") {
      watchStage(t, who, () => relMove(t, who, 2, 0));
      t.push({ t: "dt_patch", patch: { kind: "plan" }, src: "action" });
      t.announce(`${name} says yes. They're deciding where to go.`);
    } else if (pick === "later") {
      t.announce(`${name} isn't saying no, but not now — maybe another time.`);
    } else {
      watchStage(t, who, () => relMove(t, who, -2, 0));
      t.push({ t: "dt_patch", patch: { mood: clampMood(sess.mood - 0.5) }, src: "action" });
      t.announce(`${name} turns {{user}} down.`);
    }
    t.time(minutes, "action");
    return { label: "Asked them out", tags: [] };
  }
  if (id === "later") {
    if (sess.kind !== "plan")
      return null;
    t.push({ t: "dt_patch", patch: { kind: "talk" }, src: "action" });
    t.announce(`They decide to go out another time and keep talking for now.`);
    return { label: "Another time", tags: [] };
  }
  if (id.startsWith("venue:")) {
    const v = r.dating.venues[id.slice(6)];
    if (!v || sess.kind !== "plan" || !venueOk(r, t.s, who, v))
      return null;
    if (v.cost && r.hud.money)
      t.push({ t: "stat", id: r.hud.money, d: -v.cost, src: "action" });
    if (v.at && r.locations[v.at] && t.s.location !== v.at)
      t.push({ t: "move", to: v.at, src: "action" });
    learnTastes(t, who, venueTags(v).map((tag) => ({ key: `tag:${tag}`, about: `a date activity involving ${tag.replace(/_/g, " ")}` })));
    t.push({ t: "dt_patch", patch: { kind: "outing", venue: v.id, beat: 0, beats: r.dating.beats, enjoy: 50, fatigue: Math.max(0, sess.fatigue - 30), closing: false, offer: offerFor(v, 0, t.seed), at: null }, src: "action" });
    t.time(20, "action");
    t.announce(`The date begins: ${v.name}${v.desc ? ` — ${v.desc}` : ""} ${name} seems ${moodOf(sess.mood).label.toLowerCase()}.`);
    return { label: `\uD83D\uDCCD ${v.name}`, tags: v.romantic ? romantic.tags : [] };
  }
  if (id === "confess") {
    const partnerStage = r.dating.stages.findIndex((x) => x.partner);
    if (sess.kind !== "talk" || !romanceOk(r, t.s, who) || t.s.dating.partners[who] || partnerStage < 1 || stageIndex(r, t.s, who) < partnerStage - 1)
      return null;
    const prior = confessPrior(r, t.s, sess, who);
    const model = t.modelOdds({ id: "date:confess", ask: `{{user}} confesses romantic feelings to ${name}. How does ${name} respond, given everything between them?`, options: [
      { id: "returns", desc: "Feels the same way", weight: prior.returns, effect: emptyEffect() },
      { id: "unsure", desc: "Isn't sure yet", weight: prior.unsure, effect: emptyEffect() },
      { id: "rejects", desc: "Doesn't feel the same", weight: prior.rejects, effect: emptyEffect() }
    ] });
    const pick = t.roll("date:confess", `Does ${name} feel the same?`, combine(prior, model), { returns: "Feels the same way", unsure: "Isn't sure yet", rejects: "Doesn't feel the same" }, model ? "model" : "weights");
    t.push({ t: "dt_patch", patch: { used: { ...sess.used, confess: (sess.used.confess ?? 0) + 1 } }, src: "action" });
    watchStage(t, who, () => {
      if (pick === "returns") {
        t.push({ t: "dt_partner", who, on: true, src: "action" });
        relMove(t, who, 10, -3);
        t.push({ t: "dt_patch", patch: { mood: 2 }, src: "action" });
      } else if (pick === "unsure") {
        relMove(t, who, -1, 0);
        t.push({ t: "dt_patch", patch: { mood: clampMood(sess.mood - 0.5) }, src: "action" });
      } else {
        relMove(t, who, -6, 3);
        t.push({ t: "dt_patch", patch: { mood: clampMood(sess.mood - 1.5) }, src: "action" });
      }
    });
    t.announce(pick === "returns" ? `${name} feels the same way. They're together now.` : pick === "unsure" ? `${name} isn't sure yet and needs time.` : `${name} doesn't feel the same way; it's awkward.`);
    t.time(minutes, "action");
    return { label: "\uD83D\uDC97 Confessed", tags: romantic.tags };
  }
  if (id === "kiss") {
    if (!romanceOk(r, t.s, who) || stageIndex(r, t.s, who) < 2)
      return null;
    const prior = kissPrior(r, t.s, sess, who);
    const model = t.modelOdds({ id: "date:kiss", ask: `{{user}} leans in to kiss ${name}. How does ${name} respond, given the moment and everything between them?`, options: [
      { id: "welcome", desc: "Kisses back", weight: prior.welcome, effect: emptyEffect() },
      { id: "hesitant", desc: "Hesitates — an awkward almost", weight: prior.hesitant, effect: emptyEffect() },
      { id: "refuse", desc: "Pulls away", weight: prior.refuse, effect: emptyEffect() }
    ] });
    const pick = t.roll("date:kiss", `Does ${name} want the kiss?`, combine(prior, model), { welcome: "Kisses back", hesitant: "Hesitates", refuse: "Pulls away" }, model ? "model" : "weights");
    t.push({ t: "dt_patch", patch: { used: { ...sess.used, kiss: (sess.used.kiss ?? 0) + 1 } }, src: "action" });
    watchStage(t, who, () => {
      if (pick === "welcome")
        relMove(t, who, 8, -1);
      else if (pick === "hesitant")
        relMove(t, who, 1, 0);
      else {
        relMove(t, who, -3, 2);
        t.push({ t: "dt_patch", patch: { mood: clampMood(sess.mood - 1) }, src: "action" });
      }
    });
    t.announce(pick === "welcome" ? `${name} kisses {{user}} back.` : pick === "hesitant" ? `${name} hesitates; the moment passes, a little awkwardly.` : `${name} pulls away.`);
    if (sess.closing) {
      t.announce(`The date ends there.`);
      t.push({ t: "dt_end", src: "action" });
    } else
      t.time(minutes, "action");
    return { label: "\uD83D\uDC8B Kiss", tags: romantic.tags };
  }
  if (id.startsWith("gift:")) {
    const item = id.slice(5);
    if (!(t.s.items[item] > 0) || sess.closing)
      return null;
    const label = itemName(r, t.s, item);
    learnTastes(t, who, [{ key: `item:${item}`, about: `receiving ${label} as a gift from {{user}}`, extra: r.items[item]?.tags.map((x) => `tag:${x}`) }]);
    const p = reactionPrior(r, t.s, sess, who, prefOf(r, t.s, who, `item:${item}`), { repeat: sess.used.gift ?? 0 });
    const reaction = t.roll(`date:gift:${item}`, `How does ${name} like the gift?`, p, REACTION_LABEL, "weights");
    t.push({ t: "item", id: item, d: -1, src: "action" });
    t.announce(`{{user}} gives ${name} ${label}.`);
    const going = react(t, who, reaction, { key: "gift", label: `Gift: ${label}`, scale: 1.5, seen: `item:${item}` });
    if (going && sess.kind === "outing")
      nextBeat(t, who);
    else
      t.time(minutes, "action");
    return { label: `\uD83C\uDF81 ${label}`, tags: [] };
  }
  if (id === "apologize") {
    const times = sess.used.apologize ?? 0;
    watchStage(t, who, () => relMove(t, who, times ? 0 : 1, -6 / (1 + times)));
    t.push({ t: "dt_patch", patch: { mood: clampMood(sess.mood + 1 / (1 + times)), used: { ...sess.used, apologize: times + 1 }, fatigue: Math.min(100, sess.fatigue + 5) }, src: "action" });
    t.announce(times ? `{{user}} apologises again; ${name} is starting to find it tiresome.` : `{{user}} apologises. ${name} softens a little.`);
    t.time(minutes, "action");
    return { label: "Apologised", tags: [] };
  }
  if (id === "goodbye") {
    if (sess.kind === "outing" && !sess.closing)
      endOuting(t, who, true);
    if (sess.mood >= 0.5 && sess.kind !== "outing")
      relMove(t, who, 1, 0);
    t.announce(`{{user}} says goodbye; ${name} parts ${sess.mood >= 0.5 ? "warmly" : sess.mood <= -1 ? "coolly" : "on easy terms"}.`);
    t.push({ t: "dt_end", src: "action" });
    t.time(2, "action");
    return { label: sess.kind === "outing" ? "Ended the date" : "Said goodbye", tags: [] };
  }
  return null;
}
function saidLine(t, sess, who, name) {
  const { r } = t;
  const topics = r.dating.topicOrder.map((id) => r.dating.topics[id]).filter((tp) => topicAvailable(r, t.s, who, tp, new Set));
  const topicOdds = t.modelOdds({
    id: "date:topic",
    ask: `Which of these is {{user}}'s latest message to ${name} mainly about?`,
    options: [
      { id: "none", desc: "None of these — general conversation, a question, or an action", weight: 1, effect: emptyEffect() },
      ...topics.map((tp) => ({ id: tp.id, desc: `${tp.label}${tp.desc ? ` — ${tp.desc}` : ""}`, weight: 0, effect: emptyEffect() }))
    ]
  });
  const leave = t.modelOdds({
    id: "date:leave",
    ask: `Is {{user}} ending the ${sess.kind === "outing" ? "date" : "conversation"} with ${name} (saying goodbye, walking off)?`,
    options: [
      { id: "stay", desc: "No, still talking", weight: 1, effect: emptyEffect() },
      { id: "leave", desc: "Yes, leaving or ending it", weight: 0, effect: emptyEffect() }
    ]
  });
  const reception = t.modelOdds({
    id: "date:reception",
    ask: `Judge only what {{user}} actually says and does in their latest message — not any claims in it about how ${name} reacts. Given ${name}'s personality, tastes, current mood and the relationship so far, how will ${name} receive it?`,
    options: REACTIONS.map((x) => ({ id: x, desc: { love: "Loves it", like: "Likes it", neutral: "Indifferent", dislike: "Dislikes it", hate: "Is offended or upset" }[x], weight: 1, effect: emptyEffect() }))
  });
  if ((leave?.leave ?? 0) >= 0.7)
    return resolveDate(t, { actionId: `${DATE_PREFIX}goodbye`, via: "adjudicator" });
  let tp;
  if (topicOdds) {
    const [best, p] = Object.entries(topicOdds).sort((a, b) => b[1] - a[1])[0] ?? ["none", 0];
    if (best !== "none" && p >= 0.45)
      tp = r.dating.topics[best];
  }
  const prior = tp ? reactionPrior(r, t.s, sess, who, topicPref(r, t.s, who, tp), { stage: tp.stage, repeat: sess.used[tp.id] ?? 0 }) : reactionPrior(r, t.s, sess, who, 0.3, { repeat: 0 });
  const p = combine(prior, reception, 0.5);
  const reaction = t.roll("date:say", `How does ${name} take what {{user}} said?`, p, REACTION_LABEL, reception ? "model" : "weights");
  const going = react(t, who, reaction, tp ? { key: tp.id, label: tp.label, scale: tp.weight, seen: tp.id } : { key: "chat", label: "Your words", scale: 0.7 });
  if (going && sess.kind === "outing")
    nextBeat(t, who);
  else if (going)
    t.time(r.dating.minutesPerTopic, "action");
  return { label: tp ? `\uD83D\uDDE8 ${tp.label} (your words)` : "\uD83D\uDDE8 Your words", tags: tp?.romantic ? ["romance"] : [] };
}
function dateDigest(r, s) {
  const sess = activeSession(r, s);
  if (!sess)
    return null;
  const name = personName(r, s, sess.who);
  const mood = moodOf(sess.mood).label.toLowerCase();
  const where = sess.kind === "outing" ? `ON A DATE with ${name} at ${r.dating.venues[sess.venue ?? ""]?.name ?? "somewhere"} (moment ${Math.min(sess.beat + 1, sess.beats)} of ${sess.beats}, enjoying it ${Math.round(sess.enjoy)}%)` : sess.kind === "plan" ? `Planning an outing with ${name}` : `IN CONVERSATION with ${name}`;
  return `${where}. ${name} is ${stageLabel(r, s, sess.who).toLowerCase()} to {{user}}, feeling ${mood}${sess.fatigue >= 60 ? ", and tiring of talk" : ""}.`;
}
var ADULT_KEY = "__adult", SEEDED, TASTE_DESC, clampMood = (m) => Math.max(-2, Math.min(2, Math.round(m * 2) / 2)), MOODS, LINE, articled = (w) => /^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`, LOVE, FEAR, MOOD, ENJOY;
var init_talk = __esm(() => {
  init_dice();
  init_expr();
  init_ruleset();
  init_state();
  init_world();
  init_content2();
  init_types2();
  SEEDED = [["love", 0.12], ["like", 0.28], ["neutral", 0.3], ["dislike", 0.2], ["hate", 0.1]];
  TASTE_DESC = {
    love: "Would love it",
    like: "Would enjoy it",
    neutral: "Wouldn't care either way",
    dislike: "Would rather not",
    hate: "Would hate it"
  };
  MOODS = [
    { at: -2, label: "Upset", face: "\uD83D\uDE20" },
    { at: -1, label: "Annoyed", face: "\uD83D\uDE12" },
    { at: 0, label: "Neutral", face: "\uD83D\uDE10" },
    { at: 1, label: "Happy", face: "\uD83D\uDE42" },
    { at: 2, label: "Delighted", face: "\uD83D\uDE0A" }
  ];
  LINE = {
    love: (n) => `${n} loves this — they light up, open up and want to keep going.`,
    like: (n) => `${n} enjoys this and engages warmly.`,
    neutral: (n) => `${n} is lukewarm about it — polite, but not really engaged.`,
    dislike: (n) => `${n} doesn't enjoy this; they get short, awkward, or steer away from it.`,
    hate: (n) => `${n} hates this; it annoys or upsets them, and it shows.`
  };
  LOVE = { love: 6, like: 3, neutral: 1, dislike: -3, hate: -6 };
  FEAR = { love: -1, like: -0.5, neutral: 0, dislike: 1, hate: 4 };
  MOOD = { love: 1, like: 0.5, neutral: 0, dislike: -1, hate: -2 };
  ENJOY = { love: 14, like: 7, neutral: 1, dislike: -8, hate: -15 };
});

// src/engine/work.ts
function amountOf(t, o) {
  return Math.max(0, Math.round(evalNumber(o.amount, t.env(), 0) * 100) / 100);
}
function creditorName(r, s, o) {
  return o.creditor ? personName(r, s, o.creditor) : "the creditor";
}
function obligationLife(t) {
  const { r } = t;
  for (const o of Object.values(r.obligations)) {
    for (let guard = 0;guard < 6; guard++) {
      const d = t.s.dues[o.id];
      if (!d)
        break;
      if (d.owed <= 0) {
        if (o.every <= 0 || t.s.minutes < d.due)
          break;
        t.push({ t: "due", id: o.id, due: d.due + o.every * 1440, owed: amountOf(t, o), src: "world", why: `${o.label}: a new period` });
        continue;
      }
      if (t.s.minutes < d.due + o.grace * 1440)
        break;
      const missed = d.missed + 1;
      const owed = d.owed + (o.every > 0 ? amountOf(t, o) : 0);
      t.push({ t: "due", id: o.id, due: d.due + (o.every > 0 ? o.every : 7) * 1440, owed, missed, src: "world", why: `${o.label} went unpaid` });
      const who = creditorName(r, t.s, o);
      const cur = r.hud.currency;
      t.push({ t: "news", text: `${o.label} is overdue — ${cur}${owed} owed (${missed} missed).`, src: "world" });
      if (o.late) {
        const spec = { ...o.late, ask: o.late.ask.replace(/\{creditor\}/g, who) };
        const model = t.modelOdds(spec);
        const prior = Object.fromEntries(spec.options.map((x) => [x.id, x.weight]));
        const p = model ? Object.fromEntries(Object.keys(prior).map((k) => [k, Math.pow(Math.max(prior[k], 0.000001), 0.5) * Math.max(model[k] ?? 0, 0.000001)])) : prior;
        const descs = Object.fromEntries(spec.options.map((x) => [x.id, x.desc.replace(/\{creditor\}/g, who)]));
        const pick = t.roll(`${spec.id}:${missed}`, spec.ask, p, descs, model ? "model" : "weights");
        const opt = spec.options.find((x) => x.id === pick);
        t.apply(opt.effect, "world");
        t.announce(`${o.label} is overdue (${cur}${owed} owed, ${missed} missed). ${who}'s response: ${descs[pick]}.`);
      } else {
        t.announce(`${o.label} is overdue: ${cur}${owed} owed, ${missed} missed.`);
      }
    }
  }
}
function payable(r, s, o) {
  const d = s.dues[o.id];
  if (!d || d.owed <= 0)
    return 0;
  if (o.at.length && !o.at.includes(s.location ?? ""))
    return 0;
  const cash = s.stats[o.payWith] ?? r.stats[o.payWith]?.start ?? 0;
  return Math.max(0, Math.min(d.owed, Math.floor(cash * 100) / 100));
}
function jobOpen(r, s, j) {
  if (j.at.length && !j.at.includes(s.location ?? ""))
    return false;
  return !j.when || evalBool(j.when, makeEnv(r, s), false);
}
function workMoves(r, s) {
  const out = [];
  const cur = r.hud.currency;
  if (s.job) {
    const j = r.jobs[s.job.id];
    const p = j?.patrons[s.job.patron];
    if (!j || !p)
      return [];
    const group = `${j.label} · customer ${s.job.n + 1} of ${j.customers}`;
    for (const [k, label] of Object.entries(j.styles))
      out.push({ id: `${JOB_PREFIX}style:${k}`, label, say: `*${label}.*`, group, desc: p.who });
    out.push({ id: `${JOB_PREFIX}quit`, label: "Walk out", say: "*I walk out on the shift.*", group, desc: "Leave now — no pay for the shift" });
    return out;
  }
  for (const o of Object.values(r.obligations)) {
    const amt = payable(r, s, o);
    if (amt <= 0)
      continue;
    const d = s.dues[o.id];
    const all = amt >= d.owed;
    out.push({
      id: `${PAY_PREFIX}${o.id}`,
      label: `Pay ${o.label.toLowerCase()} (${cur}${amt}${all ? "" : ` of ${cur}${d.owed}`})`,
      say: `*I pay ${cur}${amt} toward the ${o.label.toLowerCase()}.*`,
      group: "Bills",
      desc: d.missed ? `${d.missed} payment${d.missed === 1 ? "" : "s"} missed` : `Due ${r.clock.enabled ? formatClock(r, d.due).day : "soon"}`
    });
  }
  for (const j of Object.values(r.jobs))
    if (jobOpen(r, s, j)) {
      out.push({ id: `${JOB_PREFIX}start:${j.id}`, label: j.label, say: `*I start a shift: ${j.label.toLowerCase()}.*`, group: "Work", desc: `${j.customers} customers` });
    }
  return out;
}
function satisfaction(center) {
  const c = Math.max(-2.5, Math.min(2.5, center));
  const raw = Object.fromEntries(REACTIONS.map((x) => [x, Math.exp(-((REACTION_VALUE[x] - c) ** 2) / (2 * 0.9 ** 2))]));
  const sum = REACTIONS.reduce((a, x) => a + raw[x], 0);
  for (const x of REACTIONS)
    raw[x] /= sum;
  return raw;
}
function skillBonus(t, j) {
  if (!j.skill || !t.r.stats[j.skill])
    return 0;
  const def = t.r.stats[j.skill];
  const v = t.s.stats[j.skill] ?? def.start;
  return def.max > def.min ? (v - def.min) / (def.max - def.min) * 1.2 : 0;
}
function nextPatron(t, j, n) {
  return Math.floor(seededRng(`${t.seed}:patron:${j.id}:${n}`)() * j.patrons.length);
}
function serve(t, j, reaction, how) {
  const job = t.s.job;
  const p = j.patrons[job.patron];
  const tip = Math.round(evalNumber(j.tip, t.env(), 0) * TIP[reaction] * 100) / 100;
  const cur = t.r.hud.currency;
  t.announce(`Customer ${job.n + 1} of ${j.customers} — ${p.who}. {{user}}: ${how}. They ${MOOD2[reaction]}${tip > 0 ? ` and tip ${cur}${tip}` : tip < 0 ? `; ${cur}${-tip} is docked from {{user}}'s pay` : ""}. (What they wanted: ${j.styles[p.want] ?? p.want} — show it in how they act, don't state it.)`);
  const log = [...job.log, { who: p.who, result: REACTION_LABEL[reaction] }];
  t.time(j.minutes, "action");
  if (job.n + 1 >= j.customers) {
    const pay = Math.round(evalNumber(j.pay, t.env(), 0) * 100) / 100;
    const total = Math.max(0, pay + job.tips + tip);
    if (t.r.hud.money && total)
      t.push({ t: "stat", id: t.r.hud.money, d: total, src: "action", why: `${j.label}: pay ${cur}${pay} + tips ${cur}${Math.round((job.tips + tip) * 100) / 100}` });
    t.apply(j.gain, "action");
    t.push({ t: "job", job: null, src: "action" });
    const happy = log.filter((x) => x.result === REACTION_LABEL.love || x.result === REACTION_LABEL.like).length;
    t.announce(`The shift is over: ${happy} of ${j.customers} customers left happy; {{user}} takes home ${cur}${total}.`);
  } else {
    t.push({ t: "job", job: { ...job, n: job.n + 1, patron: nextPatron(t, j, job.n + 1), tips: job.tips + tip, log }, src: "action" });
  }
}
function resolveWork(t, intent) {
  const { r } = t;
  const id = intent.actionId;
  if (id.startsWith(PAY_PREFIX)) {
    const o = r.obligations[id.slice(PAY_PREFIX.length)];
    if (!o)
      return null;
    const amt = payable(r, t.s, o);
    if (amt <= 0)
      return null;
    const d = t.s.dues[o.id];
    t.push({ t: "stat", id: o.payWith, d: -amt, src: "action" });
    t.push({ t: "due", id: o.id, owed: d.owed - amt, src: "action" });
    const left = Math.round((d.owed - amt) * 100) / 100;
    t.announce(`{{user}} pays ${r.hud.currency}${amt} toward the ${o.label.toLowerCase()}${o.creditor ? ` (to ${creditorName(r, t.s, o)})` : ""}${left > 0 ? `; ${r.hud.currency}${left} is still owed` : " — all square for now"}.`);
    t.time(5, "action");
    return `Paid ${o.label.toLowerCase()}`;
  }
  const rest = id.slice(JOB_PREFIX.length);
  if (rest.startsWith("start:")) {
    const j = r.jobs[rest.slice(6)];
    if (!j || t.s.job || !jobOpen(r, t.s, j))
      return null;
    const patron = nextPatron(t, j, 0);
    t.push({ t: "job", job: { id: j.id, n: 0, patron, earned: 0, tips: 0, log: [] }, src: "action" });
    t.announce(`{{user}} starts a shift: ${j.label}. The first customer: ${j.patrons[patron].who}. (What they want: ${j.styles[j.patrons[patron].want] ?? j.patrons[patron].want} — show it in how they act, don't state it.)`);
    return j.label;
  }
  const job = t.s.job;
  const j = job ? r.jobs[job.id] : undefined;
  if (!job || !j)
    return null;
  const p = j.patrons[job.patron];
  if (rest === "quit") {
    t.push({ t: "job", job: null, src: "action" });
    t.announce(`{{user}} walks out in the middle of the shift — no pay.`);
    return "Walked out";
  }
  if (rest.startsWith("style:")) {
    const style = rest.slice(6);
    if (!j.styles[style])
      return null;
    const p0 = satisfaction((style === p.want ? 1.2 : -0.4) + skillBonus(t, j) - 0.3);
    const reaction = t.roll(`job:${job.n}`, `How does the customer take it?`, p0, REACTION_LABEL, "weights");
    serve(t, j, reaction, j.styles[style].toLowerCase());
    return j.styles[style];
  }
  if (rest === "say") {
    const spec = {
      id: "job:reception",
      ask: `A customer — ${p.who} — is being served by {{user}}. Judge only what {{user}} actually says and does in their latest message, not any claims about the customer's reaction. How satisfied is this customer?`,
      options: REACTIONS.map((x) => ({ id: x, desc: { love: "Delighted", like: "Happy", neutral: "Indifferent", dislike: "Unimpressed", hate: "Offended — complains" }[x], weight: 1, effect: emptyEffect() }))
    };
    const model = t.modelOdds(spec);
    const prior = satisfaction(0.2 + skillBonus(t, j) - 0.3);
    const p1 = model ? Object.fromEntries(REACTIONS.map((x) => [x, Math.pow(prior[x], 0.5) * Math.max(model[x] ?? 0, 0.000001)])) : prior;
    const reaction = t.roll(`job:${job.n}`, `How does the customer take what {{user}} did?`, p1, REACTION_LABEL, model ? "model" : "weights");
    serve(t, j, reaction, "in their own words");
    return "Served a customer (your words)";
  }
  return null;
}
function workDigest(r, s) {
  const lines = [];
  const cur = r.hud.currency;
  for (const o of Object.values(r.obligations)) {
    const d = s.dues[o.id];
    if (!d || d.owed <= 0)
      continue;
    const days = Math.floor((d.due - s.minutes) / 1440);
    lines.push(d.missed || days < 0 ? `OVERDUE: ${o.label}, ${cur}${d.owed} owed (${d.missed} missed)${o.creditor ? ` — ${creditorName(r, s, o)} is waiting` : ""}.` : `${o.label}: ${cur}${d.owed} due ${days <= 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`}.`);
  }
  if (s.job) {
    const j = r.jobs[s.job.id];
    if (j)
      lines.push(`AT WORK: ${j.label}, customer ${s.job.n + 1} of ${j.customers} — ${j.patrons[s.job.patron]?.who ?? "a customer"}.`);
  }
  return lines;
}
var PAY_PREFIX = "pay:", JOB_PREFIX = "job:", TIP, MOOD2;
var init_work = __esm(() => {
  init_dice();
  init_expr();
  init_ruleset();
  init_state();
  init_types2();
  TIP = { love: 1.5, like: 1, neutral: 0.4, dislike: 0, hate: -1 };
  MOOD2 = {
    love: "is delighted",
    like: "is happy with it",
    neutral: "is indifferent",
    dislike: "is unimpressed",
    hate: "is furious and complains"
  };
});

// src/engine/resolve.ts
function because(w, cause, fn) {
  const prev = w.cause;
  w.cause = prev ? `${prev} → ${cause}` : cause;
  try {
    return fn();
  } finally {
    w.cause = prev;
  }
}

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
  cause = null;
  push(e) {
    if (this.cause && !e.why)
      e = { ...e, why: this.cause };
    if (e.t === "stat" && e.d && e.set === undefined && e.src !== "manual" && e.src !== "start") {
      const m = statRate(this.r, this.s, e.id, e.d);
      if (m !== 1)
        e = { ...e, d: e.d * m };
    }
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
function canExplore(r, s) {
  const d = r.discovery;
  if (!d.enabled || !s.location || s.encounter || s.dungeon || s.job || s.date || s.ended)
    return false;
  if (s.discovered.length >= d.max)
    return false;
  return !d.at.length || d.at.includes(s.location) || s.discovered.includes(s.location);
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
function usableItems(r, s) {
  const out = [];
  for (const [id, n] of Object.entries(s.items)) {
    const a = r.items[id]?.use;
    if (!a || n <= 0)
      continue;
    out.push({ id: `${ITEM_PREFIX}${id}`, a, locked: isAvailable(r, s, a) ? null : a.whyNot ?? lockReason(r, s, a) });
  }
  return out;
}
function lockReason(r, s, a) {
  if (a.whyNot)
    return a.whyNot;
  const need = [...(a.when ?? "").matchAll(/has\(\s*'([^']+)'/g)].map((m) => m[1]).filter((id) => !(s.items[id] > 0));
  if (need.length && /\bor\b/.test(a.when ?? ""))
    return `Needs ${need.map((id) => itemName(r, s, id)).join(" or ")}`;
  if (need.length)
    return `Needs ${need.map((id) => itemName(r, s, id)).join(" and ")}`;
  return "Not possible right now";
}
function gearFor(r, s, a) {
  const stats = {};
  const notes = [];
  if (!a.check)
    return { stats, notes };
  const reads = new Set([...identifiers(a.check.add), ...identifiers(a.check.target)]);
  const add = (from, bonus) => {
    for (const [stat, b] of Object.entries(bonus)) {
      if (!b || !reads.has(stat))
        continue;
      stats[stat] = (stats[stat] ?? 0) + b;
      notes.push(`${from}: ${b > 0 ? "+" : ""}${b} ${r.stats[stat]?.label ?? stat}`);
    }
  };
  const worn = new Set(Object.values(s.worn));
  for (const [id, n] of Object.entries(s.items)) {
    const it = r.items[id];
    if (!it || n <= 0 || it.slot && !worn.has(id))
      continue;
    add(it.name, it.bonus);
  }
  const env = makeEnv(r, s);
  for (const id of Object.keys(s.perks)) {
    const p = r.perks[id];
    if (!p)
      continue;
    add(`★ ${p.name}`, p.bonus);
    for (const e of p.edges)
      if (!e.when || evalBool(e.when, env, false))
        add(`★ ${p.name}`, e.stats);
  }
  for (const id of Object.keys(s.conditions)) {
    const c = r.conditions[id];
    if (c && Object.keys(c.bonus).length)
      add(c.label, c.bonus);
  }
  return { stats, notes };
}
function statRate(r, s, stat, d) {
  let pct = 0;
  for (const id of Object.keys(s.perks)) {
    for (const rule of r.perks[id]?.rules ?? []) {
      if (rule.kind === "gains" && d > 0 || rule.kind === "losses" && d < 0) {
        if (rule.stat === stat)
          pct += rule.pct;
      }
    }
  }
  return Math.max(0, 1 + pct);
}
function knowsAbility(r, s, id) {
  const ab = r.abilities[id];
  if (!ab)
    return false;
  if (ab.known === true || s.learned?.[id])
    return true;
  if (Object.keys(s.perks).some((p) => r.perks[p]?.abilities.includes(id)))
    return true;
  return typeof ab.known === "string" && evalBool(ab.known, makeEnv(r, s), false);
}
function abilityStatus(r, s, id) {
  const ab = r.abilities[id];
  const known = knowsAbility(r, s, id);
  if (!ab || !known)
    return { id, known, left: null, here: false, locked: "Not learned" };
  const used = usesOf(s, `${ABILITY_PREFIX}${id}`);
  const lefts = [];
  if (ab.perDay)
    lefts.push(ab.perDay - used.today);
  if (ab.perEncounter && s.encounter)
    lefts.push(ab.perEncounter - used.here);
  const left = lefts.length ? Math.max(0, Math.min(...lefts)) : null;
  const here = ab.where === "any" || ab.where === "encounter" === !!s.encounter;
  let locked = null;
  if (left === 0)
    locked = ab.perEncounter && s.encounter && ab.perEncounter - used.here <= 0 ? "Used up for this encounter" : "Used up for today";
  else if (!isAvailable(r, s, ab.action))
    locked = ab.action.whyNot ?? lockReason(r, s, ab.action);
  else {
    const env = makeEnv(r, s);
    for (const [stat, d] of Object.entries(ab.action.cost.stats)) {
      const v = evalNumber(d, env, 0);
      if (v < 0 && (s.stats[stat] ?? r.stats[stat]?.start ?? 0) < -v) {
        locked = `Needs ${-v} ${r.stats[stat]?.label ?? stat}`;
        break;
      }
    }
  }
  return { id, known, left, here, locked };
}
function usableAbilities(r, s) {
  const out = [];
  for (const ab of Object.values(r.abilities)) {
    const status = abilityStatus(r, s, ab.id);
    if (status.known && status.here)
      out.push({ id: `${ABILITY_PREFIX}${ab.id}`, a: ab.action, status });
  }
  return out;
}
function mainMeter(r, s) {
  const enc = s.encounter ? r.encounters[s.encounter.id] : undefined;
  if (!enc)
    return null;
  const t = thresholds(enc).find((x) => x.foe && !isLoss(enc, x.outcome));
  return t ? { stat: t.stat, down: t.op.startsWith("<") } : null;
}
function perkRuleFor(r, s, a, kind) {
  const used = new Set(checkStats(r, a));
  for (const id of Object.keys(s.perks)) {
    const p = r.perks[id];
    for (const rule of p?.rules ?? []) {
      if (rule.kind !== kind)
        continue;
      const fits = !rule.stats.length && !rule.tags.length || rule.stats.some((x) => used.has(x)) || rule.tags.some((t) => a.tags.includes(t));
      if (!fits)
        continue;
      if (rule.perDay && usesOf(s, `perk:${id}:${kind}`).today >= rule.perDay)
        continue;
      return { perk: id, name: p.name };
    }
  }
  return null;
}
function findAction(r, s, actionId) {
  const [base, target] = actionId.split(TARGET_SEP);
  if (base.startsWith(ITEM_PREFIX)) {
    const a = r.items[base.slice(ITEM_PREFIX.length)]?.use;
    return a ? { a, ...target ? { target } : {} } : null;
  }
  if (base.startsWith(ABILITY_PREFIX)) {
    const id = base.slice(ABILITY_PREFIX.length);
    const st = abilityStatus(r, s, id);
    const a = r.abilities[id]?.action;
    return a && st.known && st.here && !st.locked ? { a, ...target ? { target } : {} } : null;
  }
  if (base.startsWith(IMPROV)) {
    const a = improvAction(r, s, base);
    return a ? { a } : null;
  }
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
  const gear = gearFor(r, s, a).stats;
  const eff = Object.keys(gear).length ? { ...s, stats: Object.fromEntries(Object.entries(s.stats).map(([k, v]) => [k, v + (gear[k] ?? 0)])) } : s;
  const env = makeEnv(r, eff, paramValues(a, params, who));
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
    const foeStats = r.encounters[w.s.encounter.id]?.foe.stats;
    for (const [stat, d] of Object.entries(e.foe)) {
      if (foeStats?.length && !foeStats.some((x) => x.id === stat))
        continue;
      const v = evalNumber(d, w.env(extra), 0);
      if (v !== 0)
        w.push({ t: "foe", stat, d: v, src });
    }
    if (e.harm !== undefined) {
      const v = evalNumber(e.harm, w.env(extra), 0);
      const m = mainMeter(r, w.s);
      if (v && m)
        w.push({ t: "foe", stat: m.stat, d: m.down ? -v : v, src });
      else if (v && w.s.encounter.momentum !== undefined)
        w.push({ t: "swing", d: v, src });
    }
    if (e.end)
      w.pendingEnd = e.end;
  }
  for (const id of e.learn)
    if (r.abilities[id] && !w.s.learned?.[id])
      w.push({ t: "learn", id, src });
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
  for (const [part, traits] of Object.entries(e.body))
    for (const [trait, v] of Object.entries(traits)) {
      if ((w.s.body[part]?.[trait] ?? null) !== v)
        w.push({ t: "body", part, trait, v, src });
    }
  for (const [id, n] of Object.entries(e.transform)) {
    const t = r.body.transforms[id];
    if (!t)
      continue;
    const steps = Math.round(evalNumber(n, w.env(extra), 0));
    for (let i = 0;i < steps; i++) {
      const stage = w.s.tf[id] ?? 0;
      if (stage >= t.stages.length)
        break;
      const chance = Math.max(0, Math.min(100, evalNumber(t.chance, w.env(extra), 100)));
      if (seededRng(`${w.seed}:tf:${id}:${stage}:${w.s.turn}`)() * 100 >= chance) {
        announce(w, `${t.label}: nothing changes this time.`);
        break;
      }
      w.push({ t: "tf", id, stage: stage + 1, src });
      for (const [part, traits] of Object.entries(t.stages[stage].set))
        for (const [trait, v] of Object.entries(traits)) {
          if ((w.s.body[part]?.[trait] ?? null) !== v)
            w.push({ t: "body", part, trait, v, src });
        }
      announce(w, t.stages[stage].text ?? `${t.label}: {{user}}'s body changes (stage ${stage + 1} of ${t.stages.length}).`);
    }
  }
  if (e.conceive)
    conceive(w, e.conceive, extra, src);
  for (const [id, d] of Object.entries(e.arc)) {
    const front = r.companions[id]?.arc;
    if (!front)
      continue;
    const v = evalNumber(d, w.env(extra), 0);
    if (v !== 0)
      w.push({ t: "clock", id: front, d: v, src });
  }
  for (const [a, m] of Object.entries(e.bond))
    for (const [b, d] of Object.entries(m)) {
      const v = evalNumber(d, w.env(extra), 0);
      if (v !== 0 && a !== b)
        w.push({ t: "bond", a, b, d: v, src });
    }
  if (e.momentum !== undefined && w.s.encounter?.momentum !== undefined) {
    const v = evalNumber(e.momentum, w.env(extra), 0);
    if (v !== 0)
      w.push({ t: "swing", d: v, src });
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
      because(w, `World: ${f.label} reached stage ${n + 1}`, () => {
        w.push({ t: "stage", id: f.id, n, src: "world" });
        effectToEvents(w, st.effects, "world", {});
      });
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
    because(w, `Random event: ${e.label}`, () => effectToEvents(w, e.effects, "world", {}));
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
function lookOf(r, s) {
  const exposed = exposedSlots(r, s);
  const reveal = revealOf(r, s);
  const parts = [
    exposed.length ? `exposed: ${exposed.join(", ")}` : null,
    reveal > 0 ? `revealing clothes (${reveal})` : null
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : "dressed ordinarily";
}
function beingSeen(w) {
  const r = w.r;
  const ob = r.observers;
  if (!ob.enabled || !w.s.location || !evalBool(ob.when, w.env(), false))
    return;
  const look = lookOf(r, w.s);
  const here = new Set(presentPeople(r, w.s, makeEnv(r, w.s)));
  const watchers = Object.keys(w.s.people).filter((id) => here.has(id) || r.people[id] && !r.people[id].schedule.length);
  const exposure = exposedSlots(r, w.s).length + revealOf(r, w.s) / 3;
  const prior = {
    unnoticed: Math.max(0.5, 3 - exposure),
    glance: 2,
    interested: 0.6 + exposure * 0.4,
    disapproving: 0.5 + exposure * 0.3,
    predatory: 0.1 + exposure * 0.1
  };
  const where = w.s.locationName ?? w.s.location;
  const lines = [];
  for (const who of watchers) {
    if (!knownAdult(w, who))
      continue;
    const name = personName(r, w.s, who);
    const spec = {
      id: `seen:${who}`,
      ask: `${name} can see {{user}} (${look}). Given who ${name} is, and the moment, how do they react?`,
      options: SEEN_REACTIONS.map((x) => ({ id: x, desc: SEEN_DESC[x], weight: prior[x], effect: ob.reactions[x] ?? emptyEffect() }))
    };
    const model = w.odds[spec.id];
    if (!model && !w.needs.some((n) => n.id === spec.id))
      w.needs.push(spec);
    const p = normalize(model ? Object.fromEntries(SEEN_REACTIONS.map((x) => [x, Math.sqrt(prior[x]) * Math.max(model[x] ?? 0, 0.000001)])) : prior, SEEN_REACTIONS);
    const picked = sample(p, seededRng(`${w.seed}:seen:${who}`));
    w.decisions.push({ id: spec.id, ask: `How does ${name} react to how {{user}} looks?`, picked, pickedDesc: SEEN_DESC[picked], p, source: model ? "model" : "weights", descs: SEEN_DESC });
    if (picked === "unnoticed")
      continue;
    w.push({ t: "seen", who, what: look, where, src: "world", why: `${name} saw {{user}} (${look})` });
    const eff = ob.reactions[picked];
    if (eff)
      because(w, `${name}: ${SEEN_DESC[picked].toLowerCase()}`, () => effectToEvents(w, eff, "world", { target: who }));
    lines.push(`${name}: ${SEEN_DESC[picked].toLowerCase()}`);
  }
  if (ob.crowd > 0 && !isIndoors(r, w.s)) {
    const rng = seededRng(`${w.seed}:crowd:${w.s.turn}`);
    const crowd = Array.from({ length: ob.crowd }, () => {
      const q = normalize(prior, SEEN_REACTIONS);
      return sample(q, rng);
    }).filter((x) => x !== "unnoticed");
    if (crowd.length)
      lines.push(`passers-by: ${crowd.map((x) => SEEN_DESC[x].toLowerCase()).join("; ")}`);
  }
  if (lines.length)
    w.hints.push(`How people react to {{user}} (${look}) — show it, individually: ${lines.join(" · ")}.`);
}
function rumours(w, before) {
  const r = w.r;
  if (!r.observers.enabled || !r.observers.rumours)
    return;
  if (Math.floor(w.s.minutes / 1440) <= Math.floor(before.minutes / 1440))
    return;
  for (const [who, rec] of Object.entries(before.seen)) {
    if (rec.heard)
      continue;
    for (const [other, v] of Object.entries(w.s.bonds[who] ?? {})) {
      if (v < 25 || w.s.seen[other] || !w.s.people[other])
        continue;
      w.push({ t: "seen", who: other, what: rec.what, where: rec.where, heard: true, src: "world", why: `${personName(r, w.s, who)} told ${personName(r, w.s, other)}` });
      announce(w, `Word gets around: ${personName(r, w.s, who)} told ${personName(r, w.s, other)} about seeing {{user}} (${rec.what}) at ${rec.where}.`);
    }
  }
}
function knownAdult(w, who) {
  if (who === "player")
    return w.r.player.age === undefined || w.r.player.age >= 18;
  if (w.s.kin[who])
    return false;
  const age = w.r.people[who]?.age;
  if (age !== undefined)
    return age >= 18;
  const known = w.s.dating.prefs[who]?.[ADULT_KEY];
  if (known !== undefined)
    return known > 0;
  const name = personName(w.r, w.s, who);
  const id = `date:adult:${who}`;
  const model = w.odds[id];
  if (!model) {
    if (!w.needs.some((n) => n.id === id))
      w.needs.push({ id, ask: `Is ${name} an adult (18 or older), going by the story and the character card?`, options: [
        { id: "adult", desc: "Clearly an adult", weight: 1, effect: emptyEffect() },
        { id: "minor", desc: "Under 18", weight: 1, effect: emptyEffect() },
        { id: "unclear", desc: "Can't tell", weight: 1, effect: emptyEffect() }
      ] });
    return false;
  }
  const adult = (model.adult ?? 0) >= 0.8;
  w.push({ t: "dt_pref", who, key: ADULT_KEY, v: adult ? 1 : -1, src: "action" });
  return adult;
}
function conceive(w, c, extra, src) {
  const r = w.r;
  if (!r.lineage.enabled || w.s.pregnancy)
    return;
  const partner = c.with === "target" ? typeof extra.target === "string" ? extra.target : "" : c.with;
  if (!partner || !w.s.people[partner])
    return;
  const carrier = c.carrier === "partner" ? partner : c.carrier;
  if (!knownAdult(w, "player") || !knownAdult(w, partner))
    return;
  const chance = Math.max(0, Math.min(100, evalNumber(c.chance, w.env(extra), 100)));
  if (seededRng(`${w.seed}:conceive:${w.s.turn}`)() * 100 >= chance)
    return;
  w.push({ t: "conceive", carrier, with: partner, src });
}
function lineageLife(w) {
  const r = w.r;
  if (!r.lineage.enabled)
    return;
  const p = w.s.pregnancy;
  if (p) {
    const weeks = (w.s.minutes - p.since) / 1440 / 7;
    r.lineage.stages.forEach((st, i) => {
      if (i + 1 <= (w.s.pregnancy?.told ?? 0) || weeks < st.week)
        return;
      w.push({ t: "preg_stage", n: i + 1, src: "world" });
      because(w, `Pregnancy, week ${st.week}`, () => effectToEvents(w, st.effects, "world", {}));
      announce(w, st.text.replace(/\{carrier\}/g, p.carrier === "player" ? "{{user}}" : personName(r, w.s, p.carrier)));
    });
    if (weeks >= r.lineage.weeks) {
      const n = Object.keys(w.s.kin).length + 1;
      const rng = seededRng(`${w.seed}:birth:${n}`);
      const taken = new Set(Object.values(w.s.kin).map((k) => k.name));
      const names = r.lineage.names.filter((x) => !taken.has(x));
      const name = names.length ? names[Math.floor(rng() * names.length)] : `Child ${n}`;
      const sex = rng() < 0.5 ? "girl" : "boy";
      const body = Object.fromEntries(r.lineage.inherit.filter((part) => w.s.body[part]).map((part) => [part, { ...w.s.body[part] }]));
      const id = `child_${n}`;
      w.push({ t: "birth", id, kin: { name, sex, born: w.s.minutes, parents: ["player", p.with], body, joined: false }, src: "world" });
      const other = personName(r, w.s, p.with === "player" ? p.carrier : p.with);
      w.push({ t: "news", text: `${name} is born — a ${sex}, ${other}'s child with {{user}}.`, src: "world" });
      announce(w, `The baby is born: a ${sex}, named ${name} — ${other}'s child with {{user}}. ${name} is an infant: family, never part of anything romantic or sexual.`);
    }
  }
  for (const [id, k] of Object.entries(w.s.kin)) {
    if (k.joined || kinAge(r, w.s, id) < r.lineage.joinAt)
      continue;
    w.push({ t: "kin_join", id, src: "world" });
    announce(w, `${k.name}, {{user}}'s ${k.sex === "girl" ? "daughter" : "son"}, is grown up now (${kinAge(r, w.s, id)}) and steps into the story as an adult.`);
  }
}
function loveStat(r) {
  if (r.dating.enabled)
    return r.dating.love;
  return r.relStatOrder.find((id) => r.relStats[id].good === "high") ?? null;
}
function companionLife(w, before) {
  const r = w.r;
  const comps = Object.values(r.companions);
  if (!comps.length)
    return;
  const d0 = Math.floor(before.minutes / 1440);
  const d1 = r.clock.enabled ? Math.floor(w.s.minutes / 1440) : d0;
  const n = w.events.length;
  for (let day = d0 + 1;day <= Math.min(d1, d0 + 3); day++) {
    for (const c of comps) {
      if (!c.daily || !w.s.people[c.id])
        continue;
      const spec = c.daily;
      const keys = spec.options.map((o) => o.id);
      const model = w.odds[spec.id];
      if (!model && !w.needs.some((n) => n.id === spec.id))
        w.needs.push(spec);
      const p = normalize(model ?? Object.fromEntries(spec.options.map((o) => [o.id, o.weight])), keys);
      const picked = sample(p, seededRng(`${w.seed}:daily:${c.id}:${day}`));
      const opt = spec.options.find((o) => o.id === picked);
      because(w, `${personName(r, w.s, c.id)}'s own choice: ${opt.desc}`, () => effectToEvents(w, opt.effect, "world", {}));
      const line = `${personName(r, w.s, c.id)}: ${opt.desc.charAt(0).toLowerCase()}${opt.desc.slice(1)}`;
      w.push({ t: "news", text: line, src: "world" });
      announce(w, `Off-screen, ${line}. (Their own choice — it may come up later.)`);
    }
  }
  if (w.events.length > n)
    runTriggers(w, false);
  const love = loveStat(r);
  if (!love)
    return;
  for (const c of comps) {
    if (!c.jealousOf.length || !w.s.people[c.id])
      continue;
    const rivals = c.jealousOf.includes("anyone") ? Object.keys(w.s.people).filter((id) => id !== c.id) : c.jealousOf.filter((id) => id !== c.id);
    const gains = rivals.map((id) => [id, (w.s.rel[id]?.[love] ?? 0) - (before.rel[id]?.[love] ?? 0)]).filter(([, g]) => g >= 1);
    if (!gains.length)
      continue;
    const total = gains.reduce((a, [, g]) => a + g, 0);
    const drop = Math.max(1, Math.round(total / 2));
    const jealous = `${personName(r, w.s, c.id)} is jealous of ${gains.map(([id]) => personName(r, w.s, id)).join(" and ")}`;
    because(w, jealous, () => {
      w.push({ t: "rel", who: c.id, stat: love, d: -drop, src: "world" });
      for (const [id, g] of gains)
        w.push({ t: "bond", a: c.id, b: id, d: -Math.max(1, Math.round(g / 2)), src: "world" });
    });
    announce(w, `${personName(r, w.s, c.id)} notices {{user}} getting closer to ${gains.map(([id]) => personName(r, w.s, id)).join(" and ")} — and it stings.`);
  }
}
function checkRun(w, before) {
  const r = w.r;
  if (!r.checkpoints.enabled)
    return;
  if (!w.s.ended)
    for (const e of Object.values(r.endings)) {
      if (!evalBool(e.when, w.env(), false))
        continue;
      w.push({ t: "end", id: e.id, told: !w.defer, src: "trigger" });
      announce(w, endingDirection(r, w.s, e));
      return;
    }
  if (w.s.ended)
    return;
  const loop = r.checkpoints.loop;
  if (loop && evalBool(loop.when, w.env(), false)) {
    const to = loop.to !== "start" && w.s.saves[loop.to] ? loop.to : "start";
    const label = to === "start" ? "the very beginning" : w.s.saves[to].label;
    because(w, "Time loop", () => {
      w.push({ t: "load", slot: to, src: "world" });
      effectToEvents(w, loop.effects, "world", {});
    });
    announce(w, `${loop.text} The story rewinds to ${label}: treat everything after it as undone, except what {{user}} remembers.`);
    return;
  }
  if (r.checkpoints.auto && r.clock.enabled && Math.floor(w.s.minutes / 1440) > Math.floor(before.minutes / 1440)) {
    w.push({ t: "save", slot: "auto", label: `Autosave · ${formatClock(r, w.s.minutes).label}`, src: "world" });
  }
}
function runOp(r, before, op) {
  const c = r.checkpoints;
  if (!c.enabled)
    return "This ruleset has no checkpoints.";
  const w = new Working(r, cloneState(before));
  switch (op.op) {
    case "save": {
      const n = Number(op.slot);
      if (!Number.isInteger(n) || n < 1 || n > c.slots)
        return "No such save slot.";
      if (before.ended)
        return "The story has ended — load a save or start over.";
      const where = before.locationName ? ` · ${before.locationName}` : "";
      w.push({ t: "save", slot: op.slot, label: `${r.clock.enabled ? formatClock(r, before.minutes).label : `Turn ${before.turn}`}${where}`, src: "manual" });
      break;
    }
    case "load": {
      if (op.slot !== "start" && !before.saves[op.slot])
        return "That slot is empty.";
      const label = op.slot === "start" ? "the very beginning" : before.saves[op.slot].label;
      w.push({ t: "load", slot: op.slot, src: "manual" });
      w.push({ t: "notice", text: `Time rewinds to ${label}. Treat everything after that point as undone — except what {{user}} remembers.`, src: "world" });
      break;
    }
    case "restart":
      w.push({ t: "restart", src: "manual" });
      w.push({ t: "notice", text: "The story starts over from the very beginning: a new playthrough. Earlier events never happened, though some of what was learned carries over.", src: "world" });
      break;
    case "continue":
      if (!before.ended)
        return "The story hasn't ended.";
      if (c.hard)
        return "Hard mode: an ending is final.";
      w.push({ t: "unend", src: "manual" });
      w.push({ t: "notice", text: "The story goes on past its ending.", src: "world" });
      break;
  }
  runTriggers(w, false);
  return w.events;
}
function encounterJustEnded(s, id, fresh) {
  const last = s.lastEncounter;
  if (!last || last.id !== id)
    return false;
  if (s.minutes - last.at <= 15)
    return true;
  if (fresh)
    return false;
  return last.loc === s.location && s.minutes - last.at < ENCOUNTER_REST;
}
function startEncounter(w, id, src, opponent) {
  const enc = w.r.encounters[id];
  if (!enc)
    return;
  const foe = Object.fromEntries(enc.foe.stats.map((s) => [s.id, s.start]));
  w.push({ t: "enc", id, foe, ...enc.momentum ? { momentum: enc.momentum.start } : {}, ...opponent ? { foeName: opponent } : {}, src });
  announce(w, `An encounter begins: ${enc.name}${enc.desc ? ` — ${enc.desc}` : ""}. Opponent: ${opponent ?? enc.foe.name}.`);
  because(w, `${enc.name} begins`, () => effectToEvents(w, enc.start, src, {}));
}
function encounterOutcome(w) {
  const s = w.s.encounter;
  if (!s)
    return null;
  if (w.pendingEnd)
    return w.pendingEnd;
  const enc = w.r.encounters[s.id];
  if (enc?.momentum && s.momentum !== undefined) {
    if (s.momentum >= 100)
      return enc.momentum.win;
    if (s.momentum <= -100)
      return enc.momentum.lose;
  }
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
    because(w, `${enc?.name ?? "Encounter"} ended: ${outcome.replace(/_/g, " ")}`, () => effectToEvents(w, eff, src, {}));
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
function momentumWords(m, foe) {
  if (m >= 100)
    return "{{user}} has won the exchange";
  if (m <= -100)
    return `${foe} has won the exchange`;
  if (m >= 60)
    return "{{user}} is close to winning";
  if (m >= 20)
    return "{{user}} has the upper hand";
  if (m > -20)
    return "evenly matched";
  if (m > -60)
    return `${foe} has the upper hand`;
  return `${foe} is close to winning`;
}
function beatSheet(w, before, rec, playerText) {
  const enc = before.encounter ? w.r.encounters[before.encounter.id] : undefined;
  if (!enc?.momentum || before.encounter?.momentum === undefined)
    return;
  const foe = foeName(w.r, before);
  const beats = [];
  const typed = (playerText ?? "").trim();
  const mine = rec.action ? `${rec.action.label}${rec.check ? ` — ${TIER_LABEL[rec.check.tier].toLowerCase()}` : ""}` : "no clear move";
  if (rec.action && typed.length >= 240)
    beats.push(`1. {{user}}: keep the move exactly as {{user}} wrote it; only how well it lands is decided (${rec.check ? TIER_LABEL[rec.check.tier].toLowerCase() : "it happens"}).`);
  else
    beats.push(`1. {{user}}: ${mine}.${typed.length < 80 ? " Write the move itself in your own words as the opening beat." : ""}`);
  const foeMove = enc.foeMoves ? w.decisions.find((d) => d.id === enc.foeMoves.id) : undefined;
  if (foeMove)
    beats.push(`2. ${foe}: ${foeMove.pickedDesc}.`);
  const shift = w.events.reduce((sum, e) => sum + (e.t === "swing" ? e.d : 0), 0);
  const now = Math.max(-100, Math.min(100, before.encounter.momentum + shift));
  beats.push(`${beats.length + 1}. Where it stands: ${momentumWords(now, foe)}${shift ? ` (it swung ${shift > 0 ? "toward {{user}}" : `toward ${foe}`})` : ""}.`);
  w.hints.push(`This round's beats, in order:
${beats.join(`
`)}
Narrate them in order. ${w.s.encounter ? "The fight isn't over until the rules end it — don't finish it early." : ""}`.trim());
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
  because(w, `${fillTarget(w, d.ask, extra)} → ${fillTarget(w, opt.desc, extra)} (${Math.round((p[picked] ?? 0) * 100)}% odds)`, () => effectToEvents(w, opt.effect, src, extra));
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
      w.push({ t: "stat", id, d, src: "drift", why: `${minutes >= 60 ? `${Math.round(minutes / 6) / 10}h` : `${minutes} min`} passed (${def.label} drifts ${def.perHour > 0 ? "+" : ""}${def.perHour}/h)` });
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
      const why = `Rule "${t.id.replace(/_/g, " ")}"${t.when ? ` (${t.when})` : ""}${t.whenScene ? ` — judged: ${t.whenScene}` : ""}`;
      if (now && !prev) {
        w.push({ t: "trig", id: t.id, v: true, src: "trigger" });
        because(w, why, () => effectToEvents(w, t.effects, "trigger", {}));
        fired.add(t.id);
        changed = true;
      } else if (now && t.repeat && includeRepeat && !fired.has(t.id)) {
        because(w, `${why}, every turn while true`, () => effectToEvents(w, t.effects, "trigger", {}));
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
      because(w, `Feat: ${f.name}`, () => effectToEvents(w, f.reward, "trigger", {}));
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
function resolveTurn(r, before, intent, opts) {
  return resolveInner(r, before, intent, opts, []);
}
function mindOverride(r, s, a, target, seed) {
  for (const o of r.mind.overrides) {
    const applies = o.on.length ? o.on.some((x) => x === a.id || a.tags.includes(x)) : !!a.check;
    if (!applies || o.do === a.id)
      continue;
    const env = makeEnv(r, s, target ? { target } : {});
    if (!evalBool(o.when, env, false))
      continue;
    const chance = Math.max(0, Math.min(100, evalNumber(o.chance, env, 0)));
    if (seededRng(`${seed}:mind:${o.id}`)() * 100 >= chance)
      continue;
    const kind = o.do === "fail" ? "fail" : o.do === "alter" ? "alter" : "redirect";
    return { id: o.id, cause: o.cause, text: o.text ?? `${o.cause} takes over.`, kind, ...kind === "redirect" ? { to: o.do } : {}, chance };
  }
  return null;
}
function resolveInner(r, before, intent, opts, needs) {
  if (before.ended?.told && intent?.actionId !== RUN_EPILOGUE)
    intent = null;
  const w = new Working(r, cloneState(before), seededRng(`${opts.seed}:fx`), opts.seed, opts.odds ?? {}, opts.scene ?? {});
  w.defer = false;
  const rec = { v: 1, hints: [], events: [], at: Date.now() };
  if (!w.s.seed)
    w.push({ t: "seed", v: opts.seed, src: "start" });
  if (before.notices.length) {
    w.hints.push(...before.notices);
    w.push({ t: "noticed", src: "world" });
  }
  if (before.ended && !before.ended.told) {
    const e = r.endings[before.ended.id];
    if (e && !before.notices.some((n) => n.startsWith("THE STORY REACHES AN ENDING")))
      w.hints.push(endingDirection(r, before, e));
    w.push({ t: "end_told", src: "world" });
    rec.action = { id: RUN_EPILOGUE, label: `The end: ${e?.title ?? "the story ends"}`, via: intent?.via ?? "choice" };
  }
  let encBase = before;
  if (opts.encounter && !before.encounter && !before.dungeon && !before.job && !before.ended) {
    const enc = r.encounters[opts.encounter.id];
    if (enc?.fromStory && !encounterJustEnded(before, enc.id, opts.encounter.fresh === true)) {
      because(w, `The scene: ${enc.name} breaks out`, () => startEncounter(w, enc.id, "trigger", opts.encounter.foe));
      encBase = cloneState(w.s);
    }
  }
  let found = intent && !intent.actionId.startsWith(TRAVEL_PREFIX) && !intent.actionId.startsWith(DATE_PREFIX) && !intent.actionId.startsWith(PAY_PREFIX) && !intent.actionId.startsWith(JOB_PREFIX) ? findAction(r, before, intent.actionId) : null;
  let mind = found ? mindOverride(r, before, found.a, found.target, opts.seed) : null;
  const meant = found ? found.target ? `${found.a.label} (${personName(r, before, found.target)})` : intent.label ?? found.a.label : "";
  if (found && mind?.kind === "redirect") {
    const alt = findAction(r, before, mind.to);
    if (alt)
      found = { a: alt.a, ...found.target && alt.a.perPerson ? { target: found.target } : {} };
    else
      mind = null;
  }
  const a = found?.a;
  const inEncounter = !!encBase.encounter;
  const improvised = !!a && a.id.startsWith(IMPROV);
  const dateIntent = intent?.actionId.startsWith(DATE_PREFIX) ? intent : activeSession(r, before) && !intent && !before.job ? { actionId: `${DATE_PREFIX}say`, via: "adjudicator" } : null;
  const workIntent = intent && (intent.actionId.startsWith(PAY_PREFIX) || intent.actionId.startsWith(JOB_PREFIX)) ? intent : before.job && !intent ? { actionId: `${JOB_PREFIX}say`, via: "adjudicator" } : null;
  if (before.date && !activeSession(r, before))
    w.push({ t: "dt_end", src: "action" });
  if (intent?.actionId === EXPLORE) {
    if (canExplore(r, before)) {
      const loc = before.location;
      const name = before.locationName ?? loc;
      rec.action = { id: EXPLORE, label: `Explore ${name}`, via: intent.via };
      const chance = Math.min(100, evalNumber(r.discovery.chance, w.env(), 25) + 10 * (before.explored[loc] ?? 0));
      const found = seededRng(`${opts.seed}:explore`)() * 100 < chance;
      w.push({ t: "explored", loc, found, src: "action" });
      advanceTime(w, r.discovery.time, "action");
      if (found)
        rec.discover = { from: loc };
      else
        w.hints.push(`{{user}} explores around ${name} but finds nothing new this time — though they're getting to know the area.`);
    }
  } else if (workIntent) {
    const label = because(w, "Work and bills", () => resolveWork(builderOf(w), workIntent));
    if (label)
      rec.action = { id: workIntent.actionId, label, via: workIntent.via };
  } else if (dateIntent) {
    const done = because(w, "Conversation", () => resolveDate(builderOf(w), dateIntent));
    if (done) {
      rec.action = { id: dateIntent.actionId, label: done.label, via: dateIntent.via };
      const veils = new Set((opts.veils ?? []).map((v) => v.toLowerCase()));
      if (done.tags.some((t) => veils.has(t)))
        rec.veiled = true;
    }
  } else if (intent?.actionId.startsWith(TRAVEL_PREFIX)) {
    const to = intent.actionId.slice(TRAVEL_PREFIX.length);
    const dest = r.locations[to];
    if (dest) {
      const from = before.location ? r.locations[before.location] : undefined;
      rec.action = { id: intent.actionId, label: `Go to ${dest.name}`, via: intent.via };
      because(w, `Travel to ${dest.name}`, () => {
        w.push({ t: "move", to, src: "action" });
        advanceTime(w, from?.travel ?? dest.travel, "action");
      });
      if (dest.desc)
        w.hints.push(`Arriving at ${dest.name}: ${dest.desc}`);
    }
  } else if (a) {
    const who = found?.target;
    const extra = paramValues(a, intent.params, who);
    const own = mind?.kind === "redirect" ? who ? `${a.label} (${personName(r, before, who)})` : a.label : null;
    const difficulty = improvised && isDifficulty(intent.params?.difficulty) ? intent.params.difficulty : "fair";
    const label = improvised ? `Attempt: ${a.check?.label ?? "luck"}, ${difficulty}` : own ?? intent.label ?? (who ? `${a.label} (${personName(r, before, who)})` : a.label);
    rec.action = { id: mind?.kind === "redirect" ? `${a.id}${who ? `${TARGET_SEP}${who}` : ""}` : intent.actionId, label, via: intent.via, ...a.params.length ? { params: Object.fromEntries(a.params.map((p) => [p.id, intent.params?.[p.id] ?? p.default])) } : {} };
    if (mind) {
      rec.mind = { id: mind.id, cause: mind.cause, kind: mind.kind, meant, chance: mind.chance };
      const why = mind.text.replace(/\{target\}/g, who ? personName(r, before, who) : "them");
      w.hints.push(mind.kind === "fail" ? `{{user}} tries to ${meant.toLowerCase()}, but can't: ${why} It fails — no roll.` : mind.kind === "redirect" ? `{{user}} meant to ${meant.toLowerCase()}, but ${why} What actually happens: ${label.toLowerCase()}.` : `{{user}} goes ahead, but ${mind.cause.toLowerCase()} colours it: ${why}`);
    }
    because(w, `Cost of "${label}"`, () => effectToEvents(w, a.cost, "cost", extra));
    if (a.id.startsWith(ITEM_PREFIX)) {
      const itemId = a.id.slice(ITEM_PREFIX.length);
      const it = r.items[itemId];
      if (it && !it.keep && (w.s.items[itemId] ?? 0) > 0)
        because(w, `Used ${it.name}`, () => w.push(it.uses > 0 ? { t: "use", id: itemId, n: 1, src: "action" } : { t: "item", id: itemId, d: -1, src: "action" }));
    }
    if (a.id.startsWith(ABILITY_PREFIX)) {
      const enc = encounterKey(w.s);
      because(w, `Used ${r.abilities[a.id.slice(ABILITY_PREFIX.length)]?.name ?? a.label}`, () => w.push({ t: "charge", key: a.id, day: dayOf(w.s), ...enc ? { enc } : {}, src: "action" }));
    }
    if (mind?.kind === "fail") {
      const fail = a.outcomes.fail ?? a.outcomes.crit_fail;
      if (fail)
        because(w, `"${meant}" — ${mind.cause} stopped it`, () => effectToEvents(w, fail, "check", extra));
    } else if (a.check) {
      const rng = seededRng(opts.seed);
      const { add, target } = checkNumbers(r, w.s, a, intent.params, who);
      let roll = rollDice(a.check.dice, rng);
      let tier = tierFor(a.check, roll, add, target);
      let perkNote;
      if (tier === "fail" || tier === "crit_fail") {
        const re = perkRuleFor(r, w.s, a, "reroll");
        if (re) {
          because(w, `★ ${re.name}`, () => w.push({ t: "charge", key: `perk:${re.perk}:reroll`, day: dayOf(w.s), src: "action" }));
          roll = rollDice(a.check.dice, seededRng(`${opts.seed}:reroll`));
          tier = tierFor(a.check, roll, add, target);
          perkNote = `${re.name} rerolled a failure`;
        }
      }
      if (tier === "fail" || tier === "crit_fail") {
        const so = perkRuleFor(r, w.s, a, "soften");
        if (so) {
          because(w, `★ ${so.name}`, () => w.push({ t: "charge", key: `perk:${so.perk}:soften`, day: dayOf(w.s), src: "action" }));
          tier = tier === "crit_fail" ? "fail" : "partial";
          perkNote = `${so.name}: ${tier === "partial" ? "the failure only half-failed" : "the disaster was only a failure"}`;
        }
      }
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
      const gear = gearFor(r, w.s, a).notes;
      if (gear.length)
        rec.check.gear = gear;
      if (perkNote)
        rec.check.perk = perkNote;
      const key = TIER_FALLBACK[tier].find((t) => a.outcomes[t]);
      if (key)
        because(w, `"${label}": ${rec.check.label} rolled ${rec.check.total}${target !== null ? ` vs ${target}` : ""} → ${TIER_LABEL[tier]}`, () => effectToEvents(w, a.outcomes[key], "check", extra));
      if (improvised) {
        w.hints.push(`{{user}} attempts what they wrote (${a.check.label}, ${DIFFICULTY_WORD[difficulty]}). ${IMPROV_DIRECTION[tier]} Keep {{user}}'s own words and choices; the dice decide only how it turns out.`);
      } else if (tier === "partial" && key === "success")
        w.hints.push("It works, but not cleanly — introduce a cost or complication.");
      const used = checkStats(r, a);
      if (used.length) {
        const hard = hardnessFrom(improvised ? null : odds(r, before, a, intent.params, who)?.success ?? null, improvised ? difficulty : undefined);
        const gains = checkGains(r, w.s, used, hard, tier);
        if (Object.keys(gains).length)
          practise(builderOf(w), gains, `Used in "${label}" (${TIER_LABEL[tier].toLowerCase()})`);
      }
    } else {
      because(w, `"${label}"`, () => effectToEvents(w, a.effects, "action", extra));
    }
    advanceTime(w, a.time ?? (inEncounter ? 1 : r.clock.minutesPerAction), "action");
    const veils = new Set((opts.veils ?? []).map((v) => v.toLowerCase()));
    const encTags = inEncounter ? r.encounters[encBase.encounter.id]?.tags ?? [] : [];
    if ([...a.tags, ...encTags].some((t) => veils.has(t)))
      rec.veiled = true;
    if (inEncounter) {
      const tier = rec.check?.tier ?? (rec.mind?.kind === "fail" ? "fail" : null);
      const m = r.encounters[encBase.encounter.id]?.momentum;
      if (m && tier && w.s.encounter?.momentum !== undefined)
        w.push({ t: "swing", d: m.swing[tier], src: "check" });
      encounterRound(w, "action");
      beatSheet(w, encBase, rec, opts.playerText);
    }
  } else if (inEncounter && w.s.encounter) {
    encounterRound(w, "action");
    beatSheet(w, encBase, rec, opts.playerText);
  }
  runTriggers(w, true);
  const days = r.clock.enabled ? (w.s.minutes - before.minutes) / 1440 : 1;
  const worldBefore = w.events.length;
  tickWorld(w, days, 1);
  if (w.events.length > worldBefore)
    runTriggers(w, false);
  companionLife(w, before);
  lineageLife(w);
  obligationLife(builderOf(w));
  beingSeen(w);
  rumours(w, before);
  checkRun(w, before);
  w.push({ t: "turn", src: "action" });
  rec.events = w.events;
  rec.hints = w.hints;
  if (w.decisions.length) {
    rec.decisions = w.decisions;
    for (const d of w.decisions)
      if (!d.descs)
        rec.hints.push(`${d.ask} → ${d.pickedDesc}`);
  }
  needs.push(...w.needs);
  return rec;
}
function actionTags(r, actionId) {
  const base = actionId.split(TARGET_SEP)[0];
  const enc = Object.values(r.encounters).find((e) => e.actions[base]);
  const a = base.startsWith(LIVE_PREFIX) ? r.liveChoices.tags[base.slice(LIVE_PREFIX.length)] : r.actions[base] ?? enc?.actions[base];
  return [...a?.tags ?? [], ...enc?.tags ?? []];
}
function gateOpen(g, w, ctx) {
  if (!g)
    return true;
  if (g.when && !evalBool(g.when, w.env(), false))
    return false;
  if (g.words) {
    const text = ctx?.text.toLowerCase() ?? "";
    if (!g.words.some((x) => text.includes(x)))
      return false;
  }
  if (g.actions) {
    const a = ctx?.action;
    if (!a)
      return false;
    const id = a.id.split(TARGET_SEP)[0].toLowerCase();
    if (!g.actions.some((x) => x === id || a.tags.includes(x)))
      return false;
  }
  return true;
}
function clampAbs(v, lim) {
  return Math.max(-lim, Math.min(lim, v));
}
function findPerson(r, s, key) {
  const k = String(key).trim().toLowerCase();
  if (!k)
    return null;
  const sl = slug(k);
  for (const [id, p] of Object.entries(s.people))
    if (id === k || id === sl || p.name.toLowerCase() === k)
      return id;
  for (const p of Object.values(r.people))
    if (p.id === k || p.id === sl || p.name.toLowerCase() === k)
      return p.id;
  const first = (n) => n.toLowerCase().split(/\s+/)[0];
  const hits = Object.entries(s.people).filter(([, p]) => first(p.name) === first(k));
  return hits.length === 1 ? hits[0][0] : null;
}
function applyProposal(r, before, p, ctx) {
  const w = new Working(r, cloneState(before), seededRng(`narrator:${before.turn}`));
  w.cause = "Read from the story";
  const src = "narrator";
  const scene = {};
  for (const person of p.people ?? []) {
    if (!person?.name)
      continue;
    const known = findPerson(r, w.s, person.name);
    if (known) {
      if (person.feelings)
        calibrate(w, known, person.feelings, src);
      scene[known] = true;
      continue;
    }
    if (!r.peopleOpen)
      continue;
    const id = slug(person.id || person.name);
    if (!w.s.people[id])
      w.push({ t: "person", id, name: person.name, src });
    calibrate(w, id, person.feelings ?? {}, src);
    scene[id] = true;
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
    if (!gateOpen(def.gate, w, ctx))
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
      if (!gateOpen(def.gate, w, ctx))
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
  for (const [key, n] of Object.entries(p.used ?? {})) {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0)
      continue;
    const k = key.toLowerCase();
    const id = Object.keys(w.s.items).find((i) => i === k || itemName(r, w.s, i).toLowerCase() === k);
    if (id && (r.items[id]?.uses ?? 0) > 0)
      w.push({ t: "use", id, n: Math.min(10, Math.round(n)), src });
    const use = id ? r.items[id]?.use : undefined;
    if (id && use && !use.check && ctx?.action?.id !== `${ITEM_PREFIX}${id}`) {
      because(w, `${itemName(r, w.s, id)} used in the story`, () => effectToEvents(w, use.effects, src, {}));
    }
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
    if (def?.narrator && !w.s.conditions[id] && gateOpen(def.gate, w, ctx))
      w.push({ t: "cond", id, on: true, until: null, src });
  }
  for (const id of p.conditions?.remove ?? []) {
    const def = r.conditions[id];
    if (def?.narrator && w.s.conditions[id] && gateOpen(def.gate, w, ctx))
      w.push({ t: "cond", id, on: false, src });
  }
  for (const [key, v] of Object.entries(p.flags ?? {})) {
    if (r.flags[key]?.narrator && gateOpen(r.flags[key].gate, w, ctx))
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
  if (r.body.enabled && r.body.narrator && p.body && typeof p.body === "object") {
    let n = 0;
    for (const [rawPart, traits] of Object.entries(p.body)) {
      const part = slug(rawPart);
      if (!traits || typeof traits !== "object")
        continue;
      if (!r.body.open && !(part in r.body.parts) && !(part in w.s.body))
        continue;
      for (const [rawTrait, v] of Object.entries(traits)) {
        if (n >= 8)
          break;
        const trait = slug(rawTrait);
        const value = v === null || v === undefined || v === "" ? null : String(v).slice(0, 60);
        if ((w.s.body[part]?.[trait] ?? null) === value)
          continue;
        w.push({ t: "body", part, trait, v: value, src });
        n++;
      }
    }
  }
  if (typeof p.minutes === "number" && Number.isFinite(p.minutes) && p.minutes > 0) {
    advanceTime(w, Math.round(Math.min(p.minutes, r.clock.narratorMax)), src);
  }
  for (const [who, here] of Object.entries(p.scene ?? {})) {
    const id = findPerson(r, w.s, who);
    if (id && typeof here === "boolean")
      scene[id] = here;
  }
  const hereNow = new Set(presentPeople(r, w.s, w.env()));
  for (const [id, here] of Object.entries(scene)) {
    if (!w.s.people[id])
      continue;
    const word = w.s.scene[id];
    if (hereNow.has(id) !== here)
      w.push({ t: "scene", who: id, here, src });
    else if (here && word && sceneWord(w.s, id) !== null && w.s.minutes - word.at > SCENE_HOLDS / 3)
      w.push({ t: "scene", who: id, here, src, note: "renew" });
  }
  if (p.encounter && !w.s.encounter && !w.s.dungeon && !w.s.job) {
    const k = String(p.encounter).toLowerCase();
    const enc = r.encounters[k] ?? Object.values(r.encounters).find((x) => x.name.toLowerCase() === k);
    if (enc && encounterJustEnded(w.s, enc.id, p.encounterFresh === true)) {} else if (enc?.fromStory)
      because(w, `${enc.name} broke out`, () => startEncounter(w, enc.id, src, typeof p.foe === "string" && p.foe.trim() ? p.foe.trim().slice(0, 60) : undefined));
  } else if (p.encounterEnd && w.s.encounter) {
    const name = r.encounters[w.s.encounter.id]?.name ?? "The encounter";
    because(w, `${name} ended`, () => endEncounter(w, slug(String(p.encounterEnd)), src));
  }
  if (r.growth.enabled && r.growth.train) {
    const gains = {};
    for (const key of (Array.isArray(p.train) ? p.train : []).slice(0, 2)) {
      const k = String(key).toLowerCase();
      const id = r.statOrder.find((s) => s === k || r.stats[s].label.toLowerCase() === k);
      if (id && (r.stats[id].kind === "skill" || r.stats[id].kind === "attribute"))
        gains[id] = (gains[id] ?? 0) + trainingGain(r, w.s, id, p.minutes);
    }
    if (Object.keys(gains).length)
      practise(builderOf(w), gains, "Practice the story described");
  }
  w.cause = null;
  runTriggers(w, false);
  if (r.clock.enabled && w.s.minutes > before.minutes) {
    const n = w.events.length;
    tickWorld(w, (w.s.minutes - before.minutes) / 1440, 0);
    if (w.events.length > n)
      runTriggers(w, false);
  }
  companionLife(w, before);
  lineageLife(w);
  obligationLife(builderOf(w));
  rumours(w, before);
  checkRun(w, before);
  return w.events;
}
function builderOf(w) {
  return {
    r: w.r,
    get s() {
      return w.s;
    },
    seed: w.seed,
    push: (e) => w.push(e),
    env: (extra = {}) => w.env(extra),
    apply: (effect, src, extra = {}) => effectToEvents(w, effect, src, extra),
    time: (minutes, src) => advanceTime(w, minutes, src),
    announce: (text) => announce(w, text),
    modelOdds: (spec) => {
      const model = w.odds[spec.id];
      if (model)
        return normalize(model, spec.options.map((o) => o.id));
      if (!w.needs.some((n) => n.id === spec.id))
        w.needs.push(spec);
      return null;
    },
    roll: (id, ask, p, descs, source) => {
      const keys = Object.keys(p);
      const odds = normalize(p, keys);
      const picked = sample(odds, seededRng(`${w.seed}:roll:${id}`));
      w.decisions.push({ id, ask, picked, pickedDesc: descs[picked] ?? picked, p: odds, source, descs });
      return picked;
    }
  };
}
function buildTurn(r, before, seed, fn) {
  const w = new Working(r, cloneState(before), seededRng(`${seed}:fx`), seed);
  fn(builderOf(w));
  runTriggers(w, false);
  if (r.clock.enabled && w.s.minutes > before.minutes) {
    const n = w.events.length;
    tickWorld(w, (w.s.minutes - before.minutes) / 1440, 0);
    if (w.events.length > n)
      runTriggers(w, false);
  }
  companionLife(w, before);
  lineageLife(w);
  obligationLife(builderOf(w));
  checkRun(w, before);
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
function perkBlocker(r, s, id, offered = true) {
  const p = r.perks[id];
  if (!p)
    return "Unknown perk.";
  if (s.perks[id])
    return "Already taken.";
  const clash = Object.keys(s.perks).find((o) => p.excludes.includes(o) || r.perks[o]?.excludes.includes(id));
  if (clash)
    return `Can't go with ${r.perks[clash]?.name ?? clash}.`;
  if (p.requires && !evalBool(p.requires, makeEnv(r, s), false))
    return "Requirements not met.";
  if (r.perkPoints && (s.stats[r.perkPoints] ?? 0) < p.cost)
    return `Needs ${p.cost} point${p.cost === 1 ? "" : "s"}.`;
  if (offered && r.perkPick && !perkOffers(r, s).includes(id))
    return "Not on offer right now.";
  return null;
}
function perkStats(r, id) {
  const p = r.perks[id];
  if (!p)
    return [];
  return [...new Set([
    ...Object.keys(p.bonus),
    ...p.edges.flatMap((e) => Object.keys(e.stats)),
    ...p.rules.flatMap((x) => ("stat" in x) ? [x.stat] : x.stats),
    ...p.abilities.flatMap((a) => r.abilities[a] ? checkStats(r, r.abilities[a].action) : [])
  ])];
}
function perkAffinity(r, s, id) {
  let score = 0;
  for (const stat of perkStats(r, id)) {
    const def = r.stats[stat];
    if (!def)
      continue;
    const span = Math.max(1, def.max - def.min);
    score += Math.max(0, ((s.stats[stat] ?? def.start) - def.start) / span) + (s.practice?.[stat] ?? 0) * 0.25;
  }
  return score;
}
function perkOffers(r, s) {
  if (!r.perkPick)
    return [];
  const open = Object.values(r.perks).filter((p) => p.weight > 0 && !perkBlocker(r, s, p.id, false));
  if (!open.length)
    return [];
  const rng = seededRng(`${s.seed ?? "warp"}:perks:${Object.keys(s.perks).sort().join(",")}`);
  const score = new Map(open.map((p) => [p.id, perkAffinity(r, s, p.id) + rng() * 0.01]));
  const left = [...open];
  const out = [];
  const take = (p) => {
    if (!p)
      return;
    out.push(p.id);
    left.splice(left.indexOf(p), 1);
  };
  if (left.length)
    take([...left].sort((a, b) => score.get(b.id) - score.get(a.id))[0]);
  if (out.length < r.perkPick && left.length)
    take([...left].sort((a, b) => score.get(a.id) - score.get(b.id))[0]);
  while (out.length < r.perkPick && left.length) {
    const total = left.reduce((n, p) => n + p.weight, 0);
    let x = rng() * total;
    take(left.find((p) => (x -= p.weight) <= 0) ?? left[left.length - 1]);
  }
  return out;
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
var EXPLORE = "explore:", TRAVEL_PREFIX = "go:", TARGET_SEP = "@", LIVE_PREFIX = "live:", ITEM_PREFIX = "item:", ABILITY_PREFIX = "ability:", NEXT_EVENT = "world:next_event", SEEN_DESC, RUN_EPILOGUE = "run:epilogue", ENCOUNTER_REST = 60, TIER_FALLBACK, TIER_LABEL;
var init_resolve = __esm(() => {
  init_expr();
  init_dice();
  init_ruleset();
  init_ruleset();
  init_state();
  init_encounter_view();
  init_freeform();
  init_chronicle();
  init_world();
  init_types2();
  init_talk();
  init_work();
  SEEN_DESC = {
    unnoticed: "Doesn't notice",
    glance: "Notices, then looks away",
    interested: "Is interested — keeps looking",
    disapproving: "Disapproves",
    predatory: "Pays the wrong kind of attention"
  };
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
      },
      {
        label: "dating",
        yaml: `# Date mode: talk topic by topic, learn what people like, ask them out.
# Affection is love; a "fear" relationship stat is added automatically.
dating:
  love: affection
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
        yaml: `# Exploring the rougher edges of town can turn up places that aren't on the map yet.
discovery:
  at: [docks, park, the_strip]
  chance: 20
  max: 8
  guide: "Small, grounded places in a run-down seaside town: a back-alley bar, a bait shop, an abandoned pier, a late-night launderette."

# {{user}}'s body, as the story changes it (haircuts, tattoos, lasting marks…).
body:
  parts:
    hair: { color: brown, length: shoulder-length }
    eyes: { color: hazel }
    skin: { marks: none }
  hidden_by: { chest: [top, under_top], hips: [bottom, under_bottom] }

weather:
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
        yaml: `# At low control, {{user}}'s mind can overrule the player. Each override rolls its chance per action.
mind:
  overrides:
    freeze:
      when: "control < 25"
      chance: "60 - control * 2"
      on: [violence, crime]
      cause: Panic
      text: "their body locks up and won't obey."
    flight:
      when: "control < 15 and cond('scared')"
      chance: 35
      do: alter
      cause: Fear
      text: "every instinct is screaming at them to get out."
  perception:
    - { when: "trauma >= 60", text: "Reminders of what happened hit hard. Show intrusive thoughts and flinches; safe things can feel unsafe." }
    - { when: "control < 25", text: "{{user}} is barely holding together: narrow focus, racing heart, sounds too loud." }

# Save slots, a daily autosave, and a bad end. What you've learned survives a rewind.
checkpoints:
  slots: 3
  auto: day
  keep: [codex, feats, secrets]
endings:
  burned_out:
    when: "trauma >= 100"
    title: Burned out
    kind: bad
    text: "{{user}} can't carry it any more. They pack a bag and take the night bus out of town."

# Meters that feed into each other.
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
      },
      {
        label: "dating",
        yaml: `# When {{user}} is exposed, everyone present reacts in their own way, and word gets around.
observers:
  when: "exposed > 0"
  crowd: 2
  reactions:
    interested: { rel: { target: { lust: +4 } } }
    disapproving: { rel: { target: { trust: -3 } }, stress: +3 }
    predatory: { stress: +6, hint: "{target} starts paying the wrong kind of attention." }

# Rent is due every Monday. Miss it and the landlord decides what that costs.
obligations:
  rent:
    label: Rent
    amount: 120
    every: 7
    first: 7
    grace: 1
    late:
      ask: "{{user}}'s rent is late. What does the landlord do?"
      options:
        warning: { desc: "Slips a stern note under the door", weight: 3, stress: +8 }
        late_fee: { desc: "Adds a £25 late fee", weight: 2, stress: +10, money: "-min(money, 25)" }
        lockout: { desc: "Changes the lock until it's paid", weight: 1, stress: +25, flags: { locked_out: true } }

# A busy shift at Jo's café: every customer wants something different.
jobs:
  rush_hour:
    label: Cover the lunch rush at the café
    at: [high_street]
    when: "between(hour, 11, 14) and weekday != 'Sun'"
    customers: 3
    pay: 25
    tip: 4
    skill: tending
    minutes: 30
    gain: { tending: +1, fatigue: +15 }
    styles: { quick: "Get their order out fast", friendly: "Be warm and chatty", careful: "Get every detail exactly right" }
    patrons:
      - { who: "A nurse coming off a night shift, swaying on her feet", want: quick }
      - { who: "A student with a laptop and nowhere to be", want: friendly }
      - { who: "A regular who orders the same thing, very precisely, every day", want: careful }
      - { who: "Two builders on a twenty-minute break", want: quick }
      - { who: "An elderly man who's lonely and wants someone to talk to", want: friendly }
      - { who: "A woman with a long list of allergies", want: careful }

# Companions live between replies: goals, arcs they push by their own choices, feelings about each other.
companions:
  jo:
    goal: Buy the café outright before the landlord sells it
    arc:
      per_day: 1
      stages:
        - { at: 30, hint: "Jo has been doing sums at closing time.", surface: "Jo tells people she's trying to buy the café." }
        - { at: 70, hint: "Jo looks exhausted; she's taken on extra shifts.", surface: "Jo makes the landlord an offer on the café.", do: { flags: { jo_offer: true } } }
      story: { "{{user}} helps Jo at the café": 8 }
    daily:
      ask: How does Jo spend her evening?
      options:
        extra_shift: { desc: Works a late extra shift, weight: 3, arc: +4 }
        the_strip: { desc: Goes out on the Strip and runs into Dex, weight: 1, arc: -2, bond: { dex: +4 } }
        night_in: { desc: Stays in and rests, weight: 2 }
    jealous_of: [dex]
    bonds: { dex: 10, professor_ward: 20 }
  dex:
    goal: Clear a debt to people you don't owe money to
    daily:
      ask: What does Dex get up to tonight?
      options:
        job: { desc: Takes a job for the wrong people, weight: 2 }
        café: { desc: Hangs around Jo's café until closing, weight: 1, bond: { jo: +5 } }
    bonds: { jo: 25, professor_ward: -30 }

# Date mode: talk topic by topic, learn what people like, ask them out.
# Love is the "love" relationship stat; "fear" is added automatically.
dating:
  love: love
  people:
    jo: { loves: [food, their_day], likes: [music, tag:food, tag:calm], dislikes: [gossip, tease], hates: [fashion] }
    professor_ward: { loves: [books_films, dreams], likes: [compliment_mind, tag:conversation], dislikes: [joke, flirt], hates: [gossip] }
    dex: { loves: [local_news, gossip], likes: [games, tag:drink, tag:thrill], dislikes: [work, family], hates: [compliment_looks] }
  topics:
    the_docks: { label: "What goes on at the docks", category: small_talk, when: "hour >= 18 or hour < 4" }
  venues:
    park: { name: The park, at: park }
    bar: { name: The Strip, at: the_strip }

items:
  flowers: { name: A bunch of flowers, tags: [gift] }
  chocolates: { name: Box of chocolates, tags: [gift] }

actions:
  buy_flowers:
    label: Buy flowers (£12)
    group: Shops
    at: [high_street]
    when: money >= 12
    time: 5
    effects: { money: -12, give: flowers }
  buy_chocolates:
    label: Buy chocolates (£8)
    group: Shops
    at: [high_street]
    when: money >= 8
    time: 5
    effects: { money: -8, give: chocolates }
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
    blurb: "Sci-fi RPG / space opera: Physique, Reflexes, Aim, Intelligence, Willpower and Libido capped at 5× level; Shields/HP/Lust/Energy pools; credits; XP and levels with a pick-one-of-three perk; tech abilities (Stim Shot, Overcharge, Target Lock, Smoke Screen); a ship and a frontier world; turn-based combat you can win by force or by seduction; a codex that fills in as you explore.",
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
      0%: Down.
      10%: Critical.
      40%: Wounded.
      75%: Healthy.
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
        yaml: `# The frontier is barely charted: exploring the jungle can find new sites.
discovery:
  at: [jungle_edge, jungle_deep]
  chance: 25
  max: 10
  guide: "Frontier-world sites: a crashed survey drone, a hunter's blind, ancient ruins, a smugglers' landing pad, a strange grove."

# {{user}}'s body. Gene-splices change it in stages; the story can change it too.
body:
  parts:
    hair: { color: dark, length: short }
    eyes: { color: brown }
    ears: human
    skin: { tone: tanned }
  transforms:
    feline_splice:
      label: Feline gene-splice
      chance: 75
      stages:
        - { set: { eyes: { color: gold, pupils: slit } }, text: "{{user}}'s eyes sting, then clear: gold, with slit pupils." }
        - { set: { ears: { type: feline } }, text: "Tufted feline ears push up through {{user}}'s hair." }
        - { set: { tail: { type: feline, length: long } }, text: "A long feline tail finishes growing in." }

locations:
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
  holdout_pistol: { name: Holdout pistol, bonus: { aim: 1 } }
  medkit: Medkit
  codex: { name: Codex, bonus: { intelligence: 1 } }
  shield_booster: Shield booster

conditions:
  stunned: { label: Stunned, tone: bad, narrator: true, bonus: { reflexes: -3, aim: -2 } }
  grappled: { label: Grappled, tone: bad, narrator: true, bonus: { reflexes: -4 } }
  burning: { label: Burning, tone: bad, narrator: true }
  stimmed: { label: Stimmed, tone: good, bonus: { reflexes: 2, physique: 1 } }
  locked_on: { label: Target lock, tone: good, bonus: { aim: 3 } }
`
      },
      {
        label: "actions",
        yaml: `actions:
  plot_course:
    label: Check the nav charts
    group: Ship
    at: bridge
    say: "*I pull up the nav charts and scan for traffic and signals.*"
    time: 20
    check: { vs: 11, add: floor(intelligence / 2), label: Intelligence }
    success: { xp: +5, hint: "Something on the charts is worth a look: a derelict, a beacon, a smuggler's lane." }
    fail: { hint: "Static and freighter chatter." }
  salvage:
    label: Strip salvage for parts
    group: Ship
    at: cargo_bay
    say: "*I sort through the cargo bay for anything worth selling.*"
    time: 60
    cost: { energy: -10 }
    check: { vs: 11, add: floor(intelligence / 3) + floor(physique / 3), label: Tech }
    success: { credits: roll('2d20') }
    fail: { energy: -5 }
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
  gene_splice:
    label: Buy a feline gene-splice (₡250)
    group: Trade
    at: merchant
    when: credits >= 250 and transformed('feline_splice') < 3
    say: "*I pay for a feline gene-splice and take the injector.*"
    effects: { credits: -250, transform: { feline_splice: 1 } }
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
        yaml: `# The player's own tech and tricks. Stim Shot everyone has; the rest come with perks.
abilities:
  stim_shot:
    name: Stim Shot
    desc: A combat stim straight into the neck
    cost: { energy: -15 }
    add_condition: { stimmed: 3 }
    per_encounter: 1
  overcharge:
    name: Overcharge Shields
    desc: Dump reactor power into the shield emitter
    cost: { energy: -20 }
    shields: "+(10 + intelligence * 2)"
    per_encounter: 1
  target_lock:
    name: Target Lock
    desc: The visor paints the target
    where: encounter
    cost: { energy: -8 }
    add_condition: { locked_on: 3 }
  smoke_screen:
    name: Smoke Screen
    desc: A grenade of thick, sensor-blinding smoke
    where: encounter
    cost: { energy: -12 }
    per_day: 1
    check: { vs: 10, add: floor(reflexes / 2), label: Reflexes }
    success: { end: fled }
    fail: { hint: "The smoke billows the wrong way." }

# One point per level; each point offers three perks to choose from.
perks:
  points: perk_points
  pick: 3
  sharpshooter:
    name: Sharpshooter
    desc: Every shot counts — more so with a lock.
    tags: [aim]
    bonus: { aim: 1 }
    edge: { aim: 2, when: "cond('locked_on')" }
    abilities: [target_lock]
  bruiser:
    name: Bruiser
    desc: Built to take hits.
    tags: [physique]
    bonus: { physique: 1 }
    rule: { losses: { hp: "-20%" } }
    narrator: "{{user}} is built like a cargo loader and takes a hit like one."
  shield_tech:
    name: Shield Tech
    desc: Knows emitters inside out.
    abilities: [overcharge]
    rule: { losses: { shields: "-15%" } }
  iron_will:
    name: Iron Will
    desc: Hard to tempt, harder to break.
    bonus: { willpower: 2 }
    rule: { gains: { lust: "-30%" } }
  silver_tongue:
    name: Silver Tongue
    desc: Even a bad line half-lands.
    tags: [libido]
    bonus: { libido: 10 }
    rule: { soften: { stats: [libido], per_day: 2 } }
    excludes: [iron_will]
  spacer_luck:
    name: Spacer's Luck
    desc: Once a day the universe blinks first.
    rule: { reroll: { per_day: 1 } }
  ghost:
    name: Ghost
    desc: Gone before they look up.
    abilities: [smoke_screen]
    bonus: { reflexes: 1 }
  tactician:
    name: Tactician
    desc: Reads a fight three moves ahead.
    requires: "level >= 3"
    bonus: { intelligence: 1, reflexes: 1 }
    edge: { aim: 2, when: "shields > 0" }

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
      },
      {
        label: "dating",
        yaml: `# Date mode: talk topic by topic, learn what people like, ask them out.
# Affinity is love; a "fear" relationship stat is added automatically.
dating:
  love: affinity
  stages: { stranger: 0, contact: 12, friend: 35, close: 65, partner: { at: 85, partner: true } }
  people:
    vex: { loves: [the_frontier, gossip], likes: [tag:drink, tag:music, joke], dislikes: [work], hates: [family] }
    kade: { loves: [ships, work], likes: [tag:food, tag:competition], dislikes: [compliment_looks, weather], hates: [tease] }
  topics:
    ships: { label: "Ships and engines", category: interests }
    the_frontier: { label: "Life on the frontier", category: small_talk }
    old_wars: { label: "The old wars", category: personal, stage: close }
    fashion: false
    sport: false
  builtin_venues: false
  venues:
    cantina:
      name: The Dry Dock bar
      at: bar
      cost: 25
      activities:
        synth_shots: { label: "Do synth-shots", tags: [drink, thrill] }
        holo_darts: { label: "Play holo-darts", tags: [games, competition] }
        band: { label: "Dance to the house band", tags: [dance, music] }
        booth: { label: "Share a back booth", tags: [conversation, romance], romantic: true }
      events:
        brawl: { text: "A brawl breaks out two tables over.", enjoy: -6 }
        round: { text: "A stranger buys the table a round.", enjoy: 6 }
    observation:
      name: The observation deck
      cost: 0
      activities:
        stars: { label: "Name the constellations", tags: [calm, observation] }
        ships_pass: { label: "Watch the ships come in", tags: [observation, ships] }
        close: { label: "Sit close in the starlight", tags: [romance, calm], romantic: true }
        story: { label: "Trade stories", tags: [conversation, humor] }
      events:
        aurora: { text: "An ion storm lights up the dark outside.", enjoy: 10 }
        patrol: { text: "Station security moves everyone along for a while.", enjoy: -5 }
    market:
      name: A stroll through the concourse market
      at: concourse
      cost: 10
      activities:
        street_food: { label: "Try alien street food", tags: [food, thrill] }
        trinket: { label: "Buy them a trinket", tags: [gift, fun] }
        haggle: { label: "Haggle together", tags: [competition, humor] }
        fortune: { label: "Visit a fortune-reading drone", tags: [fun, observation] }
      events:
        pickpocket: { text: "Someone tries to lift a credit chip.", enjoy: -6 }
        festival: { text: "A dockworkers' festival spills into the market.", enjoy: 8 }

items:
  star_lily: { name: A star lily, tags: [gift] }

actions:
  buy_star_lily:
    label: Buy a star lily (30 cr)
    group: Trade
    at: [merchant]
    when: credits >= 30
    time: 5
    effects: { credits: -30, give: star_lily }
`
      }
    ]
  };
});

// src/engine/templates/questbound.ts
var questbound;
var init_questbound = __esm(() => {
  questbound = {
    id: "questbound",
    name: "Questbound (fantasy RPG)",
    blurb: "Fantasy adventure RPG: HP, stamina and mana; Might, Agility, Wits and Spirit with skills that grow (blades, archery, arcana, stealth, persuasion, survival, lore); spells and techniques with costs and uses (Firebolt, Mend, Haste, Second Wind, Vanish); levels with a pick-one-of-three perk; buffs and poisons; bounties; wolves, bandits and a barrow-wight you can beat by steel, spell or words; a dungeon under the barrow; a dark threat that grows on its own.",
    parts: [
      {
        label: "core",
        yaml: `name: Questbound
description: A frontier village, a road through dark woods, and a barrow that remembers an old war.

clock:
  start: Day 1 07:00
  minutes_per_action: 10
  narrator_max: 720

start:
  location: inn
  items: { short_sword: 1, healing_draught: 2, rations: 3, torch: 1 }

hud:
  currency: "g"
  bars: [hp, stamina, mana, xp]

narration:
  notes: A grounded fantasy world. Magic is rare and costs something; steel is honest; people remember favours.
`
      },
      {
        label: "stats",
        yaml: `stats:
  level: { kind: attribute, start: 1, max: 20 }
  xp:
    kind: meter
    label: XP
    start: 0
    max: level * 100
    good: none
    narrator: 50
  perk_points: { kind: attribute, label: Perk points, start: 1, max: 20 }
  hp:
    kind: meter
    label: HP
    max: 20 + might * 2 + level * 8
    start: 34
    per_hour: 3
    narrator: 15
    bands:
      0%: Down.
      10%: Barely standing.
      40%: Wounded.
      75%: Hale.
  stamina:
    kind: meter
    start: 100
    per_hour: 12
    narrator: 20
    bands:
      0: Spent.
      30: Winded.
      70: Fresh.
  mana:
    kind: meter
    max: 12 + wits * 2 + level * 3
    start: 21
    per_hour: 4
    narrator: 10
  gold:
    kind: money
    start: 25
    narrator: 40

  might:   { kind: attribute, start: 3, max: 10, desc: Strength — blows, carrying, forcing things. }
  agility: { kind: attribute, start: 3, max: 10, desc: Speed and balance — dodging, aiming, sneaking. }
  wits:    { kind: attribute, start: 3, max: 10, desc: Cleverness and magic. }
  spirit:  { kind: attribute, start: 3, max: 10, desc: Nerve, faith and presence. }

  blades:     { kind: skill, start: 20, max: 100, grades: [F, D, C, B, A, S] }
  archery:    { kind: skill, start: 10, max: 100, grades: [F, D, C, B, A, S] }
  arcana:     { kind: skill, start: 10, max: 100, grades: [F, D, C, B, A, S] }
  stealth:    { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  persuasion: { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  survival:   { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  lore:       { kind: skill, start: 10, max: 100, grades: [F, D, C, B, A, S] }
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
      bands: { 0: Hostile, 10: Wary, 35: Friendly, 65: Close, 90: Devoted }
    trust:
      start: 10
      narrator: 5
      bands: { 0: Suspicious, 30: Willing, 60: Trusting, 90: Unshakeable }
  people:
    marta:
      name: Marta
      desc: Keeps the Crooked Lantern. Hears everything, repeats what she likes.
      schedule:
        - { at: inn }
    aldous:
      name: Brother Aldous
      desc: The village priest. Kind, tired, and afraid of what's waking in the barrow.
      schedule:
        - { when: "between(hour, 6, 20)", at: temple }
        - { at: inn }
    wren:
      name: Wren
      desc: A ranger who works the forest road. Competes for the same bounties — and keeps secrets.
      schedule:
        - { when: "between(hour, 7, 18)", at: forest_road }
        - { at: inn }
    hesk:
      name: Guildmaster Hesk
      desc: Runs the adventurers' guild. Pays well, forgives nothing.
      schedule:
        - { when: "between(hour, 8, 20)", at: guild_hall }
`
      },
      {
        label: "world",
        yaml: `locations:
  inn:
    name: The Crooked Lantern
    desc: A smoky inn with a hearth, a notice board and rooms upstairs.
    indoors: true
    exits: [village_square]
    travel: 2
  village_square:
    name: Village Square
    desc: A well, a market, the temple steps and the guild's iron sign.
    exits: [inn, market, temple, guild_hall, forest_road]
    travel: 5
  market:
    name: Market Stalls
    desc: Herbs, draughts, arrows and second-hand gear.
    exits: [village_square]
  temple:
    name: Temple of the Dawn
    desc: Cold stone, warm candles. Brother Aldous tends both.
    indoors: true
    exits: [village_square]
  guild_hall:
    name: Adventurers' Guild
    desc: Bounty boards, a training yard and Hesk's ledger.
    indoors: true
    exits: [village_square]
  forest_road:
    name: The Forest Road
    desc: A rutted road under old pines. Wolves, bandits, and worse after dark.
    exits: [village_square, old_bridge, barrow_ruins]
    travel: 40
  old_bridge:
    name: The Old Bridge
    desc: A mossy stone bridge over a fast river — a natural place for a toll, or an ambush.
    exits: [forest_road]
    travel: 20
  barrow_ruins:
    name: The Barrow
    desc: A grassy mound ringed with standing stones. The air is colder near the door.
    exits: [forest_road]
    travel: 30

items:
  short_sword: { name: Short sword, bonus: { blades: 10 } }
  longbow: { name: Longbow, bonus: { archery: 15 } }
  lockpicks: { name: Lockpicks, uses: 5, bonus: { stealth: 10 } }
  holy_symbol: { name: Holy symbol, bonus: { spirit: 2 } }
  healing_draught: { name: Healing draught, uses: 1, use: { label: Drink a healing draught, hp: +20, remove_condition: [bleeding] } }
  mana_tonic: { name: Mana tonic, uses: 1, use: { label: Drink a mana tonic, mana: +15 } }
  antidote: { name: Antidote, uses: 1, use: { label: Drink the antidote, remove_condition: [poisoned] } }
  rations: { name: Rations, uses: 1, use: { label: Eat a ration, stamina: +30 } }
  torch: { name: Torch, keep: true, bonus: { survival: 5 } }
  wolf_pelt: { name: Wolf pelt }

conditions:
  poisoned: { label: Poisoned, tone: bad, narrator: true, bonus: { might: -1, agility: -1 } }
  bleeding: { label: Bleeding, tone: bad, narrator: true }
  hasted: { label: Hasted, tone: good, bonus: { agility: 3 } }
  blessed: { label: Blessed, tone: good, bonus: { spirit: 2, persuasion: 10 } }
  inspired: { label: Inspired, tone: good, bonus: { might: 2 } }
  exhausted: { label: Exhausted, tone: bad, narrator: true, bonus: { might: -2, agility: -2 } }

flags:
  bounty_wolves: { start: false }
  bounty_bandits: { start: false }
`
      },
      {
        label: "actions",
        yaml: `actions:
  rest:
    label: Take a room for the night (5g)
    group: Rest
    at: inn
    when: gold >= 5
    say: "*I pay for a room and sleep.*"
    time: 480
    effects: { gold: -5, hp: +40, stamina: +100, mana: +30, remove_condition: [exhausted] }
  rumours:
    label: Listen for rumours
    group: Social
    at: inn
    say: "*I nurse a drink and listen.*"
    time: 30
    check: { chance: "30 + persuasion / 2 + spirit * 3", label: Persuasion }
    success: { xp: +5, hint: "A useful rumour: a bounty, a lead on the barrow, or a warning about the road." }
    fail: { hint: "Nothing but gossip about the miller's goat." }
  wolf_bounty:
    label: Take the wolf bounty
    group: Guild
    at: guild_hall
    when: not flag('bounty_wolves')
    say: "*I take the wolf bounty off the board.*"
    effects: { flags: { bounty_wolves: true }, hint: "Hesk: wolves have been taking travellers on the forest road. Ten gold a pelt, thirty for clearing the pack." }
  bandit_bounty:
    label: Take the bridge bounty
    group: Guild
    at: guild_hall
    when: not flag('bounty_bandits') and level >= 2
    why_not: "Hesk wants level 2 for this one"
    say: "*I take the bounty on the bridge bandits.*"
    effects: { flags: { bounty_bandits: true }, hint: "Hesk: bandits are charging a toll at the old bridge. Get it open again — however you like." }
  spar:
    label: Spar in the training yard
    group: Guild
    at: guild_hall
    say: "*I pick up a practice blade and find a sparring partner.*"
    time: 60
    cost: { stamina: -20 }
    check: { chance: "35 + blades / 2 + might * 3", label: Blades }
    success: { xp: +15 }
    fail: { xp: +5, hp: -4 }
  study:
    label: Study old texts
    group: Temple
    at: temple
    say: "*I ask Brother Aldous for the old texts and read by candlelight.*"
    time: 120
    check: { chance: "35 + lore / 2 + wits * 3", label: Lore }
    success: { xp: +10, arcana: +1, hint: "The texts speak of the barrow-king's oath and the dawn-blessing that broke him once before." }
    fail: { mana: +5, hint: "Dry reading, but the quiet helps." }
  holy_symbol:
    label: Take a holy symbol (donate 25g)
    group: Temple
    at: temple
    when: gold >= 25 and not has('holy_symbol')
    say: "*I make a donation and accept a holy symbol from Brother Aldous.*"
    effects: { gold: -25, give: holy_symbol, rel: { aldous: { trust: +3 } } }
  pray:
    label: Pray for a blessing (donate 5g)
    group: Temple
    at: temple
    when: gold >= 5
    say: "*I leave a few coins and kneel.*"
    time: 20
    effects: { gold: -5, add_condition: { blessed: 240 }, remove_condition: [poisoned] }
  buy_draught:
    label: Buy a healing draught (12g)
    group: Market
    at: market
    when: gold >= 12
    say: "*I buy a healing draught.*"
    effects: { gold: -12, give: healing_draught }
  buy_tonic:
    label: Buy a mana tonic (15g)
    group: Market
    at: market
    when: gold >= 15
    say: "*I buy a mana tonic.*"
    effects: { gold: -15, give: mana_tonic }
  buy_antidote:
    label: Buy an antidote (8g)
    group: Market
    at: market
    when: gold >= 8
    say: "*I buy an antidote.*"
    effects: { gold: -8, give: antidote }
  buy_bow:
    label: Buy a longbow (40g)
    group: Market
    at: market
    when: gold >= 40 and not has('longbow')
    say: "*I buy the longbow.*"
    effects: { gold: -40, give: longbow }
  buy_picks:
    label: Buy lockpicks (20g)
    group: Market
    at: market
    when: gold >= 20 and not has('lockpicks')
    say: "*I buy a set of lockpicks.*"
    effects: { gold: -20, give: lockpicks }
  sell_pelt:
    label: Sell a wolf pelt (10g)
    group: Market
    at: market
    when: has('wolf_pelt')
    say: "*I sell a wolf pelt.*"
    effects: { take: wolf_pelt, gold: +10 }
  odd_jobs:
    label: Do odd jobs around the square
    group: Work
    at: village_square
    say: "*I ask around for work — hauling, mending, minding stalls.*"
    time: 120
    cost: { stamina: -15 }
    check: { chance: "45 + might * 3", label: Might }
    success: { gold: +8, xp: +5 }
    fail: { gold: +3 }
  notice_board:
    label: Read the notice board
    group: Explore
    at: village_square
    say: "*I read the notices pinned by the well.*"
    time: 10
    check: { chance: "40 + lore / 2 + wits * 3", label: Lore }
    success: { xp: +5, hint: "A notice worth following: a bounty, a missing person, or a warning about the barrow." }
    fail: { hint: "Lost cats and grain prices." }
  forage:
    label: Forage along the road
    group: Explore
    at: forest_road
    say: "*I search the roadside for herbs and game.*"
    time: 45
    cost: { stamina: -10 }
    check: { chance: "35 + survival / 2 + wits * 2", label: Survival }
    success: { give: rations, xp: +5 }
    fail: { start_encounter: wolves }
  hunt_wolves:
    label: Track the wolf pack
    group: Explore
    at: forest_road
    when: flag('bounty_wolves')
    say: "*I follow the wolf tracks off the road.*"
    time: 30
    effects: { start_encounter: wolves }
  cross_bridge:
    label: Cross the old bridge
    group: Explore
    at: old_bridge
    say: "*I walk onto the bridge.*"
    time: 5
    effects: { start_encounter: bandits }
  talk:
    label: Talk to {target}
    group: Social
    per_person: true
    say: "*I talk with {target} for a while.*"
    time: 15
    effects: { rel: { target: { affinity: +2 } } }
  persuade:
    label: Ask {target} for a favour
    group: Social
    per_person: true
    say: "*I ask {target} for help.*"
    time: 15
    check: { chance: "20 + persuasion / 2 + spirit * 3 + target.trust / 4", label: Persuasion }
    success: { rel: { target: { trust: +4 } }, hint: "{target} agrees to help, in their own way." }
    fail: { rel: { target: { affinity: -2 } }, hint: "{target} turns it down." }
`
      },
      {
        label: "encounters",
        yaml: `# Fights are small puzzles: each foe has more than one way to beat it, and your
# own abilities (spells, techniques) are offered alongside these moves.
encounters:
  wolves:
    name: The Wolf Pack
    desc: Grey wolves circle {{user}} on the forest road.
    tags: [violence]
    goal: Cut the pack down, or break its nerve and send it running
    foe:
      name: Grey Wolves
      stats:
        hp: { label: HP, start: 24, max: 24 }
        nerve: { label: Nerve, start: 12, max: 12 }
    actions:
      strike:
        label: Strike
        cost: { stamina: -8 }
        check: { chance: "35 + blades / 2 + might * 3", label: Blades }
        crit_success: { foe: { hp: "-(10 + might * 2)", nerve: -3 } }
        success: { foe: { hp: "-(6 + might)" } }
        fail: { stamina: -5 }
      shoot:
        label: Loose an arrow
        when: has('longbow')
        cost: { stamina: -4 }
        check: { chance: "30 + archery / 2 + agility * 3", label: Archery }
        success: { foe: { hp: "-(5 + agility * 2)" } }
        fail: { hint: "The arrow thuds into a tree." }
      brandish:
        label: Brandish the torch
        when: has('torch')
        check: { chance: "40 + spirit * 4", label: Spirit }
        success: { foe: { nerve: -6 } }
        fail: { hint: "The wolves flinch, then close in again." }
      climb:
        label: Climb a tree
        cost: { stamina: -12 }
        check: { chance: "10 + survival / 2 + agility * 2", label: Survival }
        success: { end: escaped }
        fail: { hp: -6, hint: "A wolf catches {{user}}'s boot and drags them back down." }
    foe_moves:
      bite: { desc: "Lunges and bites", weight: 3, hp: -6 }
      hamstring: { desc: "Goes for the legs", weight: 1, hp: -3, add_condition: { bleeding: 30 } }
      howl: { desc: "Howls to rally the pack", weight: 1, stamina: -6 }
    end_when:
      won: foe.hp <= 0
      scattered: foe.nerve <= 0
      beaten: hp <= 0
    labels: { won: The pack is dead, scattered: The pack runs, escaped: You got up a tree, beaten: The wolves dragged you down }
    outcomes:
      won: { xp: +40, give: wolf_pelt, gold: "flag('bounty_wolves') ? 30 : 0", flags: { bounty_wolves: false } }
      scattered: { xp: +30, gold: "flag('bounty_wolves') ? 20 : 0", flags: { bounty_wolves: false } }
      escaped: { stamina: -10, hint: "{{user}} waits in the branches until the pack loses interest." }
      beaten: { set: { hp: 1 }, gold: "-min(gold, 10)", hint: "{{user}} comes to on the road, mauled and lighter in the purse — a passing cart picked them up." }

  bandits:
    name: Toll at the Old Bridge
    desc: Bandits block the bridge and want gold to let {{user}} pass.
    tags: [violence]
    goal: Get across — pay, talk them out of it, slip past, or put them down
    foe:
      name: Bandit Captain
      stats:
        resolve: { label: Resolve, start: 16, max: 16 }
        hp: { label: HP, start: 30, max: 30 }
    actions:
      pay:
        label: Pay the toll (15g)
        when: gold >= 15
        effects: { gold: -15, end: paid }
      parley:
        label: Talk them down
        check: { chance: "30 + persuasion / 2 + spirit * 3", label: Persuasion }
        success: { foe: { resolve: -6 } }
        fail: { foe: { resolve: +2 }, hint: "The captain laughs it off." }
      intimidate:
        label: Intimidate
        check: { chance: "25 + might * 4 + level * 2", label: Might }
        success: { foe: { resolve: -8 } }
        fail: { hint: "Nobody's impressed." }
      fight:
        label: Fight
        cost: { stamina: -8 }
        check: { chance: "35 + blades / 2 + might * 3", label: Blades }
        success: { foe: { hp: "-(6 + might)", resolve: -2 } }
        fail: { hp: -5 }
      sneak:
        label: Slip past in the reeds
        cost: { stamina: -6 }
        check: { chance: "25 + stealth / 2 + agility * 3", label: Stealth }
        success: { end: slipped_by }
        fail: { foe: { resolve: +3 }, hint: "A sentry spots {{user}} in the reeds." }
    foe_moves:
      threaten: { desc: "Threatens {{user}}", weight: 2, stamina: -4 }
      swing: { desc: "Swings a cudgel", weight: 2, hp: -6 }
      call_out: { desc: "Calls more bandits from the trees", weight: 1, foe: { resolve: +3 } }
    end_when:
      backed_down: foe.resolve <= 0
      won: foe.hp <= 0
      beaten: hp <= 0
    labels: { backed_down: The bandits let you pass, won: The bandits are beaten, paid: You paid your way across, slipped_by: You slipped past unseen, beaten: The bandits beat you and took your purse }
    outcomes:
      backed_down: { xp: +50, gold: "flag('bounty_bandits') ? 40 : 0", flags: { bounty_bandits: false } }
      won: { xp: +60, gold: "20 + (flag('bounty_bandits') ? 40 : 0)", flags: { bounty_bandits: false } }
      paid: { xp: +5 }
      slipped_by: { xp: +30 }
      beaten: { set: { hp: 1 }, gold: "-min(gold, 20)" }

  wight:
    name: The Barrow-Wight
    desc: Something in old armour climbs out of the barrow, cold light where its eyes should be.
    tags: [violence, horror]
    goal: Destroy it, or break the oath that binds it with a dawn-blessing
    foe:
      name: Barrow-Wight
      stats:
        hp: { label: HP, start: 45, max: 45 }
        oath: { label: Oath, start: 20, max: 20 }
    actions:
      strike:
        label: Strike
        cost: { stamina: -8 }
        check: { chance: "30 + blades / 2 + might * 3", label: Blades }
        success: { foe: { hp: "-(5 + might) * (cond('blessed') ? 2 : 1)" } }
        fail: { hp: -4 }
      rite:
        label: Speak the dawn-rite
        when: has('holy_symbol') or cond('blessed')
        why_not: "Needs a holy symbol or a blessing"
        check: { chance: "25 + lore / 2 + spirit * 4", label: Lore }
        success: { foe: { oath: -8 } }
        fail: { mana: -4 }
      flee:
        label: Run for the treeline
        cost: { stamina: -15 }
        check: { chance: "35 + agility * 4", label: Agility }
        success: { end: fled }
        fail: { hp: -6 }
    foe_moves:
      grave_chill: { desc: "Breathes a grave-chill", weight: 2, stamina: -12 }
      blade: { desc: "Swings a rusted blade", weight: 2, hp: -8 }
      dread: { desc: "Fills the air with dread", weight: 1, mana: -5 }
    end_when:
      destroyed: foe.hp <= 0
      released: foe.oath <= 0
      beaten: hp <= 0
    labels: { destroyed: The wight falls apart, released: The oath breaks and the wight rests, fled: You ran, beaten: The wight's chill takes you }
    outcomes:
      destroyed: { xp: +100, gold: +40, flags: { barrow_quiet: true } }
      released: { xp: +140, flags: { barrow_quiet: true }, rel: { aldous: { trust: +20 } } }
      fled: { stamina: -20 }
      beaten: { set: { hp: 1 }, add_condition: { exhausted: 480 }, hint: "{{user}} wakes at the temple; Brother Aldous found them at the barrow's edge." }

dungeons:
  barrow:
    name: The Barrow Halls
    desc: Burial halls under the mound, deeper than any barrow has a right to be.
    at: [barrow_ruins]
    theme: crypt
    floors: 15
    party: { max: 3 }
    player: { class: adventurer, hp: "30 + might * 5 + level * 8", atk: "6 + might * 1.5 + blades / 10", def: "6 + might", mat: "6 + wits * 1.5 + arcana / 10", agi: "6 + agility * 1.2" }
    currency: gold
    loot: { healing_draught: 3, mana_tonic: 2, antidote: 1 }
    on_leave: { stamina: -20 }
    on_defeat: { hp: -20, gold: "-min(gold, 30)" }
`
      },
      {
        label: "journal",
        yaml: `# The player's own moves. Firebolt is known once arcana is high enough; the
# others are taught by perks. Second Wind everyone knows.
abilities:
  second_wind:
    name: Second Wind
    desc: Grit your teeth and push through
    cost: { stamina: -15 }
    hp: "+(8 + might * 2)"
    per_encounter: 1
  firebolt:
    name: Firebolt
    desc: A bolt of fire from the palm
    where: encounter
    known: "arcana >= 30"
    cost: { mana: -6 }
    check: { chance: "35 + arcana / 2 + wits * 3", label: Arcana }
    success: { harm: "8 + arcana / 5" }
    fail: { hint: "The fire gutters out in {{user}}'s hand." }
  mend:
    name: Mend
    desc: Knit flesh with a whispered word
    cost: { mana: -8 }
    hp: "+(10 + arcana / 4)"
    remove_condition: [bleeding]
  haste:
    name: Haste
    desc: The world slows; {{user}} doesn't
    cost: { mana: -5 }
    add_condition: { hasted: 3 }
    per_encounter: 1
  battle_cry:
    name: Battle Cry
    desc: A roar that steadies the arm
    where: encounter
    cost: { stamina: -8 }
    add_condition: { inspired: 3 }
    per_encounter: 1
  vanish:
    name: Vanish
    desc: Step into a shadow and out of the fight
    where: encounter
    cost: { stamina: -10 }
    per_day: 1
    check: { chance: "30 + stealth / 2 + agility * 3", label: Stealth }
    success: { end: escaped }
    fail: { hint: "{{user}} steps into the shadow — and is still seen." }

# One point per level; each point offers three perks to choose from.
perks:
  points: perk_points
  pick: 3
  blade_dancer:
    name: Blade Dancer
    desc: Fights like a duelist while there's breath in them.
    tags: [blades]
    edge: { blades: 15, when: "stamina >= 50" }
    narrator: "{{user}} moves with a duelist's economy — no wasted motion."
  hedge_mage:
    name: Hedge Mage
    desc: A village witch's tricks.
    tags: [arcana]
    abilities: [mend, haste]
    bonus: { arcana: 5 }
  arcane_scholar:
    name: Arcane Scholar
    desc: Mana returns faster; spells come easier.
    requires: "arcana >= 25"
    bonus: { arcana: 10 }
    rule: { gains: { mana: "+50%" } }
  shadow_step:
    name: Shadow Step
    desc: The dark is a friend.
    tags: [stealth]
    abilities: [vanish]
    edge: { stealth: 15, when: "hour >= 20 or hour < 5" }
  battle_hardened:
    name: Battle-Hardened
    desc: Wounds land lighter.
    rule: { losses: { hp: "-20%" } }
    narrator: "{{user}} carries old scars and shrugs off blows that would fell others."
  lucky:
    name: Lucky
    desc: Once a day, fortune turns a failure around.
    rule: { reroll: { per_day: 1 } }
  silver_tongue:
    name: Silver Tongue
    desc: Even a bad pitch half-works.
    bonus: { persuasion: 5 }
    rule: { soften: { stats: [persuasion], per_day: 2 } }
  woodwise:
    name: Woodwise
    desc: At home under the pines.
    bonus: { survival: 15 }
    edge: { archery: 10, when: "at('forest_road')" }
    narrator: "Animals read {{user}} as one of their own; birds don't go quiet when they pass."
  warlord:
    name: Warlord's Voice
    desc: Commands, and people listen.
    abilities: [battle_cry]
    bonus: { persuasion: 5 }
  berserker:
    name: Berserker
    desc: Strongest when hurt.
    edge: { might: 3, when: "hp < 15" }
    drawback: { desc: "Stamina burns faster", losses: { stamina: "+25%" } }
    excludes: [battle_hardened]

codex:
  village: { title: The Village, category: Places, text: "A frontier village at the edge of the old woods, too small for a wall and too stubborn to leave.", unlock: "location == 'village_square'" }
  road: { title: The Forest Road, category: Places, text: "The only road out. Wolves by day, bandits at the bridge, worse at night.", unlock: "location == 'forest_road'" }
  barrow: { title: The Barrow, category: Places, text: "The grave of the barrow-king, who swore an oath to guard the valley and kept it past death.", unlock: "location == 'barrow_ruins'" }
  wights: { title: Barrow-Wights, category: Threats, text: "Oath-bound dead. Steel hurts them; a dawn-blessing hurts them more; breaking the oath frees them.", unlock: "flag('barrow_quiet') or level >= 3" }

feats:
  first_blood: { name: First blood, desc: "Win your first fight.", unlock: "xp >= 40 or level >= 2" }
  pack_breaker: { name: Pack-breaker, desc: "Clear the wolf bounty.", unlock: "has('wolf_pelt')", reward: { perk_points: +1 } }
  oathbreaker: { name: Oathbreaker, desc: "Lay the barrow-wight to rest.", unlock: "flag('barrow_quiet')", reward: { xp: +50, perk_points: +1 } }
`
      },
      {
        label: "rules",
        yaml: `flags:
  barrow_quiet: { start: false }

triggers:
  fight_starts:
    when_scene: "A fight has broken out and {{user}} is in it"
    do: { start_encounter: wolves }
  level_up:
    when: xp >= level * 100
    repeat: true
    do:
      set: { xp: 0 }
      level: +1
      perk_points: +1
      hp: +15
      hint: "Level up! {{user}} feels stronger — and a new perk is theirs to choose."
  bleeding_out:
    when: cond('bleeding')
    repeat: true
    do: { hp: -2 }
  poison:
    when: cond('poisoned')
    repeat: true
    do: { hp: -1, stamina: -3 }
  worn_out:
    when: stamina <= 0
    do: { add_condition: { exhausted: 240 }, hint: "{{user}} is running on nothing." }
`
      },
      {
        label: "story",
        yaml: `secrets:
  wren_oath:
    about: Wren
    cue: "Wren never goes near the barrow and touches an old ring whenever it's mentioned."
    tell: exists
    stages:
      - when: "rel('wren', 'trust') >= 50"
        text: "Wren is the barrow-king's last descendant. The ring is his seal — and the key to breaking his oath."
      - when: "rel('wren', 'trust') >= 80"
        text: "Wren has been feeding the wight's oath with their own blood each new moon, believing it keeps the valley safe."

fronts:
  barrow_wakes:
    label: The barrow wakes
    per_day: 10
    story:
      "{{user}} disturbs the barrow or its dead": 15
      "{{user}} brings a blessing or the dawn-rite to the barrow": -10
    stages:
      - at: 30
        hint: "Livestock won't graze near the forest road anymore."
        backstage: "The wight has begun walking the barrow's edge at night."
        surface: "A traveller stumbles into the inn, pale, babbling about cold light in the trees."
        news: "Something walks near the barrow at night."
      - at: 70
        hint: "Frost on the temple steps in summer."
        backstage: "The wight's oath has turned to the village itself."
        surface: "The barrow-wight comes for whoever is nearest the road."
        news: "The barrow-wight walked."
        do: { start_encounter: wight }

random_events:
  pace: { per_day: 20, jitter: 0.3, rest_days: 2, omen_at: 80 }
  events:
    caravan:
      label: A merchant caravan
      omen: "Wheel ruts and fresh dung on the road — traders are coming."
      text: "A merchant caravan stops in the square with goods from the city."
      cooldown: 6
      do: { gold: +5 }
    storm:
      label: A storm
      omen: "The wind smells of iron and the birds have gone quiet."
      text: "A storm rolls in off the hills and the road turns to mud."
      cooldown: 8
      do: { stamina: -10 }

live_choices:
  label: Right now
  count: 3
  when: not in_encounter
  tags:
    daring:
      desc: "A bold, risky or athletic move"
      check: { chance: "35 + agility * 4", label: Agility }
      success: { xp: +10 }
      fail: { hp: -5 }
    charm:
      desc: "Winning someone here over, bargaining or talking"
      per_person: true
      check: { chance: "30 + persuasion / 2 + spirit * 3", label: Persuasion }
      success: { rel: { target: { affinity: +3, trust: +2 } } }
      fail: { rel: { target: { affinity: -2 } } }
    clever:
      desc: "Noticing, recalling lore, working something out"
      check: { chance: "30 + lore / 2 + wits * 3", label: Lore }
      success: { xp: +10 }
      fail: { stamina: -5 }
    careful:
      desc: "The cautious option: waiting, watching, backing off"
      effects: { stamina: +5 }
`
      }
    ]
  };
});

// src/engine/templates/casefile.ts
var casefile;
var init_casefile = __esm(() => {
  casefile = {
    id: "casefile",
    name: "Casefile (noir mystery)",
    blurb: "Noir mystery: a private eye in a city that lies. Grit, Nerve and Heat; cash and rent; Deduction, Streetwise, Charm, Intimidation, Stealth and Shooting that grow; a hidden truth revealed one clue at a time; interrogations you win by breaking a suspect's composure (or catching a lie), a tail through the rain, a shakedown in an alley; detective abilities (Cold Read, Lean On Them, Hunch); perks picked from three; a killer who covers their tracks while you're slow.",
    parts: [
      {
        label: "core",
        yaml: `name: Casefile
description: A private eye, a dead councilman, and a city where everyone's lying about something.

clock:
  start: Mon 09:00
  minutes_per_action: 15
  narrator_max: 480

start:
  location: office
  items: { revolver: 1, notebook: 1, cigarettes: 2 }

hud:
  currency: "$"
  bars: [grit, nerve, heat, clues]

narration:
  notes: Hardboiled, rain-slick, first-person-friendly. People lie; the narrator never reveals the truth beyond what the secrets say is known.
`
      },
      {
        label: "stats",
        yaml: `stats:
  grit:
    kind: meter
    start: 80
    per_hour: 2
    narrator: 15
    bands: { 0: Out cold., 20: Hurting bad., 50: Bruised., 80: Holding up. }
  nerve:
    kind: meter
    start: 70
    per_hour: 1
    narrator: 15
    bands: { 0: Shaking., 30: Rattled., 60: Steady., 85: Ice-cold. }
  heat:
    kind: meter
    label: Heat
    good: low
    start: 10
    per_hour: -0.5
    narrator: 10
    bands: { 0: Nobody's looking., 40: The cops know your name., 70: Wanted for questions., 90: Every cop in town. }
  clues:
    kind: meter
    label: Clues
    start: 0
    max: 10
    good: high
    narrator: 1
  cash:
    kind: money
    start: 60
    narrator: 30

  deduction:    { kind: skill, start: 25, max: 100, grades: [F, D, C, B, A, S] }
  streetwise:   { kind: skill, start: 20, max: 100, grades: [F, D, C, B, A, S] }
  charm:        { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  intimidation: { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  stealth:      { kind: skill, start: 15, max: 100, grades: [F, D, C, B, A, S] }
  shooting:     { kind: skill, start: 20, max: 100, grades: [F, D, C, B, A, S] }
  perk_points:  { kind: attribute, label: Perk points, start: 1, max: 20 }
`
      },
      {
        label: "people",
        yaml: `relationships:
  open: true
  stats:
    trust:
      start: 10
      narrator: 5
      bands: { 0: Hostile, 15: Guarded, 40: Talking, 70: Confiding, 90: Loyal }
  people:
    vera:
      name: Vera Lyle
      desc: The councilman's widow. Hired you. Grieves on schedule.
      schedule:
        - { when: "between(hour, 10, 22)", at: uptown }
    sal:
      name: Sal
      desc: Runs the Blue Note. Knows every debt in the Narrows.
      schedule:
        - { when: "hour >= 18 or hour < 3", at: jazz_club }
    okafor:
      name: Detective Okafor
      desc: Homicide. Honest, tired, and not a fan of private eyes.
      schedule:
        - { when: "between(hour, 8, 20)", at: precinct }
    finch:
      name: Finch
      desc: The councilman's aide. Nervous hands, expensive shoes.
      schedule:
        - { when: "between(hour, 9, 18)", at: city_hall }
        - { at: jazz_club }
`
      },
      {
        label: "world",
        yaml: `locations:
  office:
    name: Your Office
    desc: Frosted glass, a dead fern, a bottle in the drawer and a cot behind the filing cabinet.
    indoors: true
    exits: [the_narrows]
    travel: 5
  the_narrows:
    name: The Narrows
    desc: Wet alleys, pawn shops, a newsstand that hears everything.
    exits: [office, jazz_club, docks, precinct, uptown, city_hall]
    travel: 10
  jazz_club:
    name: The Blue Note
    desc: Smoke, a tired trumpet, and booths where deals get made.
    indoors: true
    exits: [the_narrows]
  precinct:
    name: 9th Precinct
    desc: Green walls, bad coffee, and files you aren't supposed to see.
    indoors: true
    exits: [the_narrows]
  uptown:
    name: The Lyle House
    desc: A big house on the hill with the curtains drawn.
    indoors: true
    exits: [the_narrows]
    travel: 25
  city_hall:
    name: City Hall
    desc: Marble, money and the councilman's empty office.
    indoors: true
    exits: [the_narrows]
    travel: 15
  docks:
    name: The Docks
    desc: Fog, cranes, and warehouses with no names on them.
    exits: [the_narrows]
    travel: 20

items:
  revolver: { name: Revolver, keep: true, bonus: { shooting: 10, intimidation: 5 } }
  notebook: { name: Notebook, keep: true, bonus: { deduction: 5 } }
  cigarettes: { name: Cigarettes, uses: 1, use: { label: Light a cigarette, nerve: +10 } }
  bottle: { name: Bottle of rye, uses: 3, use: { label: Take a pull from the bottle, nerve: +15, grit: +5, add_condition: { hungover: 240 } } }
  press_pass: { name: Forged press pass, keep: true, bonus: { charm: 10 } }
  ledger: { name: The councilman's ledger }

conditions:
  read_them: { label: Read them, tone: good, bonus: { deduction: 15, charm: 10 } }
  leaned_on: { label: Leaned on, tone: good, bonus: { intimidation: 15 } }
  hungover: { label: Hungover, tone: bad, narrator: true, bonus: { deduction: -10, shooting: -10 } }
  shot: { label: Shot, tone: bad, narrator: true, bonus: { shooting: -10, stealth: -10 } }
`
      },
      {
        label: "actions",
        yaml: `actions:
  sleep:
    label: Sleep it off on the cot
    group: Office
    at: office
    say: "*I kick off my shoes and sleep on the cot.*"
    time: 420
    effects: { grit: +40, nerve: +30, remove_condition: [hungover, shot] }
  case_board:
    label: Work the case board
    group: Office
    at: office
    say: "*I pin what I've got to the wall and stare at it.*"
    time: 60
    check: { chance: "25 + deduction / 2 + clues * 3", label: Deduction }
    success: { clues: +1, hint: "Two loose threads tie together." }
    fail: { nerve: -5, hint: "The pieces won't fit tonight." }
  buy_bottle:
    label: Buy a bottle of rye ($12)
    group: Shopping
    at: the_narrows
    when: cash >= 12
    say: "*I buy a bottle at the corner liquor store.*"
    effects: { cash: -12, give: bottle }
  newsstand:
    label: Work the newsstand for gossip
    group: Legwork
    at: the_narrows
    say: "*I buy a paper and ask the kid what he's heard.*"
    time: 20
    check: { chance: "30 + streetwise / 2", label: Streetwise }
    success: { cash: -2, clues: +1, hint: "The kid saw something on the night of the murder." }
    fail: { cash: -2, hint: "The kid's just selling papers today." }
  pass:
    label: Buy a forged press pass ($40)
    group: Shopping
    at: the_narrows
    when: cash >= 40 and not has('press_pass')
    say: "*I pay the forger in the pawn shop's back room.*"
    effects: { cash: -40, give: press_pass, heat: +3 }
  files:
    label: Sneak a look at the case files
    group: Legwork
    at: precinct
    say: "*I wait for the desk sergeant to look away and slip into records.*"
    time: 30
    check: { chance: "25 + stealth / 2", label: Stealth }
    success: { clues: +2, hint: "The autopsy says the councilman was dead before the fall." }
    fail: { heat: +15, hint: "Okafor catches {{user}} in records and isn't amused." }
  search_office:
    label: Search the councilman's office
    group: Legwork
    at: city_hall
    when: not has('ledger')
    say: "*I let myself into the dead man's office.*"
    time: 45
    check: { chance: "30 + stealth / 2 + deduction / 4", label: Stealth }
    success: { give: ledger, clues: +2, hint: "A ledger taped under the drawer: payments to a shell company on the docks." }
    fail: { heat: +10, start_encounter: tail }
  stake_out:
    label: Stake out the warehouses
    group: Legwork
    at: docks
    say: "*I find a dark doorway and watch the warehouses.*"
    time: 120
    cost: { nerve: -10 }
    check: { chance: "30 + stealth / 2 + streetwise / 4", label: Stealth }
    success: { clues: +2, hint: "A car from City Hall pulls up at midnight. Finch gets out." }
    fail: { start_encounter: shakedown }
  odd_case:
    label: Take a small-time case ($)
    group: Work
    at: office
    say: "*I take a walk-in job: a cheating husband, a missing dog.*"
    time: 240
    check: { chance: "45 + streetwise / 3", label: Streetwise }
    success: { cash: +40 }
    fail: { cash: +15 }
  rent:
    label: Pay the office rent ($50)
    group: Office
    at: office
    when: cash >= 50
    say: "*I pay the landlord before he changes the locks.*"
    effects: { cash: -50, nerve: +5 }
  question:
    label: Question {target}
    group: Legwork
    per_person: true
    say: "*I sit down across from {target} and start asking questions.*"
    time: 20
    effects: { start_encounter: interrogation }
  chat:
    label: Talk with {target}
    group: Social
    per_person: true
    say: "*I talk with {target}, off the record.*"
    time: 15
    check: { chance: "30 + charm / 2 + target.trust / 4", label: Charm }
    success: { rel: { target: { trust: +4 } } }
    fail: { rel: { target: { trust: -1 } } }
`
      },
      {
        label: "encounters",
        yaml: `# Not every encounter is a fight. An interrogation is won by breaking the
# suspect's composure or catching their lie before your own nerve goes.
encounters:
  interrogation:
    name: Interrogation
    desc: "{{user}} questions someone who'd rather not answer."
    goal: Break their composure, or catch the lie, before your nerve gives out
    foe:
      name: The suspect
      stats:
        composure: { label: Composure, start: 12, max: 12 }
        lie: { label: Lie exposed, start: 0, max: 10, good: high }
    actions:
      press:
        label: Press the story
        check: { chance: "30 + deduction / 2 + clues * 3", label: Deduction }
        success: { foe: { lie: +3, composure: -2 } }
        fail: { nerve: -4, hint: "The story holds — for now." }
      charm:
        label: Get them comfortable
        check: { chance: "30 + charm / 2", label: Charm }
        success: { foe: { composure: -5 } }
        fail: { hint: "They don't warm up." }
      threaten:
        label: Lean on them
        check: { chance: "25 + intimidation / 2", label: Intimidation }
        success: { foe: { composure: -7 }, heat: +3 }
        fail: { heat: +5, nerve: -4, hint: "They call your bluff." }
      evidence:
        label: Lay the ledger on the table
        when: has('ledger')
        why_not: "Needs hard evidence"
        effects: { foe: { lie: +5, composure: -4 } }
      walk:
        label: Walk away
        when: round >= 2
        why_not: "Give it a round first"
        effects: { end: walked }
    foe_moves:
      deflect: { desc: "Changes the subject", weight: 3, nerve: -3 }
      lawyer: { desc: "Threatens to call a lawyer", weight: 1, heat: +4 }
      tears: { desc: "Breaks down, or pretends to", weight: 1, foe: { composure: +3 } }
    end_when:
      cracked: foe.composure <= 0
      caught: foe.lie >= 10
      rattled: nerve <= 0
    labels: { cracked: They cracked, caught: You caught the lie, walked: You walked away, rattled: You lost your nerve first }
    outcomes:
      cracked: { clues: +2, perk_points: +1, hint: "They talk — part of it true, part of it what they think {{user}} wants to hear." }
      caught: { clues: +3, perk_points: +1, hint: "The lie comes apart in their hands, and the real story starts to leak out." }
      walked: { nerve: +5 }
      rattled: { heat: +5, hint: "{{user}} leaves with nothing but a headache." }

  tail:
    name: The Tail
    desc: Someone's following {{user}} through the rain — or {{user}} is following them.
    goal: Lose them in the crowd, or turn it round and catch them
    foe:
      name: Man in a grey coat
      stats:
        distance: { label: Distance, start: 10, max: 20, good: high }
        cornered: { label: Cornered, start: 0, max: 10, good: high }
    actions:
      lose:
        label: Duck through the crowd
        check: { chance: "30 + stealth / 2 + streetwise / 4", label: Stealth }
        success: { foe: { distance: +5 } }
        fail: { foe: { distance: -2 } }
      corner:
        label: Double back and corner him
        check: { chance: "25 + streetwise / 2", label: Streetwise }
        success: { foe: { cornered: +4 } }
        fail: { grit: -6, hint: "He sees it coming." }
      draw:
        label: Draw the revolver
        when: has('revolver')
        check: { chance: "30 + shooting / 2", label: Shooting }
        success: { foe: { cornered: +6 }, heat: +5 }
        fail: { heat: +8, nerve: -6 }
      streetcar:
        label: Jump on a passing streetcar
        cost: { nerve: -5 }
        check: { chance: "15 + stealth / 3", label: Stealth }
        success: { end: escaped }
        fail: { grit: -4, hint: "The streetcar pulls away without {{user}}." }
    foe_moves:
      close_in: { desc: "Closes the distance", weight: 3, foe: { distance: -3 } }
      vanish: { desc: "Slips out of sight", weight: 1, nerve: -4 }
    end_when:
      lost_him: foe.distance >= 20
      caught_him: foe.cornered >= 10
      beaten: foe.distance <= 0
    labels: { lost_him: You lost him, caught_him: You caught him, escaped: You got away on a streetcar, beaten: He caught you first }
    outcomes:
      lost_him: { nerve: +5 }
      caught_him: { clues: +2, hint: "Under the coat: a City Hall badge." }
      escaped: { cash: -1 }
      beaten: { grit: -20, cash: "-min(cash, 20)", hint: "A sap to the back of the head. {{user}} wakes in the gutter." }

  shakedown:
    name: Shakedown
    desc: Two of Sal's boys corner {{user}} by the warehouses.
    tags: [violence]
    goal: Talk them down, fight your way out, or run
    foe:
      name: Sal's boys
      stats:
        patience: { label: Patience, start: 14, max: 14 }
        hp: { label: Grit, start: 30, max: 30 }
    actions:
      talk:
        label: Talk them down
        check: { chance: "30 + charm / 2 + streetwise / 4", label: Charm }
        success: { foe: { patience: -6 } }
        fail: { grit: -4 }
      name_drop:
        label: Mention you know Sal
        when: "rel('sal', 'trust') >= 40"
        why_not: "Sal would have to trust you first"
        effects: { foe: { patience: -10 } }
      fight:
        label: Fight
        check: { chance: "30 + intimidation / 4 + shooting / 4", label: Intimidation }
        success: { foe: { hp: -10 } }
        fail: { grit: -10 }
      run:
        label: Run for it
        check: { chance: "35 + stealth / 2", label: Stealth }
        success: { end: got_away }
        fail: { grit: -5 }
    foe_moves:
      punch: { desc: "Throws a punch", weight: 3, grit: -8 }
      threaten: { desc: "Shows a knife", weight: 1, nerve: -8 }
    end_when:
      talked_down: foe.patience <= 0
      won: foe.hp <= 0
      beaten: grit <= 0
    labels: { talked_down: They let you walk, won: You put them down, got_away: You got away, beaten: They worked you over }
    outcomes:
      talked_down: { rel: { sal: { trust: +3 } } }
      won: { heat: +10, rel: { sal: { trust: -10 } } }
      got_away: { nerve: -5 }
      beaten: { set: { grit: 10 }, cash: "-min(cash, 30)" }
`
      },
      {
        label: "journal",
        yaml: `abilities:
  cold_read:
    name: Cold Read
    desc: Watch the hands, the eyes, the swallow
    cost: { nerve: -8 }
    add_condition: { read_them: 30 }
    per_day: 2
  lean_on:
    name: Lean On Them
    desc: The voice that makes people remember they're alone with you
    where: encounter
    cost: { nerve: -6 }
    add_condition: { leaned_on: 3 }
    per_encounter: 1
  hunch:
    name: Play a Hunch
    desc: Say the thing nobody told you
    known: false
    where: encounter
    cost: { nerve: -10 }
    per_day: 1
    check: { chance: "20 + deduction / 2 + clues * 4", label: Deduction }
    success: { harm: 8 }
    fail: { nerve: -6, hint: "The hunch lands wrong, and they know it." }

perks:
  points: perk_points
  pick: 3
  bloodhound:
    name: Bloodhound
    desc: Once a day, a dead end turns out not to be.
    tags: [deduction]
    rule: { reroll: { stats: [deduction], per_day: 1 } }
    abilities: [hunch]
  silver_tongue:
    name: Silver Tongue
    desc: Even a bad line half-works.
    bonus: { charm: 5 }
    rule: { soften: { stats: [charm], per_day: 2 } }
  hard_case:
    name: Hard Case
    desc: Takes a beating and keeps asking questions.
    rule: { losses: { grit: "-25%" } }
    narrator: "{{user}} has a face that's been hit before and a way of standing that says they'll take it again."
  nightcrawler:
    name: Nightcrawler
    desc: The city after dark is theirs.
    edge: { stealth: 15, streetwise: 10, when: "hour >= 20 or hour < 5" }
  steady:
    name: Steady Hands
    desc: Nerves of iron.
    rule: { losses: { nerve: "-30%" } }
    bonus: { shooting: 5 }
  lone_wolf:
    name: Lone Wolf
    desc: Doesn't need anyone — and it shows.
    bonus: { intimidation: 10 }
    drawback: { desc: "People trust you slower", bonus: { charm: -5 } }
    excludes: [silver_tongue]
  low_profile:
    name: Low Profile
    desc: The cops forget your face.
    rule: { gains: { heat: "-40%" } }

codex:
  narrows: { title: The Narrows, category: Places, text: "Where the city keeps the people it doesn't talk about.", unlock: "location == 'the_narrows'" }
  lyle: { title: Councilman Lyle, category: The case, text: "Fell from his own window. The papers say suicide. His widow doesn't.", unlock: "clues >= 1" }
  shell: { title: Harbor Holdings, category: The case, text: "A company with an address on the docks and no employees, paid by the councilman every month.", unlock: "has('ledger')" }

feats:
  first_crack: { name: First crack, desc: "Break a suspect in an interrogation.", unlock: "clues >= 4", reward: { perk_points: +1 } }
  paper_trail: { name: Paper trail, desc: "Find the councilman's ledger.", unlock: "has('ledger')", reward: { perk_points: +1 } }
`
      },
      {
        label: "rules",
        yaml: `triggers:
  broke:
    when: cash <= 0
    do: { nerve: -10, hint: "{{user}} is flat broke; the landlord has opinions." }
  heat_on:
    when: heat >= 70
    repeat: true
    do: { nerve: -2 }
  wounded:
    when: grit <= 20
    do: { add_condition: { shot: 480 }, hint: "{{user}} is hurt worse than they're letting on." }
`
      },
      {
        label: "story",
        yaml: `secrets:
  the_truth:
    about: The Lyle case
    cue: "Everyone close to the councilman flinches when the docks come up."
    tell: exists
    stages:
      - when: "clues >= 3"
        text: "Councilman Lyle was skimming city money through Harbor Holdings, a shell company on the docks."
      - when: "clues >= 6"
        text: "Finch, the aide, ran the shell company for him — and Lyle was about to confess to the papers."
      - when: "clues >= 9"
        text: "Vera Lyle paid Finch to make it look like a suicide. She hired {{user}} to find out how much anyone else knew."

fronts:
  cover_up:
    label: The cover-up
    per_day: 12
    story:
      "{{user}} asks loud questions or shows their hand": 10
      "{{user}} works quietly": -5
    stages:
      - at: 40
        hint: "Someone has been in {{user}}'s office: the files are a little too neat."
        backstage: "Finch has started burning Harbor Holdings paperwork."
        surface: "A man in a grey coat is waiting across the street from the office."
        news: "Someone is watching the office."
        do: { start_encounter: tail }
      - at: 80
        hint: "Sal's boys have stopped saying hello."
        backstage: "Vera has paid Sal to make {{user}} lose interest."
        surface: "Sal's boys come to make {{user}} lose interest in the case."
        news: "Sal's boys came calling."
        do: { start_encounter: shakedown }

random_events:
  pace: { per_day: 18, jitter: 0.3, rest_days: 2, omen_at: 80 }
  events:
    walk_in:
      label: A walk-in client
      omen: "Footsteps hesitate outside the frosted glass."
      text: "A nervous client knocks with a small job and cash up front."
      cooldown: 6
      do: { cash: +25 }
    raid:
      label: A police raid in the Narrows
      when: "location == 'the_narrows'"
      omen: "Too many patrol cars cruising slow."
      text: "The cops sweep the Narrows; everyone's papers get checked."
      cooldown: 8
      do: { heat: +5 }

live_choices:
  label: Right now
  count: 3
  when: not in_encounter
  tags:
    notice:
      desc: "Noticing something others missed"
      check: { chance: "30 + deduction / 2", label: Deduction }
      success: { clues: +1 }
      fail: { nerve: -3 }
    smooth:
      desc: "Talking someone here round, buying a drink, a favour"
      per_person: true
      check: { chance: "30 + charm / 2", label: Charm }
      success: { rel: { target: { trust: +3 } } }
      fail: { rel: { target: { trust: -1 } } }
    rough:
      desc: "Getting rough, making a threat, breaking something"
      check: { chance: "30 + intimidation / 2", label: Intimidation }
      success: { nerve: +5, heat: +3 }
      fail: { grit: -5, heat: +5 }
    lay_low:
      desc: "Laying low, watching, waiting"
      effects: { heat: -2, nerve: +3 }
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
  init_questbound();
  init_casefile();
  TEMPLATES = [universal, hometown, starfarer, questbound, casefile];
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
    consistencyCheck: false,
    drafts: 1,
    prewrite: 0,
    sceneLines: "model",
    draftItemUses: true,
    themeDating: true,
    fx: "full",
    sfx: "games",
    sfxVolume: 0.4,
    dateImages: true,
    imageConnectionId: ""
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
  next.drafts = Math.max(1, Math.min(4, Math.round(Number(next.drafts) || 1)));
  next.prewrite = Math.max(0, Math.min(4, Math.round(Number(next.prewrite) || 0)));
  next.sceneLines = next.sceneLines === "scripted" ? "scripted" : "model";
  next.draftItemUses = next.draftItemUses !== false;
  next.themeDating = next.themeDating !== false;
  next.fx = next.fx === "reduced" || next.fx === "off" ? next.fx : "full";
  next.sfx = next.sfx === "all" || next.sfx === "off" ? next.sfx : "games";
  next.sfxVolume = Math.max(0, Math.min(1, Number.isFinite(Number(next.sfxVolume)) ? Number(next.sfxVolume) : 0.4));
  next.dateImages = next.dateImages !== false && next.dateImages !== "false";
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
  if (isObj2(a) && b === true)
    return a;
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
function venueCostsWithoutMoney(r) {
  return !r.hud.money && Object.values(r.dating.venues).some((v) => v.cost > 0);
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
    for (const [id, v] of Object.entries(e.transform)) {
      if (!r.body.transforms[id])
        issues.push({ level: "warning", where, message: `"${id}" isn't a transformation under body › transforms${suggest(id, Object.keys(r.body.transforms))}` });
      check(v, `${where} › transform › ${id}`, extra);
    }
    if (Object.keys(e.body).length && !r.body.enabled)
      issues.push({ level: "warning", where, message: "changes the body, but the ruleset has no `body:` section" });
    else if (!r.body.open)
      for (const part of Object.keys(e.body)) {
        if (!r.body.parts[part])
          issues.push({ level: "warning", where, message: `"${part}" isn't a body part (body › parts) and the body is closed (open: false)` });
      }
    if (e.conceive && !r.lineage.enabled)
      issues.push({ level: "warning", where, message: "uses `conceive`, but the ruleset has no `lineage:` section" });
    for (const id of Object.keys(e.arc))
      if (!r.companions[id]?.arc)
        issues.push({ level: "warning", where, message: `"${id}" isn't a companion with an arc` });
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
  if (r.checkpoints.loop) {
    check(r.checkpoints.loop.when, "Checkpoints › loop › when");
    checkEffect(r.checkpoints.loop.effects, "Checkpoints › loop › do");
    const to = r.checkpoints.loop.to;
    const n = Number(to);
    if (to !== "start" && to !== "auto" && !(Number.isInteger(n) && n >= 1 && n <= r.checkpoints.slots))
      issues.push({ level: "warning", where: "Checkpoints › loop › to", message: `"${to}" should be start, auto or a slot number (1–${r.checkpoints.slots})` });
    if (to === "auto" && !r.checkpoints.auto)
      issues.push({ level: "warning", where: "Checkpoints › loop › to", message: "rewinds to the autosave, but `auto: day` is off — it will rewind to the start" });
  }
  for (const k of [r.checkpoints.keep, r.legacy]) {
    for (const id of k.stats)
      if (!r.stats[id])
        issues.push({ level: "warning", where: "Checkpoints › keep", message: `"${id}" isn't a stat${suggest(id, r.statOrder)}` });
    for (const id of k.rel)
      if (!r.relStats[id])
        issues.push({ level: "warning", where: "Checkpoints › keep", message: `"${id}" isn't a relationship stat` });
    for (const id of k.flags)
      if (!r.flags[id])
        issues.push({ level: "warning", where: "Checkpoints › keep", message: `"${id}" isn't a declared flag` });
  }
  for (const e of Object.values(r.endings))
    check(e.when, `Endings › ${e.id} › when`);
  const people = Object.keys(r.people);
  if (r.discovery.enabled) {
    check(r.discovery.chance, "Discovery › chance");
    for (const loc of r.discovery.at)
      if (!r.locations[loc])
        issues.push({ level: "warning", where: "Discovery › at", message: `"${loc}" isn't a location${suggest(loc, Object.keys(r.locations))}` });
  }
  if (r.observers.enabled) {
    check(r.observers.when, "Observers › when");
    for (const [k, eff] of Object.entries(r.observers.reactions))
      if (eff)
        checkEffect(eff, `Observers › reactions › ${k}`, { target: "someone" });
  }
  for (const o of Object.values(r.obligations)) {
    const w = `Obligations › ${o.id}`;
    check(o.amount, `${w} › amount`);
    if (!r.stats[o.payWith])
      issues.push({ level: "warning", where: `${w} › pay_with`, message: `"${o.payWith}" isn't a stat` });
    if (o.creditor && !r.people[o.creditor])
      issues.push({ level: "warning", where: `${w} › creditor`, message: `"${o.creditor}" isn't a person${suggest(o.creditor, people)}` });
    for (const loc of o.at)
      if (!r.locations[loc])
        issues.push({ level: "warning", where: `${w} › at`, message: `"${loc}" isn't a location` });
    if (o.late)
      for (const opt of o.late.options)
        checkEffect(opt.effect, `${w} › late › ${opt.id}`);
  }
  for (const j of Object.values(r.jobs)) {
    const w = `Jobs › ${j.id}`;
    check(j.when, `${w} › when`);
    check(j.pay, `${w} › pay`);
    check(j.tip, `${w} › tip`);
    if (j.skill && !r.stats[j.skill])
      issues.push({ level: "warning", where: `${w} › skill`, message: `"${j.skill}" isn't a stat` });
    for (const loc of j.at)
      if (!r.locations[loc])
        issues.push({ level: "warning", where: `${w} › at`, message: `"${loc}" isn't a location` });
    checkEffect(j.gain, `${w} › gain`);
  }
  r.lineage.stages.forEach((st, i) => checkEffect(st.effects, `Lineage › stage ${i + 1}`));
  for (const part of r.lineage.inherit)
    if (r.body.enabled && !r.body.parts[part])
      issues.push({ level: "warning", where: "Lineage › children › inherit", message: `"${part}" isn't a body part${suggest(part, Object.keys(r.body.parts))}` });
  for (const c of Object.values(r.companions)) {
    const w = `Companions › ${c.id}`;
    if (!r.people[c.id])
      issues.push({ level: "warning", where: w, message: `"${c.id}" isn't a person in relationships › people${suggest(c.id, people)}` });
    for (const id of c.jealousOf)
      if (id !== "anyone" && !r.people[id])
        issues.push({ level: "warning", where: `${w} › jealous_of`, message: `"${id}" isn't a person${suggest(id, people)}` });
    for (const id of c.knows)
      if (!r.secrets[id])
        issues.push({ level: "warning", where: `${w} › knows`, message: `"${id}" isn't a secret${suggest(id, Object.keys(r.secrets))}` });
    if (c.daily)
      for (const o of c.daily.options)
        checkEffect(o.effect, `${w} › daily › ${o.id}`);
  }
  for (const [a, m] of Object.entries(r.bonds))
    for (const b of Object.keys(m)) {
      if (!r.people[b])
        issues.push({ level: "warning", where: `Companions › ${a} › bonds`, message: `"${b}" isn't a person${suggest(b, people)}` });
    }
  const slotIds = r.wardrobe.slots.map((s) => s.id);
  for (const [part, slots] of Object.entries(r.body.hiddenBy))
    for (const slot of slots) {
      if (!slotIds.includes(slot))
        issues.push({ level: "warning", where: `Body › hidden_by › ${part}`, message: `"${slot}" isn't a wardrobe slot${suggest(slot, slotIds)}` });
    }
  for (const t of Object.values(r.body.transforms))
    check(t.chance, `Body › transforms › ${t.id} › chance`);
  for (const o of r.mind.overrides) {
    const w = `Mind › overrides › ${o.id}`;
    check(o.when, `${w} › when`, { target: "someone" });
    check(o.chance, `${w} › chance`, { target: "someone" });
    if (o.do !== "fail" && o.do !== "alter" && !r.actions[o.do])
      issues.push({ level: "warning", where: `${w} › do`, message: `"${o.do}" isn't fail, alter or an action${suggest(o.do, Object.keys(r.actions))}` });
  }
  r.mind.perception.forEach((p, i) => check(p.when, `Mind › perception #${i + 1} › when`));
  const gates = [
    ...r.statOrder.map((id) => [`Stats › ${id} › narrator_when`, r.stats[id].gate]),
    ...r.relStatOrder.map((id) => [`Relationships › stats › ${id} › narrator_when`, r.relStats[id].gate]),
    ...Object.values(r.flags).map((f) => [`Flags › ${f.id} › narrator_when`, f.gate]),
    ...Object.values(r.conditions).map((c) => [`Conditions › ${c.id} › narrator_when`, c.gate])
  ];
  for (const [where, g] of gates)
    check(g?.when, where);
  if (r.dating.enabled) {
    const dx = { target: Object.keys(r.people)[0] ?? "someone" };
    check(r.dating.with, "Dating › with", dx);
    for (const t of Object.values(r.dating.topics))
      check(t.when, `Dating › topics › ${t.id} › when`, dx);
    const tags = new Set(Object.values(r.dating.venues).flatMap((v) => v.activities.flatMap((a) => a.tags)));
    for (const v of Object.values(r.dating.venues)) {
      check(v.when, `Dating › venues › ${v.id} › when`, dx);
      if (v.at && Object.keys(r.locations).length && !r.locations[v.at])
        issues.push({ level: "warning", where: `Dating › venues › ${v.id} › at`, message: `"${v.at}" isn't a declared location${suggest(v.at, Object.keys(r.locations))}` });
    }
    if (venueCostsWithoutMoney(r))
      issues.push({ level: "warning", where: "Dating › venues", message: "venues have a cost but the ruleset has no money stat — outings will be free" });
    for (const [pid, tastes] of Object.entries(r.dating.people))
      for (const key of Object.keys(tastes)) {
        const bare = key.replace(/^(tag|item|act):/, "");
        const known = r.dating.topics[key] || r.dating.categories.some((c) => c.id === key) || (key.startsWith("tag:") ? tags.has(bare) : key.startsWith("item:") ? !!r.items[bare] : tags.has(key) || Object.values(r.dating.venues).some((v) => v.activities.some((a) => a.id === bare)));
        if (!known)
          issues.push({ level: "warning", where: `Dating › people › ${pid}`, message: `"${key}" isn't a topic, category, activity tag (tag:…) or item (item:…)${suggest(key, Object.keys(r.dating.topics))}` });
      }
  }
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
    "partner",
    "dates",
    "stage",
    "saved",
    "body",
    "transformed",
    "bond",
    "arc",
    "age",
    "children",
    "owed",
    "missed",
    "days_until",
    "seen_by",
    "fame",
    "min",
    "max",
    "clamp",
    "floor",
    "ceil",
    "round",
    "abs"
  ];
});

// src/engine/audit.ts
function isEffect(o) {
  return !!o && typeof o === "object" && "stats" in o && "removeConditions" in o && "addConditions" in o;
}
function readFormula(v, seen) {
  try {
    compile(v);
  } catch {
    return;
  }
  for (const id of identifiers(v))
    seen.reads.add(id);
  for (const m of v.matchAll(/\b(has|count|cond|flag|at|present|where|wearing|met|rel|worn|secret|front|codex|feat|perk|deepest|stage|partner|dates|transformed|saved|happened|owed|missed|days_until|arc|bond|seen_by)\(\s*'([^']+)'/g))
    seen.calls.add(`${m[1]}:${m[2]}`);
}
function walk(o, seen, money, key = "") {
  if (typeof o === "string") {
    if (FORMULA_KEYS.has(key))
      readFormula(o, seen);
    return;
  }
  if (!o || typeof o !== "object")
    return;
  if (Array.isArray(o)) {
    for (const x of o)
      if (x && typeof x === "object")
        walk(x, seen, money);
    return;
  }
  if (isEffect(o)) {
    for (const v of [...Object.values(o.stats), ...Object.values(o.set), ...Object.values(o.foe), ...Object.values(o.damage), ...Object.values(o.front), ...Object.values(o.transform), ...Object.values(o.arc)])
      if (typeof v === "string")
        readFormula(v, seen);
    for (const [k, v] of [...Object.entries(o.stats), ...Object.entries(o.set)]) {
      seen.changed.add(k);
      if (k === money) {
        const n = typeof v === "number" ? v : /^\s*-/.test(String(v)) ? -1 : 1;
        if (n > 0)
          seen.moneyUp = true;
        else if (n < 0)
          seen.moneyDown = true;
      }
    }
    for (const [k, v] of Object.entries(o.items))
      (v > 0 ? seen.itemsGiven : seen.itemsTaken).add(k);
    for (const [k, d] of Object.entries(o.addConditions)) {
      seen.condAdded.add(k);
      if (d !== null)
        seen.condTimed.add(k);
    }
    for (const k of o.removeConditions)
      seen.condRemoved.add(k);
    for (const k of Object.keys(o.flags))
      seen.flagsSet.add(k);
    if (o.startEncounter)
      seen.encStarted.add(o.startEncounter);
    if (o.move)
      seen.moves.add(o.move);
    for (const u of o.unlock)
      seen.unlocked.add(u);
  }
  for (const [k, v] of Object.entries(o))
    walk(v, seen, money, k);
}
function auditRuleset(r) {
  const money = r.statOrder.find((id) => r.stats[id].kind === "money");
  const seen = {
    changed: new Set,
    reads: new Set,
    calls: new Set,
    itemsGiven: new Set,
    itemsTaken: new Set,
    condAdded: new Set,
    condTimed: new Set,
    condRemoved: new Set,
    flagsSet: new Set,
    encStarted: new Set,
    moves: new Set,
    unlocked: new Set,
    moneyUp: false,
    moneyDown: false
  };
  walk(r, seen, money);
  for (const id of Object.keys(r.startItems))
    seen.itemsGiven.add(id);
  for (const d of Object.values(r.dungeons))
    for (const l of d.loot ?? [])
      seen.itemsGiven.add(l.item);
  for (const o of Object.values(r.obligations)) {
    seen.moneyDown = true;
  }
  for (const j of Object.values(r.jobs)) {
    seen.moneyUp = true;
  }
  const gaps = [];
  const links = [];
  const gap = (g) => gaps.push(g);
  const costs = new Set(Object.values(r.abilities).flatMap((ab) => Object.keys(ab.action.cost.stats)));
  const readsStat = (id) => seen.reads.has(id) || costs.has(id);
  for (const it of Object.values(r.items)) {
    const referenced = seen.calls.has(`has:${it.id}`) || seen.calls.has(`count:${it.id}`) || seen.calls.has(`wearing:${it.id}`) || seen.itemsTaken.has(it.id);
    const gift = it.tags.includes("gift") && r.dating.enabled;
    const bonus = Object.keys(it.bonus).length > 0;
    if (it.use)
      links.push(`${it.name}: ${it.use.label}`);
    if (bonus)
      links.push(`${it.name} helps ${Object.keys(it.bonus).map((s) => r.stats[s]?.label ?? s).join(", ")} checks`);
    if (!it.use && !bonus && !referenced && !gift && !it.slot) {
      gap({ id: `item-dead:${it.id}`, severity: "gap", part: "world", text: `${it.name} does nothing: no use, no bonus, and nothing needs it.`, fix: `Give it a use: (what using it does, in this game's stats and conditions${it.desc ? ` — its description says: "${it.desc}"` : ""}), a bonus: to the checks it would help, or an action/encounter move that needs it.` });
    } else if (it.slot && !bonus && !it.traits.length && it.warmth === 0 && it.reveal === 0 && !referenced) {
      gap({ id: `item-flat:${it.id}`, severity: "thin", part: "world", text: `${it.name} is clothing with no effect (no warmth, traits or bonus).`, fix: "Give it warmth, a trait something checks, or a bonus: (sturdy boots → athletics)." });
    }
    if ((referenced || it.use) && !seen.itemsGiven.has(it.id) && !it.slot) {
      gap({ id: `item-unobtainable:${it.id}`, severity: "gap", part: "world", text: `${it.name} matters, but nothing gives it to the player.`, fix: "Add it to start.items, a shop or job reward (give:), dungeon loot, or an action that finds it." });
    }
  }
  const effectDoes = (e) => !!e && Object.entries(e).some(([k, v]) => k !== "hint" && v !== undefined && v !== null && (typeof v !== "object" || (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0)));
  for (const ab of Object.values(r.abilities)) {
    const a = ab.action;
    if (![a.effects, ...Object.values(a.outcomes)].some(effectDoes)) {
      gap({ id: `ability-dead:${ab.id}`, severity: "gap", part: "journal", text: `${ab.name} is an ability that does nothing in the rules.`, fix: "Give it effects: a buff (add_condition with a bonus:), harm: in a fight, a heal, a way out — on success: when it rolls." });
      continue;
    }
    links.push(`${ab.name}: an ability${ab.where === "encounter" ? " for encounters" : ""}`);
    if (!Object.keys(a.cost.stats).length && !ab.perDay && !ab.perEncounter) {
      gap({ id: `ability-free:${ab.id}`, severity: "thin", part: "journal", text: `${ab.name} costs nothing and has no limit, so it's the best move every time.`, fix: "Give it a cost (mana, stamina, money) or a limit (per_day / per_encounter)." });
    }
  }
  const perks = Object.values(r.perks);
  if (perks.length && r.perkPoints && !seen.changed.has(r.perkPoints) && r.stats[r.perkPoints]?.perHour === 0) {
    gap({ id: "perk-no-points", severity: "gap", part: "journal", text: "Perks cost points, but nothing ever gives the player any.", fix: `Raise ${r.perkPoints} on level-ups (a trigger), feat rewards, won encounters or story milestones.` });
  }
  for (const p of perks) {
    const shapes = Object.keys(p.bonus).length + p.edges.length + p.rules.length + p.abilities.length + (p.narrator ? 1 : 0);
    if (!shapes)
      gap({ id: `perk-flat:${p.id}`, severity: "thin", part: "journal", text: `${p.name} only changes numbers once, when it's taken.`, fix: "Make it change how they play: an edge in a situation the card has, a rule bent (reroll/soften), a stat that rises slower, an ability it teaches, a narrator: line — ideally with a drawback." });
  }
  if (perks.length >= 4 && !r.perkPick) {
    gap({ id: "perk-shop", severity: "thin", part: "journal", text: "Perks are bought from the whole list, so a point is never a real choice.", fix: "Add pick: 3 under perks: — each point then offers one that builds on how they've played, one new direction and one more." });
  }
  for (const id of r.statOrder) {
    const def = r.stats[id];
    if (def.kind === "hidden")
      continue;
    const grows = (def.kind === "skill" || def.kind === "attribute") && r.growth.enabled && def.growth > 0;
    const changes = seen.changed.has(id) || def.perHour !== 0 || def.narrator > 0 || grows;
    const read = readsStat(id);
    if (!changes)
      gap({ id: `stat-static:${id}`, severity: "gap", part: "stats", text: `${def.label} never changes: no action, event or drift moves it.`, fix: `Have actions, foe moves, triggers or time move ${def.label}${def.kind === "meter" ? " (per_hour drift, costs, consequences)" : ""}.` });
    if ((def.kind === "skill" || def.kind === "attribute") && !read && id !== r.perkPoints) {
      gap({ id: `skill-unused:${id}`, severity: "gap", part: "actions", text: `${def.label} is a ${def.kind} no check uses.`, fix: `Make some action or encounter checks read ${id} (e.g. chance: "30 + ${id} / 2"), so it matters and grows.` });
    } else if (def.kind === "meter" && !read && id !== money) {
      gap({ id: `stat-unread:${id}`, severity: "thin", part: "rules", text: `${def.label} is shown but has no consequence.`, fix: `Let something read it: a trigger at a threshold, a check penalty ("- ${id} / 4"), an ending, an encounter's end_when, or an action's when.` });
    }
  }
  if (money && r.stats[money].narrator > 0) {
    seen.moneyUp = true;
    seen.moneyDown = true;
  }
  if (money) {
    if (!seen.moneyUp)
      gap({ id: "money-no-income", severity: "gap", part: "actions", text: `There's ${r.stats[money].label} but no way to earn it.`, fix: "Add jobs, paid actions, rewards or loot that raise it." });
    if (!seen.moneyDown)
      gap({ id: "money-no-spending", severity: "gap", part: "actions", text: `${r.stats[money].label} piles up with nothing to spend it on.`, fix: "Add costs: shops (give an item for money), rent/bills (obligations), bribes, travel fares." });
  }
  for (const c of Object.values(r.conditions)) {
    const added = seen.condAdded.has(c.id) || c.narrator;
    const read = seen.calls.has(`cond:${c.id}`) || Object.keys(c.bonus).length > 0;
    if (!added)
      gap({ id: `cond-never:${c.id}`, severity: "gap", part: "rules", text: `Nothing ever causes ${c.label}.`, fix: `Add it from an action, a foe move, a trigger or an event (add_condition: [${c.id}]).` });
    else {
      const cured = seen.condRemoved.has(c.id) || seen.condTimed.has(c.id) && !c.narrator;
      if (!cured)
        gap({ id: `cond-uncured:${c.id}`, severity: "thin", part: "world", text: `Nothing cures ${c.label} (unless it has a duration).`, fix: `Add something that removes it — an item's use:, resting somewhere, a trigger (remove_condition: [${c.id}]), or give it a duration.` });
      else
        for (const it of Object.values(r.items))
          if (it.use && [it.use.effects, ...Object.values(it.use.outcomes)].some((e) => e?.removeConditions.includes(c.id)))
            links.push(`${it.name} clears ${c.label}`);
    }
    if (added && !read)
      gap({ id: `cond-unread:${c.id}`, severity: "thin", part: "rules", text: `${c.label} only colours the narration: no check, trigger or encounter reacts to it.`, fix: `Let checks, triggers or encounters read cond('${c.id}') — a penalty, a danger, a door it opens.` });
  }
  for (const f of Object.values(r.flags)) {
    const set = seen.flagsSet.has(f.id) || f.narrator;
    const read = seen.calls.has(`flag:${f.id}`) || seen.reads.has(f.id);
    if (set && !read)
      gap({ id: `flag-unread:${f.id}`, severity: "thin", part: "rules", text: `The flag ${f.id} is set but nothing checks it.`, fix: `Use flag('${f.id}') in an action's when, a trigger or a codex unlock.` });
    if (!set && read && !f.start)
      gap({ id: `flag-unset:${f.id}`, severity: "gap", part: "rules", text: `The flag ${f.id} is checked but nothing ever sets it.`, fix: `Set it from an action or trigger (flags: { ${f.id}: true }).` });
  }
  for (const p of Object.values(r.people)) {
    if (!p.schedule.length)
      gap({ id: `person-nowhere:${p.id}`, severity: "thin", part: "people", text: `${p.name} has no schedule, so they're only ever where the story says.`, fix: `Give ${p.name} a schedule (where they are by time and day) so the player can find them.` });
  }
  const startLoc = r.startLocation;
  const reachable = new Set(startLoc ? [startLoc] : []);
  for (let grew = true;grew; ) {
    grew = false;
    for (const l of Object.values(r.locations))
      if (reachable.has(l.id)) {
        for (const x of l.exits)
          if (!reachable.has(x) && r.locations[x]) {
            reachable.add(x);
            grew = true;
          }
      }
    for (const m of seen.moves)
      if (!reachable.has(m) && r.locations[m]) {
        reachable.add(m);
        grew = true;
      }
  }
  for (const l of Object.values(r.locations)) {
    if (startLoc && !reachable.has(l.id))
      gap({ id: `place-unreachable:${l.id}`, severity: "gap", part: "world", text: `${l.name} can't be reached from the start.`, fix: `Connect it with exits: (or a move: effect) from a place the player can get to.` });
    const things = Object.values(r.actions).some((a) => a.at.includes(l.id)) || Object.values(r.people).some((p) => p.schedule.some((s) => s.at === l.id)) || seen.calls.has(`at:${l.id}`) || Object.values(r.dungeons).some((d) => d.at.includes(l.id)) || Object.values(r.jobs).some((j) => j.at.includes(l.id)) || Object.values(r.dating.venues).some((v) => v.at === l.id);
    if (!things)
      gap({ id: `place-empty:${l.id}`, severity: "thin", part: "actions", text: `There's nothing to do at ${l.name} and nobody there.`, fix: `Add an action at: [${l.id}], schedule someone there, or put a job, shop or dungeon entrance there.` });
  }
  for (const e of Object.values(r.encounters)) {
    const th = thresholds(e);
    const winRoutes = new Set;
    for (const t of th)
      if (t.foe && !isLoss(e, t.outcome))
        winRoutes.add(`${t.outcome}:${t.stat}`);
    if (e.momentum)
      winRoutes.add("momentum");
    let escape = false;
    for (const a of Object.values(e.actions))
      for (const fx of [a.effects, ...Object.values(a.outcomes)]) {
        if (fx?.end && !isLoss(e, fx.end)) {
          winRoutes.add(`end:${fx.end}`);
          if (!th.some((t) => t.outcome === fx.end))
            escape = true;
        }
      }
    const progressMoves = Object.values(e.actions).filter((a) => [a.effects, ...Object.values(a.outcomes)].some((fx) => fx && (Object.keys(fx.foe).length || fx.end || fx.momentum !== undefined)));
    if (!e.goal && !winRoutes.size)
      gap({ id: `enc-no-goal:${e.id}`, severity: "gap", part: "encounters", text: `${e.name}: the player can't tell how to win it — no simple end_when on the foe, no move that ends it.`, fix: `Add end_when like "foe.nerve <= 0" with moves that lower it, or moves with end: <outcome>; or write goal: in words.` });
    if (!escape && !e.momentum)
      gap({ id: `enc-no-escape:${e.id}`, severity: "thin", part: "encounters", text: `${e.name} has no way out but winning or losing.`, fix: "Add an escape route: a move whose success ends it (end: escaped) at a cost — running, hiding, bargaining." });
    if (progressMoves.length < 2)
      gap({ id: `enc-one-route:${e.id}`, severity: "thin", part: "encounters", text: `${e.name} has ${progressMoves.length ? "only one move" : "no move"} that makes progress.`, fix: "Give it two or three routes with different stats and trade-offs (talk, trick, force, flee), so choices mean something." });
    for (const t of th.filter((x) => !x.foe)) {
      const def = r.stats[t.stat];
      if (def && t.op.startsWith(">") && def.max < t.value)
        gap({ id: `enc-unreachable:${e.id}:${t.stat}`, severity: "gap", part: "encounters", text: `${e.name} ends at ${def.label} ${t.op} ${t.value}, but ${def.label} can't go above ${def.max}.`, fix: "Lower the threshold or raise the stat's max." });
    }
    const reads = new Set;
    for (const a of Object.values(e.actions)) {
      if (a.check)
        for (const x of [...identifiers(String(a.check.add ?? "")), ...identifiers(String(a.check.target ?? ""))])
          reads.add(x);
      if (a.when && /has\(/.test(a.when))
        reads.add("__item");
    }
    const itemsMatter = reads.has("__item") || Object.values(r.items).some((it) => it.use && [it.use.effects, ...Object.values(it.use.outcomes)].some((fx) => fx && (Object.keys(fx.foe).length || Object.keys(fx.stats).some((s) => reads.has(s)) || fx.removeConditions.length)) || Object.keys(it.bonus).some((s) => reads.has(s)));
    if (!itemsMatter && Object.keys(r.items).length)
      gap({ id: `enc-no-items:${e.id}`, severity: "thin", part: "encounters", text: `No item matters in ${e.name}.`, fix: "Let an item help: a use: that changes what its checks read (or the foe), a bonus: to those checks, or a move that needs an item." });
    if (!e.fromStory && !seen.encStarted.has(e.id))
      gap({ id: `enc-never:${e.id}`, severity: "gap", part: "encounters", text: `Nothing starts ${e.name} (from_story is off and no action starts it).`, fix: `Start it from an action, trigger or random event (start_encounter: ${e.id}), or allow the story to start it.` });
    if (!e.foeMoves)
      gap({ id: `enc-passive:${e.id}`, severity: "thin", part: "encounters", text: `${e.name}'s other side never acts.`, fix: "Add foe_moves with weights and effects, so standing still has a cost." });
  }
  for (const c of Object.values(r.codex)) {
    if (!c.unlock && !seen.unlocked.has(c.id))
      gap({ id: `codex-locked:${c.id}`, severity: "thin", part: "journal", text: `Codex entry "${c.title}" can never be found.`, fix: "Give it an unlock: formula, or unlock it from an action or event." });
  }
  const declared = Object.keys(r.items).length + r.statOrder.length + Object.keys(r.conditions).length + Object.keys(r.flags).length + Object.keys(r.locations).length + Object.keys(r.encounters).length * 3 + 1;
  const weight = gaps.reduce((n, g) => n + (g.severity === "gap" ? 1 : 0.4), 0);
  const depth = Math.max(0, Math.min(100, Math.round(100 * (1 - weight / declared))));
  return { gaps, links, depth };
}
var FORMULA_KEYS;
var init_audit = __esm(() => {
  init_expr();
  init_encounter_view();
  FORMULA_KEYS = new Set(["when", "add", "target", "unlock", "requires", "amount", "maxExpr", "chance", "pay", "tip", "perDay", "perTurn", "per_day", "per_turn", "momentum", "gauge", "atk", "def", "mat", "mdf", "agi", "hp", "mp"]);
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
async function characterBrief(chatId, userId) {
  const id = await characterForChat(chatId, userId).catch(() => null);
  if (!id)
    return "";
  const hit = briefs.get(id);
  if (hit && Date.now() - hit.at < 60000)
    return hit.text;
  const c = await host().characters.get(id, userId).catch(() => null);
  const text = c ? [
    `Name: ${c.name}`,
    c.description && `Description: ${c.description}`,
    c.personality && `Personality: ${c.personality}`,
    c.scenario && `Scenario: ${c.scenario}`
  ].filter(Boolean).join(`
`).slice(0, 4000) : "";
  briefs.set(id, { text, at: Date.now() });
  return text;
}
function invalidateCharacter(characterId) {
  if (characterId) {
    byCharacter.delete(characterId);
    briefs.delete(characterId);
  } else {
    byCharacter.clear();
    briefs.clear();
  }
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
    tags: [...tags].sort(),
    ...l.ruleset ? { depth: depthOf(l.ruleset) } : {}
  };
}
function depthOf(r) {
  const hit = depths.get(r);
  if (hit)
    return hit;
  const a = auditRuleset(r);
  const d = { score: a.depth, gaps: a.gaps, drafted: Object.values(r.items).filter((i) => i.drafted).map((i) => i.name) };
  depths.set(r, d);
  return d;
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
function aboutThem(text, re, budget) {
  if (!text)
    return "";
  const out = [];
  let n = 0;
  for (const para of text.split(/\n\s*\n|\n(?=[-*•]|\w+:)/)) {
    const p = para.trim();
    if (!p || !re.test(p))
      continue;
    const piece = p.length > 700 ? `${p.slice(0, 700)}…` : p;
    if (n + piece.length > budget)
      break;
    out.push(piece);
    n += piece.length;
  }
  return out.join(`
`);
}
async function personProfile(chatId, name, userId, note) {
  const key = `${chatId}:${name.toLowerCase()}`;
  const hit = profiles.get(key);
  if (hit && Date.now() - hit.at < PROFILE_TTL)
    return hit.p;
  const re = nameRe(name);
  const id = await characterForChat(chatId, userId).catch(() => null);
  const c = id ? await host().characters.get(id, userId).catch(() => null) : null;
  const scenario = !!c && looksLikeScenario(c);
  const parts = [];
  if (note)
    parts.push(note);
  let setting = "";
  if (c && !scenario && re.test(c.name)) {
    parts.push(await characterBrief(chatId, userId));
  } else if (c) {
    const fromCard = [c.description, c.personality, c.scenario].map((t) => aboutThem(t, re, 1200)).filter(Boolean).join(`
`);
    if (fromCard)
      parts.push(`From the card:
${fromCard}`);
    setting = [c.scenario, c.description].filter(Boolean).join(`
`).slice(0, 600);
    const lore = [];
    for (const bookId of c.world_book_ids ?? []) {
      if (lore.length >= 3)
        break;
      const book = await host().world_books.get(bookId, userId).catch(() => null);
      if (!book || isRulesetBookName(book.name))
        continue;
      const entries = await listAllEntries(bookId, userId).catch(() => []);
      for (const e of entries) {
        if (lore.length >= 3)
          break;
        if (isRulesetEntryTitle(e.comment))
          continue;
        const keys = [...e.key ?? [], e.comment ?? ""].join(" ");
        if (re.test(keys))
          lore.push(e.content.length > 900 ? `${e.content.slice(0, 900)}…` : e.content);
      }
    }
    if (lore.length)
      parts.push(`From the lorebook:
${lore.join(`
---
`)}`);
  }
  try {
    await Promise.resolve().then(() => init_ledger());
    const msgs = await getMessages(chatId);
    const seen = [];
    let n = 0;
    for (const m of [...msgs].reverse().slice(0, 40)) {
      if (m.is_user || !re.test(m.content))
        continue;
      const bit = aboutThem(m.content, re, 500);
      if (!bit || n + bit.length > 1400)
        continue;
      seen.unshift(bit);
      n += bit.length;
      if (seen.length >= 4)
        break;
    }
    if (seen.length)
      parts.push(`How the story has shown them:
${seen.join(`
`)}`);
  } catch {}
  const p = { text: parts.filter(Boolean).join(`

`).slice(0, 4500), scenario, setting };
  profiles.set(key, { at: Date.now(), p });
  return p;
}
var TTL_MS = 8000, byCharacter, chatCharacter, knownRulesetEntryIds, knownRulesetBookIds, briefs, depths, profiles, PROFILE_TTL, nameRe = (name) => {
  const first = name.trim().split(/\s+/)[0] ?? name;
  const safe = first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}])${safe}(?=[^\\p{L}]|$)`, "iu");
};
var init_source = __esm(() => {
  init_loader();
  init_lint();
  init_templates();
  init_audit();
  byCharacter = new Map;
  chatCharacter = new Map;
  knownRulesetEntryIds = new Set;
  knownRulesetBookIds = new Set;
  briefs = new Map;
  depths = new WeakMap;
  profiles = new Map;
  PROFILE_TTL = 10 * 60000;
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
var PLAYER = "you", fail = (error) => ({ events: [], error }), levelOf = (xp) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 12)), levelScale = (level) => 1 + 0.12 * (level - 1), depthScale = (depth, from) => 1 + 0.12 * Math.max(0, depth - from), tierFor2 = (depth) => Math.min(4, 1 + Math.floor((depth - 1) / 3)), isAdult = (r, id) => (r.people[id]?.age ?? 18) >= 18;
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
function pct2(v, min, max) {
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
    const band = bandFor(def, v, max);
    const p = pct2(v, def.min, max);
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
    const band = bandFor(def, v, max);
    return {
      id,
      label: def.label,
      display: formatNumber(v),
      grade: gradeFor(def, v, max),
      pct: pct2(v, def.min, max),
      kind: def.kind,
      text: band?.text ?? null,
      tone: band?.tone ?? "neutral",
      practice: practiceProgress(r, s, id)
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
        const pp = pct2(v, def.min, def.max);
        return { id: rs, label: def.label, value: v, min: def.min, max: def.max, display: formatNumber(v), pct: pp, text: band?.text ?? null, tone: band?.tone ?? toneFromPct(pp, def.good) };
      }),
      present: here.has(id),
      whereabouts: where ? r.locations[where]?.name ?? where : null,
      goal: r.companions[id]?.goal ?? null,
      bonds: Object.entries(s.bonds[id] ?? {}).filter(([b, v]) => s.people[b] && Math.abs(v) >= 25).map(([b, v]) => `${bondWord(v)} ${personName(r, s, b)}`)
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
  const usable_ = usableItems(r, s);
  const items = Object.entries(s.items).map(([id, count]) => {
    const def = r.items[id];
    const per = def?.uses ?? 0;
    const usable = usable_.find((u) => u.id === `item:${id}`);
    const bonus = def ? Object.entries(def.bonus).filter(([, b]) => b).map(([st, b]) => `${b > 0 ? "+" : ""}${b} ${r.stats[st]?.label ?? st}`).join(", ") : "";
    return {
      id,
      name: itemName(r, s, id),
      count,
      worn: wornIds.has(id),
      uses: per > 1 ? `${s.uses[id] ?? per}/${per}` : null,
      use: usable ? { id: usable.id, label: usable.a.label, locked: usable.locked, drafted: !!def?.drafted } : null,
      bonus: bonus ? `${bonus}${def?.slot ? " while worn" : ""}` : null
    };
  });
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
    const guide = encounterGuide(r, s);
    encounter = {
      goal: guide?.goal ?? null,
      progress: guide?.progress ?? [],
      danger: guide?.danger ?? [],
      dangerText: guide?.dangerText ?? null,
      quiet: !enc?.narrate,
      name: enc?.name ?? s.encounter.id,
      foe: foeName(r, s),
      round: s.encounter.round,
      momentum: s.encounter.momentum ?? null,
      stats: (enc?.foe.stats ?? []).map((fs) => {
        const v = s.encounter.foe[fs.id] ?? fs.start;
        const p = pct2(v, 0, fs.max);
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
    perks: perkViews(r, s),
    perkPoints: r.perkPoints ? s.stats[r.perkPoints] ?? 0 : null,
    perkPick: r.perkPick,
    abilities: Object.values(r.abilities).filter((ab) => knowsAbility(r, s, ab.id)).map((ab) => {
      const st = abilityStatus(r, s, ab.id);
      return {
        id: ab.id,
        name: ab.name,
        desc: ab.desc ?? ab.action.desc ?? null,
        cost: costText(r, s, ab.action),
        left: st.left,
        locked: st.locked ?? (st.here ? null : ab.where === "encounter" ? "Only in an encounter" : "Not during an encounter"),
        choice: `${ABILITY_PREFIX}${ab.id}`
      };
    }),
    news: s.news.slice().reverse().slice(0, 12).map((n) => ({ text: n.text, when: r.clock.enabled ? formatClock(r, n.at).day : null })),
    body: r.body.enabled ? Object.entries(s.body).map(([part, traits]) => ({
      part,
      label: part.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      text: traitText(traits) || "—",
      covered: bodyCovered(r, s, part)
    })) : null,
    dues: Object.values(r.obligations).map((o) => {
      const d = s.dues[o.id];
      const days = d ? Math.floor((d.due - s.minutes) / 1440) : 0;
      return {
        label: o.label,
        owed: d?.owed ?? 0,
        text: !d || d.owed <= 0 ? `Paid · next ${r.clock.enabled && d ? formatClock(r, d.due).day : "later"}` : d.missed || days < 0 ? `Overdue · ${d.missed} missed` : days <= 0 ? "Due today" : `Due in ${days} day${days === 1 ? "" : "s"}`,
        tone: !d || d.owed <= 0 ? "good" : d.missed || days < 0 ? "bad" : days <= 1 ? "warn" : "neutral"
      };
    }),
    family: [
      ...s.pregnancy && s.pregnancy.told > 0 ? [{ name: s.pregnancy.carrier === "player" ? "Expecting" : `${personName(r, s, s.pregnancy.carrier)} is expecting`, text: `${Math.floor((s.minutes - s.pregnancy.since) / 1440 / 7)} of ${r.lineage.weeks} weeks` }] : [],
      ...Object.entries(s.kin).map(([id, k]) => ({ name: k.name, text: `${k.sex === "girl" ? "Daughter" : "Son"}, ${kinAge(r, s, id)}${k.joined ? " · grown up" : ""}` }))
    ],
    transforms: Object.values(r.body.transforms).filter((t) => (s.tf[t.id] ?? 0) > 0).map((t) => ({ label: t.label, stage: s.tf[t.id], of: t.stages.length })),
    run: r.checkpoints.enabled ? {
      slots: Array.from({ length: r.checkpoints.slots }, (_, i) => ({ id: String(i + 1), label: s.saves[String(i + 1)]?.label ?? null })),
      auto: s.saves.auto?.label ?? null,
      runs: s.runs,
      loops: s.loops,
      hard: r.checkpoints.hard,
      ended: s.ended ? { title: r.endings[s.ended.id]?.title ?? s.ended.id, kind: r.endings[s.ended.id]?.kind ?? "neutral", text: r.endings[s.ended.id]?.text ?? "", told: s.ended.told } : null,
      keeps: keepWords(r, r.checkpoints.keep),
      legacy: keepWords(r, r.legacy)
    } : null,
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
function bodyCovered(r, s, part) {
  const slots = r.body.hiddenBy[part];
  return !!slots?.length && r.wardrobe.enabled && slots.every((slot) => !!s.worn[slot]);
}
function traitText(traits) {
  const t = Object.entries(traits).filter(([, v]) => v && v !== "none");
  return t.map(([k, v]) => k === "type" ? v : `${k.replace(/_/g, " ")} ${v}`).join(", ");
}
function bodyLine(r, s) {
  if (!r.body.enabled)
    return null;
  const parts = Object.entries(s.body).map(([part, traits]) => [part, traitText(traits)]).filter(([, t]) => t);
  if (!parts.length)
    return null;
  const covered = parts.filter(([p]) => bodyCovered(r, s, p)).map(([p]) => p.replace(/_/g, " "));
  return `Body: ${parts.map(([p, t]) => `${p.replace(/_/g, " ")} — ${t}`).join("; ")}${covered.length ? ` (covered, not visible to others: ${covered.join(", ")})` : ""}`;
}
function bondWord(v) {
  return v >= 60 ? "devoted to" : v >= 25 ? "fond of" : v > -25 ? "neutral toward" : v > -60 ? "cool toward" : "hostile toward";
}
function bondLines(r, s) {
  const out = [];
  for (const [a, m] of Object.entries(s.bonds)) {
    if (!s.people[a])
      continue;
    for (const [b, v] of Object.entries(m))
      if (s.people[b] && Math.abs(v) >= 25)
        out.push(`${personName(r, s, a)} is ${bondWord(v)} ${personName(r, s, b)}`);
  }
  return out;
}
function keepWords(r, k) {
  const parts = [
    k.codex && "the codex",
    k.feats && "feats",
    k.perks && "perks",
    k.secrets && "secrets learned",
    k.people && "people met",
    k.dating && "what you know of people's tastes",
    k.deepest && "dungeon progress",
    ...k.stats.map((id) => r.stats[id]?.label ?? id),
    ...k.flags.map((id) => r.flags[id]?.label ?? id.replace(/_/g, " ")),
    ...k.items.map((id) => itemName(r, initialState(r), id)),
    ...k.rel.map((id) => r.relStats[id]?.label ?? id)
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "nothing";
}
function buildChoices(r, s, opts) {
  const veils = new Set(opts.veils.map((v) => v.toLowerCase()));
  const lines = new Set(opts.lines.map((v) => v.toLowerCase()));
  const live = [];
  const plain = (id, label, group, desc = null) => ({ id, label, group, desc, odds: null, partialOdds: null, checkLabel: null, veiled: false, params: [] });
  if (s.ended) {
    const e = r.endings[s.ended.id];
    const group = `The end · ${e?.title ?? ""}`.trim();
    return [
      ...!s.ended.told ? [plain(RUN_EPILOGUE, "See how it ends", group, "The narrator writes the ending")] : [],
      plain("run:restart", "Start over", group, `A new playthrough from the beginning. Carries over: ${keepWords(r, r.legacy)}`),
      ...Object.entries(s.saves).map(([slot, v]) => plain(`run:load:${slot}`, `Load ${slot === "auto" ? "autosave" : `slot ${slot}`}`, group, v.label)),
      ...!r.checkpoints.hard ? [plain("run:continue", "Keep playing", group, "Carry on past the ending")] : []
    ];
  }
  if (s.dungeon) {
    const d = dungeonOf(r, s.dungeon);
    return [
      plain("dungeon:open", s.dungeon.battle ? "Back to the fight" : s.dungeon.pending ? "Decide what to do" : "Keep exploring", d?.name ?? "Dungeon", "Open the dungeon map"),
      plain("dungeon:leave", "Leave the dungeon", d?.name ?? "Dungeon", "Climb back out with what you've found")
    ];
  }
  const work = s.encounter ? [] : workMoves(r, s).map((m) => plain(m.id, m.label, m.group, m.desc));
  if (s.job)
    return work;
  const asChoice = (m) => ({
    id: m.id,
    label: m.label,
    group: m.group,
    desc: m.desc,
    odds: m.odds,
    partialOdds: null,
    checkLabel: null,
    veiled: m.romantic && (veils.has("romance") || veils.has("romantic")),
    params: []
  });
  const moves = s.encounter ? [] : dateMoves(r, s, opts.lines);
  if (activeSession(r, s)) {
    const featured = moves.filter((m) => m.featured).map(asChoice);
    const lastGroup = featured[featured.length - 1]?.group ?? "Talk";
    const more = moves.length > featured.length ? [plain("date:open", "More…", lastGroup, "Every topic, gift and move — and what you know about them")] : [];
    return [...featured, ...more];
  }
  const talk = moves.filter((m) => m.featured).map(asChoice);
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
  const explore = canExplore(r, s) ? [plain(EXPLORE, r.discovery.label, "Travel", "Look for somewhere you haven't been")] : [];
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
  const locked = [];
  if (s.encounter) {
    const pool = actionPool(r, s);
    for (const id of pool.order) {
      const a = pool.defs[id];
      if (a.hidden || a.perPerson || isAvailable(r, s, a) || a.tags.some((t) => lines.has(t)))
        continue;
      if (!a.whyNot && !/has\(/.test(a.when ?? ""))
        continue;
      locked.push({ ...plain(id, a.label, encName ?? "Encounter", a.desc ?? null), locked: lockReason(r, s, a) });
    }
  }
  return [...live, ...actions, ...abilityChoices(r, s, lines), ...itemChoices(r, s, lines), ...locked, ...talk, ...work, ...dungeons, ...travel, ...explore];
}
function costText(r, s, a) {
  const env = makeEnv(r, s);
  const parts = Object.entries(a.cost.stats).map(([stat, d]) => [stat, evalNumber(d, env, 0)]).filter(([, v]) => v < 0).map(([stat, v]) => `${formatNumber(-v)} ${r.stats[stat]?.label ?? stat}`);
  return parts.length ? parts.join(", ") : null;
}
function abilityChoices(r, s, lines) {
  if (s.job || s.ended || s.dungeon)
    return [];
  const out = [];
  for (const { id, a, status } of usableAbilities(r, s)) {
    if (a.hidden || a.tags.some((t) => lines.has(t)))
      continue;
    const cost = costText(r, s, a);
    const left = status.left !== null ? `${status.left} left${r.abilities[id.slice(ABILITY_PREFIX.length)]?.perEncounter && s.encounter ? " this fight" : " today"}` : null;
    const why = [cost, left].filter(Boolean).join(" · ") || undefined;
    if (status.locked) {
      if (s.encounter)
        out.push({ id, label: a.label, group: "Abilities", desc: a.desc ?? null, odds: null, partialOdds: null, checkLabel: null, veiled: false, params: [], locked: status.locked });
      continue;
    }
    const o = odds(r, s, a);
    out.push({
      id,
      label: a.label,
      group: "Abilities",
      desc: a.desc ?? null,
      odds: o ? o.success : null,
      partialOdds: o && o.partial > 0 ? o.partial : null,
      checkLabel: a.check?.label ?? null,
      veiled: false,
      params: [],
      ...why ? { why } : {}
    });
  }
  out.sort((x, y) => Number(!!x.locked) - Number(!!y.locked));
  return out.slice(0, s.encounter ? 6 : 3);
}
function perkViews(r, s) {
  const offers = new Set(perkOffers(r, s));
  return Object.values(r.perks).filter((p) => !r.perkPick || s.perks[p.id] || offers.has(p.id)).map((p) => {
    const notes = [];
    const plus = (stats) => Object.entries(stats).map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${r.stats[k]?.label ?? k}`).join(", ");
    if (Object.keys(p.bonus).length)
      notes.push(plus(p.bonus));
    for (const e of p.edges)
      notes.push(`${plus(e.stats)}${e.when ? " (sometimes)" : ""}`);
    for (const rule of p.rules) {
      if ("stat" in rule)
        notes.push(`${r.stats[rule.stat]?.label ?? rule.stat} ${rule.kind === "gains" ? "rises" : "drops"} ${Math.round(Math.abs(rule.pct) * 100)}% ${rule.pct > 0 ? "faster" : "slower"}`);
      else {
        const left = rule.perDay ? rule.perDay - usesOf(s, `perk:${p.id}:${rule.kind}`).today : null;
        notes.push(`${rule.kind === "reroll" ? "Rerolls a failure" : "Softens a failure"}${rule.perDay ? ` ${rule.perDay}×/day${s.perks[p.id] ? ` (${Math.max(0, left)} left)` : ""}` : ""}`);
      }
    }
    for (const a of p.abilities)
      if (r.abilities[a])
        notes.push(`Teaches ${r.abilities[a].name}`);
    return {
      id: p.id,
      name: p.name,
      desc: p.desc,
      cost: p.cost,
      owned: !!s.perks[p.id],
      blocker: s.perks[p.id] ? null : perkBlocker(r, s, p.id),
      offered: offers.has(p.id),
      drawback: p.drawback ?? null,
      notes
    };
  });
}
function itemChoices(r, s, lines) {
  if (s.job || s.ended)
    return [];
  const veils = new Set;
  const ranked = usableItems(r, s).filter((u) => !u.locked && !u.a.tags.some((t) => lines.has(t))).map((u) => ({ u, ...itemRelevance(r, s, u.a) })).filter((x) => x.score >= (s.encounter ? 1 : 2)).sort((a, b) => b.score - a.score).slice(0, s.encounter ? 3 : 2);
  return ranked.map(({ u, why }) => {
    const o = odds(r, s, u.a);
    return {
      id: u.id,
      label: u.a.label,
      group: "Items",
      desc: u.a.desc ?? r.items[u.id.slice(5)]?.desc ?? null,
      odds: o ? o.success : null,
      partialOdds: o && o.partial > 0 ? o.partial : null,
      checkLabel: u.a.check?.label ?? null,
      veiled: u.a.tags.some((t) => veils.has(t)),
      params: [],
      ...why ? { why } : {}
    };
  });
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
  const foeAgg = new Map;
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
      case "scene":
        if (e.note === "renew" || events.some((x, j) => j < i && x.t === "person" && x.id === e.who))
          break;
        out.push({ text: e.here ? `\uD83D\uDC4B ${personName(r, after, e.who)} is here` : `${personName(r, after, e.who)} left`, tone: "neutral", src: e.src, undo: [i] });
        break;
      case "use": {
        const per = r.items[e.id]?.uses ?? 0;
        const left = after.items[e.id] > 0 ? after.uses[e.id] ?? per : 0;
        out.push({ text: `Used ${itemName(r, before, e.id)}${e.n > 1 ? ` ×${e.n}` : ""}${per > 1 && left ? ` · ${left}/${per} left` : ""}`, tone: "neutral", src: e.src, undo: [i] });
        break;
      }
      case "practice": {
        const rose = events.some((x) => x.t === "stat" && x.id === e.id && (x.d ?? 0) > 0 && x.src === "check");
        const def = r.stats[e.id];
        if (rose || !def || e.d <= 0)
          break;
        out.push({ text: `\uD83D\uDCC8 ${def.label} ${Math.round((after.practice[e.id] ?? 0) * 100)}%`, tone: "good", src: e.src });
        break;
      }
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
          out.push({ text: `⚔ ${r.encounters[e.id]?.name ?? "Encounter"}${e.foeName ? ` vs ${e.foeName}` : ""}`, tone: "warn", src: e.src });
        else
          out.push({ text: `⚔ Over: ${(e.outcome ?? "ended").replace(/_/g, " ")}`, tone: "neutral", src: e.src });
        break;
      case "foe": {
        const a = foeAgg.get(e.stat) ?? { d: 0, idx: [], src: e.src };
        a.d += e.d ?? 0;
        a.idx.push(i);
        foeAgg.set(e.stat, a);
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
      case "learn":
        out.push({ text: `✦ Learned ${r.abilities[e.id]?.name ?? e.id}`, tone: "good", src: e.src });
        break;
      case "charge": {
        if (e.key.startsWith(ABILITY_PREFIX))
          out.push({ text: `✦ ${r.abilities[e.key.slice(ABILITY_PREFIX.length)]?.name ?? e.key}`, tone: "neutral", src: e.src });
        else if (e.key.startsWith("perk:"))
          out.push({ text: `↻ ${r.perks[e.key.split(":")[1]]?.name ?? "Perk"}`, tone: "good", src: e.src });
        break;
      }
    }
  });
  if (timeAgg.min >= 1) {
    const m = timeAgg.min;
    out.unshift({ text: m >= 60 ? `⏱ +${formatNumber(m / 60)}h` : `⏱ +${Math.round(m)}m`, tone: "neutral", src: timeAgg.narrIdx.length === timeAgg.idx.length ? "narrator" : "action" });
  }
  for (const [stat, a] of foeAgg) {
    if (Math.abs(a.d) < 0.05)
      continue;
    const enc = before.encounter ?? after.encounter;
    const def = enc ? r.encounters[enc.id] : undefined;
    const fs = def?.foe.stats.find((x) => x.id === stat);
    const foe = (after.encounter ?? before.encounter)?.foeName ?? def?.foe.name ?? "Foe";
    out.push({ text: `${foe} · ${fs?.label ?? stat} ${signed(a.d)}`, tone: a.d < 0 === (fs?.good !== "high") ? "good" : "bad", src: a.src, undo: a.idx });
  }
  for (const [key, a] of statAgg) {
    const id = key.split("|")[0];
    const def = r.stats[id];
    if (!def || def.kind === "hidden")
      continue;
    const d = a.set ? (after.stats[id] ?? 0) - (before.stats[id] ?? 0) : a.d;
    if (Math.abs(d) < 0.05)
      continue;
    const bBefore = bandFor(def, before.stats[id] ?? def.start, statMax(r, def, before));
    const bAfter = bandFor(def, after.stats[id] ?? def.start, statMax(r, def, after));
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
  const causeOf = (ev) => ev.why ?? (ev.src === "narrator" ? "Read from the story" : ev.src === "manual" ? "You set this" : null);
  for (const c of out) {
    const why = [...new Set((c.undo ?? []).map((i) => events[i] && causeOf(events[i])).filter((x) => !!x))];
    if (why.length)
      c.why = why;
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
      summary: `${checkSummary(rec.check)}${rec.check.perk ? ` · ↻ ${rec.check.perk}` : ""}`
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
        odds: Object.entries(d.p).map(([k, p]) => ({ desc: d.descs?.[k] ?? spec?.options.find((o) => o.id === k)?.desc ?? k, p })).sort((a, b) => b.p - a.p)
      };
    }),
    contradiction: rec.contradiction ?? null,
    mind: rec.mind ? { cause: rec.mind.cause, kind: rec.mind.kind, meant: rec.mind.meant, chance: rec.mind.chance } : null,
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
  const band = bandFor(def, v, max);
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
    lines.push(`ENCOUNTER in progress: ${e.name} vs ${e.foe}, round ${e.round}${e.stats.length ? ` — ${e.stats.map((x) => `${x.label} ${formatNumber(x.value)}/${formatNumber(x.max)}`).join(", ")}` : ""}${e.momentum !== null ? ` — momentum ${e.momentum > 0 ? "+" : ""}${Math.round(e.momentum)} (−100 = ${e.foe} wins, +100 = {{user}} wins)` : ""}`);
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
  } else {
    if (here.length || Object.keys(s.people).length)
      lines.push(`Present here: ${here.length ? here.join(", ") : "none of the people {{user}} knows"}`);
    const was = Object.entries(s.scene).filter(([id, v]) => v.here && s.people[id] && v.loc !== s.location && v.loc === s.lastLocation && !here.includes(s.people[id].name)).map(([id]) => personName(r, s, id));
    if (was.length)
      lines.push(`Were with {{user}} before arriving here (include them only if they came along): ${was.join(", ")}`);
  }
  const date = dateDigest(r, s);
  if (date)
    lines.push(date);
  const body = bodyLine(r, s);
  if (body)
    lines.push(body);
  lines.push(...workDigest(r, s));
  const saw = Object.entries(s.seen).filter(([id]) => s.people[id]);
  if (saw.length) {
    const eyes = saw.filter(([, v]) => !v.heard).map(([id]) => personName(r, s, id));
    const ears = saw.filter(([, v]) => v.heard).map(([id]) => personName(r, s, id));
    lines.push(`Reputation: ${eyes.length ? `${eyes.join(", ")} ${eyes.length === 1 ? "has" : "have"} seen {{user}} exposed` : ""}${eyes.length && ears.length ? "; " : ""}${ears.length ? `${ears.join(", ")} heard about it` : ""}.`);
  }
  const meters = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "meter" || d.kind === "money");
  const other = r.statOrder.map((id) => r.stats[id]).filter((d) => d.kind === "attribute" || d.kind === "skill");
  const ml = meters.map((d) => statLine(r, d, s, r.narration.numbers)).filter(Boolean);
  if (ml.length)
    lines.push(ml.join(" · "));
  const ol = other.map((d) => statLine(r, d, s, r.narration.numbers)).filter(Boolean);
  if (ol.length)
    lines.push(`Skills: ${ol.join(" · ")}`);
  const conds = Object.keys(s.conditions).map((id) => r.conditions[id]?.label ?? id);
  if (conds.length)
    lines.push(`Conditions: ${conds.join(", ")}`);
  const perks = Object.keys(s.perks).map((id) => r.perks[id]).filter((p) => p);
  if (perks.length)
    lines.push(`Perks: ${perks.map((p) => p.narrator ? `${p.name} — ${p.narrator}` : p.name).join("; ")}`);
  const known = Object.values(r.abilities).filter((ab) => knowsAbility(r, s, ab.id));
  if (known.length)
    lines.push(`{{user}}'s own abilities (they work as the rules say; only the rules decide when one is used): ${known.map((ab) => `${ab.name}${ab.desc ? ` (${ab.desc})` : ""}`).join("; ")}`);
  const wornSet = new Set(Object.values(s.worn));
  const loose = Object.entries(s.items).filter(([id]) => !wornSet.has(id));
  const uses = (id) => {
    const per = r.items[id]?.uses ?? 0;
    return per > 1 ? `, ${s.uses[id] ?? per} of ${per} uses left` : "";
  };
  const inv = loose.filter(([id]) => !r.items[id]?.slot).map(([id, n]) => `${itemName(r, s, id)}${n > 1 ? ` ×${n}` : ""}${uses(id) ? ` (${uses(id).slice(2)})` : ""}`);
  if (inv.length)
    lines.push(`Carrying: ${inv.join(", ")}`);
  const spare = loose.filter(([id]) => r.items[id]?.slot).map(([id]) => itemName(r, s, id));
  if (spare.length)
    lines.push(`Carried but NOT being worn (packed away — {{user}} isn't wearing these): ${spare.join(", ")}`);
  if (s.pregnancy && s.pregnancy.told > 0) {
    const weeks = Math.floor((s.minutes - s.pregnancy.since) / 1440 / 7);
    const carrier = s.pregnancy.carrier === "player" ? "{{user}}" : personName(r, s, s.pregnancy.carrier);
    const other = s.pregnancy.carrier === "player" ? personName(r, s, s.pregnancy.with) : "{{user}}";
    lines.push(`${carrier} is ${weeks} week${weeks === 1 ? "" : "s"} pregnant (${other}'s child).`);
  }
  const kids = Object.entries(s.kin).filter(([, k]) => !k.joined).map(([id, k]) => `${k.name} (${k.sex === "girl" ? "daughter" : "son"}, age ${kinAge(r, s, id)})`);
  if (kids.length)
    lines.push(`Family — {{user}}'s children: ${kids.join(", ")}. They are minors: never part of anything romantic or sexual, and kept out of any sexual scene.`);
  const between = bondLines(r, s);
  if (between.length)
    lines.push(`Between people: ${between.join("; ")}`);
  const feel = (id, name) => {
    const parts = r.relStatOrder.map((rs) => {
      const def = r.relStats[rs];
      if (def.show === "hidden")
        return null;
      const v = s.rel[id]?.[rs] ?? def.start;
      const band = bandFor(def, v);
      return band && def.show !== "number" ? `${def.label} ${band.text}` : `${def.label} ${formatNumber(v)}`;
    }).filter(Boolean);
    return parts.length ? `${name} (${parts.join(", ")})` : name;
  };
  const inScene = hud.people.filter((p) => p.present);
  if (inScene.length)
    lines.push(`Relationships (here): ${inScene.map((p) => feel(p.id, p.name)).join("; ")}`);
  const away = hud.people.filter((p) => !p.present).sort((a, b) => (s.scene[b.id]?.at ?? -1) - (s.scene[a.id]?.at ?? -1)).slice(0, 8);
  if (away.length)
    lines.push(`Not in this scene (bring them in only if the story calls for it): ${away.map((p) => feel(p.id, p.name)).join("; ")}`);
  return lines.join(`
`);
}
function narratorKnowledge(r, s) {
  const lines = [];
  if (s.pregnancy && s.pregnancy.told === 0) {
    const who = s.pregnancy.carrier === "player" ? "{{user}}" : personName(r, s, s.pregnancy.carrier);
    lines.push(`Behind the scenes: ${who} is pregnant. Nobody knows yet — show no signs until the rules say so.`);
  }
  for (const c of Object.values(r.companions)) {
    if (!s.people[c.id])
      continue;
    for (const id of c.knows) {
      const sec = r.secrets[id];
      if (!sec)
        continue;
      lines.push(`Only ${personName(r, s, c.id)} knows this (no one else can mention it; ${personName(r, s, c.id)} reveals it only if the scene truly earns it): ${sec.about} — ${sec.stages.map((st) => st.text).join(" ")}`);
    }
  }
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
  const sess = activeSession(r, s);
  if (sess && s.people[sess.who]) {
    const name = personName(r, s, sess.who);
    const last = sess.last ? `, just reacted: ${REACTION_LABEL[sess.last.reaction].toLowerCase()}` : "";
    moods[name] = `${moodOf(sess.mood).label.toLowerCase()}${last}${moods[name] ? `; ${moods[name]}` : ""}`;
  }
  const notes = [];
  if (sess?.kind === "outing")
    notes.push(`On a date at ${r.dating.venues[sess.venue ?? ""]?.name ?? "somewhere"}`);
  if (s.encounter)
    notes.push(`In a fight or tense encounter: ${r.encounters[s.encounter.id]?.name ?? s.encounter.id}`);
  if (s.dungeon)
    notes.push("Exploring a dungeon");
  return Object.keys(moods).length || notes.length ? { moods, notes } : null;
}
function perception(r, s) {
  const env = makeEnv(r, s);
  const lines = r.mind.perception.filter((p) => evalBool(p.when, env, false)).map((p) => p.text);
  return lines.length ? lines.join(`
`) : null;
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
  init_freeform();
  init_encounter_view();
  init_resolve();
  init_world();
  init_run();
  init_talk();
  init_types2();
  init_work();
  init_expr();
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

// src/engine/date/view.ts
function personView(r, s, who, here) {
  const known = s.dating.known[who] ?? {};
  const activity = (id) => Object.values(r.dating.venues).flatMap((v) => v.activities).find((a) => a.id === id)?.label;
  const label = (key) => r.dating.topics[key]?.label ?? (key.startsWith("item:") ? `Gift: ${itemName(r, s, key.slice(5))}` : key.startsWith("act:") ? activity(key.slice(4)) ?? key.slice(4).replace(/_/g, " ") : key);
  const by = (x) => Object.entries(known).filter(([, v]) => x.includes(v)).map(([k]) => label(k));
  const loveDef = r.relStats[r.dating.love];
  const fearDef = r.relStats[r.dating.fear];
  return {
    id: who,
    name: personName(r, s, who),
    here: here.has(who) || !!r.people[who] && !r.people[who].schedule.length,
    stage: stageLabel(r, s, who),
    stageIndex: stageIndex(r, s, who),
    hostile: isHostile(r, s, who),
    partner: !!s.dating.partners[who],
    love: relPct(r, s, who, r.dating.love) / 100,
    fear: relPct(r, s, who, r.dating.fear) / 100,
    loveText: loveDef ? bandFor(loveDef, s.rel[who]?.[r.dating.love] ?? loveDef.start)?.text ?? null : null,
    fearText: fearDef ? bandFor(fearDef, s.rel[who]?.[r.dating.fear] ?? fearDef.start)?.text ?? null : null,
    dates: s.dating.dates[who]?.count ?? 0,
    loves: by(["love"]),
    likes: by(["like"]),
    dislikes: by(["dislike", "hate"]),
    romance: romanceOk(r, s, who)
  };
}
function buildDateView(r, s, lines = []) {
  if (!r.dating.enabled)
    return null;
  const here = new Set(presentPeople(r, s, makeEnv(r, s)));
  const people = talkablePeople(r, s).map((id) => personView(r, s, id, here)).sort((a, b) => Number(b.here) - Number(a.here) || b.love - a.love);
  const sess = activeSession(r, s);
  const stages = r.dating.stages.map((st) => st.label);
  if (!sess)
    return { session: null, person: null, people, categories: [], moves: [], stages };
  const who = sess.who;
  const blocked = new Set(lines.map((l) => l.toLowerCase()));
  const moves = dateMoves(r, s, lines);
  const offered = new Set(moves.filter((m) => m.kind === "topic").map((m) => m.id.slice("date:topic:".length)));
  const known = s.dating.known[who] ?? {};
  const categories = sess.kind === "plan" || sess.closing ? [] : r.dating.categories.map((c) => ({
    id: c.id,
    label: c.label,
    icon: c.icon,
    topics: r.dating.topicOrder.map((id) => r.dating.topics[id]).filter((tp) => tp.category === c.id).map((tp) => {
      const k = known[tp.id] ?? null;
      const odds = k ? warmth(reactionPrior(r, s, sess, who, prefOf(r, s, who, tp.id, [tp.category]), { stage: tp.stage, repeat: sess.used[tp.id] ?? 0 })) : null;
      return {
        id: tp.id,
        label: tp.label,
        desc: tp.desc ?? null,
        known: k,
        knownLabel: k ? REACTION_LABEL[k] : null,
        used: sess.used[tp.id] ?? 0,
        lock: offered.has(tp.id) ? null : topicLock(r, s, who, tp, blocked) ?? "Not right now",
        odds
      };
    })
  })).filter((c) => c.topics.length);
  const mood = moodOf(sess.mood);
  return {
    session: {
      who,
      name: personName(r, s, who),
      kind: sess.kind,
      venue: sess.venue ? r.dating.venues[sess.venue]?.name ?? sess.venue : null,
      beat: sess.beat,
      beats: sess.beats,
      fatigue: sess.fatigue,
      mood: sess.mood,
      moodLabel: mood.label,
      moodFace: mood.face,
      combo: sess.combo,
      enjoy: sess.enjoy,
      closing: sess.closing,
      last: sess.last ? { label: sess.last.label, reaction: sess.last.reaction, text: REACTION_LABEL[sess.last.reaction] } : null
    },
    person: personView(r, s, who, here),
    people,
    categories,
    moves: moves.filter((m) => m.kind !== "topic").map((m) => ({ id: m.id, label: m.label, desc: m.desc, odds: m.odds, kind: m.kind, group: m.group })),
    stages
  };
}
var init_view3 = __esm(() => {
  init_state();
  init_world();
  init_talk();
  init_types2();
});

// src/backend/decisions.ts
function newNames(text, known) {
  const knownWords = new Set(known.flatMap((n) => n.toLowerCase().split(/[^\p{L}\p{N}']+/u)).filter(Boolean));
  const out = new Set;
  const re = /\p{Lu}\p{Ll}{2,}/gu;
  for (const m of text.matchAll(re)) {
    const before = text.slice(0, m.index).trimEnd();
    const prev = before.slice(-1);
    if (!before || /[.!?"“”*…(\-—:\n]/.test(prev))
      continue;
    const w = m[0].toLowerCase();
    if (COMMON_CAPS.has(w) || knownWords.has(w))
      continue;
    out.add(m[0]);
  }
  return [...out];
}
function mentions(text, name) {
  const t = text.toLowerCase();
  const n = name.toLowerCase().trim();
  if (!n)
    return false;
  if (t.includes(n))
    return true;
  const words = n.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !["the", "and", "with", "for", "of"].includes(w));
  if (!words.length)
    return false;
  const has = (w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|es)?([^\\p{L}]|$)`, "u").test(t);
  if (has(words[words.length - 1]))
    return true;
  return words.filter(has).length * 2 >= words.length && words.length > 1;
}
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
  const talking = !!activeSession(r, s) || !!s.job;
  const actions = playerText && !talking ? [
    ...availableChoices(r, s, settings.lines),
    ...usableItems(r, s).filter((u) => !u.locked).map((u) => ({ id: u.id, a: u.a, label: u.a.label })),
    ...usableAbilities(r, s).filter((u) => !u.status.locked).map((u) => ({ id: u.id, a: u.a, label: u.a.label }))
  ] : [];
  const travel = playerText && !talking ? travelTargets(r, s) : [];
  const improv = !!playerText && !talking && r.improvise.enabled && !s.dungeon;
  const approach = improv ? improvStats(r) : [];
  if (playerText && (actions.length || travel.length || improv)) {
    const criteria = {
      [NONE]: "None of these: dialogue, thoughts, feelings, plans, questions, or something trivial that can't fail"
    };
    for (const c of actions)
      criteria[c.id] = `${c.label}${c.a.desc ? ` — ${c.a.desc}` : ""}`;
    for (const t of travel)
      criteria[`${TRAVEL_PREFIX}${t}`] = `Go to ${r.locations[t].name}`;
    if (improv)
      criteria[ATTEMPT] = "Something else with a real chance of failing that matters to the story, not listed above (sneaking, persuading, lying, fighting, climbing, stealing, resisting, performing…)";
    q.action = { type: "choice", instructions: `Which of these does ${player}'s latest message actually attempt right now?`, criteria };
    if (improv || actions.some((c) => c.a.params.length)) {
      q.difficulty = { type: "score", instructions: `How hard is what ${player} is attempting, given the scene?`, criteria: DIFFICULTY };
    }
    if (approach.length > 1) {
      q.approach = {
        type: "choice",
        instructions: `If ${player} is attempting something that could fail, which of ${player}'s abilities matters most for it?`,
        criteria: Object.fromEntries(approach.map((id) => [id, `${r.stats[id].label}${r.stats[id].desc ? ` — ${r.stats[id].desc}` : ""}`]))
      };
    }
  }
  const storyEnc = !s.encounter && !s.dungeon && !s.job && !s.ended ? Object.values(r.encounters).filter((x) => x.fromStory) : [];
  const here = storyEnc.length ? presentPeople(r, s, makeEnv(r, s)) : [];
  if (storyEnc.length) {
    q.encounter = {
      type: "choice",
      instructions: `Is one of these actually breaking out right now, in the latest exchange (not just threatened, feared or talked about)?`,
      criteria: { [NONE]: "No — nothing like this is starting right now", ...Object.fromEntries(storyEnc.map((x) => [`enc:${x.id}`, `${x.name}${x.desc ? ` — ${x.desc}` : ""}`])) }
    };
    const last = s.lastEncounter;
    if (last && s.minutes - last.at < 24 * 60) {
      q.encounter_fresh = {
        type: "noul",
        instructions: `${r.encounters[last.id]?.name ?? "An encounter"} just ended (${last.outcome.replace(/_/g, " ")}). If something is breaking out now, is it a genuinely NEW incident — not the same one still being described, its aftermath, or a memory of it?`
      };
    }
    if (here.length) {
      q.opponent = {
        type: "choice",
        instructions: `If a confrontation is starting, who is ${player} up against?`,
        criteria: { other: "Someone else, or no one in particular", ...Object.fromEntries(here.map((id) => [`p:${id}`, personName(r, s, id)])) }
      };
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
  const enc = ans.encounter;
  if (enc?.type === "choice" && enc.choice.startsWith("enc:") && (enc.probabilities[enc.choice] ?? enc.confidence) >= ENCOUNTER_SURE) {
    const id = enc.choice.slice(4);
    if (storyEnc.some((x) => x.id === id)) {
      const opp = ans.opponent;
      const who = opp?.type === "choice" && opp.choice.startsWith("p:") && opp.confidence >= 0.5 ? opp.choice.slice(2) : null;
      const fresh = ans.encounter_fresh;
      out.encounter = { id, ...who && here.includes(who) ? { foe: personName(r, s, who) } : {}, ...fresh?.type === "noul" && fresh.noul >= 0.7 ? { fresh: true } : {} };
    }
  }
  const act = ans.action;
  if (act?.type !== "choice" || act.choice === NONE)
    return out;
  const id = act.choice;
  const conf = act.probabilities[id] ?? act.confidence;
  out.confidence = conf;
  let intent = null;
  let label = id;
  if (id === ATTEMPT) {
    if (!improv)
      return out;
    const ap = ans.approach;
    const stat = approach.length === 1 ? approach[0] : ap?.type === "choice" && approach.includes(ap.choice) ? ap.choice : approach[0] ?? "";
    const level = ans.difficulty?.type === "score" ? ans.difficulty.score : 1;
    const difficulty = DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, Math.round(level)))];
    intent = { actionId: `${IMPROV}${stat}`, via: "adjudicator", params: { difficulty } };
    label = `${stat ? r.stats[stat].label : "Luck"} check (${difficulty})`;
  } else if (id.startsWith(TRAVEL_PREFIX)) {
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
    player_message: clip(opts.playerText, 1200),
    ...opts.card ? { character_card: opts.card } : {}
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
    q[`stat:${id}`] = { type: "choice", instructions: `During the reply, how did ${player}'s ${d.label}${d.desc ? ` (${d.desc})` : ""} change, beyond anything listed in already_applied?`, criteria: stepCriteria(d.label) };
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
        q[`rel:${pid}:${rs}`] = { type: "choice", instructions: `How did ${name}'s ${d.label} toward ${player} change during the reply, beyond anything listed in already_applied?`, criteria: stepCriteria(`${name}'s ${d.label}`) };
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
  const hereBefore = presentPeople(r, s, makeEnv(r, s));
  const leftBehind = Object.entries(s.scene).filter(([id, v]) => v.here && s.people[id] && v.loc !== s.location && v.loc === s.lastLocation).map(([id]) => id);
  const cast = [...new Set([...hereBefore, ...mentioned, ...leftBehind])].slice(0, 12);
  for (const pid of cast) {
    q[`here:${pid}`] = { type: "noul", instructions: `At the end of the reply, ${personName(r, s, pid)} is physically in the scene with ${player} (in the same place — not just mentioned, remembered, on the phone, or left behind)` };
  }
  const wornIds = new Set(Object.values(s.worn));
  let itemQs = 0;
  for (const [id, n] of Object.entries(s.items)) {
    if (itemQs >= 8)
      break;
    const name = itemName(r, s, id);
    if (!mentions(opts.reply, name))
      continue;
    const def = r.items[id];
    const per = def?.uses ?? 0;
    const criteria = {
      same: "Nothing happened to it — only mentioned, carried, held, or worn as before",
      used: def?.use ? `${player} used it as meant (${def.use.label})${per > 0 ? ` — once; it has ${s.uses[id] ?? per} of ${per} uses left` : def.keep ? "" : " — and it's used up"}` : per > 0 ? `Used once (it has ${s.uses[id] ?? per} of ${per} uses left)` : "Used, but not used up — it's still there afterwards",
      gone: def?.use ? `Not used — but broken, given away, dropped, lost or taken: ${player} has one fewer${n > 1 ? ` (has ${n} now)` : ""}` : `Used up, eaten, drunk, emptied, broken, given away, dropped, lost or taken — ${player} has one fewer${n > 1 ? ` (has ${n} now)` : ""}`
    };
    if (def?.slot && !wornIds.has(id))
      criteria.worn = `Put on — ${player} is wearing it by the end of the reply`;
    q[`item:${id}`] = { type: "choice", instructions: `What happened to ${player}'s ${name} during the reply?`, criteria };
    itemQs++;
  }
  const growable = r.growth.enabled && r.growth.train ? r.statOrder.filter((id) => (r.stats[id].kind === "skill" || r.stats[id].kind === "attribute") && r.stats[id].growth > 0) : [];
  if (growable.length) {
    q.train = {
      type: "choice",
      instructions: `During the reply, did ${player} spend real effort practising, training, studying or rehearsing one of these?`,
      criteria: { [NONE]: "No", ...Object.fromEntries(growable.map((id) => [id, `${r.stats[id].label}${r.stats[id].desc ? ` — ${r.stats[id].desc}` : ""}`])) }
    };
  }
  const storyEnc = !s.encounter && !s.dungeon && !s.job ? Object.values(r.encounters).filter((x) => x.fromStory) : [];
  if (storyEnc.length) {
    q.encounter = {
      type: "choice",
      instructions: `At the end of the reply, has one of these actually broken out (not just threatened)?`,
      criteria: { [NONE]: "No", ...Object.fromEntries(storyEnc.map((x) => [`enc:${x.id}`, `${x.name}${x.desc ? ` — ${x.desc}` : ""}`])) }
    };
    const last = s.lastEncounter;
    if (last && s.minutes - last.at < 24 * 60) {
      q.encounter_fresh = {
        type: "noul",
        instructions: `${r.encounters[last.id]?.name ?? "An encounter"} just ended (${last.outcome.replace(/_/g, " ")}). If one broke out in this reply, is it a genuinely NEW incident — not the same one still being described, its aftermath, or a memory of it?`
      };
    }
    const people = [...new Set([...hereBefore, ...mentioned])];
    if (people.length)
      q.opponent = { type: "choice", instructions: `If a confrontation broke out, who is ${player} up against?`, criteria: { other: "Someone else, or no one in particular", ...Object.fromEntries(people.map((id) => [`p:${id}`, personName(r, s, id)])) } };
  } else if (s.encounter) {
    const def = r.encounters[s.encounter.id];
    const outcomes = [...new Set([...Object.keys(def?.outcomes ?? {}), ...def?.momentum ? [def.momentum.win, def.momentum.lose] : []])];
    q.encounter_end = {
      type: "choice",
      instructions: `Is ${def?.name ?? "the encounter"} over by the end of the reply?`,
      criteria: {
        ongoing: "No — it's still going",
        ...Object.fromEntries(outcomes.map((o) => [`end:${o}`, `Yes — it ended: ${o.replace(/_/g, " ")}`])),
        "end:broke_off": "Yes — it stopped some other way (broken off, interrupted, talked down, escaped)"
      }
    };
  }
  if (r.body.enabled && r.body.narrator)
    q["gate:body"] = { type: "noul", instructions: `${player}'s body changes during the reply (a transformation, new mark or tattoo, haircut or dye, a lasting injury…)` };
  if (r.peopleOpen)
    q["gate:people"] = { type: "noul", instructions: "The reply introduces a named character who wasn't in the game state before" };
  if (r.itemsOpen)
    q["gate:items"] = { type: "noul", instructions: `${player} gains, loses or uses up an item during the reply` };
  if (r.locationsOpen)
    q["gate:move"] = { type: "noul", instructions: `${player} ends the reply somewhere different from ${s.locationName ?? "where they started"}` };
  const state = {
    game_state: stateDigest(r, s),
    player_message: clip(opts.playerText, 1200),
    narrator_reply: clip(opts.reply, 6000),
    already_applied: opts.applied || "(nothing — the rules applied no changes this turn)"
  };
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
  for (const pid of cast) {
    const a = ans[`here:${pid}`];
    if (a?.type !== "noul")
      continue;
    if (a.noul >= 0.6)
      (p.scene ??= {})[pid] = true;
    else if (a.noul <= 0.3)
      (p.scene ??= {})[pid] = false;
  }
  for (const [key, a] of Object.entries(ans)) {
    if (!key.startsWith("item:") || !confident(a) || a.choice === "same")
      continue;
    const id = key.slice(5);
    const def = r.items[id];
    if (a.choice === "used" && ((def?.uses ?? 0) > 0 || def?.use)) {
      (p.used ??= {})[id] = 1;
      if (def?.use && !def.keep && !(def.uses > 0))
        (p.items ??= {})[id] = -1;
    } else if (a.choice === "gone")
      (p.items ??= {})[id] = -1;
    else if (a.choice === "worn")
      (p.wear ??= []).push(id);
  }
  if (confident(ans.train) && ans.train.choice !== NONE && growable.includes(ans.train.choice))
    p.train = [ans.train.choice];
  const enc = ans.encounter;
  if (enc?.type === "choice" && enc.choice.startsWith("enc:") && (enc.probabilities[enc.choice] ?? enc.confidence) >= ENCOUNTER_SURE) {
    p.encounter = enc.choice.slice(4);
    const fresh = ans.encounter_fresh;
    if (fresh?.type === "noul" && fresh.noul >= 0.7)
      p.encounterFresh = true;
    const opp = ans.opponent;
    if (opp?.type === "choice" && opp.choice.startsWith("p:") && opp.confidence >= 0.5)
      p.foe = personName(r, s, opp.choice.slice(2));
  }
  const over = ans.encounter_end;
  if (over?.type === "choice" && over.choice.startsWith("end:") && (over.probabilities[over.choice] ?? over.confidence) >= ENCOUNTER_OVER)
    p.encounterEnd = over.choice.slice(4);
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
  const known = [player, ...Object.values(s.people).map((x) => x.name), ...Object.values(r.locations).map((l) => l.name), s.locationName ?? "", ...Object.keys(s.items).map((id) => itemName(r, s, id))];
  const peopleBar = newNames(opts.reply, known).length ? 0.35 : 0.6;
  for (const g of ["people", "items", "move", "body"]) {
    const a = ans[`gate:${g}`];
    if (a?.type === "noul" && a.noul >= (g === "people" ? peopleBar : 0.6))
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
var NONE = "none", ATTEMPT = "attempt", ENCOUNTER_SURE = 0.6, ENCOUNTER_OVER = 0.7, COMMON_CAPS, DIFFICULTY, STEP_FACTOR, TIME_LEVELS, TIME_MINUTES;
var init_decisions = __esm(() => {
  init_resolve();
  init_ruleset();
  init_state();
  init_freeform();
  init_world();
  init_view();
  init_talk();
  COMMON_CAPS = new Set([
    "the",
    "a",
    "an",
    "he",
    "she",
    "they",
    "it",
    "his",
    "her",
    "their",
    "i",
    "you",
    "we",
    "but",
    "and",
    "or",
    "so",
    "then",
    "when",
    "as",
    "if",
    "in",
    "on",
    "at",
    "with",
    "for",
    "from",
    "to",
    "of",
    "by",
    "that",
    "this",
    "there",
    "here",
    "what",
    "who",
    "why",
    "how",
    "yes",
    "no",
    "not",
    "oh",
    "ah",
    "maybe",
    "still",
    "just",
    "even",
    "now",
    "after",
    "before",
    "once",
    "every",
    "each",
    "some",
    "all",
    "something",
    "someone",
    "nothing",
    "god",
    "mr",
    "mrs",
    "ms",
    "miss",
    "sir",
    "lady",
    "lord"
  ]);
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
  return (await askRaw(system, user, settings, userId, timeoutMs, opts)).content;
}
async function askProse(system, user, settings, userId, timeoutMs, opts = {}) {
  const res = await askRaw(system, user, settings, userId, timeoutMs, opts);
  const text = res.content.trim().replace(/^```\w*|```$/g, "").trim();
  return res.finish === "length" || !finishedProse(text) ? "" : text;
}
async function askRaw(system, user, settings, userId, timeoutMs, opts) {
  const res = await host().generate.quiet({
    type: "quiet",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    connection_id: settings.helperConnectionId || undefined,
    reasoning: { source: "off" },
    parameters: { temperature: opts.temperature ?? 0.1, ...opts.maxTokens ? { max_tokens: opts.maxTokens } : {} },
    userId,
    signal: AbortSignal.timeout(Math.max(3000, timeoutMs))
  });
  return typeof res === "string" ? { content: res, finish: "" } : { content: res?.content ?? "", finish: res?.finish_reason ?? "" };
}
function clip2(s, n) {
  return s.length > n ? `…${s.slice(-n)}` : s;
}
async function extract(r, s, playerText, reply, settings, userId, only, applied) {
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
  const tracked = Object.values(s.people).map((p) => p.name);
  if (want("people") && r.peopleOpen) {
    allowed.push(`- "people": named characters who appear in the reply (speak, act, or are spoken to) and aren't tracked yet${tracked.length ? ` (already tracked: ${tracked.join(", ")})` : ""}, as [{"name": "...", "feelings": {<how they feel toward the player RIGHT NOW, absolute values>}}]${rels.length ? ` — scales: ${feelScale}` : ""}`);
  }
  if (want("scene") && (tracked.length || r.peopleOpen)) {
    allowed.push(`- "present": names of everyone (tracked or new) physically in the scene with the player at the end of the reply — not people only mentioned, remembered, on the phone, or left behind. Always include it, even as [].`);
  }
  const uncalibrated = Object.keys(s.people).filter((id) => !s.calibrated[id]).map((id) => s.people[id].name);
  if (want("people") && rels.length && uncalibrated.length) {
    allowed.push(`- "feelings": for these tracked people who appear in the reply, where they stand toward the player right now (absolute values, same scales): ${uncalibrated.join(", ")} — as {"Name": {"stat": value}}`);
  }
  if (want("items") && (r.itemsOpen || Object.keys(r.items).length))
    allowed.push(`- "items": item name → count gained (+) or lost (−); lost includes used up, eaten, drunk, emptied, broken, given away or taken. Held: ${Object.entries(s.items).map(([id, n]) => `${itemName(r, s, id)}${n > 1 ? ` ×${n}` : ""}`).join(", ") || "nothing"}`);
  const withUses = Object.keys(s.items).filter((id) => (r.items[id]?.uses ?? 0) > 0);
  if (want("used") && withUses.length)
    allowed.push(`- "used": item name → times used, for items that have uses: ${withUses.map((id) => `${itemName(r, s, id)} (${s.uses[id] ?? r.items[id].uses}/${r.items[id].uses} uses left)`).join(", ")}`);
  const growable = r.growth.enabled && r.growth.train ? r.statOrder.filter((id) => (r.stats[id].kind === "skill" || r.stats[id].kind === "attribute") && r.stats[id].growth > 0) : [];
  if (want("train") && growable.length)
    allowed.push(`- "trained": ids of abilities the player spent real effort practising, training, studying or rehearsing during the reply: ${growable.join(", ")}`);
  if (want("encounter")) {
    const storyEnc = !s.encounter && !s.dungeon && !s.job ? Object.values(r.encounters).filter((x) => x.fromStory) : [];
    if (storyEnc.length)
      allowed.push(`- "encounter": the id of one of these if it actually broke out in the reply (not just threatened): ${storyEnc.map((x) => `${x.id} (${x.name})`).join(", ")}; with "foe": the opponent's name when it's a specific person`);
    else if (s.encounter) {
      const def = r.encounters[s.encounter.id];
      const outcomes = [...new Set([...Object.keys(def?.outcomes ?? {}), ...def?.momentum ? [def.momentum.win, def.momentum.lose] : []]), "broke_off"];
      allowed.push(`- "encounter_end": only if ${def?.name ?? "the encounter"} is clearly over by the end of the reply, how it ended: ${outcomes.join(", ")}`);
    }
  }
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
      allowed.push(`- "wear": ids of carried clothing put on, or that the reply shows the player wearing (${owned.join(", ")})`);
  }
  if (want("body") && r.body.enabled && r.body.narrator) {
    const now = Object.entries(s.body).map(([p, t]) => `${p}: ${Object.entries(t).map(([k, v]) => `${k} ${v}`).join(", ")}`).join("; ") || "nothing recorded";
    allowed.push(`- "body": lasting changes to the player's body as {"part": {"trait": "new value"}} (null removes a trait)${r.body.open ? "; new parts are allowed" : `; parts: ${Object.keys(r.body.parts).join(", ")}`}. Now: ${now}`);
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
    clip2(reply, 4000),
    ...applied ? ["", "Already applied by the rules this turn (don't report these again):", applied] : []
  ].join(`
`);
  try {
    const out = firstJson2(await ask(system, user, settings, userId, 30000));
    if (!out)
      return null;
    const p = out;
    if (Array.isArray(p.present)) {
      const listed = p.present.map(String).filter(Boolean);
      const scene = Object.fromEntries(listed.map((n) => [n, true]));
      for (const id of presentPeople(r, s, makeEnv(r, s))) {
        const name = s.people[id]?.name;
        if (name && !listed.some((l) => sameName(l, name)))
          scene[id] = false;
      }
      p.scene = scene;
    }
    delete p.present;
    if (Array.isArray(p.trained))
      p.train = p.trained.map(String);
    delete p.trained;
    if (typeof p.encounter_end === "string" && p.encounter_end)
      p.encounterEnd = p.encounter_end;
    delete p.encounter_end;
    return p;
  } catch (e) {
    logError("extractor", e);
    return null;
  }
}
var finishedProse = (t) => /[.!?…]["”’'*_)\]]*$/.test(t.trim()), sameName = (a, b) => {
  const x = a.trim().toLowerCase(), y = b.trim().toLowerCase();
  return x === y || x.split(/\s+/)[0] === y.split(/\s+/)[0];
};
var init_helpers = __esm(() => {
  init_state();
  init_world();
  init_view();
});

// src/backend/inject.ts
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
  const felt = perception(r, after);
  if (felt)
    parts.push(`[Warp — how {{user}} experiences things right now. Filter the narration through this.]
${felt}`);
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
function nextPrompt(prompt, reply, say, injection) {
  const clean = prompt.map((m) => typeof m.content === "string" && m.role === "user" ? { ...m, content: m.content.replace(WARP_BLOCK, "") } : m);
  let idx = -1;
  for (let i = clean.length - 1;i >= 0; i--)
    if (clean[i].role === "user") {
      idx = i;
      break;
    }
  const turn = [
    { role: "assistant", content: reply },
    { role: "user", content: `${say}

<warp>
${injection}
</warp>` }
  ];
  return idx >= 0 ? [...clean.slice(0, idx + 1), ...turn, ...clean.slice(idx + 1)] : [...clean, ...turn];
}
var WARP_BLOCK;
var init_inject = __esm(() => {
  init_view();
  WARP_BLOCK = /\n*<warp>[\s\S]*?<\/warp>/g;
});

// src/backend/snippets.ts
function plain(text, player) {
  return fillNames(text, player).replace(/^Dungeon \([^)]*\)\s*(—\s*since last time:\s*)?/, "").replace(/\s*Now:\s*/, " ").replace(/\*/g, "").replace(/\s+/g, " ").trim();
}
function reactionOf(rec) {
  const d = rec.decisions?.find((x) => x.id.startsWith("date:topic:") || x.id === "date:say");
  return d?.picked ?? null;
}
function scriptedLines(o) {
  const rng = seededRng(`${o.seed}:lines`);
  const out = [];
  if (o.kind === "date") {
    const sess = activeSession(o.r, o.after) ?? activeSession(o.r, o.before);
    const name = sess ? personName(o.r, o.after, sess.who) : "They";
    const reaction = reactionOf(o.rec);
    if (reaction) {
      out.push({ speaker: null, text: pick2(REACTION_BEAT[reaction], rng).replace(/\{name\}/g, name) });
      out.push({ speaker: name, text: pick2(REACTION_LINES[reaction], rng) });
      return out;
    }
  }
  for (const h of o.rec.hints) {
    const t = plain(h, o.player);
    if (t && !/^(?:This round's beats|Handle this beat)/.test(t))
      out.push({ speaker: null, text: t.length > MAX_CHARS ? `${t.slice(0, MAX_CHARS - 1)}…` : t });
    if (out.length >= MAX_LINES)
      break;
  }
  return out.length ? out : [{ speaker: null, text: o.kind === "date" ? "A quiet moment passes between you." : "The dungeon is quiet for a moment." }];
}
function sceneFacts(o) {
  const { r, after } = o;
  const facts = [];
  if (r.clock.enabled) {
    const c = formatClock(r, after.minutes);
    facts.push(`Time: ${c.day}, ${c.time} (${c.phase})`);
  }
  if (o.kind === "date") {
    const sess = activeSession(r, after) ?? activeSession(r, o.before);
    if (sess) {
      const name = personName(r, after, sess.who);
      const desc = r.people[sess.who]?.desc;
      facts.push(`With: ${name}${desc ? ` — ${desc}` : ""}`);
      facts.push(`Where things stand: ${stageLabel(r, after, sess.who)}; ${name}'s mood right now: ${moodOf((activeSession(r, after) ?? sess).mood).label.toLowerCase()}`);
      const venue = sess.venue ? r.dating.venues[sess.venue]?.name : null;
      facts.push(`Place: ${venue ?? after.locationName ?? "somewhere"}${sess.kind === "outing" ? " (on a date)" : ""}`);
    }
  } else if (after.dungeon || o.before.dungeon) {
    const run = after.dungeon ?? o.before.dungeon;
    facts.push(`Place: ${r.dungeons[run.id]?.name ?? "a dungeon"}, floor ${run.depth}`);
    const party = run.party.map((m) => m.id).filter((id) => o.after.people[id] || o.before.people[id]).map((id) => personName(o.r, o.after, id));
    if (party.length)
      facts.push(`With ${o.player}: ${party.join(", ")}`);
  } else if (after.locationName)
    facts.push(`Place: ${after.locationName}`);
  return facts;
}
async function modelLines(o, settings, userId) {
  const outcome = outcomePacket(o.r, o.rec, o.before, o.after, o.player);
  const user = [
    o.card ? `Who's who (for voice and appearance):
${o.card.slice(0, 3000)}` : "",
    `The player character: ${o.player}`,
    sceneFacts(o).join(`
`),
    o.recent.length ? `Just before:
${o.recent.slice(-4).map((l) => `${l.speaker ?? "(narration)"}: ${l.text}`).join(`
`)}` : "",
    o.said ? `${o.player} now: ${o.said}` : "",
    outcome ? `Decided by the rules (voice this):
${fillNames(outcome, o.player)}` : ""
  ].filter(Boolean).join(`

`);
  try {
    const raw = firstJson2(await ask(SYSTEM, user, settings, userId, 15000, { temperature: 0.85 }));
    const lines = Array.isArray(raw?.lines) ? raw.lines : [];
    const out = [];
    for (const l of lines.slice(0, MAX_LINES)) {
      const text = typeof l?.text === "string" ? l.text.trim().replace(/\s+/g, " ") : "";
      if (!text)
        continue;
      const sp = typeof l.speaker === "string" ? l.speaker.trim() : "";
      out.push({ speaker: sp && sp.toLowerCase() !== "narration" && sp.toLowerCase() !== "narrator" ? sp.slice(0, 40) : null, text: text.slice(0, MAX_CHARS) });
    }
    return out.length ? out : null;
  } catch (e) {
    logError("scene lines", e);
    return null;
  }
}
async function writeLines(o, settings, userId) {
  if (settings.sceneLines === "model") {
    const lines = await modelLines(o, settings, userId);
    if (lines)
      return lines;
  }
  return scriptedLines(o);
}
async function summaryLine(o) {
  const { r } = o;
  let fallback;
  if (o.kind === "date" && o.who) {
    const name = personName(r, o.end, o.who);
    const from = stageLabel(r, o.start, o.who), to = stageLabel(r, o.end, o.who);
    const where = o.venue ? ` at ${o.venue}` : o.end.locationName ? ` at ${o.end.locationName}` : "";
    fallback = `*${o.player} spent some time with ${name}${where}.${from !== to ? ` Things between them moved from ${from.toLowerCase()} to ${to.toLowerCase()}.` : ""}*`;
  } else if (o.dungeon) {
    fallback = `*${o.player} climbed back out of ${o.dungeon.name}, having reached floor ${o.dungeon.depth}${o.dungeon.gold ? `, carrying ${o.dungeon.gold} gold` : ""}.*`;
  } else
    fallback = `*Some time passes.*`;
  if (o.settings.sceneLines !== "model")
    return fallback;
  try {
    const text = await askProse("Summarise a finished mini-game scene as ONE short narration sentence (under 35 words) for a roleplay's history, in italics with *asterisks*. Past tense, third person, no dialogue.", [`Facts: ${fallback.replace(/\*/g, "")}`, `How it went:
${o.lines.slice(-10).map((l) => `${l.speaker ?? "(narration)"}: ${l.text}`).join(`
`)}`].join(`

`), o.settings, o.userId, 12000, { temperature: 0.6 });
    const line = text.trim().split(`
`).find((x) => x.trim())?.trim() ?? "";
    return line.length > 10 && line.length < 400 ? line.startsWith("*") ? line : `*${line.replace(/^\*|\*$/g, "")}*` : fallback;
  } catch {
    return fallback;
  }
}
var MAX_LINES = 3, MAX_CHARS = 220, REACTION_LINES, REACTION_BEAT, pick2 = (xs, rng) => xs[Math.floor(rng() * xs.length) % xs.length], SYSTEM;
var init_snippets = __esm(() => {
  init_dice();
  init_state();
  init_talk();
  init_view();
  init_helpers();
  init_inject();
  REACTION_LINES = {
    love: ["Oh — I love that. Really.", "You too? Okay, now I have to hear everything.", "That's my favourite thing to talk about."],
    like: ["That's nice. Tell me more.", "Mm, I like that.", "Huh — yeah, that's good."],
    neutral: ["Huh. I guess.", "Sure, I suppose.", "Mm-hm."],
    dislike: ["Can we talk about something else?", "That's… not really my thing.", "Let's not."],
    hate: ["Seriously? Drop it.", "I'd rather not talk about that. At all.", "Wow. Okay."]
  };
  REACTION_BEAT = {
    love: ["{name} lights up.", "{name} leans in, grinning.", "{name}'s eyes go bright."],
    like: ["{name} smiles.", "{name} nods along.", "{name} relaxes a little."],
    neutral: ["{name} shrugs.", "{name} glances away for a moment.", "{name} offers a polite half-smile."],
    dislike: ["{name}'s smile thins.", "{name} shifts, uncomfortable.", "{name} looks elsewhere."],
    hate: ["{name}'s face goes cold.", "{name} folds their arms.", "{name} stiffens."]
  };
  SYSTEM = [
    "You write short snippets for a visual-novel mini-game played alongside a roleplay.",
    "What happened is already decided by the game's rules — voice it faithfully; never change or add outcomes.",
    `Write at most ${MAX_LINES} short lines, each under 25 words: a character's spoken line, or a brief narration beat. Snappy, in character, present tense.`,
    "Never speak or act for the player character beyond what they did.",
    "Romance and anything sexual only ever involve adults.",
    'Reply with JSON only: {"lines": [{"speaker": "Name" or "", "text": "..."}]} — speaker "" is narration.'
  ].join(`
`);
});

// src/backend/intents.ts
function intentFor(r, state, settings, msgs, actionId, params) {
  if (actionId === EXPLORE) {
    if (!canExplore(r, state))
      return { error: "There's nowhere new to find here." };
    return { say: "*I explore around, looking for somewhere I haven't been.*", intent: { actionId: EXPLORE, via: "choice", label: "Explore" } };
  }
  if (actionId === RUN_EPILOGUE) {
    if (!state.ended || state.ended.told)
      return { error: "" };
    return { say: "*The end.*", intent: { actionId: RUN_EPILOGUE, via: "choice", label: "The ending" } };
  }
  if (actionId.startsWith(LIVE_PREFIX)) {
    const c = liveChoicesOf(msgs[msgs.length - 1])[Number(actionId.slice(LIVE_PREFIX.length))];
    if (!c || !r.liveChoices.tags[c.tag])
      return { error: "That choice isn't available anymore." };
    return { say: `*${c.label}*`, intent: { actionId: `${LIVE_PREFIX}${c.tag}${c.target ? `${TARGET_SEP}${c.target}` : ""}`, via: "choice", label: c.label } };
  }
  if (actionId.startsWith(PAY_PREFIX) || actionId.startsWith(JOB_PREFIX)) {
    const m = workMoves(r, state).find((x) => x.id === actionId);
    if (!m)
      return { error: "That isn't possible right now." };
    return { say: m.say, intent: { actionId: m.id, via: "choice", label: m.label } };
  }
  if (actionId.startsWith(DATE_PREFIX)) {
    const m = dateMoves(r, state, settings.lines).find((x) => x.id === actionId);
    if (!m)
      return { error: "That isn't possible right now." };
    return { say: m.say, intent: { actionId: m.id, via: "choice", label: m.label } };
  }
  if (actionId.startsWith(TRAVEL_PREFIX)) {
    const to = actionId.slice(TRAVEL_PREFIX.length);
    if (!travelTargets(r, state).includes(to))
      return { error: "You can't get there from here." };
    return { say: `*I head to ${r.locations[to].name}.*`, intent: { actionId, params, via: "choice" } };
  }
  if (actionId.startsWith(ITEM_PREFIX)) {
    const u = usableItems(r, state).find((x) => x.id === actionId);
    if (!u)
      return { error: "You don't have that anymore." };
    if (u.locked)
      return { error: u.locked };
    const name = r.items[actionId.slice(ITEM_PREFIX.length)]?.name ?? "it";
    return { say: u.a.say ?? `*I use the ${name}.*`, intent: { actionId, params, via: "choice", label: u.a.label } };
  }
  if (actionId.startsWith(ABILITY_PREFIX)) {
    const u = usableAbilities(r, state).find((x) => x.id === actionId);
    if (!u)
      return { error: "You can't use that here." };
    if (u.status.locked)
      return { error: u.status.locked };
    return { say: u.a.say ?? `*${u.a.label}.*`, intent: { actionId, params, via: "choice", label: u.a.label } };
  }
  const c = availableChoices(r, state, settings.lines).find((x) => x.id === actionId);
  if (!c)
    return { error: "That choice isn't available anymore." };
  const who = c.target ? state.people[c.target]?.name ?? c.target : "";
  return { say: c.a.say ? c.a.say.replace(/\{\{target\}\}|\{target\}/gi, who) : `*${c.label}*`, intent: { actionId, params, via: "choice" } };
}
var init_intents = __esm(() => {
  init_resolve();
  init_talk();
  init_types2();
  init_work();
  init_ledger();
});

// src/backend/drafts.ts
function textOf(res) {
  return typeof res === "string" ? res : res?.content ?? "";
}
async function writeReply(messages, userId, timeoutMs = 120000) {
  const res = await host().generate.quiet({ type: "quiet", messages, userId, signal: AbortSignal.timeout(timeoutMs) });
  return textOf(res).trim();
}
async function writeDrafts(prompt, n, userId) {
  const out = await Promise.allSettled(Array.from({ length: n }, () => writeReply(prompt, userId)));
  return out.flatMap((x) => x.status === "fulfilled" && x.value ? [x.value] : []);
}
async function judgeDrafts(decider, drafts, outcome, state) {
  if (drafts.length < 2)
    return 0;
  try {
    const ans = await decider.ask({ game_state: state, decided_outcome: outcome ?? "(nothing decided this turn — free roleplay)" }, { best: {
      type: "choice",
      instructions: "Which draft narrates the decided outcome most faithfully (every decided result, nothing that contradicts the game state), keeps characters in voice, and reads best?",
      criteria: Object.fromEntries(drafts.map((d, i) => [`d${i}`, clip3(d, 2500)]))
    } });
    const a = ans.best;
    if (a?.type !== "choice")
      return 0;
    const i = Number(a.choice.slice(1));
    return Number.isInteger(i) && i > 0 && (a.probabilities[a.choice] ?? 0) >= (a.probabilities.d0 ?? 0) + 0.15 ? i : 0;
  } catch (e) {
    logError("judge drafts", e);
    return 0;
  }
}
function momentKey(msgs, state) {
  const last = msgs[msgs.length - 1];
  const s = JSON.stringify(state);
  let h = 2166136261;
  for (let i = 0;i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return `${last?.id ?? ""}:${last?.swipe_id ?? 0}:${(h >>> 0).toString(36)}`;
}
function readyChoices(chatId, key) {
  const c = cache3.get(chatId);
  return c?.key === key ? new Set(c.replies.keys()) : new Set;
}
function takePrewritten(chatId, key, actionId) {
  const c = cache3.get(chatId);
  if (!c || c.key !== key)
    return null;
  const hit = c.replies.get(actionId) ?? null;
  if (hit)
    cache3.delete(chatId);
  return hit;
}
function dropPrewritten(chatId) {
  cache3.delete(chatId);
}
async function prewrite(opts) {
  const { chatId, userId, r, settings, decider } = opts;
  if (settings.prewrite <= 0)
    return;
  const msgs = await getMessages(chatId);
  const { state } = foldPath(r, msgs);
  if (state.encounter && !r.encounters[state.encounter.id]?.narrate)
    return;
  const key = momentKey(msgs, state);
  const choices = buildChoices(r, state, { ...settings, live: liveChoicesOf(msgs[msgs.length - 1]) }).filter((c) => writable(c.id) && !c.params.length).slice(0, settings.prewrite);
  const replies = new Map;
  cache3.set(chatId, { key, replies });
  await Promise.allSettled(choices.map(async (c) => {
    const ci = intentFor(r, state, settings, msgs, c.id);
    if ("error" in ci)
      return;
    const seed = randomSeed();
    let res = resolveTurnFull(r, state, ci.intent, { seed, veils: settings.veils, playerText: ci.say });
    if (res.needs.length && decider.id !== "rules") {
      const o = await odds2({ decider, r, s: state, specs: res.needs, playerText: ci.say, sceneText: opts.reply, player: opts.player, timeoutMs: 20000 });
      if (Object.keys(o).length)
        res = resolveTurnFull(r, state, ci.intent, { seed, veils: settings.veils, odds: o, playerText: ci.say });
    }
    const rec = res.record;
    if (rec.discover)
      return;
    const after = cloneState(state);
    for (const e of rec.events)
      applyEvent(after, e, r);
    const prompt = nextPrompt(opts.prompt, opts.reply, ci.say, buildInjection(r, rec, state, after, opts.player));
    const text = await writeReply(prompt, userId);
    if (!text || cache3.get(chatId)?.replies !== replies)
      return;
    replies.set(c.id, { say: ci.say, intent: ci.intent, rec, text, prompt, outcome: outcomePacket(r, rec, state, after, opts.player), after });
    opts.onReady();
  }));
}
var clip3 = (s, n) => s.length > n ? `${s.slice(0, n)}…` : s, cache3, writable = (id) => !id.startsWith("item:") && !id.startsWith("ability:") && !id.startsWith("dungeon:") && id !== "date:open" && !(id.startsWith("run:") && id !== "run:epilogue");
var init_drafts = __esm(() => {
  init_dice();
  init_resolve();
  init_state();
  init_view();
  init_decisions();
  init_inject();
  init_intents();
  init_ledger();
  cache3 = new Map;
});

// src/backend/live.ts
function clip4(s, n) {
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
  const ans = await decider.ask({ game_state: stateDigest(r, s), narrator_reply: clip4(reply, 4000) }, {
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
  const user = ["Current state:", stateDigest(r, s), "", "Narrator's latest reply:", clip4(opts.reply, 4000)].join(`
`);
  try {
    const out = firstJson2(await ask(system, user, settings, opts.userId, 25000, { temperature: 0.8 }));
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

// src/backend/discover.ts
async function inventPlace(r, s, card, settings, userId, timeoutMs = 12000) {
  const from = s.location ? r.locations[s.location] : undefined;
  const places = Object.values(r.locations).map((l) => l.name).join(", ");
  const system = [
    "You add one new place to the map of a roleplay game. Reply with JSON only:",
    '{"name": "Short place name", "desc": "One or two vivid sentences about what it is and what you might find there.", "indoors": true|false}',
    "It must fit the setting and tone, be reachable from where the player is exploring, and not duplicate an existing place.",
    r.discovery.guide ? `Guidance: ${r.discovery.guide}` : ""
  ].filter(Boolean).join(`
`);
  const user = [
    card ? `The card:
${card}` : "",
    `Existing places: ${places || "(none)"}`,
    `The player is exploring around: ${from?.name ?? s.locationName ?? "here"}${from?.desc ? ` — ${from.desc}` : ""}`
  ].filter(Boolean).join(`

`);
  try {
    const out = firstJson2(await ask(system, user, settings, userId, timeoutMs, { temperature: 0.9 }));
    const name = typeof out?.name === "string" ? out.name.trim().slice(0, 60) : "";
    if (!name)
      return null;
    let id = slug(name);
    for (let n = 2;r.locations[id]; n++)
      id = `${slug(name)}_${n}`;
    return { id, name, desc: typeof out?.desc === "string" ? out.desc.trim().slice(0, 400) : "", indoors: out?.indoors === true };
  } catch (e) {
    logError("invent place", e);
    return null;
  }
}
function placeYaml(from, p) {
  return yaml.dump({ locations: { [from]: { exits: [p.id] }, [p.id]: { name: p.name, desc: p.desc, indoors: p.indoors, exits: [from] } } }, { lineWidth: 120 });
}
async function discoverPlace(loaded, r, before, rec, chatId, settings, userId) {
  if (!rec.discover)
    return;
  const card = await characterBrief(chatId, userId).catch(() => "");
  const p = await inventPlace(r, before, card, settings, userId);
  if (!p) {
    rec.hints.push("{{user}} explores but finds nothing new this time.");
    return;
  }
  const book = loaded.bookIds[0];
  if (book) {
    try {
      await host().world_books.entries.create(book, {
        comment: `warp-ruleset · discovered · ${p.name}`,
        content: placeYaml(rec.discover.from, p),
        key: [],
        disabled: true,
        constant: false,
        order_value: 900
      }, userId);
      invalidateCharacter(loaded.characterId);
    } catch (e) {
      logError("save discovered place", e);
    }
  }
  rec.events.push({ t: "move", to: p.id, name: p.name, src: "action", why: "Exploring found somewhere new" }, { t: "discovered", id: p.id, src: "action" }, { t: "news", text: `Discovered ${p.name}.`, src: "action" });
  rec.hints.push(`{{user}} discovers somewhere new: ${p.name}${p.indoors ? " (indoors)" : ""} — ${p.desc} Describe finding it and arriving for the first time.`);
}
var init_discover = __esm(() => {
  init_js_yaml();
  init_ruleset();
  init_helpers();
  init_source();
});

// src/backend/encounter-lines.ts
function storyPov(story, player) {
  const you = (story.match(/\byou(r|rs|rself)?\b/gi) ?? []).length;
  const first = player.trim().split(/\s+/)[0];
  const named = first ? (story.match(new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g")) ?? []).length : 0;
  return named > you ? "third" : "second";
}
function third(verb) {
  if (/(s|sh|ch|x|z|o)$/i.test(verb))
    return `${verb}es`;
  if (/[^aeiou]y$/i.test(verb))
    return `${verb.slice(0, -1)}ies`;
  return `${verb}s`;
}
function retell(text, pov, player) {
  let t = text.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (pov === "second") {
    t = t.replace(/\bI am\b/g, "you are").replace(/\bI'm\b/g, "you're").replace(/\bI've\b/g, "you've").replace(/\bI'll\b/g, "you'll").replace(/\bI'd\b/g, "you'd").replace(/\bmyself\b/gi, "yourself").replace(/\bmine\b/gi, "yours").replace(/\bmy\b/gi, "your").replace(/\bme\b/g, "you").replace(/\bI\b/g, "you");
  } else {
    if (/\bI \w+/.test(t)) {
      t = t.replace(/\b(and|then|or) ([a-z]+)\b/g, (m, j, v) => NOT_VERBS.has(v) || /(ly|ed|ing|s)$/.test(v) ? m : `${j} ${third(v)}`);
    }
    t = t.replace(/\bI am\b/g, `${player} is`).replace(/\bI'm\b/g, `${player}'s`).replace(/\bI've\b/g, `${player} has`).replace(/\bI'll\b/g, `${player} will`).replace(/\bI'd\b/g, `${player} would`).replace(/\bmyself\b/gi, "themself").replace(/\bmine\b/gi, `${player}'s`).replace(/\bmy\b/gi, "their").replace(/\bme\b/g, "them").replace(/\bI (\w+)/g, (_m, v) => `${player} ${MODALS.has(v.toLowerCase()) || /s$/.test(v) ? v : third(v)}`).replace(/\bI\b/g, player);
  }
  return cap2(t);
}
function told(text, pov, player) {
  const who = pov === "second" ? "you" : player;
  const poss = pov === "second" ? "your" : `${player}'s`;
  return cap2(text.replace(/\{\{user\}\}'s/gi, poss).replace(/\{\{user\}\}/gi, who).replace(/\byou is\b/g, "you are").replace(/\byou has\b/g, "you have").replace(/\byou looks\b/g, "you look").replace(/\byou gets\b/g, "you get"));
}
function authoredHint(a, rec) {
  if (!a)
    return null;
  if (!rec.check)
    return a.effects.hint ?? null;
  const key = TIER_FALLBACK[rec.check.tier].find((t) => a.outcomes[t]);
  return key && a.outcomes[key]?.hint || null;
}
function scriptedRound(o) {
  const rng = seededRng(`${o.seed}:round`);
  const pov = storyPov(o.story, o.player);
  const subject = pov === "second" ? "You" : o.player;
  const used = o.earlier.join(" ");
  const parts = [];
  let move;
  if (o.typed && o.typed.length <= 220)
    move = retell(o.typed, pov, o.player);
  else if (o.action?.say)
    move = retell(o.action.say, pov, o.player);
  else if (o.action)
    move = `${subject} ${pov === "second" ? "try" : "tries"} to ${lc(o.action.label)}`;
  else
    move = `${subject} ${pov === "second" ? "hold" : "holds"} back, looking for an opening`;
  move = stop(move);
  if (used.includes(move))
    move = `${pick3(AGAIN, rng)} ${lc(move)}`;
  parts.push(move);
  const hint = authoredHint(o.action, o.rec);
  const outcome = hint ? stop(told(hint, pov, o.player)) : o.card.check ? pick3(TIER_PLAIN[o.rec.check.tier], rng) : "";
  if (outcome)
    parts.push(used.includes(outcome) && o.card.check ? pick3(TIER_PLAIN[o.rec.check.tier].filter((x) => !used.includes(x)).concat(TIER_PLAIN[o.rec.check.tier]), rng) : outcome);
  if (o.card.foe)
    parts.push(stop(`${foeName(o.r, o.before)} ${lc(told(o.card.foe, pov, o.player))}`));
  return parts.join(" ");
}
function facts(o, pov) {
  const c = o.card;
  const lines = [
    `Point of view: ${pov === "second" ? `second person ("you" is ${o.player})` : `third person (${o.player})`}`,
    `${o.player}'s move: ${c.move}${o.typed ? ` — in their words: "${o.typed.replace(/\*/g, "").slice(0, 400)}"` : o.action?.say ? ` — "${o.action.say.replace(/\*/g, "")}"` : ""}`,
    c.check ? `How it turned out: ${c.check.tier}${c.check.gear.length ? ` (helped by ${c.check.gear.join(", ")})` : ""}` : "",
    authoredHint(o.action, o.rec) ? `The ruleset's note on this outcome: ${told(authoredHint(o.action, o.rec), pov, o.player)}` : "",
    c.foe ? `${foeName(o.r, o.before)}'s move: ${c.foe.replace(/\{\{user\}\}/gi, o.player)}` : "",
    c.changes.length ? `What shifted (show it, don't state numbers): ${c.changes.map((x) => `${x.label} ${x.to > x.from ? "up" : "down"}`).join(", ")}` : "",
    c.ended ? `It ENDED this round: ${c.ended.label}.` : "It is NOT over yet."
  ];
  return lines.filter(Boolean).join(`
`);
}
async function modelRound(o, settings, userId) {
  const pov = storyPov(o.story, o.player);
  const enc = o.before.encounter ? o.r.encounters[o.before.encounter.id] : undefined;
  const user = [
    o.story ? `The story so far (excerpt):
${o.story.slice(-1800)}` : "",
    enc ? `The encounter: ${enc.name}${enc.desc ? ` — ${enc.desc.replace(/\{\{user\}\}/gi, o.player)}` : ""}` : "",
    `The other side: ${foeName(o.r, o.before)}${o.foeAbout ? `
${o.foeAbout.slice(0, 1500)}` : ""}`,
    o.earlier.length ? `Earlier rounds (don't repeat their wording):
${o.earlier.slice(-4).join(`

`)}` : "",
    `This round:
${facts(o, pov)}`
  ].filter(Boolean).join(`

`);
  try {
    const text = (await askProse(ROUND_SYSTEM, user, settings, userId, 20000, { temperature: 0.85 })).replace(/^(?:here'?s[^:]*:|round \d+:)\s*/i, "").trim();
    return text.length < 40 ? null : text;
  } catch (e) {
    logError("encounter round", e);
    return null;
  }
}
async function writeRound(o, settings, userId) {
  if (settings.sceneLines === "model") {
    const t = await modelRound(o, settings, userId);
    if (t)
      return t;
  }
  return scriptedRound(o);
}
function scriptedSummary(o) {
  const enc = o.r.encounters[o.encId];
  const pov = storyPov(o.story, o.player);
  const subject = pov === "second" ? "you" : o.player;
  const moved = [];
  for (const id of o.r.statOrder) {
    const a = o.start.stats[id], b = o.end.stats[id];
    const def = o.r.stats[id];
    if (a === undefined || b === undefined || def.kind === "hidden" || Math.abs(b - a) < 3)
      continue;
    moved.push(`${def.label.toLowerCase()} ${b > a ? "up" : "down"}`);
  }
  const n = o.rounds.length;
  const how = `${cap2(enc?.name ?? "The encounter")} with ${o.foe}: ${o.outcome.label.toLowerCase()}${n > 1 ? ` after ${n} rounds` : ""}.`;
  return `*${how}${moved.length ? ` It left ${subject} with ${moved.slice(0, 3).join(", ")}.` : ""}*`;
}
async function encounterSummary(o, settings, userId) {
  const fallback = scriptedSummary(o);
  if (settings.sceneLines !== "model")
    return fallback;
  const pov = storyPov(o.story, o.player);
  try {
    const text = (await askProse([
      "Sum up a finished encounter from a roleplay as ONE short paragraph the story keeps in place of the blow-by-blow.",
      "2–3 sentences, under 70 words, in the story's point of view and tense. Say how it ended and what it cost or gained, using only the facts given.",
      "No numbers, game terms or headings. Adults only in anything romantic. Reply with the paragraph only."
    ].join(`
`), [
      `Point of view: ${pov === "second" ? `second person ("you" is ${o.player})` : `third person (${o.player})`}`,
      `How it ended: ${o.outcome.label}${o.outcome.loss ? " (a defeat)" : ""}`,
      `The facts in short: ${fallback.replace(/\*/g, "")}`,
      `The rounds as they were told:
${o.rounds.slice(-8).join(`

`)}`
    ].join(`

`), settings, userId, 20000, { temperature: 0.6 })).trim();
    return text.length > 30 && text.length < 900 ? text : fallback;
  } catch {
    return fallback;
  }
}
var MODALS, NOT_VERBS, cap2 = (t) => t ? t.charAt(0).toUpperCase() + t.slice(1) : t, lc = (t) => t ? t.charAt(0).toLowerCase() + t.slice(1) : t, stop = (t) => /[.!?…"”]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`, pick3 = (xs, rng) => xs[Math.floor(rng() * xs.length) % xs.length], TIER_PLAIN, AGAIN, ROUND_SYSTEM;
var init_encounter_lines = __esm(() => {
  init_dice();
  init_resolve();
  init_state();
  init_helpers();
  MODALS = new Set(["can", "could", "will", "would", "shall", "should", "may", "might", "must", "am", "was", "have", "do", "did", "had", "just", "then", "quickly", "slowly", "carefully", "really", "try"]);
  NOT_VERBS = new Set(["the", "a", "an", "my", "me", "i", "you", "your", "their", "them", "they", "it", "its", "his", "her", "he", "she", "we", "us", "our", "this", "that", "these", "those", "then", "still", "also", "just", "not", "never", "so", "too", "very", "now", "again", "back", "away", "out", "up", "down", "off", "in", "on", "at", "to", "with", "without", "for", "from", "into", "onto", "over", "under", "one", "two", "some", "all", "every", "each", "no", "more", "less", "hard", "fast", "low", "high"]);
  TIER_PLAIN = {
    crit_success: ["It works better than it had any right to.", "It lands perfectly.", "That couldn't have gone better."],
    success: ["It works.", "It lands.", "That does it — for now.", "It gets through."],
    partial: ["It half works.", "It helps, a little.", "It lands, but not cleanly."],
    fail: ["It doesn't work.", "Nothing comes of it.", "It falls flat.", "It gets nowhere."],
    crit_fail: ["It goes badly wrong.", "That backfires.", "It couldn't have gone worse."]
  };
  AGAIN = ["Again,", "Once more,", "Not giving up,", "One more try:"];
  ROUND_SYSTEM = [
    "You write one round of a tense encounter inside an ongoing roleplay, as a short passage the story keeps.",
    "The game's rules already decided everything in this round. Narrate exactly that: the player's move, how it turned out, and the other side's move, in that order.",
    "Never add outcomes, injuries, items or endings the facts don't state. Never end the encounter unless the facts say it ended.",
    "Match the story's point of view, tense and voice, shown in the excerpt. 2–4 sentences, under 80 words. No headings, lists, game terms or numbers.",
    "A repeated move is a fresh attempt: show how this one differs. Don't reuse phrasing from earlier rounds.",
    "Never speak, think or decide for the player beyond the move they made. Dialogue from the other side is welcome, quoted inline.",
    "Anything romantic or sexual involves adults only.",
    "Reply with the passage only."
  ].join(`
`);
});

// src/backend/encounter.ts
function isQuiet(r, s) {
  return !!s.encounter && !!r.encounters[s.encounter.id] && !r.encounters[s.encounter.id].narrate;
}
function logMessage(msgs, s) {
  const m = msgs[msgs.length - 1];
  const log = m && !m.is_user ? warpMeta(m).encounter : undefined;
  return m && log && log.status === "on" && log.enc === s.encounter?.id ? { m, log } : null;
}
function storyBefore(msgs) {
  const out = [];
  for (const m of [...msgs].reverse()) {
    if (m.is_user || warpMeta(m).encounter)
      continue;
    out.unshift(m.content);
    if (out.join(`
`).length > 1800 || out.length >= 2)
      break;
  }
  return out.join(`

`).slice(-1800);
}
async function playerNameOf(chatId, userId) {
  await Promise.resolve().then(() => init_turn());
  return playerName(chatId, userId).catch(() => "You");
}
async function playRound(opts) {
  const { chatId, userId } = opts;
  const loaded = await getRuleset(chatId, userId);
  const r = loaded?.ruleset;
  if (!r)
    return false;
  const msgs = await getMessages(chatId);
  const { state: before } = foldPath(r, msgs);
  if (!isQuiet(r, before))
    return false;
  if (busyChats.has(chatId)) {
    toast("info", "One moment — the last round is still being written.", userId);
    return true;
  }
  busyChats.add(chatId);
  send({ type: "busy", chatId, busy: true, label: "The round plays out…" }, userId);
  try {
    const settings = await getSettings(userId);
    const decider = await getDecider(settings, userId);
    const player = await playerNameOf(chatId, userId);
    const story = storyBefore(msgs);
    const typed = opts.typed?.trim() || null;
    let intent = opts.intent;
    if (!intent && typed && decider.id !== "rules") {
      const reading = await readTurn({ decider, r, s: before, settings, playerText: typed, sceneText: story, player, timeoutMs: 15000 });
      const read = reading.intent ?? reading.suggestion;
      intent = read ? { actionId: read.actionId, via: "adjudicator", ...read.params ? { params: read.params } : {} } : null;
    }
    const found = intent ? findAction(r, before, intent.actionId) : null;
    const chance = found?.a.check ? odds(r, before, found.a, intent?.params, found.target)?.success ?? null : null;
    const seed = randomSeed();
    const playerText = typed ?? found?.a.say ?? "";
    let res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, playerText });
    if (res.needs.length && decider.id !== "rules") {
      const o = await odds2({ decider, r, s: before, specs: res.needs, playerText, sceneText: story, player, timeoutMs: 15000 });
      if (Object.keys(o).length)
        res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, odds: o, playerText });
    }
    const rec = res.record;
    if (!rec.events.length && !rec.action) {
      toast("warning", "That isn't possible right now.", userId);
      return true;
    }
    const after = cloneState(before);
    for (const e of rec.events)
      applyEvent(after, e, r);
    const held = logMessage(msgs, before);
    const told = await tellRound({ chatId, userId, r, before, after, rec, action: found?.a ?? null, chance, msgs, player, settings, typed, prev: held?.log ?? latestLog(msgs, before)?.log ?? null, same: !!held });
    const { log, content } = told;
    const prev = held ? activeRecord(held.m) : null;
    const merged = {
      v: 1,
      ...rec.action ? { action: rec.action } : prev?.action ? { action: prev.action } : {},
      ...rec.check ? { check: rec.check } : {},
      hints: [],
      events: [...prev?.events ?? [], ...rec.events],
      ...prev?.decisions || rec.decisions ? { decisions: [...prev?.decisions ?? [], ...rec.decisions ?? []] } : {},
      at: Date.now()
    };
    if (log.status === "ended")
      await foldEarlier(chatId, msgs, log.enc, held?.m.id ?? null);
    if (held) {
      const meta = { ...held.m.metadata ?? {} };
      const w = { ...warpMeta(held.m), encounter: log, swipes: { ...warpMeta(held.m).swipes ?? {}, [String(held.m.swipe_id ?? 0)]: merged } };
      meta.warp = w;
      await host().chat.updateMessage(chatId, held.m.id, { content, metadata: meta });
    } else {
      await host().chat.appendMessage(chatId, { role: "assistant", content, metadata: { warp: { encounter: log, swipes: { "0": merged } } } });
    }
    return true;
  } catch (e) {
    logError("encounter round", e);
    toast("warning", "That round didn't go through — try again.", userId);
    return true;
  } finally {
    busyChats.delete(chatId);
    send({ type: "busy", chatId, busy: false }, userId);
    await pushState(chatId, userId);
  }
}
function latestLog(msgs, s) {
  for (const m of [...msgs].reverse()) {
    const log = !m.is_user ? warpMeta(m).encounter : undefined;
    if (log?.status === "on" && log.enc === s.encounter?.id)
      return { m, log };
  }
  return null;
}
async function tellRound(o) {
  const { r, before, after, rec, player, settings } = o;
  const card = roundCard(r, rec, before, after, o.chance);
  const story = storyBefore(o.msgs);
  const earlier = o.prev?.rounds.map((x) => x.text) ?? [];
  const foe = foeName(r, before);
  const person = Object.values(before.people).some((p) => p.name.toLowerCase() === foe.toLowerCase());
  const foeAbout = person ? (await personProfile(o.chatId, foe, o.userId).catch(() => null))?.text ?? "" : "";
  const text = await writeRound({ r, before, after, rec, card, action: o.action, player, typed: o.typed, story, earlier, foeAbout, seed: rec.check?.seed ?? String(Date.now()) }, settings, o.userId);
  const from = o.same ? o.prev?.from ?? 0 : o.prev?.rounds.length ?? 0;
  const log = { enc: before.encounter.id, foe, status: "on", from, rounds: [...o.prev?.rounds ?? [], { text, card }] };
  let content = log.rounds.slice(from).map((x) => x.text).join(`

`);
  if (card.ended) {
    const logMsg = o.msgs.find((m) => warpMeta(m).encounter === o.prev) ?? null;
    const start = startOf(r, o.msgs, firstLogOf(o.msgs, log.enc) ?? logMsg, before);
    const enc = r.encounters[log.enc];
    const ended = { label: outcomeLabel(enc, card.ended.outcome), loss: isLoss(enc, card.ended.outcome) };
    const summary = await encounterSummary({ r, start, end: after, encId: log.enc, foe, outcome: ended, rounds: log.rounds.map((x) => x.text), player, story }, settings, o.userId);
    log.status = "ended";
    log.summary = summary;
    log.ended = ended;
    content = summary;
  }
  return { log, content };
}
function firstLogOf(msgs, enc) {
  let first = null;
  for (const m of [...msgs].reverse()) {
    const log = !m.is_user ? warpMeta(m).encounter : undefined;
    if (log?.enc === enc && log.status === "on")
      first = m;
    else if (first)
      break;
  }
  return first;
}
async function foldEarlier(chatId, msgs, enc, except) {
  for (const m of msgs) {
    const log = !m.is_user && m.id !== except ? warpMeta(m).encounter : undefined;
    if (!log || log.enc !== enc || log.status !== "on")
      continue;
    const meta = { ...m.metadata ?? {} };
    meta.warp = { ...warpMeta(m), encounter: { ...log, status: "ended", summary: "" } };
    await host().chat.updateMessage(chatId, m.id, { content: `*The struggle with ${log.foe} went on…*`, metadata: meta }).catch((e) => logError("fold encounter log", e));
  }
}
async function quietReply(o) {
  const found = o.rec.action ? findAction(o.r, o.before, o.rec.action.id) : null;
  const chance = found?.a.check ? odds(o.r, o.before, found.a, o.rec.action?.params, found.target)?.success ?? null : null;
  const lastUser = [...o.history].reverse().find((m) => m.is_user);
  const prev = latestLog(o.history, o.before)?.log ?? null;
  const { log, content } = await tellRound({ ...o, action: found?.a ?? null, chance, msgs: o.history, typed: lastUser?.content ?? null, prev, same: false });
  return { content, log, fold: () => foldEarlier(o.chatId, o.history, log.enc, null) };
}
function startOf(r, msgs, logMsg, fallback) {
  if (!logMsg)
    return fallback;
  const i = msgs.findIndex((m) => m.id === logMsg.id);
  return i > 0 ? foldPath(r, msgs.slice(0, i)).state : fallback;
}
function compactLog(m) {
  const log = warpMeta(m).encounter;
  if (!log || log.status !== "on")
    return null;
  const last = log.rounds[log.rounds.length - 1];
  return `[An encounter with ${log.foe} is under way — ${log.rounds.length} round${log.rounds.length === 1 ? "" : "s"} so far. Latest: ${last?.text.slice(0, 300) ?? ""}]`;
}
var init_encounter = __esm(() => {
  init_dice();
  init_encounter_view();
  init_resolve();
  init_state();
  init_decisions();
  init_deciders();
  init_encounter_lines();
  init_ledger();
  init_settings();
  init_source();
  init_state_push();
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
function textOf2(content) {
  if (typeof content === "string")
    return content;
  return content.map((p) => ("text" in p) && typeof p.text === "string" ? p.text : "").join("");
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
function fillHints(h, player) {
  return { v: 1, source: "warp", moods: h.moods, notes: h.notes.map((n) => fillNames(n, player)) };
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
      let encounter;
      let confidence;
      const sceneText = [...history].reverse().find((m) => !m.is_user)?.content ?? "";
      const budget = () => Math.min(20000, (typeof ctx.interceptorDeadlineAt === "number" ? ctx.interceptorDeadlineAt : Date.now() + 20000) - Date.now() - 2000);
      const decider = info.isDryRun ? null : await getDecider(settings, ctx.userId);
      if (decider) {
        const readText = !intent && !meta.judged && lastUser && settings.freeTextChecks ? lastUser.content : null;
        const reading = await readTurn({ decider, r, s: before, settings, playerText: readText, sceneText, player, timeoutMs: budget() });
        scene = reading.scene;
        encounter = reading.encounter;
        if (readText !== null && lastUser) {
          intent = reading.intent;
          confidence = reading.confidence;
          verdict = { messageId: lastUser.id, intent, suggestion: reading.suggestion };
        }
      }
      const seed = settings.swipesReroll ? randomSeed() : `${lastUser?.id ?? "start"}:${intent?.actionId ?? "none"}`;
      const playerText = lastUser?.content ?? "";
      let res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, scene, playerText, encounter });
      if (decider && res.needs.length) {
        const card = res.needs.some((n) => n.id.startsWith("date:pref:") || n.id.startsWith("date:adult:")) ? await characterBrief(ctx.chatId, ctx.userId) : undefined;
        const o = await odds2({ decider, r, s: before, specs: res.needs, playerText: lastUser?.content ?? "", sceneText, player, timeoutMs: budget(), card });
        if (Object.keys(o).length)
          res = resolveTurnFull(r, before, intent, { seed, veils: settings.veils, scene, odds: o, playerText, encounter });
      }
      rec = res.record;
      if (confidence !== undefined && rec.action)
        rec.confidence = confidence;
      if (rec.discover && !info.isDryRun && loaded)
        await discoverPlace(loaded, r, before, rec, ctx.chatId, settings, ctx.userId);
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
    const shrunk = messages.map((lm) => {
      const m = history.find((h) => !h.is_user && h.content === textOf2(lm.content) && warpMeta(h).encounter);
      const short = m ? compactLog(m) : null;
      return short ? { ...lm, content: short } : lm;
    });
    const text = buildInjection(r, rec, before, after, player);
    const { messages: out, index } = injectInto(shrunk, text);
    const waiting = pending.get(info.generationId ?? ctx.chatId);
    if (waiting && !info.isDryRun)
      waiting.prompt = out;
    if (waiting && rec && !info.isDryRun && ctx.generationType !== "continue" && isQuiet(r, before)) {
      const quiet = await quietReply({ chatId: ctx.chatId, userId: ctx.userId, r, before, after, rec, history, player, settings }).catch((e) => {
        logError("quiet round", e);
        return null;
      });
      if (quiet) {
        waiting.quiet = quiet;
        return { messages: out, breakdown: [{ messageIndex: index, name: "Warp game state" }], finalResponse: { content: quiet.content, fallbackMessageIndex: Math.max(0, out.length - 1) } };
      }
    }
    return { messages: out, breakdown: [{ messageIndex: index, name: "Warp game state" }] };
  } catch (e) {
    logError("interceptor", e);
    return messages;
  }
}
async function proposeChanges(decider, r, p, reply, settings, userId) {
  const applied = p.outcome ? fillNames(p.outcome, p.player) : null;
  if (decider.id === "llm")
    return extract(r, p.after, p.playerText, reply, settings, userId, undefined, applied);
  if (decider.id === "rules")
    return null;
  const { proposal, needsWriting } = await bookkeeping({ decider, r, s: p.after, playerText: p.playerText, reply, player: p.player, applied });
  if (needsWriting.size) {
    const named = await extract(r, p.after, p.playerText, reply, settings, userId, needsWriting, applied);
    if (named?.people)
      proposal.people = named.people;
    if (named?.items)
      proposal.items = { ...proposal.items ?? {}, ...named.items };
    if (named?.move && !proposal.move)
      proposal.move = named.move;
    if (named?.body)
      proposal.body = named.body;
    if (named?.feelings)
      proposal.feelings = { ...proposal.feelings ?? {}, ...named.feelings };
    if (named?.used)
      proposal.used = { ...proposal.used ?? {}, ...named.used };
  }
  return proposal;
}
async function afterReply(p, msg, content, userId) {
  const chatId = p.chatId;
  const settings = await getSettings(userId);
  const r = p.ruleset;
  let swipe = msg.swipe_id ?? 0;
  const decider = await getDecider(settings, userId);
  dropPrewritten(chatId);
  if (settings.drafts > 1 && p.prompt && decider.id !== "rules") {
    host().sendToFrontend({ type: "busy", chatId, busy: true, label: `Writing ${settings.drafts - 1} more draft${settings.drafts > 2 ? "s" : ""}…` }, userId);
    const extra = await writeDrafts(p.prompt, settings.drafts - 1, userId);
    if (extra.length) {
      const all = [content, ...extra];
      const pick = await judgeDrafts(decider, all, p.outcome ? fillNames(p.outcome, p.player) : null, fillNames(stateDigest(r, p.after), p.player));
      const swipes = [...msg.swipes?.length ? msg.swipes : [content], ...extra];
      const base = swipes.length - extra.length;
      const dates = [...msg.swipe_dates ?? [], ...extra.map(() => Math.floor(Date.now() / 1000))];
      await host().chat.updateMessage(chatId, msg.id, { swipes, swipe_dates: dates, ...pick > 0 ? { swipe_id: base + pick - 1 } : {} });
      for (let i = 0;i < extra.length; i++)
        await writeRecord(chatId, msg.id, base + i, p.rec);
      if (pick > 0) {
        swipe = base + pick - 1;
        content = all[pick];
      }
    }
  }
  const wantLive = r.liveChoices.enabled;
  if (settings.narratorUpdates || settings.consistencyCheck || wantLive) {
    host().sendToFrontend({ type: "busy", chatId, busy: true, label: "Updating state…" }, userId);
    const [proposal, contra, live] = await Promise.all([
      settings.narratorUpdates ? proposeChanges(decider, r, p, content, settings, userId) : Promise.resolve(null),
      settings.consistencyCheck && decider.id !== "rules" ? contradiction({ decider, r, s: p.after, reply: content, outcome: p.outcome }) : Promise.resolve(null),
      wantLive ? writeLiveChoices({ r, s: p.after, reply: content, player: p.player, settings, userId, decider }) : Promise.resolve([])
    ]);
    const rec = { ...p.rec };
    if (proposal) {
      const action = p.rec.action ? { id: p.rec.action.id, tags: actionTags(r, p.rec.action.id) } : undefined;
      const events = applyProposal(r, p.after, proposal, { text: `${p.playerText}
${content}`, action });
      if (events.length)
        rec.events = [...rec.events, ...events];
    }
    if (contra !== null)
      rec.contradiction = contra;
    if (rec.events !== p.rec.events || contra !== null)
      await writeRecord(chatId, msg.id, swipe, rec);
    if (live.length) {
      await patchWarpMeta(chatId, msg.id, (w) => ({ ...w, live: { ...w.live ?? {}, [String(swipe)]: live } }));
    }
  }
  if (settings.prewrite > 0 && p.prompt) {
    await pushState(chatId, userId);
    host().sendToFrontend({ type: "busy", chatId, busy: false }, userId);
    prewrite({ chatId, userId, r, settings, decider, prompt: p.prompt, reply: content, player: p.player, onReady: () => schedulePush(chatId, userId, 100) }).catch((e) => logError("pre-write", e));
  }
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
    if (p.quiet && (payload.content ?? msg.content).trim() === p.quiet.content.trim()) {
      await patchWarpMeta(payload.chatId, msg.id, (w) => ({ ...w, encounter: p.quiet.log }));
      if (p.quiet.log.status === "ended")
        await p.quiet.fold();
      await pushState(payload.chatId, userId);
      return;
    }
    if (payload.content)
      await afterReply(p, msg, payload.content, userId);
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
  init_inject();
  init_drafts();
  init_decisions();
  init_deciders();
  init_helpers();
  init_ledger();
  init_live();
  init_discover();
  init_settings();
  init_source();
  init_state_push();
  init_encounter();
  pending = new Map;
  playerNames = new Map;
  started = new Map;
});

// src/backend/scene.ts
function logFor(chatId, kind) {
  let l = logs.get(chatId);
  if (!l || l.kind !== kind) {
    l = { kind, seq: 0, lines: [], said: null, history: [], writing: false, image: null, imageBusy: false, start: null };
    logs.set(chatId, l);
  }
  return l;
}
function sceneViewFor(chatId, r, s) {
  const kind = s.dungeon ? "dungeon" : activeSession(r, s) ? "date" : null;
  const l = logs.get(chatId);
  if (!kind)
    return null;
  if (!l || l.kind !== kind)
    return { kind, seq: 0, lines: [], said: null, image: null, imageBusy: false, writing: false };
  return { kind, seq: l.seq, lines: l.lines, said: l.said, image: l.image, imageBusy: l.imageBusy, writing: l.writing };
}
async function playerNameOf2(chatId, userId) {
  await Promise.resolve().then(() => init_turn());
  return playerName(chatId, userId).catch(() => "You");
}
async function playScene(opts) {
  const { chatId, userId, kind } = opts;
  const loaded = await getRuleset(chatId, userId);
  const r = loaded?.ruleset;
  if (!r)
    return;
  const settings = await getSettings(userId);
  const msgs = await getMessages(chatId);
  const last = msgs[msgs.length - 1];
  if (!last) {
    toast("warning", "Send a message first — the game attaches to the latest message.", userId);
    return;
  }
  const log = logFor(chatId, kind);
  busyChats.add(chatId);
  log.writing = true;
  log.said = opts.said;
  send({ type: "busy", chatId, busy: true, label: kind === "date" ? "…" : "The dungeon stirs…" }, userId);
  try {
    const { state: before } = foldPath(r, msgs);
    if (!log.start)
      log.start = cloneState(before);
    const player = await playerNameOf2(chatId, userId);
    const seed = randomSeed();
    const playerText = opts.typed ?? opts.said ?? "";
    let res = resolveTurnFull(r, before, opts.intent, { seed, veils: settings.veils, playerText });
    const decider = await getDecider(settings, userId);
    const partner = activeSession(r, before) ?? null;
    let card = "";
    if (kind === "date" || opts.intent?.actionId.startsWith("date:talk@")) {
      const who = partner?.who ?? opts.intent?.actionId.split("@")[1] ?? null;
      if (who) {
        const name = personName(r, before, who);
        const prof = await personProfile(chatId, name, userId, r.people[who]?.desc ? `${name}: ${r.people[who].desc}` : undefined).catch(() => null);
        if (prof)
          card = [prof.text ? `About ${name}:
${prof.text}` : "", prof.scenario && prof.setting ? `The setting (the card is a scenario, not ${name}):
${prof.setting}` : ""].filter(Boolean).join(`

`);
      }
    }
    if (!card)
      card = await characterBrief(chatId, userId).catch(() => "");
    if (res.needs.length && decider.id !== "rules") {
      const recent = log.history.slice(-4).map((l) => `${l.speaker ?? ""}${l.speaker ? ": " : ""}${l.text}`).join(`
`);
      const o = await odds2({ decider, r, s: before, specs: res.needs, playerText, sceneText: recent, player, timeoutMs: 15000, card });
      if (Object.keys(o).length)
        res = resolveTurnFull(r, before, opts.intent, { seed, veils: settings.veils, odds: o, playerText });
    }
    const rec = res.record;
    const after = cloneState(before);
    for (const e of rec.events)
      applyEvent(after, e, r);
    const swipe = last.swipe_id ?? 0;
    const existing = warpMeta(last).swipes?.[String(swipe)];
    const merged = existing ? { ...existing, events: [...existing.events, ...rec.events] } : { v: 1, hints: [], events: rec.events, at: Date.now() };
    await writeRecord(chatId, last.id, swipe, merged);
    await pushState(chatId, userId);
    const sess = activeSession(r, after);
    if (kind === "date" && sess && settings.dateImages && !log.image && !log.imageBusy)
      dateImage(chatId, userId, r, after, sess.who, sess.venue ?? null, card, log);
    const lines = await writeLines({ kind, r, before, after, rec, player, said: opts.said, recent: log.history, card, seed }, settings, userId);
    log.lines = lines;
    log.history = [...log.history, ...opts.said ? [{ speaker: player, text: opts.said.replace(/\*/g, "") }] : [], ...lines].slice(-40);
    log.seq += 1;
    log.writing = false;
    const ended = kind === "date" ? !!activeSession(r, before) && !sess : !!before.dungeon && !after.dungeon || !!opts.runEnded;
    if (ended) {
      const start = log.start ?? before;
      const who = kind === "date" ? activeSession(r, before)?.who ?? null : null;
      const bsess = activeSession(r, before);
      const venue = bsess?.venue ? r.dating.venues[bsess.venue]?.name ?? null : null;
      const run = before.dungeon;
      const dungeon = opts.runEnded ?? (run ? { name: r.dungeons[run.id]?.name ?? "the dungeon", depth: run.depth, gold: run.gold } : null);
      const line = await summaryLine({ kind, r, start, end: after, lines: log.history, player, settings, userId, who, venue, dungeon });
      await host().chat.appendMessage(chatId, { role: "assistant", content: line });
      logs.delete(chatId);
    }
  } catch (e) {
    logError("scene", e);
    log.writing = false;
    toast("warning", "That didn't go through — try again.", userId);
  } finally {
    busyChats.delete(chatId);
    send({ type: "busy", chatId, busy: false }, userId);
    await pushState(chatId, userId);
  }
}
async function dateImage(chatId, userId, r, s, who, venueId, card, log) {
  const settings = await getSettings(userId);
  const characterId = await characterForChat(chatId, userId).catch(() => null);
  const place = venueId ?? s.location ?? "somewhere";
  const key = `${characterId ?? "chat"}:${who}:${place}`;
  let cache = {};
  try {
    cache = await host().userStorage.getJson(IMAGE_STORE, { fallback: {}, userId });
  } catch {}
  if (cache[key]) {
    log.image = cache[key];
    await pushState(chatId, userId);
    return;
  }
  if (inflight.has(key))
    return;
  inflight.add(key);
  log.imageBusy = true;
  await pushState(chatId, userId);
  try {
    const prompt = await imagePrompt(r, s, who, venueId, card, settings, userId);
    const res = await host().imageGen.generate({
      ...settings.imageConnectionId ? { connection_id: settings.imageConnectionId } : {},
      prompt,
      negativePrompt: "multiple people, crowd, text, watermark, signature, lowres, blurry, deformed, extra limbs, nsfw, nude",
      owner_chat_id: chatId,
      includeDataUrl: false,
      ...userId ? { userId } : {}
    });
    const url = res.imageUrl ?? (res.imageId ? `/api/v1/images/${res.imageId}` : null);
    if (url) {
      cache = { ...cache, [key]: url };
      await host().userStorage.setJson(IMAGE_STORE, cache, { userId });
      log.image = url;
    }
  } catch (e) {
    logError("date picture", e);
  } finally {
    inflight.delete(key);
    log.imageBusy = false;
    await pushState(chatId, userId);
  }
}
async function imagePrompt(r, s, who, venueId, card, settings, userId) {
  const name = personName(r, s, who);
  const venue = venueId ? r.dating.venues[venueId] : null;
  const loc = s.location ? r.locations[s.location] : undefined;
  const placeName = venue?.name ?? s.locationName ?? "a quiet place";
  const placeDesc = loc?.desc ?? "";
  const phase = r.clock.enabled ? formatClock(r, s.minutes).phase : "day";
  const fallback = `${name}, one person, centered, upper body, facing the viewer, gentle smile, fully clothed, ${placeName}, ${phase}, detailed background, visual novel style, soft lighting`;
  try {
    const text = await ask("Write ONE image-generation prompt as comma-separated tags for a visual-novel scene: exactly one adult character, centered in the frame, upper body, facing the viewer, fully clothed, with the place behind them as a detailed background. Take their appearance (hair, eyes, build, clothes) from what you're given. Tags only, no sentences, under 70 words.", [`Character: ${name}${r.people[who]?.desc ? ` — ${r.people[who].desc}` : ""}`, card ? `What's known about them (use only what describes ${name}):
${card.slice(0, 3000)}` : "", `Place: ${placeName}${placeDesc ? ` — ${placeDesc}` : ""}`, `Time of day: ${phase}`].filter(Boolean).join(`

`), settings, userId, 20000, { temperature: 0.4 });
    const tags = text.replace(/```[a-z]*|```/g, "").split(`
`).map((x) => x.trim()).find((x) => x.includes(",")) ?? "";
    return tags.length > 20 ? `${tags}, centered composition, visual novel style` : fallback;
  } catch {
    return fallback;
  }
}
var logs, IMAGE_STORE = "scene-images.json", inflight;
var init_scene = __esm(() => {
  init_dice();
  init_resolve();
  init_state();
  init_talk();
  init_decisions();
  init_deciders();
  init_helpers();
  init_ledger();
  init_settings();
  init_source();
  init_state_push();
  init_snippets();
  logs = new Map;
  inflight = new Set;
});

// src/engine/reference.ts
function partForIssue(where) {
  const w = where.replace(/^warp-ruleset\s*·\s*/i, "");
  const head = w.split(/[›,]/)[0].trim().toLowerCase();
  if (PART_LABELS.includes(head))
    return head;
  if (head.startsWith("stats") || head.startsWith("growth"))
    return "stats";
  if (["relationships", "people", "companions", "lineage"].some((k) => head.startsWith(k)))
    return "people";
  if (["locations", "items", "item uses", "wardrobe", "weather", "conditions", "flags", "body"].some((k) => head.startsWith(k)))
    return "world";
  if (["actions", "improvise", "obligations", "jobs"].some((k) => head.startsWith(k)))
    return "actions";
  if (head.startsWith("encounters") || head.startsWith("dungeons"))
    return "encounters";
  if (["codex", "feats", "perks", "abilities", "checkpoints", "endings"].some((k) => head.startsWith(k)))
    return "journal";
  if (head.startsWith("triggers") || head.startsWith("rules") || head.startsWith("mind"))
    return "rules";
  if (["secrets", "fronts", "random events", "live choices"].some((k) => head.startsWith(k)))
    return "story";
  if (head.startsWith("dating"))
    return "dating";
  return "core";
}
var PART_LABELS, PART_CONTENTS, REFERENCE = `WARP RULESET FORMAT (YAML). Numbers may be formulas in quotes. Meters are 0–100 unless there's a reason.

stats:            # kinds: meter (bar) | attribute | skill | money | hidden
  stress: { kind: meter, good: low, start: 0, per_hour: -0.5, narrator: 10, bands: { 0: You are calm., 30: You are stressed., 70: You are distressed. } }
  hp: { kind: meter, max: "20 + level * 8", bands: { 0%: Down., 40%: Wounded., 75%: Hale. } }   # bands in % of the current max, for stats whose max grows
  athletics: { kind: skill, max: 100, start: 10, grades: [F, D, C, B, A, S] }
  money: { kind: money, start: 50, narrator: 50 }
  # good: high|low|none (colours); per_hour: drift; narrator: max change the story may make per reply (0 = rules only); max may be a formula ("level * 5")
  # limit what the story may change (stats, relationship stats, flags, conditions): narrator_when: "not in_encounter",
  #   narrator_words: [panic, scared] (the exchange must mention one), narrator_actions: [fight, violence] (action ids or tags)
  # skills and attributes improve with use: every check that reads them (and practice the story describes) adds progress; growth: 0 on a stat stops it, growth: 2 doubles it
growth: { rate: 1, attributes: 0.5, train: true }   # optional; growth: false turns it off. Attributes move at half the skill rate by default

relationships:
  open: true                       # track new people the story introduces
  stats: { trust: { start: 10, narrator: 5, bands: { 0: Wary, 40: Trusting } } }
  people:
    jo:
      name: Jo
      desc: Runs the café.
      schedule:                    # first matching entry wins; entry without when = default; no match = not around
        - { when: "between(hour, 7, 18) and weekday != 'Sun'", at: high_street }

companions:       # people with lives of their own (ids from relationships.people)
  jo:
    goal: Buy the café outright              # shown on the sheet
    arc: { per_day: 2, stages: [ { at: 40, hint: "Jo's doing sums at closing time.", surface: "Jo makes an offer on the café." } ], story: { "{{user}} helps Jo at the café": 10 } }   # a hidden clock, same shape as a front; runs once met
    daily:                                   # a choice they make each in-game day; the decision model weighs it; arc/bond here mean Jo
      ask: How does Jo spend her evening?
      options: { shift: { desc: Works an extra shift, weight: 2, arc: +6 }, out: { desc: Goes drinking with Dex, weight: 1, bond: { dex: +5 } } }
    jealous_of: [dex]                        # or [anyone]: cools toward {{user}} (and the rival) when {{user}} grows close to them
    bonds: { dex: 30 }                       # how they feel about others, −100…100
    knows: [ward_accident]                   # secrets only they know: the narrator plays them with it, nobody else can mention it
EFFECTS for companions: arc: { jo: +5 }, bond: { jo: { dex: -10 } }. FUNCTIONS: arc(person), bond(a, b).

lineage:          # pregnancy and children; only ever between two people known to be adults (declare ages, or the decision model is asked)
  pregnancy: { weeks: 36, stages: [ { week: 6, text: "{carrier} has been sick in the mornings." }, { week: 16, text: "It's starting to show." } ] }   # hidden until the first stage
  children: { speed: 1, join_at: 18, inherit: [hair, eyes] }   # speed = how much faster than the calendar they age; they stay off-stage family until join_at (never below 18) and are never part of romance
EFFECT: conceive: { with: target, chance: 20, carrier: player }   # carrier: player | partner. FUNCTIONS: children(), age(person); names: pregnant, pregnancy_weeks.

name: Harbour Town                 # the game's name (shown on the HUD); description: one line about it
description: A fishing town where the tide brings secrets.
clock: { start: "Mon 07:00", date: "Sep 4", minutes_per_action: 15, narrator_max: 240 }
start: { location: home, items: { phone: 1 } }
hud: { currency: "$", bars: [health, stress] }
narration: { notes: "Guidance for the narrator." }
player: { age: 20 }

weather: { temps: { spring: 12, summer: 22, autumn: 11, winter: 3 } }     # enables weather + temperature
locations:
  home: { name: Home, desc: "...", indoors: true, exits: [street], travel: 10 }   # exits become travel buttons
locations_open: true             # the story may name places the ruleset doesn't list (on by default when there are none)
items:
  phone: Phone
  raincoat: { name: Raincoat, slot: outer, warmth: 5, reveal: 0, traits: [rainproof] }   # clothing = item with a slot
  pepper_spray:                    # an item that DOES something: use: is an action offered while it's held (in encounters too)
    name: Pepper Spray
    uses: 5                        # charges; each use spends one, the last spends the item (tags: [consumable] = 1 use)
    use: { label: Spray it, foe: { nerve: -6 }, hint: "{{user}} empties a burst into their face." }   # effects (or check/success/fail like any action); when:, why_not: "…" optional
  lucky_boots: { name: Lucky Boots, slot: feet, bonus: { athletics: 10 } }   # gear: added to every check that reads athletics while worn (carried, for non-clothing)
  house_keys: { name: Keys, keep: true, use: { label: Lock the door behind you, stress: -5, when: "at('home')" } }   # keep: true = using it doesn't spend it
item_uses: { phone: { label: Call a friend for a lift, check: { chance: 60 }, success: { move: home }, fail: { stress: +3 } } }   # uses/bonuses for items declared elsewhere (Warp writes drafted ones here)
wardrobe: { slots: [outer, top, bottom, under_top, under_bottom, feet], cover: [top, bottom], start: [t_shirt, jeans] }
conditions: { cold: { label: Cold, tone: bad }, hasted: { label: Hasted, tone: good, bonus: { evasion: 20 } } }   # bonus: a buff (or debuff, negative) counted in checks while it lasts
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

improvise:        # optional (on by default): typed attempts no action covers still roll — d20 + the closest ability's share of bonus vs a DC by difficulty
  dc: { easy: 8, fair: 12, hard: 16, extreme: 20 }
  bonus: 10                        # what a maxed-out ability adds
  partial: 3                       # missing by this much is a partial success
  stats: [athletics, charm]        # abilities an attempt may lean on (default: every skill and attribute)
  outcomes: { crit_fail: { stress: +5 } }   # optional effects by result; the story's own reading records the rest
  # improvise: false turns it off (then only listed actions roll)

EFFECTS (any success/fail/effects/cost/do block):
  stat shorthand (fatigue: +5, may be a quoted formula), set: { stress: 50 }, flags: { x: true }, give: item / take: item,
  rel: { jo: { trust: +3 } }, move: location, time: 30, add_condition: [cold] or { cold: 120 }, remove_condition: [cold],
  hint: "direction for the narrator", wear: [raincoat], undress: [top], damage: { top: 20 },
  start_encounter: id, foe: { hp: -6 }, end: outcome_id, unlock: [codex_id],
  harm: "6 + arcana / 5" (wears down the current encounter's main meter — HP, resolve, composure — so one ability works in any encounter),
  learn: [ability_id] (teaches an ability),
  decide: { ask: "How does Jo react?", options: { yes: { desc: "Agrees", weight: 2, rel: { jo: { trust: +2 } } }, no: { desc: "Refuses", weight: 1 } } }
  Formulas with commas MUST be quoted: money: "-min(money, 20)".

encounters:
  mugging:
    name: Mugging
    tags: [violence]
    foe: { name: Mugger, stats: { nerve: { start: 10, max: 10 } } }
    actions: { fight: { label: Fight back, check: { chance: "30 + athletics / 2" }, success: { foe: { nerve: -6 } }, fail: { pain: +10 } }, run: { label: Run, effects: { end: escaped } } }
    foe_moves: { grab: { desc: "Grabs you", weight: 2, pain: +8 }, threaten: { desc: "Threatens", weight: 1, stress: +6 } }
    end_when: { won: "foe.nerve <= 0", beaten: "pain >= 80" }   # simple comparisons let Warp show the goal and the danger to the player
    outcomes: { won: { hint: "They flee." }, escaped: { stress: +3 }, beaten: { money: "-min(money, 30)" } }
    labels: { won: "You see them off", escaped: "You got away", beaten: "Overpowered" }   # how each ending reads
    goal: "Break their nerve, or get away"        # optional; otherwise derived from end_when
    danger: "Pain at 80 and you're overpowered"   # optional; otherwise derived
    # narrate: true = every round goes to the narrator as a full reply (old style). Default: rounds are told briefly
    #   in one encounter message that grows, then replaced by a summary — far fewer tokens, no repetitive loops.
    # an action out of reach can say why: when: "has('bat')", why_not: "You'd need something to swing"
    # from_story: false = only actions/effects start it (by default the story can: a fight breaking out in the prose starts it, against whoever it's with)
    # momentum: { win: won, lose: beaten, swing: { crit_success: 40, success: 25, partial: 10, fail: -20, crit_fail: -35 } }
    #   a fight that swings (−100…+100): each check moves it, foe moves can too (effect momentum: -15), and only a full swing ends it;
    #   each round reaches the narrator as ordered beats (a long typed move is kept as written). Formula name: momentum.

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

body:             # the player character's body; the story may change it after a reply (narrator: false to stop that; open: false = only these parts)
  parts: { hair: { color: brown, length: shoulder-length }, eyes: { color: green }, ears: human, build: { height: average } }   # any parts, any traits
  hidden_by: { chest: [top, under_top] }       # wardrobe slots covering a part: others see it when any of them is empty
  transforms:
    feline_splice: { label: Feline splice, chance: 70, stages: [ { set: { ears: { type: cat } }, text: "Soft cat ears push up through {{user}}'s hair." }, { set: { tail: { type: cat } } } ] }
EFFECTS for the body: body: { hair: { color: red } } (null removes a trait), transform: { feline_splice: 1 } (advance stages; each rolls its chance).
FUNCTIONS: body('hair', 'color') ('' when absent), transformed('feline_splice') (stages so far).

discovery:        # exploring can turn up places the ruleset never had; each is written into the ruleset lorebook and stays on the map
  at: [docks, park]                # where (empty = anywhere); found places can be explored too
  chance: 25                       # percent per try (formula); each fruitless try adds 10
  max: 12
  guide: "Small, grounded places: a back-alley bar, a hidden garden."
observers:        # being seen: while \`when\` holds, each adult present reacts individually (the decision model reads them; children never take part)
  when: "exposed > 0"
  crowd: 2                         # anonymous passers-by when outdoors
  reactions: { interested: { rel: { target: { lust: +4 } } }, disapproving: { rel: { target: { trust: -3 } } } }   # unnoticed | glance | interested | disapproving | predatory
  rumours: true                    # witnesses tell people they're close to (bonds ≥ 25), once a day. FUNCTIONS seen_by(person), fame()
obligations:      # bills on the calendar: "Pay…" choices appear while something is owed; a missed one lets the creditor decide
  rent: { amount: 120, every: 7, first: 7, grace: 1, creditor: landlord, at: [apartment], late: { ask: "The rent is late. What does {creditor} do?", options: { warn: { desc: A warning, weight: 3 }, fee: { desc: A late fee, weight: 1, money: -25 } } } }
  # arrears pile up; FUNCTIONS owed(id), missed(id), days_until(id)
jobs:             # a shift of customers, each wanting a style; your pick (or your typed words, judged by the model) sets their mood and tip
  lunch_rush:
    label: Cover the lunch rush
    at: [high_street]
    customers: 3
    pay: 25                        # for the shift (formula); tip: per customer, scaled by how happy they are
    tip: 4
    skill: tending                 # helps every customer's mood
    gain: { tending: +1 }
    styles: { quick: Get their order out fast, friendly: Be warm and chatty }
    patrons: [ { who: "A nurse off a night shift", want: quick }, { who: "A lonely old man", want: friendly } ]

codex: { docks: { title: The Docks, category: Places, text: "...", unlock: "location == 'docks'", lore: [Lorebook entry title] } }
feats: { night_owl: { name: Night owl, desc: "...", unlock: "hour >= 2 and hour < 5", reward: { stress: -5 } } }
abilities:        # the player's OWN moves (spells, techniques, tricks): offered as choices in encounters and the story, typed or clicked
  haste:
    name: Haste
    desc: Quicken body and mind
    cost: { mana: -8 }               # can't be used without enough (the choice says "Needs 8 Mana")
    add_condition: { hasted: 3 }     # minutes — an encounter round is one minute; the condition's bonus: does the rest
    per_day: 2                       # and/or per_encounter: 1 (0 = unlimited)
  firebolt:
    name: Firebolt
    where: encounter                 # encounter | story | any (default)
    cost: { mana: -4 }
    check: { chance: "40 + arcana" } # scales with the stats its formulas read
    success: { harm: "6 + arcana / 5" }
    fail: { hint: "The bolt fizzles." }
    known: false                     # true (default unless a perk teaches it) | false (taught by a perk or learn:) | a formula ("arcana >= 40")

perks:
  points: perk_points               # the stat that pays for them; something must raise it (level-ups, feats, milestones)
  pick: 3                           # offer 3 to choose from when there's a point (one that builds on how they've played, one new direction, one random); 0/omitted = buy from the whole list
  sharp: { name: Sharpshooter, desc: "+2 Aim", cost: 1, requires: "level >= 2", effects: { aim: +2 } }   # effects: once, when taken
  crowd_ghost: { name: Crowd Ghost, bonus: { stealth: 10 }, edge: { stealth: 15, when: "at('plaza')" }, tags: [stealth] }   # bonus: always counts in checks; edge: only while when holds
  silver_tongue: { name: Silver Tongue, rule: { reroll: { stats: [persuasion], per_day: 1 } } }   # rules: reroll / soften (a failure becomes partial) on these stats or tags; gains / losses: { scent: -30% } (rises or drops that much bigger/smaller)
  mage_blood: { name: Mage Blood, abilities: [firebolt], narrator: "Sparks dance on {{user}}'s fingertips when angry.", excludes: [iron_will] }   # teaches abilities; narrator: what the story should show; excludes: can't have both
  adrenaline: { name: Adrenaline Junkie, edge: { athletics: 20, when: "stress >= 60" }, drawback: { desc: "Stress builds faster", gains: { stress: +10% } }, weight: 1 }

checkpoints:      # save slots in the journal; loading rewinds the game (the chat keeps its messages)
  slots: 3
  auto: day                        # autosave at the start of each in-game day (slot "auto")
  keep: [codex, feats, { stats: [insight] }, { flags: [knows_the_truth] }]   # what survives a rewind: codex, feats, perks, secrets, people, dating, deepest, stats/flags/items/rel lists
  loop: { when: "hour >= 23", to: auto, text: "Midnight. The day folds back on itself; only {{user}} remembers.", do: { stress: +5 } }   # a time loop
  hard: false                      # true = an ending is final (load or start over, never keep playing)
endings:          # when one holds, the story ends: the narrator writes an epilogue from what happened; then start over, load, or keep playing
  burned_out: { when: "trauma >= 100", title: Burned out, kind: bad, text: "{{user}} can't go on and leaves town on the night bus." }
  legacy: [codex, feats]           # carried into a new playthrough (default codex, feats, perks)
FUNCTIONS for runs: saved(slot); names: loops (rewinds so far), runs (playthrough number).

triggers:
  exhausted: { when: "fatigue >= 85", do: { add_condition: [exhausted], hint: "..." } }         # fires once when it becomes true
  drain: { when: "fatigue >= 85", repeat: true, do: { stress: +2 } }                           # every turn while true
  danger: { when_scene: "{{user}} is in immediate danger", do: { stress: +5 } }                # judged in plain language

mind:             # the character's mind can overrule the player (in the "rules" part)
  overrides:      # first one that holds and rolls under its chance wins; a \uD83E\uDDE0 chip says why
    freeze: { when: "control < 25", chance: "60 - control * 2", on: [violence], cause: Panic, text: "their body won't obey." }   # do: fail (default) = fails with no roll
    urge: { when: "lust >= 70", chance: 30, on: [talk], do: flirt, cause: Desire }      # do: <action id> = that happens instead
    nerves: { when: "control < 50", chance: 50, do: alter, cause: Nerves }               # do: alter = goes ahead, coloured by the cause; on: [] = any action with a check
  perception: [ { when: "awareness < 20", text: "{{user}} is naive: describe only what they understand." } ]   # filters the narration while true

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

DATING (the "dating" part):
dating:           # talk topic by topic (tastes stay hidden until learned), ask people out, go on outings. \`dating: true\` = all built-ins
  love: love                       # relationship stat used as love (created if missing); fear: fear likewise
  romance: true                    # false = friendship only. Romance is never offered with anyone under 18 or of unknown age
  stages: { stranger: 0, acquaintance: 10, friend: 30, close: 55, partner: { at: 80, partner: true } }   # love (0–100 of its range) per rung; partner only through a returned confession
  hostile: { at: 60, label: Hostile }        # fear (0–100) that turns someone hostile
  people:                          # authored tastes; otherwise the decision model reads them from the card (or they're seeded)
    jo: { loves: [food], likes: [music, tag:nature], dislikes: [gossip], hates: [tease] }   # topic ids, category ids, tag:<activity tag>, item:<item id>
  topics:                          # merged over the built-ins; false removes one. Built-ins: weather, their_day, local_news, gossip, hobbies, music, books_films, games, sport, food, travel, nature, fashion, work, family, dreams, past, worries, secrets, compliment_looks, compliment_mind, joke, tease, flirt, ideal_partner, love_life, the_two_of_you
    cooking: { label: Cooking, category: interests, stage: acquaintance, when: "at('kitchen')" }   # categories: small_talk, interests, personal, charm, romance
  venues:                          # outings; built-ins: cafe, park, cinema, dinner, arcade, bar (builtin_venues: false drops them)
    pier: { name: The pier, at: docks, cost: 10, activities: { fish: { label: Go fishing, tags: [nature, calm] }, sunset: { label: Watch the sunset together, tags: [romance], romantic: true } }, events: { gulls: { text: "Gulls steal the chips.", enjoy: -5 } } }
  with: "not flag('grounded')"     # who can be talked to (target = the person)
  pace: { minutes_per_topic: 5, fatigue_per_topic: 12, beats: 4, minutes_per_beat: 30 }
items: { flowers: { name: Flowers, tags: [gift] } }   # items tagged gift can be given during a conversation

FORMULA NAMES: stats, flags, hour, minute, day, weekday, month, date, season, weather, temperature, indoors, outside,
warmth, warmth_min, warmth_max, too_cold, too_hot, reveal, exposed, naked, in_encounter, round, foe.<stat>, target.<relstat>, location.
FUNCTIONS: has(item[, n]), count(item), flag(x), cond(x), at(loc), rel(person, stat), met(person), between(v, lo, hi), roll('2d6'),
wearing(item), worn(slot), trait(t), present(person), where(person), codex(id), feat(id), perk(id),
secret(id) (stages the narrator knows), front(id) (clock value), front_stage(id) (stages surfaced), happened(event),
deepest(dungeon) (deepest floor reached), in_dungeon, dungeon_depth,
stage(person) (relationship rung, −1 hostile), partner(person), dates(person), in_date, on_outing,
min, max, clamp, floor, ceil, round, abs.
Operators: + - * / % < <= > >= == != and or not, a ? b : c. Strings in single quotes.
`, DESIGN_GUIDE = `WARP DESIGN GUIDE — what makes a ruleset worth playing.
A ruleset is a game the player feels through the story. Every piece should either create a decision, apply pressure, or reward play.
Anything declared but connected to nothing is a broken promise: the player sees it and can't use it.

## the core loop
Name it before writing YAML: what the player does most days, what pushes back, what they're working toward.
Pressures (needs, money, threats, rivals) should pull against each other so choices cost something.

## stats
Every stat needs a SOURCE (what raises it), a SINK (what lowers it), and a CONSEQUENCE (a check, trigger, ending or encounter that reads it).
A meter nothing reads is decoration. Use per_hour drift for needs; narrator: lets the story nudge it within limits.
Skills grow when checks read them — so every skill should appear in at least two checks, in different places.
Mistake: ten meters that only the narrator touches. Fewer stats, each wired into play, beat many idle ones.

## items
Every item should DO something: a use: (an action with effects), a bonus: (gear that helps the checks that read a stat), a gift tag, or an action/encounter move that needs it (when: "has('x')").
Read the item's description and make it true mechanically: "neutralizes scent, lowering visibility" → use: { visibility: -25, remove_condition: [scented] }.
Consumables get uses: (charges); tools get keep: true. Give the player a way to GET each item that matters (start.items, shops via an action that costs money and gives it, loot, rewards).
Mistake: flavour items in the starting inventory that no option ever offers — the player will look for the button.

## encounters
An encounter is a small puzzle with a visible goal. Give it:
- a goal the player can read: end_when on a foe stat ("foe.resolve <= 0") the moves wear down, or goal: in words;
- two or three ROUTES with different stats and trade-offs (talk / trick / force), plus an ESCAPE (a move with end: escaped, at a cost);
- a danger: a player stat end_when that can actually be reached ("stress >= 80"), and foe_moves that push toward it, so waiting costs;
- items that matter in it (a use: that changes what its checks read, a bonus: on those checks, a move that needs an item);
- labels: for how each ending reads, and outcomes: with consequences (what it cost, what was won).
Rounds are told briefly by default; narrate: true only for set-pieces that deserve full prose every round.
Mistake: three moves that all lower the same stat by the same amount; a defeat threshold above the stat's max; no way out.

## abilities and perks
Abilities are the player's own moves — spells, techniques, tricks — not the place's. Give each a cost (mana, stamina, money), a limit (per_day / per_encounter) and a reason to use it now rather than a plain move: a buff (add_condition with a bonus:), harm: in a fight, a heal, a way out. Make power scale with a stat (check: "40 + arcana", harm: "6 + arcana / 5") so growth shows.
Perks change how the player plays, not just a number: an edge in a situation the card has (night, crowds, a weapon), a rule bent (reroll, soften), a stat that rises slower or faster, an ability taught, something true the narrator shows (narrator:). The best ones trade off (drawback:). Use pick: 3 so every point is a choice between directions, give perk_points a source, and use excludes: for exclusive paths.
Mistake: perks that are only "+2 stat" — that's a level-up, not a choice.

## conditions
A condition should change play: penalise a check (- 10 when cond('x')), open or close actions, feed an encounter, drive a trigger.
Each needs a cause (add_condition somewhere) and a cure (an item, rest, time, a place) or a duration.

## places
Every place needs a reason to go there: actions at: it, people scheduled there, a job, a shop, a dungeon entrance, a venue.
Connect them with exits so the map is walkable from the start.

## people
Give each tracked person a schedule (where they are by hour and day) so the player can find them, starting feelings that match the card, and — for companions — a goal and a daily choice so they live on their own.

## money
Money needs income (jobs, paid actions, loot) AND spending (shops, rent, bribes, fares). If either is missing it's just a number.

## dating
The built-in topics and outings are modern (films, games, a café, an arcade). For any other setting, rewrite them under dating: — topics: { books_films: { label: Tales and songs, say: "*I ask {{target}} which ballads they know.*" }, games: false } and venues: for outings that exist there (fairs, taverns, tea houses, orbital gardens). Give people tastes (loves/likes/dislikes/hates) so conversations reward learning who they are.

## flags and story machinery
Set a flag only if something reads it (an action's when, a trigger, a codex unlock, a secret's stage). Fronts, secrets and random events make the world move without the player — use them to put pressure on the core loop.

## checks
Odds should usually sit between 25% and 85% at the start and improve with skill; show the player what helps (skills, gear bonuses, conditions as penalties).
Partial outcomes and costs make failures interesting: a fail should change something, not just waste a turn.

## finishing
You're done when every piece connects: run the audit and either fix each gap or say why it's deliberate. Simulate each encounter — no route should be pointless, none should be a guaranteed win, and the escape should cost something.
`;
var init_reference = __esm(() => {
  PART_LABELS = ["core", "stats", "people", "world", "actions", "encounters", "journal", "rules", "story", "dating"];
  PART_CONTENTS = {
    core: "name, description, player, clock, start, hud, narration",
    stats: "stats, growth",
    people: "relationships (stats + people with schedules), companions, lineage",
    world: "weather, locations, items (incl. clothing, uses and gear bonuses), item_uses, wardrobe, body, conditions, flags, start.items",
    actions: "actions, improvise, obligations, jobs",
    encounters: "encounters, dungeons",
    journal: "codex, feats, perks, abilities, checkpoints, endings",
    rules: "triggers, mind",
    story: "secrets, fronts, random_events, live_choices",
    dating: "dating (tastes, topics, venues), plus gift items and actions to get them"
  };
});

// src/engine/simulate.ts
function simulateEncounter(r, id, opts = {}) {
  const enc = r.encounters[id];
  if (!enc)
    return null;
  const runs = opts.runs ?? 120, maxRounds = opts.maxRounds ?? 40;
  const begin = () => {
    const s = cloneState(opts.from ?? initialState(r));
    applyEvent(s, { t: "enc", id, foe: Object.fromEntries(enc.foe.stats.map((f) => [f.id, f.start])), ...enc.momentum ? { momentum: enc.momentum.start } : {}, src: "manual" }, r);
    return s;
  };
  const policies = [];
  const moves = (s) => [
    ...actionPool(r, s).order.filter((a) => !actionPool(r, s).defs[a].perPerson && isAvailable(r, s, actionPool(r, s).defs[a])),
    ...usableItems(r, s).filter((u) => !u.locked).map((u) => u.id)
  ];
  for (const a of enc.actionOrder)
    policies.push({ name: `always ${enc.actions[a].label}`, pick: (s) => moves(s).includes(a) ? a : moves(s)[0] ?? null });
  policies.push({ name: "a random mix", pick: (s, rng) => {
    const m = moves(s);
    return m.length ? m[Math.floor(rng() * m.length)] : null;
  } });
  const out = [];
  for (const pol of policies) {
    const outcomes = {};
    const lengths = [];
    let rounds = 0, still = 0, unfinished = 0;
    for (let i = 0;i < runs; i++) {
      let s = begin();
      let rng = mulberry(i + 1);
      let n = 0;
      while (s.encounter && n < maxRounds) {
        const pick = pol.pick(s, rng);
        const rec = resolveTurn(r, s, pick ? { actionId: pick, via: "choice" } : null, { seed: `sim:${pol.name}:${i}:${n}` });
        const next = cloneState(s);
        for (const e of rec.events)
          applyEvent(next, e, r);
        const moved = rec.events.some((e) => e.t === "foe" && (e.d ?? 0) !== 0 || e.t === "swing" || e.t === "enc" && e.id === null);
        if (!moved)
          still++;
        rounds++;
        n++;
        const end = rec.events.find((e) => e.t === "enc" && e.id === null);
        if (end)
          outcomes[end.outcome ?? "ended"] = (outcomes[end.outcome ?? "ended"] ?? 0) + 1;
        s = next;
        rng = mulberry(i * 7919 + n);
      }
      if (s.encounter)
        unfinished++;
      lengths.push(n);
    }
    out.push({ policy: pol.name, runs, outcomes, medianRounds: quantile(lengths, 0.5), p90Rounds: quantile(lengths, 0.9), stalled: rounds ? still / rounds : 0, unfinished });
  }
  const notes = [];
  for (const p of out) {
    const total = Object.values(p.outcomes).reduce((a, b) => a + b, 0) || 1;
    const best = Object.entries(p.outcomes).sort((a, b) => b[1] - a[1])[0];
    if (p.unfinished > p.runs * 0.1)
      notes.push(`"${p.policy}" often never ends (${p.unfinished}/${p.runs} runs hit ${maxRounds} rounds) — give it a way to finish.`);
    if (best && best[1] / total > 0.97 && p.policy !== "a random mix")
      notes.push(`"${p.policy}" almost always ends "${best[0]}" — a guaranteed result isn't a choice.`);
    if (p.stalled > 0.6)
      notes.push(`"${p.policy}" changes nothing in ${Math.round(p.stalled * 100)}% of rounds — failures should still move something.`);
    if (p.p90Rounds > 12)
      notes.push(`"${p.policy}" drags on (1 in 10 runs take ${p.p90Rounds}+ rounds).`);
  }
  return { id, name: enc.name, policies: out, notes };
}
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function describeSim(sim) {
  const lines = sim.policies.map((p) => {
    const total = Object.values(p.outcomes).reduce((a, b) => a + b, 0);
    const outs = Object.entries(p.outcomes).sort((a, b) => b[1] - a[1]).map(([o, n]) => `${o} ${Math.round(n / p.runs * 100)}%`).join(", ") || "never ends";
    return `- ${p.policy}: ${outs}${p.unfinished ? `, unfinished ${Math.round(p.unfinished / p.runs * 100)}%` : ""} · median ${p.medianRounds} rounds (p90 ${p.p90Rounds}) · ${Math.round(p.stalled * 100)}% of rounds change nothing${total ? "" : ""}`;
  });
  return [`${sim.name} — ${sim.policies[0]?.runs ?? 0} runs per strategy:`, ...lines, ...sim.notes.length ? ["Notes:", ...sim.notes.map((n) => `- ${n}`)] : []].join(`
`);
}
var quantile = (xs, q) => {
  if (!xs.length)
    return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
};
var init_simulate = __esm(() => {
  init_resolve();
  init_state();
});

// src/backend/builder-agent.ts
function evaluate2(parts) {
  const { ruleset, issues } = loadRuleset(parts.filter((p) => p.yaml.trim()).map((p, i) => ({ label: `warp-ruleset · ${p.label}`, content: p.yaml, order: i })));
  if (!ruleset)
    return { ruleset, issues, gaps: [], depth: 0 };
  const a = auditRuleset(ruleset);
  return { ruleset, issues, gaps: a.gaps, depth: a.depth };
}
function openGaps(s, gaps, strict) {
  const waived = s.waived ?? {};
  return gaps.filter((g) => !waived[g.id] && (strict || g.severity === "gap"));
}
function referenceFor(topic) {
  const t = topic.toLowerCase().replace(/s$/, "");
  const guide = DESIGN_GUIDE.split(/\n(?=## )/).filter((b) => b.toLowerCase().includes(t)).join(`
`);
  const blocks = REFERENCE.split(/\n(?=[a-z_]+:\s)/).filter((b) => b.toLowerCase().includes(t)).slice(0, 6).join(`
`);
  return [guide && `Design guidance:
${guide}`, blocks && `Format:
${blocks}`].filter(Boolean).join(`

`).slice(0, 7000) || `Nothing specific on "${topic}". Topics: items, encounters, stats, people, places, money, conditions, dating, dungeons, story, checks.`;
}
function issuesText(issues, label) {
  const mine = label ? issues.filter((i) => i.level === "error" || i.where.toLowerCase().includes(label)) : issues;
  const errors = mine.filter((i) => i.level === "error"), warns = mine.filter((i) => i.level !== "error");
  if (!errors.length && !warns.length)
    return "No problems.";
  return [...errors.map((i) => `ERROR ${i.where}: ${i.message}`), ...warns.slice(0, 15).map((i) => `warning ${i.where}: ${i.message}`)].join(`
`);
}
function previewText(r, location, hour) {
  const s = initialState(r);
  if (location && r.locations[location])
    s.location = location;
  if (typeof hour === "number" && hour >= 0 && hour < 24)
    s.minutes = Math.floor(s.minutes / 1440) * 1440 + Math.round(hour * 60);
  const h = buildHud(r, s);
  const choices = buildChoices(r, s, { lines: [], veils: [] });
  return [
    `At ${h.location?.name ?? "?"}${h.clock ? `, ${h.clock.day} ${h.clock.time}` : ""}.`,
    `Bars: ${h.bars.map((b) => `${b.label} ${b.display}`).join(", ") || "none"}`,
    h.conditions.length ? `Conditions: ${h.conditions.map((c) => c.label).join(", ")}` : "",
    `Inventory: ${h.items.map((i) => `${i.name}${i.use ? ` [use: ${i.use.label}${i.use.locked ? ` — locked: ${i.use.locked}` : ""}]` : ""}${i.bonus ? ` [${i.bonus}]` : ""}`).join(", ") || "empty"}`,
    `Choices: ${choices.map((c) => `${c.label}${c.odds !== null ? ` (${Math.round(c.odds * 100)}%)` : ""}${c.locked ? ` [locked: ${c.locked}]` : ""}`).join(" | ") || "none"}`
  ].filter(Boolean).join(`
`);
}
function runTool(s, name, args, strict) {
  const label = String(args.label ?? "");
  switch (name) {
    case "read_section": {
      const p = s.parts.find((x) => x.label === label);
      return { text: p ? `### ${label}
${p.yaml}` : `There's no "${label}" section yet. It may hold: ${PART_CONTENTS[label] ?? "?"}` };
    }
    case "write_section": {
      if (!PART_LABELS.includes(label))
        return { text: `Unknown section "${label}". Sections: ${PART_LABELS.join(", ")}` };
      const yaml = String(args.yaml ?? "").replace(/^```(?:ya?ml)?\s*\n?|```\s*$/g, "").trim();
      if (!yaml)
        return { text: "Empty YAML — nothing written." };
      const before = evaluate2(s.parts);
      const p = s.parts.find((x) => x.label === label);
      if (p) {
        p.yaml = `${yaml}
`;
        p.changed = true;
      } else
        s.parts.push({ label, yaml: `${yaml}
`, status: "ok", issues: [], changed: true });
      const after = evaluate2(s.parts);
      if (!after.ruleset)
        return { text: `Written, but the ruleset no longer loads:
${issuesText(after.issues)}` };
      const was = new Set(before.gaps.map((g) => g.id)), now = new Set(after.gaps.map((g) => g.id));
      const fixed = before.gaps.filter((g) => !now.has(g.id)).map((g) => g.id), added = after.gaps.filter((g) => !was.has(g.id));
      return { text: [`Wrote "${label}".`, `Checker: ${issuesText(after.issues, label)}`, `Audit: depth ${before.depth} → ${after.depth}.${fixed.length ? ` Fixed: ${fixed.join(", ")}.` : ""}${added.length ? `
New gaps:
${added.map(gapLine).join(`
`)}` : ""}`].join(`
`) };
    }
    case "check": {
      const e = evaluate2(s.parts);
      return { text: e.ruleset ? issuesText(e.issues) : `The ruleset doesn't load:
${issuesText(e.issues)}` };
    }
    case "audit": {
      const e = evaluate2(s.parts);
      if (!e.ruleset)
        return { text: "Fix the checker errors first; the ruleset doesn't load." };
      const open = openGaps(s, e.gaps, true);
      const links = auditRuleset(e.ruleset).links;
      return { text: [`Depth ${e.depth}/100. Open: ${open.filter((g) => g.severity === "gap").length} gaps, ${open.filter((g) => g.severity === "thin").length} thin spots${Object.keys(s.waived ?? {}).length ? `; waived: ${Object.keys(s.waived ?? {}).join(", ")}` : ""}.`, ...open.slice(0, 40).map(gapLine), links.length ? `Already connected: ${links.slice(0, 20).join("; ")}` : ""].filter(Boolean).join(`
`) };
    }
    case "read_reference":
      return { text: referenceFor(String(args.topic ?? "")) };
    case "preview": {
      const e = evaluate2(s.parts);
      return { text: e.ruleset ? previewText(e.ruleset, typeof args.location === "string" ? args.location : undefined, typeof args.hour === "number" ? args.hour : undefined) : "The ruleset doesn't load yet." };
    }
    case "simulate_encounter": {
      const e = evaluate2(s.parts);
      if (!e.ruleset)
        return { text: "The ruleset doesn't load yet." };
      const sim = simulateEncounter(e.ruleset, String(args.id ?? ""), { runs: 100 });
      return { text: sim ? describeSim(sim) : `No encounter "${String(args.id)}". Encounters: ${Object.keys(e.ruleset.encounters).join(", ") || "none"}` };
    }
    case "waive": {
      const id = String(args.id ?? ""), reason = String(args.reason ?? "").trim();
      if (!id || reason.length < 8)
        return { text: "A waiver needs the gap's id and a real reason." };
      s.waived = { ...s.waived ?? {}, [id]: reason.slice(0, 200) };
      return { text: `Waived ${id}: ${reason}` };
    }
    case "finish": {
      const e = evaluate2(s.parts);
      const errors = e.issues.filter((i) => i.level === "error");
      const open = e.ruleset ? openGaps(s, e.gaps, strict) : [];
      if (!e.ruleset || errors.length)
        return { text: `Not finished — the checker still reports errors:
${issuesText(e.issues)}` };
      if (open.length)
        return { text: `Not finished — ${open.length} audit gap${open.length === 1 ? "" : "s"} still open. Fix each, or waive it with a reason if it's deliberate:
${open.slice(0, 25).map(gapLine).join(`
`)}` };
      return { text: "Finished.", finished: String(args.summary ?? "").slice(0, 800) || "Done." };
    }
    default:
      return { text: `Unknown tool "${name}". Tools: ${TOOLS.map((t) => t.name).join(", ")}` };
  }
}
function textCalls(content) {
  const t = content.replace(/```(?:json)?/gi, "");
  const out = [];
  const tryParse = (j) => {
    try {
      const v = JSON.parse(j);
      for (const x of Array.isArray(v) ? v : [v]) {
        const o = x;
        const name = typeof o?.tool === "string" ? o.tool : typeof o?.name === "string" ? o.name : null;
        if (name)
          out.push({ name, args: o.args ?? o.arguments ?? {} });
      }
      return true;
    } catch {
      return false;
    }
  };
  const a = t.indexOf("["), b = t.lastIndexOf("]");
  if (a >= 0 && b > a && /"tool"|"name"/.test(t.slice(a, b)) && tryParse(t.slice(a, b + 1)))
    return out;
  const c = t.indexOf("{"), d = t.lastIndexOf("}");
  if (c >= 0 && d > c)
    tryParse(t.slice(c, d + 1));
  return out;
}
async function runAgent(s, opts) {
  const start = evaluate2(s.parts);
  const first = [
    opts.brief,
    `Your task: ${opts.task}`,
    `Sections now: ${s.parts.map((p) => `${p.label} (${p.yaml.length} chars)`).join(", ") || "none"}. Sections you can write: ${PART_LABELS.join(", ")}.`,
    start.ruleset ? `Checker: ${issuesText(start.issues)}` : `The ruleset doesn't load yet:
${issuesText(start.issues)}`,
    start.ruleset ? `Audit — depth ${start.depth}/100:
${openGaps(s, start.gaps, true).slice(0, 40).map(gapLine).join(`
`) || "no gaps"}` : "",
    `Done means: no checker errors, and every audit gap fixed or waived${opts.strict ? " (thin spots too)" : ""}. Then call finish.`
  ].filter(Boolean).join(`

`);
  const head = [{ role: "system", content: AGENT_SYSTEM }, { role: "user", content: first }];
  let tail = [];
  let idle = 0;
  for (let step = 1;step <= opts.maxSteps; step++) {
    const res = await opts.hooks.llm([...head, ...tail], TOOLS);
    const calls = res.calls.length ? res.calls : textCalls(res.content);
    if (!calls.length) {
      if (++idle >= 3)
        break;
      tail.push({ role: "assistant", content: res.content.slice(0, 2000) || "(no reply)" }, { role: "user", content: 'Use a tool (natively, or reply with JSON {"tool": …, "args": …}). If everything is done, call finish.' });
      continue;
    }
    idle = 0;
    const results = [];
    for (const c of calls.slice(0, 6)) {
      await opts.hooks.progress(PROGRESS[c.name]?.(c.args) ?? `${c.name}…`, describeCall(c.name, c.args));
      const out = runTool(s, c.name, c.args ?? {}, opts.strict);
      results.push(`[${describeCall(c.name, c.args)}]
${out.text}`);
      if (out.finished)
        return { finished: true, summary: out.finished, steps: step };
    }
    tail.push({ role: "assistant", content: `${res.content ? `${res.content.slice(0, 1500)}
` : ""}Called: ${calls.slice(0, 6).map((c) => describeCall(c.name, c.args)).join("; ")}` }, { role: "user", content: `Results:
${results.join(`

`).slice(0, 12000)}

(Step ${step} of ${opts.maxSteps}.)` });
    if (tail.length > 16)
      tail = tail.slice(-16);
  }
  return { finished: false, summary: "", steps: opts.maxSteps };
}
var TOOLS, AGENT_SYSTEM, gapLine = (g) => `- [${g.severity}] ${g.id}: ${g.text} → ${g.fix}`, describeCall = (name, args) => {
  if (name === "write_section")
    return `write_section(${String(args.label)}, ${String(args.yaml ?? "").length} chars)`;
  if (name === "waive")
    return `waive(${String(args.id)})`;
  return `${name}(${Object.entries(args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`.slice(0, 60)).join(", ")})`;
}, PROGRESS;
var init_builder_agent = __esm(() => {
  init_audit();
  init_loader();
  init_reference();
  init_simulate();
  init_state();
  init_view();
  TOOLS = [
    { name: "read_section", description: "Read one ruleset section's YAML.", parameters: { type: "object", properties: { label: { type: "string", enum: [...PART_LABELS] } }, required: ["label"] } },
    { name: "write_section", description: "Replace one section with new YAML (the whole section). Returns checker problems in it and how the audit changed.", parameters: { type: "object", properties: { label: { type: "string", enum: [...PART_LABELS] }, yaml: { type: "string" } }, required: ["label", "yaml"] } },
    { name: "check", description: "Run the format checker over the whole ruleset: errors and warnings.", parameters: { type: "object", properties: {} } },
    { name: "audit", description: "Run the depth audit: what doesn't connect to anything yet (items that do nothing, stats nothing reads, encounters with one route…), with a fix for each.", parameters: { type: "object", properties: {} } },
    { name: "read_reference", description: "Read the format reference and design guidance for one topic (e.g. items, encounters, stats, people, places, money, dating, dungeons, story).", parameters: { type: "object", properties: { topic: { type: "string" } }, required: ["topic"] } },
    { name: "preview", description: "What the player sees at the start (or at a place and hour): HUD bars, conditions and the choices offered.", parameters: { type: "object", properties: { location: { type: "string" }, hour: { type: "number" } } } },
    { name: "simulate_encounter", description: "Playtest an encounter by the rules: many seeds per strategy (always one move, random mix) → outcomes, length, rounds that change nothing, and notes.", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
    { name: "waive", description: "Leave an audit gap as it is, on purpose, with the reason (e.g. the phone is flavour). Use sparingly — a waived gap is a promise the player won't miss it.", parameters: { type: "object", properties: { id: { type: "string" }, reason: { type: "string" } }, required: ["id", "reason"] } },
    { name: "finish", description: "Done. Refused while there are checker errors or audit gaps not fixed or waived.", parameters: { type: "object", properties: { summary: { type: "string", description: "What you built or changed, for the player, in 2–4 sentences." } }, required: ["summary"] } }
  ];
  AGENT_SYSTEM = `You are the lead designer of a Warp ruleset: the YAML game engine that runs under a roleplay chat.
Your job is not to produce valid YAML quickly — it's to make a game worth playing, using what the engine can do.
Work with the tools: read sections, write whole sections, run check, run audit, simulate encounters, preview the start.
Every audit gap is something the player will notice; fix it, or waive it only when it is truly deliberate (with the reason).
Prefer connecting what exists over adding more: an item that changes what an encounter's checks read beats a new item nobody needs.
Keep the card's tone, names and setting. Refer to the player as {{user}}. Adults only in anything romantic or sexual.
Call tools one or a few at a time. If you can't call tools natively, reply with JSON only: {"tool": "<name>", "args": {...}} (or a list of them).
When nothing is left, call finish with a short summary.

${DESIGN_GUIDE}

${REFERENCE}`;
  PROGRESS = {
    read_section: (a) => `Reading ${String(a.label)}…`,
    write_section: (a) => `Rewriting ${String(a.label)}…`,
    check: () => "Checking the rules…",
    audit: () => "Auditing what connects…",
    read_reference: (a) => `Reading up on ${String(a.topic)}…`,
    preview: () => "Previewing the start…",
    simulate_encounter: (a) => `Simulating ${String(a.id)}…`,
    waive: (a) => `Leaving ${String(a.id)} as is…`,
    finish: () => "Wrapping up…"
  };
});

// src/engine/balance.ts
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
  Object.values(r.abilities).forEach((ab) => addAction(ab.action));
  for (const it of Object.values(r.items))
    if (it.use)
      addAction(it.use);
  return out;
}
function checkedActions(r) {
  return [
    ...Object.values(r.actions),
    ...Object.values(r.encounters).flatMap((e) => Object.values(e.actions)),
    ...Object.values(r.liveChoices.tags),
    ...Object.values(r.abilities).map((ab) => ab.action),
    ...Object.values(r.items).flatMap((it) => it.use ? [it.use] : [])
  ].filter((a) => a.check);
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
  const rolled = new Set(checkedActions(r).flatMap((a) => checkStats(r, a)));
  for (const e of effectsOf(r)) {
    Object.keys(e.stats).forEach((k) => touched.add(k));
    Object.keys(e.set).forEach((k) => touched.add(k));
  }
  for (const id of r.statOrder) {
    const d = r.stats[id];
    if (d.kind === "money" && d.narrator > 0)
      continue;
    const grows = (d.kind === "skill" || d.kind === "attribute") && r.growth.enabled && d.growth > 0 && rolled.has(id);
    if (!touched.has(id) && !d.perHour && d.narrator <= 0 && !grows) {
      out.push({ id: `dead:${id}`, part: "stats", text: `${d.label} never changes — no action, rule or story update touches it.`, fix: `Give the "${id}" stat a way to change: at least one action or rule that raises or lowers it, or allow the narrator to adjust it.` });
    }
  }
  for (const enc of Object.values(r.encounters)) {
    const sim = simulateEncounter2(r, start, enc.id, 120);
    if (!sim)
      continue;
    const goodEnds = [...new Set([...Object.keys(enc.outcomes), ...enc.endWhen.map((e) => e.outcome)])].filter((o) => !isLoss(enc, o) && !CONCESSION.test(o));
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
function simulateEncounter2(r, from, id, runs) {
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
var CONCESSION;
var init_balance = __esm(() => {
  init_dice();
  init_expr();
  init_state();
  init_resolve();
  init_encounter_view();
  init_freeform();
  CONCESSION = /paid|pay|robbed|bribe|surrender|gave_?in|submit|walked|walk_away|left|gave_up/i;
});

// src/backend/builder.ts
async function save(s, userId) {
  s.updatedAt = Date.now();
  sessions.set(key3(userId, s.characterId), s);
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
  const hit = sessions.get(key3(userId, characterId));
  if (hit)
    return hit;
  try {
    const stored = await host().userStorage.getJson(path(characterId), { fallback: null, userId });
    if (stored) {
      stored.busy = null;
      sessions.set(key3(userId, characterId), stored);
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
async function llmTools(s, messages, tools, userId) {
  const res = await host().generate.quiet({
    type: "quiet",
    messages,
    tools,
    connection_id: s.connectionId || undefined,
    parameters: { temperature: s.creative ? 0.7 : 0.4, max_tokens: 8000 },
    userId,
    signal: AbortSignal.timeout(240000)
  });
  if (typeof res === "string")
    return { content: res, calls: [] };
  return { content: res?.content ?? "", calls: (res?.tool_calls ?? []).map((c) => ({ name: c.name, args: c.args ?? {} })) };
}
async function logStep(s, label, line, userId) {
  if (line)
    s.log = [...s.log ?? [], line].slice(-60);
  s.busy = label;
  emit(s, userId);
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
async function personaText(chatId, userId) {
  try {
    const { text } = await host().macros.resolve("{{persona}}", { chatId, userId, commit: false });
    const t = (text ?? "").trim();
    return t && t !== "{{persona}}" ? t.length > 2500 ? `${t.slice(0, 2500)}…` : t : null;
  } catch {
    return null;
  }
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
    s.persona ? `The player's persona — who {{user}} is:
${s.persona}
Their own powers, training, signature moves and quirks belong to them, not the setting: make each an ability (cost, limit, a stat it scales with, what it does in a fight and outside one) and let perks build on them.` : "",
    s.analysis?.cast?.length ? `Main cast — add each to relationships.people with a start: block that matches how they feel about {{user}} at the beginning (use the relationship stats' scales; strong feelings mean strong numbers):
${s.analysis.cast.map((c) => `- ${c.name}: ${c.relation}`).join(`
`)}` : "",
    qa.length ? `The player's answers:
${qa.join(`
`)}` : "",
    adds.length ? `The player's own additions (build each in — the stat/item/place/etc., what changes it, and which actions check it):
${adds.join(`
`)}` : "",
    s.plan ? `The design plan (build to it; every connection it promises must exist in the rules):
${s.plan}` : "",
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
    venues: r.dating.enabled ? Object.keys(r.dating.venues).length : 0,
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
    updatedAt: Date.now(),
    effort: existing?.effort ?? "thorough",
    plan: null,
    log: [],
    waived: {},
    depth: null
  };
  if (mode === "refine" || mode === "deepen") {
    s.parts = await currentParts(characterId, userId);
    if (!s.parts.length)
      throw new Error(`This character has no ruleset to ${mode} yet.`);
    s.step = "review";
    buildPreview(s);
  }
  await save(s, userId);
  emit(s, userId);
}
async function designPlan(s, systems, userId) {
  const card = await cardText(s.characterId, userId);
  const text = await llm(s, `You are the lead designer of a game ruleset for a roleplay character card. Before anything is built, write the design plan.

${DESIGN_GUIDE}`, [
    card.text,
    brief(s),
    `Systems wanted: ${systems.join(", ")}.`,
    "Write the plan in plain text with these headings, short bullet points under each:",
    "LOOP — what {{user}} does most days, what pushes back, what they work toward.",
    "PRESSURES — the 3–6 stats/needs that matter, each with what raises it, what lowers it, and what happens at the extremes.",
    "CONNECTIONS — how systems feed each other (e.g. scent → visibility → encounters; the spray clears it; buns are bribes).",
    "ENCOUNTERS — each one: the goal, two or three routes with their stats, the escape and its cost, the danger, which items matter.",
    "ITEMS — every item and what it does (use, gear bonus, gift, or what needs it), and how the player gets it.",
    "PLACES & PEOPLE — why go to each place; where people are and when.",
    "Under 450 words. No YAML."
  ].join(`

`), userId, 1600);
  const t = text.trim();
  return t.length > 80 ? t.slice(0, 5000) : null;
}
async function deepen(s, task, userId) {
  const before = evaluate2(s.parts);
  const thorough = s.effort === "thorough";
  s.log = [...s.log ?? [], `— ${thorough ? "Thorough" : "Quick"} design pass —`];
  const card = await cardText(s.characterId, userId).catch(() => ({ text: "", name: s.characterName, hasRuleset: false }));
  try {
    const res = await runAgent(s, {
      brief: [card.text.slice(0, 5000), brief(s)].filter(Boolean).join(`

`),
      task,
      maxSteps: thorough ? 40 : 14,
      strict: thorough,
      hooks: {
        llm: (messages, tools) => llmTools(s, messages, tools, userId),
        progress: (label, line) => logStep(s, label, line, userId)
      }
    });
    if (res.finished) {
      s.changeSummary = res.summary;
      s.log = [...s.log ?? [], `Finished: ${res.summary}`];
    } else
      s.log = [...s.log ?? [], `Stopped after ${res.steps} steps with work left — "Keep deepening" carries on.`];
  } catch (e) {
    logError("builder agent", e);
    s.log = [...s.log ?? [], `The designer stopped: ${e instanceof Error ? e.message : String(e)}`];
  }
  await repair(s, s.parts, userId, false);
  const after = evaluate2(s.parts);
  s.depth = { before: before.depth, after: after.depth, open: openGaps(s, after.gaps, false).length };
}
async function builderDeepen(chatId, opts, userId) {
  const s = await sessionFor(chatId, userId);
  if (!s || !s.parts.length)
    throw new Error("Open the builder on a ruleset first.");
  if (opts.connectionId !== undefined)
    s.connectionId = opts.connectionId;
  if (opts.effort)
    s.effort = opts.effort;
  await progress(s, "Auditing what connects…", userId);
  try {
    await deepen(s, s.mode === "deepen" ? "Deepen this installed ruleset without breaking what works: close every audit gap — items that do nothing get a use: or bonus: true to their description, stats and conditions get sources, sinks and consequences, encounters get readable goals, more than one route, an escape and items that matter (simulate them), places get reasons to visit. Keep names, tone and existing ids." : "Keep going: close the remaining audit gaps and tune the encounters by simulation.", userId);
    for (const p of s.parts)
      if (p.changed)
        p.status = p.status ?? "ok";
    buildPreview(s);
  } catch (e) {
    s.error = `Couldn't deepen: ${e instanceof Error ? e.message : String(e)}`;
  }
  await progress(s, null, userId);
}
async function builderStart(chatId, opts, userId) {
  const s = await sessionFor(chatId, userId);
  if (!s)
    throw new Error("No builder open.");
  s.connectionId = opts.connectionId;
  s.creative = opts.creative;
  if (opts.effort)
    s.effort = opts.effort;
  await progress(s, "Reading the card…", userId);
  try {
    const card = await cardText(s.characterId, userId);
    s.persona = await personaText(chatId, userId);
    const templates = TEMPLATES.map((t) => `- ${t.id}: ${t.blurb}`).join(`
`);
    const system = `You help set up a game ruleset for a roleplay character card. Reply with JSON only.`;
    const user = `${card.text}${s.persona ? `

The player's persona (who {{user}} is):
${s.persona}` : ""}

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
      return systems.has("journal") || systems.has("perks") || systems.has("abilities");
    if (label === "story")
      return systems.has("story");
    if (label === "dating")
      return systems.has("dating");
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
    await progress(s, "Planning the game: the loop, the pressures, how it all connects…", userId);
    s.plan = await designPlan(s, [...systems], userId).catch((e) => {
      logError("builder plan", e);
      return null;
    });
    emit(s, userId);
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
    await deepen(s, "Finish this draft: fix every checker error and close the depth audit — make every item do what its description says, wire every stat and condition into play, give each encounter readable routes, an escape and items that matter, then simulate each encounter and tune it.", userId);
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
  await builderRefine(chatId, `Fix this, changing whichever sections it takes (usually not just ${w.part}): ${w.text} ${w.fix}`, userId);
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
    for (const [label, yaml2] of Object.entries(changed)) {
      if (typeof yaml2 !== "string" || !PART_LABELS.includes(label))
        continue;
      const existing = s.parts.find((p) => p.label === label);
      if (existing) {
        existing.yaml = extractYaml(yaml2);
        existing.changed = true;
      } else
        s.parts.push({ label, yaml: extractYaml(yaml2), status: "ok", issues: [], changed: true });
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
  sessions.delete(key3(userId, characterId));
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
async function draftItemUses(chatId, userId) {
  const loaded = await getRuleset(chatId, userId, true);
  const r = loaded?.ruleset;
  if (!r || !loaded?.characterId)
    return [];
  const dead = auditRuleset(r).gaps.filter((g) => g.id.startsWith("item-dead:")).map((g) => r.items[g.id.slice(10)]).filter(Boolean);
  if (!dead.length)
    return [];
  const settings = await getSettings(userId);
  const stats = r.statOrder.filter((id) => r.stats[id].kind !== "hidden").map((id) => `${id} (${r.stats[id].label}, ${r.stats[id].min}–${r.stats[id].max}, good: ${r.stats[id].good})`);
  const reads = Object.values(r.encounters).map((e) => `${e.id}: checks read ${[...new Set(Object.values(e.actions).flatMap((a) => a.check ? [String(a.check.add ?? ""), String(a.check.target ?? "")] : []))].join("; ")}`);
  const text = await ask(`You give items in a game ruleset something to DO, true to their descriptions, using only the game's own stats and conditions. Reply with YAML only: an item_uses: map.
Format per item: <id>: { label: "<button text>", <stat>: <+/-n>, add_condition: [...], remove_condition: [...], hint: "<one line for the narrator>" } — or { bonus: { <stat>: <n> } } for gear that helps checks, or keep: true for tools that aren't used up. Keep changes modest (at most a quarter of a stat's range). No moving the player, no ending or starting encounters, no money.`, [
    `Stats: ${stats.join(", ")}`,
    `Conditions: ${Object.values(r.conditions).map((c) => `${c.id} (${c.label})`).join(", ") || "none"}`,
    reads.length ? `Encounters (what their checks read):
${reads.join(`
`)}` : "",
    `Items to give a purpose:
${dead.map((it) => `- ${it.id}: ${it.name}${it.desc ? ` — ${it.desc}` : ""}`).join(`
`)}`
  ].filter(Boolean).join(`

`), settings, userId, 45000, { temperature: 0.4, maxTokens: 1500 });
  const yaml2 = extractYaml(text);
  const parsed = loadRuleset([{ label: "warp-ruleset · probe", content: yaml2, order: 0 }]);
  const raw = (parsed.ruleset ? yaml2 : "").trim();
  if (!raw)
    return [];
  const doc = yaml.load(raw);
  const uses = doc?.item_uses ?? doc ?? {};
  const kept = {};
  for (const it of dead) {
    const u = uses[it.id];
    if (!u || typeof u !== "object")
      continue;
    const clean = { drafted: true };
    for (const [k, v] of Object.entries(u)) {
      if (["move", "end", "start_encounter", "give", "take", "set", "flags", "rel", "decide", "time"].includes(k))
        continue;
      const def = r.stats[k];
      if (def) {
        if (def.kind === "money")
          continue;
        const cap = Math.max(1, Math.round((def.max - def.min) / 4));
        const n = Number(v);
        if (Number.isFinite(n) && n !== 0)
          clean[k] = Math.max(-cap, Math.min(cap, Math.round(n)));
        continue;
      }
      clean[k] = v;
    }
    if (Object.keys(clean).length > 1)
      kept[it.id] = clean;
  }
  if (!Object.keys(kept).length)
    return [];
  const body = `# Drafted by Warp from the items' descriptions. Edit or delete freely — an item's own use: always wins.
${yaml.dump({ item_uses: kept }, { lineWidth: 140 })}`;
  const check = loadRuleset([...(await currentParts(loaded.characterId, userId)).map((p, i) => ({ label: `warp-ruleset · ${p.label}`, content: p.label === DRAFT_LABEL ? "" : p.yaml, order: i })), { label: `warp-ruleset · ${DRAFT_LABEL}`, content: body, order: 999 }]);
  if (!check.ruleset || check.issues.some((i) => i.level === "error" && /item uses/i.test(i.where)))
    return [];
  const { entries, rulesetBook } = await rulesetEntries(loaded.characterId, userId);
  const existing = entries.find((e) => e.label === DRAFT_LABEL);
  if (existing)
    await host().world_books.entries.update(existing.id, { content: body, disabled: true }, userId);
  else {
    const bookId = rulesetBook ?? loaded.bookIds[0];
    if (!bookId)
      return [];
    await host().world_books.entries.create(bookId, { comment: `warp-ruleset · ${DRAFT_LABEL}`, content: body, key: [], disabled: true, constant: false, order_value: 990 }, userId);
  }
  invalidateCharacter(loaded.characterId);
  return Object.keys(kept).map((id) => r.items[id]?.name ?? id);
}
var sessions, key3 = (userId, characterId) => `${userId ?? "_"}:${characterId}`, path = (characterId) => `builder/${characterId}.json`, SYSTEMS, SYSTEM_PROMPT, DRAFT_LABEL = "item uses";
var init_builder = __esm(() => {
  init_js_yaml();
  init_builder_agent();
  init_audit();
  init_reference();
  init_source();
  init_settings();
  init_helpers();
  init_balance();
  init_loader();
  init_lint();
  init_reference();
  init_state();
  init_templates();
  init_view();
  init_source();
  sessions = new Map;
  SYSTEMS = [
    { id: "needs", label: "Needs & condition (fatigue, stress…)" },
    { id: "relationships", label: "Relationships" },
    { id: "money", label: "Money & work" },
    { id: "skills", label: "Skills that grow" },
    { id: "clothing", label: "Clothing, weather & temperature" },
    { id: "schedules", label: "NPC schedules & places" },
    { id: "encounters", label: "Encounters / combat" },
    { id: "dungeon", label: "Dungeon diving (roguelike floors, party battles)" },
    { id: "dating", label: "Dating (topics, hidden tastes, outings)" },
    { id: "crime", label: "Crime & consequences" },
    { id: "journal", label: "Codex & feats" },
    { id: "abilities", label: "Abilities & spells (your persona's own moves)" },
    { id: "perks", label: "Levels & perks (pick one of a few)" },
    { id: "story", label: "Secrets, a living world & choices for the moment" }
  ];
  SYSTEM_PROMPT = `You are the lead designer writing one section of a Warp ruleset: YAML that a game engine runs underneath a roleplay chat.
The goal is a game worth playing, not merely valid YAML: wire every stat, item, condition and encounter into play (see the design guide).
Output ONLY the YAML for the requested section — no prose, no explanations. Use only the formats below.
Use snake_case ids. Keep numbers readable (meters 0–100). Quote any formula that contains a comma.
Write in-world text (bands, hints, descriptions) in a voice that suits the card. Refer to the player as {{user}}.

${DESIGN_GUIDE}

${REFERENCE}`;
});

// src/backend/flavour.ts
function defaultsInUse(r) {
  if (!r.dating.enabled)
    return { topics: [], venues: [] };
  const topics = Object.values(r.dating.topics).filter((t) => DEFAULT_TOPICS[t.id] && DEFAULT_TOPICS[t.id].label === t.label).map((t) => t.id);
  const venues = Object.values(r.dating.venues).filter((v) => DEFAULT_VENUES[v.id] && DEFAULT_VENUES[v.id].name === v.name).map((v) => v.id);
  return { topics, venues };
}
async function themeDating(chatId, userId, force = false) {
  const loaded = await getRuleset(chatId, userId, true);
  const r = loaded?.ruleset;
  if (!r || !loaded?.characterId || !r.dating.enabled)
    return null;
  const { entries, rulesetBook } = await rulesetEntries(loaded.characterId, userId);
  const existing = entries.find((e) => e.label === FLAVOUR_LABEL);
  if (existing && !force)
    return null;
  const used = defaultsInUse(r);
  if (!force && used.topics.length < 6 && used.venues.length < 2)
    return null;
  const settings = await getSettings(userId);
  const card = await characterBrief(chatId, userId);
  const topics = Object.values(r.dating.topics).filter((t) => DEFAULT_TOPICS[t.id]).map((t) => `- ${t.id} (${t.category}): ${t.label}${t.desc ? ` — ${t.desc}` : ""}`);
  const venues = Object.values(r.dating.venues).filter((v) => DEFAULT_VENUES[v.id]).map((v) => `- ${v.id}: ${v.name} — ${v.desc ?? ""} (cost ${v.cost}; activities: ${v.activities.map((a) => a.label).join(", ")})`);
  const money = r.statOrder.find((id) => r.stats[id].kind === "money");
  const text = await ask(SYSTEM2, [
    `The card:
${card.slice(0, 4000)}`,
    `The game: ${r.name}${r.description ? ` — ${r.description}` : ""}. Places: ${Object.values(r.locations).map((l) => l.name).join(", ") || "unknown"}.${money ? ` Money: ${r.stats[money].label}.` : ""}`,
    `Default topics:
${topics.join(`
`)}`,
    `Default outings:
${venues.join(`
`)}`
  ].join(`

`), settings, userId, 60000, { temperature: 0.6, maxTokens: 3500 });
  let doc;
  try {
    doc = yaml.load(extractYaml(text));
  } catch (e) {
    logError("dating flavour", e);
    return null;
  }
  if (!doc || doc.fits_already === true) {
    if (doc?.fits_already === true && !existing)
      await writeEntry(loaded.characterId, rulesetBook ?? loaded.bookIds[0], null, `# The built-in dating topics already fit this card.
`, userId);
    return null;
  }
  const dt = doc.dating ?? {};
  const clean = {
    ...dt.topics && typeof dt.topics === "object" ? { topics: dt.topics } : {},
    ...dt.venues && typeof dt.venues === "object" ? { venues: dt.venues } : {}
  };
  if (!Object.keys(clean).length)
    return null;
  const body = `# Dating re-themed for this card by Warp. Edit or delete freely — your own dating: section wins.
${yaml.dump({ dating: clean }, { lineWidth: 160 })}`;
  const parts = (await currentParts(loaded.characterId, userId)).filter((p) => p.label !== FLAVOUR_LABEL);
  const probe = loadRuleset([...parts.map((p, i) => ({ label: `warp-ruleset · ${p.label}`, content: p.yaml, order: i })), { label: `warp-ruleset · ${FLAVOUR_LABEL}`, content: body, order: 5 }]);
  if (!probe.ruleset || probe.issues.some((i) => i.level === "error") || !probe.ruleset.dating.topicOrder.length)
    return null;
  await writeEntry(loaded.characterId, rulesetBook ?? loaded.bookIds[0], existing?.id ?? null, body, userId);
  invalidateCharacter(loaded.characterId);
  return { topics: Object.keys(clean.topics ?? {}).length, venues: Object.keys(clean.venues ?? {}).length };
}
async function writeEntry(characterId, bookId, id, content, userId) {
  if (id) {
    await host().world_books.entries.update(id, { content, disabled: true }, userId);
    return;
  }
  if (!bookId)
    return;
  await host().world_books.entries.create(bookId, { comment: `warp-ruleset · ${FLAVOUR_LABEL}`, content, key: [], disabled: true, constant: false, order_value: 5 }, userId);
}
var FLAVOUR_LABEL = "dating flavour", SYSTEM2;
var init_flavour = __esm(() => {
  init_js_yaml();
  init_loader();
  init_content2();
  init_helpers();
  init_settings();
  init_source();
  init_builder();
  SYSTEM2 = [
    "You adapt a dating mini-game's conversation topics and outings to the setting of a roleplay card.",
    "The defaults are modern (films, games, a café, an arcade). Rewrite them so they belong in THIS setting and era.",
    "For each topic: keep its id; give a label that fits, and a `say` — the player's line in first person, wrapped in *asterisks*, that brings it up (use {{target}} for the other person's name).",
    "Remove topics or outings that can't exist in the setting (`id: false`) and add up to 5 new ones that fit (new snake_case ids, same categories: small_talk, interests, personal, charm, romance).",
    "For each outing (venue): keep or replace it; give name, desc, cost (in the game's money), 3–4 activities (id: { label, tags: [...] }, romance ones romantic: true) and 2–3 events (id: { text, enjoy: -10..10 }).",
    "Keep tags plain words (food, music, nature, thrill, calm, luxury, romance, humor, conversation…): people's hidden tastes are matched on them.",
    "Romance only between adults. Reply with YAML only, in this shape:",
    "fits_already: false   # true if the defaults already suit this setting (then nothing else)",
    "dating:",
    '  topics: { books_films: { label: Tales and songs, say: "*I ask {{target}} which ballads they know.*" }, games: { label: Dice and chess }, fashion: false, swordplay: { label: Swordplay, category: interests } }',
    "  venues: { cinema: false, fair: { name: The harvest fair, desc: ..., cost: 5, activities: {...}, events: {...} } }"
  ].join(`
`);
});

// src/backend/state-push.ts
function setActiveChat(userId, chatId) {
  activeChat.set(key4(userId), chatId);
}
function getActiveChat(userId) {
  return activeChat.get(key4(userId)) ?? null;
}
async function pushState(chatId, userId, force = false) {
  try {
    const loaded = await getRuleset(chatId, userId, force);
    const status = statusOf(loaded);
    if (!chatId || !loaded?.ruleset) {
      send({ type: "state", chatId, status, hud: null, map: null, choices: [], records: [], suggestions: [], latestMessageId: null, choicesAnchor: null, busy: false, dungeon: null, dungeonEntries: [], date: null, scene: null }, userId);
      return;
    }
    const r = loaded.ruleset;
    const settings = await getSettings(userId);
    if (settings.enabled && settings.draftItemUses)
      maybeDraftItems(chatId, loaded.characterId, r, status.depth, userId);
    if (settings.enabled && settings.themeDating && r.dating.enabled)
      maybeThemeDating(chatId, loaded.characterId, userId);
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
    send(await withName({
      type: "state",
      chatId,
      status,
      hud: settings.enabled ? buildHud(r, state) : null,
      map: settings.enabled ? buildMap(r, state) : null,
      choices: settings.enabled ? markReady(buildChoices(r, state, { ...settings, live: liveChoicesOf(latest) }), readyChoices(chatId, momentKey(msgs, state))) : [],
      records: settings.enabled ? records : [],
      suggestions: settings.enabled ? suggestions.filter((s) => s.canRedo) : [],
      latestMessageId: latest?.id ?? null,
      choicesAnchor: anchor,
      busy: busyChats.has(chatId),
      dungeon: settings.enabled ? buildDungeonView(r, state) : null,
      dungeonEntries: settings.enabled ? buildDungeonEntries(r, state) : [],
      date: settings.enabled ? buildDateView(r, state, settings.lines) : null,
      scene: settings.enabled ? sceneViewFor(chatId, r, state) : null,
      encounterLogs: settings.enabled ? encounterLogsOf(r, msgs) : []
    }, chatId, userId), userId);
  } catch (e) {
    logError("pushState", e);
  }
}
function encounterLogsOf(r, msgs) {
  const out = [];
  for (const m of msgs.slice(-30)) {
    const log = warpMeta(m).encounter;
    if (!log)
      continue;
    out.push({
      messageId: m.id,
      name: r.encounters[log.enc]?.name ?? "Encounter",
      foe: log.foe,
      status: log.status,
      rounds: log.rounds.map((x) => x.card),
      from: log.from ?? 0,
      ended: log.ended ?? null
    });
  }
  return out;
}
function maybeDraftItems(chatId, characterId, r, depth, userId) {
  const dead = (depth?.gaps ?? []).filter((g) => g.id.startsWith("item-dead:")).map((g) => g.id).sort();
  if (!characterId || !dead.length)
    return;
  const key = `${characterId}:${dead.join(",")}`;
  if (drafted.has(key))
    return;
  drafted.add(key);
  Promise.resolve().then(() => (init_builder(), {})).then(({}) => draftItemUses(chatId, userId)).then((names) => {
    if (names.length) {
      send({ type: "toast", level: "info", message: `Drafted what ${names.join(", ")} do — check the Ruleset tab.` }, userId);
      pushState(chatId, userId, true);
    }
  }).catch((e) => logError("draft item uses", e));
}
function maybeThemeDating(chatId, characterId, userId) {
  if (!characterId || themed.has(characterId))
    return;
  themed.add(characterId);
  Promise.resolve().then(() => (init_flavour(), {})).then(({}) => themeDating(chatId, userId)).then((done) => {
    if (done) {
      send({ type: "toast", level: "info", message: `Dating re-themed for this card: ${done.topics} topics, ${done.venues} outings. Edit it in the "dating flavour" lorebook entry.` }, userId);
      pushState(chatId, userId, true);
    }
  }).catch((e) => logError("theme dating", e));
}
function markReady(choices, ready) {
  return ready.size ? choices.map((c) => ready.has(c.id) ? { ...c, ready: true } : c) : choices;
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
  const k = `${key4(userId)}:${chatId}`;
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
var lastStates, busyChats, activeChat, timers, key4 = (userId) => userId ?? "_", MAX_RECORDS = 60, drafted, themed;
var init_state_push = __esm(() => {
  init_view();
  init_view2();
  init_view3();
  init_scene();
  init_drafts();
  init_ledger();
  init_settings();
  init_source();
  lastStates = new Map;
  busyChats = new Set;
  activeChat = new Map;
  timers = new Map;
  drafted = new Set;
  themed = new Set;
});

// src/backend.ts
init_resolve();
init_templates();
init_ledger();
init_settings();
init_source();
init_state_push();
init_turn();
init_intents();
init_scene();
init_encounter();
init_talk();
init_types2();
init_drafts();
init_loader();
init_deciders();

// src/backend/dungeon.ts
init_dice();
init_run();
init_ledger();
init_source();
init_state_push();
init_scene();
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
  const was = state.dungeon;
  const endedRun = was && !res.events.some((e) => e.t === "dg_enter") && res.events.some((e) => e.t === "dg_exit") ? { name: r.dungeons[was.id]?.name ?? "the dungeon", depth: was.depth, gold: was.gold } : undefined;
  if (res.narrate)
    await playScene({ chatId: msg.chatId, userId, kind: "dungeon", intent: null, said: res.narrate.say, ...endedRun ? { runEnded: endedRun } : {} });
}

// src/backend.ts
init_builder();
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
    connections: await connectionsFor(userId),
    imageConnections: await imageConnectionsFor(userId)
  }, userId);
}
async function imageConnectionsFor(userId) {
  try {
    const list = await spindle.imageGen.listConnections(userId);
    return list.map((c) => ({ id: c.id, name: `${c.name}${c.model ? ` — ${c.model}` : ""}` }));
  } catch {
    return [];
  }
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
      case "say": {
        const text = String(msg.text ?? "").trim().slice(0, 4000);
        if (!text)
          return;
        if (busyChats.has(msg.chatId)) {
          toast("info", "Wait for the story to catch up first.", userId);
          return;
        }
        const loaded = await getRuleset(msg.chatId, userId);
        const r = loaded?.ruleset;
        if (r) {
          const { state } = foldPath(r, await getMessages(msg.chatId));
          if (activeSession(r, state)) {
            await playScene({ chatId: msg.chatId, userId, kind: "date", intent: { actionId: `${DATE_PREFIX}say`, via: "adjudicator" }, said: text, typed: text });
            break;
          }
          if (state.dungeon) {
            await playScene({ chatId: msg.chatId, userId, kind: "dungeon", intent: null, said: text, typed: text });
            break;
          }
          if (isQuiet(r, state) && await playRound({ chatId: msg.chatId, userId, intent: null, typed: text }))
            break;
        }
        await spindle.chat.appendMessage(msg.chatId, { role: "user", content: text }, { triggerGeneration: true });
        break;
      }
      case "act": {
        const loaded = await getRuleset(msg.chatId, userId);
        const r = loaded?.ruleset;
        if (!r)
          return;
        const settings = await getSettings(userId);
        const msgs = await getMessages(msg.chatId);
        const { state } = foldPath(r, msgs);
        const ci = intentFor(r, state, settings, msgs, msg.actionId, msg.params);
        if ("error" in ci) {
          if (ci.error)
            toast("warning", ci.error, userId);
          await pushState(msg.chatId, userId);
          return;
        }
        const { say, intent } = ci;
        if (isQuiet(r, state) && await playRound({ chatId: msg.chatId, userId, intent }))
          break;
        if (msg.actionId.startsWith(DATE_PREFIX)) {
          if (busyChats.has(msg.chatId)) {
            toast("info", "Wait a moment — they're still answering.", userId);
            await pushState(msg.chatId, userId);
            return;
          }
          await playScene({ chatId: msg.chatId, userId, kind: "date", intent, said: say });
          break;
        }
        const ready = takePrewritten(msg.chatId, momentKey(msgs, state), msg.actionId);
        if (ready) {
          await spindle.chat.appendMessage(msg.chatId, { role: "user", content: say, metadata: { warp: { intent, judged: true } } });
          const reply = await spindle.chat.appendMessage(msg.chatId, { role: "assistant", content: ready.text });
          await writeRecord(msg.chatId, reply.id, 0, ready.rec);
          await pushState(msg.chatId, userId);
          const fresh = (await getMessages(msg.chatId)).find((m) => m.id === reply.id);
          if (fresh) {
            busyChats.add(msg.chatId);
            try {
              await afterReply({
                chatId: msg.chatId,
                userId,
                rec: ready.rec,
                after: ready.after,
                playerText: say,
                ruleset: r,
                at: Date.now(),
                outcome: ready.outcome,
                player: await playerName(msg.chatId, userId),
                prompt: ready.prompt
              }, fresh, ready.text, userId);
            } finally {
              busyChats.delete(msg.chatId);
              send({ type: "busy", chatId: msg.chatId, busy: false }, userId);
              schedulePush(msg.chatId, userId, 0);
            }
          }
          break;
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
      case "run": {
        const op = msg.op === "save" || msg.op === "load" ? { op: msg.op, slot: msg.slot ?? "" } : { op: msg.op };
        const ok = await applyManual(msg.chatId, userId, (r, state) => runOp(r, state, op));
        if (ok)
          toast("success", msg.op === "save" ? "Saved." : msg.op === "load" ? "Rewound. The next reply picks up from there." : msg.op === "restart" ? "A new playthrough begins." : "The story goes on.", userId);
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
      case "builder_open": {
        await builderOpen(msg.chatId, msg.mode, userId);
        if (msg.mode === "deepen")
          await builderDeepen(msg.chatId, {}, userId);
        break;
      }
      case "builder_deepen":
        await builderDeepen(msg.chatId, { connectionId: msg.connectionId, effort: msg.effort }, userId);
        break;
      case "theme_dating": {
        await Promise.resolve().then(() => init_flavour());
        const done = await themeDating(msg.chatId, userId, true).catch((e) => {
          logError("theme dating", e);
          return null;
        });
        toast(done ? "success" : "info", done ? `Dating re-themed: ${done.topics} topics, ${done.venues} outings.` : "Dating wasn't changed — the card may already fit, or the draft didn't check out.", userId);
        await pushState(msg.chatId, userId, true);
        break;
      }
      case "draft_item_uses": {
        const names = await draftItemUses(msg.chatId, userId);
        toast(names.length ? "success" : "info", names.length ? `Drafted uses for ${names.join(", ")} — see the Ruleset tab.` : "No items needed a use, or the draft didn't check out.", userId);
        await pushState(msg.chatId, userId, true);
        break;
      }
      case "builder_start":
        await builderStart(msg.chatId, { connectionId: msg.connectionId, creative: msg.creative, base: msg.base, effort: msg.effort }, userId);
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
