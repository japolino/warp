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
    jevUrl: "https://api.typesafe.ai/v1/systemone",
    jevFormat: "typesafe",
    storyQuests: true,
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
    minigames: "ask",
    minigameScope: "rulebook",
    look: "rulebook",
    dateImages: true,
    imageConnectionId: ""
  };
});

// src/shared/classifier-config.ts
function classifierIssue(format, model, url) {
  const path = (() => {
    try {
      return new URL(url).pathname.replace(/\/+$/, "");
    } catch {
      return "";
    }
  })();
  const jev = /^(?:~?typesafe\/)?jev(?:[-./]|$)/i.test(model.trim());
  if (format === "openai" && (jev || /\/(?:alpha\/decisions|systemone)(?:\/chat\/completions)?$/.test(path)))
    return `Jev and decisions endpoints require Typed questions (TypeSafe API). For Jev on OpenRouter, use ${OPENROUTER_JEV.jevUrl} with model ${OPENROUTER_JEV.jevModel}, or choose the Jev on OpenRouter preset.`;
  if (format === "typesafe" && /\/chat\/completions$/.test(path))
    return `This URL is a chat endpoint. For Jev on OpenRouter, use ${OPENROUTER_JEV.jevUrl} with Typed questions (TypeSafe API). For a text model, select OpenAI-compatible chat.`;
  return null;
}
var OPENROUTER_JEV;
var init_classifier_config = __esm(() => {
  OPENROUTER_JEV = {
    decider: "jev",
    jevFormat: "typesafe",
    jevModel: "typesafe/jev-1.13",
    jevUrl: "https://openrouter.ai/api/alpha/decisions"
  };
});

// src/engine/game-ids.ts
function isGameId(x) {
  return typeof x === "string" && GAME_IDS.includes(x);
}
function gameAlias(x) {
  const k = x.toLowerCase().replace(/[^a-z]/g, "");
  const map = {
    aim: "aim",
    osu: "aim",
    circles: "aim",
    aimtrainer: "aim",
    shooting: "aim",
    tiles: "tiles",
    keys: "tiles",
    pianotiles: "tiles",
    piano: "tiles",
    rhythm: "tiles",
    mines: "mines",
    minesweeper: "mines",
    sweeper: "mines",
    stack: "stack",
    tetris: "stack",
    blocks: "stack",
    snake: "snake",
    race: "race",
    threeleggedrace: "race",
    threelegged: "race",
    threelegrun: "race",
    threelegrace: "race",
    pinball: "pinball",
    flipper: "pinball",
    blackjack: "blackjack",
    cards: "blackjack",
    twentyone: "blackjack",
    roulette: "roulette",
    wheel: "roulette",
    slots: "slots",
    slot: "slots",
    slotmachine: "slots",
    fruitmachine: "slots"
  };
  return map[k] ?? null;
}
function gameBar(chance, opts = {}) {
  const p = Math.max(0.01, Math.min(0.99, chance));
  const success = round2(0.3 + 0.62 * (1 - p));
  const band = 0.1 + Math.min(0.12, (opts.partial ?? 0) * 0.6);
  const partial = round2(Math.max(0.05, success - band));
  const crit = round2(Math.min(0.99, success + (1 - success) * 0.62));
  const critFail = opts.crits === false ? null : round2(Math.max(0, partial * 0.3));
  return { critFail, partial, success, crit };
}
function shiftBar(bar, by) {
  const f = (x) => round2(Math.max(0.05, Math.min(0.99, x + by)));
  return { critFail: bar.critFail === null ? null : f(bar.critFail), partial: f(bar.partial), success: f(bar.success), crit: f(bar.crit) };
}
function tierFromScore(bar, score) {
  const s = Math.max(0, Math.min(1, score));
  if (s >= bar.crit)
    return "crit_success";
  if (s >= bar.success)
    return "success";
  if (s >= bar.partial)
    return "partial";
  if (bar.critFail !== null && s < bar.critFail)
    return "crit_fail";
  return "fail";
}
function aidTotal(aids, kind) {
  const n = aids.filter((a) => a.kind === kind).reduce((t, a) => t + a.amount, 0);
  const cap = { window: 80, size: 60, slow: 35, lives: 3, hint: 3, peek: 1, preview: 4, hold: 1, wrap: 1, time: 60, saver: 2, luck: 40 };
  return Math.max(0, Math.min(cap[kind], n));
}
function aidWords(kind, n) {
  const s = (one, many) => `+${n} ${n === 1 ? one : many}`;
  switch (kind) {
    case "window":
      return `+${n}% timing window`;
    case "size":
      return `+${n}% bigger targets`;
    case "slow":
      return `${n}% slower`;
    case "time":
      return `+${n}% time`;
    case "luck":
      return `+${n}% luck`;
    case "lives":
      return s("life", "lives");
    case "hint":
      return s("hint", "hints");
    case "peek":
      return "sees the dealer's hidden card";
    case "preview":
      return s("piece preview", "piece previews");
    case "hold":
      return "can hold";
    case "wrap":
      return "walls wrap around";
    case "saver":
      return s("ball saver", "ball savers");
  }
}
var GAME_IDS, GAMBLE_GAMES, AID_KINDS, GAMES, round2 = (x) => Math.round(x * 100) / 100;
var init_game_ids = __esm(() => {
  GAME_IDS = ["aim", "tiles", "mines", "stack", "snake", "race", "pinball", "blackjack", "roulette", "slots"];
  GAMBLE_GAMES = ["blackjack", "roulette", "slots"];
  AID_KINDS = ["window", "size", "slow", "lives", "hint", "peek", "preview", "hold", "wrap", "time", "saver", "luck"];
  GAMES = {
    aim: { name: "Aim", icon: "◎", pitch: "Hit the circles on the beat, follow the sliders, keep the combo alive.", kind: "rhythm", aids: ["window", "size", "slow", "lives"] },
    tiles: { name: "Keys", icon: "▮", pitch: "Four lanes, one song: every note you hit plays the melody.", kind: "rhythm", aids: ["window", "slow", "lives"] },
    mines: { name: "Mines", icon: "✹", pitch: "Clear the board before the clock runs out. One wrong square and it's over.", kind: "skill", aids: ["hint", "lives", "time"] },
    stack: { name: "Stack", icon: "▦", pitch: "Fit the falling blocks together and clear lines before the stack tops out.", kind: "skill", aids: ["slow", "preview", "hold", "time"] },
    snake: { name: "Snake", icon: "∿", pitch: "Eat, grow, don't bite yourself. Get enough before time's up.", kind: "skill", aids: ["slow", "wrap", "lives", "time"] },
    race: { name: "Three-legged race", icon: "⟫", pitch: "Tied at the ankle: step when your partner steps, and beat the other pair to the line.", kind: "skill", aids: ["window", "lives"] },
    pinball: { name: "Pinball", icon: "◐", pitch: "Flippers, bumpers, three balls. Rack up the score before the last one drains.", kind: "skill", aids: ["saver", "lives", "size"] },
    blackjack: { name: "Blackjack", icon: "♠", pitch: "A few hands against the dealer. Get closer to 21 than they do without going over.", kind: "luck", aids: ["peek", "hint", "lives"] },
    roulette: { name: "Roulette", icon: "◉", pitch: "Place your chips and spin. Safe bets pay little, single numbers pay big.", kind: "luck", aids: ["luck", "lives"] },
    slots: { name: "Slots", icon: "7", pitch: "Stop each reel yourself — line them up on the payline.", kind: "luck", aids: ["slow", "hold", "lives"] }
  };
});

// src/shared/cue-images.ts
function imageIdentity(v) {
  return record(v) && v.version === 1 && v.provider === "warp" && text(v.chatId, 128) && text(v.requestId, 128);
}
function parseImageResult(v) {
  if (!imageIdentity(v) || !record(v))
    return null;
  if (v.status === "accepted")
    return v;
  if (v.status === "error" && text(v.error, 1000))
    return v;
  if (v.status === "ready" && text(v.imageUrl, 4000) && /^(https?:\/\/|\/api\/v1\/(?:images\/|image-gen\/results\/))/i.test(v.imageUrl) && IMAGE_FITS.includes(v.fit))
    return v;
  return null;
}
var CUE_IMAGE_REQUEST = "vn-scene-image-request-v1", CUE_IMAGE_RESULT = "vn-scene-image-result-v1", CUE_IMAGE_CANCEL = "vn-scene-image-cancel-v1", CUE_IMAGE_FIT = "vn-scene-image-fit-v1", IMAGE_FITS, record = (v) => !!v && typeof v === "object" && !Array.isArray(v), text = (v, n) => typeof v === "string" && !!v.trim() && v.length <= n;
var init_cue_images = __esm(() => {
  IMAGE_FITS = ["cover", "contain", "fill", "none", "scale-down"];
});

// src/frontend.ts
init_protocol();
init_classifier_config();

// src/frontend/styles.ts
var STYLES = `
.warp-root, .warp-chips, .warp-choices, .warp-modal, .warp-overlay, .warp-drag-ghost {
  --warp-good: #34b89a;
  --warp-warn: #d9a441;
  --warp-bad: #e05a7e;
  --warp-info: #6f8cff;
  --warp-text: var(--lumiverse-text, #e8e8ee);
  --warp-muted: var(--lumiverse-text-muted, #a4a4b4);
  --warp-dim: var(--lumiverse-text-dim, #7a7a8a);
  --warp-fill: var(--lumiverse-fill, rgba(255,255,255,0.06));
  --warp-fill-subtle: var(--lumiverse-fill-subtle, rgba(255,255,255,0.03));
  --warp-border: var(--lumiverse-border, rgba(255,255,255,0.12));
  --warp-accent: var(--lumiverse-accent, #8b7bff);
  --warp-accent-fg: var(--lumiverse-accent-fg, #fff);
  --warp-radius: var(--lumiverse-radius, 8px);
  --warp-fast: var(--lumiverse-transition-fast, 120ms);
  color: var(--warp-text);
  font-size: 13px;
  line-height: 1.4;
}
.warp-tone-good { color: var(--warp-good); }
.warp-tone-warn { color: var(--warp-warn); }
.warp-tone-bad { color: var(--warp-bad); }
.warp-tone-neutral { color: var(--warp-muted); }
.warp-dim { color: var(--warp-dim); }

/* ───────── HUD ───────── */
.warp-root { display: flex; flex-direction: column; gap: 10px; padding: 12px; box-sizing: border-box; }
.warp-hud-top { display: flex; flex-direction: column; gap: 2px; }
.warp-eyebrow { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--warp-dim); display: flex; align-items: center; justify-content: space-between; gap: 6px; }
.warp-clock { display: flex; align-items: baseline; gap: 8px; }
.warp-clock-time { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; letter-spacing: .01em; }
.warp-clock-day { color: var(--warp-muted); }
.warp-phase { font-size: 14px; }
.warp-where { color: var(--warp-muted); display: flex; gap: 10px; flex-wrap: wrap; }
.warp-where b { color: var(--warp-text); font-weight: 600; }
.warp-money { font-weight: 600; font-variant-numeric: tabular-nums; color: var(--warp-warn); }
.warp-pills { display: flex; flex-wrap: wrap; gap: 4px; }
.warp-pill { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid currentColor; opacity: .95; }

.warp-bars { display: flex; flex-direction: column; gap: 7px; }
.warp-bar { cursor: pointer; border-radius: 6px; padding: 2px 4px; margin: 0 -4px; transition: background var(--warp-fast); }
.warp-bar:hover { background: var(--warp-fill-subtle); }
.warp-bar-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.warp-bar-label { font-weight: 600; white-space: nowrap; }
.warp-bar-text { text-align: right; font-size: 12.5px; }
.warp-bar-track { height: 4px; border-radius: 4px; background: var(--warp-fill); overflow: hidden; margin-top: 3px; }
.warp-bar-fill { height: 100%; border-radius: 4px; transition: width 400ms ease, background 400ms ease; }
.warp-bar-fill.warp-bg-good { background: var(--warp-good); }
.warp-bar-fill.warp-bg-warn { background: var(--warp-warn); }
.warp-bar-fill.warp-bg-bad { background: var(--warp-bad); }
.warp-bar-fill.warp-bg-neutral { background: var(--warp-info); }
.warp-bar-edit { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
.warp-bar-edit input[type=range] { flex: 1; accent-color: var(--warp-accent); }
.warp-bar-edit input[type=number] { width: 64px; }
.warp-of { font-size: 12px; white-space: nowrap; }
.warp-changed { animation: warp-flash 1.2s ease; }
@keyframes warp-flash { 0% { background: color-mix(in srgb, var(--warp-accent) 30%, transparent); } 100% { background: transparent; } }

.warp-section { border-top: 1px solid var(--warp-border); padding-top: 8px; }
.warp-section > summary { cursor: pointer; list-style: none; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--warp-dim); display: flex; justify-content: space-between; user-select: none; }
.warp-section > summary::-webkit-details-marker { display: none; }
.warp-section > summary::after { content: "▸"; transition: transform var(--warp-fast); }
.warp-section[open] > summary::after { transform: rotate(90deg); }
.warp-section-body { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }

.warp-skill { display: grid; grid-template-columns: 1fr auto 44px; align-items: center; gap: 8px; }
.warp-grade { font-weight: 700; min-width: 22px; text-align: center; }
.warp-alloc { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; }
.warp-btn-mini { padding: 0 6px; min-width: 20px; line-height: 18px; font-size: 12px; }
.warp-alloc-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 6px; font-size: 12px; }
.warp-mini-track { height: 3px; background: var(--warp-fill); border-radius: 3px; overflow: hidden; }
.warp-mini-fill { height: 100%; background: var(--warp-accent); }
.warp-skill-tracks { display: flex; flex-direction: column; gap: 2px; }
.warp-practice-track { height: 2px; background: var(--warp-fill); border-radius: 2px; overflow: hidden; }
.warp-practice-fill { height: 100%; background: var(--warp-good); opacity: .8; transition: width .4s ease; }
.warp-away { margin-top: 6px; }
.warp-away > summary { cursor: pointer; font-size: 12px; color: var(--warp-muted); padding: 2px 0; }
.warp-away > .warp-section-body { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; opacity: .85; }
.warp-person { padding: 6px 8px; border-radius: var(--warp-radius); background: var(--warp-fill-subtle); }
.warp-person-name { font-weight: 600; margin-bottom: 2px; }
.warp-person-stats { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 12px; color: var(--warp-muted); }
.warp-item { display: flex; justify-content: space-between; }
.warp-empty { color: var(--warp-dim); font-style: italic; }

/* ───────── buttons & forms ───────── */
.warp-btn { font: inherit; color: var(--warp-text); background: var(--warp-fill); border: 1px solid var(--warp-border); border-radius: var(--warp-radius); padding: 6px 12px; cursor: pointer; transition: background var(--warp-fast), border-color var(--warp-fast), transform var(--warp-fast); }
.warp-btn:hover { border-color: var(--warp-accent); }
.warp-btn:active { transform: translateY(1px); }
.warp-btn-primary { background: var(--warp-accent); color: var(--warp-accent-fg); border-color: transparent; }
.warp-btn-ghost { background: transparent; border-color: transparent; color: var(--warp-muted); padding: 2px 6px; }
.warp-btn-ghost:hover { color: var(--warp-text); }
.warp-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.warp-card { border: 1px solid var(--warp-border); border-radius: calc(var(--warp-radius) + 2px); padding: 12px; background: var(--warp-fill-subtle); display: flex; flex-direction: column; gap: 8px; }
.warp-card h3 { margin: 0; font-size: 14px; }
.warp-card p { margin: 0; color: var(--warp-muted); }
.warp-toggle { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; padding: 6px 0; cursor: pointer; }
.warp-toggle small { grid-column: 1; color: var(--warp-dim); }
.warp-toggle input { grid-row: 1 / span 2; grid-column: 2; accent-color: var(--warp-accent); width: 16px; height: 16px; }
.warp-select, .warp-input { font: inherit; color: var(--warp-text); background: var(--warp-fill); border: 1px solid var(--warp-border); border-radius: 6px; padding: 5px 8px; width: 100%; box-sizing: border-box; }
.warp-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.warp-tag { font: inherit; font-size: 12px; border-radius: 999px; padding: 2px 10px; border: 1px solid var(--warp-border); background: transparent; color: var(--warp-muted); cursor: pointer; }
.warp-tag[data-mode=veil] { color: var(--warp-warn); border-color: var(--warp-warn); }
.warp-tag[data-mode=line] { color: var(--warp-bad); border-color: var(--warp-bad); text-decoration: line-through; }
.warp-issues { display: flex; flex-direction: column; gap: 6px; }
.warp-issue { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; font-size: 12.5px; }
.warp-issue-where { color: var(--warp-dim); grid-column: 2; font-size: 11.5px; }
.warp-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--warp-border); margin: -4px -12px 0; padding: 0 8px; position: sticky; top: 0; background: inherit; z-index: 1; }
.warp-tab { font: inherit; background: none; border: none; color: var(--warp-muted); padding: 8px 10px; cursor: pointer; border-bottom: 2px solid transparent; }
.warp-tab[aria-selected=true] { color: var(--warp-text); border-bottom-color: var(--warp-accent); }
.warp-kbd { font-family: ui-monospace, monospace; font-size: 10.5px; padding: 0 5px; border-radius: 4px; border: 1px solid var(--warp-border); color: var(--warp-muted); }

/* ───────── choices under the latest reply ───────── */
.warp-choices { container-type: inline-size; margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--warp-border); display: flex; flex-direction: column; gap: 8px; transition: opacity 200ms; }
.warp-choices.warp-busy { opacity: .45; pointer-events: none; }
.warp-choice-group { display: flex; flex-direction: column; gap: 5px; }
.warp-choice-group-label { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--warp-dim); }
.warp-choice-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px; }
.warp-choice { font: inherit; text-align: left; display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--warp-radius); border: 1px solid var(--warp-border); background: var(--warp-fill-subtle); color: var(--warp-text); cursor: pointer; transition: border-color var(--warp-fast), background var(--warp-fast), transform var(--warp-fast); min-height: 34px; }
.warp-choice:hover { border-color: var(--warp-accent); background: var(--warp-fill); }
.warp-choice:active { transform: translateY(1px); }
.warp-choice:focus-visible { outline: 2px solid var(--warp-accent); outline-offset: 1px; }
.warp-choice-label { flex: 1; }
.warp-choice-odds { font-size: 11.5px; font-variant-numeric: tabular-nums; font-weight: 600; }
.warp-choice-veil { font-size: 11px; color: var(--warp-warn); }
.warp-choice-game { font-size: 12px; color: var(--warp-accent); opacity: .85; }
.warp-choice-ready { font-size: 11px; color: var(--warp-warn); }
.warp-status-line { font-size: 12px; color: var(--warp-muted); display: flex; align-items: center; gap: 6px; }
.warp-spinner { width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--warp-border); border-top-color: var(--warp-accent); animation: warp-spin .8s linear infinite; }
@keyframes warp-spin { to { transform: rotate(360deg); } }

/* ───────── per-message dice & change chips ───────── */
/* If the host ever re-attaches our row inside a message card (a side-by-side
   flex box), wrap it onto its own full-width line rather than squeezing the text. */
[data-message-id]:has(> [data-spindle-inj-id] > .warp-chips, > [data-spindle-inj-id] > .warp-choices) { flex-wrap: wrap; }
[data-message-id] > [data-spindle-inj-id]:has(> .warp-chips, > .warp-choices) { flex: 1 0 100%; min-width: 0; }
.warp-chips { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 5px; align-items: center; font-size: 12px; }
.warp-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 9px; border-radius: 999px; background: var(--warp-fill); border: 1px solid transparent; white-space: nowrap; }
.warp-chip-narr { border-style: dashed; border-color: var(--warp-border); }
.warp-chip-undo { font: inherit; background: none; border: none; color: var(--warp-dim); cursor: pointer; padding: 0 0 0 2px; line-height: 1; }
.warp-chip-undo:hover { color: var(--warp-bad); }
.warp-dice { cursor: pointer; font-weight: 600; border: 1px solid currentColor; background: transparent; }
.warp-dice-detail { flex-basis: 100%; display: none; gap: 6px; align-items: center; color: var(--warp-muted); padding: 4px 2px 0; flex-wrap: wrap; }
.warp-chips[data-open] .warp-dice-detail { display: flex; }
.warp-die { display: inline-grid; place-items: center; min-width: 24px; height: 24px; padding: 0 4px; border-radius: 6px; border: 1px solid var(--warp-border); font-weight: 700; font-variant-numeric: tabular-nums; color: var(--warp-text); }
.warp-die[data-dropped] { opacity: .35; text-decoration: line-through; }
.warp-band { color: var(--warp-dim); font-style: italic; }
.warp-why-btn { font: inherit; cursor: pointer; border: 1px dashed var(--warp-border); background: transparent; color: var(--warp-muted); }
.warp-why-detail { flex-basis: 100%; display: none; flex-direction: column; gap: 3px; padding: 4px 2px 0; font-size: 12px; color: var(--warp-muted); white-space: normal; }
.warp-chips[data-why-open] .warp-why-detail { display: flex; }

.warp-decision { border: 1px solid var(--warp-info); color: var(--warp-text); }
.warp-suggest { background: color-mix(in srgb, var(--warp-accent) 14%, transparent); border: 1px solid var(--warp-accent); gap: 8px; padding: 3px 4px 3px 10px; }
.warp-mini { padding: 1px 10px; font-size: 12px; }
.warp-slider { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--warp-muted); }
.warp-slider input { accent-color: var(--warp-accent); }

/* ───────── world: weather, warmth, outfit, encounter, perks ───────── */
.warp-weather { color: var(--warp-muted); font-size: 12.5px; }
.warp-warmth { padding: 2px 0 4px; }
.warp-warmth-track { position: relative; height: 8px; border-radius: 6px; margin-top: 4px;
  background: linear-gradient(90deg, #4f8cff 0%, #7fd1ff 25%, #f3e7b0 55%, #ffb347 78%, #e0505a 100%); opacity: .9; }
.warp-warmth-band { position: absolute; top: -2px; bottom: -2px; border: 2px solid var(--warp-good); border-radius: 6px; box-sizing: border-box; }
.warp-warmth-mark { position: absolute; top: -4px; width: 4px; height: 16px; margin-left: -2px; border-radius: 2px; box-shadow: 0 0 0 2px var(--warp-fill-strong, #16141d); }
.warp-warmth-mark.warp-bg-good { background: var(--warp-good); }
.warp-warmth-mark.warp-bg-warn { background: var(--warp-warn); }
.warp-warmth-mark.warp-bg-bad { background: var(--warp-bad); }
.warp-encounter { border: 1px solid var(--warp-bad); border-radius: var(--warp-radius); padding: 8px 10px; display: flex; flex-direction: column; gap: 4px;
  background: color-mix(in srgb, var(--warp-bad) 10%, transparent); }
.warp-encounter-foe { font-weight: 700; font-size: 14px; }
.warp-outfit-row { display: grid; grid-template-columns: 78px 1fr auto; gap: 6px; align-items: center; font-size: 12.5px; }
.warp-mini-select { width: auto; max-width: 110px; padding: 2px 4px; font-size: 12px; }
.warp-perk { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12.5px; }
.warp-perk-owned { opacity: .8; }
.warp-group + .warp-group { margin-top: 8px; }
.warp-group-head { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--warp-muted); padding: 4px 0 2px; border-bottom: 1px solid var(--warp-border); margin-bottom: 4px; }
.warp-perk-later { font-size: 12px; display: flex; flex-wrap: wrap; gap: 0 6px; }
.warp-perk-text { min-width: 0; }
.warp-perk-notes { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 11.5px; color: var(--warp-good); }
.warp-perk-drawback { font-size: 11.5px; color: var(--warp-warn); }
.warp-perk-pick { display: flex; flex-direction: column; gap: 6px; padding: 8px; margin-bottom: 6px; border-radius: var(--warp-radius); border: 1px solid color-mix(in srgb, var(--warp-accent) 55%, var(--warp-border)); background: color-mix(in srgb, var(--warp-accent) 7%, transparent); }
.warp-perk-pick-head { font-weight: 700; font-size: 12px; color: var(--warp-accent); }
.warp-quest { display: flex; flex-direction: column; gap: 3px; padding: 7px 8px; margin-bottom: 6px; border-radius: var(--warp-radius); border: 1px solid var(--warp-border); background: var(--warp-fill-subtle); font-size: 12.5px; }
.warp-quest-ready { border-color: color-mix(in srgb, var(--warp-good) 60%, var(--warp-border)); background: color-mix(in srgb, var(--warp-good) 7%, transparent); }
.warp-quest-offered { border-style: dashed; }
.warp-quest-done, .warp-quest-failed { opacity: .75; }
.warp-quest-failed .warp-quest-head b { text-decoration: line-through; text-decoration-color: var(--warp-bad); }
.warp-quest-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.warp-quest-kind { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: var(--warp-dim); border: 1px solid var(--warp-border); border-radius: 999px; padding: 0 6px; margin-left: 4px; }
.warp-quest-goals { list-style: none; margin: 2px 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.warp-quest-goals li.done { color: var(--warp-good); }
.warp-quest-goals li.optional { color: var(--warp-muted); }
.warp-quest-reward { color: var(--warp-warn); }
.warp-quest-stakes { color: var(--warp-bad); font-size: 11.5px; }
.warp-quest-actions { margin-top: 2px; align-items: center; }
.warp-btn-danger { border-color: var(--warp-bad); color: var(--warp-bad); }
.warp-foe-tags { display: inline-flex; flex-wrap: wrap; gap: 4px; margin-left: 6px; vertical-align: middle; }
.warp-foe-tags .warp-pill { font-size: 10px; padding: 0 6px; }
.warp-memories { margin-top: 3px; font-size: 11.5px; }
.warp-memories > summary { cursor: pointer; color: var(--warp-muted); }
.warp-memory { padding: 2px 0 2px 10px; border-left: 2px solid var(--warp-border); margin-top: 2px; color: var(--warp-muted); }
.warp-perk-offer + .warp-perk-offer { border-top: 1px dashed var(--warp-border); padding-top: 6px; }
.warp-person-here { border: 1px solid color-mix(in srgb, var(--warp-good) 55%, transparent); }
.warp-rel { cursor: pointer; border-radius: 4px; }
.warp-rel:hover { background: var(--warp-fill); }
.warp-forget { float: right; font-size: 11px; padding: 0 4px; }
.warp-here { font-size: 10.5px; color: var(--warp-good); border: 1px solid currentColor; border-radius: 999px; padding: 0 6px; margin-left: 4px; font-weight: 500; }

/* ───────── map & journal ───────── */
.warp-map-view { position: relative; height: 220px; border-radius: 10px; background: var(--warp-fill-subtle); overflow: hidden; touch-action: none; cursor: grab; }
.warp-root:not(.warp-overlay-body) .warp-map-view { height: 360px; }
.warp-panel-solo .warp-map-view { height: 300px; }
.warp-map-view.panning { cursor: grabbing; }
.warp-map-view.panning .warp-map-node { pointer-events: none; }
.warp-map { display: block; width: 100%; height: 100%; }
.warp-map-tools { position: absolute; right: 6px; bottom: 6px; display: flex; flex-direction: column; gap: 4px; }
.warp-map-tool { width: 26px; height: 26px; padding: 0; border-radius: 7px; border: 1px solid var(--warp-border); background: color-mix(in srgb, var(--lumiverse-fill-strong, #16141d) 82%, transparent); color: inherit; font: inherit; font-size: 14px; line-height: 1; cursor: pointer; }
.warp-map-tool:hover { border-color: var(--warp-accent); }
.warp-map-hint { font-size: 11px; margin: 2px 0 0; }
.warp-map-edge { stroke: var(--warp-border); stroke-width: 2; }
.warp-map-node circle { fill: var(--warp-fill); stroke: var(--warp-border); stroke-width: 2; }
.warp-map-node text { fill: var(--warp-muted); font-size: 11px; }
.warp-map-node .warp-map-people { fill: var(--warp-good); font-size: 10px; }
.warp-map-node .warp-map-icon { fill: var(--warp-dim); font-size: 10px; }
.warp-map-node.here circle { fill: var(--warp-accent); stroke: var(--warp-accent); }
.warp-map-node.here text { fill: var(--warp-text); font-weight: 700; }
.warp-map-node.reachable { cursor: pointer; }
.warp-map-node.locked circle { stroke-dasharray: 3 3; opacity: .6; }
.warp-map-node.reachable circle { stroke: var(--warp-accent); }
.warp-map-node.reachable:hover circle, .warp-map-node.reachable:focus circle { fill: color-mix(in srgb, var(--warp-accent) 35%, transparent); }
.warp-codex summary { cursor: pointer; padding: 3px 0; }
.warp-codex p { margin: 2px 0 6px 14px; }
.warp-feat { display: flex; gap: 8px; align-items: flex-start; opacity: .55; font-size: 12.5px; }
.warp-feat.unlocked { opacity: 1; }
.warp-timeline-row { font: inherit; color: inherit; text-align: left; background: none; border: none; border-top: 1px solid var(--warp-border); padding: 6px 2px; display: grid; grid-template-columns: 1fr; gap: 1px; cursor: pointer; }
.warp-timeline-row:hover { background: var(--warp-fill-subtle); }
.warp-news-row { border-top: 1px solid var(--warp-border); padding: 6px 2px; display: grid; gap: 1px; font-size: 12.5px; }
.warp-news-row:first-of-type { border-top: none; }
.warp-timeline-changes { font-size: 11.5px; }

/* ───────── AI builder ───────── */
.warp-builder { display: flex; flex-direction: column; gap: 10px; }
.warp-builder-head { display: flex; justify-content: space-between; align-items: flex-start; }
.warp-steps { display: flex; gap: 4px; list-style: none; margin: 0; padding: 0; counter-reset: s; }
.warp-steps li { flex: 1; font-size: 11px; text-align: center; padding: 4px 2px; border-bottom: 3px solid var(--warp-border); color: var(--warp-dim); counter-increment: s; }
.warp-steps li::before { content: counter(s) ". "; }
.warp-steps li.done { border-color: color-mix(in srgb, var(--warp-accent) 55%, transparent); color: var(--warp-muted); }
.warp-steps li.now { border-color: var(--warp-accent); color: var(--warp-text); font-weight: 600; }
.warp-q { display: flex; flex-direction: column; gap: 6px; padding: 8px 0; border-top: 1px solid var(--warp-border); }
.warp-q:first-of-type { border-top: none; }
.warp-q-text { font-weight: 600; }
.warp-q-why { font-size: 12px; margin-top: -4px; }
.warp-opt[aria-pressed=true] { background: var(--warp-accent); color: var(--warp-accent-fg); border-color: transparent; }
.warp-scale { width: 100%; accent-color: var(--warp-accent); }
.warp-scale-labels { display: flex; justify-content: space-between; font-size: 11.5px; color: var(--warp-dim); }
.warp-add-row { display: grid; grid-template-columns: 1fr 86px 1.4fr auto; gap: 4px; align-items: center; }
.warp-field { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--warp-muted); }
.warp-seg { display: flex; border: 1px solid var(--warp-border); border-radius: var(--warp-radius); overflow: hidden; }
.warp-seg-btn { flex: 1; font: inherit; font-size: 12.5px; padding: 7px 8px; background: transparent; border: none; color: var(--warp-muted); cursor: pointer; }
.warp-seg-btn[aria-pressed=true] { background: var(--warp-accent); color: var(--warp-accent-fg); }
.warp-warning-row { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; font-size: 12.5px; }
.warp-preview-grid { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
.warp-preview-hud { border: 1px solid var(--warp-border); border-radius: var(--warp-radius); max-height: 320px; overflow: auto; }
.warp-preview .warp-choices { margin-top: 0; border-top: none; padding-top: 0; }
.warp-part { border-top: 1px solid var(--warp-border); padding: 6px 0; }
.warp-part > summary { cursor: pointer; }
.warp-yaml { max-height: 240px; overflow: auto; font-size: 11.5px; background: var(--warp-fill-subtle); border-radius: 6px; padding: 8px; white-space: pre; }
.warp-busy-card { border-color: var(--warp-accent); }
.warp-error-card { border-color: var(--warp-bad); }
.warp-builder-foot { justify-content: space-between; }
.warp-builder-cta { border-color: color-mix(in srgb, var(--warp-accent) 50%, transparent); }
.warp-btn[disabled] { opacity: .5; cursor: not-allowed; }

/* ───────── floating status overlay ───────── */
.warp-overlay {
  --warp-good: #34b89a; --warp-warn: #d9a441; --warp-bad: #e05a7e; --warp-info: #6f8cff;
  display: flex; flex-direction: column; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden;
  color: var(--lumiverse-text, #e8e8ee); font-size: 13px;
  background: color-mix(in srgb, var(--lumiverse-fill-strong, #16141d) 88%, transparent);
  -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
  border: 1px solid var(--lumiverse-border, rgba(255,255,255,0.12));
  border-radius: 14px;
  box-shadow: 0 12px 32px rgba(0,0,0,.35);
}
.warp-overlay-head { display: flex; align-items: center; gap: 8px; height: 38px; flex: 0 0 38px; padding: 0 6px 0 12px; box-sizing: border-box; cursor: grab; user-select: none; }
.warp-overlay-head:active { cursor: grabbing; }
.warp-overlay-title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.warp-overlay-actions { display: flex; gap: 2px; }
.warp-overlay-actions .warp-btn { font-size: 15px; line-height: 1; padding: 4px 8px; }
.warp-dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 8px; }
.warp-dot.warp-bg-good { background: var(--warp-good); }
.warp-dot.warp-bg-warn { background: var(--warp-warn); }
.warp-dot.warp-bg-bad { background: var(--warp-bad); }
.warp-overlay-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; max-height: var(--warp-overlay-max, 70vh); padding-top: 4px; border-top: 1px solid var(--lumiverse-border, rgba(255,255,255,0.12)); }
.warp-overlay-collapsed { border-radius: 999px; }

/* Attached to a screen edge: sidebar (left/right) or strip (top/bottom). */
.warp-overlay[data-edge=left]:not(.warp-overlay-collapsed),
.warp-overlay[data-edge=right]:not(.warp-overlay-collapsed) { border-radius: 12px; }
.warp-overlay[data-edge=top]:not(.warp-overlay-collapsed),
.warp-overlay[data-edge=bottom]:not(.warp-overlay-collapsed) { border-radius: 12px; }
.warp-overlay[data-edge=top] .warp-overlay-body,
.warp-overlay[data-edge=bottom] .warp-overlay-body {
  display: grid; grid-template-columns: minmax(170px, 220px) 1fr; gap: 8px 18px; align-content: start;
}
.warp-overlay[data-edge=top] .warp-bars,
.warp-overlay[data-edge=bottom] .warp-bars {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 6px 18px;
}
.warp-overlay[data-edge=top] .warp-section,
.warp-overlay[data-edge=bottom] .warp-section { grid-column: 1 / -1; }.warp-overlay-collapsed .warp-overlay-head { cursor: pointer; }
.warp-overlay-collapsed .warp-overlay-body { display: none; }

/* ───────── the designer ───────── */
.warp-designer-log { margin-top: 8px; font-size: 12px; }
.warp-designer-log > summary { cursor: pointer; color: var(--warp-dim); }
.warp-designer-log ol { margin: 6px 0 0; padding-left: 20px; max-height: 220px; overflow: auto; display: flex; flex-direction: column; gap: 2px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.warp-plan-text { white-space: pre-wrap; font: inherit; font-size: 12.5px; line-height: 1.5; margin: 8px 0 0; }
.warp-depth-line { font-variant-numeric: tabular-nums; }

/* ───────── depth audit ───────── */
.warp-depth-row > summary { cursor: pointer; padding: 3px 0; }
.warp-depth-row > p { margin: 2px 0 6px 14px; font-size: 12px; }
.warp-depth-row .warp-warning-row { grid-template-columns: auto minmax(0, 1fr); align-items: start; margin: 6px 0; overflow-wrap: anywhere; }
.warp-depth-gap > summary::marker { color: var(--warp-bad); }
.warp-depth-thin > summary::marker { color: var(--warp-warn); }
.warp-issues-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 4px; font-size: 12.5px; }
.warp-depth-drafted { font-size: 12px; border-left: 3px solid var(--warp-accent); padding-left: 8px; }

/* ───────── encounters: goal, danger, rounds ───────── */
.warp-enc-guide { border: 1px solid color-mix(in srgb, var(--warp-bad) 45%, var(--warp-border)); border-radius: var(--warp-radius); padding: 8px 10px; display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px; background: color-mix(in srgb, var(--warp-bad) 5%, transparent); font-size: 12.5px; }
.warp-enc-head { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; font-size: 13px; }
.warp-enc-goal b, .warp-enc-danger b, .warp-enc-last-head b { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--warp-dim); font-weight: 600; margin-right: 4px; }
.warp-enc-meters { display: grid; grid-template-columns: minmax(0, 1fr); gap: 3px 18px; }
@container (min-width: 520px) { .warp-enc-meters { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.warp-enc-meter { display: grid; grid-template-columns: minmax(64px, auto) 1fr auto; align-items: center; gap: 8px; font-size: 12px; font-variant-numeric: tabular-nums; }
.warp-enc-danger { font-size: 12px; font-variant-numeric: tabular-nums; }
.warp-enc-last { border-top: 1px dashed var(--warp-border); padding-top: 5px; display: flex; flex-direction: column; gap: 3px; }
.warp-enc-last-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; }
.warp-enc-say { display: flex; gap: 6px; }
.warp-enc-say .warp-input { flex: 1; min-width: 0; padding-top: 4px; padding-bottom: 4px; }
.warp-choice-why { display: block; font-size: 11px; color: var(--warp-dim); margin-top: 1px; }
.warp-choice-locked { opacity: .55; cursor: not-allowed; }
.warp-choice-item { border-style: dashed; }
.warp-enc-log { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; font-size: 12px; }
.warp-enc-log > .warp-round, .warp-rounds-list > .warp-round { padding: 5px 8px; border-radius: 8px; background: var(--warp-fill-subtle); border: 1px solid var(--warp-border); }
.warp-enc-log-foot { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 12px; }
.warp-round { display: flex; flex-direction: column; gap: 1px; font-size: 12px; min-width: 0; }
.warp-round-line { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
.warp-round-n { font-variant-numeric: tabular-nums; color: var(--warp-dim); min-width: 1.1em; }
.warp-round-foe, .warp-round-changes, .warp-round-end { padding-left: calc(1.1em + 8px); }
.warp-round-changes { display: flex; flex-wrap: wrap; gap: 0 10px; font-size: 11.5px; font-variant-numeric: tabular-nums; }
.warp-round-end { font-weight: 700; }
.warp-round-final { padding: 5px 8px; border-radius: 8px; border: 1px solid currentColor; background: var(--warp-fill-subtle); }
.warp-rounds, .warp-enc-why { font-size: 11.5px; }
.warp-rounds > summary, .warp-enc-why > summary { cursor: pointer; color: var(--warp-dim); list-style: none; }
.warp-rounds > summary::-webkit-details-marker, .warp-enc-why > summary::-webkit-details-marker { display: none; }
.warp-rounds > summary:hover, .warp-enc-why > summary:hover { color: var(--warp-text); }
.warp-rounds > summary::after { content: " ▾"; }
.warp-rounds[open], .warp-enc-why[open] { flex-basis: 100%; }
.warp-rounds-list { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
.warp-enc-why-body { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; color: var(--warp-muted); }
.warp-item-usable .warp-item-name { min-width: 0; }
.warp-item-side { display: flex; align-items: center; gap: 6px; }
.warp-item-bonus { display: block; font-size: 11px; color: var(--warp-good); }

/* ───────── torn-off panels ───────── */
.warp-section > summary > span { flex: 1; }
.warp-section > summary[data-part] { position: relative; }
.warp-section > summary[data-part]::before { content: "⠿"; position: absolute; left: -11px; opacity: 0; transition: opacity var(--warp-fast); cursor: grab; }
.warp-section > summary[data-part]:hover::before { opacity: .7; }
.warp-section.warp-dragging { opacity: .35; }
.warp-panel .warp-overlay-title { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--warp-dim); }
.warp-panel .warp-overlay-body { padding-bottom: 8px; }
.warp-panel-solo { display: flex; flex-direction: column; gap: 6px; padding-top: 6px; }
.warp-overlay.warp-drop-target { border-color: var(--warp-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--warp-accent) 35%, transparent), 0 12px 32px rgba(0,0,0,.35); }
.warp-drag-ghost {
  position: fixed; left: 0; top: 0; z-index: 2147483000; pointer-events: none;
  padding: 7px 12px; border-radius: 10px; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--lumiverse-text, #e8e8ee); background: color-mix(in srgb, var(--lumiverse-fill-strong, #16141d) 92%, transparent);
  border: 1px solid var(--warp-accent, #8b7cff); box-shadow: 0 10px 24px rgba(0,0,0,.4);
}
.warp-drag-ghost.warp-ghost-new::after { content: "  ·  new window"; opacity: .6; }

/* ───────── modal ───────── */
.warp-modal { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
.warp-template { text-align: left; font: inherit; color: inherit; cursor: pointer; }
.warp-template:hover { border-color: var(--warp-accent); }

/* ───────── dungeon ───────── */
.warp-px { image-rendering: pixelated; image-rendering: crisp-edges; }
.warp-dg-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; }
.warp-dg-stats { display: flex; gap: 8px; align-items: baseline; font-variant-numeric: tabular-nums; }
.warp-dg-party { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 6px; }
.warp-dg-member { font: inherit; color: inherit; text-align: left; background: var(--warp-fill); border: 1px solid var(--warp-border); border-radius: var(--warp-radius); padding: 6px 8px; display: flex; flex-direction: column; gap: 3px; }
.warp-dg-member.active { border-color: var(--warp-accent); box-shadow: 0 0 0 1px var(--warp-accent) inset; }
.warp-dg-member.down { opacity: .45; }
.warp-dg-member.targetable, .warp-dg-foe.targetable { cursor: pointer; border-color: var(--warp-warn); }
.warp-dg-member-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.warp-dg-member-head b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warp-dg-face { width: 28px; height: 28px; flex: none; }
.warp-dg-bar { display: grid; grid-template-columns: 20px 1fr 30px; align-items: center; gap: 4px; font-size: 10.5px; }
.warp-dg-bar-l { color: var(--warp-dim); }
.warp-dg-bar-n { text-align: right; font-variant-numeric: tabular-nums; }
.warp-dg-bar-track { height: 5px; background: rgba(0,0,0,.35); border-radius: 3px; overflow: hidden; }
.warp-dg-bar-track > div { height: 100%; border-radius: 3px; transition: width 200ms; }
.warp-dg-bar.hp .warp-dg-bar-track > div { background: linear-gradient(90deg, #e0a043, #f2d05c); }
.warp-dg-bar.mp .warp-dg-bar-track > div { background: linear-gradient(90deg, #3d8fe0, #62d3f0); }
.warp-dg-bar.tp .warp-dg-bar-track > div { background: linear-gradient(90deg, #2ca65a, #6fe07e); }
.warp-dg-board { display: grid; gap: 3px; background: rgba(0,0,0,.35); padding: 4px; border-radius: var(--warp-radius); }
.warp-dg-tile { aspect-ratio: 1; border: 1px solid rgba(0,0,0,.4); border-radius: 3px; padding: 0; background-image: var(--tile); background-size: 100% 100%; image-rendering: pixelated; display: grid; place-items: center; position: relative; }
.warp-dg-tile.hidden { filter: brightness(.45) saturate(.6); }
.warp-dg-tile.reachable { cursor: pointer; outline: 2px solid var(--warp-accent); outline-offset: -2px; filter: none; }
.warp-dg-tile.reachable.hidden { filter: brightness(.7); }
.warp-dg-tile.reachable:hover { filter: brightness(1.1); }
.warp-dg-tile.here { outline: 2px solid var(--warp-warn); outline-offset: -2px; }
.warp-dg-icon { width: 80%; height: 80%; }
.warp-dg-icon.faded { opacity: .45; }
.warp-dg-icon.danger { filter: drop-shadow(0 0 3px #e05a7e); }
.warp-dg-mini { width: 18px; height: 18px; vertical-align: middle; margin-right: 3px; }
.warp-dg-actions, .warp-dg-cmds { display: flex; flex-wrap: wrap; gap: 6px; }
.warp-dg-event.romance { border-color: #e07aa6; }
.warp-dg-ware, .warp-dg-stairs, .warp-dg-entry-head { display: flex; align-items: center; gap: 8px; }
.warp-dg-ware > div, .warp-dg-stairs > div { flex: 1; }
.warp-dg-ware img, .warp-dg-stairs img, .warp-dg-entry-head img { width: 32px; height: 32px; }
.warp-dg-bag { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.warp-dg-log { font-size: 12px; color: var(--warp-muted); display: flex; flex-direction: column; gap: 2px; }
.warp-dg-log > div:first-child { color: var(--warp-text); }
.warp-dg-leave { align-self: flex-start; }
.warp-dg-prompt { display: flex; align-items: center; gap: 8px; color: var(--warp-warn); }
.warp-dg-battle { display: flex; flex-direction: column; gap: 8px; }
.warp-dg-stage { border-radius: var(--warp-radius); background-size: auto, 48px 48px; image-rendering: pixelated; padding: 10px 8px 12px; min-height: 150px; display: flex; flex-direction: column; gap: 6px; }
.warp-dg-eyebrow { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.75); }
.warp-dg-foes { display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-end; gap: 10px; }
.warp-dg-foe { font: inherit; color: #fff; background: rgba(0,0,0,.25); border: 1px solid transparent; border-radius: var(--warp-radius); padding: 4px 6px; width: 104px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.warp-dg-foe.down { opacity: .25; }
.warp-dg-foe-img { width: 72px; height: 72px; filter: drop-shadow(0 4px 3px rgba(0,0,0,.6)); }
.warp-dg-foe.elite .warp-dg-foe-img { width: 84px; height: 84px; filter: drop-shadow(0 0 6px #d9a441); }
.warp-dg-foe.boss { width: 150px; }
.warp-dg-foe.boss .warp-dg-foe-img { width: 128px; height: 128px; filter: drop-shadow(0 0 8px #e05a7e); }
.warp-dg-foe-name { font-size: 11.5px; text-align: center; text-shadow: 0 1px 2px #000; }
.warp-dg-foe .warp-dg-bar { width: 100%; color: #fff; }
.warp-dg-command { display: flex; flex-direction: column; gap: 6px; }
.warp-dg-cmd { padding: 5px 10px; }
.warp-dg-mates { display: flex; flex-direction: column; gap: 4px; }
.warp-dg-mate { display: flex; align-items: center; gap: 6px; }

/* ───────── swinging fights ───────── */
.warp-momentum { position: relative; height: 8px; border-radius: 4px; background: linear-gradient(90deg, var(--warp-good), var(--warp-fill) 45%, var(--warp-fill) 55%, var(--warp-bad)); }
.warp-momentum-mid { position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: var(--warp-border); }
.warp-momentum-mark { position: absolute; top: -3px; width: 4px; height: 14px; margin-left: -2px; border-radius: 2px; background: var(--warp-text); transition: left 400ms ease; }

/* ───────── checkpoints ───────── */
.warp-run-slot { display: grid; grid-template-columns: 52px 1fr auto auto; gap: 6px; align-items: center; font-size: 12.5px; }
.warp-run-slot-name { color: var(--warp-dim); }
.warp-run-slot-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warp-run-end { padding: 8px; border-radius: var(--warp-radius); border: 1px solid currentColor; }

/* ───────── dating ───────── */
.warp-date { display: flex; flex-direction: column; gap: 10px; }
.warp-date-person, .warp-date-head { display: flex; gap: 10px; align-items: flex-start; padding: 8px; border-radius: var(--warp-radius); background: var(--warp-fill-subtle); border: 1px solid var(--warp-border); }
.warp-date-head { background: color-mix(in srgb, hsl(var(--warp-hue, 300) 60% 55%) 6%, var(--warp-fill-subtle)); }
.warp-date-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.warp-date-avatar { flex: none; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; color: #fff; background: hsl(var(--warp-hue, 300) 45% 42%); box-shadow: inset 0 0 0 2px hsl(var(--warp-hue, 300) 55% 60% / .6); }
.warp-date-avatar.big { width: 44px; height: 44px; font-size: 18px; }
.warp-date-name { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.warp-date-stage { font-size: 11px; padding: 0 8px; border-radius: 999px; border: 1px solid var(--warp-border); color: var(--warp-muted); }
.warp-date-stage.partner { color: #e07aa6; border-color: #e07aa6; }
.warp-date-stage.hostile { color: var(--warp-bad); border-color: var(--warp-bad); }
.warp-date-here { color: var(--warp-good); font-size: 10px; }
.warp-date-meter { display: grid; grid-template-columns: 58px 1fr auto; align-items: center; gap: 6px; font-size: 11.5px; }
.warp-date-meter-l { color: var(--warp-dim); }
.warp-date-meter-t { color: var(--warp-muted); white-space: nowrap; }
.warp-date-meter-track { height: 5px; border-radius: 4px; background: var(--warp-fill); overflow: hidden; }
.warp-date-meter-track > div { height: 100%; border-radius: 4px; transition: width 400ms ease; background: var(--warp-info); }
.warp-date-meter.love .warp-date-meter-track > div { background: #e07aa6; }
.warp-date-meter.fear .warp-date-meter-track > div { background: var(--warp-bad); }
.warp-date-meter.enjoy .warp-date-meter-track > div { background: var(--warp-warn); }
.warp-date-meter.fatigue.good .warp-date-meter-track > div { background: var(--warp-good); }
.warp-date-meter.fatigue.warn .warp-date-meter-track > div { background: var(--warp-warn); }
.warp-date-meter.fatigue.bad .warp-date-meter-track > div { background: var(--warp-bad); }
.warp-date-knows { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 12px; }
.warp-date-mood { display: flex; flex-direction: column; align-items: center; font-size: 11px; color: var(--warp-muted); min-width: 56px; }
.warp-date-face { font-size: 26px; line-height: 1.1; }
.warp-date-stats { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
.warp-date-combo { font-size: 12px; font-weight: 600; color: var(--warp-muted); white-space: nowrap; }
.warp-date-combo.hot { color: var(--warp-warn); }
.warp-date-outing { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; padding: 6px 8px; border-radius: var(--warp-radius); border: 1px dashed var(--warp-border); }
.warp-date-outing .warp-date-meter { flex-basis: 100%; }
.warp-date-last { font-size: 12.5px; padding: 4px 8px; border-radius: var(--warp-radius); background: var(--warp-fill); }
.warp-date-move.venue, .warp-date-move.activity { border-color: color-mix(in srgb, var(--warp-warn) 50%, var(--warp-border)); }
.warp-date-topics { display: flex; flex-direction: column; gap: 6px; }
.warp-date-cats { display: flex; flex-wrap: wrap; gap: 4px; }
.warp-date-cat { font: inherit; font-size: 12px; background: transparent; color: var(--warp-muted); border: 1px solid var(--warp-border); border-radius: 999px; padding: 2px 10px; cursor: pointer; }
.warp-date-cat[aria-selected=true] { color: var(--warp-text); border-color: var(--warp-accent); background: var(--warp-fill); }
.warp-date-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.warp-date-topic { font: inherit; text-align: left; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: var(--warp-radius); border: 1px solid var(--warp-border); background: var(--warp-fill-subtle); color: var(--warp-text); cursor: pointer; min-height: 32px; }
.warp-date-topic:hover:not(:disabled) { border-color: var(--warp-accent); background: var(--warp-fill); }
.warp-date-topic:disabled { cursor: not-allowed; }
.warp-date-topic.locked { opacity: .5; }
.warp-date-topic-l { flex: 1; min-width: 0; }
.warp-date-react { font-size: 11px; font-weight: 700; min-width: 18px; }
.warp-date-used { font-size: 10.5px; color: var(--warp-dim); }
.warp-date-lock { font-size: 11px; }
`;

// src/frontend/overlay-layout.ts
var PAD = 12;
var SNAP = 28;
var PILL = { w: 150, h: 38 };
var PANEL_W = 290;
var SIDE_W = 300;
var STRIP_H = 190;
function edgeForDrop(start, box, vp) {
  const dx = box.x - start.x;
  const dy = box.y - start.y;
  const near = {
    left: box.x - PAD <= SNAP && dx < -2,
    right: vp.width - (box.x + box.w) - PAD <= SNAP && dx > 2,
    top: box.y - PAD <= SNAP && dy < -2,
    bottom: vp.height - (box.y + box.h) - PAD <= SNAP && dy > 2
  };
  const horizontal = near.left ? "left" : near.right ? "right" : null;
  const vertical = near.top ? "top" : near.bottom ? "bottom" : null;
  if (horizontal && vertical)
    return Math.abs(dx) >= Math.abs(dy) ? horizontal : vertical;
  return horizontal ?? vertical;
}
function attachedBox(edge, open, vp) {
  if (!open) {
    switch (edge) {
      case "left":
        return { x: PAD, y: PAD, ...wh(PILL) };
      case "right":
        return { x: vp.width - PILL.w - PAD, y: PAD, ...wh(PILL) };
      case "top":
        return { x: Math.round((vp.width - PILL.w) / 2), y: PAD, ...wh(PILL) };
      case "bottom":
        return { x: Math.round((vp.width - PILL.w) / 2), y: vp.height - PILL.h - PAD, ...wh(PILL) };
    }
  }
  switch (edge) {
    case "left":
      return { x: PAD, y: PAD, w: SIDE_W, h: vp.height - PAD * 2 };
    case "right":
      return { x: vp.width - SIDE_W - PAD, y: PAD, w: SIDE_W, h: vp.height - PAD * 2 };
    case "top":
      return { x: PAD, y: PAD, w: vp.width - PAD * 2, h: STRIP_H };
    case "bottom":
      return { x: PAD, y: vp.height - STRIP_H - PAD, w: vp.width - PAD * 2, h: STRIP_H };
  }
}
function wh(s) {
  return { w: s.w, h: s.h };
}

// src/frontend/render.ts
init_game_ids();
init_protocol();
init_classifier_config();
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
var PHASE_ICON = { morning: "\uD83C\uDF05", afternoon: "☀️", evening: "\uD83C\uDF07", night: "\uD83C\uDF19" };
function pctTone(p) {
  return p >= 0.66 ? "good" : p >= 0.33 ? "warn" : "bad";
}
function allocLeft(h, pool, draft) {
  const sk = h.skills.find((x) => x.allocate?.pool === pool);
  if (!sk?.allocate)
    return 0;
  let left = sk.allocate.left;
  for (const x of h.skills)
    if (x.allocate?.pool === pool)
      left -= (draft[x.id] ?? 0) * x.allocate.cost;
  return left;
}
function renderAllocButtons(h, s, draft) {
  const al = s.allocate;
  if (!al)
    return "";
  const placed = draft[s.id] ?? 0;
  const canAdd = allocLeft(h, al.pool, draft) >= al.cost && placed < al.room;
  if (!placed && !canAdd)
    return "";
  return ` <span class="warp-alloc">${placed ? `<button class="warp-btn warp-btn-mini" data-alloc-sub="${esc(s.id)}" title="Take back a step" aria-label="Lower ${esc(s.label)}">−</button><b class="warp-tone-good">+${esc(placed * al.step)}</b>` : ""}${canAdd ? `<button class="warp-btn warp-btn-mini" data-alloc-add="${esc(s.id)}" title="${esc(`+${al.step} ${s.label} for ${al.cost} ${al.poolLabel}`)}" aria-label="Raise ${esc(s.label)}">+</button>` : ""}</span>`;
}
function renderAllocBar(h, draft, only) {
  const pools = [...new Map(h.skills.filter((x) => x.allocate && (!only || only.has(x.allocate.pool))).map((x) => [x.allocate.pool, x.allocate])).values()];
  const shown = pools.filter((p) => p.left > 0 || h.skills.some((x) => x.allocate?.pool === p.pool && draft[x.id]));
  if (!shown.length)
    return "";
  const placed = h.skills.some((x) => x.allocate && shown.some((p) => p.pool === x.allocate.pool) && (draft[x.id] ?? 0) > 0);
  return `<div class="warp-alloc-bar">${shown.map((p) => `<span>${esc(p.poolLabel)}: <b>${esc(allocLeft(h, p.pool, draft))}</b> to spend</span>`).join(" ")}${placed ? ` <button class="warp-btn warp-btn-primary warp-btn-mini" data-alloc-confirm>Spend</button> <button class="warp-btn warp-btn-mini" data-alloc-clear>Clear</button>` : ""}</div>`;
}
function renderHud(h, opts) {
  const { head, parts } = hudParts(h, opts);
  return head + parts.map((p) => renderPart(p)).join("");
}
var renderPart = (p, movable = false) => section(p.title, p.count, p.body, p.open, p.id, movable);
function hudParts(h, opts) {
  const top = [
    `<div class="warp-eyebrow"><span>${esc(h.rulesetName)}</span><span title="Turn">T${h.turn}</span></div>`,
    h.clock ? `<div class="warp-clock"><span class="warp-phase" aria-hidden="true">${PHASE_ICON[h.clock.phase] ?? ""}</span><span class="warp-clock-time">${esc(h.clock.time)}</span><span class="warp-clock-day">${esc(h.date ?? h.clock.day)}</span></div>` : "",
    h.weather ? `<div class="warp-weather">${esc(h.weather.icon)} ${esc(h.weather.label)} · <b>${esc(h.weather.temp)}°C</b>${h.weather.season ? ` · ${esc(h.weather.season)}` : ""}</div>` : "",
    h.location || h.money ? `<div class="warp-where">${h.location ? `<span title="${esc(h.location.desc ?? "")}">\uD83D\uDCCD <b>${esc(h.location.name)}</b></span>` : ""}${h.money ? `<span class="warp-money">${esc(h.money)}</span>` : ""}</div>` : "",
    h.conditions.length ? `<div class="warp-pills">${h.conditions.map((c) => `<span class="warp-pill warp-tone-${c.tone}" title="${esc(c.desc ?? "")}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("")}</div>` : ""
  ].join("");
  const bars = h.bars.map((b) => {
    const editing = opts.editing === b.id;
    return `<div class="warp-bar" data-bar="${esc(b.id)}" title="${esc(`${b.label}: ${b.display}${b.desc ? ` — ${b.desc}` : ""}
Click to adjust`)}">
      <div class="warp-bar-head"><span class="warp-bar-label">${esc(b.label)}</span><span class="warp-bar-text warp-tone-${b.tone}">${esc(b.text ?? b.display)}</span></div>
      <div class="warp-bar-track"><div class="warp-bar-fill warp-bg-${b.tone}" style="width:${(b.pct * 100).toFixed(1)}%${b.color ? `;background:${esc(b.color)}` : ""}"></div></div>
      ${editing ? (() => {
      const step = b.max - b.min > 200 ? 1 : b.max - b.min > 20 ? 0.5 : 0.1;
      const v = Math.round(b.value * 10) / 10;
      return `<div class="warp-bar-edit">
          <input type="range" min="${b.min}" max="${b.max}" step="${step}" value="${v}" data-range="${esc(b.id)}" aria-label="${esc(b.label)}">
          <input class="warp-input" type="number" min="${b.min}" max="${b.max}" step="${step}" value="${v}" data-num="${esc(b.id)}" aria-label="${esc(b.label)} value">
          <span class="warp-dim warp-of">/ ${esc(b.max)}</span>
          <button class="warp-btn warp-btn-primary" data-save="${esc(b.id)}">Set</button>
        </div>`;
    })() : ""}
    </div>`;
  }).join("");
  const skillRow = (s) => `
    <div class="warp-skill" title="${esc(`${s.label}: ${s.display}${s.text ? ` — ${s.text}` : ""}${s.practice !== null ? `
Practice toward the next point: ${Math.round(s.practice * 100)}% — it grows every time you use it` : ""}`)}">
      <span>${esc(s.label)}${renderAllocButtons(h, s, opts.alloc ?? {})}</span>
      <span class="warp-grade ${s.grade ? `warp-tone-${pctTone(s.pct)}` : s.text ? `warp-tone-${s.tone}` : ""}">${esc(s.grade ?? s.text ?? s.display)}</span>
      <div class="warp-skill-tracks">
        <div class="warp-mini-track"><div class="warp-mini-fill" style="width:${(s.pct * 100).toFixed(1)}%"></div></div>
        ${s.practice !== null ? `<div class="warp-practice-track"><div class="warp-practice-fill" style="width:${(s.practice * 100).toFixed(1)}%"></div></div>` : ""}
      </div>
    </div>`;
  const draft = opts.alloc ?? {};
  const skillGroups = [...new Set(h.skills.map((x) => x.group))];
  const pooled = new Set;
  const skillsBody = skillGroups.length < 2 ? renderAllocBar(h, draft) + h.skills.map(skillRow).join("") : skillGroups.map((g) => {
    const rows = h.skills.filter((x) => x.group === g);
    const mine = new Set(rows.flatMap((x) => x.allocate && !pooled.has(x.allocate.pool) ? [x.allocate.pool] : []));
    for (const p of mine)
      pooled.add(p);
    return `<div class="warp-group"><div class="warp-group-head">${esc(g)}</div>${mine.size ? renderAllocBar(h, draft, mine) : ""}${rows.map(skillRow).join("")}</div>`;
  }).join("");
  const skills = h.skills.length ? part("skills", "Skills & attributes", h.skills.length, skillsBody, !opts.compact || h.skills.some((x) => (x.allocate?.left ?? 0) > 0)) : null;
  const here = h.people.filter((p) => p.present);
  const away = h.people.filter((p) => !p.present);
  const personRow = (p) => `
    <div class="warp-person${p.present ? " warp-person-here" : ""}">
      <div class="warp-person-name">${esc(p.name)}${p.present ? ` <span class="warp-here">here</span>` : p.whereabouts ? ` <span class="warp-dim">· ${esc(p.whereabouts)}</span>` : ""}${opts.compact ? "" : ` <button class="warp-btn warp-btn-ghost warp-forget" data-forget="${esc(p.id)}" data-name="${esc(p.name)}" title="Stop tracking ${esc(p.name)}">Forget</button>`}</div>
      ${p.goal || p.bonds.length ? `<div class="warp-person-stats">${p.goal ? `<span>Wants: ${esc(p.goal)}</span>` : ""}${p.bonds.length ? `<span>${esc(p.bonds.join(", "))}</span>` : ""}</div>` : ""}
      ${p.conditions.length ? `<div class="warp-pills">${p.conditions.map((c) => `<span class="warp-pill warp-tone-${c.tone}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("")}</div>` : ""}
      ${p.memories.length ? `<details class="warp-memories"><summary>\uD83D\uDCAD Remembers · ${p.memories.length}</summary>${p.memories.map((m) => `<div class="warp-memory">${esc(m.text)}${m.when ? ` <span class="warp-dim">· ${esc(m.when)}</span>` : ""}</div>`).join("")}</details>` : ""}
      <div class="warp-person-stats">${p.stats.map((s) => `<span class="warp-rel" data-rel="${esc(`${p.id}:${s.id}`)}" title="${esc(`${s.label}: ${s.display} (${s.min}–${s.max}) — click to set`)}">${esc(s.label)}: <span class="warp-tone-${s.tone}">${esc(s.text ?? s.display)}</span></span>`).join("")}</div>
      ${p.stats.filter((s) => opts.editing === `rel:${p.id}:${s.id}`).map((s) => `<div class="warp-bar-edit">
        <span class="warp-dim">${esc(s.label)}</span>
        <input type="range" min="${s.min}" max="${s.max}" step="1" value="${Math.round(s.value)}" data-range="rel" aria-label="${esc(s.label)}">
        <input class="warp-input" type="number" min="${s.min}" max="${s.max}" value="${Math.round(s.value)}" data-num="rel" aria-label="${esc(s.label)} value">
        <button class="warp-btn warp-btn-primary" data-save-rel="${esc(`${p.id}:${s.id}`)}">Set</button>
      </div>`).join("")}
    </div>`;
  const people = part("people", here.length ? "People here" : "People", here.length, h.people.length ? `${here.length ? here.map(personRow).join("") : `<div class="warp-empty">No one you know is here.</div>`}${away.length ? `<details class="warp-away" data-section="people-away"><summary>Elsewhere · ${away.length}</summary><div class="warp-section-body">${away.map(personRow).join("")}</div></details>` : ""}` : `<div class="warp-empty">No one yet.</div>`, !opts.compact || here.length > 0);
  const body = h.body ? part("body", "Body", 0, `${h.body.map((b) => `<div class="warp-item"><span>${esc(b.label)}</span><span class="${b.covered ? "warp-dim" : ""}" title="${b.covered ? "Covered by clothing" : "Visible"}">${esc(b.text)}${b.covered ? " \uD83D\uDC55" : ""}</span></div>`).join("")}${h.transforms.map((t) => `<div class="warp-item"><span>✦ ${esc(t.label)}</span><span class="warp-dim">stage ${t.stage} / ${t.of}</span></div>`).join("")}`, false) : null;
  const dues = h.dues.length ? part("bills", "Bills", h.dues.filter((d) => d.tone === "bad").length, h.dues.map((d) => `<div class="warp-item"><span>${esc(d.label)}${d.owed > 0 ? ` <span class="warp-dim">${esc(d.owedText ?? d.owed)}</span>` : ""}</span><span class="warp-tone-${d.tone}">${esc(d.text)}</span></div>`).join(""), !opts.compact || h.dues.some((d) => d.tone === "bad")) : null;
  const family = h.family.length ? part("family", "Family", h.family.length, h.family.map((f) => `<div class="warp-item"><span>${esc(f.name)}</span><span class="warp-dim">${esc(f.text)}</span></div>`).join(""), !opts.compact) : null;
  const loose = h.items.filter((i) => !i.worn);
  const items = part("inventory", "Inventory", loose.length, loose.length ? loose.map((i) => `<div class="warp-item${i.use ? " warp-item-usable" : ""}">
        <span class="warp-item-name">${esc(i.name)}${i.uses ? ` <span class="warp-dim" title="Uses left in the one in hand">· ${esc(i.uses)}</span>` : ""}${i.bonus ? `<span class="warp-item-bonus" title="Gear: added to checks that use it">${esc(i.bonus)}</span>` : ""}</span>
        <span class="warp-item-side">${i.count > 1 ? `<span class="warp-kbd">×${i.count}</span>` : ""}${i.use ? i.use.locked ? `<button class="warp-btn warp-mini" disabled title="${esc(i.use.locked)}">\uD83D\uDD12 Use</button>` : `<button class="warp-btn warp-mini" data-use="${esc(i.use.id)}" title="${esc(`${i.use.label}${i.use.drafted ? `
Warp drafted what this does from its description — check it in the Ruleset tab` : ""}`)}">${i.use.drafted ? "✎ " : ""}Use</button>` : ""}</span>
      </div>`).join("") : `<div class="warp-empty">Empty-handed.</div>`, !opts.compact);
  const map = opts.map ? part("map", "Map", 0, renderMapView(opts.map), !opts.compact) : null;
  return {
    head: `${renderEncounter(h)}<div class="warp-hud-top">${top}</div>${renderWarmth(h)}<div class="warp-bars">${bars}</div>`,
    parts: [renderOutfit(h, opts.compact), skills, renderAbilities(h, opts.compact), renderQuests(h, opts.compact), dues, people, map, family, body, items, renderPerks(h, opts.compact)].filter((p) => !!p)
  };
}
function renderEncounter(h) {
  const e = h.encounter;
  if (!e)
    return "";
  return `<div class="warp-encounter">
    <div class="warp-eyebrow"><span>⚔ ${esc(e.name)}</span><span>Round ${e.round + 1}</span></div>
    <div class="warp-encounter-foe">${esc(e.foe)}${foeTags(e)}</div>
    ${e.momentum !== null ? `<div class="warp-bar-head"><span>You</span><span class="warp-dim">Momentum</span><span>${esc(e.foe)}</span></div>
      <div class="warp-momentum" title="Momentum ${Math.round(e.momentum)} — a full swing either way ends the fight"><div class="warp-momentum-mid"></div><div class="warp-momentum-mark" style="left:${((100 - e.momentum) / 2).toFixed(1)}%"></div></div>` : ""}
    ${e.stats.map((s) => `<div class="warp-bar-head"><span>${esc(s.label)}</span><span class="warp-dim">${esc(Math.round(s.value))} / ${esc(s.max)}</span></div>
      <div class="warp-bar-track"><div class="warp-bar-fill warp-bg-${s.tone}" style="width:${(s.pct * 100).toFixed(1)}%"></div></div>`).join("")}
  </div>`;
}
function foeTags(e) {
  const flip = (t) => t === "bad" ? "good" : t === "good" ? "bad" : t;
  const tags = [
    ...e.foeConds.map((c) => `<span class="warp-pill warp-tone-${flip(c.tone)}" title="${esc(c.desc ?? c.label)}">${esc(c.label)}${c.rounds ? ` · ${c.rounds}` : ""}</span>`),
    ...e.foeArmor ? [`<span class="warp-pill" title="Their armor: each blow to them is ${e.foeArmor} smaller — piercing moves ignore it">\uD83D\uDEE1 ${esc(e.foeArmor)}</span>`] : [],
    ...e.yourArmor ? [`<span class="warp-pill warp-tone-good" title="Your armor: each of their blows is ${e.yourArmor} smaller">You \uD83D\uDEE1 ${esc(e.yourArmor)}</span>`] : []
  ];
  return tags.length ? ` <span class="warp-foe-tags">${tags.join("")}</span>` : "";
}
function renderWarmth(h) {
  const w = h.warmth;
  if (!w)
    return "";
  const scale = Math.max(30, w.max + 6, w.value + 4);
  const at = (v) => `${Math.max(0, Math.min(100, v / scale * 100)).toFixed(1)}%`;
  return `<div class="warp-warmth" title="${esc(`Clothing warmth ${w.value} · comfortable between ${w.min} and ${w.max}`)}">
    <div class="warp-bar-head"><span class="warp-bar-label">Warmth</span><span class="warp-bar-text warp-tone-${w.tone}">${esc(w.text)}</span></div>
    <div class="warp-warmth-track">
      <div class="warp-warmth-band" style="left:${at(w.min)};width:calc(${at(w.max)} - ${at(w.min)})"></div>
      <div class="warp-warmth-mark warp-bg-${w.tone}" style="left:${at(w.value)}"></div>
    </div>
  </div>`;
}
var part = (id, title, count, body, open) => ({ id, title, count, body, open });
function renderOutfit(h, compact) {
  if (!h.outfit)
    return null;
  const rows = h.outfit.map((o) => {
    const options = h.clothing.filter((c) => c.slot === o.slot && c.id !== o.item?.id);
    const status = o.item ? `${esc(o.item.name)}${o.item.integrity !== null ? ` <span class="warp-tone-${o.item.integrity < 40 ? "bad" : "warn"}">${o.item.integrity}%</span>` : ""}` : `<span class="warp-dim">${h.exposed.includes(o.slot) ? "<span class='warp-tone-bad'>nothing</span>" : "—"}</span>`;
    const picker = options.length || o.item ? `<select class="warp-select warp-mini-select" data-wear-slot="${esc(o.slot)}" aria-label="Change ${esc(o.label)}">
          <option value="" selected disabled>Change…</option>
          ${options.map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (warmth ${esc(c.warmth)}${c.traits.length ? `, ${esc(c.traits.join(", "))}` : ""})</option>`).join("")}
          ${o.item ? `<option value="__off">Take off</option>` : ""}
        </select>` : "";
    return `<div class="warp-outfit-row"><span class="warp-dim">${esc(o.label)}</span><span>${status}</span>${picker}</div>`;
  }).join("");
  const worn = h.outfit.filter((o) => o.item).length;
  return part("outfit", "Outfit", worn, rows, !compact);
}
function perkCard(p, take) {
  return `<div class="warp-perk${p.owned ? " warp-perk-owned" : ""}${p.offered ? " warp-perk-offer" : ""}">
      <div class="warp-perk-text"><b>${esc(p.name)}</b>${p.desc ? ` <span class="warp-dim">${esc(p.desc)}</span>` : ""}
        ${p.notes.length ? `<div class="warp-perk-notes">${p.notes.map((n) => `<span>${esc(n)}</span>`).join("")}</div>` : ""}
        ${p.drawback ? `<div class="warp-perk-drawback">⚠ ${esc(p.drawback)}</div>` : ""}
      </div>
      ${p.owned ? `<span class="warp-tone-good" aria-label="taken">✓</span>` : take && !p.blocker ? `<button class="warp-btn warp-mini${p.offered ? " warp-btn-primary" : ""}" data-buy-perk="${esc(p.id)}">${p.offered ? "Choose" : `Take · ${esc(p.cost)} ${esc(p.pointsLabel ?? "pt")}`}</button>` : `<span class="warp-dim" title="${esc(p.blocker ?? "")}">${esc(p.cost)} ${esc(p.pointsLabel ?? "pt")}</span>`}
    </div>`;
}
function renderPerks(h, compact) {
  if (!h.perks.length)
    return null;
  const offer = h.perks.filter((p) => p.offered && !p.owned);
  const owned = h.perks.filter((p) => p.owned);
  const rest = h.perks.filter((p) => !p.owned && !p.offered);
  const open = h.perkPick ? owned : [...owned, ...rest.filter((p) => !p.locked)];
  const later = h.perkPick ? [] : rest.filter((p) => p.locked);
  const grouped = (list, card) => {
    const gs = [...new Set(list.map((p) => p.group ?? ""))];
    if (gs.length < 2 && !gs[0])
      return list.map(card).join("");
    return gs.map((g) => `${g ? `<div class="warp-group-head">${esc(g)}</div>` : ""}${list.filter((p) => (p.group ?? "") === g).map(card).join("")}`).join("");
  };
  const laterRow = (p) => `<div class="warp-perk-later" title="${esc(p.desc)}"><b>${esc(p.name)}</b> <span class="warp-dim">${esc(p.needs ? `Needs ${p.needs}` : "Not yet")}</span></div>`;
  const pick = offer.length ? `<div class="warp-perk-pick"><div class="warp-perk-pick-head">✦ Pick ${h.perkPick > 1 ? "one" : "it"}</div>${offer.map((p) => perkCard(p, true)).join("")}</div>` : "";
  const folded = later.length ? `<details class="warp-away"><summary>Not yet · ${later.length}</summary><div class="warp-section-body">${grouped(later, laterRow)}</div></details>` : "";
  const body = `${pick}${grouped(open, (p) => perkCard(p, !p.owned))}${folded}${!pick && !owned.length && h.perkPick ? `<div class="warp-empty">Earn a point to choose your first perk.</div>` : ""}`;
  const label = h.perkPoints !== null ? `Perks · ${h.perkPoints} point${h.perkPoints === 1 ? "" : "s"}` : "Perks";
  return part("perks", label, offer.length, body, !compact && ((h.perkPoints ?? 0) > 0 || offer.length > 0));
}
function questCard(q) {
  const mark = q.status === "done" ? "✅" : q.status === "failed" ? "✗" : q.status === "ready" ? "\uD83D\uDCDC" : q.status === "offered" ? "❔" : "\uD83D\uDCDC";
  const goals = q.goals.length && q.status !== "done" && q.status !== "failed" ? `<ul class="warp-quest-goals">${q.goals.map((g) => `<li class="${g.done ? "done" : ""}${g.optional ? " optional" : ""}">${g.done ? "✓" : "☐"} ${esc(g.text)}${g.progress ? ` <span class="warp-dim">${esc(g.progress)}</span>` : ""}${g.optional ? ` <span class="warp-dim">(optional)</span>` : ""}</li>`).join("")}</ul>` : "";
  const buttons = [
    q.take ? `<button class="warp-btn warp-mini warp-btn-primary" data-use="${esc(q.take)}">Take it on</button>` : "",
    q.report ? `<button class="warp-btn warp-mini warp-btn-primary" data-use="${esc(q.report)}">Hand in</button>` : "",
    q.status === "ready" && !q.report ? `<span class="warp-dim">${q.giver ? `Find ${esc(q.giver)} to hand it in` : "Hand it in at the board"}</span>` : "",
    q.drop ? `<button class="warp-btn warp-mini warp-btn-ghost" data-confirm-use="${esc(q.drop)}" title="Giving up counts as failing">Give up</button>` : ""
  ].filter(Boolean).join("");
  return `<div class="warp-quest warp-quest-${q.status}">
    <div class="warp-quest-head"><span>${mark} <b>${esc(q.name)}</b>${q.kind && q.kind !== "quest" ? ` <span class="warp-quest-kind">${esc(q.kind)}</span>` : ""}${q.story ? ` <span class="warp-quest-kind" title="Asked of you in the story; the story decides when it's done">story</span>` : ""}</span>${q.due ? `<span class="warp-tone-${q.dueTone}">${esc(q.due)}</span>` : ""}</div>
    ${q.giver || q.from || q.desc ? `<div class="warp-dim">${q.from && q.status === "offered" ? `${esc(q.from)}${q.desc ? " · " : ""}` : q.giver ? `For ${esc(q.giver)}${q.desc ? " · " : ""}` : ""}${esc(q.desc ?? "")}</div>` : ""}
    ${goals}
    ${q.reward && q.status !== "failed" ? `<div class="warp-quest-reward">${q.status === "done" ? "Earned" : "Reward"}: ${esc(q.reward)}</div>` : ""}
    ${q.stakes && q.status !== "done" ? `<div class="warp-quest-stakes">⚠ ${esc(q.stakes)}</div>` : ""}
    ${buttons ? `<div class="warp-row warp-quest-actions">${buttons}</div>` : ""}
  </div>`;
}
function renderQuests(h, compact) {
  if (!h.quests.length)
    return null;
  const offered = h.quests.filter((q) => q.status === "offered");
  const open = h.quests.filter((q) => q.status === "active" || q.status === "ready").sort((a, b) => Number(b.status === "ready") - Number(a.status === "ready"));
  const ended = h.quests.filter((q) => q.status === "done" || q.status === "failed");
  const body = [
    open.map(questCard).join(""),
    offered.length ? `<div class="warp-choice-group-label">On offer here</div>${offered.map(questCard).join("")}` : "",
    !open.length && !offered.length ? `<div class="warp-empty">No quests under way. Look for a notice board, or people who need a hand.</div>` : "",
    ended.length ? `<details class="warp-away" data-section="quests-ended"><summary>Finished · ${ended.length}</summary><div class="warp-section-body">${ended.map(questCard).join("")}</div></details>` : ""
  ].join("");
  return part("quests", "Quests", open.length, body, !compact || open.some((q) => q.status === "ready") || offered.length > 0);
}
function renderAbilities(h, compact) {
  if (!h.abilities.length)
    return null;
  const rows = h.abilities.map((a) => `<div class="warp-item warp-item-usable warp-ability">
      <span class="warp-item-name" title="${esc(a.desc ?? "")}">✦ ${esc(a.name)}${a.cost ? ` <span class="warp-dim">· ${esc(a.cost)}</span>` : ""}${a.left !== null ? ` <span class="warp-dim">· ${esc(a.left)} left</span>` : ""}</span>
      <span class="warp-item-side">${a.locked ? `<button class="warp-btn warp-mini" disabled title="${esc(a.locked)}">\uD83D\uDD12 Use</button>` : `<button class="warp-btn warp-mini" data-use="${esc(a.choice)}" title="${esc(a.desc ?? a.name)}">Use</button>`}</span>
    </div>`).join("");
  return part("abilities", "Abilities", h.abilities.filter((a) => !a.locked).length, rows, !compact);
}
function renderMapView(m) {
  if (!m.nodes.length)
    return `<div class="warp-empty">No places yet.</div>`;
  const xs = m.nodes.map((n) => n.x), ys = m.nodes.map((n) => n.y);
  const pad = 70;
  const minX = Math.min(...xs) - pad, minY = Math.min(...ys) - pad;
  const w = Math.max(...xs) - minX + pad, hgt = Math.max(...ys) - minY + pad;
  const byId = new Map(m.nodes.map((n) => [n.id, n]));
  const edges = m.edges.map(([a, b]) => {
    const p = byId.get(a), q = byId.get(b);
    return p && q ? `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="warp-map-edge" />` : "";
  }).join("");
  const nodes = m.nodes.map((n) => `
    <g class="warp-map-node${n.here ? " here" : ""}${n.reachable ? " reachable" : ""}${n.locked ? " locked" : ""}" ${n.reachable ? `data-go="${esc(n.id)}" tabindex="0" role="button" aria-label="Go to ${esc(n.name)}"` : ""}>
      <title>${esc(n.reachable ? `Go to ${n.name}` : n.locked ? `${n.name} — \uD83D\uDD12 ${n.locked}` : n.name)}</title>
      <circle cx="${n.x}" cy="${n.y}" r="${n.here ? 13 : 10}" />
      <text x="${n.x}" y="${n.y + 26}" text-anchor="middle">${n.locked ? "\uD83D\uDD12 " : ""}${esc(n.name)}</text>
      ${n.people.length ? `<text x="${n.x}" y="${n.y + 40}" text-anchor="middle" class="warp-map-people">${esc(n.people.join(", "))}</text>` : ""}
      ${n.indoors ? `<text x="${n.x}" y="${n.y + 4}" text-anchor="middle" class="warp-map-icon">⌂</text>` : ""}
    </g>`).join("");
  const here = m.nodes.find((n) => n.here);
  const base = `${minX} ${minY} ${w} ${hgt}`;
  return `<div class="warp-map-view" data-map="${esc(base)}"${here ? ` data-map-here="${here.x} ${here.y}"` : ""}>
    <svg class="warp-map" viewBox="${base}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map">${edges}${nodes}</svg>
    <div class="warp-map-tools">
      <button class="warp-map-tool" type="button" data-map-zoom="in" title="Zoom in" aria-label="Zoom in">+</button>
      <button class="warp-map-tool" type="button" data-map-zoom="out" title="Zoom out" aria-label="Zoom out">−</button>
      <button class="warp-map-tool" type="button" data-map-zoom="here" title="Centre on where you are" aria-label="Centre on where you are">◎</button>
    </div>
  </div>
  <p class="warp-dim warp-map-hint">Scroll to zoom, drag to look around. Click a lit place next to you to go there.</p>`;
}
function renderJournal(h, records) {
  if (!h)
    return `<div class="warp-card"><p>No game running in this chat.</p></div>`;
  const byCat = new Map;
  for (const c of h.codex)
    byCat.set(c.category ?? "Notes", [...byCat.get(c.category ?? "Notes") ?? [], c]);
  const codex = h.codexTotal ? `<div class="warp-card"><h3>Codex <span class="warp-dim">${h.codex.length} / ${h.codexTotal}</span></h3>
        ${h.codex.length ? [...byCat].map(([cat, list]) => `<div class="warp-choice-group-label">${esc(cat)}</div>${list.map((c) => `<details class="warp-codex"><summary>${esc(c.title)}</summary><p>${esc(c.text)}</p></details>`).join("")}`).join("") : `<p>Nothing discovered yet.</p>`}
      </div>` : "";
  const feats = h.feats.length ? `<div class="warp-card"><h3>Feats <span class="warp-dim">${h.feats.filter((f) => f.unlocked).length} / ${h.feats.length}</span></h3>
        ${h.feats.map((f) => `<div class="warp-feat${f.unlocked ? " unlocked" : ""}"><span>${f.unlocked ? "\uD83C\uDFC6" : "\uD83D\uDD12"}</span><div><b>${esc(f.name)}</b><div class="warp-dim">${esc(f.desc)}</div></div></div>`).join("")}
      </div>` : "";
  const news = h.news.length ? `<div class="warp-card"><h3>News</h3>
        ${h.news.map((n) => `<div class="warp-news-row">${n.when ? `<span class="warp-dim">${esc(n.when)}</span>` : ""}<span>${esc(n.text)}</span></div>`).join("")}
      </div>` : "";
  const turns = records.filter((r) => r.action || r.check || r.changes.length).slice().reverse().slice(0, 40);
  const timeline = `<div class="warp-card"><h3>Timeline</h3>
    ${turns.length ? turns.map((r) => `<button class="warp-timeline-row" data-jump="${esc(r.messageId)}" title="Jump to this message">
        <span class="warp-dim">${esc(r.clock ?? "")}</span>
        <span>${r.action ? esc(r.action) : "<span class='warp-dim'>Story</span>"}${r.check ? ` · <span class="warp-tone-${r.check.tier.includes("success") ? "good" : r.check.tier === "partial" ? "warn" : "bad"}">${esc(r.check.tierLabel)}</span>` : ""}</span>
        <span class="warp-dim warp-timeline-changes">${esc(r.changes.slice(0, 4).map((c) => c.text).join(" · "))}</span>
      </button>`).join("") : `<p>Nothing has happened yet.</p>`}
  </div>`;
  return checkpoints(h) + news + codex + feats + timeline;
}
function checkpoints(h) {
  const run = h.run;
  if (!run)
    return "";
  const ended = run.ended ? `<div class="warp-run-end warp-tone-${run.ended.kind === "good" ? "good" : run.ended.kind === "bad" ? "bad" : "neutral"}"><b>The end: ${esc(run.ended.title)}</b>${run.ended.text ? `<div class="warp-dim">${esc(run.ended.text)}</div>` : ""}</div>` : "";
  const row = (id, name, label, canSave) => `<div class="warp-run-slot">
      <span class="warp-run-slot-name">${esc(name)}</span>
      <span class="warp-run-slot-label${label ? "" : " warp-dim"}">${esc(label ?? "Empty")}</span>
      ${label ? `<button class="warp-btn warp-mini" data-run="run:load:${esc(id)}">Load</button>` : ""}
      ${canSave ? `<button class="warp-btn warp-mini" data-run="run:save:${esc(id)}">${label ? "Overwrite" : "Save"}</button>` : ""}
    </div>`;
  return `<div class="warp-card"><h3>Checkpoints <span class="warp-dim">${run.runs > 1 ? `playthrough ${run.runs}` : ""}${run.loops ? ` · rewound ${run.loops}×` : ""}</span></h3>
    ${ended}
    ${run.slots.map((sl) => row(sl.id, `Slot ${sl.id}`, sl.label, !run.ended)).join("")}
    ${run.auto ? row("auto", "Auto", run.auto, false) : ""}
    <div class="warp-row">
      <button class="warp-btn warp-mini" data-run="run:load:start">Rewind to the start</button>
      <button class="warp-btn warp-mini" data-run="run:restart">Start a new playthrough</button>
      ${run.ended && !run.hard ? `<button class="warp-btn warp-mini" data-run="run:continue">Keep playing</button>` : ""}
    </div>
    <p class="warp-dim">Loading keeps: ${esc(run.keeps)}. A new playthrough carries over: ${esc(run.legacy)}.</p>
  </div>`;
}
function section(title, count, body, open, key = title, movable = false) {
  return `<details class="warp-section" data-section="${esc(key)}"${open ? " open" : ""}><summary${movable ? ` data-part="${esc(key)}" title="Hold and drag out to give it a window of its own"` : ""}><span>${esc(title)}${count ? ` · ${count}` : ""}</span></summary><div class="warp-section-body">${body}</div></details>`;
}
function renderChoices(choices, opts) {
  if (!choices.length && !opts.busy && !opts.encounter)
    return "";
  const groups = new Map;
  choices.forEach((c, i) => {
    const g = c.group ?? "Actions";
    if (!groups.has(g))
      groups.set(g, []);
    groups.get(g).push({ c, n: i + 1 });
  });
  const body = [...groups].map(([g, list]) => `
    <div class="warp-choice-group">
      ${groups.size > 1 ? `<div class="warp-choice-group-label">${esc(g)}</div>` : ""}
      <div class="warp-choice-grid">${list.map(({ c, n }) => {
    const key = opts.hotkeys && n <= 10 ? `<span class="warp-kbd">${n === 10 ? 0 : n}</span>` : "";
    const odds = opts.showOdds && c.odds !== null ? `<span class="warp-choice-odds warp-tone-${pctTone(c.odds + (c.partialOdds ?? 0) / 2)}" title="${esc(`${c.checkLabel ?? "Check"}: ${Math.round(c.odds * 100)}% success${c.partialOdds ? `, ${Math.round(c.partialOdds * 100)}% partial` : ""}`)}">${Math.round(c.odds * 100)}%</span>` : "";
    const resistance = c.params.find((p) => p.id === "mind_resist");
    const resistButtons = resistance ? resistance.options.filter((id) => id !== "none").map((id) => `<button type="button" class="warp-choice" data-resist-action="${esc(c.id)}" data-resist-id="${esc(id)}" title="${esc(c.desc ?? "Explicitly resist this override if it triggers")}" ${opts.busy ? "disabled" : ""}>Resist ${esc(id)}: ${esc(c.label)}</button>`).join("") : "";
    const forecastText = c.forecast ? `Goal: ${c.forecast.goal}
Possible risk: ${c.forecast.risk}
Possible payoff: ${c.forecast.payoff}
Story forecast only — not guaranteed effects; tag-defined mechanics and odds are unchanged.` : null;
    const forecast = forecastText ? `<span class="warp-choice-why">${esc(forecastText)}</span>` : "";
    const tip = [forecastText, c.desc, c.why ? `Why now: ${c.why}` : null, c.checkLabel ? `Check: ${c.checkLabel} — the chance of this check, not of winning` : null, c.veiled ? "Veiled: happens off-screen" : null].filter(Boolean).join(`
`);
    if (c.locked)
      return `<button class="warp-choice warp-choice-locked" disabled title="${esc(`${c.desc ?? c.label}
Locked: ${c.locked}`)}"><span class="warp-choice-label">${esc(c.label)}<span class="warp-choice-why">\uD83D\uDD12 ${esc(c.locked)}</span></span></button>`;
    return `<button class="warp-choice${c.id.startsWith("item:") ? " warp-choice-item" : ""}" data-act="${esc(c.id)}" title="${esc(tip)}${c.ready ? `
Ready — this reply is already written` : ""}">${key}<span class="warp-choice-label">${esc(c.label)}${forecast}${c.why ? `<span class="warp-choice-why">${esc(c.why)}</span>` : ""}</span>${c.ready ? `<span class="warp-choice-ready" aria-label="instant">⚡</span>` : ""}${c.veiled ? `<span class="warp-choice-veil" aria-label="veiled">◐</span>` : ""}${odds}</button>${resistButtons}${opts.minigames !== "off" && (c.game || c.gamble) ? `<button type="button" class="warp-choice warp-choice-game" data-play-challenge="${esc(c.id)}" aria-label="${esc(`${c.gamble ? "Play table" : "Play challenge"}: ${GAMES[(c.game ?? c.gamble).game].name} for ${c.label}${c.gamble ? " — wagers use in-game money" : " instead of rolling"}`)}" ${opts.busy ? "disabled" : ""}>${GAMES[(c.game ?? c.gamble).game].icon} ${c.gamble ? "Play table" : "Play challenge"}: ${esc(GAMES[(c.game ?? c.gamble).game].name)}</button>` : ""}`;
  }).join("")}</div>
    </div>`).join("");
  const status = opts.busy ? `<div class="warp-status-line"><span class="warp-spinner"></span>${esc(opts.busyLabel ?? "The story continues…")}</div>` : "";
  return `${status}${opts.encounter ? renderEncounterGuide(opts.encounter, opts.busy, opts.recap) : ""}${body}`;
}
function renderEncounterGuide(e, busy, recap) {
  const meters = e.progress.map((p) => {
    const span = Math.abs(p.max - p.target) || 1;
    const done = Math.max(0, Math.min(1, 1 - Math.abs(p.value - p.target) / span));
    return `<div class="warp-enc-meter" title="${esc(`${p.label}: ${Math.round(p.value)} — get it to ${p.target} (the bar is how close you are)`)}"><span>${esc(p.label)}</span><div class="warp-bar-track"><div class="warp-bar-fill warp-bg-good" style="width:${(done * 100).toFixed(1)}%"></div></div><span class="warp-dim">${esc(Math.round(p.value))} → ${esc(p.target)}</span></div>`;
  });
  if (e.momentum !== null)
    meters.push(`<div class="warp-enc-meter" title="Momentum: a full swing either way ends it"><span>Momentum</span><div class="warp-momentum"><div class="warp-momentum-mid"></div><div class="warp-momentum-mark" style="left:${((e.momentum + 100) / 2).toFixed(1)}%"></div></div><span class="warp-dim">${e.momentum > 0 ? "+" : ""}${esc(Math.round(e.momentum))}</span></div>`);
  const danger = e.danger.slice(0, 2).map((d) => `<span class="warp-tone-${d.close ? "bad" : "warn"}">${esc(d.text)}</span>`).join(`<span class="warp-dim"> · </span>`);
  const last = recap?.rounds[recap.rounds.length - 1];
  return `<div class="warp-enc-guide" role="group" aria-label="${esc(e.name)}">
    <div class="warp-enc-head"><span>⚔ ${esc(e.name)} <span class="warp-dim">vs ${esc(e.foe)}</span>${foeTags(e)}</span><span class="warp-dim">Round ${e.round + 1}</span></div>
    ${e.goal ? `<div class="warp-enc-goal"><b>Goal</b> ${esc(e.goal)}</div>` : ""}
    ${meters.length ? `<div class="warp-enc-meters">${meters.join("")}</div>` : ""}
    ${danger ? `<div class="warp-enc-danger"${e.dangerText ? ` title="${esc(e.dangerText)}"` : ""}><b>Danger</b> ${danger}</div>` : ""}
    ${last && recap ? `<div class="warp-enc-last"><div class="warp-enc-last-head"><b>Last round</b>${recap.rounds.length > 1 ? roundsList(recap.rounds, recap.foe) : ""}${recap.why}</div>${renderRoundCard(last, recap.foe, true)}</div>` : ""}
    ${e.quiet ? `<div class="warp-enc-say"><input type="text" class="warp-input" data-enc-say placeholder="Or try something else…" aria-label="Try something else" maxlength="400"${busy ? " disabled" : ""}><button class="warp-btn" data-enc-send${busy ? " disabled" : ""}>Try</button></div>` : ""}
  </div>`;
}
var TIER_MARK = { "great success": "✓✓", success: "✓", partial: "~", failed: "✕", "badly failed": "✕✕" };
function roundChange(c) {
  const d = Math.round(c.to - c.from);
  if (!d)
    return "";
  const i = c.label.indexOf(": ");
  const label = i > 0 ? `⚔ ${c.label.slice(i + 2)}` : c.label;
  return `<span class="warp-tone-${c.good ? "good" : "bad"}">${esc(label)} ${d > 0 ? "+" : "−"}${Math.abs(d)}</span>`;
}
function renderRoundCard(c, foe = "", latest = false) {
  const tone = !c.check ? "neutral" : /success/.test(c.check.tier) ? "good" : c.check.tier === "partial" ? "warn" : "bad";
  const chance = c.check && c.check.odds !== null ? `${Math.round(c.check.odds * 100)}%` : "";
  const tip = c.check ? `${c.check.label}${chance ? `: ${chance} chance this check succeeds (not the chance of winning)` : ""}${c.check.gear.length ? `
Helped by ${c.check.gear.join(", ")}` : ""}` : "";
  const tier = c.check?.tier ?? "";
  const changes = c.changes.map(roundChange).filter(Boolean);
  return `<div class="warp-round${latest ? " warp-round-latest" : ""}">
    <div class="warp-round-line"><span class="warp-round-n">${c.round}</span><b>${esc(c.move)}</b>${c.check ? ` <span class="warp-tone-${tone}" title="${esc(tip)}">${esc(TIER_MARK[tier] ?? "")} ${esc(tier.charAt(0).toUpperCase() + tier.slice(1))}</span>${chance ? ` <span class="warp-dim" title="${esc(tip)}">${esc(c.check.label)} ${chance}</span>` : ""}${c.check.gear.length ? ` <span class="warp-dim" title="${esc(c.check.gear.join(", "))}">\uD83D\uDEE0</span>` : ""}` : ""}</div>
    ${c.foe ? `<div class="warp-round-foe"><span class="warp-dim">${esc(foe || "They")}:</span> ${esc(c.foe)}</div>` : ""}
    ${changes.length ? `<div class="warp-round-changes">${changes.join("")}</div>` : ""}
    ${c.ended ? `<div class="warp-round-end warp-tone-${c.ended.loss ? "bad" : "good"}">${c.ended.loss ? "✕" : "✓"} ${esc(c.ended.label)}</div>` : ""}
  </div>`;
}
function roundsList(rounds, foe) {
  return `<details class="warp-rounds"><summary>${rounds.length === 1 ? "Show the round" : `All ${rounds.length} rounds`}</summary><div class="warp-rounds-list">${rounds.map((r) => renderRoundCard(r, foe)).join("")}</div></details>`;
}
function renderWhyFold(rec) {
  const whys = (rec?.changes ?? []).filter((ch) => ch.why?.length).map((ch) => `<div><b>${esc(ch.text)}</b> <span class="warp-dim">←</span> ${ch.why.map(esc).join(" · ")}</div>`);
  return whys.length ? `<details class="warp-enc-why"><summary title="Show what caused each change">Why?</summary><div class="warp-enc-why-body">${whys.join("")}</div></details>` : "";
}
function renderEncounterLog(v, why = "") {
  const mine = v.rounds.slice(v.from);
  if (!mine.length && v.status !== "ended")
    return "";
  const last = mine[mine.length - 1];
  const head = v.status === "ended" && v.ended ? `<div class="warp-round-final warp-tone-${v.ended.loss ? "bad" : "good"}"><b>⚔ ${esc(v.name)}: ${esc(v.ended.label)}</b> <span class="warp-dim">after ${v.rounds.length} round${v.rounds.length === 1 ? "" : "s"}</span></div>` : last ? renderRoundCard(last, v.foe, true) : "";
  const more = v.rounds.length > 1 || v.status === "ended" && v.rounds.length ? roundsList(v.rounds, v.foe) : "";
  return `<div class="warp-enc-log">${head}${more || why ? `<div class="warp-enc-log-foot">${more}${why}</div>` : ""}</div>`;
}
var TIER_TONE = { crit_success: "good", success: "good", partial: "warn", fail: "bad", crit_fail: "bad" };
function renderChips(rec, opts) {
  const out = [];
  const read = rec.via === "adjudicator" ? `<span class="warp-dim">· read from your message${rec.confidence !== null ? ` (${Math.round(rec.confidence * 100)}% sure)` : ""}</span>` : rec.via === "confirmed" ? `<span class="warp-dim">· you confirmed</span>` : "";
  const notAction = rec.redoFrom ? `<button class="warp-btn warp-btn-ghost" data-redo="${esc(rec.redoFrom)}" data-redo-action="" title="Redo this turn without a roll">Not an action?</button>` : "";
  if (rec.check?.game && opts.showDice) {
    const c = rec.check;
    out.push(`<span class="warp-chip warp-tone-${TIER_TONE[c.tier]}" title="${esc(`Played instead of rolled: ${c.game.summary}`)}">${esc(c.game.summary.split(" ")[0])} ${esc(c.label)} · ${esc(c.tierLabel)} <span class="warp-dim">${Math.round(c.game.score * 100)}% / ${Math.round(c.game.needed * 100)}%</span></span>`);
    if (read || notAction)
      out.push(`<span class="warp-chip">${read}${notAction}</span>`);
  } else if (rec.check && opts.showDice) {
    const c = rec.check;
    out.push(`<button class="warp-chip warp-dice warp-tone-${TIER_TONE[c.tier]}" data-dice title="Show the roll">\uD83C\uDFB2 ${esc(c.label)} · ${esc(c.tierLabel)}</button>`);
    out.push(`<div class="warp-dice-detail">${c.faces.map((f) => `<span class="warp-die" title="d${f.sides}"${f.kept ? "" : " data-dropped"}>${f.value}</span>`).join("")}<span>${esc(c.summary)}</span>${read}${notAction}</div>`);
  } else if (rec.action && opts.showDice) {
    out.push(`<span class="warp-chip">▸ ${esc(rec.action)}</span>${notAction ? `<span class="warp-chip">${notAction}</span>` : ""}`);
  }
  if (rec.gamble)
    out.push(`<span class="warp-chip warp-tone-${rec.gamble.net > 0 ? "good" : rec.gamble.net < 0 ? "bad" : "neutral"}">${esc(rec.gamble.text)}</span>`);
  for (const d of rec.decisions) {
    const odds = d.odds.map((o) => `${o.desc} ${Math.round(o.p * 100)}%`).join(" · ");
    out.push(`<span class="warp-chip warp-decision" title="${esc(`${d.ask}
${odds}
${d.source === "model" ? "Odds from the decision model; the engine rolled." : "Odds from the ruleset's weights; the engine rolled."}`)}">\uD83C\uDFAD ${esc(d.picked)} <span class="warp-dim">${Math.round(d.p * 100)}%</span></span>`);
  }
  if (rec.mind) {
    const m = rec.mind;
    const what = m.kind === "fail" ? "couldn't go through with it" : m.kind === "redirect" ? "did something else" : "it took over";
    out.push(`<span class="warp-chip warp-tone-warn" title="${esc(`You chose: ${m.meant}
${m.cause}: ${what} (${Math.round(m.chance)}% chance at the time)`)}">\uD83E\uDDE0 ${esc(m.cause)} — ${esc(what)}</span>`);
  }
  if ((rec.contradiction ?? 0) >= 0.6) {
    out.push(`<span class="warp-chip warp-tone-warn" title="The decision model thinks this reply may contradict the game state (${Math.round(rec.contradiction * 100)}%). Consider swiping.">⚠ may contradict the state</span>`);
  }
  const whys = [];
  for (const ch of rec.changes) {
    const narr = ch.src === "narrator" || ch.src === "manual";
    if (ch.why?.length)
      whys.push(`<div><b>${esc(ch.text)}</b> <span class="warp-dim">←</span> ${ch.why.map(esc).join(" · ")}</div>`);
    const undo = narr && ch.undo?.length ? `<button class="warp-chip-undo" data-undo="${esc(ch.undo.join(","))}" title="Undo this change" aria-label="Undo">×</button>` : "";
    out.push(`<span class="warp-chip warp-tone-${ch.tone}${narr ? " warp-chip-narr" : ""}" title="${esc(narr ? ch.src === "manual" ? "You set this" : "Read from the story — click × to undo" : "Applied by the rules")}">${esc(ch.text)}${ch.band ? ` <span class="warp-band">${esc(ch.band)}</span>` : ""}${undo}</span>`);
  }
  if (rec.veiled)
    out.push(`<span class="warp-chip warp-tone-warn" title="Narrated off-screen by your Veils setting">◐ veiled</span>`);
  if (whys.length) {
    out.push(`<button class="warp-chip warp-why-btn" data-why title="Show what caused each change">Why?</button>`);
    out.push(`<div class="warp-why-detail">${whys.join("")}</div>`);
  }
  return out.join("");
}
function renderSuggestion(s) {
  return `<span class="warp-chip warp-suggest">\uD83C\uDFB2 Roll <b>${esc(s.label)}</b>? <span class="warp-dim">${Math.round(s.confidence * 100)}% sure</span>
    <button class="warp-btn warp-btn-primary warp-mini" data-redo="${esc(s.messageId)}" data-redo-action="${esc(s.actionId)}" data-redo-params="${esc(JSON.stringify(s.params ?? {}))}">Roll it</button>
    <button class="warp-chip-undo" data-dismiss-suggest="${esc(s.messageId)}" title="Dismiss" aria-label="Dismiss">×</button></span>`;
}
function renderDepthCard(s) {
  const d = s.depth;
  if (!d || s.state !== "ok")
    return "";
  const gaps = d.gaps.filter((g) => g.severity === "gap"), thin = d.gaps.filter((g) => g.severity === "thin");
  const row = (g) => `<details class="warp-depth-row warp-depth-${g.severity}"><summary>${esc(g.text)}</summary><p class="warp-dim">${esc(g.fix)}</p></details>`;
  return `<div class="warp-card warp-depth">
    <h3>Rules connectivity <span class="warp-dim">${d.score} / 100</span></h3>
    <p class="warp-dim">A static check of how rules connect: item uses, stat references and encounter routes. This is not a rating of fun or story quality. A small, focused ruleset can be ready to play without reaching 100.${d.gaps.length ? "" : " No connectivity findings."}</p>
    ${d.drafted.length ? `<p class="warp-depth-drafted">✎ Warp drafted what these items do, from their descriptions: <b>${esc(d.drafted.join(", "))}</b>. They're in the <i>warp-ruleset · item uses</i> entry — edit or delete it freely.</p>` : ""}
    ${gaps.length ? `<div class="warp-choice-group-label">Connections to review · ${gaps.length}</div>${gaps.map(row).join("")}` : ""}
    ${thin.length ? `<div class="warp-choice-group-label">Optional expansion ideas · ${thin.length}</div>${thin.slice(0, 12).map(row).join("")}${thin.length > 12 ? `<p class="warp-dim">…and ${thin.length - 12} more.</p>` : ""}` : ""}
    ${d.gaps.length ? `<div class="warp-row"><button class="warp-btn warp-btn-primary" data-b="open-deepen">Review connections with the builder</button>${gaps.some((g) => g.id.startsWith("item-dead:")) ? `<button class="warp-btn" data-draft-items>Draft item uses</button>` : ""}</div>` : ""}
  </div>`;
}
function renderRulesetCard(s, hasChat) {
  if (!hasChat) {
    return `<div class="warp-card"><h3>Open a chat</h3><p>Warp runs inside a chat whose character has a <b>warp-ruleset</b> lorebook.</p></div>`;
  }
  if (s.state === "none") {
    return `<div class="warp-card">
      <h3>${esc(s.characterName ?? "This character")} has no game rules yet</h3>
      <p>Add a ruleset to get stats, dice checks, time, inventory and relationships that the model can't fudge. It's stored in a <b>warp-ruleset</b> lorebook on the character, so it travels with the card.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-install>Add a ruleset…</button></div>
    </div>`;
  }
  const errors = s.issues.filter((i) => i.level === "error");
  const warns = s.issues.filter((i) => i.level === "warning");
  const head = s.state === "ok" ? `<h3>✓ ${esc(s.name)}</h3><p>From ${esc(s.source)}${warns.length ? ` · ${warns.length} note${warns.length > 1 ? "s" : ""}` : ""}</p>` : `<h3 class="warp-tone-bad">Ruleset can't run</h3><p>Fix the problems below in the <b>warp-ruleset</b> lorebook, then reload.</p>`;
  const list = [...errors, ...warns].slice(0, 30).map((i) => `
    <div class="warp-issue"><span class="warp-tone-${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "✕" : "!"}</span><span>${esc(i.message)}</span><span class="warp-issue-where">${esc(i.where)}</span></div>`).join("");
  return `<div class="warp-card">${head}${list ? `<div class="warp-issues">${list}</div>` : ""}
    <div class="warp-row"><button class="warp-btn" data-reload>Reload</button><button class="warp-btn warp-btn-ghost" data-install>Replace with a template…</button></div>
  </div>`;
}
function renderTemplatePicker(templates, card = null) {
  const track = card ? `<label class="warp-toggle"><span>Track <b>${esc(card.name)}</b> as a character</span><small>${card.track ? "Their relationship with you is tracked from the start." : "This looks like a scenario or narrator card, so its name isn't added as a person. Tick if it really is one character."}</small><input type="checkbox" data-track${card.track ? " checked" : ""}></label>` : "";
  return `<div class="warp-modal">
    <p style="margin:0;color:var(--warp-muted)">Pick a starting point. Warp creates a <b>warp-ruleset</b> lorebook on this character, split into readable entries (stats, people, world, actions, rules) that you can edit like any lorebook. It's never sent to the model.</p>
    ${track}
    <button class="warp-card warp-template warp-builder-cta" data-template="__ai"><h3>✨ Build with AI</h3><p>Reads this character's card, asks you a few questions, and drafts a ruleset made for it — previewed and balance-checked before anything is saved.</p></button>
    ${templates.map((t) => `<button class="warp-card warp-template" data-template="${esc(t.id)}"><h3>${esc(t.name)}</h3><p>${esc(t.blurb)}</p></button>`).join("")}
  </div>`;
}
function toggle(key, label, hint, on) {
  return `<label class="warp-toggle"><span>${esc(label)}</span><small>${esc(hint)}</small><input type="checkbox" data-setting="${esc(key)}"${on ? " checked" : ""}></label>`;
}
function renderDecider(s, jevKeySet) {
  const opt = (v, label) => `<option value="${v}"${s.decider === v ? " selected" : ""}>${label}</option>`;
  const pct = (v) => Math.round(v * 100);
  return `<div class="warp-card">
    <h3>Decision model</h3>
    <p>Answers Warp's quick typed questions: what your message attempts, NPC odds, plain-language triggers, bookkeeping. It never picks outcomes — it gives odds, and the dice roll on them.</p>
    <select class="warp-select" data-setting="decider">
      ${opt("llm", "Helper LLM (uses the helper model below)")}
      ${opt("jev", "Classifier endpoint — TypeSafe's Jev or any compatible model (fast, cheap)")}
      ${opt("rules", "Rules only — no model calls (suggests, never acts)")}
    </select>
    <details data-section="advanced-classifier"${s.decider === "jev" ? " open" : ""}><summary>Advanced: classifier endpoint & confidence</summary>
    ${s.decider === "jev" ? (() => {
    const typesafe = s.jevFormat !== "openai" && s.jevUrl === DEFAULT_SETTINGS.jevUrl;
    const issue = classifierIssue(s.jevFormat, s.jevModel, s.jevUrl);
    const host = (() => {
      try {
        return new URL(s.jevUrl).host;
      } catch {
        return s.jevUrl;
      }
    })();
    return `
      <label class="warp-slider">Endpoint
        <input class="warp-input" data-setting="jevUrl" value="${esc(s.jevUrl)}" placeholder="${esc(DEFAULT_SETTINGS.jevUrl)}" spellcheck="false" autocomplete="off">
        <small class="warp-dim">TypeSafe's Jev by default. Paste any URL that speaks the same typed-question API — or pick the OpenAI-compatible format below to use any chat model as the classifier (Groq, OpenRouter, a local llama.cpp, Ollama or vLLM server…).</small>
      </label>
      <div class="warp-row">
        <select class="warp-select" data-setting="jevFormat" style="flex:1">
          <option value="typesafe"${s.jevFormat !== "openai" ? " selected" : ""}>Typed questions (TypeSafe API)</option>
          <option value="openai"${s.jevFormat === "openai" ? " selected" : ""}>OpenAI-compatible chat (/chat/completions)</option>
        </select>
        <input class="warp-input" data-setting="jevModel" value="${esc(s.jevModel)}" placeholder="${s.jevFormat === "openai" ? "Model name (e.g. llama-3.1-8b-instant)" : "jev-latest"}" title="Model" style="flex:1">
      </div>
      ${issue ? `<p class="warp-tone-warn" role="alert">${esc(issue)}</p>` : ""}
      <div class="warp-row"><button class="warp-btn" data-jev-openrouter>Jev on OpenRouter</button><span class="warp-dim">Sets the typed format, endpoint and model. Uses an OpenRouter key.</span></div>
      <div class="warp-row">
        <input class="warp-input" type="password" data-jevkey placeholder="${jevKeySet ? "Key saved — paste to replace" : typesafe ? "TypeSafe API key (sk-…)" : "API key (leave empty for a local server)"}" autocomplete="off" style="flex:1">
        <button class="warp-btn" data-save-jev>${jevKeySet ? "Replace" : "Save"}</button>
        ${jevKeySet ? `<button class="warp-btn warp-btn-ghost" data-clear-jev>Remove</button>` : ""}
      </div>
      <p>${jevKeySet ? "✓ Key stored encrypted on the server." : typesafe ? "No key yet — until you add one, the helper LLM is used." : "No key saved — fine for a local server."} Your roleplay text is sent to <b>${esc(host)}</b> for these questions. Use <b>Test</b> below to check it answers.</p>`;
  })() : ""}
    <label class="warp-slider"><span>Roll automatically when at least <b>${pct(s.autoConfidence)}%</b> sure</span>
      <input type="range" min="40" max="99" value="${pct(s.autoConfidence)}" data-setting-pct="autoConfidence"></label>
    <label class="warp-slider"><span>Offer a one-tap “Roll it?” from <b>${pct(s.askConfidence)}%</b></span>
      <input type="range" min="10" max="95" value="${pct(s.askConfidence)}" data-setting-pct="askConfidence"></label>
    </details>
    ${toggle("consistencyCheck", "Check replies against the state", "Flags replies that contradict the game (wrong place, items, injuries, dice result). One extra quick question per reply — cheap with Jev.", s.consistencyCheck)}
    <details data-section="advanced-generation"${s.drafts > 1 || s.prewrite > 0 ? " open" : ""}><summary>Optional: extra drafts & pre-written replies</summary>
    <p class="warp-tone-warn">These options spend extra generations on your chat's connection. Pre-written replies can cost money even when you never choose them.</p>
    <label class="warp-slider">Drafts per reply
      <select class="warp-select" data-setting="drafts">${[1, 2, 3, 4].map((n) => `<option value="${n}"${s.drafts === n ? " selected" : ""}>${n === 1 ? "1 (off)" : `${n} — optional swipes`}</option>`).join("")}</select>
      <small class="warp-dim">Extra drafts are written with your chat's connection after each reply and saved as swipes. The reply you are reading stays selected; choose an alternative yourself. Costs one generation per extra draft.</small>
    </label>
    <label class="warp-slider">Pre-write replies
      <select class="warp-select" data-setting="prewrite">${[0, 1, 2, 3, 4].map((n) => `<option value="${n}"${s.prewrite === n ? " selected" : ""}>${n === 0 ? "Off" : `First ${n} choice${n === 1 ? "" : "s"}`}</option>`).join("")}</select>
      <small class="warp-dim">While you read, the first choices are rolled and written ahead, so clicking one (⚡) is instant. Costs one generation per prepared choice each turn, including choices you do not use. Only available when swipe rerolls are enabled.</small>
    </label>
    </details>
    <div class="warp-row"><button class="warp-btn" data-test-decider>Test decision model</button></div>
  </div>`;
}
function renderSettings(s, status, connections, jevKeySet = false, imageConnections = []) {
  const tags = new Set([...status?.tags ?? [], ...s.lines, ...s.veils]);
  const tagChips = [...tags].sort().map((t) => {
    const mode = s.lines.includes(t) ? "line" : s.veils.includes(t) ? "veil" : "on";
    return `<button class="warp-tag" data-tag="${esc(t)}" data-mode="${mode}" title="Click to cycle: on → veil (off-screen) → line (removed)">${esc(t)}</button>`;
  }).join("");
  return `<div class="warp-card">
    <h3>Play</h3>
    ${toggle("enabled", "Warp is on", "Turn the engine off without removing any rules.", s.enabled)}
    ${toggle("freeTextChecks", "Read my typed messages for actions", "When you type something risky, a quick referee call picks the matching action and the dice decide.", s.freeTextChecks)}
    ${toggle("narratorUpdates", "Keep state in sync with the story", "After each reply, small changes the story describes (time, mood, items, people) are recorded within the ruleset's limits. You can undo any of them.", s.narratorUpdates)}
    ${toggle("storyQuests", "Quests from the story", "When someone in the story asks you for a favour or a job and you agree, it's tracked as a quest with stakes; the story decides when it's done or failed, and they remember how it went.", s.storyQuests)}
    ${toggle("swipesReroll", "Swiping rerolls the dice", "Casual: a new swipe is a new roll. Turn off for Ironman: rolls stay fixed for the same move.", s.swipesReroll)}
  </div>
  <div class="warp-card">
    <h3>Display</h3>
    ${toggle("showOdds", "Show odds on choices", "Percent chance of success on each button.", s.showOdds)}
    ${toggle("showDiceChips", "Show dice & changes on messages", "The roll and what changed, under each reply.", s.showDiceChips)}
    ${toggle("hotkeys", "Number keys pick choices", "Press 1–9 (0 for 10) when you're not typing.", s.hotkeys)}
  </div>
  ${renderDecider(s, jevKeySet)}
  <div class="warp-card">
    <h3>Helper model</h3>
    <p>Used for the referee and bookkeeping calls. A fast, cheap model works best.</p>
    <select class="warp-select" data-setting="helperConnectionId">
      <option value="">Same as the chat</option>
      ${connections.map((c) => `<option value="${esc(c.id)}"${c.id === s.helperConnectionId ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
    </select>
  </div>
  <div class="warp-card">
    <h3>Dates, dungeons & encounters</h3>
    <p>Dates and dungeons play full screen as short snippets, off the chat. Encounters are told round by round in one message that grows, then summed up. One line goes into the story when each ends.</p>
    <label class="warp-slider">Lines written by
      <select class="warp-select" data-setting="sceneLines">
        <option value="model"${s.sceneLines === "model" ? " selected" : ""}>The helper model (scripted if it's slow)</option>
        <option value="scripted"${s.sceneLines === "scripted" ? " selected" : ""}>Scripted lines only — instant, free</option>
      </select>
    </label>
    ${toggle("themeDating", "Dating that fits the card", "The built-in topics and outings (films, a café, an arcade…) are rewritten once for the card's setting — a medieval card gets tales and the harvest fair.", s.themeDating)}
    ${status?.state === "ok" ? `<div class="warp-row"><button class="warp-btn warp-mini" data-theme-dating title="Rewrite dating's topics and outings for this card now">Re-theme dating now</button></div>` : ""}
    ${toggle("draftItemUses", "Give useless items a purpose", 'Items the rules never use get one drafted from their description (a use or a gear bonus), saved as an editable "item uses" lorebook entry.', s.draftItemUses)}
    ${toggle("dateImages", "Illustrate dates through Cue", "Uses Cue's assistant, character consistency, image settings and image fit. Requires an updated Cue extension. Configure pictures in Cue.", s.dateImages)}
  </div>
  <div class="warp-card">
    <h3>Minigames</h3>
    <p class="warp-dim">Play a check instead of rolling it: Aim, Keys, Mines, Stack, Snake, a three-legged race, Pinball, Blackjack, Roulette or Slots. The dice's odds set the score to beat; your stats and perks make the game easier. Casino tables bet real in-game money.</p>
    <label class="warp-slider">When a check can be played
      <select class="warp-select" data-setting="minigames">
        <option value="ask"${s.minigames === "ask" ? " selected" : ""}>Roll by default — offer a Play button</option>
        <option value="always"${s.minigames === "always" ? " selected" : ""}>Straight into the game</option>
        <option value="off"${s.minigames === "off" ? " selected" : ""}>Off — always dice</option>
      </select>
    </label>
    <label class="warp-slider">Which checks
      <select class="warp-select" data-setting="minigameScope">
        <option value="rulebook"${s.minigameScope === "rulebook" ? " selected" : ""}>Only the ones the rulebook gives a game</option>
        <option value="all"${s.minigameScope === "all" ? " selected" : ""}>Every check (a game that fits the skill is picked)</option>
      </select>
    </label>
  </div>
  <div class="warp-card">
    <h3>Effects & sound</h3>
    <label class="warp-slider">Look of dungeons, dates and minigames
      <select class="warp-select" data-setting="look">
        <option value="rulebook"${s.look === "rulebook" ? " selected" : ""}>The rulebook's (medieval, modern or sci-fi)</option>
        <option value="medieval"${s.look === "medieval" ? " selected" : ""}>Always medieval — parchment, oak and gold</option>
        <option value="modern"${s.look === "modern" ? " selected" : ""}>Always modern — paper and ink</option>
        <option value="scifi"${s.look === "scifi" ? " selected" : ""}>Always sci-fi — an instrument panel</option>
      </select>
    </label>
    <label class="warp-slider">Visual effects
      <select class="warp-select" data-setting="fx">
        <option value="full"${s.fx === "full" ? " selected" : ""}>Full — rolls stamped in the chat, hearts, hits, tile flips</option>
        <option value="reduced"${s.fx === "reduced" ? " selected" : ""}>Reduced — colour and banners, no motion</option>
        <option value="off"${s.fx === "off" ? " selected" : ""}>Off</option>
      </select>
    </label>
    <label class="warp-slider">Sound
      <select class="warp-select" data-setting="sfx">
        <option value="games"${s.sfx === "games" ? " selected" : ""}>Dates, dungeons and encounters</option>
        <option value="all"${s.sfx === "all" ? " selected" : ""}>Everywhere (dice in the chat too)</option>
        <option value="off"${s.sfx === "off" ? " selected" : ""}>Off</option>
      </select>
    </label>
    <label class="warp-slider">Volume <input type="range" min="0" max="100" step="5" value="${Math.round(s.sfxVolume * 100)}" data-setting-volume aria-label="Sound volume"> <span class="warp-dim">${Math.round(s.sfxVolume * 100)}%</span></label>
    <p class="warp-dim">Sounds are made live in the browser and start after your first click. Your system's "reduce motion" setting is respected.</p>
  </div>
  <div class="warp-card">
    <h3>Content: lines & veils</h3>
    <p>Click a tag to cycle it: <b>on</b> → <span class="warp-tone-warn">veil</span> (still happens, narrated off-screen) → <span class="warp-tone-bad">line</span> (removed from the game).</p>
    <div class="warp-tags">${tagChips || `<span class="warp-empty">This ruleset doesn't tag any actions.</span>`}</div>
    <div class="warp-row"><input class="warp-input" data-newtag placeholder="Add a tag… (Enter)" style="flex:1"></div>
  </div>`;
}

// src/frontend/builder-ui.ts
function emptyDraft() {
  return { answers: {}, additions: [], notes: {}, refine: "", base: "", creative: false, connectionId: "", effort: "thorough" };
}
var KINDS = ["skill", "meter", "item", "place", "person", "action", "rule", "other"];
var REFINE_CHIPS = [
  "Make it harder",
  "Make it more forgiving",
  "Add more places to go",
  "Add an encounter that fits the card",
  "Give the main character a daily schedule",
  "Add a skill for something the card mentions"
];
function renderBuilderCta(hasRuleset, hasChat, exported = null) {
  if (!hasChat)
    return "";
  return `${renderRulebookIo(hasRuleset, exported)}<div class="warp-card warp-builder-cta">
    <h3>✨ Build with AI</h3>
    <p>Warp reads the card, asks you a few questions, and drafts a ruleset that fits — checked, balance-reviewed and previewed before anything is saved.</p>
    <div class="warp-row">
      <button class="warp-btn warp-btn-primary" data-b="open-build">${hasRuleset ? "Rebuild with AI" : "Build with AI"}</button>
      ${hasRuleset ? `<button class="warp-btn" data-b="open-refine">Refine with AI</button><button class="warp-btn" data-b="open-deepen" title="The designer audits these rules and wires in what doesn't connect yet — you review before anything is saved">Deepen with AI</button>` : ""}
    </div>
  </div>`;
}
function renderRulebookIo(hasRuleset, exported) {
  const out = exported ? `<div class="warp-export">
      <textarea class="warp-input warp-yaml-input" rows="8" readonly data-export-text spellcheck="false">${esc(exported.text)}</textarea>
      <div class="warp-row">
        <button class="warp-btn warp-btn-primary" data-b="export-copy">Copy</button>
        <button class="warp-btn" data-b="export-save" data-name="${esc(exported.name)}">Save as file</button>
        <button class="warp-btn warp-btn-ghost" data-b="export-close">Close</button>
      </div>
    </div>` : "";
  return `<details class="warp-card warp-rulebook-io"${exported ? " open" : ""}>
    <summary><b>\uD83D\uDCE5 Import or export a rulebook</b> <span class="warp-dim">— write it with another tool</span></summary>
    <p>Rulebooks can be written outside Lumiverse — by hand, or with an agent harness (Claude Code, Codex, Cursor…) using <b>docs/RULEBOOK_GUIDE.md</b> from the Warp repository and its checker. Paste the YAML or pick the file; it's checked, balance-reviewed and previewed before anything is saved.</p>
    <textarea class="warp-input warp-yaml-input" rows="5" data-import-text spellcheck="false" placeholder="name: My game&#10;stats:&#10;  hp: { kind: meter, … }&#10;…"></textarea>
    <div class="warp-row">
      <button class="warp-btn warp-btn-primary" data-b="import">Check & preview</button>
      <label class="warp-btn">Choose a file…<input type="file" accept=".yaml,.yml,.txt,.md" data-import-file hidden></label>
      ${hasRuleset ? `<button class="warp-btn" data-b="export" title="The installed rulebook as one file, to edit elsewhere and import back">\uD83D\uDCE4 Export this rulebook</button>` : ""}
    </div>
    ${out}
  </details>`;
}
function steps(s) {
  const list = s.mode === "refine" ? ["Describe", "Review", "Install"] : s.mode === "deepen" ? ["Audit", "Review", "Install"] : s.mode === "import" ? ["Import", "Review", "Install"] : ["Read", "Ask", "Plan & build", "Review", "Install"];
  const at = s.mode !== "build" ? s.step === "done" ? 2 : 1 : s.step === "start" ? 0 : s.step === "questions" ? s.busy ? 2 : 1 : s.step === "review" ? 3 : 4;
  return `<ol class="warp-steps">${list.map((l, i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}">${esc(l)}</li>`).join("")}</ol>`;
}
function question(q, a) {
  const val = a ?? q.default;
  const why = q.why ? `<div class="warp-dim warp-q-why">${esc(q.why)}</div>` : "";
  let body = "";
  if (q.kind === "single" || q.kind === "multi") {
    const chosen = new Set(Array.isArray(val) ? val : val !== undefined ? [String(val)] : []);
    body = `<div class="warp-tags">${(q.options ?? []).map((o) => `<button class="warp-tag warp-opt" data-bq="${esc(q.id)}" data-bq-kind="${q.kind}" data-bq-opt="${esc(o.id)}" aria-pressed="${chosen.has(o.id)}">${esc(o.label)}</button>`).join("")}</div>`;
  } else if (q.kind === "scale") {
    const v = typeof val === "number" ? val : Number(val ?? 3);
    const labels = q.options ?? [];
    body = `<input type="range" min="1" max="5" step="1" value="${v}" data-bq="${esc(q.id)}" data-bq-kind="scale" class="warp-scale" aria-label="${esc(q.text)}">
      <div class="warp-scale-labels">${labels.map((o) => `<span>${esc(o.label)}</span>`).join("")}</div>`;
  } else {
    body = `<textarea class="warp-input" rows="2" data-bq="${esc(q.id)}" data-bq-kind="text" placeholder="Your answer…">${esc(typeof val === "string" ? val : "")}</textarea>`;
  }
  return `<div class="warp-q${q.core ? " core" : ""}"><div class="warp-q-text">${esc(q.text)}</div>${why}${body}</div>`;
}
function additions(d) {
  const rows = d.additions.map((a, i) => `<div class="warp-add-row">
      <input class="warp-input" value="${esc(a.name)}" placeholder="Name (e.g. Cooking)" data-badd="${i}" data-badd-field="name">
      <select class="warp-select" data-badd="${i}" data-badd-field="kind">${KINDS.map((k) => `<option value="${k}"${a.kind === k ? " selected" : ""}>${k}</option>`).join("")}</select>
      <input class="warp-input" value="${esc(a.note)}" placeholder="How it should work (optional)" data-badd="${i}" data-badd-field="note">
      <button class="warp-btn warp-btn-ghost" data-b="add-remove" data-i="${i}" aria-label="Remove">×</button>
    </div>`).join("");
  return `<div class="warp-card">
    <h3>Add your own</h3>
    <p>Skills, meters, items, places, people, actions or rules you want in — in your own words. They'll be built in properly.</p>
    ${rows}
    <div class="warp-row"><button class="warp-btn" data-b="add-row">+ Add something</button></div>
  </div>`;
}
function renderBuilder(s, d, templates, connections, hasRuleset) {
  try {
    return builderHtml(s, d, templates, connections, hasRuleset);
  } catch (error) {
    console.error("[warp] Could not display the builder draft", error);
    return `<div class="warp-card"><h3>The draft couldn't be displayed</h3><p>Your saved draft is kept. Reload Warp to reopen it. You can still use the other tabs.</p></div>`;
  }
}
function depthReview(s, dis, errors) {
  const depth = s.depth;
  if (!depth)
    return "";
  const findings = depth.findings;
  const open = findings?.filter((g) => !g.reason) ?? [];
  const exceptions = findings?.filter((g) => g.reason) ?? [];
  const gaps = open.filter((g) => g.severity === "gap").length;
  const thin = open.length - gaps;
  const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const counts = findings ? `${count(gaps, "gap")} · ${count(thin, "thin spot")} · ${count(exceptions.length, "deliberate exception")}` : "Audit details need refreshing.";
  const status = errors ? "Fix the checker errors before finishing." : !findings ? "Run Deepen to refresh the findings." : open.length ? "Findings remain. Thin spots are optional, but still lower depth." : exceptions.length ? "The remaining findings were left as deliberate exceptions. They still lower depth." : "No audit findings remain.";
  const actions = `${open.length || errors || !findings ? `<button class="warp-btn warp-mini" data-b="deepen"${dis}>Keep deepening</button>` : ""}${exceptions.length ? `<button class="warp-btn warp-mini" data-b="revisit-waivers"${dis} title="Reopen these findings and ask the designer to fix them without waiving them again">Fix exceptions</button>` : ""}`;
  const pass = s.designPass;
  const stop = pass ? pass.reason === "no_tools" ? `The helper stopped making tool calls after ${pass.steps} designer calls.` : pass.reason === "budget" ? `The designer reached its ${pass.steps}-call limit.` : pass.reason === "error" ? "The helper stopped with an error. Your draft is kept." : "The design pass finished." : "";
  const progress = pass && findings?.length && pass.resolved === 0 ? ` ${pass.changed ? "" : "No rules changed. "}No audit findings were resolved.` : "";
  const rows = open.map((g) => `<div class="warp-warning-row"><span class="warp-tone-warn">${g.severity === "gap" ? "Gap" : "Thin spot"}</span><span>${esc(g.text)}<br><span class="warp-dim">${esc(g.fix)}</span></span></div>`).join("");
  const waived = exceptions.map((g) => `<p>${esc(g.text)}<br><span class="warp-dim">Reason: ${esc(g.reason)}</span></p>`).join("");
  return `<p class="warp-depth-line">Depth <b>${depth.before}</b> → <b class="warp-tone-${depth.after >= depth.before ? "good" : "warn"}">${depth.after}</b> / 100</p>
    <p>${counts}</p><p class="warp-tone-${errors || open.length || !findings ? "warn" : "good"}">${status}</p>
    ${stop ? `<p class="warp-dim">${esc(stop + progress)}</p>` : ""}
    ${actions ? `<div class="warp-row">${actions}</div>` : ""}
    ${rows ? `<details class="warp-depth-row"><summary>What still needs work · ${open.length}</summary>${rows}</details>` : ""}
    ${waived ? `<details class="warp-depth-row"><summary>Deliberate exceptions · ${exceptions.length}</summary>${waived}</details>` : ""}`;
}
function builderHtml(s, d, templates, connections, hasRuleset) {
  const busy = !!s.busy;
  const dis = busy ? " disabled" : "";
  const head = `<div class="warp-builder-head">
      <div><div class="warp-eyebrow"><span>${s.mode === "import" ? "\uD83D\uDCE5 Imported rulebook" : `✨ ${s.mode === "refine" ? "Refine" : s.mode === "deepen" ? "Deepen" : "Build"} with AI`}</span></div><b>${esc(s.characterName)}</b></div>
      <button class="warp-btn warp-btn-ghost" data-b="close" title="Close the builder (discards the draft)" aria-label="Close">×</button>
    </div>${steps(s)}`;
  const log = s.log?.length ? `<details class="warp-designer-log"${busy ? " open" : ""}><summary>What the designer did · ${s.log.length}</summary><ol>${s.log.slice(-40).map((l) => `<li>${esc(l)}</li>`).join("")}</ol></details>` : "";
  const status = busy ? `<div class="warp-card warp-busy-card"><div class="warp-status-line"><span class="warp-spinner"></span>${esc(s.busy)}</div><p>This can take a few minutes with a thorough pass — you can keep chatting; the drawer updates as it works.</p>${log}</div>` : s.error ? `<div class="warp-card warp-error-card"><p class="warp-tone-bad">${esc(s.error)}</p></div>` : "";
  const plan = s.plan ? `<details class="warp-card warp-plan"><summary><b>The design plan</b> <span class="warp-dim">— written before any rules, and held to</span></summary><pre class="warp-plan-text">${esc(s.plan)}</pre></details>` : "";
  let body = "";
  if (s.step === "start") {
    body = `<div class="warp-card">
      <h3>How should it build?</h3>
      <label class="warp-field"><span>Starting point</span>
        <select class="warp-select" data-bset="base">
          <option value=""${!d.base ? " selected" : ""}>Let the AI pick after reading the card</option>
          ${templates.map((t) => `<option value="${esc(t.id)}"${d.base === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("")}
          <option value="blank"${d.base === "blank" ? " selected" : ""}>Blank — from scratch</option>
        </select></label>
      <div class="warp-seg" role="radiogroup" aria-label="Style">
        <button class="warp-seg-btn" data-bset="creative" data-v="0" aria-pressed="${!d.creative}">Stay close to the template</button>
        <button class="warp-seg-btn" data-bset="creative" data-v="1" aria-pressed="${d.creative}">Get creative</button>
      </div>
      <div class="warp-seg" role="radiogroup" aria-label="Effort">
        <button class="warp-seg-btn" data-bset="effort" data-v="thorough" aria-pressed="${d.effort === "thorough"}" title="Plans the game, then works with tools — checker, depth audit, encounter simulations — until every piece connects">Thorough</button>
        <button class="warp-seg-btn" data-bset="effort" data-v="quick" aria-pressed="${d.effort === "quick"}" title="Plans, drafts, repairs and takes one short pass at the audit">Quick</button>
      </div>
      <label class="warp-field"><span>Model</span>
        <select class="warp-select" data-bset="connectionId">
          <option value="">Same as the chat</option>
          ${connections.map((c) => `<option value="${esc(c.id)}"${d.connectionId === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}
        </select></label>
      <p>A strong model gives better rulesets — Thorough lets it plan the game, then test and fix its own work (simulating encounters, closing every gap the depth audit finds) instead of stopping once the rules parse. Nothing is saved until you install it at the end.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-b="start"${dis}>Read the card →</button></div>
    </div>`;
  } else if (s.step === "questions") {
    const a = s.analysis;
    const analysis = a ? `<div class="warp-card">
        <h3>What I read</h3>
        <p>${esc(a.summary)}</p>
        <p><b>Starting from:</b> ${esc(templates.find((t) => t.id === s.base)?.name ?? (s.base === "blank" ? "Blank" : s.base))}${s.base === a.suggestedTemplate && a.reason ? ` — ${esc(a.reason)}` : ""}</p>
        ${a.cardType === "scenario" ? `<p>This reads as a <b>scenario card</b> — “${esc(s.characterName)}” is the setting, so it won't be tracked as a person.</p>` : ""}
        ${a.cast?.length ? `<p><b>Cast</b> (tracked from the start, with these starting feelings):</p><ul class="warp-cast">${a.cast.map((c) => `<li><b>${esc(c.name)}</b> — ${esc(c.relation)}</li>`).join("")}</ul>` : ""}
        ${a.statusBlock?.found ? `<p class="warp-tone-warn">This card prints its own status block (${esc(a.statusBlock.fields.join(", ") || "stats")}). Warp will track those properly and tell the narrator to stop printing it.</p>` : ""}
      </div>` : "";
    const rounds = s.rounds.map((r, i) => `<div class="warp-card">
        <h3>${i === 0 ? "A few questions" : "A few more"}</h3>
        ${r.questions.map((q) => question(q, d.answers[q.id] ?? r.answers[q.id])).join("")}
      </div>`).join("");
    body = `${analysis}${rounds}${additions(d)}
      <div class="warp-row warp-builder-foot">
        <button class="warp-btn warp-btn-ghost" data-b="back"${dis}>← Back</button>
        ${s.rounds.length < 3 ? `<button class="warp-btn" data-b="more"${dis}>Ask me more</button>` : ""}
        <button class="warp-btn warp-btn-primary" data-b="build"${dis}>Build it →</button>
      </div>`;
  } else if (s.step === "review") {
    const p = s.preview;
    const errors = s.parts.filter((x) => x.status === "error").length;
    const depth = depthReview(s, dis, errors);
    const summary = `<div class="warp-card">
        <h3>${s.mode !== "build" && s.changeSummary ? "What changed" : "The draft"}</h3>
        ${depth}
        ${s.changeSummary ? `<p>${esc(s.changeSummary)}</p>` : ""}
        <p>${esc(p?.summary ?? "The draft doesn't run yet — see the sections marked in red.")}</p>
        ${errors ? `<p class="warp-tone-bad"><b>Must fix:</b> ${errors} section${errors === 1 ? "" : "s"} below ${errors === 1 ? "doesn't" : "don't"} match the format Warp reads (marked in red). They block installing — use Redo on ${errors === 1 ? "it" : "them"}.</p>` : ""}
        ${p?.warnings.length ? `<div class="warp-issues">
          <div class="warp-issues-head"><span><b>Could go deeper</b> <span class="warp-dim">— optional. The game runs without these; they're parts of it nothing uses yet.</span></span><button class="warp-btn warp-mini" data-b="deepen"${dis} title="The designer works through every one of these, changing whichever sections each needs">Fix all</button></div>
          ${p.warnings.map((w) => `<div class="warp-warning-row"><span class="warp-tone-warn">!</span><span>${esc(w.text)}</span><button class="warp-btn warp-mini" data-b="fix" data-w="${esc(w.id)}"${dis} title="Changes whichever sections this needs">Fix</button></div>`).join("")}
        </div>` : p ? `<p class="warp-tone-good">No balance problems found.</p>` : ""}
      </div>`;
    const preview = p?.hud ? `<details class="warp-card warp-preview" open><summary><b>Preview</b> <span class="warp-dim">— the sidebar and choices at the start</span></summary>
        <div class="warp-preview-grid"><div class="warp-preview-hud">${renderHud(p.hud, { editing: null, compact: true })}</div>
        <div class="warp-choices">${renderChoices(p.choices, { showOdds: true, hotkeys: false, busy: false })}</div></div>
      </details>` : "";
    const parts = `<div class="warp-card"><h3>Sections</h3>
      ${s.parts.map((x) => {
      const badge = x.status === "ok" ? `<span class="warp-tone-good">✓</span>` : x.status === "warn" ? `<span class="warp-tone-warn">! ${x.issues.length}</span>` : `<span class="warp-tone-bad">✕ ${x.issues.filter((i) => i.level === "error").length}</span>`;
      return `<details class="warp-part"><summary>${badge} <b>${esc(x.label)}</b>${x.changed ? ` <span class="warp-here">changed</span>` : ""} <span class="warp-dim">${esc(countLine(x.yaml))}</span></summary>
          ${x.issues.length ? `<div class="warp-issues">${x.issues.slice(0, 8).map((i) => `<div class="warp-issue"><span class="warp-tone-${i.level === "error" ? "bad" : "warn"}">${i.level === "error" ? "✕" : "!"}</span><span>${esc(i.message)}</span><span class="warp-issue-where">${esc(i.where)}</span></div>`).join("")}</div>` : ""}
          <pre class="warp-yaml">${esc(x.yaml)}</pre>
          <div class="warp-row">
            <input class="warp-input" style="flex:1" placeholder="What should change in ${esc(x.label)}? (optional)" data-bnote="${esc(x.label)}" value="${esc(d.notes[x.label] ?? "")}">
            <button class="warp-btn" data-b="redo" data-part="${esc(x.label)}"${dis}>Redo</button>
          </div>
        </details>`;
    }).join("")}
    </div>`;
    const refine = `<div class="warp-card">
        <h3>Change something</h3>
        <div class="warp-tags">${REFINE_CHIPS.map((c) => `<button class="warp-tag" data-b="chip" data-text="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        <textarea class="warp-input" rows="2" data-brefine placeholder="e.g. Add a cooking skill Aina is bad at, and a kitchen at home">${esc(d.refine)}</textarea>
        <div class="warp-row"><button class="warp-btn" data-b="refine"${dis}>Apply change</button></div>
      </div>`;
    body = `${summary}${plan}${log}${preview}${parts}${refine}
      <div class="warp-row warp-builder-foot">
        ${s.mode === "build" ? `<button class="warp-btn warp-btn-ghost" data-b="back"${dis}>← Back to questions</button>` : ""}
        ${!s.depth ? `<button class="warp-btn" data-b="deepen"${dis} title="Audit these rules and wire in what doesn't connect yet">Deepen</button>` : ""}
        <button class="warp-btn warp-btn-primary" data-b="install" data-replacing="${hasRuleset ? 1 : 0}"${errors || busy ? " disabled" : ""} title="${errors ? "Fix or redo the sections marked in red first" : ""}">${s.mode === "build" || s.mode === "import" ? "Install to lorebook" : "Save changes"}</button>
      </div>`;
  } else {
    body = `<div class="warp-card">
      <h3 class="warp-tone-good">✓ Saved</h3>
      <p>The ruleset is in ${esc(s.characterName)}'s <b>warp-ruleset</b> lorebook and running in this chat. You can refine it any time.</p>
      <div class="warp-row"><button class="warp-btn warp-btn-primary" data-b="close">Done</button><button class="warp-btn" data-b="open-refine">Refine it</button></div>
    </div>`;
  }
  return `<div class="warp-builder">${head}${status}${body}</div>`;
}
function countLine(yaml) {
  const lines = yaml.split(`
`).filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  return `${lines} lines`;
}

// src/frontend/sprites.gen.ts
var SPRITES = {
  rat: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACH0lEQVRYhe2WLW/bUBSGn0wFhQZV1EoBBktANRCy0hpambQODaxS1X/Q1qC0rcYCkuKhqdL2E6agKaNBxgnxpEiRogCDgIBIHrCufXzvddKsbPPLfG2f5z3v/bChUqX/XbWXvOw5JADuPkSrdGwY71bzrwxcHqZgBXX383vRKjfUvQsK753c9AzezgZU1zpYlzIRreC049Nq1GkeHRgmdjKgR+45eQo2qXvxGsIl3H3yeff2mJObXsbe2wUuO1Ym1JiMXpqK15vrvnquAQmWGsY5VMJt0/PwfQDAt9sLIE3zWQbkvOtG5A6Q43LMETlPZotCHauBe5fk3k2hMnrZoepcQfWpgDz+YVysP57ONxvoXAWZEVXMc/JFpwOlOZmIY1lhzaOD7QlMZguaHy8KHSlTsntb3PoCDJf59agfMJktsrVQauC8+1STMXWuAmPudJguHY655WulBjyH5PfPQdbl7UOP8XS+Eaig2+CyMasBzyF5HIZG8V8/Btb9Ha+Le/2043P23rfCbSlaE3j020Aa8fUgN6PD4nW60MJlui6+fA5oNepyjjP4qB8k4+m8MP9gnoSFjwzAtdfOQBKsRQygjlgDrtRq1I17+kOJ58DXMOKy7WYwAF63OTs+pNWoc959Mukl35VRP0gmswVa9+UGAKIoAuDDGxdnLz9IRv10K27rVIKBUnjZy8axK55NtOtNstV50Q9QpUqV/k39AVlzAPNOrZP6AAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  bat: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9oFHg4RHqQfCUwAAAMwSURBVFjDxVfPSxtBFP6epkRPUrMlq2nqwSqBbshBCT0oZA9h7TmnGkoP/Rd6F285aG89eqzgwXOVHizYQwnxIG5hUSto0G7sBi8iBgLTQzrD7GY3P8yWPlg2u5l535vvfW/mLTHG8D8tAgBE5IqCMUb/AswPJ0JEbGV5Sbz8/OMSRMTCDoKIWDaTxqsXCde7CGOM5CD4gDCD8ANf3dxpMcCpICJWMHRosWioQXjBzXoD27t7Is0ROR9ExGDooTEhg5v1BgC4wF0ByKbFogMH4V25FouKIGQbCgLvVdFeZXcyP9/E94FujmQG+FiRNp/S7dVfmwbkkuRqldNARKyYy+PT1y9iTDGXd6WJg3t9yeoPTIFZb4gryMnzyWHXKvlzkHl9BmqAMUbbu3uufK1u7iCbSbdNLObyWFxcRDGX99VGNpMW7HFf3grwZcALXjB0JFVFOC8YOm5Hx6BOj+PZ8AjU6XHcjo6hYOgu8KSqoGDobUF0ZICXjgyuxaLQYlHBwvVdE+sbWygfX+HR03coH19hfWML13dNyOB8nhxENpNuE6cvAzI4t5rjtJzMTqJg6Lg4O8XP84+4ODtFwdCRnZ0U4+R53iACGeCRlQ+PkM2k2yib11KYSkwAACqmhddv3mJ/fx+ltQ+omBYAYCoxgXkt5QuUzaRRPjxqK1Hy9gP8T84AV27VdlBzHCzMaACAA7sKy7KQSqUwpyYBAN9OTMSVll54GvjeH3TMD3XacMx6A1XbQcW0UHMcxBUFJzc2AMCyLNedv+epqtqO6+AJ2srJryOSxcgdAkBcUZBUFYw0Iki+nMPvNRtP3quofj/AfbQpUsHH8pR2OkeGgrZJni/Zao6Dqt0KqFQq4X7hEqVSSazYa93AA09D2c4vf4nfXIT30abYIVeWl4RO5LGcgZ56wiAWvAcNEbG4oqBiWqgqCmYeqzi5sYU+5Hm9rD5QA7IWgk45zoa8cu+J2VMPwRjr6wLAspk0A8CmEhNMfu7XF2OsMwO9tteDtPI0yIdJGE3r0ADgf2+Dde59M9Cp1XoIG12rIIwPk753wjC/Ebv56CsFvTLST+AProKwSvEPyxs295OK40UAAAAASUVORK5CYII=",
  jackal: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAATlBMVEUAAAAkGxBBMR1INyBZSjJjUjh6Wjl6ZUd7HCCIcE+XhmKmfke8l2AAAAAkGxBINyBjUjiIZD+IcE+mfkeolW3Gt5bGuJfHuJfRqGv///8qiTDeAAAADXRSTlMAAAAAAAAAAAAAAAAA7Uh4SAAAARpJREFUeAHVkNFOwzAMRUtLB4zeXLu3g/z/l2JnVVaGxhMvHGnZ3HMqTxn+CfN+PgKY0wMPA8Mc3h4HNLzB+EtQDFaOwTxP020aQa6Ft2CaEEzzLVil1R3z/jZgRgK9oEnubvFSAJBGc1ov4HL4uhoSC0unsnhq/oUIfzGFSdK7qlj24sRtu3xSYitEkaq1FrBcl2D72AhVee4OJUUg5AWkP59JwFmjaMarU9XRLrkFwDhk4arp6SyUp8tP8Jo/C91d6YFCuPB+f+Gg19QLaGAVvvtYB7lj3FfDhaAHxhYQrUZSkfQg/P7Xk58BAYQ/oq4TAOo+5mUZgPG5++U0oPpugyziyOIQdJ1qWK5fOzH1ncegkxNw/+hv+AKbhhl82imyygAAAABJRU5ErkJggg==",
  kobold: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAZlBMVEX///8AAAAFYCMfAy0hISEimi8mJiYpvTwxBUsxMTE04ks1NTVANC5ERERHPDZUVFRZLglcTERiYmJxPA1ycnJzJ7N1YlSFRg+Fbl6LUh+mfmuqbTa3m4K5Cw7HmIHMa8vtKzP01bBVwNRBAAAAAXRSTlMAQObYZgAAASVJREFUeNrNkuFugzAQg+sA6+jtymVZm4TSMt7/JWfQJrES9nsnRUJ8jo0TDv9xMC/8wT8AXC7YwzifIZdxlw9DSkn2eRqS9z4JyhjC3ffPu5cOJT6Oo0+ePIkUBVM1VT5xBilngFOd/UDe7Tq8vnVCLg4oVWSHjpjcHU94sl8iTs5UOLFpjg5r3j9mRdNYeKEiRNc4VawE1z4Coi5kc5ZDMCdda1g7xJuqaLY0JSrM0N4iflXMKpCcjZwCHJDz83fyZVwcYjAy66/YVA3RyBcHxvYFgfFCLZjVwKNPW4GFwCZzCSpKp1mbORqI1LWi+EOqa07unY1RdyUHEtfMAibU2mEbwa2OjBlYZmuxACrqAp+Bft8rWt3ySSdV/Dy1G/9V6Dr/C3aUEyEO48SeAAAAAElFTkSuQmCC",
  goblin: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAApVBMVEUAAAAAAAALCwsODg4ZGRkdHR0fGRUfHx8jIiAsKSgsKigvKCQ1MjE1NDM7NzY8Mi49OTg/NzJCPj1GPThIPjxMEgxQUFBRR0FcFg1eXl5fX19pGQ5wXVV5HRF7e3uFhYWIHxGIIhWJiYmKioqUJBaWJheXJxmYmJicKx2kKBmkpKSpi36wMSCzLBu1tbXDw8PFMR3FNSHNzc3p6en+tlX+v2j///+x7O0pAAAAAXRSTlMAQObYZgAAATZJREFUeNrdkuFWgkAQRvskU5Etqx13hF0LgdKUWqje/9Wa7Uemrj1AwOHA3LvfDJy9+I8HgL+51QpnoVxma7UODzHuAaW3xkgGNogJrSItAY5U+xgTnC98Y1TpXctFtIejT9aKPogY8SkLanxbChYeFSSjLMkVQx1VMEy4HwxeXaJTm+KU31+p5PntZVWMlNWWcSKwEaNtXGJGRnHNOOalCkaSmNTc1exr/KYAe0cwUzuyqZ1yeGfsedV7Jxw7Mw3nDS5w0AMNN0xSXXcqVWm5E4Sa903Qc4lQXD11Xbdbz3NI7SACCPfJ4mFZ5fMqz0SofI/jD13cLrMqy7NsjOjewnU2m+STSxoT4v+aZk5QQUUQYgmbRgQxNowzxjdH4xAXJCEg0SjO35uKEEapuI9N+bPocPUXYJAbG2C0BSUAAAAASUVORK5CYII=",
  ooze: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAACSVBMVEUcGhguLi40PjlBT01CXlYAAAAZFxMfGxcgHRghHhkjHxslIR0mIhwoJB4oNjgpJiMpMTMpNTcqJiAqMTIqNzoqODgqODoqOTorJyErLCorLiorMSsrOTcrOTsrOjssKCIsKSIsKyIsLiwsLycsOj4sOz4sPDssPjssPjwsPj0tKSMtKyMtLSUtLiQtLyktNTMtPT8tPj8uKyYuLSYuLyUuLycvQUEvQUMwQEQwQkExQ0UyREAySEQySEUzR0QzR0UzR0kzSUYzSUc1SUU1S0k2SkY2TEk2TEo3S0c3TUo3TUw3T0w3T004Tkk4UFI5UUw6Uk06Uk47VVI8VE88VlI9VVk/V1E/WVQ/WVVAWlNAWlZBXVlCXlZCXldCXlhCYFpDX1ZDX1hGYltGZFxGZF9HY1xHZWBIZmBKaGFKamNLaWFLa2lMamJNa2NNa2RNbWRNbWVNb2lObmdPb2dPcWpRcWhSdG1Tc2tUdm1Xd25YenFZfXJafnNcenBcfnRedGFffXNibVtkc19le2xlgXVmfm1nf2tug2tzgWl1hGJ2gWF3f1t8kHZ9eld/jHSDhmCFkWmHhFuHiWGIiGCIjGSKjWOKk2mLjGKLmHCPlWuPmW+Qi2SQlGiQmnCRiGORlWuRnXWTimOWkWiZp32gpXmilW6jo3Wjp3unnXOpnHOqm3KqrX+snXawpnq0sYK0tIS2soS3sIO5uYm6soa8s4i+vI6/tYnAvZDBu43BvI/Cuo7CvI7EwJLFxpjHv5PHxJfIxZjJxJfOyJ7N+65iAAAAAXRSTlMAQObYZgAAAcJJREFUeAFjGIyAlZUVv/z65RWs+ORn7t8/t5IVt8Gs5QtmVTqzYsofWF8FVZFQ02pmyIqhYMmmMlaYWXH2WBRElkYABaGG+HsKYapYUcjKwJoHVZFuCmYge5jVWxqooG01RGKlNyuI6tvOCpfXUOYBKmDJdQLLlEiD7GveeoAVJi+jywOW8Y4HyUh7u4CoiIYEmMMD9HggZsfPYwWCmS7KIAW86nAD+r2B5gORsmUKUL52A9gcUx6EC6ZnZoB08mRHA8m2REsQJ5YH2Q/1C0NYWbm5ouVVWPcm6vGqsrLWmfODzIRbstA7lJtb00icZ2aigragQ6+khbAjKwhAA8TYu01JVkCCb35WT5abW5KYlaK1vJIXSB4izd5mLBcax83BEby4zSM9p9rGILZOR8vVhFMKZI2ujETEDjvOwC1xcVJdfLZpretiRJuX6rK5tviqNTYCFRTJqEpETfHjjZvQGceX7KGb71s3o1mkuXlnQWr7HimQh4smT24q3jIxLjzIPavLVt9D2iele9vS5sa1M2BuBAG/tjVT5xzcvbmja1XJon37dh3aFoaITJiqsGnLNs6fNHt6GFgL9oQJlRpkAAAFoXBAN516bAAAAABJRU5ErkJggg==",
  spider: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABEVBMVEUAAAAAAAAAAAAC/P8aHBofHx8gICAyMjAyMjI4ODg7OjlDPjFFRUFGRkJGRkVGRkZHR0dISEhJSUlKSkZQUFBWVE9XV1dYVVBYVlFYWFhZWVlaWFNbWlVfXVhhYmZiY2ZjYVxjY2VmZmZnZWBnaGxoaGRpaGNra2tsbGxtbm9ubm5vcHFwbmpwcXJxcW9yc3R1dXV2d3h5d3N5en56enp6ent8fHx8fX5+fn6BgYGCgoCDhIWFhoeGhoaHhoKJiouTk42Tk5OUlJWWlpaWl5eampqbnJ2fnZWioJimpqanp6epqamqqqaur62xsbKysrO0tLO1tbS2trS6urm7u7m9vb3KysnLy8vOzs3R0dPx8fGUHxAVAAAAAnRSTlMAyg0i5pYAAAFISURBVHja3ZLpUsIwFIXbg2lEo20UUFyoGxKt4l5RwH3f2yoi7/8gJkWxUKaOfz0zuZOZ79zMzUm0/yfgF553dWhQ6s8z8OEiaDSCAH2wkgszaLZaL2c3iLfnXR8mXmtvreZzbfYaPXwMwKo0XO6cPD1crS1V0c2nIMsmjHNn8fjoYntvvIDYBBpKgDOxPre/vDUzkum+C9xcDjAN2Cy7Mu1MMkqY8Fz8GHzgFjBYhrLsaFZxCoDim+9CljvYVb9KGZUcUroG3nZ8bSS3CXMGGTW44F4kUSyEPPXxfm+TAkFbQuGOQddR3KgfpA5tAkIEFx4EIiHo6oByvVxMW0NcCEh5PHKHsFhFO2UNpxUUatHeqCoDaasyj7A7NPW+Vh14PEXHwBF/71KpPbjqViHFhEgsMJHw9ai0JnDVLXGiIZmHAyYL2h/0Ccq1H7ghFBwaAAAAAElFTkSuQmCC",
  frog: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACWUlEQVRYhe2XYZXrIBCFv/asgEhAQiQgIRKQUAlIeBKQUAlIqAQk1EHeD5gwENJtt33n/dk5Jxtg4N6bm4Fm4Td+4z/H6Zv8+sLcjwrIxL70DOD+rRBNvOJYSeWKpR9Y8SX/wdBPsxKABDjwwWKtIaU7zlwhqJlhuP4tAZk81kR0Dn/JTO6y4LjmvClX/IyQTYD3Fk+s4MAM3JKa7agiLNmtN4WcpZFSJJglg9pMcgNmUyYYai4VUul7pEhfro+mBpwDaxdcumZwTSx3aZuuDdqNp5046461CzFesxMCmtgcIZVhLUZflped6JWuIWQR1i4A2Y0ixKRijAj6Qy4UCUNfoN86ce76J+cyeUp3gFoXQDKdAxO5UCybyFed6AVsIoyZMma619dhsoimFibV1+JMI+JQyCOLVu8txkykdM9bNKmsoW5JyE5MNGKhzLmX/IBv5EDl0ORGgUIVcyvjcyGS8UjrUq6VnRMPHWAGFvbbTsDlqS37LXqlOiJrBk7sdsHWmtXd0IpIBVCIobqjx0b32PJ+NeSuW8CmuD0FJS8iZLwXKMJEXMVdRcTXNuDJR6qlLSyo20wIINu5dORCGmldk3VW5YsIEXAqv/X1bJeJGjzROtCTJ9o6aAnrQ6gY10CgtRP21s/ARa2MjGtF50VwGAtYt4RRqrWAyD68IhTy0VqdUzj1g0QUAtv269Qehu/6qWsL+QCvdeA58vEaiambbZWQAd6+BgL6C/hoXp4r4Jbjd39ALLhj4Gf+Xwi07zjA7hyJDzFO258fxjuf54dH8TvxjKAd318aSwCUTN3BXQAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  hobgoblin: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAxlBMVEUAAAAfHx8AAAAODg4YGBgZGRkbGxseHh4fHx8iIiIjIyMlHhspKSksLCwuJyQvLy8xKScyKigzMzM0LCk1LSo1LSs1NDM2NjY3Liw3Nzc4Li04Ly05Ly05OTk6MjA8MzE+NDI/NTNBNzREPDlERERHR0dIPjxLS0tMEgxOTk5QUFBRPzdTQjlWQzxaWlpcFg1gTURhYWFlUklnZ2dwXVV5HRF9aluKioqUJBaYmJiokHupi36zLBu8qJbFMR3tOiP+v2j///9m7evTAAAAAnRSTlMAAHaTzTgAAAFOSURBVHjalZINU4JAEIbrJRMry9To29RsI8q2j1vciC7//6+Kg3SYAGdaZmDnnof3jh22/lsANvM5ETbyT0MBmuMDxwcE1HNNw4CCkDXVJmMZBuGykTuDsyvl5kOkVmyq0ixo7Hmxst9kbCOJ4y8ezC9Rq+DRU2u1a8hQXQjM9dBrtVi6GVdGVRia4YxVlMkXWzXAoqe9E1GrvjCXDQCOq2UeLSJRUSDTBSv+rQKoFYZwFI3C/F3wOiJjyirMgLuPIglRbLkSHHd4CzPnPhzmCcK63iMv1/TvFovo4+gVeW515HjejaIu3fePkeWyVoWL/bM3mr7QOWr/TkxMb+/pakrv404Oa4RJG0DH0NgJ+BsCQ1MUzw5WVeY+3fi5QGZcK9BtqzicPxge1Anc9VDUTpurvJhdUaxcx+1qOW8rn5Bowr+r4ISTyiTKkaX2Bxw4MdYY2yGFAAAAAElFTkSuQmCC",
  gnoll: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAQlBMVEUAAAAAAABAMABAQEBgMDBgSACAAACAIACAQECAYACgKACgUFCgeACgoKCqiDTAAADAMADAkADAwMDgqADg4OD///9d9j70AAAAAXRSTlMAQObYZgAAASZJREFUeNp9kIuOgzAMBFmCS0x8V5zy/9/aDXKr8jSKMJnJAu42BXTobgpLxYIbXpdaF+DmvJm/XlcZMPHn07QCF9xd26rLeQQej4eaCiPILwxVYQQTzgViMXObZ1wYwGyMmKbpXCGf3F3TOJ4qxGNyN0+0JJQd90TIJWZcqviNnxhvlhLHSaTWnsKIKQk3RLT+8dZDlI9fA2iUGNCUUhNY4h8B7oE7CnwNhXUwbogJBWafklnKw9rL15DAHXIuJZc8fAyLdyDuJdPg1YxfIQo5AhiRV0P33BtrmBHN2HFzHtbSnBC2hX8rWSUkORhQk/VvC3opHNaAvSGqnBAAGhSAgxG7q3EUAMS5iNhysFQlBGndnhNzt1+xsjkJ6FloFc32Aw8V/A0mHA6ADOUR6gAAAABJRU5ErkJggg==",
  orc: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAmVBMVEUAAAAAAAAAAAAEAgAvLy8/HwFNJwZPMhxXKgFYLwpZOB5cNxtdLgJfLwJgPSZiRzpjMQJjRjdnMgJoMwJpNQRrNQJvNgJwSzZyOAJzRiFzTjl5U0B7QxR8PAJ+SiF+WUh/AQB/PwN/SBuBPwOBW0qFXkyJRQeJXkSUaVWWaVOecFmfTwSgclukdV6/AgHBiG3JjnLf39/koYKkB3r+AAAAAnRSTlMAA++anIIAAAE9SURBVHjahZSLUgIxDEX1shUfxPp+oWarIigGwv7/x5m24whmdwzMlsk5JGmYYW83YGHHYEC06/APV8UABbgKghyOG2pWqrpqpHjeEJZGtTHOLH2zYiOqG9UsVOyNtm03xoeuuj+SrpOWI4ZuORqLcLQY6CCXp5kyLxS9fP0+eWPDor3Lwnp+//rJIlre8ILMHw4/Zl8GFyx+UrDE+fXz7SzzyG4VKOMfXTzG6bRMulMCsAktMz49uHk5PmcGojC2f2VhSyDEk6uzu0BkAutvCaiUnpjQhJ5SohSQc9juD+NEy5TS0h6lRMT2DPkZTCgvCqb7fZtQuBUIBh23FkylBXFAjT9ClEhIoNy+z0C5KpDPfoG0AlZyPeqMNV8+eG7CTzqY4XDusCN4nlIV6kKSnb5AqF+rJfyecvg/gW+waSfEuzKNpQAAAABJRU5ErkJggg==",
  orc_warrior: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAS1BMVEUAAAAAAAAPAAAPDw8fHx8vLy8/HwE/Pz9PT09fLwJfX19iRzp+WUh/AQB/PwN/f3+JXkSfn5+kdV6/AgHBiG3JjnLf39/koYL///+ir1nRAAAAAXRSTlMAQObYZgAAAS9JREFUeNqFlOFyhCAQg5u7XRBBLVxX3/9NG6Sduys4jTPikI+Y9Ycf7wLF5VIodhz4xzfDhQukBhRUdT4tfZjZQ8vJoc9PRc2Ufkpl1BV7MdvNKtDsnliWZacPXE5xHGVJ6dL3scbH6HHha47UlHVIgCd1yrTVR8MA+PIyKbVNwknQA5/iaeZJmFBSRDdBFMlK+SwxdaOA7XEXzw4id5CY8eICeSfggjAhOwekfcNLupW0zSCw7usagsMHNnu2AP3CROgcqp89zr0nUDtz7+zAq5ZAfJ0DQL3fZxWl/KbEuzkJyC3XCLkJzcGX4gzCCMnq0PQHiGXTGqEpYkQgsThV1zEQ7AewMHoHXGj77WEQ4H63HQlQ3RBvQO+vawPOrHXl2ge4dqxF9N+pqv8JfANiwQ/bhvGIugAAAABJRU5ErkJggg==",
  orc_priest: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAtFBMVEUAAAAAAAAAPwIAQwIAUwQAVQQAXAQAXwUAaAYAcQcAcwcAeAgAfQkAfwkAhQoAnw4BQwMfHx8fWRUmSRYvLy8zTB0/HwFITylIXypYRjVZUjNaUzNfLwJfX19iRzpkVDhvXT9vb295U0B8WEd8XEZ+WUh/AQB/PwN/f3+AW0mFXkyMaVCOZFCOZVGPj4+UaVWZb1edcFmgclukdV6vr6+/AgHBiG3JjnLPz8/f39/koYL///+5NbERAAAAAXRSTlMAQObYZgAAAW1JREFUeNqFkotSwjAQRU2KLigxoqW+QlR0AV+gRkwp//9f3hSlpi3jHaZ0ek42m2334ggkelDnzheF+Id7HxlRdd4IToQ0OFC69N4vU1d6TcOxS71PwZldW69i5bxfeQ/OFY6NyWSyQgGxq03risJN2O7iydBiuUVEO+9xSZkXvq1Fl/TOX5iB0WuLIb6Gxwdvr4whhJ9A6hXsfvf2/fEDfMFulK/XIuLsOOkfPT88BW55NsgHuYgE5uSwf3Fjx2OLzD4H60rAfu4Lx090//T66p5xO8vn+VxUb9kx5heEfvfk7BJzEKN8ZLdCyfFQSt1RWpPEfXrnuaqAmgL/RkrVIaIMgsVGf3sIV5kZ2VE0NWWJxsAhkDRmmhlSBIZFTUFJacgoCJvUuFRaUqYyDeE3cQEQrDdKtwjgEOhHqEpEXEGQmaYgNAtQ2CGcIwiaWnokNB8LtUNOBYRwEkKpBoZgjJBhFKCIafnmomz5N0bILIRiMkOyAAAAAElFTkSuQmCC",
  wolf: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACg0lEQVRYhd1X0ZHrIAxc31wBlEAJlEAJlEAJLkEluASX4BJUAiVQAh3wPnLiZIyTe7HvfTzNZOJxjHe1WgkC/K8RY6wxxvrquelO0HmeaykF1loAQEoJxhgAwLquQ6zbCMQYG3gppd03xiDnDADYtu2A93kVeJ7nKlkS0QQAIYRqrW3Azjl5vPYkbi3BGUEAyDnDGINSyk6JXyegiZRSDgQ+/hUBia9yVPlc9sAoRHYAWJZlkuzFKzpuL4GAS70BQMCNMSCi3yGgs9bgEjlnbNt2WHdLCYhoJ3E/BwC04XQrAclaAKXVNLj8dgsBGTrSThpAaiwkNJmR+SR+5AFtrJwz9JSTzDQp4KGGc25331qLeZ53736pgB61epoJsL7Xy92rNIrhINKOFhANINc9uDEG3vvD+56QmIYEnHM7g4n0IYQmvWSq6+y9R84ZRNQIppTatjwi8XQUhxDaRhJCOGQlv3nv4Zxr4ADAzAfAUsphEA09kFLayS013bZt1066/foXCwnnHKy1SCnpbfmcgHa8bp+U0gFYaj8C79d573ddItFKwMwVQGsduZbIObcW0vUcZdVHCKEpqchOgFLAez8xc40xgogac5EQAJZlaQRetNeEx3YL4NusagYcDyTMXJkZ1lp478HMIKLGWMy2LEuTUbu+A9fRn4zPj2TMXPWAkW8NLjuatFopBeu6noG/jOaBdV1PwUspO3Dgez4o8LfiQ8BlgmlwjhHAw8ka/MT1b50tmgJSz5wzVu/BMcISgZnBzIeFMniuxifwZbAvYACwapr14HrMXpUfULIRUXPr4OUTgEpEzZDMfMl8o4VnfyTlmSqAXetdOlf+7eKnPf1O/AGrq+8j1qClYQAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  ghoul: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAAZiS0dEAP8AFwAUMJQdewAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9oGFw4PImWZf04AAAAZdEVYdENvbW1lbnQAQ3JlYXRlZCB3aXRoIEdJTVBXgQ4XAAAFGElEQVRYw+WXXUzTVxjGf6cUaGlLKQooUop0ihBaKYrKppkuJosuJEt2sWUXJkt2syW72LLrLdn1Mrdk2YWJm1mybJkXxhi3RNlEixZFoAiKoBBwflAKLS3Yz397diFUCuWjsLv9k//N+Xjf5zznOe95DvzfP7HB+XKj8TYCQO7ZtyetoetWV9Yx1wtANjU3UbGjAikliXgCKSVPR57S3dmdVVzVCtQu9wNQai7l11PnqK6p5vefLiClRFGU/0QDsrGpEV2RDkuNBcd+B9FwlKH+IUbujnDtr2sAtLzXQuUrleRr8lFiCkN3h3gy/IQ+d19WDCweKOt0OrYbCtAdP4JnzENuXi5SSrR6LeXWcuKROH0dfUgpKa8u58JvF2h5t4XRwdH55FltsTotua0OnVFHnqUCz6iHq39fTXU27G0gHo+zxbKF4tJifBM+/F4/ALNtLnIqKji2rYxtJj2hg/sZuz/G9bbrcjUgCwGQlElMD0YJFhTOJ09NdN92y/pYPclkkqpdVejdfTzyBWnS6/HPhKj0PKOqxIhKJRj3BrHarBiMBqY8U3R2dMrlQCxslDVaLdZNhfzx2LOsPnY7dlNmLsNsNaO72k6+UKEAsTffIBwKM/F4gpnADIZCA42vN9JxuQPfhI/bN29njKle3JAvVtw20dvTK5t1zXhyPVjeOor28jU8h15FJZNIIZkan8LV7gIg4AtgtVtREgp2h507PXeWMJF2DMv1WjQyyRcHbJmqXAqEq92Fz+vDXGUmqSSIRWMUFRehVqsJBAKpcc4rTs58d4bITATjZiO2hqVx5wHIY1tLueL1QY6arzr6+MxRsxIIQs9DdH35Lf94A4SjYfpPnmbw53NIKRdvsbjhvAEKmMpM2B32tLgpBoTqBTObTAYAvukZ5OPdO5YDIdxdbsanZ6n6/EMEgtL3W5iYCTHQP5Bpr4XzipOkkkQs6koBkMkkAN+7B/l0zy4Afuh9sOIRkkLQdr6NhJKgs7Vz8eqXfIb7Q8hF65kHIP585uV4eSkAJ7vup+hbUZFNDRx95ygSSd2+OsTKAiYHyMnJWbkSrrGMSsdeB8YiI0IISiwlDN8ZJhaLAWQqx/KjeiuPArNEowqtE1OpfvV6b0e1Wo15p5nq2mrisThbK7YyMjDC2NDYErAnPjmBMOgp/OU8XpHk4OZi2id9EhDq9VzFjfsaMZWYABgeGCYaib4Ala9me812hErQ29WbYrO0/SZf9wzyQbWZVo+X5s2mVa/jZZPbHXYMxQaKSoqYfDrJ+Ng4Z388i9/jJzQdIk+bR4G2IG1ScE53RpN+jmaxbgBIKbHstBCPxZmemqb1YiuAaL3YStAfJOgLYq4xc+jIoZSmTrkHAQgriRdiFBsAAJCIJ5jxz+ByuhbqRricLoK+IAFvgMraSg68diBN2MrcUXd6X4owGwDS1mBDo9fgfeblefB55jLtdOH3+lHiCoffPpxmXk/3PVxyvLNmwLLTgipHlbZ6jRCyQIiUZbvluoVGq+HS2UurGpSsACiKwsP+hyixl94vF6QEQguqoK3Bxr3ue8Rj8XWb0oz0DvQPEA1FF1Y8GQeiC5LbHXZ0Rh2R2Ugmi7YhAKlT4J/0Z+yb10h4Jrxmf5iVCFORlqn5Gr0GKSW93b1rNqfqbJLX1tei0WnIzctdMqDpYBMAkdlIVoyuBUDqCZZIJJCKRKXKTNx88jnns6Y3gsiW/iXXqwAVgkhmL7Bq/H8B7JUnsw/+2NMAAAAASUVORK5CYII=",
  scorpion: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9oHGAwDNFt/aJsAAANgSURBVFjDvVdNa+JQFD2pr4owuhDaCs5aCJJpYfaCi+AfkMKArmbpLGW24nZwOV3OQioMiH+guBC6L+iEEHBdIa3QhQ4Ea+ydRfNekzTxq3YeCEl8ee+8c88990ZCyDC1DLnvK9UJetePEvY8PAv2OikCgB8//6JYiInnV/05ioUYTnOHUM8fpHcB0OukSJHjaHenGOg27u6X4sRqPkoc0L5BMPfmmmFhoNu4+bOAMbJfwD0DoWIhhqG+2GsIGACx6FBf4O5+6dncD+L7tw97BXAAALXGTOIgbs2n0MnvwYAYaj5Kaj5Kq+Zwke6dgXIpTsVCDJcXR/jf44BfnOYOoRnWapbWqN/vHRuLkA9Fjm/1crOe8GyYVsa70SBnGTXrCdrmBM5c/29rVhgAGCMbrY6FX7+tN7vprqyQmo9uxYKzEe3CSqAIb80nDHQbmmFtJKZyKbmOFalZT6BZT5CbFf/aXISSMbKJRYChzsTEtDIOVX1aGUvOHPKHwfX+q9D4Q+LJAnv5XPl2yQgAaHenoRqpNWYUpJlXWlBkRmo+SptkhivmnusgfazVAB+aYaN3/YiP6QMMdBvt7hSmliE1HyW/FYecOFQfppYhU8t4NMEC6CKn+kHOMqchmaBYiEGR41DzUeKWXalOYGoZpJVxKJgXUHHicxyAVGvMpINVeW2MbFH9BrqNSnUiOqVKdSJqh6ll6Ko/h6ll3OLzNDt390tc9ecY6Ha4ifjp8p/qqj/HyXEEd/dLAaRcSnrAuHvIy4sjaIaFVsdCu2vxqotiIYaBbqNZT60G4E+ZZj3hueetG+8XeeYEAeKFTj1/QLOeQK0xg6llXmkgLI2InzatjCFnGVjkOW0/fzoU3dRQX4gG1j94v7myGm7g98S14WaDewcAnBxHnDhPRZnnAHj8a42ZyCJpldc7E6WAsEjuEAWBOTmOiGdnOeak9BbFzm0sQebi+58AkJxlpMiMep0UlUtx4m2e0+oFFqlNQ4ByKSmoCzAhCQAZIxu9TgqtjoWbPwt8/RL3NLQu+qWVAIJScB0gvmirY9FZjuEsx1ZVTBFeFlbp3tpslktJ8ZXltW9r+ywIYiSMoXbXkoA4AVMhyN71o7v99zzb6aRBdhvk/TwD/G7qAiTt/XPbH+t13vIPfpEEGMoGOkQAAAAASUVORK5CYII=",
  wolf_spider: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABelBMVEUAAACARjSXV0MAAAACAgAJBAMT/y8dDwcjEgkjEwknFAkrFA8wFRAzGw00GBA3GRE8IBA9GxU+IhE/IxFCIBZCIxJCJhJDJRNFJhNHIRlHJxNHKhNHKhlHKxNJIxlJKBlKIxpKKBRLKxVQMRxSMRZVMBdYLxhYOyJZNR9ZNiFdNBlfMxlfNRlkOBpmPyhpNwtpOCptPR1wQR5zOx90QiB5QjF+SSKBTCGMUBqPUj+ZUzubTgWcUwqoWRKuXgCwaAK0WgK1XQO2XgC4WwC4XwDAaADEYQDGZgDGcADGdADIYwDKZADLfgXNdxvSdwDTdw/aewDakADccgDcgQDckQDebgDgeQDgmQDidQDkgQDkhgDudgDwgwLwrwDymgDzph/4ngL6gQD/hAH/hQP/kQ//kgX/khH/lBX/mQf/mhf/oAv/pw//rAv/rA3/rBv/rR3/rwP/sh3/tBP/tx3/uA3/uB//yCH/1kf/3lv/3mv/32H/4GX/4VP////1MlzfAAAAA3RSTlMAAAD6dsTeAAAB+klEQVR4AXWS/ZtKQRiG8Si8SyanqPUR4V1il93sECaxG0M+1Ma22mV3Ea2PhOgsf7yZqVzF6fzQnOu973meOVezY9wDAGOh5ftmWWA8xsLKJ30lM2LAzvuvvLCWl8t1OZyBFKCqgONLawnOtEpzkxjiqkrFZIxh+FOdmE7kWxfmBgkAiIqpFIxGEKvf8tOcb7+Upybg8O5K7HsBiBRTxvvQXly9dXaEz0+pSJEjgEfotkv5Z+8eHO+s6PqsmAAMz00BQMQYRNtassz8/rFoF8vR+7ad5jeiCD+XpZAvfq1z85qY7HFXssuuSJFsGf58q86iqYXlAwHxL3cJoJYJrr1nPnmiIw72OSz/evVh/CJBNFl235oQ5u4xwlDAUhyIK2qx9LeYJYta1VNUaAwCNmOwNaR5/bHl8p6vyfMqR70eT56zHAiLsBQsmNX2I1dwRr1xQs7ysq9LIhsW/Oqz/5FIeTPngUoB7gRW8MuMrBC6U75znwDyzG6g92c6S5s6mIQDRDD7gcIMANVwxl+Ls7xXsTVeA4eOAMnc6JUqXxc9+KQQCt3ewL8GfM0WAhA3QxCHAUQxzMvaICEA3Gj0DzBaYQ9aa8ImJIDoPILuezpthUsbNj6H/7nahF322G5EA4TTaSfsd/EBvN+LywHpjvfnCOCj82AePP8DsJ5VcL/hY14AAAAASUVORK5CYII=",
  big_kobold: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAflBMVEUAAAAAAAAlATolJSUpKSk6Ojo+AWE+Pj5IPTdQUFBURT9jNxBjY2NrWlJ0AAB/RhWIc2SIiIiJOMeVVBuag3KampqfYiufn5+kAQCxsbHBgkfBl4LFxcXVuKDWAADY2NjdDA7otZ7o6Ojvhuzw8PD39/f7+/v/ICv//db///+wEWHzAAAAAXRSTlMAQObYZgAAAWpJREFUeNp1kI1SozAUhT1CzMb8mZJWsCFaq255/xfcE3bKNFAPQ4bc7+MG7kMdYFVY8wA6zK9cAjLsdviFi7Yt/DzzbR+MY4xRXvnpGFHzOEZrbZTNf+F4OuIWQ/Ltj78fVhqJbQecz2cbLXlspbmecStcHi87G5lxETpdCRixe7Zj4aIA6DddfQPz9MdIcrn/5EYfyOsjHi2pMv1+ml6NUl0tWEYqJWV2aRqMYC/y+gjZO1668+9GqDWnMe19YA6D1z1HjurlsiY/pDQM5hBy7654mSnQSp+m6TPtg684hZfjqdNaKkfhqwguYwY3HfRbp5pM4acIee4AsRiM1g2Qvqf3+YgMFlVbD5I1k75TMgcfPLEgXwU+pBTI2U5sOYVeB0Jd5tXgDnfZkWWXuZKDqQXy2Sgrrtl24CVc4+4JJLzhRPmDe4ISDdCzqPi04RSWKhqhmhUvVQUskxVqxS/qogSqTd1+zt3dP/Q+Guk1bbcLAAAAAElFTkSuQmCC",
  ogre: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAP1BMVEXvyGsAAAAwMDBAEABgGABkOx2AAACAIACFUB2KUDmgAACgUFClb161bwDKj3LQ0NDVjADgqADlooL/tpH/069l/2LMAAAAAXRSTlMAQObYZgAAATpJREFUeAF9kuGO4joYQ/FSGLzjeFN33v9Zb7+0rG7EwqE/Ip2DFam9TGDn8gFk+9nwyedn24JPA7sP3vtvbvyO8TawNyfCW/97J9Y/C0C5D0wKrzqR73/u+yPKAmbvxKIHlK34/wlSXuZApuLEmD01Kmmc7ST462uYTFzER+FngUgiIJaWRw3tWDhvaACkCrtyAqDzDBwClJwdV0JcoNTCWYjg8EUVGMN8XlNMKPv0tgDq9OeGtUg+kK7A84oDUNKyUNIvSbxeoZiYvsXWl6+vhTvLcm2gOb0P3NqjisHSbw3EHLTeH2tr5fdjaxhMA+xtPX790W9zgNZaZ1+5FuydbfJVjP+zrfU8uqaBArSayIaVco9nX0GyisAIHL0MyB4edZReBnS8gDPW+ODmQCJxrlE7c4CD6XzyH88yGFL+7wv6AAAAAElFTkSuQmCC",
  orc_knight: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAQlBMVEX///8AAAAEAgAiMTkuQUsvLy81NTU7U2BQUFBfAABiRzpiiJ1tbW1+WUh/AQCYsb6kdV7JjnLW4OXf39/koYL/AwKl5AhJAAAAAXRSTlMAQObYZgAAAUhJREFUeNp9k42OpDAMg89TJu5iuimZ3fd/1UvnhMQUdAZVivxhU37+fAhDp3kW6CLxHz9EFeLeBVpzslC8a8LPz/71K379Pp19z+lC9Naf3J/P7mytA9eOV9/3/bXv7K3d3MYjie/Uq/eWl+PiRxI9q/t3W9N3zID747H2nvFrIeIGYKHW9e0vIScmX4WeUFkoLpI7poRSyPDhkMWkSwmqUREhcoGZ2+xvdTN6kFlTkqgbPvyo24hwLnkbAHIUTu/J5dXGKlIlHZz2AY1gGUgPl1iSABkHgXBSBIs4SLIgiZAOgBIAqvjIMh/EZwfepaW6B2UmDQvTs0RutHrIquWJNK++bTUPey+YPjsEahIYGkRgIqAYwf9Ua0gz4E4zHES4rh0UDtFDk58dIg6JY5h2QZ0jyNkPd/JIBcM5AdLpIrjkuP74t9Nf7hsQmDWiu9YAAAAASUVORK5CYII=",
  orc_wizard: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAWlBMVEUAAAAAAAAlAiUmDiYvAC8vLy8yAzE/AT8/HwFGNAJOBEtfLwJfRwNgAl9iRzppB2d+WUh/AQB/PwN/XwWABH6DCoCfdwigBp6kdV60EbC/AgHJjnLf39/koYL2zKZmAAAAAXRSTlMAQObYZgAAAWdJREFUeNqFk4tugzAMReet0NSQBxSDqdv//83dpGUipdJcCSGfE+cmqF9VEaruvHG1x4P+4WaVUU1PT0Ep14EDNTczuzVavKOhSRuzBjwl/ZSV7mp2N8tCxlSqNoZhuIP/FN5f5+s8045H0sdDhxQkok0XGP2F9hNWwfKwSmzRLkZfceE1hLBGcCqN6/y2PkZJ4ILfK0UlgHNMa8arMIHXA9BnCMIRxW1Lhx3Q5RiywFEQttoBnIVbMBwBoiRNuwlEhMML+swsLUqCaf83gdQ0IR27bhzxYEfcBu3VNiHzsDLxOBblmxAx9KabkBOREJ2Zx469xxHR7TXtMuTH6eyRwUfvjtdUtJOfPNYvkycUOFHNz5OfeNoLqE/CghT5HisBHDtAWPyEEWXCQZiwfxEW7z7t4D1YEWDgU1Y4G4TZEBBii3D8Wy6en7grE2qOa6ZX5W9Ch2vqOueei8i5rstCXbvQ5W3jv8KlHFMOTkhnAAAAAElFTkSuQmCC",
  mummy: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACdklEQVRYhd2XPXLbMBCFPyUpXaRE5dA3wA3MkkfQpBGO4FKd6U6lbhCoybBOhc5Q6wpHoDuUKVylQQoSMOmfEUBrUmRnONJgxH0P+94uIPjPIpS+8OmMwKHvumISqzMAMwJTrdfnyJkP3ioV+q4LersNLCg/fIBt33XBOkfvPQCVEKjdbpoz5OT/shA/WOfYNA0AR+eohCBYy6qukyzVen2SxFIC9N5zMIZKiOcqrNcEa3n0PtsPSyRIO9TGEP54ri7ltPzRC1m5SwkEu99jx5LXUgJDNSohFnVBsQTXUlIJgTYG6xwAtZT8+KVnRMfPs0oQWqWS5rdKcaefQWspuX8w3P00BGs5Okd9c3MSo4iA3m5nbbdpGh69RxtDLSXXoySrus7OXzSKN01DJQQw6H50LskQu2IEX+WAFxM4GJN6v5aS6SCKJEojl0Cw+z1A0r33HjVWpJYydUJp5HogBGs5GJOAgVSBNpLqOnrvs8wXI1uC42T02lH76SyAoSr3DyY3JVAwB3rv6c2QPJY8PjEqIbi6lEA+iZwKpPZTux2VEGn3Uffb70Nlvk3OhXMSmBksAkznwbDrwaCqadDbLWTeD7II3Co1A4xGa7WeydBq/bI1w4tnGYE7rZPTgVfGm7bfiXZ8RSKHwKrVOt37YicABGvTLIgxJZoTuV2wGm83HMa5H7/DfAKON6F387xcKBnF6eU4/9Vu92zK+c04C7yUADDXH4aSq6ZJpErAFxGwzlFLSatUWou7nq7lgJcSCO3Yjta5mdniGfCG+0+eB59zwfuu4/fTE18vLuIFNIFb516t54Bn/yiSeOfdtwbMP/t79uH4C/RtYgX6Gr3KAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  wraith: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACbElEQVRYhe2WW5HeMAyFTzoFYAiGIAiGIAiGYAiBYAiGEAiGIAiGIAbpQ1euc9t/8286femZyeRmS19O5AvwX/9Y0xNBYoyrXasqAGBZli/F/hYAM6/e+550r1LKy/hvAVhi4M8XX0G8cuLHE8n3Gp8z83ra6EM/7wJYghBCv6+1wjkHVb1dA7cBnHNoraGUgmVZwMwAAHNlL2ZenXMAzmviVg1YtaeUkFLqADFGLMvS26kqnHP9GJ/vHToFGIfVqFLKFGNcRQS1VrTW+jsR2UCYRghVhYhARCZmXpdlmQ4Alnwkt87jeZ5niAgAgJkRQkAppb8bAUwppf7+1IEY46qquBrbI4RzrieMMW7azfN8gBiTj+83ACLSrc85b5LuE1hA4HcBppR6IVphjrFijCildNhSCoho6qNARFajMnuJ6NSBEdB7j3mekXPuNRFCADNjnmeo6sEhIrp2gIgmEVmt037SyTlvvt7aGJBp78IIT0R9SG4cIKJDUbbW4L3vE40Nv1EjlLlgz2qtUwih/9q9q6fDkIgOw/CzRQfAAYqZD8lVFUQEVf18HjiDEJFNMEvaWutn7z1qrQC2rhhIrXWyteElwBUEM6+qeloLowtjDdRap+H5+wDe+94xhLDmnHuRttaQUgIzn86IewiL8+liJCLTCDGucLXWKaW02rX9HlslDWJMfKaX+wERuQxwFpyIJoMwsJPa6f2+tCH5DGKvj2Ibrx/Zd54OzTGpne2waX3/9X8FYA8CADnnZxK/q8GFqwPAG5vSF9okIKK+Z7hq+0yBDF90V08AfOtfP/0L7uq4J3xTd13oeX8Bqmy3eNpPLuYAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  troll: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADl0lEQVRYha2XK5IjORCGP28MaGjYUHBhHSGXLfQRBAf2EXSEhgMFBxouzL2BYUPBhobDtCBTJalctnsjJiMqVCqllH++VfCUtEKp6zSJz3NNgfpg42+iuFTIJjQu1QDlGl+pcqSm0EdH+HtA2YFay09q+UltlhjnIwjQatbRCml+f0B/3BOeCgcoAISPChFAB65C/kzIEfQKKQgkgfhmfEkgJUjqbvufFF+bVrUSXZPVHbki4cYNoM4jrrkOo+6CONyzgF5B3yqUf0lZ5vW4QH4DCvE1UX6BHCHJAvnkXApIH5NbhbQrcwfFoLkE0zougyWiax27xhJc42g8cfFv4jHR9nbajQGjvyCbhqhrkheg+BgILwDBNIxn44tn5zkan0ZXSNwiM90FIO86zMIwhvVr/kwmTDKUq61dPk3Q8gGiBjxeDVhK7qKeGY/9kaSSkkV2Pvq3dY3uZ7qgxrd8wOU7LZOIF8jvnddj4YELBiH5BOgB9GDpBZM5Jdv88tk+mHDJBkC0C26p6fQFCzgIdOBNtUe1ghQIRwMq2Viuv2y8/A3LP3B88VgKDl4OXwNQmllHAFrXohTPvt6AimlNAa7A5WCZUpz/amC/lpJjYdmQBE8tf6YUTT39tnvWfmKB+DgGYCgsW2wRtJhGYyDmEyw/3AVh/7yUfJLqEwDqASPcapNBgh0Yz5bz8Wrfjy9w+dN8Px0nrK5ISk+pR5TkjhuGbtfMvbwO5o0+n2iollqBJxZYswCL9HnRTBnPFlRSLPXim68Xs8QovINf3fAEQHq81sDlxX3eolrsUdkRPu99AEDr6qNybTvng+LZgzSYz/tef8pGeAIN0xH7AOw242ZXPzPSNUx1so5kLOdxQELPjGXvfG9auwAGLTUCekDLYS4a4v3h1LsgJ2jatjiQAhz7tihYapbWlPaE61QodgEm8XtAHKO9P+N9cFyLejN2C1hV88C7QTYIV4/+i2kjuvE//T4Yz54J986bhGu/tdy1QOr3vrXUpln79dneDx9ZICVadxqE7TQK7ampwX18Tzu1+kBgvk2vNNwHYpOZTHDc4x+o9Qct93nWdj3ukxu2OQvuC3aTXXtNWD6eoLxB1F4myz7vhiONnXEuszPFxbUvHqz0i8qGvtnBW/9PZMHYbj/p3UYNrJ1togTZx7h4l7ww1YNGN3Lj7t+LR3GL9u14A3ZYly3vzflf+Ut59l+3PeMR/428/wCehDy4D+7RwwAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  harpy: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH2gEHFSgnPXz+ugAABDRJREFUWMPNl19oW1Ucxz83TWhT07J07XRZ5+YQQVpBbdL5mAaZ9Gmd7EWIs6MYBB/2JpUiXB+GRRha2EszxoIOx6BgfRC1lDX452FbHioOu4r0z9Zmm+1cSCpJF9frQ+49Offm3ttU9+APDrn3nHN/3+/v9/v+Tu6F/6Fp+jBbCkgPwiCQpvL7GMxjBY9FAsQigQqRlA6GDhhNaRyU5tISqSiQGrAGsvPoY5GAFosENEFA1Uc1M9UxqK/VZqTqYwcZ0PTIq3ZQH6qDoxQaKhrpSokSiYTJj8iki3mdFmKRAFeiGxqgGHPZue/Eeuj516qbVbREIqE4+rlu9mOXAcE61O5zZBsa/sj0m5m5aFpPJpP/TYQGuBOJ7Oj7lAsrLI+8CUC4L14XiFspPDVRdngFCfHgYCV95cIKn/QO2YLo0Zsy6ZZNRwIyCZPYgAO9Q7zz/accqCWhqKpak0lbS1selDUQavdxY6HEkcOVKLJrf4uNF795AMDytfN2BACI9wftS7deBuDK9Q2sYvTatp+UiX37GwGIvPwEA0c/xNfSWReoNZMGibpKYJgBDjDQ9waGDpavnQdgbKSTUIe3tmQS+NTVDVcx1hDoPtTE1NUNAX5h4j7R8DFyhRLkbzI3+wO51SV+/vIDouFjYp9MQgbft40QPXbCaWtt4MLEfXF/Z60AQK5QovDXJpADcmJeJmGXjR13gWwDR3YxfOYyvy2tc2etwAs9h8X18JnLrs/Ozhf5+qe8KUCjDOPj46ILRAfIgvkz/4jZ+SJjI508yD9icirHV5+fBaBYqkTuf7jK0XfPcvL4bgBWb28KHx9/tmbqsnh/kBsLJdpaG0zd4JVBQ+0+odbZ+SKAcur0Ss0J5m9qqVw8ROjk5PHdBqi1xXdeAoOhqqqoqqqoqqoAyoHeIXw+L7nVJcjfZHLmkoj+1OkVGVhBjdatAUUHNJl8skn3Suilt9jVUmJy5lJFoH+U6T7UxLP7G+U201DT8juCYhxkrhnIrpdtTyuryeCGvdLdzK27ZWKRgHE41ZSurbXBnYCceqc3pnh/kKl0XoBvbW7VtJ64Tz2GNnQqyS+/Ftna3DLNvd7Xyq27ZTJzRVMWstnsvyOQyWRkcO29Ex0ABPVUeho9YoQ6vHgaPc7/qA5a81gWFZlxOBwWqR9++0kBZJAYPXev6qjRw8S3OZ5+yv49IJvNkslkFKvGvHZ9m0wmNbv5vXt8rN7eRFK0MnrunjY20mkSZM0fUygkZ1Rx/S6wUa9mgPd0NVdPuBcrpyhAT1cze/f4+F06CQH0khn+tHA4rNXzRWQ7fvziubrXY5GAFu8PavH+oNP+7cEXp/3SdZfNepdlj1/bLgg3EpobCTfni9P+uvY5EVAs33HWexan/YLlM68WTawXp7uABdO8sd+y1wnHWQ9yZPZl8dcbsav9A19VHtYbytH2AAAAAElFTkSuQmCC",
  naga: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADTklEQVRYhb2XzUsbQRjGfym9G0gQTPzYQ1QoCpGS3oQUPLT1Eq9SbG491vYg9GKT9tZDe/cktM01J2kOQhcEDw1iSkTQeoiJSSEkMP4D3R52Z7Jf0ey29IVhPnbmfZ73mXdmdyOEM8PVj4T0E2qhkcvlABBCAKDremgSd8IsEkLQaDQQQiCEIJ1Og1eVkexuwPlGLpej/O4ZtJoAPHxfVkqEscAKCCEofSoDUNKP+La1RjQaDa1CKAKzE3GYmia7kAq6/K8JRGq1GslYFIBEfIySfvRfCRgAyY1taDUp6UecX3X/KgeCHB3jy9YG2YUUifiYGuz0rmn3BclYlHZf8ODlh0B+R1XAMOplsgsp9JMLqmeXDnAwtyMzP8P3j68gQDIGOoaJpUXWlxah1aTTuyaxtEhCPrSOZVALlgOtpgJv98Wgf1w3VZmavkkFX1VGIWAY9bICluA/f/U8fVpNmJr29UFBkXAQGVmBTu+ancqhAju/6tLuC0e/07sGUMfUZhEKQAHIKiIjEVDRS8usLJNdSFF4/ZzM/AzJWJTZiTjFUsWx8M36IweQIqEB6QGJm5LQMOplOsd1AHYqhxRLFVYz99irnrJqZb892p3KIQXriM5Njg/3bBNomAIGoMD1kwsVYWZlmbnJcTIry2TmZ2j3BXvVUwCKpYq6GYde0xpgu7f8FDBlB2g1KXz+KsEjgFHdP+D8qkt1/8DX//lV93YCNvPfAmvPXeCAqYCqW02qZ5cUT537v569rxJSBgXArlVqKJ++BORN5wYHiPTXaMfe0jmuk/y9DT+cawtPHwNmPijwPGbkuzjk9zj3MPY+N9gFGpjHSbfaNRUVMnGTG9vmQBrYtOYO5im/w06BHzFDHSMsh5pFwG7uKzlnzZFEXb6DfZJpFnDW6rvBIRJ58sJ55co1mr/Lkd+G5G2ADatoQN5LAhllHnf0pq8QBAZy61aRYzq+0gKmUg2r7byd1TthdAINBlHLto7navVdp+HJfkkkGAHNVcvxTQcJs+R95vrY6EnoBtdwJmQaM+M1GzFZBPYccFigb0JPVLLO4twabM9rmPuv/wsCdiC/2g0MQyMPQ8AkAabcUQaJJdv2sVuAJX7Y3+pQP6J2YNn4A74LhhwjfS9JAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  basilisk: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAMFBMVEUAAAAAAAAmByYmOCYwHxBAD0BAVUBNNiBOFU5OZU5cQyl1kXWHZkG9vT/6/wD///9nr6m9AAAAAXRSTlMAQObYZgAAAR9JREFUeNqlktmOhTAMQwkphnTh/z/3uqHqwpVmRhoDD62P3ahi+7PkN/+SfwP7NyFjS9K1J3n7xaT7dl3WliM0NuQ26pav/ABu+gSWvE6AWc42NTLv/gByjOEBpLYzvwJACIB4VCQVewOK4wB36NKkS389Qq9DjW6iKqGm68i8KKaq6e1834BV4GFc9BfA4v6kidS84dVgObYGg1EA1iHtDCTQIEVVkgnIvCmm+SqMaRVVG4RYDIEVaCUKoUxlGiHnM7IAdP18CjKPcHpFuwKkJEVnIOenAo6wnZ8CIn2EM1DnqdbrSRQUaQA3n0N8dvoQqsgEdIGAur/x6b9D6T6YVMDrH9Xd3uDZUe8+2Q4UbdFRvznLpZ/ao0PO/rD8AFKVDOWiVfMTAAAAAElFTkSuQmCC",
  bear: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIVBMVEUAAAAAAAAQEBAgICAwMDBAQEBQUFBgYGBwcHCQkJDBjqKqXqK4AAAAAXRSTlMAQObYZgAAAOJJREFUeAHt0O1KxUAMhGGz80623v8Nm8RSeqoo/nfOxy7M0wT69vf8Jyo/1pn7iMm3fXrXp8we9rXPnfYu4rrufIiwZIvDrhF2HhlP0IQZk07vEo/eTujx9ueyFyCRSPSI7CVZNO7gXa6fcG7jQTcQQk4QOI1xZee+RCx1I5AN8007b2CRGyRbM6cRL0CAlhGnwDcRYnnTSiNmkn0HSBHIC01CegUmxi2JimLJ+ALYMU5qhUqvfuYJzCwiKtDH9aId56IQ6l7neYLReIC6oPsLJEdU0n3kFAln3zmvz/+pf80HAtEG8H+e818AAAAASUVORK5CYII=",
  clay_golem: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACyElEQVRYha1XPYsaURQ9zwRSLFkL0WIxmqQQLJJgI2y3P0LBXyDaaBoLK7GysIk2Lv4Cwf0R2wlhIaTZgEVgh8Fihilc2SykmRRyX+5cZ8Z5JgcGhnn33XPu13uqYIjb2y9+2Hd3vUW9OVCm/ow2RJH/i4iUibG73saubTzPxB0A4KWJ8cbzgLUxRyyMMkCoNweoNwcH76dAZ4DX9+rqc2wdl/Nh6PspSElyd73FZNSJbbZTMBl1/OV8eOA3JcnjGqnbnypaz5bS+gH2/dHtT0Mzx4nlJCn6IMkvMpnASE1GHd+2HOQLOXy6fB+YiGwpje+rn7AtBwAwni30vuV86Eu/2VJal1n12g0/X8hpAyIhY46N54GLIHDyfCEH23Iwni0URU4CaC/5rTcHSgFAr93QaSED2kTGPAoikwgTLkvKRWgBXAQ54Zng6eOZ4KhWykdJpfjxbKECTdOqFf3X2ctANNKBLEsYYRiIeOeuAADXNw/7HggzJiFUT5mJJEQyYiLm5JECCLIsAAL9EdULHDJiiUQ3F58U23Ii6y3rm8R34qtTiggDX//vAqSIKJhmweg6pqak9yhiEyTOgLyg4spgkoVEGZiMOr48EeNGVPQKCQ8VcvQHiSSn6GzLwc5dodufKvp2kcnElcJnT3IBBBn5zl3p2R7PFsq2HGw8D9VKGbblJO6JRAK+fvuh38nx9c0DwKIZzxZaaL6Q00+v3ZDuAqVI1AOysfixykXI65YLD7FXRwVQ5/MLKC61JFSKbdWKlLEDHC0B1VaiVStGiqhWyroEdLsyKLAyvIgipujP02ewLQeP2yc8bp8AAK/O3uD3Lxt398E/Kh9K73CePsPu+VmLJ/uPb3e4u98ejGJkCfiMJz31du4KNg4i5j3jI2ET+lLEMXJgPxmtWvRaGOKOST9khAD8HbkIP3H/KQ74jt0FRs5OwR9R8rwl4gbrIAAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  minotaur: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADKUlEQVRYhbVXv2/TQBT+HIEUsdQSUdSCBDdQsSAxUTHBLVlRJ5ZKiWFkgXYolZAgYooylP4Jp0hdOmXvYhhhYeiC0uGIlLZDItlbNzM47/p8PttJgU+yznVP7/ve9979iIcKKKUSIQSEEOabEMKj92AViajPv89HfZmOXQ0zrwiVE7TWyXzkAlKCpwKcXNSvyEUdkD+r49+oIidiLoAj6AFqL30Po6wLXYFEqtDMlVLmBBUK+P5lx2Teqo3xvLkCADibxji2tAQ9QPeuiIMeEHYBqcJM6XhCJMZpEZHfve1jdO8ZtNboNGMjAAA+7H40thNEHRBzN9ReKsAGCdJaQ0rp5QRwcgC401jB11uPsT7+ZuYQufRT26WfZk71pxEAZE/lBAghjICaywFODiBDHp6cmvdN7ZvGs1cACeo0Y3SaMVq1MTrNGHZPlTYh2Q0Ak1mUillr4Hj+7Z0fQV8CB5Fv3om8/2kHTx7eN3EomVZtjBFraGcJyAFOTMEIr16/BZDNnATY5BzUU0EQuJuQBJDiKpAQAHjzfgdcvI07jRUjaDKLsLG9n29CAJgMPidFAapgZ0xk3MGzaWwEOHtgMoucmbiC28JskT9+/S6N4VwFG9v7XnhyisksMj1QhrNpnHlssrKyFK6Crf7AA4DD3bazHHZgLpQsD09Osb7WKBVfeVgQDnfbSVWw0fk08zfNd9V/dD7FVn9Qvg9wbPUHXpkbACAfPSiNQeQcCztACFaRAFfrf/1lOx3n2ZbVm8gpe6BiJywCHUKiDoRHg3QDardz81w9YpdpKQfo9kOHD5AeRiRKXwKtdtYRGzx74JoO0LZLhxDfhkdHA4g6MHqRd8QB907oAmXPr10khsN26KYlhGe/tAAi4KeefSHhI3dGXeRCesA1S8DBAwerbhFcpI2lBfCsQscu7SrPcJqfR3CeBS6oi9Qyfu2uEkmPn0/TlH5hAQ5Bhd/sRg1LNr+lBKgLeJvdg8p5vEldZbq2gOFwmEgpUSaCXLCX5z8RQOA/Nlwoa9K/RbLIo5RKwjB0/S+HZR3wFnjg+z5838dwOFwo4P9A0b0hx/cHKHao2mJpXBkAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  cyclops: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAP1BMVEUAAAAAAAAxCgNQEwhXk/daMClcWm13PDGNipSiclilb163YiS5scDKj3LR2uDlooLolkbouFvw+f//tpH/zqPPhMxyAAAAAXRSTlMAQObYZgAAAWlJREFUeAF1kwFv4jAUgzGlSeWd57H0///We060Cu0OI/TS+JOfBertVYhu7wWPYb1lAJ9nCOq/CNRHyTZl/UMg/llaEcO/FsFS3z8fwONTg3K+LwTGaXH39+PxnQjZo7IuAq6nAB5j+RrZdmUghklz32nLnAFXBGg7hFYA5yESFqCy5dNk70xDh8vEVcFULVXnqudOBZoEmGPXzBzVrmZFzeILkMWediNdQqtzXyfEL7Lv6JOj7JrinmLF44aQrDkLlliDBBgkgNMgUb381V/Ez6+DVDBnl217Pr8U8f4DqIAZEOD+/Cht23a/B0g7ExOcZVuL/7yX2tFmRJxwzGh1+/H1bMdx/KlPoqOAUgfavA5Vs9SA4VmyiFKbCrGQIxEeiB+hqWiVGc2garHsBRzzL+IClpZ7JTgbGWNlHPj9zjgAsOzeO6IXgJKFJfQIeGUge/ACTNOvADSGk/BbVwMODfW3LzeiN+5fxF0eF+AudpMAAAAASUVORK5CYII=",
  hill_giant: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAP1BMVEUAAAAAAAAoGhUxCgNCGAdLS0tOMyhPMyBQEwhkJApmRzFtCgpzTT13d3eBMA+fa1mfpabMj3rgpIzrvK/9xaM6gY8dAAAAAXRSTlMAQObYZgAAAXFJREFUeAF1kIFy4jAQQ6vadQjdRuzm/v9bT8KE9IbjOeOE1Rttpx+/APToegNwXbAsuvBGUKZzXRb+VwGvS1alOpjEaz9jsGrfuTDk4d8WJBmfIypHXCvUFEz8zveUkK6oSmamP3Cu1y8LWcI5tWuvxFNIzyPj+ztSQrhAnALdykdBBGtCHAUPI8a4p2lPfj4EZ4OaMnyrPsfd4zTAu+C1Wc73UlXq5yEEyc9wJamY0mPYTU5Bi4cEMkKarGDcV2YWZkPEpwa78dgmwooFuLrg8hKHAThPC3pLiHSiawptCjwaAo2Zt9tPmmit4UOlGRaiKtDb5XL7EpfLpYlVQt4bZIjee2vOb81s69ZRRoJBXzedr5+bXzrbtqKynv/stZttnTiWgCw8CyiZfe2Ku55Nnx1H7Ib6IyM895k8YzekF4ajGUuTcIJMC45mHBEQpxBkEpjVQBjgdEA1BJ5E+pwCWJVJvHL8BVEsjsfoFZh36V/RqCC3FZtRXgAAAABJRU5ErkJggg==",
  death_knight: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABRFBMVEUAAAAV1dUV1doU6+9V8vMAAAAFDQ0QEBAQExMRISETFRUTFhYTKSkT/P8UFRUUKSkUKioVFRUVKysW19oW7e8YGhoYHBwYuLoZ3uAaHBwaqasa09UbGxsbn6EcjpAdHx8dOzseHx8fICAfPD0faGkfw8UgICAgY2Ug298hISEhVlciQ0QjREUjr7AmKSknJycoTk4sLCwsgYEtLS0tgYItur8uLi4vLy8vMRExrrMyYmIzZmc0Y2Q0ZGQ2NjY8PT0+kJY/Pz9EdXxHR0dHeoFJSUlXV1dZWVlqampxcXF3JRd5eXl8fHx+KBqAJRyNPR2SJh6UlJSaKCKhoaGkQiCoJySwsLCzJye0RiS2Kia2yU2/RyfCSybGxsbXLzPX19fjUS/liFvoUzDsNkLvi1/0VDT2WDT/QU7/YEH/aUv/p4X///8vKpnkAAAABXRSTlMAMWCcr1m2KToAAAHKSURBVHjabdBpc9MwEAZgx+0iNqUmUrkRVzhVDCUcXQ5hCNiikHCkgQAD5r4K//87q5qOkePXXzzaZ1c7iloTtx/Gi3W5PQtRBABR3FlciOchn8cRjKePwMtOsxxX/ePyjxf+urhJ/BFMV/mD6roQxDzUT/gI0zGy6MScury9Fg9Icfp4jKvH/QxGwfocWD6WImJ65FYKPIJ7dshOf77Plqa8cSE9fxDmnw7OnlmxJjOZXV65cx/81nxcA3hxxVo9Kl05stftoRyaDwW7vl866jLnsv6r07evfnvJawR1uHfux+aBUUnl6PCnX78fnGxsAUNjpOgb4vQFyfwihP2kh1qiyDY2HmYMzN38fwCzmdNa7ll6+mUwGHzd3I1kGmDo+5VIxNbWTykSmskm0IgoDBWCU9DMydwGAlLkAcLIgiONG6pwiagCxEXOupBKqRaAQvTXia6dSJLeHMhRKdz/vNsVIll63d3bawXJ+5sCsfvm8wfsKdsG3j45xeLZu8sClfWirqfIkUVGDDJaY8AjIBjgRUFk2NGaRGwFmnsVD9KSBzGA+gYPyEy0YYC6CAELH3ITR2JbTgoTgAoRaS2gssYAh0Eg/iX8/QtG90d5EZkYKwAAAABJRU5ErkJggg==",
  lich: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC20lEQVRYhaVXUbHjMAzcvDkAhiAIgWAIgWAIgfAgFIIgBIIg+DEwhDDQfVzlUVzbTe/tTKZNbEurlaw4C34Hbe6XTw34BQoARIRSyh1jGmOsN6WUu+su+DJjqgpVxXEcSClVQiMQEVJKlTARfeK3a1BzzkpEehyHEtGQABEpM6uIaClFRcTmT0nPoKpanaeUpgQAKBFpKUWJSInozpouLAX4+fnBvu+3pfz+/kaMESJSf0MIwH+qoCklzTlrSumOlCoimlJSEakpWNf14zRcdsG+7xAR5JzbsYtzU4mZUUqBiEBEAAAhBFs/s9ElAAD6eDyw7/tosRIRiAjneeI8zzoQQkAIAaUUhBBARDiO4y2Jr9lg63xdVwBAjBHneVanIQSc5wkiqs5LKXjOn6bkLoFL02Fm6xXYtg3bttVCBFCVMVIzEn/aB96ROV/XFURUc5tSqs5ExDogAGBd1zrP1CAiiIiik46uAo51jdyiKqWAmSvRGCNSSkgpIcaInHOd62tllA6vgDIzHo9HjcTnt1WJmWuh+XGfCiNuijzVuShxSYGI1AYDwBrLRQGbF2NEKQXbtlVlgH/18XSglrZt25Bz9tuzwqdgYeaXaH1B+TEzJiI4jqP2Aw8jZYXa67KfbMMuvEojPPsBALzUwgsBH6WPulWmrQ2rF1fAi6mUc76Q8LilgN8B3qH/bf8brHkZ2jbfJWCOfIT+tGPRtiRH6bDnvRNTS2CxbdRK3sKnxtLRI2ZzvHoeL53QG/+UQAfLc98Dg5dSlwCA6TnPnPnIJ8Snb8MhASMxM9RG7l4+Lx1vhHe7YHHXFIM0aOf6iMAUo1oJIbxsv4bUnMCkCNUcWMSj1n0XPQJLSsleKp7ti3xtl5x1Tm/f30yLsON8AaBtg+o1pd9CmXlUPMrM/kPkcnXWDQsQuF+EJpsycz2Gt93tefQCM1sKezbePzRnnfH6TTDoEeqbl5sz9PMXC4QaN+cDkFgAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  iron_golem: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADFUlEQVRYhcVXu5EdIRDsVZ0hQwaGDJkTAiFMCIRACCgDlMEqgw2BEAiBEAgBU8ZVjYzbQezv/c5QV726uwfM9DTz4YD/jOmVQyEEsdaitYbWGmKML9kBgC+vOh/hvZdXCTyNEIIIIDlnEUAEkM8QOFXAOSfOuUujv+cZAPArRvwMAa21w54Yo5RS5J6tAwHnnBhjYIwBMwsR9cMxRiEi1FqRUgKA7pyZJcYowMeV6PdE1NfvEmBmMcYghABjDLz3MMaAiGQ0mnNGzhkpJZRSNga991Jr3Qd1JQDeLlcukFLqBrUKaq1wziHnDCICEZ1ey0sEVgX63/M8I4Sw2eOcQynl1Kkxpv9kZsk5b0r2aQXUoRrNOW/WVJVHcVUFPckA9Ohaa1iWBcy8caJrmqBnKKWcrm0UyDlPzCzeexARYoxdwkdBRD0XlmXpgTAzaq0HEocrqLViWRY4525GdIU1KScAUmtFjLHbXL+/JrDWPUII/Z710JrpvZb3V6DQsqy1TkQkMUYAPVFvJ6FKlHM+ZZtSmohINPHGmTA6Hs9Ya+GcgxLZo28eo5/n+ZKENisi2iSqTsd9hNpJY4xqc7NnQ0Dv21qrWXs6ZtUoM/fvrggTkTDzplzXRJ2AtQw1eu1y+/Z6YrRHpB9rLeZ5ll3PFyWntvdXcdoHtPzGQaRgZrHW9lmhKqzyg5l18Mhw5syNADc6odY/EYlKy8zCzL1RjbLWWkFEcM5hHFp3IF2Bew3HWivGmEOX1MrRTwgB3ntYa68i17kAYLgCZd0j//71cGgsO83osVHtSagq40Dao1/BfrG9f4UxBq21nqSacPegSunv3nuklHqbNm9/oK3r5qN0P9XmeYbmwBVqrSil9BF+FnV7/6fuTQLPDqJHQDuTlwTM259POaq1ngZQd0+FL8DHGD5s/vYDxpinp+GIRxTsSVhK6R2wlAJjzKbcXsHZy0gfL5rMnUBKacLQvT4DLb/xFQXgUAEApn0nPBs+L5FSEqOyw3V2P488Sqecs3jvT53sDa6Q3frVvqf+O75S4hnVDnv/AlA/JlwjYlYjAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  greater_naga: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADxklEQVRYhaWXP2gjRxTGfwrpb8HmIHKsE+YuB+EMSuEyeAMpTK6R24M47tIGFwdpfLLSpTFuXTmCuJVTxLg4yIjjrrA4skHh4JwUI9naBCORVYprX4rZ2dVKK+/K+QrNzM7Me9+8980fQTZkoi4TdblhfCbey3JerVYjZ9VqlUqlEn13XRfXdRNkxtq5UMgxRqrVKlprPM8DwHVdgiCIBpTLZbTWOI6DUiqv3fwEACyJcrlM87uv4LIHwGffNwmCICI3r/3MFIQh5+TkBM/zzMpXfzO9X/zDL083cRzHpgaASqUSper/Eih4nkeoAwCCIKC9/y8sl/AbyemVSgXXdXEcB8/zcpF4P4shgNY6IqG1ZmnBAaC4eIdj9RoAx3EigjYdnudlpiCvWKZWIacHHKvXXFxd89Obv6cm3EaQmSR+fLolIki/URc5PRA5PTD18Nv5/s74dkw7I6aQpYHIuXSauI/uA1As7eIPRviDEcUvd6FlBq09vMf5/g4ASinynAm5NGBR/GQ1clYs7cI6pq2AlenxeVKQNwIGlz3jzGIP/F4df6VOfxjAcikRhQnnqZHIQ0Ck04TLngn7St2QUJg60B8G/PHXwBBcLqXbiEkkiOSOgD8YcXj2iv4w4PjdFrWLDfrDIHJ+cXWNPxgBRNt0DIVC6FnFRHIRiFZvsfb5p7iP7lP79mvWHt5jacHhwQeL7B2fJSY+e7KRcGRJrE+QuEmEIgK0NuEcDi822Ds+4/Hax/zcfsPjYTC12sOzV9QW7wDw0Yd3U422AJ2xastORCFSQ/Q38XUrnaY5DzpNkdMDOd/fkWdPNuJ+iecxLTwRkKMxLaRFwIQdjPBWRpS3dsEoWtrPX3BxdU37+YvZ9BV0g/Su7kQ7PQVhzv3BiKXYOWA0EJWXPdpvu3TH899KtSj25wdg23wrzCTQfttlacGZcg7QWt3kQaOO/2uH4tYu7ybm+r06rMDL3/8EGgCigHLoXKXyS2ec9tYTAdHGqKiwvk1SI/1GPWpvh3NUclyEWduwQMoRqjA51JjtBCmKHtuyYMJt5xzFtm8FkYkI6LC9Pfu1HK3+KD2q+W9DjdHXeATstwlE0VPh+PVk/+2OYo0Rkgrb44aPYscJWJJdpsQXRWOu21CFJHTYboVOtmOjCdg9ryc7xojMHQFbWjItoJYkIZicJ1I1C7nfhCqFhC3tu4SwbnViiSuiNE0h74uo4N5AgrAO8WVj+1SG4bmeZHqsTCNh22XiFdtyFuY9FASifN+ILMfW/21Ppbn+gqc5tpX/ACrZ8qWQPms8AAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  executioner: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADp0lEQVRYha2XLZbcOhCFP+UMCOywsOclGDYbZQdegmGg4bDRsIZagmGgdjAaFqgdPD020DvQA+2SJbfcHZA6p4//yrpXt35crfgzS7tr9Yd+j/yPH5QLGq2rm8b71rspXe+DHAXEmEO8ewRSBu66+kmMexIpeY9a/VNahfj4qAitRCrMQymN1hm4+/4dgPFyucO3sUhKG4mVyJ7E0z3wI2BrLX3fAxBCIMaItTY/N1pjvEcpdUtiZzdxLMEL4Cy1gIcQqhdjjIQQ8KvcZhwhRgBe39+rcJQqfHkArlrg1lpijMQY8d5nUFEFwMwz3fkMXcfbjx/w/NxUQAgcgVdmrWUcRwCGYci7ljB0XYfeKkaNlwtmnjcSdwhk1oXsZU0nuMr8bxzzjkMILMtS3TudTuWSCrYkBkBr0jUESQgkSRp5QeRdnVLf93RrRXw7WbTWhBCy5N9OFudcc4eiRHc+89++nCniW54LAQHVWhNjZBgGpmm6qmUMwzBU1SAq7MjcrPtcJOLTzimbxLbve7z3mYxzror7MAx0XZcJS3UUxHL4Yoz4ecav1QG7HChZzvOMtZYQQrUjAZNkk2sB2VtZGSGEnA9rl02tRlSZSG6tzeeyawEvgUWtZVlyQoqPvD+/vBB//wbanfCmyQBqmqbUAiiPslsh1Pc9y7LkNUs1xA4VWJZFFpL8UOv9FGOkW77SAxFY+KQfzjjnquSVPLlp1b9+Ma4+JYEq/vdMa33N+A5i3BSQ3QsJORcipZl1c0LgaJBomXLOpWEYgK3xSAkKuRJ8jX1Zabnsn1gbjZiUmIA1CKRS5j05IMn7R+Br40uA+gIw1O3zHng2iWnZJeW9aZqOwddviVjuA5JAi3OsTmn3gyJPHpiSkivB55eXm2nqCVDG+zTuvM04Vh+R8XKp8mSapqrMWraOaQm22t/Pk9tMZwxoDc/P26ezkFbI6J8/cc5x+vwEIH5+5sGjMaxeB1XvefO+Ocw2+4CRqaaYhmOMaGO2trt2stJ/D57PtOa19stWsy1UUOo2B2OMOOeqPtHomsBVciH6akxzIIWjTvjxQUqpSQLIcT+dTlV7Hfo+h0oUen1/h7e3JviegFLGbCrsrMx+OZblN3YdFD7G+4cT8Z5ATQLuqlASgdxas2XwTXrY8uKmCvYOtPJBAP+JEdlXMYRu/4igBd4y1c7aksQVpbpfznZCqhq6679iTeCbkyMSFZHGolmVojIe7frw4h6Jv2DNZPoflQSaFG/gHhEAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  fire_giant: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAOVBMVEUAAAAAAAAxCgM9BgY+LiZOBwdaQzhtCgqAWUCCSCmKFRWkDw+sXya3ERHJljLjvlzlZxPzqh7zyB4rT9IQAAAAAXRSTlMAQObYZgAAAYlJREFUeNplkQGWgyAMRI0YU4Ptgvc/7P4Eq7vPsVZhPpOA019JaJr6d9wv58iRmNfq0o7OuD/8lj6E9taTOS6EUetW3AdhLUOOzEmxpOHXN8JXq40pqIlfJjU3K7NrraVaVfO4s1DPAs3frJvdCYgS5qRVYkgBoDyjBOrpW81i1AGAyO2pus6zuptrBhDRRg/NWARxBihNDlnruQfzIN5klIILOwpRY5yQE1uMolZ0tOdFLSC6yB4TqIi/3AhRzpOttuhRqUB3RHJnetF5vLUJSYnixWiPZCBT9mwQ8D0ANQjJBpFqjEVgY6f4TlQtQpDlMqBNcp5BvGRzMskGkdJt/wImI8EVYP/8oM/ns+8AGFaZj2eCsmw73tC2nBGWJMJf1hUimG19rULpEEAIf31xQS080SKSJy5fPwWRCCgRlJA7II8eM5RBdHHZAGt+ImX+0u1mQn5jTSczKPFP4h6AyLD5NBL6A8Qxm5zCH8TNiJGgF+DKdQPjNJ2Eh64OlO9l5Zx66l7w1C+thxjfkfpMnQAAAABJRU5ErkJggg==",
  elf_knight: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAQlBMVEUAAAAAAAAgICAwMDBAQEBQUFBgYGBwcHCAgICQkJCgeHigoKCwsLDAAADAkJDAwMDQ0NDgwKDg4ODw8PD/06/////a5s2iAAAAAXRSTlMAQObYZgAAASVJREFUeNqNlNuOgzAMRDvOhaGmhCTL///qOhQVQclqhwcc5sjjAMrjIjQ9+kJd7MJf/jwbgp6PmnOeuy2Qc33l12vJuUcY8jM/c38Ii5jnZz8CbchnNMB0Y69rqouI1JqsxNVf06RaA2WtVJ3SirOfppGMEqirSiTH6dwDjCYfxQCxu4mXFvCmGERF6Z331zHBFJzI1kHEew3fgMOnA5zyTCAqHUTaLlQEcLSUwwZTdDBsi6BV9Opw7JGJzZc9QprPDwDlewXuEfTh8Ft+CNsKLFtEoXfbk4Ow1RtIFpEK4d3pe1m9A6OHHw3A7d9rAA3gB8DVV2sAa6HsAGUHyn+B2xEMYBdo/kbw1i/jsAPDWO58HeIOxEHL90vwTThVF2LT9Qz4BVyEDXCEMWjWAAAAAElFTkSuQmCC",
  orc_warlord: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEJElEQVRYhaWXPWgcRxTHfxtSCFJEYCFOkYnWEJlwgXBNVKTRyUVYkkIJuAhrkDaFUqQwiiCCNL6ViwQkiIQLY5JmdaCrDFG6Q0W8KpzC1cmYS9ApYQ5k7nKcyVYu3EyKm52d+1rdyQ+Gnd157/3/782bj7W4pBxsrsj5mSlmr0zy/EWknwvf/mSN42cs5VieF+/KGFR/exHp/jgk3rgMgfDZWR/47JVJao02tUabg80VOaqvC5k+2d3oc/b1/u/sVSrMF+9q8PDZGbPbRdZzOb775EMA5memuuwGZWbkVB1srsjT8xYA169Os3P0lJ9Xb2jwnaOnABrc1L21XRyKM1YNFFxHfvXDAx7fv9MV3fQXt2n9eg+AWqPdRWCrVE7FSB0UIO0BOkIIGdh21zdPCB7fv6PfT89bQ8FNvxdmQIAEsMHyQOaBAFjbXOnTrW0Xmd9c4fS8hVUqEwJ+xwceWKav2GYoAdETvQ+yAGx1HBAAi67TZ3etVAY17hm6fg/whQRiEgIIVfNUNKFy7Kt3gEVgX/VDwLZBiM64r8aXOmOWGWDqPmCDFQIF5SQADnM5bCA/WF9LKGDOdbAzHRJLSQBSGNkdSECoufJBhspYKNDlbAahyMTR+UoH47sNHJfKzN1w9BSsoqdFZ34gAVsVTKgM88qxdB3q1SZ55cgHHhkkfPU9H2cBrHq1yaLrdGXBDHLoFATKka+iWXQd/n31J0GlYhZml3hGX8R+KhWrXm3qLOQZYxkWXEd+9lGWWqPN6XmLerWpCeRB+gYJsw9JsQHYti0nJyeJ2+HhoR57M43AycsJTo7/IYoiFt+ZYOK9/6CSROvTmYJjkvQLI/oUkaQVoSlR1Dlmf6s2efCwrqMXdKfc7E/cnMNXcwwghCCKIt0OOptYeg14nidj8NgQIFCpZ90Geqp/3aZ5c44vH9bjfUJiEFnOZlhbeFefE4AcOAVPdjdkrdHmF5GACyEsSNa6vScQ6zbfZKZoAflmm3BP6EzYJIUcAqsfv8/1q9N9R/RAArVGm/mZKdYWYOeoAx4me0OyI+4J8mrGX5Is11hiMqF6xpHf2i5qnaFTEFf+cjZDDIwBEvbom988us8BgC11RhjpB1KWYcF1pDK0hCo6n2STka7DtVJZA/joU4+C63CsAGMisV2vjHQhCRUB0enrU3D/j7/whcBWY+tK//NcjrlshqVSWW/LwwiMdCmNwT/d3WB7dwOAerWJEELreECkWlCpUK82eeQ6ZJX+MEndiAznFsAHb70tX539Td1IvTeC/cmPt+H7e6NApUsAMgDpJes7tRVcR15kM/J/gXLQV/1pUleFmCaX+jEJxtAN1TP/ugSGOXhNSb+SxSLUbXhcCYx+nr5T0oIRV4F/CXBTQvpq5+Jr+QDp/UccZDvKT2mX3f8vo9OS5cQRlQAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  hydra: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAKlBMVEUA84UAAAAAGBgAMBgAQCAAYDAAgEAAoFAAwGBAQCBgYDCAgACAgED//wCP6BiRAAAAAXRSTlMAQObYZgAAASBJREFUeAF90I0OmzAQA+BSznZIw/u/7kxyCDLGTqKt8Jef+nNM+fx/ii5TXkDRbCdMlcLJZqoULNxNMFunJ1DZd5QAT6tcV8Q8QUGERVrqA8e7+ThWX6fNT1pKiIJ973vBOcI/asSwNahDh/oZfrc697TTNouGiK+OazrH+MuXrZQ/AxbOhOznss3AE6vF1I8Q6DZGGbCYu6yBbpkLoXuX/aLdRpjn3Losl405z35UlFbG98kuWYS00F1kP9WBht04ibOfWrPLb7XABZzjbsnNzwVGl+esaK2NDV4GtVZkvizLE9A7kBn/Q5DHDqKjFwD0LfQCLNbYNgnM/AlirRUU8HIFhF8Tq0jxkf9+GCvBiCCov8U42I7+imMyeKq0yx8ryAwUyclu0QAAAABJRU5ErkJggg==",
  bone_dragon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAKlBMVEUAAAAAAAAEQUEHeH0Jo6US7+8kyNApMCxEST9naFOKhnGtp5rZ0s78/PyK4ufiAAAAAXRSTlMAQObYZgAAAaZJREFUeAFlk4GOwygQQ9eBK/bY8/+/e9BkozvtNICm78klGvXnLuCs+9nbn0JtYkD76PRfBz7kFtJJ/H8HNtCBiN3EXGUH/+EB0+BaR5C1lmK8vJPulry8gJO31mK9BjYGLfvjjwDIXNR6DXTzMxNNzVFDqDaLtWz8Cum9CKzSGDzdMVh4eEc0KZFz2p20VNoLh6cTtUCOqmz7sxVDLPortKUAYGnG7c9WZhsgvgkxvE2IcjydTk1skYa2AXwXVGt4fv65xizH44oiFt5hlVCJP8730nOIyq+wEQVMjznHjnDlumC29QixFoCKx0nIGQRKzsNlnptcw3VdQ+V85jFKeIal729dQHno+xprx6qDe1bGO7gtUR77aOiQky8d8zFgkjFhUNEWglCNm0KkE9ECEJ6ERgPGl1YslotOm2gEJ3MZOKbjOpp1toZRwDf4zrd8PFxjncN4wPuPCYPdLK4t3O1jQDhP01sbU8R93b4zAIrjCCqAGgt3KY+gCyDHirFpCU85PgK4joXFBCXiLcR3AL7z8P686Of96hiniSJGDzwFh4ryL0eUFWV1tdszAAAAAElFTkSuQmCC",
  golden_dragon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAALVBMVEUAAAAAAABKDw1YyDBcGRB7cIaGMgrBXAzpjg394Vz+xRf//bb//b3//+b///9o0/aiAAAAAXRSTlMAQObYZgAAAZRJREFUeAFNkgGy4zAMQhftD2C2P/c/7kqOJ1M6aox5rqNR/xyhtR/HdY3eEDf+tZuvUVtoxcJ2sn3pA+CTA1zLYVUJk/eKWJGzuIH5KU3OvgTPIlZ+P6lzLxbF2jjAASN9fn6S1W8xx0JaPBdSsJKfv4xcgIeBKjqAJTiSV+cU0/GCWSGenELWiu2ksqwuWEVvQEWo85qjVf6VY5Tca2LyEtINKCiJy0yEth1oADbwa8ioouOuWTNjBwAFwAaHFSWvEHRxA5sZjVdRZuIAIKAzDExSVXJWNA+rkY4egLBY6OrcjWrIDo8wuQCHlkQDXp/wCyhOP8uUoxLAWAJO3lN0G0Tsk356k2NvBLnly4BsrhVLNbQjXRu4LwBdsujZt9C7YHhv4MEgkcqKKHOfuCdqnaHHE8UqLRcwzPff2haLkvZAgqMnJrE+y2TZbKduBi8BsaAsiVUkxJbXC0DcF5hUNQqIYswX4ECxKBzRcvS+Q+eOZeIVKefrJSmK1Osxznz9fc2H19v0VdfN2cTjX73D/d75D7iBENlOSl1uAAAAAElFTkSuQmCC",
  ancient_lich: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAQlBMVEUAAAAAAAAAAEAAAGAAAIAAAKAAAMAQAABgYGB3NBmAgICQkJCgoKCwsLCzcTDAwMDQ0NDXnS7g4ODyxE344GD////2uQp0AAAAAXRSTlMAQObYZgAAAUhJREFUeNpl01FywjAMBNDsSmrtYpw4pve/aiVCcHHE4Gi8LzvDB8v/AZb4zAOf19bw8O9E8Pu7/ZyiP3qrGZ+AG+8noBn10sD7u6Gs+8oZbLctnYA7aZNAivxs4J4oc0U6b4A1rasKZnHDEX+Ra1HyS4ErgKqaEfRTe8MVtEdXZQjt8tmwPYGJNKWQuYpOgH6ICqQKVSj6IVASATUHRhMzUtUEGD9zp19Hg+ciaogd+xAbRVWEQDw1+qClXAAWB71pjqXsJjjB6iAKFuTacmVUQTmBuKaKeVlQkDYA5CgQewMZIARfQD12E6tQBriDT6BPEAJHPgAi5wtoVCDyARYsB5ADnekA8YjkrIiZAOhBgCo6CRT4keOeTaVygFmQvbdv+pIj/wAAWu/49qHkjBn4pMTIgVrLyAconjuIiKkUXP74GG+NbfkDPqYKs/WhsUUAAAAASUVORK5CYII=",
  dragon: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADcUlEQVRYha2XsZX1JhCFP3wcOFS4Ie5A7oC/gy0Bd+AOjDuhhNfBTwdW6MyTeUOFm+EABgGS9r1z7DlnV+iJ4d65zIyQwdkMQBLD/2269p0lMeZy4gtkcs7ZGGP6ewDz7edhnk9y6R/BQP0H4CEDRGefYZO//00P3qwGMoO6aZrvcM30YFCipxIqMZ+kkJxVupA7dkR0FCbMH2ennrHv1NCoLPcWk5C6e/UPN9twIqDAQonYJ2mAIb7XhzshJIKzeVYh1TWUhJIOzt6S+EEHAbJcgIf4XsCTgOwjmRuzjEr5JG0LZ2sRBMj9Pis4ScAuZZLsZaxXgJBaJWnEjmPP6cZXuXMoUKM+lY0C1ujbVcfBfV3rHGr4JKdkbQSUma1/Ib4PkUp4sLKxsp2J+DWTxGgJJ87JGsFEMLcK6CQvcgCozNXWCIsFZzec3cZ5F0ooiTCV3i0BgJQSjUQFkPBA6m82QEqWXShq9NvTr/MCOFz0Ae+9SSll8RGbfgO7ICI4IoDxtVktNTxnhZTqjV+HTmpD4pldsosxZm/TUQGyg7MQt3KtJblaAWATO26XklBltFJeJVCcXG5gdgG7kFzE6eJ2wfsNSeW2qTDlDc5+SeSUA70lF49oequqSIJdKCQqyVO5alnfJOo9gSS4+F5I1IVd8uDXtrh1JRes40hGjXgm86wVD+bXrI5u6ge9CqrALmC1383gcTPE7ZB+UuFMQMEBHn8dkV10QlWgqTA916ajh5UrEkcZ9sCyw/4JQP79O+bXXw5nlbjLATiuTamSwOWUVM8uOWfMH9/KmsF0Cmh/1kgrONuHMcYUCWcl7HKtQL+OXzlZSBhjjiOcSmSMMTib2T/Jf/5zfeTyayZuBr9mJaK9YBdop4dOpTaOm65RrjUvTH+41PF84DyR6CL1QcZe0JejXcYyVFMyMIK8BDy9nu3w5r9QoRJtvgc4gBmq4BZcrT+YAOyfyP425AJ2KTnUH2S0o07gcHMoPZlf81DbFRyA7YO09Um4w/LTAT77deCvE7iz7aMNNQ9AYH0bQe1yqDDZl++CYYG2flemz4hdddBiLZGffw86m6/2vo/+0ta3sxIwq2DuFXA2X35c3oMb+oC2j1EBfau+8OnH4/FQ8NyPcTazvpXfiowzwfb74Nf7jP63W/D0qF3tv/gbgH8B1/kfuztOQW8AAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  mimic: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAADAFBMVEX/AADgAADAAACgAACAAABgAABAAAAwAAAgAAAYAAAQAACAQECgUFDAYGDgcHD/gID/QADgOADAMACgKACAIABgGABAEAAwDAAgIAAYGAAQEACAgECgoFDAwGDg4HD//4D/gADgcADAYACgUACAQABgMABAIAAwGAAAIAAAGAAAEABAgEBQoFBgwGBw4HCA/4D/wADgqADAkACgeACAYABgSABAMAAwJAAAICAAGBgAEBBAgIBQoKBgwMBw4OCA/////wDg4ADAwACgoACAgABgYABAQAAwMAAAACAAABgAABBAQIBQUKBgYMBwcOCAgP+A/wBw4ABgwABQoABAgAAwYAAgQAAYMAAgACAYABgQABCAQICgUKDAYMDgcOD/gP8A/wAA4AAAwAAAoAAAgAAAYAAAQAAAMABgMDBAICAwGBiAYGCgeHjAkJDgqKj/wMAA/4AA4HAAwGAAoFAAgEAAYDAAQCAAMBhgYDBAQCAwMBiAgGCgoHjAwJDg4Kj//8AA//8A4OAAwMAAoKAAgIAAYGAAQEAAMDAwYDAgQCAYMBhggGB4oHiQwJCo4KjA/8AAgP8AcOAAYMAAUKAAQIAAMGAAIEAAGDAwYGAgQEAYMDBggIB4oKCQwMCo4ODA//8AAP8AAOAAAMAAAKAAAIAAAGAAAEAAADAwMGAgIEAYGDBgYIB4eKCQkMCoqODAwP+AAP9wAOBgAMBQAKBAAIAwAGAgAEAYADBgMGBAIEAwGDCAYICgeKDAkMDgqOD/wP//AP/gAODAAMCgAKCAAIBgAGBAAEAwADD////g4ODAwMCgoKCAgIBgYGBAQEAgICD/AIDgAHDAAGCgAFCAAEBgADBAACAwABjw8PDQ0NCwsLCQkJBwcHBQUFAwMDAQEBB/Wkildl7Kj3LlooL/tpH/069oVB+AcCCqiDTAoEDyxE344GD8/Jl1aViRh26rmoHgwKDQqFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABHbGzm1GiTAAAAAXRSTlMAQObYZgAAAAFiS0dEAIgFHUgAAAAJcEhZcwAAC20AAAttAYAOpNEAAAAHdElNRQfYDBwRAxm/JAOAAAAAsElEQVQ4y+2SQRLEIAgE/QvD/39FUR59waKAmpTW3va0k0OmMi2opJS/fqiqAiIQgGmpquqej+eRi4jKKbc61B2DLwA5AHagap1adhRI4CixThqA9KZbB3cMXQCdAItVWntXcGtOO5PAWJQKdDRxIDceu3MvwhNw2bu1DgTHwNYCfvd+PvKL7NewAPsmoZhE5HGKuXcgRxX5qvAGMn/OQpfL/DqLzK9A5qXdFX/cl/wDSvOnPwbUFUEAAAAASUVORK5CYII=",
  pc_adventurer_1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH2gEOFBgEPJechgAAAflJREFUWMPtVj1q40AU/iYEVw4Ik1Ygw26aNANxijRhstU2G7beYpkmF8gBEkUHyAXchCByAFepjA7gBdVmiwEtgkAwA+62eSnGY6xESTSy5DR5IDSanzfzvve9bwR82qd9sLE11lITvuoegL7xHno7HQDAbP4f43RWy99W3fB7Ox3s+xz7Pl8rBdt1F/4++YGBOALyfzj44mOcDmv5qY3An79ZaXuTRnkc0ejijEoI2ToCxLvAZJrB3/XAu6aPws1wgEQA6EfgQc9xfTuEtwtwACwEuVaCa9mQ5IDSQOABSQqIRREobd6JcvNbKwWBZx4ZysJ32xygPI6WkQLATXiDwEOhb3RxBhdSbq1TBhYBiwIADPb8VhCgPI4wmWbLzZQ2CFizKEymGfI4qoyCEwKn0dCSrBSBRJk5rerA5a/vLExMxGmqobRph4kZa4OEtCBWsRKEiV4HP6G9lxdSVTJWFiKb/6u7e5JSQmsNpUw+giBYjq3ObVT3V6IhKSUJIWwfCSGIc16YU5WE2y0pJiv5a2KN6kCSJIW2TcMbCFATB1jmv8w4504quLYSNmGbPABr5H9AKVWagtfS8h6JXQ5AeRzhYTZH9qhxmqaFwfPjrxjs+ZhMD5/LMWvsMgJgNl/ZoN/vM3tP2NtwoYKsSvkyRzF6by25+n4CFC7Go3t7WDwAAAAASUVORK5CYII=",
  pc_adventurer_2: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAASFBMVEUAAAAAAAAgICAwGABAAABAEABAIABAQEBQUFBgAABgGABgMABgYGBwcHB/WkiAQACAgICQkJCgUACgoKCldl7Kj3LlooLyxE22lE4EAAAAAXRSTlMAQObYZgAAAPlJREFUeNp91OFygyAQBGDXqIgSPOJd+/5v2sW2ScpwXR1k3G/wfjm0Qc3gB3Hihf96VRJPANHMKBwAszjaOE5mniD50GwR/gymmv0pUYfMyQU4S5xCkBgLnF5iOAlETvRAkSQSJHEtFL1+LXISkJQOkBQIAh+BogNMV/kGCMkaALDXdS4ikmZkbQDMTHPGvG2f29wDyh5A2pg5gQL4CzJf4J7kukMFjQCXFzBrAPML7pwyqKILMgFFqnVHEFyTcvWA2gXMOQGPY18ALPvxcMS+3ADclh0OeJ7g9C/gzsC+iuPof+AJuOv3+w/YqxhasNTgfdeKK+0v4AtsSg93ExVmXgAAAABJRU5ErkJggg==",
  pc_adventurer_3: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAaVBMVEUAAADkZhbyqSTyxyf+/oIAAAAfHx8vAC8/AT8/Pz9fRwNgAl+gBp6kdV6vr6+/A1+/jwy/v7/ACb7JjnLSORDfbwjfpxDgDd7kZhbkoYLv7+/yqSTyxyf+vxX+/oL/Bn//EP3/tZH/0q/LpU87AAAABXRSTlMAcXFxcVX9yjIAAAFUSURBVHjaddDrdoIwEATgtHbShd2ITdR4J5v3f8hGlPZ0sfBzPmbn4Jz7cG7lADc9AByceW7OHU545L7rIFasbjh9Yc59LoK/3x8u27mgqnpvG+4Hvp4gaz52Jm8bzz+g6tF72I2H7Q8I9ei7hbj8nvAhPIDdMI/caUo+sxErtz2tMW2s113nJdmK81TR3qKpdll0IbZoFXsEKSl74aQGvL9hvd4DgYXF82eyAjds9uhDCMTMBCR7BFf0fdDQUxOfAKo9AmgfALBIbOK6q3YmVHuAc45ZSKcCK7ABpDQQBfMEuwMlt4oG5twIhxLvYP7VSxEbEMkp/AdKkQaiVsZrkBtgibX2DwDAnMh8B6qJMcVGQIQjc06qDeAVYI7EhVR7NvkTgIU4U9LwGkDBRJGCJrb5BOoTUFXmZe6gI4hIiFIaXuXjMAAgJgzjOCxy9/wG+LPvG1sGGyPxrVSTAAAAAElFTkSuQmCC",
  pc_adventurer_4: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAACN1BMVEUAAAAgICAwGAAwMDBAAABQUFBgMACAgICQkJCgAACldl7AMADAYADKj3LQ0NDgAADgcAD/QAAAAAAAAAAAAAAAGCcAIzEAMEgGOVEJJTIJOEkNAAAQOk8SP1MWBgEWCAEWVGwXVW0bDAUbRlYcDAUcWXIcWnQdDQYfZ4ggCQUjDggjEQsjFREjWW4kDQYpFw8qDwYshaYtAwItBAMvBAMxAwIxFAkxFAsxFwwyFw0zBQQzgJ00JB02HRU2hKE4BQQ4epE6BQQ6HBA6IBc7BAM8BQQ8fpU+BgQ+IBRBBgVBIRZBJRxCIBZDBgVFBgRGJBdHJRlJBwVNKiFOLB5OLSBPLiFQLR9RLiBRMytRpsFWMidWNCVWqcVXLR9XNCdYNylZNylaPjJcPTJdOSxeNCVfPC1lOi1lQjdlSwBnPS9qOipsQTJsUQBtVQBuRDRvQC50RjR2TDx2U0R3TT54UD99Tjx/VkZ/V0eBVEGBWUiCWkqGWEaGWUaHDAmIZgCJYgCKVD+LCQaMDQqNCQeNZlaOEwqPCQeQDQqRDgqVaVeXDAqXbVmZCQebcF2dDguedGGedWGgDAmhbVmib1yjaFKkdV6lDwulemipdFmpeGWqgACteGWviQCwgACyg3C/gma/inXAOwDEEg7Fkn7FmADMEw7OEw7QEw7Rj3DTEw/brADkoYLosgDswCTtwCTvFxHwMCbw8Mjx8cvypoL0UAD0lQD/xZ//0q//1Un/1zD/3rb/6JX///8xdt4CAAAAFHRSTlMAAAAAAAAAAAAAAAAAAAAAAAB/v7IWKoUAAAIQSURBVHjalc/3V9NgFMbxty0txdK6HsQq4qriAKO4tQ4UcCK+glq31r1w4FYEIloHbo0RZxzRiNJoUiv1n/NNTs5Jg5VzvL/lfj+5JyH/OQACgf565udnDA700zVR0/8tIIUzYVFiwnr+C+haRpNSEswLwHfA2SG90URdgrnHj8XjF/5Cdud5qotSirbILaao+D3K0e+pMk9TOuuqIfBtUkm4C3bv2ENVeefUSD0TinEC6EFWP793CsdTftORHfUr+LpxBjiGrPuX9o+eDwhUaOitfdVbVgoM/eD4gDOLloGAKttrJ7ZyaOXKXx4aQmD309tirGPL0gkj1nFrwH29Wg4gbQlPCLGYBswYO3yYQB9WdwKl0XPpeLrbAi4vOC0zpri4iApUWdVZDTei8e6nrFsAx9OiJhYBn+oEenv2DRTkIR61/xFfKko0EYBc9XGJvKC9sh0FxM4M9HQBCAaxUZ71bubNymvLGRgQtIEXCJlw69l5c6bPXd3UxIBjQi6v0XdfaVs7eeS0fRcuI88JvC6/AW69OHAigrLGRw9OwXnA7woxgWfPT66HD42P3150An++x5/PwPv7hyMoJHhy9yCIczwewsDrO80YVMjE0Q0gOQbNuxpAfD6CzStBYE4fUZMAcbsJEjUAcggkFQwEm2TCBs5uBVXJfUBVrXXSEqRPVxLWDkriup1tYe+yX/8DqWqW2JytsmYAAAAASUVORK5CYII=",
  pc_fighter_1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAQlBMVEUAAAAAAAAgICAwMDBAQEBQUFBgYGBwcHCAgICQkJCgeHigoKCwsLDAAADAkJDAwMDQ0NDgwKDg4ODw8PD/06/////a5s2iAAAAAXRSTlMAQObYZgAAASVJREFUeNqNlNuOgzAMRDvOhaGmhCTL///qOhQVQclqhwcc5sjjAMrjIjQ9+kJd7MJf/jwbgp6PmnOeuy2Qc33l12vJuUcY8jM/c38Ii5jnZz8CbchnNMB0Y69rqouI1JqsxNVf06RaA2WtVJ3SirOfppGMEqirSiTH6dwDjCYfxQCxu4mXFvCmGERF6Z331zHBFJzI1kHEew3fgMOnA5zyTCAqHUTaLlQEcLSUwwZTdDBsi6BV9Opw7JGJzZc9QprPDwDlewXuEfTh8Ft+CNsKLFtEoXfbk4Ow1RtIFpEK4d3pe1m9A6OHHw3A7d9rAA3gB8DVV2sAa6HsAGUHyn+B2xEMYBdo/kbw1i/jsAPDWO58HeIOxEHL90vwTThVF2LT9Qz4BVyEDXCEMWjWAAAAAElFTkSuQmCC",
  pc_fighter_2: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAZlBMVEUAAAAAAAAQEBAwMDBAQEBQUFBgGABgYGBwcHB/WkiAIACAYACAgICQkJCgKACgUACgeACgoKDAMADAYADAkADAwMDKj3LQ0NDgOADgcADgqADg4ODlooL/gAD/tpH/wAD/06////+2JnDhAAAAAXRSTlMAQObYZgAAAUFJREFUeNq1kdFywkAIRSXcrajbNGioa6it+f+fLEmdcUeb+lSY2QfOAXaG1T8EPePePOHW0GrZIdMsaLxZ7s+Sktui8NVhQL/MPTaYr//4wvtm47oGLfHL5fPDcwi0IOB0PqhATX5VSIO/AeoqGfTInc/nE1hdaqMWcDgdWFSQHw0iUoQx7UcCJkOp4qNTII/UFIZo1ixU9RdVEbXgkjCl10I0F4HCRH8mAAoBVYJwVFIAMU3Q0XPwSjDhKHDX7xhJMKrOvPpDaaOAfj5mh9E93wtbWhF23Y4ZYFUHzXEbMAkKZs2WEyN4bYRA8WYVzjol870wD7BszNlmo+Z03SBJEnM8kVzz47FsQeENfdsSte3Q1zwEOx4NtB/6UkLYl6txu4OavUpbArcvRC/7Mon1ocYRIgEjiMKYInhlPMaNfwPrjBT/ULWEZAAAAABJRU5ErkJggg==",
  pc_fighter_3: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACZ0lEQVRYhdWWvW7UQBCAv0NIUCDFZbpMSYN0kVKkQGLoKKFLuY9AeeWVKfMITpeOvADKRqJIhyVeYE5QuFy6UC1FvL47x/bZToLESNbdzc7P55nZ3YP/VUIIsSiKmD6nxnk2xalKTPAegCzLCCFMgpgEICLw6wY52gcghJCe0RCjAeKPL3Hv5xX29gSAIstqoLT+pACzN59mq99/kG8XHOy9gLMzAMKr1/X6kwJsJrv+ugLg8vQUEcHMRrdhEsB8Pp8lCCtLrCzrtSzLRlVgp3H0GleS39MvRdDFAitLfJ6znINc2pbNgTlm6ntzDKKNXiPANcs1gCoByNLvaksCvKvsdiUfDACgEK+8bkF8ViVrSf5ePX5g7EEzoBABDtUj5aLWZw07KRccqt/yeRRRiApxDtFBtIvj6CqdNnTzDf2Q2DsrkPq/1e+TG6TSSfUsT246fR8EcM2SK68AdV8FsA0bq3QABcwC0JyXyQAA5+YoNoZqM2EbUAGzc3NDQvO8ayHP8whgZlt6cYLsvwTg+4d9VuUtvgh3EOUt5Gt7M6vjOOdad0VnBUQEVaXPeVXedrnXPqp6d1l1SGcFmoGSqMvrc98S6HFVKTPI3ZavmfUOYieAqu48SFJ7+t7QPgo+TAAYmjxJqkpTtOg/ESfdhkmcc6hqa+KhMrkCA6St9/eqMaoCaUu1iZmlXRM7krdCjQIQEUQEv3H7tUCOCTl9Bpxz9fd0XkyRBw3hY8i/Brg3hIP/EXmIdvdJ3mGTs76k9DEBUnIAt8M2X/s0QVtzDToH8p0Wa/Ht6s4XHdqCvgulGaNp25vjL1wADnm5oDlHAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  pc_fighter_4: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH2gEPDxcFZMebKwAAAiRJREFUWMPtVr2VtDAMHPZdAZTgEujgFG5ICSrFJXwlqARK0HVACQ4vdHiZv8AYzC7rMz+bnd/zg11AGs1IsoC/dW6FaR9ezRnnfd8DAIZhOGyrOePcez//oaqH7N3O0KfWQplPaXgIQN/3GNoWcC4CMQZJjncDWJJucg6i5f5AQu7RLOjENglARGjbFgDgvYeqgjtAxn22axkI0gOfZtJ+Q3ZlgAwgPcBdPRu1ABoegC8XQXwazBXgvZ/vybwvBwJEQMbiy0Ugj85NC6iLW1qqBvBR/SYRoApykX/jdZUDVuNr0ts8KS9hIEAV8xaJRUA0M+CIIB3HBDQGYI67Ig/qJHBu5RwAYO3SCSmjnDmCuECCiF5k26BzcMnZ43PnFlAioVSWt1LSgXlpNCKpvJ5ZyTTnbmLEmHhlTsyFfQykqKx9fjamTkiAd8A/jdd85XIVJPko6p4ZWkUPAE7Xv3/8igVJAJiLVdH8lgOp68kYDZMAMLTt/HucgaYrSdnXbc85QYKoO5noNG0AuHcAc34WVAW6/zh2LubFvQO+x7jv3boU3zoPGBNZeOySO2r/PANT+XEXT7850V6zEF4NsNUAZCw0pbzUXufBbgZCXgEb088zMxm49I3ylRKUTrkSuEsBZPrP0fZYzoRyNTSHAMiI58zfmoCSDDvy4FcAJFgOnI3oVyykarAWYM674MtmVDcRPUSfotuMMg0uF43l4YCNsMfPf5OkD7v6u3E9AAAAAElFTkSuQmCC",
  pc_mage_1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAB70lEQVRYhe2WvW7bMBSFvxZ9AAEds3DpWECPoDFAF2XNEPARij5AY3jM0j4C4bVDvHTrQCBbshhI0CkouHhXn+B2aK5CK4xMUfHUHsCgTIH3HNyfQ8G/jldzDrc4MTR0BBxNUayiQzVWDA1zyQFelx40NAB0BGqs1FgpiZOt3OKlwvT/O0L/PNzvCKyxWbEnp07Tr6QdgYCPn2f1VTbOT4/l+ssnkdtLOT89lu1qedgSpCC3l3Lz44qjtxVHZ5+LYhU3IcDJ+998v/nJh7NfHLwJh2hxT5pSe2GDy45bJEDJKwwdgQrTk+te7hQUlUDJYXccA74XlFuSyQIsXjTd8apCAp4Kg6HJEvFmCjE81lqdUPcAvvoaANeE3LD7BWxXS/F393y7+Bs04LXJ+otog8P5FpqPABhgg3sZAYrcDn+3WrK9u2d94bOmYa+AMYPReseNOBXFPlBjd0ZRRbQPqV9kxs4uwRBKPjSjNXaSERX5QMOid8F4jcRI4vdyApRQG1OhX0ltegKSQoqdEB7nfygmLsszQuYJiMnUeofvnsnCExQ3YSwgtTeShZ0GnfU9MEx9fB/kkBcJqLGiRGrFcRbivUEZkqNZXILUDair7u0jH30xBgfigQ12p94dgcUDsT2UEyo5pC8mP2I6/5HCH+9S4q464uxqAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  pc_mage_2: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACkElEQVRYhe1XO27cMBB9CtKHQA4QlilVpVaZUn0aHmFzA8FlimCPQPgEuoCB8Q0YwF1cjAsjWyTBVGmZYjU0RUtaadfp8oCFtBrqzZuPRhTwHxdARGIIIebHrRyvLnHOzBAiBO/T9RDCJhGvzxUAAEYCTG0AAEwEbhpYazdxbM4Ak49MPgIANw7pGAIAQEIPtU/h8fpqZKu2CsiFAMC7t29we/MAPhzQfHwPU7cwxszyPl5fxcdfgg+fv1bABSUwdQsJPW5vHtI1MTXMlNjdLrIIAIDu7ke2swT4to3qECDw4QA6HFBPOAYAde6HMvkQUoY2CfBtG60Zx2iZARE4IDUgORetMWARlOtLrBKgjpVUIfs9QuFEum50r4og5knuk08BORebITIWSQJ659IaFRZ2u2Qvj3NYFKCR5471fIlYbXlm5jLwrAT6mPz59vtZypeQr50SkILKGhCYyADd3eP7j5+JKCfTKIg5kefXWWR0XtoHxOEHYCIDn75cV8Cx9nn0ObE1Bo21o+zkglgEPgRo484gAqhme6DxvtKbNeKBuCKmUZQ5juvCrL3EYhPmJSDmVD9Xt+hoD5Y+rXX9HiwEH3pYcxxJHdGIQwfRagGu7ysVUjZPY1uwAB15sPSwBrCmgavbkmOOvjopYAlansY2YDk6n6t3RzTpfJWAqeifbFpzIB9WU5hK/yoB884FdgjYmqenYwWW58BJQcN01IhXOp3F2T0AHBsROJZCoYJcXb6c/4GAJ6fl/9msPCvnJgG6EXlJbM5AuS+wxsDVLkWdN2NRhslmfpESlI5V2BpsEXBJ+md3yZsykI/VUy+ajkiHz+LWf8umtAIQm+wzjLJtWe64uOck6Tk4VY7VvH8BbZmKffSHwiUAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  pc_mage_3: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADCElEQVRYhe2XP2gUQRTGfxeshOAQbUQwUyhIqiWkFJxShINDxDJZrEUCNikPq8PGQuwnKa2CliJM4CqVMIVYXfEiCIeFLCbYWIzFzW727naT3USsfMuxt2/efO+beX92Fv7LOSTLsuC9D+V7W4yF8zgXETLn8NYWeu99KxIXzkoAQGUelSgAxDnEGLTWrTA6bZ2KswFAJT28UmhnEZNOCHmPyjwA2qSNsFsTmCWyfPkSe+8PkPEYc/cWKumhlGqMe+YcUEkPgL33B4UuU8mp83rWTuVIawLOmiBIKDuU8Rg3Hhc2ggRnzVwy9qwNycbGFIlWBATmQGVTweAWxs4nYNm+Z21QcVxpXZBolQMCQQCsIent4pVHo+OYkGQJXnmwfXTqEEADm9aSbGzM4fnt7eZlmK9GT/6TqaxwPtHrQifRJpfdNO0AQWmNvnMH2dsjE2E3TTttQ4CDyepsilRdNkVSR042J7+bpp1MJrRy59CwEUkplgWJU4jmUrbLdyJ3Dg2S8OewG5aG3SlQYLJK259W2j42rj63l5x0rJ5XC1/5tvOsWRUEQli8/YYft1+CNbgSqKmZo0vOc/vVYRedWlyhifAnEfi28yx8fPGUbbZZZrnQ96FjrGFp2K2ctzJYQ29q+jW479av83t9vXiuzQH3ecTNq1cAOOCg0mb1xiL7s2GYxQEYHdbmTC2Ba88f8aUU+e/jI/qxb0is8fvDLqs3Fgub/dEhv7Y+FbP68VcjzaugSjTw5PFbtAdJQPvqyugDr8dHU2Ma3bwKcnm49Wmua0oWky47TkqpnsuHwQNMvMpSuwMG03G4MMu4cA7oyVkErSjabhWBnETcoymsE0NgMHOOLQQdoRwnN6QmcubzAICZHH6Q7Fin4z39FwQKp2rmud50bkdbEbAV54HzSusd0EwnmwbSUgkKtWGoPHv8lRDMOobmydmGQLg4WGtsvDJY496xfe3Jq82RLAA4awCKFrw/OoTYmg0gcdzE1/JpPtp+F8wlYU4ol5LjRvhn/TA5rRoa4/4B1sQ+68v3FrgAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  pc_mage_4: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAMFBMVEUAAAAAAAAAAAckKB4+SThFAABTWU1wWiCIYU7JycnTl3voAgH5zVf+/qT/wJv////wGAsTAAAAAXRSTlMAQObYZgAAANNJREFUeNqF0EESgzAMQ9HKUm2aArn/bWtSFpRJUsHuvzBDHrcBj+ngxLxLfwEx7Qs5EdCyLFPA9/Keg79f2PcyASBQwKEAE4AcCVDuB9BAtOQueRPodjFJirAk975KKcTsNNZK/HY3NpF9Na/P+roK7GV327K6i+ZR67PcQHEaV22Ko8drL9mvACStjR4pGrgI5MtzxogAehfhOTUxuEvPRxQt+xS0PgVtXaATdAXCdWQOAb5gZXQBDKuCm8EGH7jv3p0k2ui9LgnnRHZ+8nLmev4DOT0GUe+RiTkAAAAASUVORK5CYII=",
  pc_healer_1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAClklEQVRYhe2Xv4vUQBTHvzlsxUF7fYWF5XCF9TSC5YKlIPkT/AHWqRX0epvhwFb2Hzh4B1ZXHNNr8W7hMIVK/gBhLJKZS3Yzm0zW0gfLJpOZ7/fz3kwmCfA/Doimabxzzvf/czWODjEXETTMcNbGdudcFsStpQAAoBoHpRUAQJghxoCIsjSKXFNh6wFA6RWcUiC2EFO2QM5BNQ4AQKacpZ0NsA3y4N4dnJ9dQeoa5ukjKL2CUmq27uI1oPQKAHB+dhXbGqWzdRYBWNtmHwylrsF1vUQqbwqstT4sMq01RARrfZP1y6YBADjnQEQgokn9WRWw1npm9saYQftaa1B3bMAAgKaDEBGIyOQtOUnIzJ6IICJRmGAhJQ/6kW3hBGV73o0x7a2Z9NlbgVDyLpsIcPzwdmsSzIG2jSoAgHNm0D+smSyAUPIgNCdEBM4ZnJwAZWliOxElIXYALj6+9p/fvvBBMAAQEZg59gvy1BsbzEOU5XQCyQpYaweDg/k+wb55NyquhVQVdgAev/pQPH93WgCI+zrzjZC1tgCAgEFD7IE58/DqGPzeRdifAmaO5qmoqgDBuD7dRI0AX1XVzvjk07Az89uZ94PQVoIG4whPjja4/tUA94fJjMXiZ0HfPEiHKXt/+RvffvyMfZkZVVse3/3mAVhri1T2qQg74aeLzb5uEWKyAilzwfgUDPp0a6jLfhQiewr27WpjAAnzGIvXQCp093TUWk+a5wLsLKBUKKVmi2ZVwPbefv9BFDkAMfOpt96wa86Ng/aBnbae8cQ0xDtr0XfB5Z83OP7aHt/t2r58f4aZiRfJk4nwQFtipRScc4OLRASlFNbrNYgIZVlOmucCRIgQfZgAoHXy1XzUa/GHyTbMUu2/sxZOoGepW+UAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  pc_healer_2: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADCElEQVRYheWWPYjUQBiGn4iFhawB5RAsnNoqhVgdXIRrPU4EORC8HFhYyakgNkLATlCPqw4UyQmWwrI2FifOwlYikkosZ0EliMK4WojNWOR/k81mb630hZCZyffzzrfvfDvwv8GAUWDS+YF5gmmtTRiGpvielnwIKEAmJFoTGA3OGTAGpAFptNZGKYWWkjAIMrswDDOb+DEm9oU0OcBS8p6rArYOEY6NcGy0lCilEEJMtBdgpcmtZDwzASUVSqp47Hr5e3MTAB12s+/5PgsIXH4MzmXTg7MSEO460EfJLkIGnDx6BLW1hYoiXB1iO6vYdpjZjwYrdBZfWOn8S/STd4V4rSvQWXxhjQYr2dx2VgHovxpma9p2Ch41uwfeR1/5Ev2cnUAd5MsPAKgoQkZR5fv47gFOHT/GwvHD2Xzmn6AIZ20Nx+kChwDB1paoGvkmPpq+ZVU/tq2Abwy+MZ29HjI4mxNwNCAKD9h2F1hCBmfp7PXGiJhKn2hBoOzkqtfAUiY0mfQAGQTJ2jpsDnHDoFXcBgI1jHUiOB/iXfq4nsdo8BzXi4nhA/bJ3L7kE4twaeE8n57epYGAMbCRT/1C8sJaIAUAncULeN5GliQnrMrEE3z++j0bVwi8eXjDPLu1Xs9LKwh3ARgtp0dSkP7+2boexrYpAQD6QHwKHr17wonLd+oJ1KNfDqaHdPZ67PjwSwWMBvfZvvKN0fJKWXhdz0LJCgnXyQlXCJy5/sC6dG83mW1kTgQyD5rgqg+HhEdn8SbXHh8tJ09hi7FKlMk0VEAUxknywK09y42Y4jOBQL+GhF8KlGugjLF1Q+HyUYd9d8LOXo9f/gY7fsDvj98A2CbVwNiJCVyyKo5hQgXalbpRA7YAr5jUrY3RUIHUQTJe/v3DBU6X4jcRqE/qSZN1ur+Aff8dtxThVMwiwljNtgCmiNCm2ronYLYKlETVshFNxkyX0sazPA/mupL9EwTaitACDIELm6qdR939EKyLt99WAs+C5IKZSGK8P01ab8g1T4ebJsxWsf8Aj2VOR9gRSE4AAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  pc_healer_3: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAAEEfUpiAAAACXBIWXMAAAsTAAALEwEAmpwYAAAABGdBTUEAALGOfPtRkwAAACBjSFJNAAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAAF/ElEQVR42mL4//8/AwgDwX8QDRBATAxQoCYtxsDIyPgfIIDAssXJ4WBlYSU7/wMEEAtI9rFgEkNkpCXDoT06DAABxAjVDwcAAQQ249y5c//DS3eBZQACCGw6SC8IREZY/AcIIBYgzSgjmvo/6kk9w1+ZRgaAAGKAuQPmFiQdYDGAAGJCsWH+TYb/l9cz3Nh7kyEq0hKsAyCAUEyQFkn5n3v+23+Qu0FskBhAAGE4E6Zz+YoTYD5AAGEoAHkf5FAYHyCAUNwA8xs4jKAAIICYkHWCHAcKRKD9cEUAAYTixbNnz/4H+uJ/XP2Z/7DgBwggsOSZCSXgUAK5HCQApqFhAhBAKCaAFDFAgxQUWCAxgACC+wIUvCDaSPcGA4/4H3BUPX0zhwEggFC8CXKYr6MNmL15/xGQYYwAAYQSksgY5GBYvIAwyF3Lly//j64OIIBwGgDCMHfCDIL5HBkDBBBqZCM5FRgV4HAFhhDIIHACiN92kwEkDkpwMLUAAYQ1OYESAyikQN4AJQ49w0nw4AWxwYkc6hqAAMLrfFi8gCMQagCyt0DxBxBAeDUHuzv+/79t4v+e5AAwDeLDDIEleoAAwpoaQWkJBiL8PzPcuveUQU1JGkyfu6wBFgfFMQgABBDeWICFBczJMDayGoAAwnABumuQApsRmxqAAGLBpxEUfehi6AYBBBBO54NSHXIiwpYKQRgggHAaANMMzKBgGhT/2NQBBBAT1lSIxQuwIg8lFQIBQABhGADyIzDhgBjg5GsQuRicnN8+vsRgbGSEEbgAAYQ1ECe95GFgWHCLQVVsPUOZjDGDsZosw9PX3eAiuQctIAECiAnd6SAssraOQW/STgapjq0MSQvlGPIkU8FqQGWxFLc8olQFAoAAghsATKpgDEwsDL1zVzJoOKszTDLgZLh0Lpch4d91hrPnzoHV7T5nDTaE4TPEGwABhDMGoKEOzkiwDAUSgxf8wLwBUgcQQFjLA1jol6REgAMuruEsw7JpXaiJyjMPlIoZAQIIazSCQh8EInVlGf5vn8SQJ7iC4cGTV2AxkBzIAlhMAAQQE7pm5Li/L9DDsOZVPpiOiNyP1ZUAAcSEngaQ+aEJDAzrdlgwLFpoA6aRwaoed7CFAAFEMCkDi3GUrIyMQeoAAoiJAQ8ARSk2PsilMNcCBBDe8gBXVgdpBtHAaEWRAyV3UEkFk8dVhiADgABiIdVyUD5DjixQWCIiRZ3h6AJINQksPhiIcQRAAOEtUvHFD7x2+M+AQoPEwdUQlkoQGwYIIJJCAL0kAbfqZMQYGKRBrQMGhlsMr3BGF65iHSCAmEiw9H/C9lsgZ8OLOlAaABV3yHkDJA5KC6AmHUgduPycfxOn2QABxESK7/PEv0AYwKLyUl8imLky/hvDzdnVDDd3zAQWnbvhauPFgXj7LQbjSzx4zQQIIKJzASgUgBU7gwIwyJ99fchQUjqVwcjYiEHfcDLDxYN5YDX69pMYLp7PZQCFl7RoKrxeBwGQHlDTFD0aAAIIezMVWCyDC8O1xxh6+lcyRKUh8vPVm1Hgoro8UoRhAZMmw2RgkQ0zEpY6rAMaGR4cfcJgnRAKL/9cjY5idQhAAGF1AL6QAMXz0QWrwWzn7AwwvbDRGO4AUMkNAnunzoA4BugIUFaFJUZQYVRsAWmkmhT0MAAEEAu2OhVXFMASGQjYuVxhWNRgDPE91MkgdsI2XjDb4sRdhhNnleGlP6yNv2z5cbBDQPU0CAAEENGJEL2FAKoVgz2cGM5OKAW1WRnyLnwHs79MzGAAVclsgt/hamEhBquGQJ40zu8GF8cAAcRCTOKDWQ4ySFhWD8xesZGXYULPSob7DPsZzgCTzIHLdxgYdFVQqi1QRwEGQCEBSjvIjgCJAwQQ0QURLOiRAaKKO8Lw5SULw8F7b4Ct2HBwQiMUmqAoAaUNgAAi6ADkkgzSLGZggDWfQakZ2AJGsRDGBjkIGVw6nwfEmGYDBBBRIYAtYYIcBbIcGYC6XqBuGKgtz6AEDjeg2By85gEEEMnVMTFZlZhcBQMAAQYA84aXEk/QZfYAAAAASUVORK5CYII=",
  pc_rogue_1: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAASFBMVEUAAAAAAAAGXUsHNwoOb1sPixwRi3EVp4gVwygoGgc2IwlSNQ1yTgx6bzOIYhSJWRekdV6laxyldxrAfSLJjnLkoYL/tZH/0q8rPKSAAAAAAXRSTlMAQObYZgAAAOBJREFUeNrVkMuygyAQRNM4zAQhvgLy/396m3LnBffpBUV5Ds3I6wcD5pEfy5HwxNORlrGBlHJ+6sBSaylHeqj4lE/JG8YzlFryo5ALC8RhxNXlbXNqgj43NedU1foGzJyRqkjXAKEQU3Bi2hXYf1U4M9woyAVsuCr0JqDWk58h1gSTfz+CfGZyBFJVDRz2LhQAL4Q5xpkR0duUpAxC/O7rHEOt0n8JHm+J51nIO8IawcQ9j4R9R1u/yOgLrYIXrehzGiEA19J18PZg/Bt9A95PYCbv+3yayJm2GcyI26blD3bdCWqzswMsAAAAAElFTkSuQmCC",
  pc_rogue_2: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACUUlEQVRYhdWWMY7UMBSGvwEKipWwRIOEBK+YYksfweWUc4QcgROscgK0XADNEbaiWyl7Ax9gC2+DUiD0kKagQDKFk0yGyWTsYReJX7IS+znv/+38fgn813BEHBHAex//LXlNpCZSEQfyiicWUXcE/cor4vX19XB/TsrFWSICEEZjAv6Dx1pbnK/4AVWN6m+GfvCKcQ4RwRhTnO9Z7sTQbGJoNhEguIrh6n0S5m/o4wB2mfdKihX3JO9fv+Lu9oHQtrjVJcauhx2wS6K/Z9Ff5/Jl70APY9cA3N0+DGNq7HBfV/nkZwkYE4a2pWnbPfLQQrXKIy+HI6pqOvdvGJqqRlWNOGK1eqpa4IhIIqPqyGU01sX7ypiLF0UiDBhrQAZRaXhtUl0wRdmAXA84IgoyJnh5OE0MoN38RxWgABWhYYFIWq3AUBEDIJLips7lBnLqgKsjGtK936T5TiIhwM9uzqVAExbYarfyfu4JTHogfvkUv377wdvPV0DdJZwRq50Ss+n6OdQzAnaJOSSX7v2K7IjHoj9ezYstEjCVyFlofNkzMyivVpVNOzAWIZKOwMY/3dcQSOYbQ2RHPhV/dAEAoTOGs/tjocB5IxRtmb1IBtQthNGzzhD11+F4Dop3YIqkURZm2s5xop0nwJnT5dVcgMyQTaHoY6Tb47EzLVAgQFL51y1wPxHuPHksfgxFHtAt+P3kw3bP1aYRDgyaJWDiL+foO7bL1HLxPIc8tJOrP0BokxEv36V++30vPHk8T3rgFOmfOCL0aG3IKRp/+5M5y/EbxxgVhzTZjSgAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  pc_rogue_3: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAALVBMVEUAAAAAAAAADFkAJpQARMlDMzV1dXWPV2Cpqam/kprMqa/a2trh4eHmx87///9pLysGAAAAAXRSTlMAQObYZgAAALRJREFUeNq10tEKgzAMRmFP6+Yf2/n+j7u0uIthai/GRFD4DiXQLH96YOLrysQzE8/86JmJp7sg92ByQOLWxwGHmR3H2O3xsu1hNgx288B2DSeo1YOqcaBSrJYiiH11LPI3Z0LPRb1QStcCd1TVXHApeFkG9UJuXALbWEDNlbgGjucUaiNiRnyR7uDFthF5AqmPS3wAC0/8J74L+p44MdoXmgCD4JTPJ97F1ILRzvH1hEPE+gZXxgUzXZdlkQAAAABJRU5ErkJggg==",
  unseen: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALklEQVRYhe3OMQEAMAyAMFr/njcZfYIBMtXrsL2cAwAAAAAAAAAAAAAAAAAAVH0hEgE/1YngfwAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  stairs: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAAEEfUpiAAAACXBIWXMAAAsTAAALEwEAmpwYAAAABGdBTUEAALGOfPtRkwAAACBjSFJNAAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAAEtElEQVR42mJkYGD4z4AEAAKIBUSYm5sz8PLygjFAADGBBIyNjRk+f/7McPbsWQaAAAILgGTU1dUZfHx8GAACiBHdDIAAYp44cWIDJycnAz8/PxgDBBATSK+DgwPD8+fPwSoAAogJpB8EQIJfvnxhAAggsBlaWloMUlJSYPzs2TOwjSCFIDZAAIHdlZ6eDuaAFJw5cwYsCVIEMgEggMDOAnFgtK+vL9g+mJ0AAQS2Yt68eXBFMH+A+CAMEEAY/kAHAAHEEhcXx3Dz5k24ThgNclNUVBQDQAAxSUpKghkwNyD7AoQBAogJ5HIQA+RvZMfCFAIEEBOy40AA5DWYD0AaAQII7k0QB+TFtLQ0uGKQOEAAwYMW2XiQdTAAEEAsMAbMLSAFoLiERTJAAKEEFLLrYUEPotEDEFkcIIDANsA4IImZM2diaEDmg/DmzZvB4qDgAwggFuQQQE4FyP5C9ieyi0AAIIBQQgmE1dTUwIEAMh3ERw5WWAoCYZiLAQKIBcZANgRmMyigYPLLli0Ds3l4eOCGgFwDEEBMyGEAswUW4rCIhXkD2XaQQSAAEEBM2AILlkxgimFRB/IaKCvCDAbpAwggcDS6uLjAbUQOE2Q+MkAOVIAAIpgfCAGAAGJpaWnBajosOmHeQ3YRTD4pKYkBIIBYDhw4gBLfyIrRUx0IgMIClEFBBQUIAAQQCyiHwJItcipEdg0sKkHqYAEMsxQggJiQbYTRsHQB04Ac1ejeAQggJljiQQ5tkBORxWDiyDkSBgACiAXZ/7B8DGKDwgYZgJIzet4AAYAAYsIWxzBbYQkJmQbJIxsGEEBM2EIf5lxYuoclW5hLkAFAALHAAgxbrgRhENiyZQtGAoJZBhBATLDEgp4TkQHIBciuALFh6gACiAm5AEEPIGS/w7wCMwjkchAACCAWdE3I0QkLA+RSFhY7MEsBAogJOdSxRRPMucjyyGoAAogFuQBBLnWxuQhWOcCSMwgABBALeoIBKQJV6DCDkIt7bOUDQACBywNQlkZ2AbJm9OhFNwTZddjSE7p5yMVEfn4+A0AAgSMB5GKQICyro4cjuoOQHYpedCD7DrkoQdYDCkaYOoAAYoGV/rCYhlWZIM09PT1Y4wKbGMwy5LSMzXL0OgAggFiQKwLkOEOPV1jIoPsSBkDyoBDEZgk6jZwPAAKICVvNjK2ehDUQ0Q1Gjirk1IluEXoWgIUOQACxoMcXTCGyb5B9iV72woId3SPYymZsACCAWLDlNeQ2J7YKH9RKgJWKoDYiLCRAYiA+tlyAzfcgABBALNiCHt0hyE029GhAL+vQi2vkVgi2LA0QQFjTAC6Xowc/yFIQG+RrmCUgGp2PXDCjZ3GAAGJBTijoKR89wcEwKBTQKyuQGaB2JygEQOIgR6DXCug5DgQAAogFPb/iAzB5WLwjW4Beg8BCE0SjhwJyOgAIIBZsJRs2hyBnR+REBAsFWDbFBkA9LPRWKSwEAAKIBVuxi8ty5EY2LK6xNfvQEyByVCG3eEEAIIDADgDFHXJ5AGu1wBQhd5xu3bqF05HoRS9yaKKnAxgACCAWWPcVV/OZUHpAjmtYjwIdIHcT0YtygACiuHlOKQAIMACcfn2L1lpH6wAAAABJRU5ErkJggg==",
  exit: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAAEEfUpiAAAACXBIWXMAAAsTAAALEwEAmpwYAAAABGdBTUEAALGOfPtRkwAAACBjSFJNAAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAAESElEQVR42mJkYGD4DwSMDFAAEEBMIKK1tfU/CDMyMjIABBBY4PPnzwy8vLwM8+bN+w8QQMxAfsOfP38YHjx4wKCgoMAAEECM6GYABBDDxIkT/4MwjA8QQIzl5eX/1dXVGZ49ewY2CyCAmM6ePcswc+ZMsKyUlBQDQACBzQBqAQuAbEpKSkKYBwQAAcQCIkDaQaphdoD4IMU1NTWMAAEENsHFxYUB5t6oqCi4BhAfIIBYYEbBPLNs2TK4dcbGxgwAAQQ2gQHiGRS7YQAggMDegNmfn5+PoQgggJhARsGsaGlp+Q8KL2QFAAHEBLMbpgjmE5gCgABigUnCAgamEKQIJAcQQMxfv35teP78OQMIg0L/169fcAxSABBAjMAw+A8zGtl7IBqEAQKICSaJbNWBAwfgbIAAAocD0PVwN6DHBSEAEEAsMNNv3rwJNgAUbiA+1DCUMMVmAEAAwaMKlGbQnYqcSoAW/IepQ3YlQACxIMczcmCA2OjiMDYsdkF8gABigQUKTLGDgwOGRphiEB/GhlkCEEAsyMEPEgCleFh6hRmG7EpktSDDAAIIJT2jK0R2AbKrQPEMcwlAAIENMDc3R0kI6ABmG7JrYGIAAQTPDzCAK1/gAgABxJiVlQWPd2B+wRnfuABAALEgOxsYPSCDwGkbmOGJMgwggFhgAYOeBmA+IpQSAQKIEZZ0kQ1Az5/4vAYQQCheAMU/rBhEjlKQ14A02GudnZ0ohgEEEBOy82EuQXYRrEyFRRs6AAggjJSInNqQxWEuQncNQAAxoQcizPnohqDbDpMDCCCWW7duwTXDiiKYgcgBC8sf6K4CCCAWZAmQYTA+yDCYYljgokUxGAAEEBMsjWPL/8hiyF5Ddh1AALHAQhc96kDZGsYHZWv0ggXmaoAAYsGWAtEDFmQYzGCY12AAIIBY0MsA9JhANhidBgGAAGLBkv4xogxZI3KJBQIAAQQuD4BZGh7KyAUIqFgntXwgFQAEEBNyVKPHENiFjIz/cWAGamCAAGJB9jFyECJlG3gcwTBahUcRAAggFmzlOKiWNTExwciOMAByGCjqkJMjksNIijKAAGJCL0zQExHIMdjYsFACRR1aqv2PA2MFAAGE0YrDVimjW4orz4ESM6zgQo42fFEGEEBMyA7AVRIiBz82xyGnD+RiiZiQAQggFvQiFr2wQ86zyOqwqUUuUJBDDpaYkR0IbWQxAAQQC3JRhW6BmpoaSnCiFyrYogxbAYSeiJEdBxBATMiCyEGKXqLDqkbk+hc9ypAxeoig64cBgABiwRXUsBoB2ZcwC0G1A3KLHpfP0c1DdgxMP0AAseBK4ejBhxzUsDY+ejsAuUZGjzJcjgEIIBZctQyyg2Chg8232Coc5IoY5lNsOQwEAAKIBZ9hyPGIzUforSBY+wQ9BGBRhi1kAAIIb0GErBg9KJEdhi3KsHkKW8gABBAjvmKSHgAgwAAbhh56uzX5KwAAAABJRU5ErkJggg==",
  chest: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAKT2lDQ1BQaG90b3Nob3AgSUNDIHByb2ZpbGUAAHjanVNnVFPpFj333vRCS4iAlEtvUhUIIFJCi4AUkSYqIQkQSoghodkVUcERRUUEG8igiAOOjoCMFVEsDIoK2AfkIaKOg6OIisr74Xuja9a89+bN/rXXPues852zzwfACAyWSDNRNYAMqUIeEeCDx8TG4eQuQIEKJHAAEAizZCFz/SMBAPh+PDwrIsAHvgABeNMLCADATZvAMByH/w/qQplcAYCEAcB0kThLCIAUAEB6jkKmAEBGAYCdmCZTAKAEAGDLY2LjAFAtAGAnf+bTAICd+Jl7AQBblCEVAaCRACATZYhEAGg7AKzPVopFAFgwABRmS8Q5ANgtADBJV2ZIALC3AMDOEAuyAAgMADBRiIUpAAR7AGDIIyN4AISZABRG8lc88SuuEOcqAAB4mbI8uSQ5RYFbCC1xB1dXLh4ozkkXKxQ2YQJhmkAuwnmZGTKBNA/g88wAAKCRFRHgg/P9eM4Ors7ONo62Dl8t6r8G/yJiYuP+5c+rcEAAAOF0ftH+LC+zGoA7BoBt/qIl7gRoXgugdfeLZrIPQLUAoOnaV/Nw+H48PEWhkLnZ2eXk5NhKxEJbYcpXff5nwl/AV/1s+X48/Pf14L7iJIEyXYFHBPjgwsz0TKUcz5IJhGLc5o9H/LcL//wd0yLESWK5WCoU41EScY5EmozzMqUiiUKSKcUl0v9k4t8s+wM+3zUAsGo+AXuRLahdYwP2SycQWHTA4vcAAPK7b8HUKAgDgGiD4c93/+8//UegJQCAZkmScQAAXkQkLlTKsz/HCAAARKCBKrBBG/TBGCzABhzBBdzBC/xgNoRCJMTCQhBCCmSAHHJgKayCQiiGzbAdKmAv1EAdNMBRaIaTcA4uwlW4Dj1wD/phCJ7BKLyBCQRByAgTYSHaiAFiilgjjggXmYX4IcFIBBKLJCDJiBRRIkuRNUgxUopUIFVIHfI9cgI5h1xGupE7yAAygvyGvEcxlIGyUT3UDLVDuag3GoRGogvQZHQxmo8WoJvQcrQaPYw2oefQq2gP2o8+Q8cwwOgYBzPEbDAuxsNCsTgsCZNjy7EirAyrxhqwVqwDu4n1Y8+xdwQSgUXACTYEd0IgYR5BSFhMWE7YSKggHCQ0EdoJNwkDhFHCJyKTqEu0JroR+cQYYjIxh1hILCPWEo8TLxB7iEPENyQSiUMyJ7mQAkmxpFTSEtJG0m5SI+ksqZs0SBojk8naZGuyBzmULCAryIXkneTD5DPkG+Qh8lsKnWJAcaT4U+IoUspqShnlEOU05QZlmDJBVaOaUt2ooVQRNY9aQq2htlKvUYeoEzR1mjnNgxZJS6WtopXTGmgXaPdpr+h0uhHdlR5Ol9BX0svpR+iX6AP0dwwNhhWDx4hnKBmbGAcYZxl3GK+YTKYZ04sZx1QwNzHrmOeZD5lvVVgqtip8FZHKCpVKlSaVGyovVKmqpqreqgtV81XLVI+pXlN9rkZVM1PjqQnUlqtVqp1Q61MbU2epO6iHqmeob1Q/pH5Z/YkGWcNMw09DpFGgsV/jvMYgC2MZs3gsIWsNq4Z1gTXEJrHN2Xx2KruY/R27iz2qqaE5QzNKM1ezUvOUZj8H45hx+Jx0TgnnKKeX836K3hTvKeIpG6Y0TLkxZVxrqpaXllirSKtRq0frvTau7aedpr1Fu1n7gQ5Bx0onXCdHZ4/OBZ3nU9lT3acKpxZNPTr1ri6qa6UbobtEd79up+6Ynr5egJ5Mb6feeb3n+hx9L/1U/W36p/VHDFgGswwkBtsMzhg8xTVxbzwdL8fb8VFDXcNAQ6VhlWGX4YSRudE8o9VGjUYPjGnGXOMk423GbcajJgYmISZLTepN7ppSTbmmKaY7TDtMx83MzaLN1pk1mz0x1zLnm+eb15vft2BaeFostqi2uGVJsuRaplnutrxuhVo5WaVYVVpds0atna0l1rutu6cRp7lOk06rntZnw7Dxtsm2qbcZsOXYBtuutm22fWFnYhdnt8Wuw+6TvZN9un2N/T0HDYfZDqsdWh1+c7RyFDpWOt6azpzuP33F9JbpL2dYzxDP2DPjthPLKcRpnVOb00dnF2e5c4PziIuJS4LLLpc+Lpsbxt3IveRKdPVxXeF60vWdm7Obwu2o26/uNu5p7ofcn8w0nymeWTNz0MPIQ+BR5dE/C5+VMGvfrH5PQ0+BZ7XnIy9jL5FXrdewt6V3qvdh7xc+9j5yn+M+4zw33jLeWV/MN8C3yLfLT8Nvnl+F30N/I/9k/3r/0QCngCUBZwOJgUGBWwL7+Hp8Ib+OPzrbZfay2e1BjKC5QRVBj4KtguXBrSFoyOyQrSH355jOkc5pDoVQfujW0Adh5mGLw34MJ4WHhVeGP45wiFga0TGXNXfR3ENz30T6RJZE3ptnMU85ry1KNSo+qi5qPNo3ujS6P8YuZlnM1VidWElsSxw5LiquNm5svt/87fOH4p3iC+N7F5gvyF1weaHOwvSFpxapLhIsOpZATIhOOJTwQRAqqBaMJfITdyWOCnnCHcJnIi/RNtGI2ENcKh5O8kgqTXqS7JG8NXkkxTOlLOW5hCepkLxMDUzdmzqeFpp2IG0yPTq9MYOSkZBxQqohTZO2Z+pn5mZ2y6xlhbL+xW6Lty8elQfJa7OQrAVZLQq2QqboVFoo1yoHsmdlV2a/zYnKOZarnivN7cyzytuQN5zvn//tEsIS4ZK2pYZLVy0dWOa9rGo5sjxxedsK4xUFK4ZWBqw8uIq2Km3VT6vtV5eufr0mek1rgV7ByoLBtQFr6wtVCuWFfevc1+1dT1gvWd+1YfqGnRs+FYmKrhTbF5cVf9go3HjlG4dvyr+Z3JS0qavEuWTPZtJm6ebeLZ5bDpaql+aXDm4N2dq0Dd9WtO319kXbL5fNKNu7g7ZDuaO/PLi8ZafJzs07P1SkVPRU+lQ27tLdtWHX+G7R7ht7vPY07NXbW7z3/T7JvttVAVVN1WbVZftJ+7P3P66Jqun4lvttXa1ObXHtxwPSA/0HIw6217nU1R3SPVRSj9Yr60cOxx++/p3vdy0NNg1VjZzG4iNwRHnk6fcJ3/ceDTradox7rOEH0x92HWcdL2pCmvKaRptTmvtbYlu6T8w+0dbq3nr8R9sfD5w0PFl5SvNUyWna6YLTk2fyz4ydlZ19fi753GDborZ752PO32oPb++6EHTh0kX/i+c7vDvOXPK4dPKy2+UTV7hXmq86X23qdOo8/pPTT8e7nLuarrlca7nuer21e2b36RueN87d9L158Rb/1tWeOT3dvfN6b/fF9/XfFt1+cif9zsu72Xcn7q28T7xf9EDtQdlD3YfVP1v+3Njv3H9qwHeg89HcR/cGhYPP/pH1jw9DBY+Zj8uGDYbrnjg+OTniP3L96fynQ89kzyaeF/6i/suuFxYvfvjV69fO0ZjRoZfyl5O/bXyl/erA6xmv28bCxh6+yXgzMV70VvvtwXfcdx3vo98PT+R8IH8o/2j5sfVT0Kf7kxmTk/8EA5jz/GMzLdsAAAAEZ0FNQQAAsY58+1GTAAAAIGNIUk0AAHolAACAgwAA+f8AAIDpAAB1MAAA6mAAADqYAAAXb5JfxUYAAAXlSURBVHja7Ja9q21HGcZ/874zs/Y++5yT3HujdkGbdBa2gWtjEEyVv0ELS0Ut7NKkEwIp7GztNYiCgaQRgmKRIFgIgqlEbm7u+Vx7zcc7r8U+e+VeTeo0WbBYi/Ux88zM8/zmDe7OF3kIX/DxpYAvBXwp4AsXgLvj7oQQHFjPlJIDrqouIs+8A5559nn3x7bHGLg7pRSeftZaIwLHzvngt98h58wYg3meUVFqq+z3e3rvhBAA1oZ678zzjJlRSmHYIMjhGzNDVd3MwlFASmkdeAiBGONBgIjwt999l/feeo/9vnBykkkYJ+K4D2IIZHeGBlQFJDLXzmUxRoiIClfXlRjh4ha++u3I9fud178POWevtYbPmv3eOzLGYIyxjnyaFCuVs6xkcU4EUhRuBhSPXCzGJ1eFEZSzrEQJ3M6VKQee7OGyw8nJCSkFUlJaa9RaP3P5Y4wHAQCtNRKGmvHgNGFLpVXnsFcFQghc7Bt7V9BAFhjDGKVxPgXMnOaBrR4av5ehNQMg50yt9f+EtNaQlJL/893XePcXf+Bsitw/mxitgcDpaUIFJICZM+XIKIaqMKwzXAg5cjU7IcDzGV763jnl/Ws8BPqH8MYPAzFGjzESY1y9A5BSQmKM9N7JU+aqdm73hbkBIsxz47qDihAjbNX5ylkiulHa4LrD1dxJG8UdfBycfjU7AyVGYZomzOyw3iJr58erjDEIIbCUymgDAmw3SimD2SAYzEtlk4RpGJN0YkrcNNgkBYfeDAlw/zSy3W452QjdjOJOrZUY4+qxlNKagFor0d0xM+7vJspScAN143SnDDM8wM0CaoOYhVIG19ZwoC+NB7tA9cAkkCNUd05iIKmye6mjqoCvMT5G8ugNcXc2mw0qThB4boLnd0LoRhTQAJqgONzuB0WEbRK2WdhOgW7OvQmsDUrpuDsbdf799U744JCwY+cigogQY/w0hiJCKYV5rod11EgSRxS2m8wmKbskbLKy2URUlN4G2yzMizNlofuB6JuNMsbg8ptnvPivwWYTCeGQIFVdKdhaW2MYjzF8+aev0nuntcYYgxgj1o1SC+d3Prm6ujpE50506p1SCgCnqlg3fD+T/nKJZ2B0aoVj2Wlmq/vHGJjZgYTuToyRP731R5IffjrP8LXnEvulsXntW/zozc5bP5l49Ju/sxHYCpxMkX019t25qLB7+IBpmngybpEOU04saZCzrrgPIaxYbq19uhv+/o23ub7tmMPZNiAKrRspCjlndrsdpRTE4YUTIQp47eCOOWw2mSfvPabWShKwAb0bIYQD5J7aB2KM674iANvtlnunykZhlyNRA2cnGcHZJuHRr//M6z8Ae+cfvHAaUVWyQp4EUSUMSHTuneaDyQI8fxqpZawdHUXc7bxrEuJxKnwcUvDounOeoVvlXg6ICvc2EN75K01gEqf5gRGlO/sy0AClD/atksOWEANXS4dwWPdjZ09j/5gEaa1hZthwFgOdInsCU1Tm5nx8URkpU5aO1U514XYZdFGum7M47DXiwNCAmfHJ7EQJDA3UOtbpN7N1Ro5klCMQLAhZoJSOhchNMWqHAvQBQ2CzTVQzusF+MUSU2sGGsXSId8CRKXO5d+bm7HbTMx44GjClhJmF1YRtADGQI3hvdAdzIMBcD6h9dNnofaBZIUBtB1Lu9w4qhDvM9la5QfnoCSuAxhh3VOTIgmBmxKfpZGYspXP/PDN5YxsD26yU7jzeQzPoQ8mqFDMy0AN4gmUZpDxIkrme4aIZ33gIP/9lW7mvqgeBvYdjISRjDJZl4ZWfvcq+DjQJt/tKG8rHN4NHN53H82D2yMVQ/rMIH31cmStYjMwVQoiEKJw/fIEQAjcoL74ceP1Xn+Y+xkN6Yozh6XogqKp/+PYr5JwJIaz1Xe8d64aoMM8zpRRqrYgIy7KgqszzzHEA0zRxdXmF43RL/PjNm9X1OecjYcP/MuEYEQf8WBnfFRDrfc7ZgfX6edWyqj5TEZvZGsOnK+LjWUrhvwMArtH4xBxhoZYAAAAASUVORK5CYII=",
  chest_open: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAKT2lDQ1BQaG90b3Nob3AgSUNDIHByb2ZpbGUAAHjanVNnVFPpFj333vRCS4iAlEtvUhUIIFJCi4AUkSYqIQkQSoghodkVUcERRUUEG8igiAOOjoCMFVEsDIoK2AfkIaKOg6OIisr74Xuja9a89+bN/rXXPues852zzwfACAyWSDNRNYAMqUIeEeCDx8TG4eQuQIEKJHAAEAizZCFz/SMBAPh+PDwrIsAHvgABeNMLCADATZvAMByH/w/qQplcAYCEAcB0kThLCIAUAEB6jkKmAEBGAYCdmCZTAKAEAGDLY2LjAFAtAGAnf+bTAICd+Jl7AQBblCEVAaCRACATZYhEAGg7AKzPVopFAFgwABRmS8Q5ANgtADBJV2ZIALC3AMDOEAuyAAgMADBRiIUpAAR7AGDIIyN4AISZABRG8lc88SuuEOcqAAB4mbI8uSQ5RYFbCC1xB1dXLh4ozkkXKxQ2YQJhmkAuwnmZGTKBNA/g88wAAKCRFRHgg/P9eM4Ors7ONo62Dl8t6r8G/yJiYuP+5c+rcEAAAOF0ftH+LC+zGoA7BoBt/qIl7gRoXgugdfeLZrIPQLUAoOnaV/Nw+H48PEWhkLnZ2eXk5NhKxEJbYcpXff5nwl/AV/1s+X48/Pf14L7iJIEyXYFHBPjgwsz0TKUcz5IJhGLc5o9H/LcL//wd0yLESWK5WCoU41EScY5EmozzMqUiiUKSKcUl0v9k4t8s+wM+3zUAsGo+AXuRLahdYwP2SycQWHTA4vcAAPK7b8HUKAgDgGiD4c93/+8//UegJQCAZkmScQAAXkQkLlTKsz/HCAAARKCBKrBBG/TBGCzABhzBBdzBC/xgNoRCJMTCQhBCCmSAHHJgKayCQiiGzbAdKmAv1EAdNMBRaIaTcA4uwlW4Dj1wD/phCJ7BKLyBCQRByAgTYSHaiAFiilgjjggXmYX4IcFIBBKLJCDJiBRRIkuRNUgxUopUIFVIHfI9cgI5h1xGupE7yAAygvyGvEcxlIGyUT3UDLVDuag3GoRGogvQZHQxmo8WoJvQcrQaPYw2oefQq2gP2o8+Q8cwwOgYBzPEbDAuxsNCsTgsCZNjy7EirAyrxhqwVqwDu4n1Y8+xdwQSgUXACTYEd0IgYR5BSFhMWE7YSKggHCQ0EdoJNwkDhFHCJyKTqEu0JroR+cQYYjIxh1hILCPWEo8TLxB7iEPENyQSiUMyJ7mQAkmxpFTSEtJG0m5SI+ksqZs0SBojk8naZGuyBzmULCAryIXkneTD5DPkG+Qh8lsKnWJAcaT4U+IoUspqShnlEOU05QZlmDJBVaOaUt2ooVQRNY9aQq2htlKvUYeoEzR1mjnNgxZJS6WtopXTGmgXaPdpr+h0uhHdlR5Ol9BX0svpR+iX6AP0dwwNhhWDx4hnKBmbGAcYZxl3GK+YTKYZ04sZx1QwNzHrmOeZD5lvVVgqtip8FZHKCpVKlSaVGyovVKmqpqreqgtV81XLVI+pXlN9rkZVM1PjqQnUlqtVqp1Q61MbU2epO6iHqmeob1Q/pH5Z/YkGWcNMw09DpFGgsV/jvMYgC2MZs3gsIWsNq4Z1gTXEJrHN2Xx2KruY/R27iz2qqaE5QzNKM1ezUvOUZj8H45hx+Jx0TgnnKKeX836K3hTvKeIpG6Y0TLkxZVxrqpaXllirSKtRq0frvTau7aedpr1Fu1n7gQ5Bx0onXCdHZ4/OBZ3nU9lT3acKpxZNPTr1ri6qa6UbobtEd79up+6Ynr5egJ5Mb6feeb3n+hx9L/1U/W36p/VHDFgGswwkBtsMzhg8xTVxbzwdL8fb8VFDXcNAQ6VhlWGX4YSRudE8o9VGjUYPjGnGXOMk423GbcajJgYmISZLTepN7ppSTbmmKaY7TDtMx83MzaLN1pk1mz0x1zLnm+eb15vft2BaeFostqi2uGVJsuRaplnutrxuhVo5WaVYVVpds0atna0l1rutu6cRp7lOk06rntZnw7Dxtsm2qbcZsOXYBtuutm22fWFnYhdnt8Wuw+6TvZN9un2N/T0HDYfZDqsdWh1+c7RyFDpWOt6azpzuP33F9JbpL2dYzxDP2DPjthPLKcRpnVOb00dnF2e5c4PziIuJS4LLLpc+Lpsbxt3IveRKdPVxXeF60vWdm7Obwu2o26/uNu5p7ofcn8w0nymeWTNz0MPIQ+BR5dE/C5+VMGvfrH5PQ0+BZ7XnIy9jL5FXrdewt6V3qvdh7xc+9j5yn+M+4zw33jLeWV/MN8C3yLfLT8Nvnl+F30N/I/9k/3r/0QCngCUBZwOJgUGBWwL7+Hp8Ib+OPzrbZfay2e1BjKC5QRVBj4KtguXBrSFoyOyQrSH355jOkc5pDoVQfujW0Adh5mGLw34MJ4WHhVeGP45wiFga0TGXNXfR3ENz30T6RJZE3ptnMU85ry1KNSo+qi5qPNo3ujS6P8YuZlnM1VidWElsSxw5LiquNm5svt/87fOH4p3iC+N7F5gvyF1weaHOwvSFpxapLhIsOpZATIhOOJTwQRAqqBaMJfITdyWOCnnCHcJnIi/RNtGI2ENcKh5O8kgqTXqS7JG8NXkkxTOlLOW5hCepkLxMDUzdmzqeFpp2IG0yPTq9MYOSkZBxQqohTZO2Z+pn5mZ2y6xlhbL+xW6Lty8elQfJa7OQrAVZLQq2QqboVFoo1yoHsmdlV2a/zYnKOZarnivN7cyzytuQN5zvn//tEsIS4ZK2pYZLVy0dWOa9rGo5sjxxedsK4xUFK4ZWBqw8uIq2Km3VT6vtV5eufr0mek1rgV7ByoLBtQFr6wtVCuWFfevc1+1dT1gvWd+1YfqGnRs+FYmKrhTbF5cVf9go3HjlG4dvyr+Z3JS0qavEuWTPZtJm6ebeLZ5bDpaql+aXDm4N2dq0Dd9WtO319kXbL5fNKNu7g7ZDuaO/PLi8ZafJzs07P1SkVPRU+lQ27tLdtWHX+G7R7ht7vPY07NXbW7z3/T7JvttVAVVN1WbVZftJ+7P3P66Jqun4lvttXa1ObXHtxwPSA/0HIw6217nU1R3SPVRSj9Yr60cOxx++/p3vdy0NNg1VjZzG4iNwRHnk6fcJ3/ceDTradox7rOEH0x92HWcdL2pCmvKaRptTmvtbYlu6T8w+0dbq3nr8R9sfD5w0PFl5SvNUyWna6YLTk2fyz4ydlZ19fi753GDborZ752PO32oPb++6EHTh0kX/i+c7vDvOXPK4dPKy2+UTV7hXmq86X23qdOo8/pPTT8e7nLuarrlca7nuer21e2b36RueN87d9L158Rb/1tWeOT3dvfN6b/fF9/XfFt1+cif9zsu72Xcn7q28T7xf9EDtQdlD3YfVP1v+3Njv3H9qwHeg89HcR/cGhYPP/pH1jw9DBY+Zj8uGDYbrnjg+OTniP3L96fynQ89kzyaeF/6i/suuFxYvfvjV69fO0ZjRoZfyl5O/bXyl/erA6xmv28bCxh6+yXgzMV70VvvtwXfcdx3vo98PT+R8IH8o/2j5sfVT0Kf7kxmTk/8EA5jz/GMzLdsAAAAEZ0FNQQAAsY58+1GTAAAAIGNIUk0AAHolAACAgwAA+f8AAIDpAAB1MAAA6mAAADqYAAAXb5JfxUYAAAdPSURBVHja7JfLqyVXFcZ/a7+q6px7u01H1IEBhUzUSERFRBJjfCYRIv4LDoIgBgyOHOhAQsAoiEacOHIoolHzELTzmhhFDZo0QRARQYN2d7r73nPq7Nqv5aBune4WHWdiwabq1KH2Wnutb33fWqKqvJaX4TW+/u8AqoqqMk0TqkrOmVorgP635b1XEVHn3P7dtc/LWvZd9lRVaq3XvSul4BZHQgjknOn7XgH+8NOPUnJh3I2UUgghsNlsqLVSSkFVGccRYwwxRo6OM8ZatpsNxhiMMWqMoZQizjlaaxhzNeDOzaZdKQURwTmn1lpeePTDGGN48btnOQxCHAtJ4PII1sNBb1nVStcL66ocJzhOcH4DPsCZHlyDr98/MO52iIiqqogIiy0RQVUxxuCMMVhr9c9nP0UphaceepzDteXAW5w0DjpIxtFKoe8N3gqtQrCGsVRShlqhCYwJXveB01zabnnznyL/HIWv3qeIiKaU5CQyAJRSqLXirLX68s/v4emvPc7UlF2BvjQuxsobDx3BCaed0B0YtqlhtTEceCYVdgi4wg194EpOHLx/zfb5K5xZObZFeSUGTmlCRDg56N64iOC9x3nvGYaBO754N8YYUkqoKjFGrLFsxy0igq2VenSEiLCNkZwzQ9+j44yRm0phjDDZiQubgmlwZWqs65zvxXitFRGhtTZjYEHoTx58kpwLqUFu8KYeOgMhCKYqg4fWYFdBG8QGxTlyqRjvGcfEDXe8HmuE4wzBGxABIOe8B9/iyHI3OWd564d+xL1fugu8x1qDFzDB0Q+BKSlVwBhhV2bjRWG1CrTWSEVpTcHAhWcuYG6xHAxCyQ1Jma6z/5MCUkqY1hqqKm+/+0k++cAdOO84tQ6YWnBGORygFLiUYKcQBQoQS+Owc9QKMWVKAR8scq4R3r3idICbbvQLp+wNXvscQsAsoYgxyq33/pJ7vvBBHIXBQU6ZNIEPQqlKbMJkAs0YOmfIJTE4WPs5alYrNSaGl3aY9x1g6xz6JefX8kAIYcaAnOTJOcc0TdJ1nZ574i5++52n8DRcUHZpPoX3npITTaCkhLiAuso2VgQwBaxA5x3h3MjuXQ6rishc86WU61KQc555AKC1tvdqt9tx6323sxt3NJ09r7USYySltN8opcRhzns2TFMiTpHJe3IGFxO7aQbvtadeytAYc5WKFyPLSZ9/5BmaVmxVhsGz2WZ6B12wXDiu0HtKVbZTQRWMwLrz0DIqCS1wlMHdcr3mLNGutc5ElFJauJvVaqV//NnHePbhXzB4sDrr5eVNBgUNgYyyLRUzZdZdIDewvcNToWZag1UHtcH6Pf4k79OeghdBWrDnFo9ERF987OP8+ltPczgItilVwTihGEPFcnmTwMANh4FYKtOYsB7WUsgNjINBoXfwt5sN/C4T38GegKy1WGtnFTwhJxNCQET0pcc/wXPffpZmDF6UxlzrnXMMRkgxYQTmKDaCE8QLfedR6wldoFYQZzn/tjU3/8OxWoWFi7DWoqqklLDW7snJiYiee+IurLXc9rnb93/mnNGmOO+IMe7FY5HinDPjOBJj3OfY54IYYfXsJXYWDA7vLVDpuk4X8C6AP4mE29fqrx45y2DBOc+pAGvbUITh0+/l/m9kHvps4vyjL9MJnFkLThy6ycQKlxOcvvNGjjfH5DqzsDFQSt2DrrWGtfY6LJhSCqvVirMPP0ZMSkyKozLuElMqsOi2c/R9z6l14EwPrSiDg4N1wHcGa+HouYt47+kchM7SmqJ6VXoXLHjv93cDMI4jTuH0ynNqsORUOVx5Vn1AauHoh7/hy59RLvzgBULLGAO9h3GXKbUxBEdnoLezgSFYBm8RlNbmsr623FOaJTqlNFfBarUieGE3ZbYNzqyEi8eZ4uD0WiBlDp96ga6H3irNGGKFV3cN4wp6opA46LqObYyUWonTnIpr1VBVcc7t2zyzMF+cFAketcJRhiEIGaji2RbwzjAEw67AlU3jyq5BH0hiuXiiF1ODGCPHGUoCvMX+hxgumFvSYJaGxHYWqRnnLKkJm0nJFa7EAgY2sVKq0gRCZ2gK45hQMVgH20nprGCtZWpQDFwZKyGEPQUv/F9K2XffZqHIVJWCkGLBaCPVk6lBDGOam+3YDMY4Ym7UBmJgN2VyBjUwJj3p8+Coef5+PANwKT9r7Z51T3hBzCIks3eKAsHC6ZVBGkgprNeeixHOH1U21VBEwAm9Aa3gezOTkMyCk6rwl39l3nIbfOV7s7El9K21pRxFVeeGZBgGbv/8R5gKNKCqEDNE4NUdXNhWsgtczPDXS4lLyXE0zi35mKA1Q1E4c+cbyDnzyrHyzrvXPPj9sA/3cvITR2SpBAkh6O9/fOcenTnnfQOx3Wypbebw8aT5XNiw1ooxhpwzrTWOjo7QpkxpAhl44Jvj3rBzbt8NWWvFWntV1nPOWGsV0BDCdaPW8ntZIrIfzUTkv45uy7fXjnzL2KeqnLSA+/XvAQAAbLzI/xcWmgAAAABJRU5ErkJggg==",
  gold: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAG1BMVEUAAAAAAACHVgmpbAjKjg3onQf9/1n/tR////9PcilgAAAAAXRSTlMAQObYZgAAANJJREFUeNqdk0FywzAMA0MsQ+j/L27Z1Kk0UnMwdQS0tkH4cWOi55NcZftfS4xCgnIcwVEon5lPVHEE+6V/nwURLgFUyvWj28Skl3hdxOCGQc4G8wtGLnqcmj42uMAyeJSzCYujwcNoJiyOAESEpVFNUEbPlgNNaFByTDwM/iPs+4nlHU77Cb0IYtJdEtd+IkAtxxYjVLyft8W47+exx2idDQbXsFGeDHM2Hwi9H4mtr3M2AlWNva9XNsglOPcVkJY8TpW+n8daK5tN32p19789zxdwaAcJGNbkuQAAAABJRU5ErkJggg==",
  trap: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABzUlEQVRYhe1WwXHDIBBcZfLM40qgBJVACZRACS7BJcgduAS5A555UsKVwCN/8ohR0AESjp7RzngGw3G32jsOgBMnTpw4jnhk81tngOZvnuc9m00Me8GttcsfIlotTtOEGCOGYcD1eq06eM4342wRiNZahBAQQigWnXOIMeJ2u0EpBWMMtNYrGyKC1hqXy6UZ632DwAo1Els2Uq0WemqgCO69R4wRj8cDzjkwM+Z5hvf+JcJAOwXRWgvvPYiocBZCADMDAIwxeBYixnFc2aW91tpmGroUSEFzxykYff4EV0pVbfeU6E6BVEI6TjmXtnu1UCOwyJ87zx2nMQD4r19CuU1O6H6/Y5omoNIXXirCmgLjx7ZtrYa6CUhnNUdJgdZ6rkYPgUX+fONW/qUCcj3tbaWhqUBNutpcXgOtI7uVhiYB+cXGGCilluMma0BWfuuUdBGQVZzAzCCi1ZmXCuTjnn6QE2h2PyICMyOEAO89mLm4eGQQOSaiah0UCrQqOYfWGs65wk5rXbTjPd8FgVbBpDmtNbz3qzTk88xcJdE6jolAtNZWv0oGSR0vXUYywF7rlWlIt9Pq5XMEUpkaiGi5HfPr8dDj8g/Yew7+E3wDyexoWx10BDgAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  fountain: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAADkUlEQVRYhbWXwXXcOAyGv9ndAnj0bVgCOximA3dglaBUYLoCKx2wgygd0B0oN99CdaAOsAcRNCVnPDPeLN7jkwRIwA+Q/EHB50UuPF8lf90YUIPIMAytTvq+b0G07/4RkRijDMMggDjnpIAQ772EEN7pY4xXgbimAhJjZFkWUkqEEAC4v79nWRaMMSzLgvcegBACKSWWZSHGyCUQlwDIMAwoAB0qOWeMMUzTVHXtezFGmqn6FICNQw1urSXnXLPuuo5lWbDWnv3mnPxzDYD9VccwDBhjGIbhXcD99T8BmKaJaZqw1n4YZF9+AOfcpRAXpZ0/sdaKMUaMMeKckyElcc5VnbV2v/o/XISHzwByztVq5Jw3c18W5NV+byEiAPHeb4J3v37V3WCM0YV5NQndCqCKAvCs21FB3Cq3AjgoyWgwf1irrc8pJfg/pyCEUDnAWksQwVqL955pmpQp/+gU1IbjvccYg7W2XoHN824dXOwHH5VKYOV2DTSO44b/jTH0378TvnzZ6GCdEu0XXdedjXeOiCTGWFd2Sqlmpxm3hKRkowvTOYcxhpxzJaUyTVqNCmSPSNpMp2nabLGh7+F4hHler0ACvH6t+nmmX5tQ5Yl2ykpFDnsAm6zHcWR4fl6dAhyPBCDMM6EE98AJeClAaOxBARXpS9/Q6pUDzEEBSEqp9nGA4fm5Om0z9fNMOh457Ur3Uq5q31Sm3PdfvwLrlDUgVgAhhPUUk7MgIqkZ5CxJVkki1S6NrtWnxh52dkQkxigpJQGkbkNr7TpHBb1meAJSKblmqdkdis6XkZpvaGynxsY8Y62th5gKQOlU5+1pV9oNoGbwm3tdE3sgoTxP01R31KYCOee6un3jsAXy0thOu3dOwGO592wrhgIo/lX+VpsxBucc9z9/MjlHBmwZ6sSWIHN51hX8UHRzY8vNt5a3CvinJ+7u7hjHkdfX1+pD9FillbDWkh8eNmg95yXt7L7hBI5Hhm/f6hbU7T6O4xsT6pErpUTXdSuj/fhRmRAgPT5u97dyg+qagKGwn7UWciYXZlRfut03RFSO0G+93vtKrS3Ntich7QGwLmSgUrFS+LIsjOO4oXBt2++ouOu66li5vD2GK1PqrvHeV9rWjDVT3W4KUoG2Z4bfdUOBla9bB21g7Xpq12akNq1CSqkG19IXOduM3gFppe/7+ifknKsB2yqdCXg21q2n4lv+eK/y/S8pgwKPtk+brAAAAABJRU5ErkJgggAAAABJRU5ErkJggg==",
  shop: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH2AsVDRgondgBrgAAAe1JREFUWMPtl6GP2zAUxn+pBk6nAZNJ1SHjjZh02OhAUf6DGW/SVDRNGvHA8dPQNDIPTBoMKhgyLwkZf2TVpCMmq455oG2a6123Ss2l4Pakp9hJrO/Ll89+Nhw5in+9EFpt1ze7sKPdK3iMsT8C4cGDu+ERwHeROAq4eXwkEuEvXuhVhaOB/48HHQWA956UEgB1XSMiACilmquIYIxBKYXWmvW4TsJaC5DXWZYl3nu01jjnbgF573Gu2+Kc3XCTQA4hYK1lMplgjAFAvo8z0PRDeTjwAMhegz5pbTyG4JzLKSWUUtR1fWPQdv9QAk1sk6jrOq/7Mdgs8wUx2Nyl9I8A5HoDrk+WaT+MCedTqqpa+sTFIueci6JotnFadaSAXC9zW4WV3LllUIC8Mm1nChQxka0Ce8cXuVKjz06R+aK5F2PM+2xo91bAe1/EBOHXzYf+5VPs6Alv3zxHn50unX8xamZOZwRCCGit7yQRZ1d8+/oDmS94/+oZL97NGhKdecBa2yw2Vm1IyHzB50qQn7/5eGmR+YIvFyPi7Kr7pXh1zV63/v+n8c6B+nyKTCj0ZQfTUGudReSWqeLr6b0XowFAVVVFjBFjTOGl32o4aFfAlBJlWfZKYrAuLusCY4whhLAXCUn3fzrOh5ys94k/Rr/T40EMgdwAAAAASUVORK5CYII=",
  altar: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAIVBMVEUAAAAAAAD////w8PDg4ODAwMCwsLCgoKBAQECQkJCAgIB/cYNkAAAAAXRSTlMAQObYZgAAAKNJREFUeNrVkDsSwyAQxfLCL3D/A0fLLHFsCIW7qGJG2lfw+EMEWx9Bew/aeWlTqCvdD3B7D7e9S7DAWPonWBBAaw/CR9DSc4laf6dSzjklLC9jDhIBhZeLwAv3ZQ6gK8BfA/lxGb68dPYERindW/BdyIOumPFAx314nghGrGyM/YvEQmNkBCFDcWqtzTiCMA34SvVgctFpHqTPfIV2MILfELwBx7YG+SaqcIIAAAAASUVORK5CYII=",
  romance: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABiVBMVEUbmN4AAACgeABgSAAHRpcAN4A2g+UAMnbAkAAOUqgfacYADyYJSZs/jO8AHUoha8kTWLEAIFEtedoALm8zgOIAJV0rd9gBO4YgAAAANHkBPIckb88wMBgAOYMUWrRgMAAZYbwGRJQdZsRJlvcAIlWgAAAAFTdBjvBRnPx2tv8wDAAAKmcOUaYAFzsADSGgzv8EQZAIR5hcpf8ALGsAG0ZztP+q0/8RVq4EQY45hugwfN4odNWn0f8AMHIAECkue9wcZcKw1v8AKWQAFDTgAAACPoqBvf8WXLZDkPEAEzAAFTUAEi4mcdEANXwTWbIMT6MRVaxSnf1hqP9Nmfn/AAA6iOpjqv+62/9IlPYNUKU0geNmrP8ADiQ+i+1wsv9Un/4DP4tLl/hGk/Rusf8bZMGNxP8KS55WoP8wMAASV68jbs2dzP8LTaEXXri+3v9EkfMnc9MADCA8iewQVKsQEBAwAAB+u/8AEzKRxf9orf+t1f8YABgPU6kFQpEISJkwJAAxfuAtLQAXX7nASBvrAAAAAXRSTlMAQObYZgAAAdxJREFUeNqN02WPHDEMBuB9k2HYWWZm5mNmZiozMzNc+8ubrlRpZueuOn+y5EdO5DgOS6AfjnMDEV4OyNy5BO5wfcErbnGBAfGvK1re+i1u1JkbEDA4D/pJghfl7Fg0vCCbBQx/Lt4XmIh/CxzfLI47OQuY4tOc6xJYpo2uPJwUjvfH4maBqsoZEx4mUAxGl2euvLlxVQyagVt1bq3c0zxA6sHMqutzs9kR/LIJ9Ka56wEam9XwK30nYTz1ZY7KfkuHa+7W5Scu8oxwynaxnB0/GQ6IlluuhQX9LmIkBkXWfdlJYVVP18zAqQZrOMzTwzx29Oynzu3mnmKd1AYfRX6R5BcBISoMl5d5WEfNq9/bIJRQiQKlozkeg48x39MgjUhJIsGB/ftzQ4MtvGpXieERSRIKPNYNl02sN7yKCBCAEW7zeWZo8JBqQ4RIQSEx8eLlq5JNdF+7IYQIJRLBztuOrQWbBqrtd3jPBPQPmVwJtoX7WHBVfKEkpfiSyqV8djA17Q+1v9Ik2GodpJbOEF01XvnxE9tMjBzMnjJgu0YhNF+p7e4yEUkn4LALBP2hwpoTLO3VFZxJsBRsrP8V2DC0vrAbrRUG2Pwj5rqVeH6z4n8/6d6mrWr/jReMP0DQPDMEOjipAAAAAElFTkSuQmCC",
  surprise: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAGFBMVEUAAAAAtw0Atw0Atw0AAAAAtw3g4OD////kxKsYAAAABHRSTlMAIEabSiCCNQAAAHVJREFUeNrN0jESwCAIRFHQNfc/cgxmoMCVVoo070+SUeTCAQofA2fvfeDorVnBXdUK6phjBfNnjhXUvWAOeJFcMUnke9qfJpcIJIrwdc5/tYoUiDt5BfEoyAeiWIH7vkiej0KLy0BxncT5wvCV40tbrv198wJVugP1PuXlIAAAAABJRU5ErkJggg==",
  blood: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAHlBMVEUAAABSAABbAABkAABlAABtAwRuAAB3AACAAwn///9ETeKrAAAAAXRSTlMAQObYZgAAALlJREFUeNrtkcEOwyAMQ0MMhP//4sWBVlk2TbvstifRotg1IZU/PwX2WTeUgsbDkbfMK9YAqIYTJYMlo2FOJXxlnRWxA6DTqV04rFOni9uiT+qsB3SxLzkA4FfHhIjBSAmRu/XeW1M1GLI+1hr7bMJuUCa7xrATQ5TAnroE9XOQsWdzNI1y3/Kw93LPs4dOeD+uvaujYhVXwOuvYxUkXJBK84T9G4csQPOQkieX2u2IVfFA+cxsXb7hAbkeBehDW2cuAAAAAElFTkSuQmCC",
  skull: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACkElEQVRYheVWvXkjIRB9e3eBQ8INxxWYEujAlKAOtCVwmUNK2BLYDnAHhMo0HYhQ2VxgwSfZay0rb3bv+/jYH2AeM48ZgP8d3QNzZKN1Vk8UAIgxIqWE8gwAIYSHibROkBgjlFJQSiHnDABgZjBzJXMhsorE7xbjIQT0fV8JAMDhcAARQWuN8/kMpRSenp5wOBwcgL9bEnDn8xkxRvR9D2bG29tbDUPf99BaI+f8MIl7EGutEJEQkTDzzTsA8d5LCEFSSsLM4r0XzAt1Fr9aBhEzjuOxxrt8kygYhgFEVD0AANZatJJYJOCcAxOhMx1yzjDGAACy1ujMh95uiBHVMS34szSAiMDM8N5Daw0iAgB472tPRHX3AOop2YRAMR5CQIwRzjns9/v631oLZq5Er49pC5ZC0GmtobWuSadgv9/feCfGCGaG1hrGGAzDADToYNEDwIdLvfc1tu/v73WXSimklDCOI5xzSCnBGHOjix8TeH19xTRN1QtEBCLCy8sLnp+fEUL4ECtzzQ+bgohERGSuV0qJtVZCCOK9F+ec5JwlxtiUE5ry9iXpzIrrdDphmiYwM3a7HVJKVYhKKWit79ppSkTMjOPxCKUUTqdT7cdxxDRNtUYUEa4Jw6pyHEKoyv8sMmMMUko1J+ScobUu+eFbO00iLGSttV/iOQwDcs61lcLU6omHbzJXqKTK+S+1oXy7Z6dJAwvoSiuXlhKeloy4BYEb5JxrvbhUxbteXqOBa8ye7VKgYoxfUveWBMRaW3d53RejlzoANGhs9a14t9tBKVUNXt2IH123zbgxRi7H8HO7R7h17DKBcgdcGtfQbrA6BDPz1u6s+/blB0RaSMza+qlYWnf/rZ1NU/Ej6/8Ddk2NCyjv9PQAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  potion: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABF1BMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABYWFgAAAAAAABycnKVlZUAAACGhoaNjY0AAACjo6OIiIiDg4O4uLi7u7u7u7sAAADGxsa1tbXZ2dkAAADW1tbd3d0AAADp6eny8vIAAAAdBBZCBRxDLz5ZJDhbSFVkZGRmBARqOCJvQFJvQVN1SVp5IyODdn+IXzeIYnCLQUGQSEiQkJCRBgaXFBSXdoOkpKSlMzOmbW2pPT2pdTivSkq1hoa3DAy5jIzAcnLCMTHCdXXHQkLJycnLUVHLusDSaWnVc3PYqKjbra3csLDflpbjSy3rvLzxqYLx0NDyrZ/ys5HztKf1v7T1xLr2yrL3zcX41MH53Nb759387ub////tN/HIAAAAIXRSTlMAHDk+QkdKTk5RVVdoamxwcXJ0eIOEjI6QmKmqq7HGytkkDWDLAAABOklEQVR42r2SazPDQBSG5VTQuK1WxZ3d1e7WpUGWINQt1K3EXfH/f4cjmWmjmY0vxrsfn2fePXPm9Px1KCYT+77v6BXqCsd3qsKlOkEEged5rtBXiKqDDci1f+RNM58leOYgmNnCGJhuhhCYpV+EkUnoRUHLixMlyBXR0Amjc0Ogr6CfhYXpAYBcITbSfGp2cRwANJ+gcHIbHteVUlJGQopfvoZXKs5GZBhggZEQ7lutm9OI1xUKiIlNoMOPnj/e314e7prNuuIrLu23yMy8nRD2w6fHxg4OwDkv4xTDtm0Ty+gIMrxo7CmpOBqr3wKxfo7Ar88U8qhhXQpqEcTJLcrDLaQRXz5YQwG61sx3yxLrGWNL59ubgoLRfU2swiQ+VqnVkPcZ6YNknGE/VsiYp4124v600Q7if8wXmO84hTjb6ZMAAAAASUVORK5CYII=",
  ether: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAABC1BMVEUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABycnKVlZUAAACGhoaNjY0AAACjo6ODg4O7u7u7u7sAAADGxsYAAADd3d0AAAAAAAARP9cRbN4aEdccC6AfStkhDGYqe+ErlvE1guM2Ltw4KatFo/JGjOVHNYBKbeBRSuBSRbZSc+FSqfNTRrdVdeJYUuFdTpBkZGRphuVqOCJsiOZspOp1kOd2qux4kuh6dOeBx++DecuFequIXzeJtu6JxPeQkJCRjeuWkuyXv/CYv/CcwfGez/ii0fikpKSpdTiru/Gx3PW0wvK02fq53Pq91vXAvOTE4vvF4vvJycnR4vjV7PnW6vzm9Pv///+f5Kf/AAAAGXRSTlMAHDk+QkdKTlFVV2hqbHBxcniEjI6QqrHG2Rfd+QAAAUFJREFUeNq9kmlTwjAQhm20Sr0qWI9sskZEEcWDgCdSqXfrjSD4/3+J2+kMIJ3WL45vPj5P3uzsZOyvwympOAgCN1nhnnYDt6Y9niTodtv3fU8nV+iaSw3EE9/ImGYmTfDNaWamCwvM9FKEtpn7RZhbYhMkJPLsYo6NZ8lIEuZXZlhyBf8qvd2sC4BSZMT5yUOnCmF2IiMmNFvdDUFcQCjE+WOr91mv5/MCMJrTYBYzhoT7Xve2CII6pCSBsO3YbMDPXrsfl09bICRK2Pf4lGUvrzpDQrnzcne8BwAIWKCKWcdxbMsYCLJzelQUIBERyqFgWz9HwOeDuqARUCJUpeaWTXh4i/J6DUAKoIbdqwIJbGTNeL4Z3lYKtt8vDjVnxuhvUhUl6ahKo0F80oh/SIUKkSqUjHjc6Cfqjxv9EP7HfAPofjVWWX5HQQAAAABJRU5ErkJggg==",
  bomb: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC9ElEQVRYhe2W4XHjOAyFP95sAerAKMEdGCWkg2MJ7mC5HaQEXgcuAeogJcAdsAPcD4qy7NhO5rK7f24xwxFEkXwPjwAp+GN/7IsWYWGWY/i/BdT9GNvn1o8ov47EPcBbf6gwVPkpdiux+zG2cj+SvtaXD0l8+wwB90ZEifP5RIRFSpocovc15lQxcohPiLymCIt5rqhWgFsS6TOYG/Dr/Y4o4RzXNpLQ/RhGHgkZQCxzrvpuCT1lY5ZDta5jnE5iFy+ArbPPNNwaKDgNsWlEj1le/XtK/PUZ8AiLiBI7JnZMMB9g/n5RaQHHlndtmOVFwQZArS+3EPGUgGpNI9nO6cQ5tT7Fvl8PDEVkuupyGiITznElkPOJnPfvcO4SGFm/203MqQIskS/ghxn0B2ca81xx6SAddIlY3nBr5HIBvSX6kMBg/cjmua7+4ZDvzpM64dpWQjnvKcU+R2Aw/Se9XX/QH72xJN5QgIbhmHofV8Bz/+61YWRUZSWysXhHYCTfKLtDZJzGeWmEIjpRyxviE6a+RnkbQEcEK07Op3uxPk7CDSWgJxYOc+oR57zHxK+BmVATyN2XOkEFKdMaea3Xqr4jMNiLvKa/48g5tVWFYU7D5BK5mnRA64oIyxp5WsnU+kYp+i68hweR+zHM/BKNT2vEWzJqgmtD6BUwwG9NqeS8/1gB6JeIeyPnU4IlD+QCoibrWLOuxBZcmFbfa8OKL+veJDWkD4/ihX4Ht4apdwJ6OXbR7SQQ7eC1vOHeVvnvlOFjAtuj2MgxFh6lNbbGaVD7HJEJ0QmrjntDi6DUh+Dw5DoepSjympSaXI5h+JXMPUzQLNdbkPsW6MLs2cH2tAxFXtP4qRB5TdS+p5KnrsJ27NjzURlDFu7v/acIAOR8SjnvY/Ehby6b2tAsAFh1aulAI+n6nPcX0F0mH1kpGqVYAmLUs5YOPlQZUdf6gntbE/C/Yj4kwvJnU4rGok6M/vH+oP00uwL6CuhX5Hi2+Ndk/l/Zv1xzFx2P/dqPAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  ration: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAHlBMVEUAAAAAAABWHACDMQCaPABtJwA8DgBtRQDn5+fn57iMynFpAAAAAXRSTlMAQObYZgAAAMlJREFUeNrNkksSwyAMQ+sPNtz/wpXCtIxL6LYV2T1JKJk8fiC59AWrmXmTEwfEgyMnrqruMJmc8h5qUKbccEQRj7Rm1uSuP5L1uhoKz6vfjY6WbKgcBHH0Oy9oUb+GuIYGLEwbDKEClX6PVz8uoIF65ymkOY88wYuhjz7mfor5YpDRL9l0MP9Z0MdgCUemMR9SN9LAYw35wlcFDxw58wuvkXjgy43PlcRUJy94vcZgwcbLCCgWrxLOgIX8+LvSUPhuWfxkAf9HPQGNJwa/yF7nhAAAAABJRU5ErkJggg==",
  key: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAADAFBMVEX/AADgAADAAACgAACAAABgAABAAAAwAAAgAAAYAAAQAACAQECgUFDAYGDgcHD/gID/QADgOADAMACgKACAIABgGABAEAAwDAAgIAAYGAAQEACAgECgoFDAwGDg4HD//4D/gADgcADAYACgUACAQABgMABAIAAwGAAAIAAAGAAAEABAgEBQoFBgwGBw4HCA/4D/wADgqADAkACgeACAYABgSABAMAAwJAAAICAAGBgAEBBAgIBQoKBgwMBw4OCA/////wDg4ADAwACgoACAgABgYABAQAAwMAAAACAAABgAABBAQIBQUKBgYMBwcOCAgP+A/wBw4ABgwABQoABAgAAwYAAgQAAYMAAgACAYABgQABCAQICgUKDAYMDgcOD/gP8A/wAA4AAAwAAAoAAAgAAAYAAAQAAAMABgMDBAICAwGBiAYGCgeHjAkJDgqKj/wMAA/4AA4HAAwGAAoFAAgEAAYDAAQCAAMBhgYDBAQCAwMBiAgGCgoHjAwJDg4Kj//8AA//8A4OAAwMAAoKAAgIAAYGAAQEAAMDAwYDAgQCAYMBhggGB4oHiQwJCo4KjA/8AAgP8AcOAAYMAAUKAAQIAAMGAAIEAAGDAwYGAgQEAYMDBggIB4oKCQwMCo4ODA//8AAP8AAOAAAMAAAKAAAIAAAGAAAEAAADAwMGAgIEAYGDBgYIB4eKCQkMCoqODAwP+AAP9wAOBgAMBQAKBAAIAwAGAgAEAYADBgMGBAIEAwGDCAYICgeKDAkMDgqOD/wP//AP/gAODAAMCgAKCAAIBgAGBAAEAwADD////g4ODAwMCgoKCAgIBgYGBAQEAgICD/AIDgAHDAAGCgAFCAAEBgADBAACAwABjw8PDQ0NCwsLCQkJBwcHBQUFAwMDAQEBB/Wkildl7Kj3LlooL/tpH/069oVB+AcCCqiDTAoEDyxE344GD8/Jl1aViRh26rmoHgwKDQqFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABHbGzm1GiTAAAAAXRSTlMAQObYZgAAAAlwSFlzAAALbQAAC20BgA6k0QAAAAd0SU1FB9gMHBUjCEcZrwwAAABfSURBVDjL7Y0xDoAwDAP7/4cS7NEvIE1bERUJBhBTT1nSnp1SFt9CPvwD0AuBhNmN4HGTeGEfEWsCZmwI8v640iG2mFOQWkmH8IiSUDtyoQuhJaFeUSocJGHa5pfFDxyN6JkFaWuI2QAAAABJRU5ErkJggg==",
  floor_cave: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAAAAABWESUoAAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB94KGQEuGe3vHJAAAAACYktHRAD/h4/MvwAAAiRJREFUGBkFwQGO3DAMA0BSku1NigL9/z/vNrElsTP8K81ORZurIJYLaKoZOkZEq98FyI+MQkMfAPihqUyEz7KbIzaMtY56TVxjZFt/kkzzYf8O8fYVtjfF+SYG0so4/Rh9eJHQH6EZrXvPikwgMitB+vqXJNMgEeli5R4/qirAqeXLZNiyFFK8emZcaJqwqgU3/cI2+aLdPrcWPrnBjpgEgPDVKgqNcdwB0RpbDNOhacrnJyxUV5cpAKZ33SM7CwRq+WW809unzW5jcdcwDMAxI/IYAODFLuLCRmRdASAm4IDBp3NknFaWqqrAdwJXwtqg0R6KBBKEOsMWh+QYI1nlrylkAAAb5hsIBNfGBQDUa1Z2+wFedlY2aRZDji8AwIzm9mX9/AoAGg4LfJW4ABRkeuCRgvTxUKGRWSlEDiSTaMAn1bQ2aqQ3sv1cQCYeDCbaRBIUwXKSZsceAHwp4dIKSObANhBtftoBVVFlHAmarctQNEBEwDtNglq2Mh8oJMrHFgOYsmM43EVbhGSNIMVRY5PVx4pyb7iC9mhzVfD6zjfDsIGGEANGiZ1ThLbbI98AASlMxsEd4NpdAT0IUx+bBnUfwAE82Bd+auFBAz7cVtcgydHsHJFgZi8g4npgrgVwzqpbt4bt36lV80ZEBP7QAwFHrUSZndEzGIwnAAKn0wNOyI4uWFXLYMe/2uOlqnUi5ndtu54qJMYXZewk7t/YXS38Bwbpil8rTgc6AAAAAElFTkSuQmCC",
  wall_cave: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAJFBMVEUAAAAAHx8AKysANTUASEgAWVkAenoAl5cfHx81NTVISEhZWVmtW6F9AAABlElEQVR42n2S0bbrIAhEEwEF/P//vRu0qz0vd6yJiXsGkubZebR/lRn1i9jx7Blzrqk6p65lipaaiC6zuZY/e8XcEe3YwawDilJOf5KEtDkNMzLOIoaEddgD4AZENdTl9zGzkAbMSUjDfBM4i8gQS3V9ns1mzWOs404mQy4wXbdmbBt/BS3RCU5WyB7U/3kPI0ZqAxq2D/DiexmlHO2jSY5jG/MFQeelAoQ5vk7QAqLuvTcgGT4+AE0KCZXx5m6/vz8JNNkJ+JMy7/uyqLhK0OrBpfsYQQKzDtBfwACMK0y1R8gHYOsmeAPcK4DlBYLq1UPIVkoeAHUP7VCfXcL28TNGN3lbBPj83RYalZIZKBtgSOgBuhx3X/yj5snI+5i3Qc1074SbId5AWJi0QXV8lQIgDcw4j9nOUi+8O3A7AKghEs5HN1SUbYBOcAW4xkDu0ZLzHtwcEA/GcbroTxal+gJYAP6tzUDuNTuhSokqGS0zERPFXxcNLKdozVav6tfKLjHXnIrWWjqRGTlz2WQDAPb5n/4BBJ4YgggPiqYAAAAASUVORK5CYII=",
  floor_crypt: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgBAMAAACBVGfHAAAAFVBMVEUAAAAREQsYGxMhGRAiFw4iJhkuMSJBrUPIAAABJklEQVQYGQXBwW3kMBREwUe5904K4zv5Ad0dQg/QAYwIKAAfnH8KWwVAkKH30fpAJlbS+hpr1U2IYrmxejvnwgYI9FbVa2GELQ2OedRxg51Y+SzmPMYiRpH9zN6pdZNEVsI8ZvW5IDZxQjvPuT58OSCjNzVH3Xz9IIGI739VN8KxEzDMdUMsEuR813F8iFob9E5/ca55Y9hrrTFOHc/z/OK8r1XXXQ0Zg+U6qtaxXo4cnPZc11NzEYxw3lXPtWoptoXDXt81awlDsFrN2uO4X44Q0vuZZ9W5XxIY+/1U7V0LIgnDrqeuqm7FwWl711PX6op/DPG+zlq7EFZI2qcGo6oLIrD/nmfvfSlOBHqP1kcb7RXZQrFNsEniAAhik2AEJAYUIif/AUB3RbgIGUbLAAAAAElFTkSuQmCC",
  wall_crypt: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAJGUlEQVR42k1Wa3PaShJVbXxjQ8iNLeMXtszDgHgJCZBACPRCQgJhQBhsjLHBjh3HduLcJDe52U12t7Zq99P9sn95j8yHDTU11bR6umd6zukegs2F6eQBQSyxuX0IdDKJ+UlOQIaw0CxsCOIXaJ4t+Z7mZdhgsLkIvi7sny29WHwiiOcUFSaIZ8Sn9/b4xHy40e+vtbc3R398dN7cnH3/2ptO3cfH19//9vjfP68+f3r7/t1V3+3CkXtUOjqWm63SaFzpHHXcyeD61mgPHM2xRxcn9x/cw1H3aDq0em1OqrG5GPHu1rHtpm03MBumdjbp1+tS27HnM7c7GN3eXl7fXM5mk/Hpcb4kY3fxfNp0zBSTx1zVVbnVrjSM1sAiY0WKlUXD4DWNjBZE03y2FCCDu8S3z4d6Qx0MbMPU00wFMRKZUtMyHu5nvX73bDrWjBb23nba2xSDDJzPZFkXjJYh6Uqr1yrrDTJertmWaBpMTaPy9aKiFmWFjPEI6QW4utBznASPdJZPpRmtgZ8WS+ZFUej2LE1XLNtgCyVoInEE8JWkkKjLFUUmqUxBLCt2s1CTo1mOiqUOGJ4uimSES3EclOR+1rsDZLzb6wyO+m3HOqA5WdUybFWsaymmbJiNSDwnK3WcrNNp71D0syW/Ox6wYtV0vFQgD/CSF6uMUEHGyZ04J9WxccjZkkBRyefLvxInJ11sM3KQQ+olSdwN0/DICZplmXpDA4D2o2mWzYk1LZFi/YFgd9Q9mY83wolGxyGjHJXI53iBDOfXd6PUQWY3ySBpvKqSezRFUR72pFo1HMtkuWoizUViyfXt+EaI9r3ceu4jV16s/7q+73sRXNuIrG8d+F5u4MjIL7EWJXeT/sCuP7AHjT+wA1/Pl3Gle/7AJgR/YAsDepyYALoRBxKOA+unBWsLGUo2532CvBhsLrrQP80+YH+xFvLz5ZfAGLwvPIATEMAb4uFhPpsNx+Pu+XTw8HD59vYcmMEC6zD98XPn8VPn4kq1Di27Z3ddqdlpNmy9P3Zv78zDo45mG3W7IWoymPX9S/fP/0y/fx3+9q47Oe3OLob//ufxl9/viJvrs4f7i9Gof3wyfHx/dTIelkQdwfvj/uFJp6zr8AKQlBRFt2WEAYR4VRM0LVksk6GkUJeoeAYb+nDf/PJ5Pj5pnY7dilhWVRnI5HiNaLWtLCd1DtvFij6ZDEfHA0EyyOD2+ZXljl0EKNTqwCyV4Wm+ptgGlRFEs0keCCVFzQlCpliiqBiS8/ZKhqvx2LVsPUbncbXJDA8NUS7zXFFUNS8gL1T2ItlEhieDocGoxAhlgETQdXL7AFsGtDlJSheKFCPBOxlmUiyXE8r+tT2cYD4RU7myZZtFQeL5IsPxwGScLhBcSVQUucBXa3UJFnbL2tzLIEXD6agoy1xVYsoVYEbQNSpVggzvFcMA/KlU0QPozgGQA/vr61N4Z3nV6bTsVlPT5Fy+iEQR4VhWB3UTeYwiXz5IlQKvdrxL7jk4MwBO89XdRJbcz1HxHLLvD2W9GhBKcDUZ+SFDcX9gA1gajZyyKHmuDTvLSmbTwE1wXJHYCKXC0cTSyqovEAyshgB538tNBADeUbPIWMkfCJHBMHD9BPAdf2D7+XIQMgZcL4APe9ftZvJVUVIjdBlM+suz5RX/6kqAJHC6BYQxIGMvoCuAjDW46gXkfx7Qw2YhLDixwP7CHmuhwfKFsbf8x9f+v34Mb99MPz+2UEG/fGidT4/w9/Ly+GzivrmywI/Ly5Obua4odXj5+GDOZ52P77sA/uV8BHt0jpubM5Dpy2/O5LRnNesnxx30ElyJF+bv34bnF+NuzwEPjobu3d1FtVpBb0ARPZsMUjnBtNssrxx22+RGFKd8uFHRLR7uL+eXF8cjG6k3DA3QUFQNNVFR5QRdSDPlnnu4RWW9+//xR7/Xc86mrus6kqzDNaqeWPfWoJqi/6CO8hUZM8oRjozduYPOt2/vZ/NzXCa6CKovvpariihpmt5AR7HsJoo/KqZ3gvtrdT4bHQ27ffcQSQAngLCyqFSrIpjh9pvoBDmGtSwDpdu7TCd5/XriDnq5Qg19gmF5wC+TF7GtiqRiLTyAAVgbTTDgE3E5P0Z5eHy8QsACL8FRjGaLvAQ78DCRKqKblqvqYdcBwMjgDvoH2qesNemcICkGulM8VYA7xMC5wV4U/wOafVrL4AToB7224+BcyGxFqqVzZaFcYop1Wa5t78Z1XY0mCsgyqL7sXwM8fn9soUFBPzxysBssoTO807HNZiORLiEHOCj4BG6hznsBcNeC5FWlnXB+bSvuf7nlf7WL61oN7mOs+NfIzdiKn/ShN5Ao+2FsDU07xxTpTBHXDtJs7+c3Q2lfAG0jijlBM/gUeLW9uZvxAixw/QT5ZcgLRC/GU2VffyruiZ95gET9ZIlVLyAv+LTQoMf8nwdtx7y+Gr+7H3/73Pnw+BodFCzHt4upMB5xF9PK0ajljprzS+fuzrp+Mz6ddgcD2h1aLUd9uLc/fGjrtgJ7PKg+vuti/sdf3evXp5NTFxTp92yC9gqcDXQOR67WsAEPwAaRZ+eVtqNyPIsAsl6vSIJmym28M0ylpkqKXtWbaqcrD0+aEZpB53p7pcwvOkhgSWwA4t1eu1aTxGqNAMXyRbmmGoAKZIAPKFqcQLdQuHT0k5ZjhCJJtSHn+HJdk6CxOmaEzjcsDYH9qyTsv33qAKMVScuyVebJCaBhmCaBS7csSxBlTdchQ5tlik8B+LOZywhitijs7MdTDFuVK3y1cpBMSbps2FpFqW1TMUkRM1zJs5+ogBPQBbxGYlk8fyDUFZVAL4MELDcMr2hXJXE1GPb6wdg57Fk6+mUG9BCxX91U8YKhEtmaWjUsoC6O1Jmthn8jiotFyULtAqtMs6HoGvoj8gE+ExlWLFfK4XAU7NiPpUHgRYDewMI7B3lHlpCfzf1kOJFrtg3khIqniwIn6zWEied5VFM6ST/ctEGL03EXLyi4djoW2hdbkokQRaMfrK7vo88s+15hfkXuoeoypSzHlyKpvH91xyv9UK7tQsAglnyYQQrv78ugn/TqPLxvhaKZfC0UKezs5395sQGKBLcT/wNMs1ytoicrKwAAAABJRU5ErkJggg==",
  floor_ruins: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACRklEQVRYhY1XwZGDMAwUzBWRJyVQgp8pgzLyTCl+Xgl5UgIl8EwX3Gu5ZVkZNJMhOJa0ltcrp6v1tYXYMDxiXb+nsYg4jWfz2db1G6WM1r/n4Pod7/jAGe+cgMcwD0nhy8nxvXcIdeK6fmOel9tVwLx5Xk5z4D9Nz38ApYwn1ApEE/P3YXjEPC/pNrjyA1znOJChRiBdGX7XCul28hxYzwNIoE4IOM9L1PrZg/MeMweUMw5MKWMMw+NYAUXO5EKZryyL4VYfQSTMkON3JHdV4jE9IVwV9+zW9XcDgVpI1TKgV6VXX0tCrogGc2PgiSOdxtE5PxrICZFjeFYFWCnjgTNZJXpF694zAeKgEBYnQsoRBn+S4qz8/LsDhITupPAYfE5SrCCcvmvijLCZVMO4It37PW3Z8cusxRUGwPxx+hAhp6BFOE1yB3B2Mjj+TkJdAWt/K3nGbhUk2DQ9DxLeqyObkqclVo5D0HutALf2rtbX5lbDx8X19az8DBC+rfk7B9xJuJJknnPVsLLq9RxAV8KBORA/ebzVsDKZ7lvlj4jDTad1pJwoObBWCbWZuAbkqqJt3I3z07XtgxQDCH8UkCsrB9Y9dmTmO2jzWg6UepwwhmBachgS6Sngbd2lmAPcuZBoJfhWXevn8iICYIdL6TQ9UwXTPxlsjoA6jndd5EEJtZScNGu3rVaedU8G0tX62pxDth1XnVAT6bFTu/xj0uKFXrsYEPu2wPbO6eoiCsu2TGO4BWH+rX/H+lSpdffADAj71vqJP0PooIkBB7ClAAAAAElFTkSuQmCCAAAAAElFTkSuQmCC",
  wall_ruins: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAC6klEQVRYhZ1WUZHrMAzcvikAQTAEQwiEQAiEgxAIB6EQDCEQDEEQwqDv42Y1G9XJteeZm/Rk2dlo1yvfzOyJN0cpBe7+dvydcQeAZVlQSsG+7zAzrOt6iO37DgB4PB5Y1zVinP/+/sa6rnB3mFnMresacQ4zA4DY885g7z0mSikAEDH97e6xeNu2+M147/2wn+br08zg7j8AOPZ9fyklNzCzAKZVUcA5rvuOAADALWuAfH7K92idmcWXno1brfXp7sEVNyDKfd/RWgvu3R211gPfoxzO9d5Ra0WtNeZaa5jnGWb2SkFrLcqjyN09/tccLa3mEIS7Y5qmg15YHXfHv7wJlZ3Lq/wyP2+ocVZA4xm0u79qIL9YK3Glj/wiPs80wD3uAPD19XVArih771iWZQhAOebLVBPTNMXpUWCqkXsuJ9Eypue4tQbgxxM0f5qmQy4/gl9Pb9A5xkIDGcioGvospbzwrqA1ri/PFRhqQDk+00HO/bQfMD98YFmWQLVtW/BKAAShc/zrvR98gKVX6njutYoAjj7AReS1937YSM+1lll9Q6sw0oMCuNQAE/Q45aG85rjup96SvSE08Nee/o4GrvpH+ICi4oaKOvNYSgnu53kOr9dWrB6RgRzuA3qGr1qniitrg16fhVZrjbmRBl6aUd5A0Wss+0Rew0qM9DHUwIgf4NgRR1x+4hkau/SB3Mez/7fW4s6oNquc53sFvzjr4q7IWDLyNc8ztm07fJWWlHO6hh6RfYL2S4oILgBk/9aXZU8/m7tao31A+8ZbveDqnF9pYJSTYzcze5JPd8fj8Yjznr2ecZ4IT/c7vTnpV//aC8g/UdZaD/e+3AtUeGzLjHOooDVHwYUPZBPSfj06x8qzGhJj+Z4wuh/8eh/IXJ7pQvPOuM576biZ2bOUEhzpWeddkZuwxNkHaLf0E60qczMYViOOIS8i/M2n3gly61WP55N/mbozjQSAM98e+cJZPl+Uyz2Kce1/ZXGbM2SeZCsAAAAASUVORK5CYIIAAAAASUVORK5CYII=",
  floor_hell: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgBAMAAACBVGfHAAAAAXNSR0IArs4c6QAAACdQTFRFABAAABgAACAAADAAAEAAEAAAGAAAIAAAMAAAQAAAYAAAYEgAgAAALoGIaQAAAapJREFUGBkFwbFy00AUBdBXBVoBSuADJNNS2PTMyKa0NntXUoZGtt9bKbiRwbtKRxFLTp1R3NDaDD9AlTZFJj/FOQREKKwDALMRMHULrl+urOzdSBYdIhqU+bMeZHOzj92Z54juRtIujY3tQ9me1fYXVa/a/qcgxC7t7e+rOVX9RlYAAGOq709MsuBkprD7Wxyz63uAbLybznSBb4+c9Ssw2ThPg3EBTgZ3K8mSmi43F9scmiVuP3+ZUNMxWphQl9moK9+0BH96dkAyvnQbGTxol6//dWzG46nd8ABQkbkPTiENpF8UAKiQH/1xwZmXj2WOFMSHFWBjx5i2DAVClyCT2K807MkgJJgExr12ZQq5YwQU2em7SDrhILMvz0aRriaJWO/FZ9fLNUBm8knq/kFiqfxEciZp3rcHeTpGkP1Xi4Fsc1H7+hGXUDJz0pJYV9ubBJfQK7mNWwIAe0qgkGo72wtBASPWANK3gXgmKCijtYZBcN4JExApo7VGyuV5J6AQaWqGIIHCwTcKlCANizIIERVclQo0BzjfNluEFbwEoDkzWDIgMqYV4D+Wn7qt9WD4GAAAAABJRU5ErkJggg==",
  wall_hell: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgBAMAAACBVGfHAAAAAXNSR0IArs4c6QAAABVQTFRFIAAAMAAAQAAAYAAAgAAAoAAAwAAA+mNRwAAAAVpJREFUGBkFwbFyE0EQBNDu8QUWgXZGEJHoTpBT8A38PgTknHQRCb7pdRWUTZV2eI9fb5/Rz1cw2t6x96nu3048Vy8c15PsaB6EUkIJCvhEC4zMlV/AHpWTI2o8rR/qu32ao3ZjW3z/saTP9w1aahKl5xntWnZMnt2qnn6nBwMeN/R4eH+r68urHw7JGAf7M1XbA+gYyIjbWzxc3ox/j7/42PECvB7+mvvmdhlAsGovWFReHV4FeKJkqXCR6enoc8K0RzbXMwNJzm4sQGjNvRRON3fGrdypDMFhCcSQiGIUSua9ZawbSktA0iR0BYQkq+BurNadfu3hauqwFmq92NqoYeWwKDkcnR3bHHQjWMlqQI9Sd1tRnmKwJQpnGJTbpYleQ3LAnHMARXS1DSlDw5oVlUUsECe+mz4uaugtIU9N3JN7/MyIWkncpx3SBSVw6NR4xwIA8GA4gIj/EVXWto10fsoAAAAASUVORK5CYII=",
  floor_lair: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAAG1BMVEUIFwILHgUTJAkXFwIXKQ4dHgUkJAkpKQ7///+p+qbaAAABcUlEQVR4ATVTAY7DMAwCXCf///EGKNWp4oKNCe5AkYAIfSSG8uMjoNQg/P5BMamlO0gKQUBEjmX6b/7AJU5Ko3c/gvo+sSfnABgBWEmbeldoaYLAnkVtuYkTD+hc0C27lhaOC+I/vZnns4hfLL7IUve2Io4tO+d10qKfAv6MOBtMeijI5OLCw7k6bBqm64hE7NCC4FaxTR8+xtaekxzbkGtm7PdnSPP3LDBb96PzbIG0KafisBqJnbLuGzn4Uonh8ihr7r1ZjKHn2PCICPYyZrORkAmuUtD6MtnTCYyyuTIQjckYxKz5jghyDpAotKB2UtoAZQU2ug7PZPraqdaLzW/PDMkGt5i3BWAQ1CSJc+9pdFHpDd6X1IJzdzZO3JePIAyBeDkWGGPnrCvFiwC8r802dVmjK4oWeit6yyH6LMkXM5ddObYcOMTMsB5ZX2+TRM0xWzAYJGEbSWg4k2vI+dLYJqTTlool/RT0d/Zdw7QRP87IBlQyGVO/AAAAAElFTkSuQmCC",
  wall_lair: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAAsTAAALEwEAmpwYAAAABGdBTUEAALGOfPtRkwAAACBjSFJNAAB6JQAAgIMAAPn/AACA6QAAdTAAAOpgAAA6mAAAF2+SX8VGAAADxklEQVR42mKUlZT4z4AGvnz9ysDDzY3CJwRwqUcWxwYAAoglyM2e4cGjJ2DOx8+fGT4AsTAfJ8PDJ88Z+Hh5GT4B+SBakJ8HqwHvP34Bq2H6/xfMB7FBQF9TDUxfvH4LrlZeRpJBAGgWPxCDgIKcDANAADFLCAk0gCz++esXWPAHlP746QtYDGY5SCMHOzuDuZEBA8O//wyMQDUgPiOQIcDHy/DqzVuwepAlCtJSDPramgw/fvwEy70EysHM5OBgg+sV4OdjAAggRgcTPXgUfIC6HtlnIANBwN7CDBxSH5HUIOsBqVeEqv2ApgbkeFhIwEIBBgACiAWb5SAA8jUsOMEGXL3OgEstyHJccjAxWHTC1MIcARBALLgSB7JCkAEwGh8gJI9NLUAAMX2AJjx0y2GJjhRDYY5GDhFC6gECiAmbIMhydENwOQSmDuZgdP0w+hMO/QABxARSgKwYpvkTET5HdiRyqKFbju4ZZD5AADHKS4j+x2cZLBtiCxmYhcipGpba+ZDE0M1HLl8AAohRkJvjP6zQQC84kDUgAwOgelAhglyAIUcTqBAjBoDMBQggcAiA8u8HaBYJcHeCG3zo1FmsmmD5HVcaQQ4lmHnIjgQ5EORpkGcBAogFFIzImmGKQcWlnZkxig9hoYMvZ8Ash1kMKz+w6QF5BiCAMMoBmGUfsWgAlWLIvoPFPTbDsZWaMAfyQcsUkOcBAogJWyqFlQ3IBiOzQRYjJzwBtDQCMvgjFr3YygeAAGKBaYBJfsBR1pNb+qHLI9cvIAAQQCz4Cg9sGkgpdrFZjp6jAAKICT0EsCUUWLaCqbkP5CMXYMRUSrC4Ry8TAAIIaxrA1vgAOQKU/UAGwDBML7Jj0PWCxGEewBaaAAEELgfQLUMPEZBGUL5FTkyfSKikkEs+dEcCBBBWByA7BJTCQa0b9GwFK7hgvoI1WNCzM6z8QHcEDAAEEAu+mgoU5KACCWY5rF2AnBXvP4FED658j14fwGiYQwACCFwSgizC5Ut0Nq7U/xGt3EAuG2DFblyIP0YDGCCAwIkQ2Zf4LMcFCGXTD9BogtmBbA9AALFgcz2uEg5XOkFWj8/hD589w1AHEEBMyArlpaTAmNgCBzn7gdSBygdcjsZVRgAEELxJBrP4I1JCI9b3yHmdkOXoACCAmJAT0UcslRAx4BOR6QVbUQ8QQEzYKiFsxSy2NiBygcRHZKih1zsAAcSEqx74hCckYBaT2nBFLmVhNEAA4SwJkQ1H9x2hRiwu87DJAQQQEzEGYWvVwjCxluMCAAEGAEyw6EY2mrWaAAAAAElFTkSuQmCC"
};

// src/frontend/dungeon-ui.ts
function esc2(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
var you = (s) => s.replace(/\{\{user\}\}/g, "You");
function sprite(key, cls = "") {
  const src = SPRITES[key] ?? SPRITES.skull;
  return `<img class="warp-px ${cls}" src="${src}" alt="" draggable="false">`;
}
function bar(cur, max, cls, label) {
  const pct = max > 0 ? Math.max(0, Math.min(100, cur / max * 100)) : 0;
  return `<div class="warp-dg-bar ${cls}" title="${label} ${Math.round(cur)} / ${Math.round(max)}"><span class="warp-dg-bar-l">${label}</span><div class="warp-dg-bar-track"><div style="width:${pct.toFixed(1)}%"></div></div><span class="warp-dg-bar-n">${Math.round(cur)}</span></div>`;
}
function memberCard(f, opts) {
  const cls = ["warp-dg-member", f.alive ? "" : "down", f.active ? "active" : "", opts.targetable && f.alive ? "targetable" : ""].filter(Boolean).join(" ");
  const tag = opts.targetable && f.alive ? "button" : "div";
  return `<${tag} class="${cls}" data-fid="${esc2(f.id)}" ${opts.targetable && f.alive ? `data-dg-target="${esc2(f.id)}"` : ""}>
    <div class="warp-dg-member-head">${sprite(f.sprite, "warp-dg-face")}<b>${esc2(you(f.name))}</b>${f.guard ? `<span class="warp-dim">\uD83D\uDEE1</span>` : ""}</div>
    ${bar(f.hp, f.mhp, "hp", "HP")}
    ${f.mmp > 0 ? bar(f.mp, f.mmp, "mp", "MP") : ""}
    ${bar(f.tp, 100, "tp", "TP")}
  </${tag}>`;
}
var TILE_ICON = {
  start: "exit",
  stairs: "stairs",
  treasure: "chest",
  trap: "trap",
  rest: "fountain",
  shop: "shop",
  event: "altar",
  surprise: "surprise",
  romance: "romance",
  enemy: "skull",
  elite: "skull",
  boss: "skull"
};
var TILE_NAME = {
  start: "Where you came in",
  empty: "Empty",
  stairs: "Stairs down",
  treasure: "Treasure",
  trap: "Trap",
  rest: "Spring",
  shop: "Merchant",
  event: "Event",
  surprise: "Surprise",
  romance: "A quiet moment",
  enemy: "Monsters",
  elite: "Elite monster",
  boss: "Floor guardian"
};
function tileIcon(kind, cleared) {
  if (!kind || kind === "empty")
    return "";
  if (cleared && (kind === "enemy" || kind === "elite"))
    return sprite("blood", "warp-dg-icon faded");
  if (cleared && kind === "treasure")
    return sprite("chest_open", "warp-dg-icon faded");
  if (cleared && !["start", "stairs", "shop"].includes(kind))
    return "";
  return sprite(TILE_ICON[kind] ?? "surprise", `warp-dg-icon${kind === "elite" || kind === "boss" ? " danger" : ""}`);
}
function board(v) {
  const floor = SPRITES[`floor_${v.theme}`] ?? SPRITES.floor_cave;
  const wall = SPRITES[`wall_${v.theme}`] ?? SPRITES.wall_cave;
  const leader = v.party[0]?.sprite ?? "pc_adventurer_1";
  const cells = v.tiles.map((t) => {
    const title = t.state === "hidden" ? "Unexplored" : TILE_NAME[t.kind ?? "empty"] ?? "";
    const bg = t.state === "hidden" ? wall : floor;
    const inner = t.state === "here" ? sprite(leader, "warp-dg-icon") : t.state === "seen" ? tileIcon(t.kind, t.cleared) : "";
    const cls = ["warp-dg-tile", t.state, t.reachable ? "reachable" : ""].filter(Boolean).join(" ");
    return t.reachable ? `<button class="${cls}" data-tile="${t.x},${t.y}" data-dg-move="${t.x},${t.y}" title="${esc2(title)} — move here" style="--tile:url(${bg})">${inner}</button>` : `<div class="${cls}" data-tile="${t.x},${t.y}" title="${esc2(title)}" style="--tile:url(${bg})">${inner}</div>`;
  }).join("");
  return `<div class="warp-dg-board" style="grid-template-columns:repeat(${v.size},1fr)">${cells}</div>`;
}
function herePanel(v, ui) {
  if (v.event) {
    const boon = v.event.choices.some((c) => c.id.startsWith("boon:"));
    return `<div class="warp-card warp-dg-event${v.event.romance ? " romance" : ""}${boon ? " boon" : ""}">
      <p>${esc2(you(v.event.text))}</p>
      <div class="warp-dg-actions">${v.event.choices.map((c) => `<button class="warp-btn" data-dg-choose="${esc2(c.id)}" ${!c.ok || ui.busy ? "disabled" : ""}>${esc2(you(c.label))}${c.chance !== null ? ` <span class="warp-dim">${c.chance}%</span>` : ""}${c.cost ? ` <span class="warp-money">${c.cost}g</span>` : ""}</button>`).join("")}</div>
    </div>`;
  }
  const parts = [];
  if (v.here.shop) {
    parts.push(`<div class="warp-card"><h3>Merchant</h3>${v.here.shop.map((w) => `<div class="warp-dg-ware">${sprite(w.sprite)}<div><b>${esc2(w.name)}</b><div class="warp-dim">${esc2(w.desc)}</div></div><button class="warp-btn warp-mini" data-dg-buy="${esc2(w.id)}" ${w.affordable && !ui.busy ? "" : "disabled"}>${w.price}g</button></div>`).join("")}</div>`);
  }
  if (v.here.canDescend) {
    parts.push(`<div class="warp-card warp-dg-stairs">${sprite("stairs")}<div><b>Stairs down</b><div class="warp-dim">Floor ${v.depth + 1} awaits. You catch your breath on the way.</div></div><button class="warp-btn warp-btn-primary" data-dg-descend ${ui.busy ? "disabled" : ""}>Go down</button></div>`);
  } else if (v.here.bottom) {
    parts.push(`<div class="warp-card"><p>This is the deepest floor. Well done — head back out whenever you like.</p></div>`);
  }
  return parts.join("");
}
function battleScreen(v, ui) {
  const b = v.battle;
  const floor = SPRITES[`floor_${v.theme}`] ?? SPRITES.floor_cave;
  const foes = b.fighters.filter((f) => f.side === "foe");
  const party = b.fighters.filter((f) => f.side === "party");
  const active = party.find((f) => f.id === b.active);
  const pickFoe = ui.pick?.target === "foe";
  const pickAlly = ui.pick?.target === "ally";
  const foeHtml = foes.map((f) => {
    const cls = ["warp-dg-foe", f.alive ? "" : "down", f.boss ? "boss" : f.elite ? "elite" : "", pickFoe && f.alive ? "targetable" : ""].filter(Boolean).join(" ");
    const tag = pickFoe && f.alive ? "button" : "div";
    return `<${tag} class="${cls}" ${pickFoe && f.alive ? `data-dg-target="${esc2(f.id)}"` : ""}>
      ${sprite(f.sprite, "warp-dg-foe-img")}
      <div class="warp-dg-foe-name">${esc2(f.name)}</div>
      ${bar(f.hp, f.mhp, "hp", "HP")}
    </${tag}>`;
  }).join("");
  let commands = "";
  if (b.over) {
    commands = `<div class="warp-dim">The fight is over.</div>`;
  } else if (ui.pick) {
    commands = `<div class="warp-dg-prompt">Choose ${ui.pick.target === "foe" ? "an enemy" : "an ally"} <button class="warp-btn warp-mini" data-dg-cancel>Cancel</button></div>`;
  } else if (active) {
    const skills = b.skills.map((s) => `<button class="warp-btn warp-dg-cmd" data-dg-skill="${esc2(s.id)}" data-dg-skill-target="${esc2(s.target)}" ${s.usable && !ui.busy ? "" : "disabled"} title="${esc2(s.cost || "Free")}">${esc2(s.name)}${s.cost ? ` <span class="warp-dim">${esc2(s.cost)}</span>` : ""}</button>`).join("");
    const items = v.bag.map((i) => `<button class="warp-btn warp-dg-cmd" data-dg-item="${esc2(i.id)}" ${ui.busy ? "disabled" : ""}>${sprite(i.sprite, "warp-dg-mini")}${esc2(i.name)} ×${i.count}</button>`).join("");
    commands = `<div class="warp-dg-turn"><b>${esc2(you(active.name))}</b>'s turn</div>
      <div class="warp-dg-cmds">${skills}</div>
      ${items ? `<div class="warp-dg-cmds">${items}</div>` : ""}
      <div class="warp-dg-cmds">
        ${b.canEscape ? `<button class="warp-btn warp-dg-cmd" data-dg-escape ${ui.busy ? "disabled" : ""}>Escape</button>` : ""}
        <button class="warp-btn warp-dg-cmd" data-dg-auto="round" ${ui.busy ? "disabled" : ""} title="Everyone picks a sensible move for this round">Auto round</button>
        <button class="warp-btn warp-dg-cmd" data-dg-auto="battle" ${ui.busy ? "disabled" : ""} title="Fight it out automatically">Auto battle</button>
      </div>`;
  }
  return `<div class="warp-dg-battle">
    <div class="warp-dg-stage" style="background-image:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.55)),url(${floor})">
      <div class="warp-dg-eyebrow">${esc2(b.kind === "boss" ? "Floor guardian" : b.kind === "elite" ? "Elite battle" : "Battle")} · round ${b.round}</div>
      <div class="warp-dg-foes">${foeHtml}</div>
    </div>
    <div class="warp-dg-party">${party.map((f) => memberCard(f, { targetable: pickAlly })).join("")}</div>
    <div class="warp-card warp-dg-command">${commands}</div>
    <div class="warp-dg-log">${b.log.slice(-5).reverse().map((l) => `<div>${esc2(you(l))}</div>`).join("")}</div>
  </div>`;
}
function entrance(entries, ui) {
  if (!entries.length) {
    return `<div class="warp-card"><p>There's no dungeon here. Dungeons appear as a choice ("Enter …") at their entrance.</p></div>`;
  }
  return entries.map((e) => `<div class="warp-card warp-dg-entry">
    <div class="warp-dg-entry-head">${sprite("stairs")}<div><h3>${esc2(e.name)}</h3>
      <div class="warp-dim">${e.deepest ? `Deepest so far: floor ${e.deepest}` : "Unexplored"}${e.floors ? ` · ${e.floors} floors` : " · endless"}</div></div></div>
    ${e.desc ? `<p>${esc2(e.desc)}</p>` : ""}
    ${e.max && e.companions.length ? `<div class="warp-eyebrow">Bring along (up to ${e.max})</div>
      <div class="warp-dg-mates">${e.companions.map((c) => `<label class="warp-dg-mate"><input type="checkbox" data-dg-mate="${esc2(c.id)}" ${ui.mates.has(c.id) ? "checked" : ""} ${!ui.mates.has(c.id) && ui.mates.size >= e.max ? "disabled" : ""}> ${esc2(c.name)} <span class="warp-dim">${esc2(c.cls)}${c.present ? " · here" : ""}</span></label>`).join("")}</div>` : ""}
    <p class="warp-dim">Tiles are face down until you step on them. One of them leads down. Leave whenever you like — you keep what you found. Get wiped out and you lose it.</p>
    <button class="warp-btn warp-btn-primary" data-dg-enter="${esc2(e.id)}" ${ui.busy ? "disabled" : ""}>Enter ${esc2(e.name)}</button>
  </div>`).join("");
}
function renderDungeon(v, entries, ui) {
  if (!v)
    return entrance(entries, ui);
  const head = `<div class="warp-dg-head">
    <div><div class="warp-eyebrow">${esc2(v.name)}</div><b>Floor ${v.depth}${v.floors ? ` / ${v.floors}` : ""}</b>${v.boss ? ` <span class="warp-tone-bad" title="A guardian blocks the way down">☠</span>` : ""}</div>
    <div class="warp-dg-stats"><span title="Party level">Lv ${v.level}</span><span class="warp-dim" title="Experience">${v.xp}/${v.xpNext} XP</span><span class="warp-money">${v.gold}g</span></div>
  </div>`;
  if (v.battle)
    return head + battleScreen(v, ui);
  const pickAlly = ui.pick?.kind === "use";
  const bag = v.bag.filter((i) => i.id !== "bomb").map((i) => `<button class="warp-btn warp-mini" data-dg-use="${esc2(i.id)}" ${ui.busy ? "disabled" : ""}>${sprite(i.sprite, "warp-dg-mini")}${esc2(i.name)} ×${i.count}</button>`).join("");
  const bombs = v.bag.find((i) => i.id === "bomb");
  return head + `<div class="warp-dg-party">${v.party.map((f) => memberCard(f, { targetable: pickAlly })).join("")}</div>` + (pickAlly ? `<div class="warp-dg-prompt">Who drinks it? <button class="warp-btn warp-mini" data-dg-cancel>Cancel</button></div>` : "") + board(v) + herePanel(v, ui) + `<div class="warp-dg-bag">${bag}${bombs ? `<span class="warp-dim">${sprite("bomb", "warp-dg-mini")}Bomb ×${bombs.count}</span>` : ""}${v.loot.length ? `<span class="warp-dim" title="Kept when you leave">Found: ${esc2(v.loot.map((l) => `${l.name}${l.count > 1 ? ` ×${l.count}` : ""}`).join(", "))}</span>` : ""}</div>` + `<div class="warp-dg-log">${v.log.slice(0, 6).map((l) => `<div>${esc2(you(l))}</div>`).join("")}</div>` + `<button class="warp-btn warp-dg-leave" data-dg-leave ${ui.busy ? "disabled" : ""}>Leave the dungeon</button>`;
}

// src/frontend/cue-images.ts
init_cue_images();
function connectCueImages(target, receive, timings = { acknowledgement: 2000, completion: 305000 }, fitChanged) {
  let pending = null;
  let lastId = null;
  let timer;
  let dead = false;
  let accepted = false;
  const emit = (name, detail) => target.dispatchEvent(new CustomEvent(name, { detail }));
  function finish(r) {
    clearTimeout(timer);
    timer = undefined;
    pending = null;
    receive(r);
  }
  function fail(error) {
    if (!pending)
      return;
    const r = pending;
    emit(CUE_IMAGE_CANCEL, r);
    finish({ version: 1, provider: "warp", chatId: r.chatId, requestId: r.requestId, status: "error", error });
  }
  const onResult = (event) => {
    const r = parseImageResult(event.detail);
    if (dead || !r || !pending || r.chatId !== pending.chatId || r.requestId !== pending.requestId)
      return;
    if (r.status === "accepted") {
      if (accepted)
        return;
      clearTimeout(timer);
      accepted = true;
      timer = setTimeout(() => fail("Cue did not finish the picture. You can retry it."), timings.completion);
    } else
      finish(r);
  };
  target.addEventListener(CUE_IMAGE_RESULT, onResult);
  const onFit = (event) => {
    const d = event.detail;
    if (!dead && d?.version === 1 && typeof d.chatId === "string" && IMAGE_FITS.includes(d.fit))
      fitChanged?.(d.chatId, d.fit);
  };
  target.addEventListener(CUE_IMAGE_FIT, onFit);
  return {
    update(request, chatId) {
      if (dead)
        return;
      const next = request?.chatId === chatId ? request : null;
      if (pending && (!next || pending.requestId !== next.requestId))
        fail("The date image request was cancelled.");
      if (!next) {
        lastId = null;
        return;
      }
      if (next.requestId === lastId)
        return;
      lastId = next.requestId;
      pending = next;
      accepted = false;
      timer = setTimeout(() => fail("Cue is unavailable or needs an update. Enable Cue, then retry the picture."), timings.acknowledgement);
      emit(CUE_IMAGE_REQUEST, next);
    },
    destroy() {
      if (dead)
        return;
      fail("The date image request was cancelled.");
      dead = true;
      target.removeEventListener(CUE_IMAGE_RESULT, onResult);
      target.removeEventListener(CUE_IMAGE_FIT, onFit);
      clearTimeout(timer);
    }
  };
}

// src/frontend/cue-bridge.ts
var PROVIDER = "warp";
var MAX_CHOICES = 12;
function cueChoices(choices, showOdds) {
  return choices.filter((c) => !c.locked && !c.id.startsWith("dungeon:") && c.id !== "date:open").slice(0, MAX_CHOICES).map((c) => ({
    id: c.id,
    label: c.label,
    group: c.group,
    detail: [c.desc, c.checkLabel ? `Check: ${c.checkLabel}` : null].filter(Boolean).join(`
`) || null,
    odds: showOdds ? c.odds : null
  }));
}
var CARD_CSS = `
.w{font:13px/1.45 system-ui,sans-serif;color:#ecebf2;display:grid;gap:8px}
.top{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:baseline}
.top b{font-size:15px}.dim{color:#a9a6b8}
.bars{display:grid;gap:6px}
.bar{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;align-items:center}
.bar .l{font-weight:600}.bar .v{text-align:right;color:#a9a6b8;font-variant-numeric:tabular-nums}
.track{grid-column:1/-1;height:6px;border-radius:99px;background:#2b2a36;overflow:hidden}
.fill{height:100%;border-radius:99px}
.good{background:#5fc58a}.warn{background:#e0b34f}.bad{background:#e06a6a}.neutral{background:#8b86a8}
.t-good{color:#8fe0a8}.t-warn{color:#f0cf7a}.t-bad{color:#f19a9a}.t-neutral{color:#c9c6d8}
.chips{display:flex;flex-wrap:wrap;gap:4px}
.chip{padding:1px 8px;border-radius:99px;background:#2b2a36;font-size:12px}
.sec{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#a9a6b8;margin-top:2px}
.ppl{display:grid;gap:3px}
`;
function renderCueCard(h) {
  const top = [
    h.clock ? `<b>${esc(h.clock.time)}</b> <span class="dim">${esc(h.date ?? h.clock.day)}</span>` : `<b>${esc(h.rulesetName)}</b>`,
    h.location ? `<span>\uD83D\uDCCD ${esc(h.location.name)}</span>` : "",
    h.weather ? `<span class="dim">${esc(`${h.weather.icon} ${h.weather.label} ${h.weather.temp}°C`.trim())}</span>` : "",
    h.money ? `<span>\uD83D\uDCB0 ${esc(h.money)}</span>` : ""
  ].filter(Boolean).join("");
  const bars = h.bars.map((b) => `<div class="bar"><span class="l">${esc(b.label)}</span><span class="v">${esc(b.text ?? b.display)}</span><div class="track"><div class="fill ${b.tone}" style="width:${Math.round(b.pct * 100)}%"></div></div></div>`).join("");
  const conds = h.conditions.map((c) => `<span class="chip t-${c.tone}">${esc(c.label)}${c.remaining ? ` · ${esc(c.remaining)}` : ""}</span>`).join("");
  const here = h.people.filter((p) => p.present).map((p) => {
    const feel = p.stats.filter((s) => s.text).map((s) => `<span class="t-${s.tone}">${esc(s.text)}</span>`).join(" · ");
    return `<div>${esc(p.name)}${feel ? ` <span class="dim">—</span> ${feel}` : ""}</div>`;
  }).join("");
  const enc = h.encounter ? `<div class="sec">⚔ ${esc(h.encounter.name)} · round ${h.encounter.round}</div><div class="bars">${h.encounter.stats.map((s) => `<div class="bar"><span class="l">${esc(h.encounter.foe)} ${esc(s.label)}</span><span class="v">${s.value}/${s.max}</span><div class="track"><div class="fill ${s.tone}" style="width:${Math.round(s.pct * 100)}%"></div></div></div>`).join("")}</div>` : "";
  return `<style>${CARD_CSS}</style><div class="w"><div class="top">${top}</div>${enc}${bars ? `<div class="bars">${bars}</div>` : ""}${conds ? `<div class="chips">${conds}</div>` : ""}${here ? `<div class="sec">Here</div><div class="ppl">${here}</div>` : ""}</div>`;
}
function renderCueDateCard(d) {
  const s = d.session;
  const p = d.person;
  if (!s || !p)
    return null;
  const bar = (label, v, text, cls) => `<div class="bar"><span class="l">${esc(label)}</span><span class="v">${esc(text)}</span><div class="track"><div class="fill ${cls}" style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></div></div></div>`;
  const where = s.kind === "outing" ? `\uD83D\uDCCD ${esc(s.venue ?? "Out")} · ${s.closing ? "winding down" : `moment ${Math.min(s.beat + 1, s.beats)}/${s.beats}`}` : s.kind === "plan" ? "Choosing where to go" : "Talking";
  return `<style>${CARD_CSS}.face{font-size:28px;line-height:1}</style><div class="w">
    <div class="top"><span class="face">${s.moodFace}</span><b>${esc(p.name)}</b><span class="dim">${esc(p.partner ? `♥ ${p.stage}` : p.stage)} · ${esc(s.moodLabel)}</span></div>
    <div class="dim">${where}</div>
    <div class="bars">
      ${bar("Love", p.love, p.loveText ?? "", "bad")}
      ${p.fear > 0.005 ? bar("Fear", p.fear, p.fearText ?? "", "warn") : ""}
      ${s.kind === "outing" ? bar("Enjoyment", s.enjoy / 100, `${Math.round(s.enjoy)}%`, "good") : ""}
      ${bar("Fatigue", s.fatigue / 100, s.fatigue >= 80 ? "tired of talking" : "", s.fatigue >= 80 ? "bad" : s.fatigue >= 60 ? "warn" : "good")}
    </div>
    <div class="chips">${s.combo ? `<span class="chip">${s.combo >= 3 ? "\uD83D\uDD25" : "✦"} streak ×${s.combo}</span>` : ""}${s.last ? `<span class="chip">${esc(s.last.label)}: ${esc(s.last.text.toLowerCase())}</span>` : ""}</div>
  </div>`;
}
function connectCue(opts) {
  const images = connectCueImages(window, (result) => opts.imageResult?.(result), undefined, (id, fit) => {
    if (opts.chatId() === id)
      opts.imageFit?.(id, fit);
  });
  let view = { state: null, enabled: false, showOdds: true, busy: false, busyLabel: "" };
  let request = null;
  let revision = 0;
  let published = new Set;
  let dead = false;
  const emit = (type, detail) => window.dispatchEvent(new CustomEvent(type, { detail }));
  function sendChoices() {
    const s = view.state;
    const chatId = s?.chatId ?? opts.chatId();
    if (!chatId)
      return;
    const live = view.enabled && !!s?.hud && !!s.choicesAnchor;
    emit("vn-game-state-v1", {
      version: 1,
      provider: PROVIDER,
      chatId,
      choices: live ? cueChoices(s.choices, view.showOdds) : [],
      busy: view.busy,
      busyLabel: view.busy ? view.busyLabel || null : null
    });
  }
  function sendCards() {
    const req = request;
    const s = view.state;
    if (!req || !s || s.chatId !== req.chatId)
      return;
    const cards = view.enabled && s.hud ? [{ cardId: "status", title: `Warp · ${s.hud.rulesetName}`, html: renderCueCard(s.hud) }] : [];
    const date = view.enabled && s.date ? renderCueDateCard(s.date) : null;
    if (date)
      cards.push({ cardId: "date", title: `Warp · ${s.date.person.name}`, html: date });
    const next = new Set;
    for (const card of cards) {
      next.add(card.cardId);
      emit("vn-panel-export-v1", { ...req, provider: PROVIDER, ...card, revision: ++revision, status: "ready" });
    }
    for (const cardId of published)
      if (!next.has(cardId))
        emit("vn-panel-export-v1", { ...req, provider: PROVIDER, cardId, revision: ++revision, status: "removed" });
    published = next;
  }
  const onPick = (e) => {
    const d = e.detail;
    if (dead || d?.version !== 1 || d.provider !== PROVIDER || typeof d.id !== "string")
      return;
    if (!d.chatId || d.chatId !== (view.state?.chatId ?? opts.chatId()))
      return;
    if (!view.state?.choices.some((c) => c.id === d.id)) {
      sendChoices();
      return;
    }
    opts.act(d.id);
    sendChoices();
  };
  const onGameRequest = (e) => {
    const d = e.detail;
    if (!dead && d?.version === 1 && d.chatId && d.chatId === view.state?.chatId)
      sendChoices();
  };
  const onPanelRequest = (e) => {
    const d = e.detail;
    if (dead || d?.version !== 1 || typeof d.chatId !== "string" || typeof d.messageId !== "string" || typeof d.sourceFingerprint !== "string" || !Number.isSafeInteger(d.swipeId))
      return;
    if (request?.messageId !== d.messageId || request?.sourceFingerprint !== d.sourceFingerprint)
      published = new Set;
    request = { version: 1, chatId: d.chatId, messageId: d.messageId, swipeId: d.swipeId, sourceFingerprint: d.sourceFingerprint };
    sendCards();
  };
  window.addEventListener("vn-game-pick-v1", onPick);
  window.addEventListener("vn-game-request-v1", onGameRequest);
  window.addEventListener("vn-panel-request-v1", onPanelRequest);
  return {
    update(next) {
      view = next;
      if (dead)
        return;
      images.update(next.enabled && next.imagesEnabled !== false ? next.state?.scene?.imageRequest ?? null : null, opts.chatId());
      sendChoices();
      sendCards();
    },
    destroy() {
      dead = true;
      images.destroy();
      window.removeEventListener("vn-game-pick-v1", onPick);
      window.removeEventListener("vn-game-request-v1", onGameRequest);
      window.removeEventListener("vn-panel-request-v1", onPanelRequest);
    }
  };
}

// src/frontend/date-ui.ts
var REACT_ICON = { love: "♥♥", like: "♥", neutral: "–", dislike: "✕", hate: "✕✕" };
var REACT_TONE = { love: "good", like: "good", neutral: "neutral", dislike: "warn", hate: "bad" };
function hue(name) {
  let h = 0;
  for (const c of name)
    h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
function avatar(name, big = false) {
  return `<span class="warp-date-avatar${big ? " big" : ""}" style="--warp-hue:${hue(name)}" aria-hidden="true">${esc(name.trim().charAt(0).toUpperCase() || "?")}</span>`;
}
function meter(label, value, text, cls) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return `<div class="warp-date-meter ${cls}" title="${esc(`${label}: ${text ?? `${pct}%`}`)}"><span class="warp-date-meter-l">${esc(label)}</span><div class="warp-date-meter-track"><div style="width:${pct}%"></div></div><span class="warp-date-meter-t">${esc(text ?? `${pct}%`)}</span></div>`;
}
function stageBadge(p) {
  return `<span class="warp-date-stage${p.hostile ? " hostile" : ""}${p.partner ? " partner" : ""}">${p.partner ? "♥ " : ""}${esc(p.stage)}</span>`;
}
function knows(p) {
  const bits = [
    p.loves.length ? `<span class="warp-tone-good">♥♥ ${esc(p.loves.join(", "))}</span>` : "",
    p.likes.length ? `<span class="warp-tone-good">♥ ${esc(p.likes.join(", "))}</span>` : "",
    p.dislikes.length ? `<span class="warp-tone-bad">✕ ${esc(p.dislikes.join(", "))}</span>` : ""
  ].filter(Boolean);
  return bits.length ? `<div class="warp-date-knows">${bits.join("")}</div>` : `<div class="warp-date-knows warp-dim">You haven't learned their tastes yet.</div>`;
}
function personRow(p, busy) {
  return `<div class="warp-date-person">
    ${avatar(p.name)}
    <div class="warp-date-main">
      <div class="warp-date-name"><b>${esc(p.name)}</b>${stageBadge(p)}${p.here ? `<span class="warp-date-here" title="Here now">●</span>` : ""}${p.dates ? `<span class="warp-dim">${p.dates} date${p.dates === 1 ? "" : "s"}</span>` : ""}</div>
      ${meter("Love", p.love, p.loveText, "love")}
      ${p.fear > 0.005 ? meter("Fear", p.fear, p.fearText, "fear") : ""}
      ${knows(p)}
    </div>
    <button class="warp-btn warp-mini" data-date-act="date:talk@${esc(p.id)}"${busy ? " disabled" : ""}>Talk</button>
  </div>`;
}
function odds(p) {
  if (p === null)
    return "";
  const tone = p >= 0.67 ? "good" : p >= 0.34 ? "warn" : "bad";
  return `<span class="warp-choice-odds warp-tone-${tone}">${Math.round(p * 100)}%</span>`;
}
function topicTile(t, busy) {
  const react = t.known ? `<span class="warp-date-react warp-tone-${REACT_TONE[t.known]}" title="${esc(t.knownLabel ?? "")}">${REACT_ICON[t.known]}</span>` : `<span class="warp-date-react warp-dim" title="You don't know how they feel about this yet">?</span>`;
  const title = [t.desc, t.lock, t.knownLabel ? `Last time: ${t.knownLabel.toLowerCase()}` : null, t.used ? `Raised ${t.used}× this time — it wears thin` : null].filter(Boolean).join(`
`);
  return `<button class="warp-date-topic${t.lock ? " locked" : ""}" ${t.lock || busy ? "disabled" : ""} data-date-act="date:topic:${esc(t.id)}" title="${esc(title)}">
    ${react}<span class="warp-date-topic-l">${esc(t.label)}</span>${t.lock ? `<span class="warp-date-lock" aria-label="locked">\uD83D\uDD12</span>` : odds(t.odds)}${t.used ? `<span class="warp-date-used">×${t.used}</span>` : ""}
  </button>`;
}
function renderDate(v, ui) {
  if (!v)
    return `<div class="warp-card"><h3>Dating is off</h3><p>Add <b>dating: true</b> to the ruleset to talk topic by topic and go on dates.</p></div>`;
  const s = v.session;
  if (!s || !v.person) {
    if (!v.people.length)
      return `<div class="warp-card"><h3>Nobody to talk to yet</h3><p>People appear here once the story introduces them.</p></div>`;
    return `<div class="warp-date">
      <div class="warp-eyebrow">People · pick someone to talk to</div>
      ${v.people.map((p) => personRow(p, ui.busy)).join("")}
    </div>`;
  }
  const p = v.person;
  const fatigueTone = s.fatigue >= 80 ? "bad" : s.fatigue >= 60 ? "warn" : "good";
  const outing = s.kind === "outing" ? `<div class="warp-date-outing">
        <span>\uD83D\uDCCD <b>${esc(s.venue ?? "Out")}</b></span>
        <span class="warp-dim">${s.closing ? "Winding down" : `Moment ${Math.min(s.beat + 1, s.beats)} of ${s.beats}`}</span>
        ${meter("Enjoyment", s.enjoy / 100, `${Math.round(s.enjoy)}%`, "enjoy")}
      </div>` : s.kind === "plan" ? `<div class="warp-date-outing"><span>\uD83D\uDDD3 They said yes — pick where to go.</span></div>` : "";
  const last = s.last ? `<div class="warp-date-last warp-tone-${REACT_TONE[s.last.reaction]}">${REACT_ICON[s.last.reaction]} <b>${esc(s.last.label)}</b> — ${esc(s.last.text)}</div>` : "";
  const groups = new Map;
  for (const m of v.moves)
    groups.set(m.group, [...groups.get(m.group) ?? [], m]);
  const moves = [...groups].map(([g, list]) => `<div class="warp-choice-group">
      <div class="warp-choice-group-label">${esc(g)}</div>
      <div class="warp-choice-grid">${list.map((m) => `<button class="warp-choice warp-date-move ${esc(m.kind)}" data-date-act="${esc(m.id)}" title="${esc(m.desc ?? "")}"${ui.busy ? " disabled" : ""}><span class="warp-choice-label">${esc(m.label)}</span>${odds(m.odds)}</button>`).join("")}</div>
    </div>`).join("");
  const cats = v.categories;
  const cat = cats.find((c) => c.id === ui.cat) ?? cats.find((c) => c.topics.some((t) => !t.lock)) ?? cats[0];
  const topics = cats.length ? `<div class="warp-date-topics">
      <div class="warp-date-cats" role="tablist">${cats.map((c) => {
    const open = c.topics.filter((t) => !t.lock).length;
    return `<button class="warp-date-cat" role="tab" aria-selected="${c.id === cat?.id}" data-date-cat="${esc(c.id)}" title="${esc(c.label)}">${c.icon} <span>${esc(c.label)}</span>${open ? "" : " \uD83D\uDD12"}</button>`;
  }).join("")}</div>
      <div class="warp-date-grid">${cat ? cat.topics.map((t) => topicTile(t, ui.busy)).join("") : ""}</div>
    </div>` : "";
  return `<div class="warp-date">
    <div class="warp-date-head">
      ${avatar(p.name, true)}
      <div class="warp-date-main">
        <div class="warp-date-name"><b>${esc(p.name)}</b>${stageBadge(p)}</div>
        ${meter("Love", p.love, p.loveText, "love")}
        ${meter("Fear", p.fear, p.fearText, "fear")}
      </div>
      <div class="warp-date-mood" title="Mood: ${esc(s.moodLabel)}"><span class="warp-date-face">${s.moodFace}</span><span>${esc(s.moodLabel)}</span></div>
    </div>
    <div class="warp-date-stats">
      ${meter("Fatigue", s.fatigue / 100, s.fatigue >= 100 ? "Done talking" : s.fatigue >= 80 ? "Tired of talking" : s.fatigue >= 60 ? "Flagging" : "Fresh", `fatigue ${fatigueTone}`)}
      <span class="warp-date-combo${s.combo >= 3 ? " hot" : ""}" title="Good reactions in a row boost love">${s.combo >= 3 ? "\uD83D\uDD25" : "✦"} Streak ×${s.combo}</span>
    </div>
    ${outing}
    ${last}
    ${moves}
    ${topics}
    ${knows(p)}
  </div>`;
}

// src/frontend/arcade/themes.ts
var THEMES = {
  medieval: {
    style: "medieval",
    light: true,
    ground: "#eadcbb",
    ground2: "#dccaa1",
    line: "rgba(74, 52, 28, .22)",
    ink: "#2c1f12",
    inkSoft: "#6b5638",
    accent: "#9e2b1f",
    accent2: "#2c4a7a",
    gold: "#b48a2c",
    good: "#3e6b3a",
    warn: "#a8741a",
    bad: "#8c1f1a",
    wood: "#6b4426",
    woodDark: "#3b2414",
    felt: "#3f5a34",
    feltDark: "#26381f",
    metal: "#9a8a6a",
    pieces: ["#8c2f24", "#b48a2c", "#2c4a7a", "#3e6b3a", "#6b3f6e", "#a35a1f", "#4a5d6b"],
    lanes: ["#8c2f24", "#2c4a7a", "#3e6b3a", "#b48a2c"],
    cardFace: "#f2e6c9",
    cardRed: "#9e2b1f",
    cardBlack: "#231a10",
    glow: 0,
    fontDisplay: `"Cinzel", "Trajan Pro", "Palatino Linotype", "Book Antiqua", Georgia, serif`,
    fontUi: `"EB Garamond", "Garamond", "Palatino Linotype", "Book Antiqua", Georgia, serif`,
    fontNum: `"EB Garamond", "Palatino Linotype", Georgia, serif`
  },
  modern: {
    style: "modern",
    light: true,
    ground: "#f6f4ef",
    ground2: "#ebe8e1",
    line: "rgba(29, 29, 31, .08)",
    ink: "#1d1d1f",
    inkSoft: "#6e6e73",
    accent: "#ff5a36",
    accent2: "#2f6fe4",
    gold: "#d4a017",
    good: "#1f9d55",
    warn: "#e8a317",
    bad: "#d93a3a",
    wood: "#b98a5e",
    woodDark: "#7a5636",
    felt: "#1f6b4f",
    feltDark: "#154a37",
    metal: "#c8c8cc",
    pieces: ["#ff5a36", "#ffb020", "#2f6fe4", "#22a06b", "#8e5cf0", "#ff7aa8", "#00a3bf"],
    lanes: ["#1d1d1f", "#1d1d1f", "#1d1d1f", "#1d1d1f"],
    cardFace: "#ffffff",
    cardRed: "#d23434",
    cardBlack: "#1d1d1f",
    glow: 0,
    fontDisplay: `"Manrope", "Inter", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`,
    fontUi: `"Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`,
    fontNum: `"Inter", "Segoe UI", system-ui, sans-serif`
  },
  scifi: {
    style: "scifi",
    light: false,
    ground: "#0a111b",
    ground2: "#0f1926",
    line: "rgba(120, 170, 210, .14)",
    ink: "#d6e2ee",
    inkSoft: "#7d92a8",
    accent: "#5ec8e5",
    accent2: "#f2a541",
    gold: "#f2c14e",
    good: "#5fd3a0",
    warn: "#f2a541",
    bad: "#ef6461",
    wood: "#1c2a3a",
    woodDark: "#121c28",
    felt: "#13283a",
    feltDark: "#0b1824",
    metal: "#7d92a8",
    pieces: ["#5ec8e5", "#f2a541", "#8f9cff", "#5fd3a0", "#ef6461", "#c792ea", "#e0e6ec"],
    lanes: ["#5ec8e5", "#8f9cff", "#5fd3a0", "#f2a541"],
    cardFace: "#e9eef3",
    cardRed: "#d0435a",
    cardBlack: "#15202c",
    glow: 0.35,
    fontDisplay: `"Oxanium", "Bahnschrift", "DIN Alternate", "Segoe UI", system-ui, sans-serif`,
    fontUi: `"IBM Plex Sans", "Segoe UI", system-ui, sans-serif`,
    fontNum: `"IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace`
  }
};
var FONT_CSS = "https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700;900&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=Inter:wght@400;500;600;700&family=Manrope:wght@600;700;800&family=Oxanium:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap";
var fontsAsked = false;
function loadFonts() {
  if (fontsAsked || typeof document === "undefined")
    return;
  fontsAsked = true;
  try {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = FONT_CSS;
    document.head.appendChild(l);
  } catch {}
}
var cache = new Map;
function offscreen(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function grain(g, w, h, dots, dark, light, size, seed) {
  const r = rng(seed);
  for (let i = 0;i < dots; i++) {
    g.fillStyle = r() < 0.5 ? dark : light;
    g.globalAlpha = 0.03 + r() * 0.06;
    const s = size * (0.4 + r());
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}
function texture(kind, t) {
  const key = `${kind}:${t.style}:${t.ground}:${t.wood}:${t.felt}:${t.metal}`;
  const hit = cache.get(key);
  if (hit)
    return hit;
  const S = kind === "parchment" ? 512 : 256;
  const [c, g] = offscreen(S, S);
  const r = rng(kind.length * 97 + t.style.length);
  switch (kind) {
    case "parchment": {
      g.fillStyle = t.ground;
      g.fillRect(0, 0, S, S);
      for (let i = 0;i < 46; i++) {
        const x = r() * S, y = r() * S, rad = 20 + r() * 70;
        const tone = r() < 0.5 ? "rgba(140, 100, 50, .07)" : "rgba(255, 245, 220, .08)";
        for (const ox of [-S, 0, S])
          for (const oy of [-S, 0, S]) {
            const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
            gr.addColorStop(0, tone);
            gr.addColorStop(1, "rgba(0,0,0,0)");
            g.fillStyle = gr;
            g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
          }
      }
      grain(g, S, S, 16000, "#5a4020", "#fff6dc", 1.4, 3);
      g.strokeStyle = "rgba(90, 64, 32, .05)";
      g.lineWidth = 0.6;
      for (let i = 0;i < 480; i++) {
        const x = r() * S, y = r() * S;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 6);
        g.stroke();
      }
      break;
    }
    case "paper": {
      g.fillStyle = t.ground;
      g.fillRect(0, 0, S, S);
      grain(g, S, S, 1800, "#000", "#fff", 1, 5);
      break;
    }
    case "wood": {
      g.fillStyle = t.wood;
      g.fillRect(0, 0, S, S);
      for (let y = 0;y < S; y += 2) {
        const v = Math.sin(y * 0.09 + Math.sin(y * 0.013) * 4) * 0.5 + 0.5;
        g.fillStyle = `rgba(${t.style === "scifi" ? "0,0,0" : "30, 16, 6"}, ${0.04 + v * 0.12})`;
        g.fillRect(0, y, S, 1 + (v > 0.8 ? 1 : 0));
      }
      for (let i = 0;i < 40; i++) {
        const y = r() * S;
        g.strokeStyle = `rgba(${r() < 0.5 ? "20, 10, 4" : "255, 220, 170"}, ${0.04 + r() * 0.06})`;
        g.lineWidth = 0.6 + r() * 1.2;
        g.beginPath();
        for (let x = 0;x <= S; x += 8)
          g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
        g.stroke();
      }
      grain(g, S, S, 800, "#000", "#fff", 1, 7);
      break;
    }
    case "felt": {
      g.fillStyle = t.felt;
      g.fillRect(0, 0, S, S);
      grain(g, S, S, 9000, "#000", "#fff", 1, 11);
      break;
    }
    case "stone": {
      g.fillStyle = "#8a8172";
      g.fillRect(0, 0, S, S);
      grain(g, S, S, 6000, "#2a241c", "#e8dcc4", 2, 13);
      break;
    }
    case "panel": {
      g.fillStyle = t.ground;
      g.fillRect(0, 0, S, S);
      g.strokeStyle = "rgba(120, 170, 210, .05)";
      g.lineWidth = 1;
      for (let i = 0;i <= S; i += 16) {
        g.beginPath();
        g.moveTo(i + 0.5, 0);
        g.lineTo(i + 0.5, S);
        g.stroke();
        g.beginPath();
        g.moveTo(0, i + 0.5);
        g.lineTo(S, i + 0.5);
        g.stroke();
      }
      grain(g, S, S, 1500, "#000", "#9cc4e4", 1, 17);
      break;
    }
    case "brushed": {
      g.fillStyle = t.metal;
      g.fillRect(0, 0, S, S);
      for (let y = 0;y < S; y++) {
        g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"}, ${r() * 0.07})`;
        g.fillRect(0, y, S, 1);
      }
      break;
    }
  }
  cache.set(key, c);
  return c;
}
function paint(g, kind, t, x, y, w, h) {
  const p = g.createPattern(texture(kind, t), "repeat");
  if (!p)
    return;
  g.save();
  g.fillStyle = p;
  g.translate(x, y);
  g.fillRect(0, 0, w, h);
  g.restore();
}
function vignette(g, w, h, strength = 0.35, color = "0,0,0") {
  const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  gr.addColorStop(0, `rgba(${color},0)`);
  gr.addColorStop(1, `rgba(${color},${strength})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}
function ground(g, t, w, h, kind = "page") {
  if (t.style === "medieval") {
    if (kind === "table") {
      paint(g, "wood", t, 0, 0, w, h);
      vignette(g, w, h, 0.5);
    } else {
      paint(g, "parchment", t, 0, 0, w, h);
      vignette(g, w, h, 0.28, "70, 40, 10");
    }
  } else if (t.style === "modern") {
    if (kind === "table") {
      g.fillStyle = t.ground2;
      g.fillRect(0, 0, w, h);
    } else {
      paint(g, "paper", t, 0, 0, w, h);
    }
  } else {
    paint(g, "panel", t, 0, 0, w, h);
    vignette(g, w, h, 0.55);
  }
}
function glow(g, t, color, blur) {
  g.shadowColor = color;
  g.shadowBlur = blur * t.glow;
}
function lift(g, t, depth = 1) {
  if (t.style === "scifi") {
    g.shadowBlur = 0;
    g.shadowColor = "transparent";
    return;
  }
  g.shadowColor = t.style === "medieval" ? "rgba(40, 20, 5, .35)" : "rgba(0, 0, 0, .14)";
  g.shadowBlur = 6 * depth;
  g.shadowOffsetY = 2 * depth;
}
function unlift(g) {
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;
  g.shadowColor = "transparent";
}
function brackets(g, x, y, w, h, color, len = 12) {
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(x, y + len);
  g.lineTo(x, y);
  g.lineTo(x + len, y);
  g.moveTo(x + w - len, y);
  g.lineTo(x + w, y);
  g.lineTo(x + w, y + len);
  g.moveTo(x + w, y + h - len);
  g.lineTo(x + w, y + h);
  g.lineTo(x + w - len, y + h);
  g.moveTo(x + len, y + h);
  g.lineTo(x, y + h);
  g.lineTo(x, y + h - len);
  g.stroke();
}
function textureUrl(kind, t) {
  try {
    return texture(kind, t).toDataURL("image/png");
  } catch {
    return "";
  }
}

// src/frontend/stage.ts
function stageModeOf(s, wantGate) {
  if (s?.dungeon)
    return "dungeon";
  if (s?.date?.session)
    return "date";
  if (wantGate && s?.dungeonEntries.length)
    return "gate";
  return null;
}
function dressStage(el, style) {
  if (el.dataset.style === style)
    return;
  el.dataset.style = style;
  loadFonts();
  const t = THEMES[style];
  const set = (name, url) => {
    if (url)
      el.style.setProperty(name, `url(${url})`);
  };
  if (style === "medieval") {
    set("--st-stone", textureUrl("stone", t));
    set("--st-wood", textureUrl("wood", { ...t, wood: "#4a2e18" }));
    set("--st-parch", textureUrl("parchment", t));
  } else if (style === "scifi")
    set("--st-panel-tex", textureUrl("panel", { ...t, ground: "#060a10" }));
}
function replaceStageScene(el, html) {
  const panes = [".warp-stage-side", ".warp-stage-left", ".warp-stage-menu-col", ".warp-stage-command", ".warp-stage-main"];
  const kept = panes.map((selector) => el.querySelector(selector)?.scrollTop ?? 0);
  el.innerHTML = html;
  panes.forEach((selector, i) => {
    const pane = el.querySelector(selector);
    if (pane && kept[i])
      pane.scrollTop = kept[i];
  });
}
function formatStory(text) {
  const safe = esc(text.trim());
  if (!safe)
    return "";
  return safe.split(/\n{2,}/).map((p) => `<p>${p.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*\n]+)\*/g, "<em>$1</em>").replace(/(&quot;|“)([^\n]*?)(&quot;|”)/g, `<span class="warp-stage-q">$1$2$3</span>`).replace(/\n/g, "<br>")}</p>`).join("");
}
function top(kicker, title, middle, actions) {
  return `<header class="warp-stage-top">
    <div class="warp-stage-title"><span class="warp-stage-kicker">${kicker}</span><h1>${esc(title)}</h1></div>
    <div class="warp-stage-mid">${middle}</div>
    <div class="warp-stage-actions">${actions}<button class="warp-stage-btn ghost" data-stage-close title="Back to the chat (Esc)">Chat <span aria-hidden="true">⤓</span></button></div>
  </header>`;
}
function depthTrack(v) {
  if (!v.floors)
    return `<div class="warp-stage-depth" title="Endless — floor ${v.depth}"><span class="warp-stage-depth-n">Floor ${v.depth}</span><span class="warp-stage-endless">∞</span></div>`;
  const pips = Array.from({ length: v.floors }, (_, i) => `<i class="${i + 1 < v.depth ? "past" : i + 1 === v.depth ? "now" : ""}${i + 1 === v.floors ? " last" : ""}"></i>`).join("");
  return `<div class="warp-stage-depth" title="Floor ${v.depth} of ${v.floors}"><span class="warp-stage-depth-n">Floor ${v.depth}<span class="warp-stage-of"> / ${v.floors}</span></span><span class="warp-stage-pips">${pips}</span>${v.boss ? `<span class="warp-stage-boss" title="A guardian blocks the way down">☠</span>` : ""}</div>`;
}
function purse(v) {
  const pct = v.xpNext > 0 ? Math.min(100, v.xp / v.xpNext * 100) : 100;
  return `<div class="warp-stage-purse">
    <span class="warp-stage-lv" title="Party level">Lv ${v.level}</span>
    <span class="warp-stage-xp" title="${v.xp} / ${v.xpNext} XP"><span style="width:${pct.toFixed(1)}%"></span></span>
    <span class="warp-stage-gold" title="Gold carried — kept if you leave, lost if you're wiped out">${sprite("gold", "warp-stage-coin")}${v.gold}</span>
  </div>`;
}
function foeCard(f, targetable) {
  const cls = ["warp-stage-foe", f.alive ? "" : "down", f.boss ? "boss" : f.elite ? "elite" : "", targetable && f.alive ? "targetable" : ""].filter(Boolean).join(" ");
  const tag = targetable && f.alive ? "button" : "div";
  return `<${tag} class="${cls}" data-fid="${esc(f.id)}" ${targetable && f.alive ? `data-dg-target="${esc(f.id)}" title="Target ${esc(f.name)}"` : ""}>
    <div class="warp-stage-foe-glow"></div>
    ${sprite(f.sprite, "warp-stage-foe-img")}
    <div class="warp-stage-foe-name">${esc(f.name)}</div>
    ${bar(f.hp, f.mhp, "hp", "HP")}
  </${tag}>`;
}
function battle(v, ui) {
  const b = v.battle;
  const foes = b.fighters.filter((f) => f.side === "foe");
  const party = b.fighters.filter((f) => f.side === "party");
  const active = party.find((f) => f.id === b.active);
  const pickFoe = ui.pick?.target === "foe";
  const pickAlly = ui.pick?.target === "ally";
  let menu = "";
  if (b.over)
    menu = `<div class="warp-stage-menu-note">The fight is over.</div>`;
  else if (ui.pick)
    menu = `<div class="warp-stage-menu-note warn">Choose ${ui.pick.target === "foe" ? "an enemy" : "an ally"} <button class="warp-stage-btn small" data-dg-cancel>Cancel</button></div>`;
  else if (active) {
    const skills = b.skills.map((s) => `<button class="warp-stage-cmd" data-dg-skill="${esc(s.id)}" data-dg-skill-target="${esc(s.target)}" ${s.usable && !ui.busy ? "" : "disabled"} title="${esc(s.cost || "Free")}"><span>${esc(s.name)}</span>${s.cost ? `<small>${esc(s.cost)}</small>` : ""}</button>`).join("");
    const items = v.bag.map((i) => `<button class="warp-stage-cmd item" data-dg-item="${esc(i.id)}" ${ui.busy ? "disabled" : ""}>${sprite(i.sprite, "warp-dg-mini")}<span>${esc(i.name)}</span><small>×${i.count}</small></button>`).join("");
    const who = you(active.name);
    menu = `<div class="warp-stage-turn">${sprite(active.sprite, "warp-stage-turn-face")}${who === "You" ? "<b>Your</b> turn" : `<b>${esc(who)}</b>'s turn`}</div>
      <div class="warp-stage-cmds">${skills}</div>
      ${items ? `<div class="warp-stage-cmds">${items}</div>` : ""}
      <div class="warp-stage-cmds tail">
        ${b.canEscape ? `<button class="warp-stage-cmd flee" data-dg-escape ${ui.busy ? "disabled" : ""}>Escape</button>` : ""}
        <button class="warp-stage-cmd" data-dg-auto="round" ${ui.busy ? "disabled" : ""} title="Everyone picks a sensible move for this round">Auto round</button>
        <button class="warp-stage-cmd" data-dg-auto="battle" ${ui.busy ? "disabled" : ""} title="Fight it out automatically">Auto battle</button>
      </div>`;
  }
  const kind = b.kind === "boss" ? "Floor guardian" : b.kind === "elite" ? "Elite battle" : "Battle";
  return `<main class="warp-stage-main warp-stage-battle">
    <section class="warp-stage-arena ${esc(b.kind)}">
      <div class="warp-stage-arena-head"><span class="warp-stage-kicker">${kind}</span><span class="warp-stage-round">Round ${b.round}</span></div>
      <div class="warp-stage-foes">${foes.map((f) => foeCard(f, pickFoe)).join("")}</div>
      <div class="warp-stage-ticker" aria-live="polite">${b.log.slice(-4).map((l, i, a) => `<div class="${i === a.length - 1 ? "new" : ""}">${esc(you(l))}</div>`).join("")}</div>
    </section>
    <section class="warp-stage-command">
      <div class="warp-stage-party">${party.map((f) => memberCard(f, { targetable: pickAlly })).join("")}</div>
      <div class="warp-stage-menu">${menu}</div>
    </section>
  </main>`;
}
function dungeonScene(v, ui) {
  const floor = SPRITES[`floor_${v.theme}`] ?? SPRITES.floor_cave;
  const head = top(`${sprite("stairs", "warp-stage-kicker-icon")} Dungeon`, v.name, `${depthTrack(v)}${purse(v)}`, v.battle ? "" : `<button class="warp-stage-btn" data-dg-leave ${ui.busy ? "disabled" : ""} title="Climb out and keep what you've found">Leave</button>`);
  const bg = `<div class="warp-stage-bg" style="--warp-stage-tex:url(${floor})"></div>`;
  if (v.battle)
    return bg + head + battle(v, ui);
  const pickAlly = ui.pick?.kind === "use";
  const bag = v.bag.filter((i) => i.id !== "bomb").map((i) => `<button class="warp-stage-chip" data-dg-use="${esc(i.id)}" ${ui.busy ? "disabled" : ""} title="Use ${esc(i.name)}">${sprite(i.sprite, "warp-dg-mini")}${esc(i.name)} <b>×${i.count}</b></button>`).join("");
  const bombs = v.bag.find((i) => i.id === "bomb");
  const here = herePanel(v, { pick: ui.pick, mates: ui.mates, busy: ui.busy });
  return bg + head + `<main class="warp-stage-main warp-stage-run">
    <section class="warp-stage-map">
      <div class="warp-stage-board">${board(v)}</div>
      <div class="warp-stage-bag">${bag}${bombs ? `<span class="warp-stage-chip muted">${sprite("bomb", "warp-dg-mini")}Bomb <b>×${bombs.count}</b></span>` : ""}${v.loot.length ? `<span class="warp-stage-loot" title="Kept when you leave">Found: ${esc(v.loot.map((l) => `${l.name}${l.count > 1 ? ` ×${l.count}` : ""}`).join(", "))}</span>` : ""}</div>
    </section>
    <aside class="warp-stage-side">
      <div class="warp-stage-party">${v.party.map((f) => memberCard(f, { targetable: pickAlly })).join("")}</div>
      ${pickAlly ? `<div class="warp-stage-menu-note warn">Who drinks it? <button class="warp-stage-btn small" data-dg-cancel>Cancel</button></div>` : ""}
      ${here ? `<div class="warp-stage-here">${here}</div>` : ""}
      <div class="warp-stage-log">${v.log.slice(0, 7).map((l) => `<div>${esc(you(l))}</div>`).join("")}</div>
    </aside>
  </main>`;
}
function gateScene(entries, ui) {
  const first = entries[0];
  const floor = SPRITES[`floor_${first?.theme ?? "cave"}`] ?? SPRITES.floor_cave;
  const cards = entries.map((e) => `<article class="warp-stage-gate">
    <div class="warp-stage-gate-head">${sprite("stairs", "warp-stage-gate-icon")}<div><h2>${esc(e.name)}</h2>
      <div class="warp-stage-dim">${e.deepest ? `Deepest so far: floor ${e.deepest}` : "Unexplored"}${e.floors ? ` · ${e.floors} floors` : " · endless"}</div></div></div>
    ${e.desc ? `<p>${esc(e.desc)}</p>` : ""}
    ${e.max && e.companions.length ? `<div class="warp-stage-kicker">Bring along — up to ${e.max}</div>
      <div class="warp-stage-mates">${e.companions.map((c) => `<label class="warp-stage-mate${ui.mates.has(c.id) ? " on" : ""}"><input type="checkbox" data-dg-mate="${esc(c.id)}" ${ui.mates.has(c.id) ? "checked" : ""} ${!ui.mates.has(c.id) && ui.mates.size >= e.max ? "disabled" : ""}><span class="warp-stage-mate-name">${esc(c.name)}</span><span class="warp-stage-dim">${esc(c.cls)}${c.present ? " · here" : ""}</span></label>`).join("")}</div>` : ""}
    <p class="warp-stage-dim">Tiles are face down until you step on them; one of them leads down. Leave whenever you like and keep what you found — get wiped out and you lose it.</p>
    <button class="warp-stage-btn primary" data-dg-enter="${esc(e.id)}" ${ui.busy ? "disabled" : ""}>Enter ${esc(e.name)}</button>
  </article>`).join("");
  return `<div class="warp-stage-bg" style="--warp-stage-tex:url(${floor})"></div>` + top(`${sprite("stairs", "warp-stage-kicker-icon")} Dungeon`, entries.length === 1 ? first.name : "Dungeons", "", "") + `<main class="warp-stage-main warp-stage-gates">${cards}</main>`;
}
function ring(love, fear, name, face, mood) {
  const C = 2 * Math.PI * 46, c2 = 2 * Math.PI * 38;
  const l = Math.max(0, Math.min(1, love)), f = Math.max(0, Math.min(1, fear));
  return `<div class="warp-stage-portrait" style="--warp-hue:${hue(name)}">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="49.2" class="deco"/>
      <circle cx="50" cy="50" r="46" class="track"/>
      ${l > 0.005 ? `<circle cx="50" cy="50" r="46" class="love" stroke-dasharray="${(C * l).toFixed(1)} ${C.toFixed(1)}"/>` : ""}
      ${f > 0.005 ? `<circle cx="50" cy="50" r="38" class="track thin"/><circle cx="50" cy="50" r="38" class="fear" stroke-dasharray="${(c2 * f).toFixed(1)} ${c2.toFixed(1)}"/>` : ""}
    </svg>
    <span class="warp-stage-initial">${esc(name.trim().charAt(0).toUpperCase() || "?")}</span>
    <span class="warp-stage-face" aria-hidden="true">${face}</span>
  </div>
  <div class="warp-stage-who"><b>${esc(name)}</b><span>${esc(mood)}</span></div>`;
}
function ladder(v) {
  const p = v.person;
  if (!v.stages.length)
    return "";
  if (p.hostile)
    return `<ol class="warp-stage-ladder"><li class="hostile now">${esc(p.stage)}</li></ol>`;
  return `<ol class="warp-stage-ladder" aria-label="Where you stand">${v.stages.map((st, i) => `<li class="${i < p.stageIndex ? "past" : i === p.stageIndex ? "now" : ""}">${esc(st)}</li>`).join("")}</ol>`;
}
function dateScene(v, hud, scene, ui) {
  const s = v.session;
  const p = v.person;
  const kicker = s.kind === "outing" ? `On a date${s.venue ? ` · ${esc(s.venue)}` : ""}` : s.kind === "plan" ? "Making plans" : "Talking with";
  const image = scene?.image ?? null;
  const fatigue = s.fatigue >= 100 ? "Done talking" : s.fatigue >= 80 ? "Tired of talking" : s.fatigue >= 60 ? "Flagging" : "Fresh";
  const last = s.last ? `<div class="warp-stage-reaction warp-tone-${REACT_TONE[s.last.reaction]}${ui.freshReaction ? " fresh" : ""}"><span class="warp-stage-reaction-icon">${REACT_ICON[s.last.reaction]}</span><div><b>${esc(s.last.text)}</b><span>${esc(s.last.label)}</span></div></div>` : "";
  const corner = `<div class="warp-stage-corner">
      ${hud?.clock ? `<div class="warp-stage-clock">${esc(hud.date ?? hud.clock.day)} · <b>${esc(hud.clock.time)}</b></div>` : ""}
      <div class="warp-stage-where">${esc(s.venue ?? hud?.location?.name ?? "")}</div>
      ${hud?.money ? `<div class="warp-stage-cash">${esc(hud.money)}</div>` : ""}
    </div>`;
  const stats = `<dl class="warp-stage-stats">
      <dt>Love</dt><dd><span class="warp-stage-mini love"><i style="width:${Math.round(p.love * 100)}%"></i></span>${esc(p.loveText ?? `${Math.round(p.love * 100)}%`)}</dd>
      ${p.fear > 0.005 ? `<dt>Fear</dt><dd><span class="warp-stage-mini fear"><i style="width:${Math.round(p.fear * 100)}%"></i></span>${esc(p.fearText ?? `${Math.round(p.fear * 100)}%`)}</dd>` : ""}
      <dt>Stage</dt><dd class="${p.hostile ? "warp-tone-bad" : p.partner ? "love" : ""}">${esc(p.stage)}</dd>
      <dt>Mood</dt><dd><span class="warp-stage-emo">${s.moodFace}</span> ${esc(s.moodLabel)}</dd>
      <dt>Fatigue</dt><dd class="${s.fatigue >= 80 ? "warp-tone-bad" : s.fatigue >= 60 ? "warp-tone-warn" : ""}">${Math.round(s.fatigue)}% · ${fatigue}</dd>
      <dt>Streak</dt><dd class="${s.combo >= 3 ? "hot" : ""}">${s.combo >= 3 ? `<span class="warp-stage-emo">\uD83D\uDD25</span> ` : ""}×${s.combo}</dd>
      ${s.kind === "outing" ? `<dt>Date</dt><dd>${s.closing ? "Winding down" : `Moment ${Math.min(s.beat + 1, s.beats)} / ${s.beats}`} · ${Math.round(s.enjoy)}% fun</dd>` : ""}
    </dl>`;
  const moves = v.moves.map((m) => `<button class="warp-stage-bar move ${esc(m.kind)}" data-date-act="${esc(m.id)}" title="${esc(m.desc ?? "")}"${ui.busy ? " disabled" : ""}><span>${esc(m.label)}</span>${odds(m.odds)}</button>`).join("");
  const cats = v.categories;
  const cat = cats.find((c) => c.id === ui.cat) ?? null;
  const list = cat ? `<button class="warp-stage-bar back" data-date-cat="">‹ <span class="warp-stage-emo">${esc(cat.icon)}</span> ${esc(cat.label)}</button>
       ${cat.topics.map((t, i) => {
    const react = t.known ? `<span class="warp-stage-bar-react warp-tone-${REACT_TONE[t.known]}" title="${esc(t.knownLabel ?? "")}">${REACT_ICON[t.known]}</span>` : `<span class="warp-stage-bar-react dim">?</span>`;
    return `<button class="warp-stage-bar topic${t.lock ? " locked" : ""}" data-date-act="date:topic:${esc(t.id)}" data-key="${i + 1}" ${t.lock || ui.busy ? "disabled" : ""} title="${esc([t.desc, t.lock, t.used ? `Raised ${t.used}× already — it wears thin` : null].filter(Boolean).join(`
`))}"><span class="warp-stage-bar-n">${i + 1}.</span><span>${esc(t.label)}</span>${t.lock ? `<span class="warp-stage-emo">\uD83D\uDD12</span>` : react}${odds(t.odds)}</button>`;
  }).join("")}` : cats.map((c, i) => {
    const open = c.topics.filter((t) => !t.lock).length;
    return `<button class="warp-stage-bar cat" data-date-cat="${esc(c.id)}" data-key="${i + 1}"${open ? "" : " disabled"}><span class="warp-stage-bar-n">${i + 1}.</span><span><span class="warp-stage-emo">${esc(c.icon)}</span> ${esc(c.label)}</span>${open ? `<small>${open}</small>` : `<span class="warp-stage-emo">\uD83D\uDD12</span>`}</button>`;
  }).join("");
  const fit = ["cover", "contain", "fill", "none", "scale-down"].includes(scene?.imageFit ?? "") ? scene.imageFit : "cover";
  return `<div class="warp-stage-bg${image ? " has-photo" : ""}" style="--warp-hue:${hue(p.name)}">${image ? `<img class="warp-stage-photo" src="${esc(image)}" alt="Date with ${esc(p.name)}" style="object-fit:${fit}"/>` : ""}</div>` + top(kicker, p.name, ladder(v), scene?.imageBusy ? `<span class="warp-stage-painting">Cue is illustrating the date…</span>` : scene?.imageError ? `<div class="warp-stage-painting error"><details><summary>Picture unavailable</summary><div class="warp-stage-picture-error">${esc(scene.imageError)}</div></details><button class="warp-btn warp-mini" data-date-image-retry>Retry picture</button></div>` : image ? `<button class="warp-btn warp-mini" data-date-image-retry title="Ask Cue again using its current settings. Compatible cached images may be reused.">Refresh picture</button>` : "") + `<main class="warp-stage-main warp-stage-date ${esc(s.kind)}">
      <section class="warp-stage-left">${corner}${stats}${last}</section>
      <section class="warp-stage-center">${image ? "" : ring(p.love, p.fear, p.name, s.moodFace, s.moodLabel)}</section>
      <section class="warp-stage-menu-col"><div class="warp-stage-kicker">${cat ? "Topics" : "Talk"}</div>${cat ? "" : moves}${list}</section>
    </main>`;
}
function renderStage(s, mode, ui) {
  if (mode === "dungeon" && s.dungeon)
    return dungeonScene(s.dungeon, ui);
  if (mode === "date" && s.date?.session && s.date.person)
    return dateScene(s.date, s.hud, s.scene, ui);
  if (mode === "gate")
    return gateScene(s.dungeonEntries, ui);
  return "";
}

// src/frontend/stage-styles.ts
var STAGE_STYLES = `
.warp-stage {
  /* the backdrop and what's written straight on it */
  --st-bg: #f3f1ec;
  --st-ink: #1d1d1f;
  --st-muted: #6e6e73;
  --st-dim: #9a9aa0;
  --st-line: rgba(29, 29, 31, .1);
  /* panels: cards, the menu, the story box */
  --sp-bg: #ffffff;
  --sp-ink: #1d1d1f;
  --sp-muted: #6e6e73;
  --sp-dim: #9a9aa0;
  --sp-line: rgba(29, 29, 31, .09);
  --sp-field: #f4f3f0;
  --sp-ghost: rgba(255, 255, 255, .5);
  --sp-radius: 14px;
  --sp-edge: 0 0 0 1px rgba(29, 29, 31, .06);
  --sp-shadow: 0 1px 2px rgba(0, 0, 0, .04), 0 10px 28px rgba(30, 25, 15, .07);
  --sp-good: #1f9d55; --sp-warn: #b97a06; --sp-bad: #d93a3a;
  --st-accent: #ff5a36;
  --st-accent-ink: #ffffff;
  --st-accent-soft: rgba(255, 90, 54, .1);
  --st-primary: #1d1d1f;
  --st-primary-ink: #ffffff;
  --st-gold: #c48a00;
  --st-hp: #e5484d; --st-mp: #2f6fe4; --st-tp: #e8a317; --st-xp: #8e5cf0;
  --st-track: rgba(29, 29, 31, .08);
  --st-love: #e8456b; --st-fear: #7a5cf0;
  --st-display: "Manrope", "Inter", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
  --st-ui: "Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  --st-num: "Inter", "Segoe UI", system-ui, sans-serif;
  --st-story: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --st-btn-radius: 999px;
  --warp-good: #1f9d55; --warp-warn: #b97a06; --warp-bad: #d93a3a; --warp-info: #2f6fe4;
  --warp-text: var(--st-ink); --warp-muted: var(--st-muted); --warp-dim: var(--st-dim);
  --warp-fill: rgba(29, 29, 31, .05); --warp-fill-subtle: rgba(29, 29, 31, .03);
  --warp-border: var(--st-line); --warp-accent: var(--st-accent); --warp-accent-fg: var(--st-accent-ink);
  --warp-radius: 10px;
  position: absolute; inset: 0;
  display: grid; grid-template-rows: minmax(0, 1fr) auto;
  background: var(--st-bg); color: var(--st-ink);
  font-family: var(--st-ui); font-size: 14px; line-height: 1.45;
  overflow: hidden; user-select: none; -webkit-user-select: none;
  animation: warp-stage-in 380ms ease both;
}
.warp-stage[data-mode=date] { --st-accent: #e8456b; --st-accent-soft: rgba(232, 69, 107, .1); }

.warp-stage[data-style=medieval] {
  --st-bg: #17110b;
  --st-ink: #ecdfbf;
  --st-muted: #c9b68e;
  --st-dim: #8f7d5c;
  --st-line: rgba(214, 181, 106, .24);
  --sp-bg: var(--st-parch, none) 0 0 / 512px, #eadcbb;
  --sp-ink: #2c1f12;
  --sp-muted: #5e4a30;
  --sp-dim: #8a7452;
  --sp-line: rgba(74, 52, 28, .22);
  --sp-field: rgba(255, 250, 235, .55);
  --sp-ghost: rgba(20, 12, 6, .5);
  --sp-radius: 3px;
  --sp-edge: inset 0 0 0 1px rgba(110, 76, 30, .45), inset 0 0 0 4px rgba(234, 220, 187, 0), inset 0 0 0 5px rgba(180, 138, 44, .4);
  --sp-shadow: 0 12px 30px rgba(0, 0, 0, .5), 0 2px 4px rgba(0, 0, 0, .4);
  --sp-good: #3e6b3a; --sp-warn: #8a5c10; --sp-bad: #8c1f1a;
  --st-accent: #9e2b1f;
  --st-accent-ink: #f6e7c8;
  --st-accent-soft: rgba(158, 43, 31, .1);
  --st-primary: #9e2b1f;
  --st-primary-ink: #f6e7c8;
  --st-gold: #d6b56a;
  --st-hp: #a3342a; --st-mp: #2c4a7a; --st-tp: #b48a2c; --st-xp: #d6b56a;
  --st-track: rgba(74, 52, 28, .14);
  --st-love: #a3342a; --st-fear: #4a3b6b;
  --st-display: "Cinzel", "Trajan Pro", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --st-ui: "EB Garamond", "Garamond", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --st-num: "EB Garamond", "Palatino Linotype", Georgia, serif;
  --st-story: "EB Garamond", "Garamond", "Palatino Linotype", Georgia, serif;
  --st-btn-radius: 2px;
  --warp-good: #8fbf7a; --warp-warn: #d9a54a; --warp-bad: #d9786c; --warp-info: #8fa8d6;
  --warp-fill: rgba(236, 223, 191, .08); --warp-fill-subtle: rgba(236, 223, 191, .04);
  font-size: 15.5px;
}
.warp-stage[data-style=medieval][data-mode=date] { --st-bg: #1d0e0e; }

.warp-stage[data-style=scifi] {
  --st-bg: #070c13;
  --st-ink: #d6e2ee;
  --st-muted: #8aa0b6;
  --st-dim: #546a80;
  --st-line: rgba(120, 170, 210, .16);
  --sp-bg: rgba(14, 25, 39, .92);
  --sp-ink: #d6e2ee;
  --sp-muted: #8aa0b6;
  --sp-dim: #546a80;
  --sp-line: rgba(120, 170, 210, .16);
  --sp-field: rgba(120, 170, 210, .06);
  --sp-ghost: rgba(7, 12, 19, .6);
  --sp-radius: 0px;
  --sp-edge: inset 0 0 0 1px rgba(120, 170, 210, .3);
  --sp-shadow: none;
  --sp-good: #5fd3a0; --sp-warn: #f2a541; --sp-bad: #ef6461;
  --st-accent: #5ec8e5;
  --st-accent-ink: #04121a;
  --st-accent-soft: rgba(94, 200, 229, .1);
  --st-primary: #5ec8e5;
  --st-primary-ink: #04121a;
  --st-gold: #f2c14e;
  --st-hp: #5fd3a0; --st-mp: #5ec8e5; --st-tp: #f2a541; --st-xp: #8f9cff;
  --st-track: rgba(120, 170, 210, .1);
  --st-love: #ef6f9a; --st-fear: #8f9cff;
  --st-display: "Oxanium", "Bahnschrift", "DIN Alternate", "Segoe UI", system-ui, sans-serif;
  --st-ui: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --st-num: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
  --st-story: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --st-btn-radius: 0px;
  --warp-good: #5fd3a0; --warp-warn: #f2a541; --warp-bad: #ef6461; --warp-info: #8f9cff;
  --warp-fill: rgba(120, 170, 210, .06); --warp-fill-subtle: rgba(120, 170, 210, .03);
  font-size: 13.5px;
}
.warp-stage[data-style=scifi][data-mode=date] { --st-accent: #ef6f9a; --st-accent-soft: rgba(239, 111, 154, .1); --st-primary: #ef6f9a; --st-primary-ink: #1a0610; }

@keyframes warp-stage-in { from { opacity: 0; transform: scale(1.01); } to { opacity: 1; transform: none; } }
.warp-stage *, .warp-stage *::before, .warp-stage *::after { box-sizing: border-box; }
.warp-stage button { font: inherit; color: inherit; }
.warp-stage-scene { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr); min-height: 0; grid-row: 1 / -1; grid-column: 1; }
/* the scene runs behind the dialogue box; its content stops above it */
.warp-stage-story { grid-row: 2; grid-column: 1; align-self: end; }
.warp-stage-main { padding-bottom: calc(var(--warp-story-h, 0px) + 18px) !important; }
.warp-stage-dim { color: var(--st-dim); font-size: .9em; }
.warp-stage-kicker { font-size: 10.5px; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: var(--st-muted); display: inline-flex; align-items: center; gap: 6px; }
.warp-stage-kicker-icon { width: 16px; height: 16px; }
.warp-stage[data-style=medieval] .warp-stage-kicker { font-family: var(--st-ui); font-style: italic; font-size: 14px; letter-spacing: .02em; text-transform: none; font-weight: 500; color: var(--st-gold); }
.warp-stage[data-style=scifi] .warp-stage-kicker { font-family: var(--st-num); font-size: 10.5px; letter-spacing: .14em; color: var(--st-accent); font-weight: 500; }
.warp-stage[data-style=scifi] .warp-stage-kicker::before { content: "//"; opacity: .6; }
.warp-stage[data-style=medieval] .warp-stage-kicker-icon, .warp-stage[data-style=scifi] .warp-stage-kicker-icon { display: none; }
.warp-stage:is([data-style=medieval], [data-style=scifi]) .warp-stage-emo { display: none; }
.warp-stage .warp-px { image-rendering: pixelated; }

/* ── panels: one material per look ── */
.warp-stage :is(.warp-stage-corner, .warp-stage-stats, .warp-stage-reaction, .warp-dg-member, .warp-stage-here > div, .warp-stage-menu, .warp-stage-gate, .warp-stage-ended > div, .warp-stage-chip, .warp-stage-gauges),
.warp-stage .warp-stage-story {
  --st-ink: var(--sp-ink); --st-muted: var(--sp-muted); --st-dim: var(--sp-dim); --st-line: var(--sp-line);
  --warp-text: var(--sp-ink); --warp-muted: var(--sp-muted); --warp-dim: var(--sp-dim); --warp-border: var(--sp-line);
  --warp-good: var(--sp-good); --warp-warn: var(--sp-warn); --warp-bad: var(--sp-bad);
  background: var(--sp-bg); color: var(--sp-ink); border: 0; border-radius: var(--sp-radius);
  box-shadow: var(--sp-edge), var(--sp-shadow);
}
.warp-stage[data-style=medieval] .warp-stage-kicker:is(.warp-stage-menu-col > *, .warp-stage-gate *) { color: var(--st-accent); }
.warp-stage[data-style=medieval] :is(.warp-stage-gate, .warp-stage-ended > div, .warp-stage-here > div, .warp-stage-menu, .warp-stage-stats, .warp-stage-corner, .warp-stage-reaction, .warp-dg-member, .warp-stage-story) .warp-stage-kicker { color: var(--st-accent); }
/* sci-fi: cut corners, two of them traced in the accent */
.warp-stage[data-style=scifi] :is(.warp-stage-corner, .warp-stage-stats, .warp-stage-reaction, .warp-dg-member, .warp-stage-here > div, .warp-stage-menu, .warp-stage-gate, .warp-stage-ended > div, .warp-stage-gauges, .warp-stage-story) {
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
  background:
    linear-gradient(135deg, transparent 6.6px, var(--st-accent) 6.6px 8.2px, transparent 8.2px) top left / 16px 16px no-repeat,
    linear-gradient(315deg, transparent 6.6px, var(--st-accent) 6.6px 8.2px, transparent 8.2px) bottom right / 16px 16px no-repeat,
    var(--sp-bg);
  backdrop-filter: blur(6px);
}

/* ── backdrop ── */
.warp-stage-bg { position: absolute; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.warp-stage-bg::before, .warp-stage-bg::after { content: ""; position: absolute; inset: 0; }
/* modern: warm paper with a soft wash of light */
.warp-stage-bg::before { background: radial-gradient(ellipse 70% 55% at 50% 0%, rgba(255, 255, 255, .9), transparent 70%); }
.warp-stage[data-mode=date] .warp-stage-bg::before {
  background:
    radial-gradient(circle at 15% 20%, hsl(var(--warp-hue, 340) 80% 86% / .55), transparent 38%),
    radial-gradient(circle at 85% 75%, hsl(calc(var(--warp-hue, 340) + 40) 70% 86% / .5), transparent 40%),
    #f7f2ee; }
/* medieval: flagstones in torchlight; a date is by candlelight on dark oak */
.warp-stage[data-style=medieval] .warp-stage-bg::before { background: linear-gradient(rgba(22, 15, 8, .8), rgba(16, 11, 6, .88)), var(--st-stone, none) 0 0 / 160px, #2a2219; }
.warp-stage[data-style=medieval] .warp-stage-bg::after { background: radial-gradient(ellipse 55% 45% at 50% 40%, rgba(230, 150, 60, .16), transparent 70%), radial-gradient(ellipse at center, transparent 40%, rgba(5, 3, 1, .85) 100%); }
.warp-stage[data-style=medieval][data-mode=date] .warp-stage-bg::before { background: linear-gradient(rgba(40, 12, 12, .72), rgba(20, 8, 8, .86)), var(--st-wood, none) 0 0 / 256px, #3b1d14; }
.warp-stage[data-style=medieval][data-mode=date] .warp-stage-bg::after { background: radial-gradient(ellipse 40% 35% at 50% 42%, rgba(255, 180, 90, .2), transparent 70%), radial-gradient(ellipse at center, transparent 40%, rgba(8, 2, 2, .85) 100%); }
/* sci-fi: a dark panel with a faint grid, a cool light from above */
.warp-stage[data-style=scifi] .warp-stage-bg::before { background: radial-gradient(ellipse 60% 40% at 50% 0%, rgba(94, 200, 229, .09), transparent 70%), var(--st-panel-tex, none) 0 0 / 256px, #070c13; }
.warp-stage[data-style=scifi] .warp-stage-bg::after { background: radial-gradient(ellipse at center, transparent 45%, rgba(0, 0, 0, .7) 100%); }
.warp-stage[data-style=scifi][data-mode=date] .warp-stage-bg::before { background: radial-gradient(circle at 20% 25%, hsl(var(--warp-hue, 330) 70% 50% / .12), transparent 40%), radial-gradient(circle at 80% 70%, rgba(94, 200, 229, .08), transparent 40%), var(--st-panel-tex, none) 0 0 / 256px, #070c13; }
/* the date's picture: the place, with them in the middle */
.warp-stage-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; animation: warp-stage-in 600ms ease both; }
.warp-stage-bg.has-photo::before { display: none; }
.warp-stage .warp-stage-bg.has-photo::after { background: linear-gradient(90deg, rgba(0, 0, 0, .35), transparent 28%, transparent 68%, rgba(0, 0, 0, .4)), linear-gradient(0deg, rgba(0, 0, 0, .45), transparent 38%); }
.warp-stage:has(.has-photo) .warp-stage-menu-col > .warp-stage-kicker { color: #fff; text-shadow: 0 1px 4px rgba(0, 0, 0, .7); }
.warp-stage:has(.has-photo) .warp-stage-top { --st-ink: #fff; --st-muted: rgba(255, 255, 255, .8); --st-dim: rgba(255, 255, 255, .6); --st-line: rgba(255, 255, 255, .25); color: #fff; text-shadow: 0 1px 6px rgba(0, 0, 0, .5); }

/* ── top bar ── */
.warp-stage-top { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 18px;
  padding: calc(14px + env(safe-area-inset-top, 0px)) 24px 14px; border-bottom: 1px solid var(--st-line); }
.warp-stage-title { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.warp-stage-title h1 { margin: 0; font-family: var(--st-display); font-weight: 800; font-size: 26px; line-height: 1.1; letter-spacing: -.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.warp-stage-mid { display: flex; align-items: center; gap: 18px; min-width: 0; flex-wrap: wrap; }
.warp-stage-actions { display: flex; align-items: center; gap: 8px; }
.warp-stage-actions:has(.warp-stage-painting) { flex-wrap: wrap; justify-content: flex-end; max-width: min(320px, 35vw); }
.warp-stage-painting { overflow-wrap: anywhere; min-width: 0; }
.warp-stage[data-style=medieval] .warp-stage-top { border-bottom: 0; background: linear-gradient(rgba(30, 18, 8, .55), rgba(20, 12, 5, .7)), var(--st-wood, none) 0 0 / 256px, #3b2414;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, .6), 0 1px 0 #b48a2c, 0 2px 0 #4a2e16, 0 3px 0 rgba(180, 138, 44, .55), 0 12px 24px rgba(0, 0, 0, .45); }
.warp-stage[data-style=medieval] .warp-stage-title h1 { font-weight: 700; letter-spacing: .07em; font-size: 25px; color: #ecdfbf; text-shadow: 0 2px 0 rgba(0, 0, 0, .5); }
.warp-stage[data-style=scifi] .warp-stage-top { background: linear-gradient(180deg, rgba(10, 18, 28, .92), rgba(10, 18, 28, .7)); border-bottom-color: rgba(94, 200, 229, .3); }
.warp-stage[data-style=scifi] .warp-stage-title h1 { font-weight: 600; text-transform: uppercase; letter-spacing: .1em; font-size: 22px; }

/* buttons */
.warp-stage :is(.warp-stage-btn, .warp-btn) { cursor: pointer; border-radius: var(--st-btn-radius); padding: 7px 14px; border: 1px solid var(--st-line); background: transparent; color: var(--st-ink); font-weight: 600; font-size: 13px; transition: background 120ms, border-color 120ms, transform 120ms, color 120ms; white-space: nowrap; }
.warp-stage :is(.warp-stage-btn, .warp-btn):hover:not(:disabled) { border-color: var(--st-ink); }
.warp-stage :is(.warp-stage-btn, .warp-btn):active:not(:disabled) { transform: translateY(1px); }
.warp-stage :is(.warp-stage-btn, .warp-btn):disabled { opacity: .45; cursor: not-allowed; }
.warp-stage .warp-stage-btn.ghost { border-color: transparent; color: var(--st-muted); }
.warp-stage .warp-stage-btn.ghost:hover:not(:disabled) { color: var(--st-ink); border-color: var(--st-line); }
.warp-stage :is(.warp-stage-btn.primary, .warp-btn-primary) { background: var(--st-primary); color: var(--st-primary-ink); border-color: transparent; }
.warp-stage :is(.warp-stage-btn.primary, .warp-btn-primary):hover:not(:disabled) { filter: brightness(1.12); border-color: transparent; }
.warp-stage .warp-stage-btn.small, .warp-stage .warp-btn.warp-mini { padding: 3px 10px; font-size: 12px; }
.warp-stage :is(.warp-stage-btn, .warp-btn, .warp-stage-cmd, .warp-stage-bar, .warp-dg-tile, .warp-stage-chip):focus-visible { outline: 2px solid var(--st-accent); outline-offset: 2px; }
.warp-stage[data-style=modern] :is(.warp-stage-btn, .warp-btn):not(.primary):not(.warp-btn-primary):not(.ghost) { background: #fff; color: var(--sp-ink); text-shadow: none; border-color: rgba(29, 29, 31, .12); box-shadow: 0 1px 2px rgba(0, 0, 0, .05); }
.warp-stage[data-style=medieval] :is(.warp-stage-btn, .warp-btn) { font-family: var(--st-display); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; padding: 8px 14px; }
.warp-stage[data-style=medieval] :is(.warp-stage-btn, .warp-btn):not(.primary):not(.warp-btn-primary) { border-color: rgba(180, 138, 44, .55); }
.warp-stage[data-style=medieval] :is(.warp-stage-btn.primary, .warp-btn-primary) { border: 1px solid #5e140c; box-shadow: inset 0 0 0 2px var(--st-primary), inset 0 0 0 3px rgba(233, 196, 106, .7), 0 2px 4px rgba(0, 0, 0, .35); }
.warp-stage[data-style=medieval] .warp-stage-btn.ghost { border-color: transparent; text-transform: none; font-family: var(--st-ui); font-style: italic; font-size: 15px; letter-spacing: 0; font-weight: 500; }
.warp-stage[data-style=scifi] :is(.warp-stage-btn, .warp-btn) { font-family: var(--st-num); font-size: 11.5px; letter-spacing: .12em; text-transform: uppercase; font-weight: 500; border-color: rgba(94, 200, 229, .4); color: var(--st-accent);
  clip-path: polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px); }
.warp-stage[data-style=scifi] :is(.warp-stage-btn, .warp-btn):hover:not(:disabled) { background: var(--st-accent-soft); border-color: var(--st-accent); }
.warp-stage[data-style=scifi] :is(.warp-stage-btn.primary, .warp-btn-primary) { color: var(--st-primary-ink); font-weight: 600; }
.warp-stage[data-style=scifi] .warp-stage-btn.ghost { color: var(--st-muted); border-color: transparent; }

/* dungeon: depth, level, gold */
.warp-stage-depth { display: flex; flex-direction: column; align-items: center; gap: 5px; }
.warp-stage-depth-n { font-family: var(--st-display); font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
.warp-stage-of { color: var(--st-dim); font-size: 13px; font-weight: 500; }
.warp-stage-pips { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; max-width: 240px; }
.warp-stage-pips i { width: 7px; height: 7px; border-radius: 50%; background: var(--st-track); }
.warp-stage-pips i.past { background: var(--st-muted); }
.warp-stage-pips i.now { background: var(--st-accent); transform: scale(1.3); }
.warp-stage-pips i.last { box-shadow: 0 0 0 1.5px var(--warp-bad); }
.warp-stage[data-style=medieval] .warp-stage-pips i { border-radius: 0; transform: rotate(45deg); background: transparent; box-shadow: inset 0 0 0 1px rgba(214, 181, 106, .5); }
.warp-stage[data-style=medieval] .warp-stage-pips i.past { background: rgba(214, 181, 106, .5); }
.warp-stage[data-style=medieval] .warp-stage-pips i.now { background: #e9c46a; transform: rotate(45deg) scale(1.3); }
.warp-stage[data-style=medieval] .warp-stage-pips i.last { box-shadow: inset 0 0 0 1px #d9786c; }
.warp-stage[data-style=scifi] .warp-stage-pips { gap: 2px; }
.warp-stage[data-style=scifi] .warp-stage-pips i { border-radius: 0; width: 10px; height: 4px; }
.warp-stage[data-style=scifi] .warp-stage-pips i.now { transform: none; box-shadow: 0 0 6px var(--st-accent); }
.warp-stage-endless { font-size: 16px; color: var(--st-muted); }
.warp-stage-boss { color: var(--warp-bad); font-size: 14px; }
.warp-stage-purse { display: flex; align-items: center; gap: 10px; font-variant-numeric: tabular-nums; font-family: var(--st-num); }
.warp-stage-lv { font-weight: 700; font-size: 13px; letter-spacing: .04em; }
.warp-stage-xp { width: 90px; height: 5px; border-radius: 3px; background: var(--st-track); overflow: hidden; }
.warp-stage-xp > span { display: block; height: 100%; background: var(--st-xp); transition: width 400ms ease; }
.warp-stage-gold { display: inline-flex; align-items: center; gap: 4px; font-weight: 700; color: var(--st-gold); }
.warp-stage-coin { width: 20px; height: 20px; }
.warp-stage[data-style=medieval] .warp-stage-xp { border-radius: 0; background: rgba(0, 0, 0, .4); box-shadow: 0 0 0 1px rgba(214, 181, 106, .5); }
.warp-stage[data-style=medieval] .warp-stage-lv, .warp-stage[data-style=medieval] .warp-stage-depth-n { font-family: var(--st-display); color: #ecdfbf; }
.warp-stage[data-style=scifi] .warp-stage-xp { border-radius: 0; }

/* bars (HP, MP, TP) */
.warp-stage .warp-dg-bar { font-size: 11px; grid-template-columns: 22px 1fr 34px; font-family: var(--st-num); }
.warp-stage .warp-dg-bar-l { color: var(--st-dim); font-weight: 600; letter-spacing: .04em; }
.warp-stage .warp-dg-bar-track { height: 6px; background: var(--st-track); border-radius: 3px; }
.warp-stage .warp-dg-bar-track > div { border-radius: 3px; }
.warp-stage .warp-dg-bar.hp .warp-dg-bar-track > div { background: var(--st-hp); }
.warp-stage .warp-dg-bar.mp .warp-dg-bar-track > div { background: var(--st-mp); }
.warp-stage .warp-dg-bar.tp .warp-dg-bar-track > div { background: var(--st-tp); }
.warp-stage[data-style=medieval] .warp-dg-bar { font-family: var(--st-display); font-size: 10px; }
.warp-stage[data-style=medieval] .warp-dg-bar-n { font-family: var(--st-num); font-size: 13px; }
.warp-stage[data-style=medieval] .warp-dg-bar-track { border-radius: 0; height: 7px; box-shadow: inset 0 0 0 1px rgba(74, 52, 28, .35); }
.warp-stage[data-style=medieval] .warp-dg-bar-track > div { border-radius: 0; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .2); }
.warp-stage[data-style=scifi] .warp-dg-bar-track { border-radius: 0; height: 5px; }
.warp-stage[data-style=scifi] .warp-dg-bar-track > div { border-radius: 0; -webkit-mask: repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 6px); mask: repeating-linear-gradient(90deg, #000 0 5px, transparent 5px 6px); }

/* ── main ── */
.warp-stage-main { position: relative; z-index: 1; min-height: 0; padding: 18px 24px; }
.warp-stage-run { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 360px); gap: 22px; }
.warp-stage-map { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
.warp-stage-board { flex: 1; min-height: 0; width: 100%; container-type: size; display: grid; place-items: center; }

/* the board */
.warp-stage-board .warp-dg-board { width: min(100cqw, 100cqh); height: min(100cqw, 100cqh); grid-auto-rows: 1fr; gap: 6px; padding: 10px; border-radius: 20px;
  background: #fff; box-shadow: 0 0 0 1px rgba(29, 29, 31, .06), 0 18px 48px rgba(30, 25, 15, .1); }
.warp-stage .warp-dg-tile { aspect-ratio: auto; position: relative; overflow: hidden; border: 0; border-radius: 9px; background: #fbfaf7; box-shadow: inset 0 0 0 1px rgba(29, 29, 31, .07); transition: filter 160ms, transform 160ms, box-shadow 160ms, background 160ms; filter: none; }
.warp-stage .warp-dg-tile::before { content: ""; position: absolute; inset: 0; background: var(--tile) 0 0 / 100% 100%; image-rendering: pixelated; opacity: .1; filter: grayscale(1); }
.warp-stage .warp-dg-tile > * { position: relative; }
.warp-stage .warp-dg-tile.hidden { background: #e6e3dc; box-shadow: none; }
.warp-stage .warp-dg-tile.hidden::before { display: none; }
.warp-stage .warp-dg-tile.reachable { cursor: pointer; outline: 0; box-shadow: inset 0 0 0 2px var(--st-accent); background: #fff5f1; }
.warp-stage .warp-dg-tile.reachable.hidden { background: radial-gradient(circle, rgba(255, 90, 54, .35) 0 3px, transparent 3.5px), #fbe9e3; filter: none; }
.warp-stage .warp-dg-tile.reachable:hover { transform: translateY(-2px); box-shadow: inset 0 0 0 2px var(--st-accent), 0 6px 14px rgba(255, 90, 54, .2); filter: none; }
.warp-stage .warp-dg-tile.here { outline: 0; box-shadow: inset 0 0 0 2.5px var(--st-ink); background: #fff; z-index: 1; }
.warp-stage .warp-dg-tile.here .warp-dg-icon { animation: warp-stage-bob 1.8s ease-in-out infinite; }
.warp-stage .warp-dg-icon { width: 72%; height: 72%; }
.warp-stage .warp-dg-icon.danger { filter: none; }
@keyframes warp-stage-bob { 50% { transform: translateY(-4%); } }
/* medieval: an oak frame with gilt rules; flagstones for the unknown, the floor in candlelight */
.warp-stage[data-style=medieval] .warp-stage-board .warp-dg-board { border-radius: 3px; gap: 3px; padding: 8px; background: #1a120a;
  box-shadow: 0 0 0 2px #b48a2c, 0 0 0 8px #4a2e16, 0 0 0 9px #b48a2c, 0 26px 60px rgba(0, 0, 0, .7); }
.warp-stage[data-style=medieval] .warp-dg-tile { border-radius: 1px; background: var(--tile) 0 0 / 100% 100%; filter: sepia(.4) saturate(.8) brightness(.92); box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .55), inset 0 0 14px rgba(0, 0, 0, .45); }
.warp-stage[data-style=medieval] .warp-dg-tile::before { display: none; }
.warp-stage[data-style=medieval] .warp-dg-tile.hidden { background: radial-gradient(ellipse at 30% 22%, rgba(255, 232, 190, .08), transparent 62%), linear-gradient(rgba(30, 22, 13, .6), rgba(18, 13, 8, .74)), var(--st-stone, none) 0 0 / 96px, #2b241b; filter: none;
  box-shadow: inset 1px 1px 0 rgba(255, 238, 205, .12), inset -1px -1px 0 rgba(0, 0, 0, .7), inset 0 0 12px rgba(0, 0, 0, .4); }
.warp-stage[data-style=medieval] .warp-dg-tile.reachable { box-shadow: inset 0 0 0 2px #d6b56a, inset 0 0 18px rgba(233, 196, 106, .35); filter: sepia(.25) brightness(1.02); }
.warp-stage[data-style=medieval] .warp-dg-tile.reachable.hidden { background: radial-gradient(ellipse at 50% 50%, rgba(255, 190, 100, .18), transparent 70%), linear-gradient(rgba(48, 32, 14, .58), rgba(30, 20, 9, .72)), var(--st-stone, none) 0 0 / 96px, #3a2e1e; }
.warp-stage[data-style=medieval] .warp-dg-tile.reachable:hover { box-shadow: inset 0 0 0 2px #e9c46a, inset 0 0 24px rgba(233, 196, 106, .55); filter: sepia(.15) brightness(1.12); }
.warp-stage[data-style=medieval] .warp-dg-tile.here { filter: none; box-shadow: inset 0 0 0 2px #f3e2b0, inset 0 0 26px rgba(255, 200, 110, .55); }
/* sci-fi: a tactical grid; the floor shows as a dim scan, the unknown is blank */
.warp-stage[data-style=scifi] .warp-stage-board .warp-dg-board { border-radius: 0; gap: 3px; padding: 10px; background: rgba(6, 12, 20, .85);
  box-shadow: inset 0 0 0 1px rgba(94, 200, 229, .22), 0 24px 60px rgba(0, 0, 0, .6);
  clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px); }
.warp-stage[data-style=scifi] .warp-dg-tile { border-radius: 0; background: #0f1b29; box-shadow: inset 0 0 0 1px rgba(120, 170, 210, .14); }
.warp-stage[data-style=scifi] .warp-dg-tile::before { opacity: .32; filter: grayscale(1) brightness(.7) contrast(1.2); mix-blend-mode: luminosity; }
.warp-stage[data-style=scifi] .warp-dg-tile.hidden { background: repeating-linear-gradient(135deg, rgba(120, 170, 210, .04) 0 2px, transparent 2px 7px), #0a131e; box-shadow: inset 0 0 0 1px rgba(120, 170, 210, .08); }
.warp-stage[data-style=scifi] .warp-dg-tile.reachable { background: rgba(94, 200, 229, .08); box-shadow: inset 0 0 0 1px rgba(94, 200, 229, .5); }
.warp-stage[data-style=scifi] .warp-dg-tile.reachable::after { content: ""; position: absolute; inset: 3px; pointer-events: none;
  background: linear-gradient(var(--st-accent), var(--st-accent)) top left / 8px 1.5px no-repeat, linear-gradient(var(--st-accent), var(--st-accent)) top left / 1.5px 8px no-repeat,
    linear-gradient(var(--st-accent), var(--st-accent)) bottom right / 8px 1.5px no-repeat, linear-gradient(var(--st-accent), var(--st-accent)) bottom right / 1.5px 8px no-repeat; }
.warp-stage[data-style=scifi] .warp-dg-tile.reachable:hover { background: rgba(94, 200, 229, .16); box-shadow: inset 0 0 0 1px var(--st-accent); }
.warp-stage[data-style=scifi] .warp-dg-tile.here { background: rgba(94, 200, 229, .14); box-shadow: inset 0 0 0 1.5px var(--st-accent), inset 0 0 16px rgba(94, 200, 229, .25); }

.warp-stage-bag { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; justify-content: center; }
.warp-stage-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px 4px 8px; border-radius: var(--st-btn-radius) !important; cursor: pointer; font-size: 12.5px; }
.warp-stage-chip b { font-family: var(--st-num); }
.warp-stage-chip:hover:not(:disabled) { box-shadow: var(--sp-edge), 0 0 0 1.5px var(--st-accent) !important; }
.warp-stage-chip.muted { cursor: default; color: var(--st-muted); }
.warp-stage[data-style=medieval] .warp-stage-chip { font-size: 14px; padding: 3px 12px 3px 8px; }
.warp-stage[data-style=scifi] .warp-stage-chip { font-family: var(--st-num); font-size: 11.5px; }
.warp-stage-loot { font-size: 12px; color: var(--st-muted); }
.warp-stage[data-style=medieval] .warp-stage-loot { font-style: italic; font-size: 14px; }
.warp-stage-side { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; padding: 2px 4px 2px 2px; scrollbar-width: thin; }
.warp-stage-party { display: flex; flex-direction: column; gap: 8px; }
.warp-stage-party.row { flex-direction: row; flex-wrap: wrap; }
.warp-stage-party.row > * { flex: 1 1 150px; }
.warp-stage .warp-dg-member { padding: 10px 12px; gap: 5px; }
.warp-stage .warp-dg-member-head b { font-family: var(--st-display); font-weight: 700; font-size: 14px; }
.warp-stage[data-style=scifi] .warp-dg-member-head b { font-weight: 600; letter-spacing: .04em; text-transform: uppercase; font-size: 12.5px; }
.warp-stage .warp-dg-member.active { box-shadow: var(--sp-edge), 0 0 0 2px var(--st-accent), var(--sp-shadow); }
.warp-stage .warp-dg-member.targetable { cursor: pointer; box-shadow: var(--sp-edge), 0 0 0 2px var(--warp-good), var(--sp-shadow); animation: warp-stage-pulse 1.4s ease-in-out infinite; }
.warp-stage .warp-dg-member.down { opacity: .5; filter: grayscale(.8); }
.warp-stage .warp-dg-face { width: 36px; height: 36px; }
.warp-stage-here { display: flex; flex-direction: column; gap: 10px; }
.warp-stage-here > div { padding: 14px; }
.warp-stage-here .warp-dg-event p { font-family: var(--st-story); font-size: 15.5px; line-height: 1.55; margin: 0 0 12px; }
.warp-stage-here .warp-dg-event { box-shadow: var(--sp-edge), inset 3px 0 0 var(--st-accent), var(--sp-shadow); }
.warp-stage-here .warp-dg-event.romance { box-shadow: var(--sp-edge), inset 3px 0 0 var(--st-love), var(--sp-shadow); }
.warp-stage[data-style=medieval] .warp-stage-here .warp-dg-event p { font-size: 17px; }
.warp-stage[data-style=medieval] .warp-stage-here .warp-dg-event p::first-letter { float: left; font-family: var(--st-display); font-weight: 700; font-size: 2.6em; line-height: .85; margin: 4px 6px 0 0; color: var(--st-accent); }
.warp-stage[data-style=medieval] .warp-stage-here .warp-dg-event, .warp-stage[data-style=medieval] .warp-stage-here .warp-dg-event.romance { box-shadow: var(--sp-edge), var(--sp-shadow); }
.warp-stage-here .warp-dg-actions { gap: 8px; }
.warp-stage-here h3 { margin: 0 0 8px; font-family: var(--st-display); font-size: 16px; }
.warp-stage-here .warp-dg-ware { padding: 6px 0; border-top: 1px solid var(--st-line); }
.warp-stage-here .warp-dg-ware:first-of-type { border-top: 0; }
.warp-stage .warp-money { color: var(--st-gold); }
.warp-stage :is(.warp-stage-here, .warp-stage-gate) .warp-money { color: var(--warp-warn); }
.warp-stage-log { font-size: 12.5px; color: var(--st-muted); display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--st-line); padding-top: 10px; }
.warp-stage-log > div:first-child { color: var(--st-ink); }
.warp-stage[data-style=medieval] .warp-stage-log { font-size: 14.5px; font-style: italic; border-top: 0; padding-top: 6px; background: linear-gradient(90deg, transparent, rgba(214, 181, 106, .5), transparent) top / 100% 1px no-repeat; }
.warp-stage[data-style=medieval] .warp-stage-log > div:first-child { font-style: normal; }
.warp-stage[data-style=scifi] .warp-stage-log { font-family: var(--st-num); font-size: 11.5px; }
.warp-stage[data-style=scifi] .warp-stage-log > div::before { content: "› "; color: var(--st-accent); }
.warp-stage-menu-note { display: flex; align-items: center; gap: 10px; color: var(--st-muted); }
.warp-stage-menu-note.warn { color: var(--warp-warn); font-weight: 600; }

/* battle */
.warp-stage-battle { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); gap: 18px; }
.warp-stage:has(.warp-stage-battle) .warp-stage-story { max-height: 24dvh; }
.warp-stage-arena { position: relative; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 8px; min-height: 0; border-radius: 20px; padding: 14px 18px;
  background: radial-gradient(ellipse 60% 22% at 50% 78%, rgba(29, 29, 31, .07), transparent 70%), linear-gradient(180deg, #fff 0%, #fbfaf7 62%, #efece5 62.2%, #f4f2ed 100%);
  box-shadow: 0 0 0 1px rgba(29, 29, 31, .06), 0 18px 48px rgba(30, 25, 15, .1); }
.warp-stage-arena.boss { box-shadow: 0 0 0 2px rgba(217, 58, 58, .35), 0 18px 48px rgba(30, 25, 15, .1); }
.warp-stage[data-style=medieval] .warp-stage-arena { border-radius: 3px; background: radial-gradient(ellipse 50% 40% at 50% 45%, rgba(255, 170, 80, .16), transparent 70%), linear-gradient(rgba(20, 14, 8, .55), rgba(10, 7, 4, .8)), var(--st-stone, none) 0 0 / 140px, #2b241b;
  box-shadow: 0 0 0 2px #b48a2c, 0 0 0 8px #4a2e16, 0 0 0 9px #b48a2c, 0 26px 60px rgba(0, 0, 0, .7), inset 0 -70px 80px rgba(0, 0, 0, .5); color: #ecdfbf; }
.warp-stage[data-style=medieval] .warp-stage-arena.boss { box-shadow: 0 0 0 2px #b5413a, 0 0 0 8px #4a2e16, 0 0 0 9px #b5413a, 0 26px 60px rgba(0, 0, 0, .7), inset 0 -70px 80px rgba(0, 0, 0, .5); }
.warp-stage[data-style=scifi] .warp-stage-arena { border-radius: 0; background:
    linear-gradient(180deg, transparent 60%, rgba(94, 200, 229, .05) 60%),
    repeating-linear-gradient(90deg, rgba(94, 200, 229, .07) 0 1px, transparent 1px 48px) bottom / 100% 40% no-repeat,
    rgba(6, 12, 20, .8);
  box-shadow: inset 0 0 0 1px rgba(94, 200, 229, .22); clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); }
.warp-stage[data-style=scifi] .warp-stage-arena.boss { box-shadow: inset 0 0 0 1px rgba(239, 100, 97, .5); }
.warp-stage-arena-head { display: flex; justify-content: space-between; align-items: baseline; }
.warp-stage-round { font-family: var(--st-display); font-size: 15px; font-weight: 700; color: var(--st-muted); }
.warp-stage[data-style=scifi] .warp-stage-round { font-family: var(--st-num); font-size: 12px; font-weight: 500; letter-spacing: .1em; text-transform: uppercase; }
.warp-stage-foes { display: flex; flex-wrap: wrap; justify-content: center; align-items: flex-end; align-content: center; gap: 22px; min-height: 0; }
.warp-stage-foe { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 150px; padding: 8px; border-radius: 14px; border: 0; background: transparent; }
.warp-stage-foe-glow { position: absolute; left: 18%; right: 18%; bottom: 46px; height: 12px; border-radius: 50%; background: rgba(0, 0, 0, .14); filter: blur(3px); }
.warp-stage[data-style=medieval] .warp-stage-foe-glow, .warp-stage[data-style=scifi] .warp-stage-foe-glow { background: rgba(0, 0, 0, .55); }
.warp-stage-foe-img { position: relative; width: clamp(72px, 15vh, 132px); height: clamp(72px, 15vh, 132px); animation: warp-stage-idle 3.2s ease-in-out infinite; }
.warp-stage-foe:nth-child(2n) .warp-stage-foe-img { animation-delay: -1.1s; }
.warp-stage-foe.elite .warp-stage-foe-img { width: clamp(84px, 18vh, 156px); height: clamp(84px, 18vh, 156px); }
.warp-stage-foe.boss { width: 230px; }
.warp-stage-foe.boss .warp-stage-foe-img { width: clamp(110px, 26vh, 220px); height: clamp(110px, 26vh, 220px); }
.warp-stage-foe.down { opacity: .25; filter: grayscale(1); }
.warp-stage-foe.down .warp-stage-foe-img { animation: none; transform: rotate(-8deg) translateY(8px); }
.warp-stage-foe.targetable { cursor: pointer; box-shadow: 0 0 0 2px var(--warp-bad); background: color-mix(in srgb, var(--warp-bad) 7%, transparent); animation: warp-stage-pulse 1.4s ease-in-out infinite; }
.warp-stage[data-style=medieval] .warp-stage-foe { border-radius: 2px; }
.warp-stage[data-style=scifi] .warp-stage-foe { border-radius: 0; }
.warp-stage[data-style=scifi] .warp-stage-foe.targetable { box-shadow: none; background:
  linear-gradient(var(--warp-bad), var(--warp-bad)) top left / 14px 2px no-repeat, linear-gradient(var(--warp-bad), var(--warp-bad)) top left / 2px 14px no-repeat,
  linear-gradient(var(--warp-bad), var(--warp-bad)) top right / 14px 2px no-repeat, linear-gradient(var(--warp-bad), var(--warp-bad)) top right / 2px 14px no-repeat,
  linear-gradient(var(--warp-bad), var(--warp-bad)) bottom left / 14px 2px no-repeat, linear-gradient(var(--warp-bad), var(--warp-bad)) bottom left / 2px 14px no-repeat,
  linear-gradient(var(--warp-bad), var(--warp-bad)) bottom right / 14px 2px no-repeat, linear-gradient(var(--warp-bad), var(--warp-bad)) bottom right / 2px 14px no-repeat,
  rgba(239, 100, 97, .06); }
.warp-stage-foe-name { font-weight: 700; font-size: 13px; text-align: center; font-family: var(--st-display); }
.warp-stage[data-style=medieval] .warp-stage-foe-name { font-weight: 700; letter-spacing: .05em; color: #ecdfbf; text-shadow: 0 1px 3px #000; }
.warp-stage[data-style=scifi] .warp-stage-foe-name { font-weight: 600; letter-spacing: .08em; text-transform: uppercase; font-size: 11.5px; }
.warp-stage-foe.boss .warp-stage-foe-name { color: var(--warp-bad); }
.warp-stage-foe .warp-dg-bar { width: 100%; }
@keyframes warp-stage-idle { 50% { transform: translateY(-5px); } }
@keyframes warp-stage-pulse { 50% { filter: brightness(1.08); } }
.warp-stage-ticker { display: flex; flex-direction: column; align-items: center; gap: 2px; font-size: 13px; color: var(--st-muted); text-align: center; }
.warp-stage-ticker .new { color: var(--st-ink); font-weight: 600; animation: warp-stage-rise 360ms ease both; }
.warp-stage[data-style=medieval] .warp-stage-ticker { font-size: 15px; font-style: italic; color: #c9b68e; }
.warp-stage[data-style=medieval] .warp-stage-ticker .new { color: #ecdfbf; font-style: normal; }
.warp-stage[data-style=scifi] .warp-stage-ticker { font-family: var(--st-num); font-size: 11.5px; }
@keyframes warp-stage-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.warp-stage-command { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding: 2px; }
.warp-stage-menu { display: flex; flex-direction: column; gap: 8px; padding: 14px; }
.warp-stage-turn { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--st-muted); }
.warp-stage-turn b { color: var(--st-ink); font-family: var(--st-display); }
.warp-stage-turn-face { width: 28px; height: 28px; }
.warp-stage[data-style=medieval] .warp-stage-turn { font-size: 15px; font-style: italic; }
.warp-stage[data-style=medieval] .warp-stage-turn b { font-style: normal; color: var(--st-accent); letter-spacing: .04em; }
.warp-stage-cmds { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 6px; }
.warp-stage-cmds.tail { border-top: 1px solid var(--st-line); padding-top: 8px; }
.warp-stage-cmd { cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--st-line); background: var(--sp-field); text-align: left; font-size: 13px; font-weight: 600; transition: background 120ms, border-color 120ms, transform 120ms, color 120ms; }
.warp-stage-cmd small { font-weight: 500; color: var(--st-dim); font-size: 11px; font-family: var(--st-num); }
.warp-stage-cmd:hover:not(:disabled) { border-color: var(--st-ink); transform: translateY(-1px); }
.warp-stage-cmd:disabled { opacity: .4; cursor: not-allowed; }
.warp-stage-cmd.item span { flex: 1; }
.warp-stage-cmd.flee { color: var(--st-mp); }
/* medieval: entries in a ledger, underlined in ink */
.warp-stage[data-style=medieval] .warp-stage-cmds { gap: 0 14px; }
.warp-stage[data-style=medieval] .warp-stage-cmd { border: 0; border-bottom: 1px dotted rgba(74, 52, 28, .45); border-radius: 0; background: transparent; padding: 6px 2px; font-size: 16px; font-weight: 500; }
.warp-stage[data-style=medieval] .warp-stage-cmd small { font-style: italic; font-size: 13px; font-family: var(--st-ui); }
.warp-stage[data-style=medieval] .warp-stage-cmd:hover:not(:disabled) { color: var(--st-accent); transform: translateX(3px); border-color: var(--st-accent); }
.warp-stage[data-style=medieval] .warp-stage-cmd:hover:not(:disabled) > span::before { content: "❧ "; }
.warp-stage[data-style=medieval] .warp-stage-cmds.tail { border-top: 0; padding-top: 4px; }
.warp-stage[data-style=medieval] .warp-stage-cmds.tail .warp-stage-cmd { font-style: italic; }
/* sci-fi: outlined keys with the cost in mono */
.warp-stage[data-style=scifi] .warp-stage-cmd { border-radius: 0; background: rgba(94, 200, 229, .04); border-color: rgba(94, 200, 229, .22); font-weight: 500; letter-spacing: .02em;
  clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%); }
.warp-stage[data-style=scifi] .warp-stage-cmd:hover:not(:disabled) { border-color: var(--st-accent); background: var(--st-accent-soft); color: #fff; transform: none; }

/* gate */
.warp-stage-gates { display: flex; flex-wrap: wrap; justify-content: center; align-content: safe center; gap: 22px; overflow-y: auto; }
.warp-stage-gate { width: min(460px, 100%); display: flex; flex-direction: column; gap: 12px; padding: 24px; }
.warp-stage-gate-head { display: flex; align-items: center; gap: 14px; }
.warp-stage-gate-icon { width: 56px; height: 56px; }
.warp-stage-gate h2 { margin: 0; font-family: var(--st-display); font-size: 24px; font-weight: 800; letter-spacing: -.01em; }
.warp-stage-gate p { margin: 0; }
.warp-stage-mates { display: flex; flex-direction: column; gap: 6px; }
.warp-stage-mate { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--st-line); cursor: pointer; }
.warp-stage-mate.on { border-color: var(--st-accent); background: var(--st-accent-soft); }
.warp-stage-mate input { accent-color: var(--st-accent); }
.warp-stage-mate-name { font-weight: 600; flex: 1; }
.warp-stage-gate .warp-stage-btn.primary { align-self: flex-start; padding: 10px 18px; font-size: 14px; }
.warp-stage[data-style=medieval] .warp-stage-gate { padding: 30px 30px 26px; }
.warp-stage[data-style=medieval] .warp-stage-gate h2 { font-weight: 700; letter-spacing: .05em; font-size: 23px; }
.warp-stage[data-style=medieval] .warp-stage-gate-icon { filter: sepia(.5); }
.warp-stage[data-style=medieval] .warp-stage-gate > p:not(.warp-stage-dim)::first-letter { float: left; font-family: var(--st-display); font-weight: 700; font-size: 2.7em; line-height: .85; margin: 4px 6px 0 0; color: var(--st-accent); }
.warp-stage[data-style=medieval] .warp-stage-gate .warp-stage-dim { font-style: italic; font-size: 14px; }
.warp-stage[data-style=medieval] .warp-stage-mate { border-radius: 0; border-width: 0 0 1px; border-style: dotted; padding: 6px 2px; }
.warp-stage[data-style=medieval] .warp-stage-mate.on { background: transparent; color: var(--st-accent); }
.warp-stage[data-style=scifi] .warp-stage-gate h2 { font-weight: 600; text-transform: uppercase; letter-spacing: .08em; font-size: 20px; }
.warp-stage[data-style=scifi] .warp-stage-mate { border-radius: 0; }

/* ── date ── */
.warp-stage-ladder { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 2px; }
.warp-stage-ladder li { position: relative; font-size: 11.5px; letter-spacing: .02em; color: var(--st-dim); padding: 4px 10px; border-radius: 999px; white-space: nowrap; font-weight: 600; }
.warp-stage-ladder li + li::before { content: ""; position: absolute; left: -5px; top: 50%; width: 8px; height: 1px; background: var(--st-line); }
.warp-stage-ladder li.past { color: var(--st-muted); }
.warp-stage-ladder li.now { color: var(--st-accent-ink); background: var(--st-accent); }
.warp-stage-ladder li.hostile { background: var(--warp-bad); color: #fff; }
.warp-stage[data-style=medieval] .warp-stage-ladder { gap: 4px; }
.warp-stage[data-style=medieval] .warp-stage-ladder li { font-family: var(--st-display); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; border-radius: 0; padding: 4px 12px; }
.warp-stage[data-style=medieval] .warp-stage-ladder li + li::before { content: "·"; width: auto; height: auto; background: none; top: 3px; left: -5px; color: var(--st-dim); }
.warp-stage[data-style=medieval] .warp-stage-ladder li.now { background: var(--st-accent); color: #f6e7c8; clip-path: polygon(0 0, 100% 0, calc(100% - 6px) 50%, 100% 100%, 0 100%, 6px 50%); padding: 4px 16px; }
.warp-stage[data-style=scifi] .warp-stage-ladder li { font-family: var(--st-num); font-size: 10.5px; letter-spacing: .1em; text-transform: uppercase; border-radius: 0; font-weight: 500; }
.warp-stage[data-style=scifi] .warp-stage-ladder li.now { background: transparent; color: var(--st-accent); box-shadow: inset 0 -2px 0 var(--st-accent); }
.warp-stage-date { display: grid; grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(260px, 360px); grid-template-rows: minmax(0, 1fr); gap: 20px; align-items: stretch; }
.warp-stage-painting { font-size: 12px; color: var(--st-muted); padding: 4px 10px; border-radius: 999px; border: 1px dashed var(--st-line); animation: warp-stage-dot 1.6s ease-in-out infinite; }
.warp-stage-painting.error { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; border-radius: 8px; animation: none; }
.warp-stage-painting summary { cursor: pointer; }
.warp-stage-picture-error { position: absolute; top: 100%; right: 14px; width: min(360px, calc(100vw - 28px)); max-height: min(180px, 28dvh); overflow-y: auto; padding: 14px; margin-top: 8px; background: var(--sp-bg); color: var(--sp-ink); border-radius: var(--sp-radius); box-shadow: var(--sp-edge), var(--sp-shadow); text-shadow: none; }
.warp-stage-top:has(.warp-stage-painting details[open]) { z-index: 4; }
.warp-stage-left { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding: 2px; }
.warp-stage-center { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; min-height: 0; }
.warp-stage-corner { display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; }
.warp-stage-clock { font-size: 13px; color: var(--st-muted); }
.warp-stage-clock b { color: var(--st-ink); font-size: 16px; font-variant-numeric: tabular-nums; font-family: var(--st-num); }
.warp-stage-where { font-family: var(--st-display); font-size: 15px; font-weight: 700; }
.warp-stage-where:empty { display: none; }
.warp-stage-cash { font-weight: 700; color: var(--warp-warn); font-variant-numeric: tabular-nums; font-family: var(--st-num); }
.warp-stage[data-style=medieval] .warp-stage-where { font-weight: 700; letter-spacing: .05em; font-size: 14px; }
.warp-stage[data-style=medieval] .warp-stage-clock { font-style: italic; font-size: 15px; }
.warp-stage[data-style=scifi] .warp-stage-where { font-weight: 600; text-transform: uppercase; letter-spacing: .08em; font-size: 13px; }
.warp-stage-stats { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; padding: 12px 14px; font-size: 12.5px; }
.warp-stage-stats dt { color: var(--st-dim); }
.warp-stage-stats dd { margin: 0; display: flex; align-items: center; gap: 8px; justify-content: flex-end; text-align: right; }
.warp-stage-stats dd.love { color: var(--st-love); font-weight: 600; }
.warp-stage-stats dd.hot { color: var(--warp-warn); font-weight: 700; }
.warp-stage[data-style=medieval] .warp-stage-stats { font-size: 15px; gap: 4px 12px; }
.warp-stage[data-style=medieval] .warp-stage-stats dt { font-family: var(--st-display); font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; align-self: center; color: var(--st-muted); }
.warp-stage[data-style=scifi] .warp-stage-stats { font-family: var(--st-num); font-size: 11.5px; }
.warp-stage[data-style=scifi] .warp-stage-stats dt { text-transform: uppercase; letter-spacing: .1em; }
.warp-stage-mini { width: 60px; height: 5px; border-radius: 3px; background: var(--st-track); overflow: hidden; flex: none; }
.warp-stage-mini i { display: block; height: 100%; background: var(--st-love); }
.warp-stage-mini.fear i { background: var(--st-fear); }
.warp-stage[data-style=medieval] .warp-stage-mini, .warp-stage[data-style=scifi] .warp-stage-mini { border-radius: 0; }
.warp-stage-menu-col { display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-height: 0; max-height: 100%; overflow-y: auto; padding: 2px 2px 8px 12px; scrollbar-width: thin; }
.warp-stage-menu-col > .warp-stage-kicker { align-self: flex-end; margin-bottom: 2px; }
/* the menu: modern rows on white */
.warp-stage-bar { cursor: pointer; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 40px; padding: 8px 14px; border: 0; border-radius: 12px; color: var(--sp-ink); font-size: 14px; font-weight: 600; text-align: left;
  background: var(--sp-bg); box-shadow: var(--sp-edge), 0 1px 2px rgba(0, 0, 0, .04); transition: transform 120ms, background 120ms, box-shadow 120ms, color 120ms; }
.warp-stage .warp-stage-bar { color: var(--sp-ink); }
.warp-stage-bar > span:not(.warp-stage-bar-n):not(.warp-stage-bar-react) { flex: 1; min-width: 0; }
.warp-stage-bar:hover:not(:disabled) { transform: translateX(-4px); box-shadow: var(--sp-edge), 0 0 0 1.5px var(--st-accent), 0 6px 16px rgba(0, 0, 0, .08); }
.warp-stage[data-style] .warp-stage-bar:disabled { cursor: not-allowed; background: var(--sp-ghost); color: var(--st-muted); box-shadow: inset 0 0 0 1px var(--st-line); backdrop-filter: blur(4px); }
.warp-stage[data-style] .warp-stage-bar:disabled .warp-stage-bar-n { background: none; color: var(--st-dim); }
.warp-stage-bar-n { display: inline-grid; place-items: center; min-width: 22px; height: 22px; border-radius: 50%; background: rgba(29, 29, 31, .06); color: var(--sp-muted); font-size: 11.5px; font-variant-numeric: tabular-nums; font-family: var(--st-num); }
.warp-stage-bar small { font-size: 11px; padding: 0 7px; border-radius: 999px; background: rgba(29, 29, 31, .06); color: var(--sp-muted); font-family: var(--st-num); }
.warp-stage-bar-react { font-size: 12px; font-weight: 800; }
.warp-stage-bar-react.dim { color: var(--sp-dim); }
.warp-stage-bar.move { box-shadow: var(--sp-edge), inset 3px 0 0 var(--st-gold), 0 1px 2px rgba(0, 0, 0, .04); }
.warp-stage-bar.move.special { box-shadow: var(--sp-edge), inset 3px 0 0 var(--st-love), 0 1px 2px rgba(0, 0, 0, .04); }
.warp-stage-bar.back { min-height: 32px; font-size: 12.5px; color: var(--st-muted); box-shadow: none; background: transparent; }
.warp-stage-bar.back:hover:not(:disabled) { color: var(--st-ink); box-shadow: none; }
.warp-stage-bar .warp-choice-odds { font-family: var(--st-num); }
.warp-stage-bar { --warp-good: var(--sp-good); --warp-warn: var(--sp-warn); --warp-bad: var(--sp-bad); }
/* medieval: parchment slips, numbered in red */
.warp-stage[data-style=medieval] .warp-stage-bar { border-radius: 2px; font-weight: 500; font-size: 16px; padding: 7px 14px; box-shadow: var(--sp-edge), 0 4px 10px rgba(0, 0, 0, .35); }
.warp-stage[data-style=medieval] .warp-stage-bar:hover:not(:disabled) { color: var(--st-accent); box-shadow: var(--sp-edge), 0 0 0 1px #d6b56a, 0 6px 14px rgba(0, 0, 0, .45); }
.warp-stage[data-style=medieval] .warp-stage-bar-n { background: none; border-radius: 0; min-width: 18px; color: var(--st-accent); font-family: var(--st-display); font-weight: 700; font-size: 13px; }
.warp-stage[data-style=medieval] .warp-stage-bar small { background: none; font-style: italic; font-size: 13px; }
.warp-stage[data-style=medieval] .warp-stage-bar.move { font-style: italic; }
.warp-stage[data-style=medieval] .warp-stage-bar.back { background: transparent; box-shadow: none; color: #c9b68e; font-style: italic; }
.warp-stage[data-style=medieval] .warp-stage-bar.back:hover:not(:disabled) { color: #ecdfbf; }
/* sci-fi: dark rows with a cut corner and a two-digit index */
.warp-stage[data-style=scifi] .warp-stage-bar { border-radius: 0; font-weight: 500; font-size: 13.5px; background: rgba(10, 18, 28, .88); box-shadow: inset 0 0 0 1px rgba(120, 170, 210, .2); backdrop-filter: blur(6px);
  clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%); }
.warp-stage[data-style=scifi] .warp-stage-bar:hover:not(:disabled) { transform: translateX(-4px); background: rgba(16, 30, 44, .95); box-shadow: inset 0 0 0 1px var(--st-accent), inset 3px 0 0 var(--st-accent); }
.warp-stage[data-style=scifi] .warp-stage-bar-n { background: none; border-radius: 0; color: var(--st-accent); font-size: 11px; min-width: 18px; }
.warp-stage[data-style=scifi] .warp-stage-bar small { border-radius: 0; background: rgba(120, 170, 210, .1); }
.warp-stage[data-style=scifi] .warp-stage-bar.move { box-shadow: inset 0 0 0 1px rgba(120, 170, 210, .2), inset 3px 0 0 var(--st-gold); }
.warp-stage[data-style=scifi] .warp-stage-bar.move.special { box-shadow: inset 0 0 0 1px rgba(120, 170, 210, .2), inset 3px 0 0 var(--st-love); }
.warp-stage[data-style=scifi] .warp-stage-bar.back { background: transparent; box-shadow: none; clip-path: none; }
.warp-stage[data-mode=date] .warp-stage-story { width: min(900px, calc(100% - 48px)); justify-self: center; margin-left: auto; margin-right: auto; }

/* their portrait: love around the outside, fear inside it */
.warp-stage-portrait { position: relative; width: min(220px, 60vw); aspect-ratio: 1; flex: none; display: grid; place-items: center; }
.warp-stage-portrait svg { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); overflow: visible; }
.warp-stage-portrait circle { fill: none; stroke-width: 4; stroke-linecap: round; transition: stroke-dasharray 700ms ease; }
.warp-stage-portrait circle.deco { stroke: none; }
.warp-stage-portrait circle.track { stroke: var(--st-track); }
.warp-stage-portrait circle.track.thin { stroke-width: 2.5; }
.warp-stage-portrait circle.love { stroke: var(--st-love); }
.warp-stage-portrait circle.fear { stroke: var(--st-fear); stroke-width: 2.5; }
.warp-stage-initial { width: 72%; aspect-ratio: 1; border-radius: 50%; display: grid; place-items: center; font-family: var(--st-display); font-size: clamp(48px, 7vw, 76px); font-weight: 800; color: #fff;
  background: hsl(var(--warp-hue, 330) 45% 58%); box-shadow: 0 18px 40px hsl(var(--warp-hue, 330) 40% 40% / .25); }
.warp-stage-face { position: absolute; right: 6%; bottom: 8%; font-size: clamp(30px, 4vw, 40px); line-height: 1; filter: drop-shadow(0 4px 8px rgba(0, 0, 0, .2)); animation: warp-stage-idle 3.6s ease-in-out infinite; }
.warp-stage-who { display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }
.warp-stage-who b { font-family: var(--st-display); font-size: 20px; font-weight: 800; letter-spacing: -.01em; }
.warp-stage-who span { color: var(--st-muted); font-size: 13.5px; }
/* medieval: a gilt cameo */
.warp-stage[data-style=medieval] .warp-stage-portrait circle.deco { stroke: #b48a2c; stroke-width: 1; }
.warp-stage[data-style=medieval] .warp-stage-portrait circle.track { stroke: rgba(214, 181, 106, .25); stroke-width: 3; }
.warp-stage[data-style=medieval] .warp-stage-portrait circle { stroke-linecap: butt; }
.warp-stage[data-style=medieval] .warp-stage-initial { background: var(--st-parch, none) 0 0 / 512px, #eadcbb; color: var(--st-accent); font-weight: 700;
  box-shadow: inset 0 0 0 3px #b48a2c, inset 0 0 0 7px #eadcbb, inset 0 0 0 8px rgba(180, 138, 44, .55), inset 0 0 30px rgba(110, 70, 20, .3), 0 18px 40px rgba(0, 0, 0, .6); }
.warp-stage[data-style=medieval] .warp-stage-face { display: none; }
.warp-stage[data-style=medieval] .warp-stage-who b { font-weight: 700; letter-spacing: .08em; color: #ecdfbf; font-size: 19px; }
.warp-stage[data-style=medieval] .warp-stage-who span { font-style: italic; font-size: 16px; color: #c9b68e; }
/* sci-fi: a comms reticle */
.warp-stage[data-style=scifi] .warp-stage-portrait circle.deco { stroke: rgba(94, 200, 229, .45); stroke-width: 1; stroke-dasharray: 1 5.4; }
.warp-stage[data-style=scifi] .warp-stage-portrait circle.track { stroke: rgba(120, 170, 210, .12); stroke-width: 3; }
.warp-stage[data-style=scifi] .warp-stage-portrait circle { stroke-linecap: butt; }
.warp-stage[data-style=scifi] .warp-stage-initial { background: radial-gradient(circle at 50% 40%, hsl(var(--warp-hue, 330) 50% 22%), #0a121c 75%); color: #eaf4fb; font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(94, 200, 229, .35), 0 0 0 6px rgba(7, 12, 19, .9), 0 0 0 7px rgba(94, 200, 229, .15); }
.warp-stage[data-style=scifi] .warp-stage-face { display: none; }
.warp-stage[data-style=scifi] .warp-stage-who b { font-weight: 600; text-transform: uppercase; letter-spacing: .12em; font-size: 16px; }
.warp-stage[data-style=scifi] .warp-stage-who span { font-family: var(--st-num); font-size: 11.5px; text-transform: uppercase; letter-spacing: .12em; color: var(--st-accent); }

.warp-stage-reaction { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 14px; }
.warp-stage-reaction div { display: flex; flex-direction: column; min-width: 0; }
.warp-stage-reaction b { font-size: 14px; }
.warp-stage-reaction span:not(.warp-stage-reaction-icon) { font-size: 12.5px; color: var(--st-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warp-stage-reaction-icon { font-size: 18px; font-weight: 800; min-width: 30px; text-align: center; }
.warp-stage-reaction.fresh { animation: warp-stage-pop 620ms cubic-bezier(.2, 1.4, .4, 1) both; }
.warp-stage-reaction.warp-tone-good { box-shadow: var(--sp-edge), inset 3px 0 0 var(--warp-good), var(--sp-shadow); }
.warp-stage-reaction:is(.warp-tone-bad, .warp-tone-warn) { box-shadow: var(--sp-edge), inset 3px 0 0 var(--warp-bad), var(--sp-shadow); }
.warp-stage[data-style=medieval] .warp-stage-reaction b { font-size: 16px; }
.warp-stage[data-style=medieval] .warp-stage-reaction span:not(.warp-stage-reaction-icon) { font-style: italic; font-size: 14px; }
@keyframes warp-stage-pop { from { opacity: 0; transform: scale(.9) translateY(8px); } to { opacity: 1; transform: none; } }
.warp-stage .warp-date-meter { grid-template-columns: 64px 1fr auto; font-size: 12px; }
.warp-stage .warp-date-meter-track { height: 6px; background: var(--st-track); }
.warp-stage .warp-date-meter.love .warp-date-meter-track > div { background: var(--st-love); }
.warp-stage .warp-date-meter.fear .warp-date-meter-track > div { background: var(--st-fear); }

/* the run or date is over; the scene waits behind this until the player heads back */
.warp-stage-ended { position: absolute; inset: 0; z-index: 3; display: grid; place-items: center; background: rgba(0, 0, 0, .45); backdrop-filter: blur(3px); animation: warp-stage-in 380ms ease both; }
.warp-stage-ended > div { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 28px 36px; }
.warp-stage-ended .warp-stage-kicker { font-size: 12px; color: var(--st-ink); }

/* ── the story box ── */
.warp-stage-story { position: relative; z-index: 2; margin: 0 24px calc(16px + env(safe-area-inset-bottom, 0px)); display: grid; grid-template-rows: auto minmax(0, 1fr) auto;
  max-height: 36dvh; user-select: text; -webkit-user-select: text; }
.warp-stage[data-style=modern] .warp-stage-story { border-radius: 18px; box-shadow: var(--sp-edge), 0 -4px 30px rgba(30, 25, 15, .1); }
.warp-stage-story-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 18px 0; }
.warp-stage-speaker { font-family: var(--st-display); font-weight: 800; font-size: 14px; color: var(--st-accent); letter-spacing: .01em; }
.warp-stage[data-style=medieval] .warp-stage-speaker { font-weight: 700; letter-spacing: .12em; text-transform: uppercase; font-size: 13px; }
.warp-stage[data-style=scifi] .warp-stage-speaker { font-family: var(--st-num); font-weight: 500; letter-spacing: .14em; text-transform: uppercase; font-size: 11px; }
.warp-stage[data-style=scifi] .warp-stage-speaker::before { content: "▸ "; }
.warp-stage-fold { cursor: pointer; border: none; background: transparent; color: var(--st-muted); font-size: 16px; padding: 2px 6px; border-radius: 6px; transition: transform 160ms; }
.warp-stage-fold:hover { color: var(--st-ink); }
.warp-stage-story-body { min-height: 0; overflow-y: auto; padding: 6px 20px 10px; scrollbar-width: thin; }
.warp-stage-said { font-size: 13px; color: var(--st-muted); margin-bottom: 6px; }
.warp-stage-said:empty { display: none; }
.warp-stage-said span { font-weight: 700; color: var(--st-dim); margin-right: 4px; text-transform: uppercase; font-size: 10.5px; letter-spacing: .12em; }
.warp-stage-text { font-family: var(--st-story); font-size: 18px; line-height: 1.6; max-width: 76ch; overflow-wrap: anywhere; }
.warp-stage[data-style=medieval] .warp-stage-text { font-size: 19.5px; line-height: 1.5; }
.warp-stage[data-style=scifi] .warp-stage-text { font-size: 15.5px; line-height: 1.6; }
.warp-stage-text p { margin: 0 0 .7em; }
.warp-stage-text p:last-child { margin-bottom: 0; }
.warp-stage-text em { color: var(--st-muted); }
.warp-stage-text .warp-stage-q { color: var(--st-ink); font-weight: 500; }
.warp-stage[data-style=scifi] .warp-stage-text .warp-stage-q { color: #f2f8fc; }
.warp-stage-text.streaming > p:last-child::after { content: "▍"; color: var(--st-accent); animation: warp-stage-caret 1s steps(2) infinite; margin-left: 1px; }
@keyframes warp-stage-caret { 50% { opacity: 0; } }
.warp-stage-text:empty::before { content: "The story continues here as you play."; color: var(--st-dim); font-style: italic; font-size: 14px; }
.warp-stage-status { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--st-muted); margin-top: 8px; }
.warp-stage-status:empty { display: none; }
.warp-stage-dots { display: inline-flex; gap: 3px; }
.warp-stage-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--st-accent); animation: warp-stage-dot 1.1s ease-in-out infinite; }
.warp-stage-dots i:nth-child(2) { animation-delay: .15s; }
.warp-stage-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes warp-stage-dot { 0%, 80%, 100% { opacity: .25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-3px); } }
.warp-stage-say { display: flex; gap: 8px; align-items: flex-end; padding: 10px 12px 12px; border-top: 1px solid var(--st-line); }
.warp-stage-say textarea { flex: 1; min-width: 0; min-height: 40px; max-height: 120px; resize: none; font: inherit; font-size: 14px; line-height: 1.4; color: var(--st-ink); background: var(--sp-field); border: 1px solid var(--st-line); border-radius: 12px; padding: 10px 12px; outline: none; }
.warp-stage-say textarea:focus { border-color: var(--st-accent); }
.warp-stage-say textarea::placeholder { color: var(--st-dim); }
.warp-stage[data-style=medieval] .warp-stage-say textarea { border-radius: 2px; font-size: 16px; font-style: italic; }
.warp-stage[data-style=scifi] .warp-stage-say textarea { border-radius: 0; font-family: var(--st-num); font-size: 13px; }
.warp-stage-say .warp-stage-btn { height: 40px; flex: none; }
.warp-stage[data-view=gate] .warp-stage-story { display: none; }
.warp-stage-story.narration .warp-stage-text { font-style: italic; color: var(--st-muted); }
.warp-stage-story.more .warp-stage-story-body { cursor: pointer; }
.warp-stage-next { font-size: 12px; color: var(--st-accent); animation: warp-stage-caret 1.4s ease-in-out infinite; }
.warp-stage-story.folded { grid-template-rows: auto 0 auto; }
.warp-stage-story.folded .warp-stage-story-body { display: none; }
.warp-stage-story.folded .warp-stage-fold { transform: rotate(180deg); }

/* Keep the focus ring inside cut corners and above the tile's reachable outline. */
.warp-stage :is(button, textarea, input, summary):focus-visible { outline: 2px solid var(--st-accent); outline-offset: -3px; }
.warp-stage .warp-dg-tile:focus-visible { outline: 3px solid var(--st-accent); outline-offset: -5px; }

/* ── narrow screens ── */
@media (max-width: 860px) {
  .warp-stage-top { grid-template-columns: minmax(0, 1fr) auto; padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px; gap: 10px; }
  .warp-stage-mid { grid-column: 1 / -1; grid-row: 2; justify-content: space-between; flex-wrap: wrap; gap: 10px; }
  .warp-stage-actions:has(.warp-stage-painting) { max-width: min(200px, 48vw); }
  .warp-stage-title h1 { font-size: 21px; }
  .warp-stage[data-style=medieval] .warp-stage-title h1 { font-size: 20px; }
  .warp-stage-main { padding: 12px 14px; overflow-y: auto; }
  .warp-stage-run, .warp-stage-date, .warp-stage-battle { display: flex; flex-direction: column; gap: 16px; }
  .warp-stage-date .warp-stage-center { display: none; }
  .warp-stage-left { overflow: visible; }
  .warp-stage-menu-col { max-height: none; overflow: visible; padding-left: 0; }
  .warp-stage[data-mode=date] .warp-stage-story { width: auto; }
  .warp-stage-run > *, .warp-stage-date > *, .warp-stage-battle > *, .warp-stage-map > * { flex: none; min-height: auto; }
  .warp-stage-board { container-type: inline-size; flex: none; }
  .warp-stage-board .warp-dg-board { width: min(100cqw, 64dvh); height: auto; aspect-ratio: 1; }
  .warp-stage[data-style=medieval] .warp-stage-board .warp-dg-board { width: min(calc(100cqw - 20px), 64dvh); }
  .warp-stage-side { overflow: visible; }
  .warp-stage-arena { min-height: 40dvh; }
  .warp-stage-command { overflow: visible; }
  .warp-stage-foe { width: 110px; }
  .warp-stage-foe-img { width: 84px; height: 84px; }
  .warp-stage-foe.boss { width: 160px; }
  .warp-stage-foe.boss .warp-stage-foe-img { width: 132px; height: 132px; }
  .warp-stage-ladder li:not(.now):not(.past) { display: none; }
  .warp-stage-story { margin: 0 8px calc(8px + env(safe-area-inset-bottom, 0px)); max-height: 42dvh; }
  .warp-stage-text, .warp-stage[data-style=medieval] .warp-stage-text { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .warp-stage, .warp-stage *, .warp-stage *::before, .warp-stage *::after { animation: none !important; transition: none !important; }
}
`;

// src/frontend/fx-styles.ts
var FX_STYLES = `
/* ───────── rolls in the chat: always readable, stamped when they land ───────── */
.warp-chips { position: relative; }
.warp-chips .warp-dice { font-weight: 700; border-width: 1.5px; padding-inline: 10px; }
.warp-chips .warp-dice.warp-tone-good { background: color-mix(in srgb, var(--warp-good) 16%, transparent); border-color: color-mix(in srgb, var(--warp-good) 70%, transparent); }
.warp-chips .warp-dice.warp-tone-warn { background: color-mix(in srgb, var(--warp-warn) 16%, transparent); border-color: color-mix(in srgb, var(--warp-warn) 70%, transparent); }
.warp-chips .warp-dice.warp-tone-bad { background: color-mix(in srgb, var(--warp-bad) 16%, transparent); border-color: color-mix(in srgb, var(--warp-bad) 70%, transparent); }

.warp-fx-pop { animation: warp-fx-pop .9s cubic-bezier(.2,1.6,.4,1) both; }
@keyframes warp-fx-pop { 0% { transform: scale(.6) rotate(-6deg); opacity: .3 } 55% { transform: scale(1.18) rotate(2deg); opacity: 1 } 100% { transform: none } }

.warp-fx-tone-good, .warp-fx-tone-crit { animation: warp-fx-glow-good 1.5s ease-out; border-radius: 10px; }
.warp-fx-tone-warn { animation: warp-fx-glow-warn 1.5s ease-out; border-radius: 10px; }
.warp-fx-tone-bad, .warp-fx-tone-critbad { animation: warp-fx-glow-bad 1.5s ease-out; border-radius: 10px; }
@keyframes warp-fx-glow-good { 0%, 30% { box-shadow: 0 0 0 2px #34b89a, 0 0 22px #34b89a88 } 100% { box-shadow: 0 0 0 0 transparent } }
@keyframes warp-fx-glow-warn { 0%, 30% { box-shadow: 0 0 0 2px #d9a441, 0 0 22px #d9a44188 } 100% { box-shadow: 0 0 0 0 transparent } }
@keyframes warp-fx-glow-bad { 0%, 30% { box-shadow: 0 0 0 2px #e05a7e, 0 0 22px #e05a7e88 } 100% { box-shadow: 0 0 0 0 transparent } }

.warp-fx-stamp {
  position: absolute; z-index: 5; left: 50%; top: -6px; transform: translate(-50%, -100%);
  display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 999px; pointer-events: none;
  font-size: 15px; letter-spacing: .02em; white-space: nowrap; color: #fff;
  background: #2a2733; border: 2px solid currentColor; box-shadow: 0 10px 26px rgba(0,0,0,.45);
  animation: warp-fx-stamp-still 2.6s ease both;
}
.warp-fx-stamp.moving { animation: warp-fx-stamp 2.6s cubic-bezier(.2,1.4,.4,1) both; }
.warp-fx-stamp b { text-transform: uppercase; letter-spacing: .08em; }
.warp-fx-stamp .warp-fx-label { font-size: 12px; opacity: .75; }
.warp-fx-stamp.warp-fx-good { color: #5fe0bf; } .warp-fx-stamp.warp-fx-warn { color: #f0c062; }
.warp-fx-stamp.warp-fx-bad { color: #f27c9c; } .warp-fx-stamp.warp-fx-crit { color: #ffe27a; background: linear-gradient(135deg, #3b2f10, #2a2733); }
.warp-fx-stamp.warp-fx-critbad { color: #ff6b6b; background: linear-gradient(135deg, #3b1218, #2a2733); }
.warp-fx-stamp .warp-fx-die { display: inline-block; font-size: 18px; }
.warp-fx-stamp.moving .warp-fx-die { animation: warp-fx-tumble .45s cubic-bezier(.3,.7,.4,1) both; }
@keyframes warp-fx-tumble { 0% { transform: translateY(-14px) rotate(-260deg) scale(.6) } 70% { transform: translateY(2px) rotate(10deg) scale(1.15) } 100% { transform: none } }
@keyframes warp-fx-stamp { 0% { transform: translate(-50%, -60%) scale(2.2); opacity: 0 } 14% { transform: translate(-50%, -100%) scale(.92); opacity: 1 } 22% { transform: translate(-50%, -100%) scale(1.04) } 30%, 78% { transform: translate(-50%, -100%) scale(1); opacity: 1 } 100% { transform: translate(-50%, -150%) scale(.96); opacity: 0 } }
@keyframes warp-fx-stamp-still { 0% { opacity: 0 } 10%, 80% { opacity: 1 } 100% { opacity: 0 } }

/* ───────── particles (hearts, sparks, gold) ───────── */
.warp-fx-particles { position: absolute; left: 50%; top: 45%; width: 0; height: 0; pointer-events: none; z-index: 30; }
.warp-fx-particles > span {
  position: absolute; left: 0; top: 0; font-size: calc(18px * var(--s, 1)); line-height: 1;
  animation: warp-fx-float 1.7s cubic-bezier(.2,.7,.3,1) var(--d, 0s) both; text-shadow: 0 2px 8px rgba(0,0,0,.35);
}
@keyframes warp-fx-float { 0% { transform: translate(-50%, 0) scale(.4) rotate(0); opacity: 0 } 15% { opacity: 1 } 65% { opacity: 1 } 100% { transform: translate(calc(-50% + var(--x)), var(--y)) scale(1) rotate(var(--r)); opacity: 0 } }
.warp-fx-crit > span { color: #ffe27a; } .warp-fx-critbad > span { color: #ff6b6b; } .warp-fx-gold > span { color: #ffd34d; }

/* ───────── dates: warmth, frost, banners ───────── */
.warp-fx-warm::after, .warp-fx-frost::after, .warp-fx-frost-hard::after { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 25; }
.warp-fx-warm::after { animation: warp-fx-warm 1.6s ease-out both; }
.warp-fx-frost::after { animation: warp-fx-frost 1.8s ease-out both; }
.warp-fx-frost-hard::after { animation: warp-fx-frost 1.8s ease-out both; box-shadow: inset 0 0 160px 40px #9fd3ffaa; }
@keyframes warp-fx-warm { 0% { box-shadow: inset 0 0 0 0 transparent } 30% { box-shadow: inset 0 0 160px 30px #ff7eb680 } 100% { box-shadow: inset 0 0 0 0 transparent } }
@keyframes warp-fx-frost { 0% { box-shadow: inset 0 0 0 0 transparent; backdrop-filter: none } 30% { box-shadow: inset 0 0 140px 30px #9fd3ff80 } 100% { box-shadow: inset 0 0 0 0 transparent } }

.warp-fx-banner {
  position: absolute; z-index: 40; left: 50%; top: 22%; transform: translateX(-50%); pointer-events: none;
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 12px 34px; border-radius: 16px;
  background: rgba(20, 16, 28, .82); border: 1px solid rgba(255,255,255,.18); color: #fff; text-align: center;
  box-shadow: 0 18px 50px rgba(0,0,0,.5); animation: warp-fx-banner 2.8s cubic-bezier(.2,1.2,.4,1) both;
}
.warp-fx-banner span { font-size: 11px; letter-spacing: .2em; text-transform: uppercase; opacity: .7; }
.warp-fx-banner b { font-size: 26px; }
.warp-fx-banner.up { border-color: #ff9ac6aa; } .warp-fx-banner.up b { color: #ffc2dc; }
.warp-fx-banner.down b { color: #a9c7ff; }
@keyframes warp-fx-banner { 0% { opacity: 0; transform: translate(-50%, 18px) scale(.9) } 14%, 80% { opacity: 1; transform: translate(-50%, 0) scale(1) } 100% { opacity: 0; transform: translate(-50%, -14px) } }

/* ───────── the dungeon: hits, numbers, flips, floors ───────── */
[data-fid] { position: relative; }
.warp-fx-shake { animation: warp-fx-shake .45s ease both; }
.warp-fx-shake-hard { animation: warp-fx-shake-hard .55s ease both; }
@keyframes warp-fx-shake { 0%, 100% { transform: none } 20% { transform: translateX(-6px) rotate(-1deg) } 40% { transform: translateX(5px) rotate(1deg) } 60% { transform: translateX(-3px) } 80% { transform: translateX(2px) } }
@keyframes warp-fx-shake-hard { 0%, 100% { transform: none } 15% { transform: translate(-10px, 3px) rotate(-3deg) } 30% { transform: translate(9px, -3px) rotate(2deg) } 50% { transform: translate(-6px, 2px) } 70% { transform: translate(4px, -1px) } }
.warp-fx-hurt > :not(.warp-fx-number) { animation: warp-fx-hurt .6s ease-out both; }
@keyframes warp-fx-hurt { 0%, 25% { filter: brightness(2.2) saturate(0) sepia(1) hue-rotate(-50deg) } 100% { filter: none } }
.warp-fx-heal { animation: warp-fx-heal-ring .9s ease-out both; }
.warp-fx-heal > :not(.warp-fx-number) { animation: warp-fx-heal .9s ease-out both; }
@keyframes warp-fx-heal-ring { 0%, 30% { box-shadow: 0 0 0 2px #5fe0bf, 0 0 22px #5fe0bf88 } 100% { box-shadow: none } }
@keyframes warp-fx-heal { 0%, 30% { filter: brightness(1.4) drop-shadow(0 0 12px #5fe0bf) } 100% { filter: none } }
.warp-fx-ko { animation: warp-fx-ko 1.1s ease-in both; }
@keyframes warp-fx-ko { 0% { filter: none } 40% { filter: brightness(3) saturate(0) } 100% { filter: grayscale(1) brightness(.5); opacity: .55; transform: translateY(6px) scale(.96) } }

.warp-fx-number {
  position: absolute; top: 18%; z-index: 20; transform: translateX(-50%); pointer-events: none;
  font: 800 22px/1 system-ui, sans-serif; color: #fff; -webkit-text-stroke: 1px rgba(0,0,0,.6); text-shadow: 0 3px 0 rgba(0,0,0,.45);
  animation: warp-fx-number 1.3s cubic-bezier(.2,1.4,.4,1) both;
}
.warp-fx-number small { display: block; font-size: 11px; letter-spacing: .15em; color: #ffe27a; }
.warp-fx-number.dmg { color: #fff6d6; } .warp-fx-number.hurt { color: #ff8a8a; } .warp-fx-number.heal { color: #7af0c8; } .warp-fx-number.gold { color: #ffd34d; font-size: 16px; }
.warp-fx-number.crit { font-size: 32px; color: #ffe27a; }
@keyframes warp-fx-number { 0% { opacity: 0; transform: translate(-50%, 10px) scale(.5) } 18% { opacity: 1; transform: translate(-50%, -14px) scale(1.25) } 32% { opacity: 1; transform: translate(-50%, -18px) scale(1) } 72% { opacity: 1; transform: translate(-50%, -34px) scale(1) } 100% { opacity: 0; transform: translate(-50%, -52px) } }

.warp-fx-flash { animation: warp-fx-flash .4s ease-out both; }
@keyframes warp-fx-flash { 0% { box-shadow: inset 0 0 0 999px rgba(255,255,255,.55) } 100% { box-shadow: inset 0 0 0 999px rgba(255,255,255,0) } }
.warp-fx-boss { animation: warp-fx-boss .9s ease-out both; }
@keyframes warp-fx-boss { 0%, 40% { box-shadow: inset 0 0 120px 30px rgba(220, 30, 60, .6) } 100% { box-shadow: inset 0 0 0 0 transparent } }

.warp-fx-flip { animation: warp-fx-flip .55s cubic-bezier(.3,.7,.4,1) var(--fx-delay, 0ms) both; }
@keyframes warp-fx-flip { 0% { transform: perspective(300px) rotateY(90deg) scale(.9); filter: brightness(1.8) } 100% { transform: none; filter: none } }
.warp-fx-glint { animation: warp-fx-glint 1.2s ease-out both; }
@keyframes warp-fx-glint { 0%, 35% { box-shadow: 0 0 0 2px #ffd34d, 0 0 26px #ffd34d99 } 100% { box-shadow: 0 0 0 0 transparent } }

.warp-fx-floor {
  position: absolute; inset: 0; z-index: 50; display: grid; place-content: center; text-align: center; pointer-events: none;
  background: #000; color: #fff; animation: warp-fx-floor-still 2.2s ease both;
}
.warp-fx-floor.moving { animation: warp-fx-floor 2.2s ease both; }
.warp-fx-floor span { font-size: 12px; letter-spacing: .4em; text-transform: uppercase; opacity: .7; }
.warp-fx-floor b { font-size: 64px; font-weight: 800; }
@keyframes warp-fx-floor { 0% { opacity: 0 } 18% { opacity: 1 } 70% { opacity: 1 } 100% { opacity: 0 } }
@keyframes warp-fx-floor-still { 0% { opacity: 0 } 15%, 70% { opacity: .92 } 100% { opacity: 0 } }

@media (prefers-reduced-motion: reduce) {
  .warp-fx-pop, .warp-fx-shake, .warp-fx-shake-hard, .warp-fx-flip, .warp-fx-number, .warp-fx-particles > span { animation: none !important; }
}
`;

// src/frontend/panels.ts
var GAP = 6;
var emptyLayout = () => ({ panels: [] });
function panelOf(l, part) {
  return l.panels.find((p) => p.parts.includes(part)) ?? null;
}
function without(l, parts) {
  return l.panels.map((p) => ({ ...p, parts: p.parts.filter((x) => !parts.includes(x)) })).filter((p) => p.parts.length);
}
function nextId(l) {
  let n = 1;
  while (l.panels.some((p) => p.id === `p${n}`))
    n++;
  return `p${n}`;
}
function movePart(l, part, to, index) {
  const from = panelOf(l, part);
  if (to && from?.id === to) {
    const parts = from.parts.filter((x) => x !== part);
    const was = from.parts.indexOf(part);
    const i = index === undefined ? parts.length : index > was ? index - 1 : index;
    parts.splice(Math.max(0, Math.min(i, parts.length)), 0, part);
    return updatePanel(l, from.id, { parts });
  }
  if (to && !l.panels.some((p) => p.id === to))
    return l;
  const panels = without(l, [part]);
  if (!to)
    return { panels };
  return {
    panels: panels.map((p) => {
      if (p.id !== to)
        return p;
      const parts = [...p.parts];
      parts.splice(index === undefined ? parts.length : Math.max(0, Math.min(index, parts.length)), 0, part);
      return { ...p, parts };
    })
  };
}
function tearOff(l, part, x, y) {
  const panels = without(l, [part]);
  return { panels: [...panels, { id: nextId({ panels: l.panels }), parts: [part], x, y, attach: null }] };
}
function mergePanel(l, id, to) {
  const src = l.panels.find((p) => p.id === id);
  if (!src || id === to)
    return l;
  const rest = l.panels.filter((p) => p.id !== id);
  if (!to)
    return { panels: rest };
  return { panels: rest.map((p) => p.id === to ? { ...p, parts: [...p.parts, ...src.parts] } : p) };
}
function updatePanel(l, id, patch) {
  return { panels: l.panels.map((p) => p.id === id ? { ...p, ...patch } : p) };
}
var inside = (pt, b) => pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
function overlapShare(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0)
    return 0;
  return w * h / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}
function sideFor(b, main, snap = SNAP) {
  const vOverlap = Math.min(b.y + b.h, main.y + main.h) - Math.max(b.y, main.y);
  const hOverlap = Math.min(b.x + b.w, main.x + main.w) - Math.max(b.x, main.x);
  const near = (a, c) => Math.abs(a - c) <= snap;
  const offY = Math.round(b.y - main.y), offX = Math.round(b.x - main.x);
  if (vOverlap > 24 && near(b.x + b.w, main.x - GAP))
    return { side: "left", offset: offY };
  if (vOverlap > 24 && near(b.x, main.x + main.w + GAP))
    return { side: "right", offset: offY };
  if (hOverlap > 24 && near(b.y, main.y + main.h + GAP))
    return { side: "bottom", offset: offX };
  return null;
}
function clampBox(b, vp) {
  return {
    ...b,
    x: Math.round(Math.max(PAD, Math.min(b.x, vp.width - b.w - PAD))),
    y: Math.round(Math.max(PAD, Math.min(b.y, vp.height - Math.min(b.h, vp.height - 2 * PAD) - PAD)))
  };
}
function attachedAt(a, w, h, main, vp) {
  const fits = (b) => b.x >= PAD / 2 && b.y >= PAD / 2 && b.x + b.w <= vp.width - PAD / 2 && b.y + b.h <= vp.height - PAD / 2;
  const along = (b) => ({ ...b, y: Math.round(Math.max(PAD, Math.min(b.y, vp.height - Math.min(h, vp.height - 2 * PAD) - PAD))) });
  const across = (b) => ({ ...b, x: Math.round(Math.max(PAD, Math.min(b.x, vp.width - w - PAD))) });
  const left = along({ x: main.x - GAP - w, y: main.y + a.offset, w, h });
  const right = along({ x: main.x + main.w + GAP, y: main.y + a.offset, w, h });
  const x = a.side === "bottom" ? main.x + a.offset : a.side === "left" ? main.x : main.x + main.w - w;
  const below = across({ x, y: main.y + main.h + GAP, w, h });
  const above = across({ x, y: main.y - GAP - h, w, h });
  const order = a.side === "left" ? [left, right, above, below] : a.side === "right" ? [right, left, above, below] : [below, above, right, left];
  return order.find(fits) ?? clampBox(order[0], vp);
}
function snapToScreen(b, vp, snap = SNAP) {
  let { x, y } = b;
  if (x < PAD + snap)
    x = PAD;
  if (x + b.w > vp.width - PAD - snap)
    x = vp.width - PAD - b.w;
  if (y < PAD + snap)
    y = PAD;
  if (y + b.h > vp.height - PAD - snap)
    y = vp.height - PAD - b.h;
  return clampBox({ ...b, x, y }, vp);
}
function slotAt(y, rows) {
  const i = rows.findIndex((r) => y < r.y + r.h / 2);
  return i < 0 ? rows.length : i;
}
function parseLayout(raw) {
  try {
    const v = JSON.parse(raw ?? "");
    if (!Array.isArray(v?.panels))
      return emptyLayout();
    const seen = new Set;
    const panels = [];
    for (const p of v.panels) {
      if (!p || typeof p.id !== "string" || !Array.isArray(p.parts))
        continue;
      const parts = p.parts.filter((x) => typeof x === "string" && !seen.has(x));
      parts.forEach((x) => seen.add(x));
      if (!parts.length || panels.some((q) => q.id === p.id))
        continue;
      const side = p.attach?.side;
      panels.push({
        id: p.id,
        parts,
        x: Number.isFinite(p.x) ? p.x : 80,
        y: Number.isFinite(p.y) ? p.y : 80,
        attach: side === "left" || side === "right" || side === "bottom" ? { side, offset: Number(p.attach.offset) || 0 } : null,
        ...p.folded ? { folded: true } : {}
      });
    }
    return { panels };
  } catch {
    return emptyLayout();
  }
}

// src/frontend/map-view.ts
var MAX_ZOOM = 5;
function parseBox(s) {
  const n = (s ?? "").trim().split(/[\s,]+/).map(Number);
  return n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 ? { x: n[0], y: n[1], w: n[2], h: n[3] } : null;
}
var fmt = (b) => [b.x, b.y, b.w, b.h].map((v) => Math.round(v * 100) / 100).join(" ");
function clampView(v, base) {
  const w = Math.max(base.w / MAX_ZOOM, Math.min(base.w, v.w));
  const h = w * (base.h / base.w);
  const x = Math.max(base.x, Math.min(v.x, base.x + base.w - w));
  const y = Math.max(base.y, Math.min(v.y, base.y + base.h - h));
  return { x, y, w, h };
}
function zoomAt(v, base, factor, px, py) {
  const w = Math.max(base.w / MAX_ZOOM, Math.min(base.w, v.w / factor));
  const k = w / v.w;
  return clampView({ x: px - (px - v.x) * k, y: py - (py - v.y) * k, w, h: v.h * k }, base);
}
var panBy = (v, base, dx, dy) => clampView({ ...v, x: v.x - dx, y: v.y - dy }, base);
function centreOn(v, base, px, py, zoom) {
  const w = Math.min(v.w, base.w / zoom);
  const h = w * (base.h / base.w);
  return clampView({ x: px - w / 2, y: py - h / 2, w, h }, base);
}
var views = new Map;
function restoreMaps(root) {
  root.querySelectorAll("[data-map]").forEach((el) => {
    const v = views.get(el.dataset.map);
    const svg = el.querySelector("svg");
    if (v && svg)
      svg.setAttribute("viewBox", fmt(v));
    el.classList.toggle("zoomed", !!v);
  });
}
function setView(el, v) {
  const base = parseBox(el.dataset.map);
  const whole = v.w >= base.w - 0.01;
  if (whole)
    views.delete(el.dataset.map);
  else
    views.set(el.dataset.map, v);
  el.querySelector("svg")?.setAttribute("viewBox", fmt(whole ? base : v));
  el.classList.toggle("zoomed", !whole);
}
function current(el) {
  const base = parseBox(el.dataset.map);
  if (!base)
    return null;
  return { base, v: views.get(el.dataset.map) ?? base };
}
function toMap(svg, x, y) {
  const m = svg.getScreenCTM?.();
  if (!m)
    return null;
  const p = new DOMPoint(x, y).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}
function wireMaps(root) {
  let drag = null;
  let swallowClick = false;
  const onWheel = (e) => {
    const el = e.target.closest?.("[data-map]");
    const svg = el?.querySelector("svg");
    if (!el || !svg || !root.contains(el))
      return;
    const c = current(el);
    const p = toMap(svg, e.clientX, e.clientY);
    if (!c || !p)
      return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    setView(el, zoomAt(c.v, c.base, Math.exp(-dy * 0.0018), p.x, p.y));
  };
  const onDown = (e) => {
    if (e.button !== 0)
      return;
    const t = e.target;
    if (t.closest?.("[data-map-zoom]"))
      return;
    const el = t.closest?.("[data-map]");
    const svg = el?.querySelector("svg");
    const m = svg?.getScreenCTM?.();
    if (!el || !svg || !m)
      return;
    drag = { el, svg, id: e.pointerId, x: e.clientX, y: e.clientY, scale: m.a || 1, moved: false };
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id)
      return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5)
      return;
    if (!drag.moved) {
      drag.moved = true;
      drag.el.classList.add("panning");
      try {
        drag.svg.setPointerCapture(e.pointerId);
      } catch {}
    }
    const c = current(drag.el);
    if (c)
      setView(drag.el, panBy(c.v, c.base, dx / drag.scale, dy / drag.scale));
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id)
      return;
    if (drag.moved) {
      swallowClick = true;
      setTimeout(() => {
        swallowClick = false;
      }, 0);
    }
    drag.el.classList.remove("panning");
    drag = null;
  };
  const onClick = (e) => {
    if (swallowClick) {
      e.preventDefault();
      e.stopPropagation();
      swallowClick = false;
      return;
    }
    const btn = e.target.closest?.("[data-map-zoom]");
    const el = btn?.closest("[data-map]");
    if (!btn || !el)
      return;
    e.stopPropagation();
    const c = current(el);
    if (!c)
      return;
    const cx = c.v.x + c.v.w / 2, cy = c.v.y + c.v.h / 2;
    const z = btn.dataset.mapZoom;
    if (z === "in")
      setView(el, zoomAt(c.v, c.base, 1.5, cx, cy));
    else if (z === "out")
      setView(el, zoomAt(c.v, c.base, 1 / 1.5, cx, cy));
    else {
      const here = (el.dataset.mapHere ?? "").split(" ").map(Number);
      if (here.length === 2 && here.every(Number.isFinite))
        setView(el, centreOn(c.v, c.base, here[0], here[1], 2));
    }
  };
  root.addEventListener("wheel", onWheel, { passive: false });
  root.addEventListener("pointerdown", onDown);
  root.addEventListener("click", onClick, true);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => {
    root.removeEventListener("wheel", onWheel);
    root.removeEventListener("pointerdown", onDown);
    root.removeEventListener("click", onClick, true);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
  };
}

// src/frontend/panel-windows.ts
var MAP_W = 340;
var widthFor = (parts) => parts.includes("map") ? MAP_W : PANEL_W;
function createPanels(o) {
  let layout = parseLayout(o.load());
  let parts = [];
  const wins = new Map;
  const cleanups = [];
  const scale = () => {
    try {
      return o.ctx.ui.geometry?.getUiScale() || 1;
    } catch {
      return 1;
    }
  };
  const toLayout = (v) => v / scale();
  const rect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  };
  function commit(next) {
    layout = next;
    o.save(JSON.stringify(layout));
    o.changed();
  }
  function makeWin(p) {
    const el = document.createElement("div");
    el.className = "warp-overlay warp-panel";
    el.innerHTML = `<div class="warp-overlay-head" title="Drag to move · drop on the main window to put it back, or on another panel to merge"></div><div class="warp-overlay-body warp-root"></div>`;
    const head = el.firstElementChild;
    const body = el.lastElementChild;
    const w = widthFor(p.parts);
    let handle;
    try {
      handle = o.ctx.ui.createFloatWidget({ width: w, height: 200, initialPosition: { x: p.x, y: p.y }, snapToEdge: false, tooltip: "Warp", chromeless: true });
    } catch {
      return null;
    }
    handle.root.appendChild(el);
    handle.setVisible(false);
    const win = { id: p.id, handle, el, head, body, box: { x: p.x, y: p.y, w, h: 200 }, shown: false, html: "" };
    body.addEventListener("pointerdown", (e) => {
      if (!e.target.closest?.("input, select, textarea"))
        e.preventDefault();
    });
    body.addEventListener("pointerdown", (e) => startSectionDrag(e, p.id));
    o.wire(body);
    cleanups.push(wireMaps(body));
    head.addEventListener("pointerdown", (e) => {
      if (e.button === 0)
        panelDrag = { id: win.id, at: { x: e.clientX, y: e.clientY } };
    });
    head.addEventListener("click", (e) => {
      const t = e.target;
      if (t.closest("[data-panel-home]")) {
        commit(mergePanel(layout, win.id, null));
        return;
      }
      if (t.closest("[data-panel-fold]")) {
        const cur = layout.panels.find((q) => q.id === win.id);
        if (cur)
          commit(updatePanel(layout, win.id, { folded: !cur.folded }));
      }
    });
    cleanups.push(handle.onDragEnd((pos) => dropPanel(win, pos)));
    return win;
  }
  function destroyWin(w) {
    try {
      w.handle.destroy();
    } catch {}
    wins.delete(w.id);
  }
  function place(w, b) {
    if (b.w !== w.box.w || b.h !== w.box.h)
      w.handle.setSize(b.w, b.h);
    const p = w.handle.getPosition();
    if (Math.round(p.x) !== Math.round(b.x) || Math.round(p.y) !== Math.round(b.y))
      w.handle.moveTo(b.x, b.y);
    w.box = b;
  }
  function boxFor(p, w, h) {
    const vp = o.viewport();
    const m = o.main();
    if (p.attach && m)
      return attachedAt(p.attach, w, h, m.box, vp);
    return snapToScreen({ x: p.x, y: p.y, w, h }, vp, 0);
  }
  function heightFor(win, folded) {
    if (folded)
      return PILL.h;
    const vp = o.viewport();
    const maxH = Math.max(160, vp.height - 140);
    win.el.style.setProperty("--warp-overlay-max", `${maxH - PILL.h}px`);
    return Math.min(maxH, PILL.h + win.body.scrollHeight + 2);
  }
  function sync() {
    const byId = new Map(parts.map((p) => [p.id, p]));
    const m = o.main();
    const show = o.shown();
    for (const w of wins.values())
      if (!layout.panels.some((p) => p.id === w.id))
        destroyWin(w);
    for (const p of layout.panels) {
      const here = p.parts.map((id) => byId.get(id)).filter((x) => !!x);
      const visible = show && here.length > 0 && (!p.attach || !!m && m.open);
      let w = wins.get(p.id);
      if (!visible) {
        if (w?.shown) {
          w.handle.setVisible(false);
          w.shown = false;
        }
        continue;
      }
      if (!w) {
        const made = makeWin(p);
        if (!made)
          continue;
        w = made;
        wins.set(p.id, w);
      }
      const single = here.length === 1;
      const title = here.map((x) => `${x.title}${x.count ? ` · ${x.count}` : ""}`).join(" · ");
      w.head.innerHTML = `<span class="warp-overlay-title">${esc(title)}</span>
        <span class="warp-overlay-actions">
          <button class="warp-btn warp-btn-ghost" data-panel-home title="Put back in the main window" aria-label="Put back in the main window">⤺</button>
          <button class="warp-btn warp-btn-ghost" data-panel-fold title="${p.folded ? "Expand" : "Collapse"}" aria-label="${p.folded ? "Expand" : "Collapse"}">${p.folded ? "+" : "–"}</button>
        </span>`;
      w.el.classList.toggle("warp-overlay-collapsed", !!p.folded);
      w.el.dataset.attach = p.attach?.side ?? "";
      const html = single ? `<div class="warp-panel-solo" data-solo="${esc(here[0].id)}">${here[0].body}</div>` : here.map((x) => renderPart(x, true)).join("");
      if (html !== w.html) {
        const kept = w.body.scrollTop;
        o.rememberSections(w.body);
        w.body.innerHTML = html;
        w.html = html;
        o.restoreSections(w.body);
        restoreMaps(w.body);
        w.body.scrollTop = kept;
      }
      if (!w.shown) {
        w.handle.setVisible(true);
        w.shown = true;
      }
      const win = w;
      const width = widthFor(p.parts);
      place(win, boxFor(p, width, win.box.h));
      requestAnimationFrame(() => place(win, boxFor(p, width, heightFor(win, !!p.folded))));
    }
  }
  function follow() {
    const m = o.main();
    if (!m)
      return;
    for (const p of layout.panels) {
      const w = wins.get(p.id);
      if (w?.shown && p.attach)
        place(w, attachedAt(p.attach, w.box.w, w.box.h, m.box, o.viewport()));
    }
  }
  let panelDrag = null;
  let pointer = null;
  function targetAt(pt, skip) {
    for (const w of wins.values())
      if (w.shown && w.id !== skip && inside(pt, rect(w.el)))
        return { kind: "panel", id: w.id };
    const m = o.main();
    if (m?.open && inside(pt, rect(m.el)))
      return { kind: "main" };
    return null;
  }
  function highlight(t) {
    const m = o.main();
    m?.el.classList.toggle("warp-drop-target", t?.kind === "main");
    for (const w of wins.values())
      w.el.classList.toggle("warp-drop-target", t?.kind === "panel" && t.id === w.id);
  }
  function dropPanel(win, pos) {
    const pt = pointer;
    panelDrag = null;
    highlight(null);
    const p = layout.panels.find((q) => q.id === win.id);
    if (!p)
      return;
    const box = { ...win.box, x: pos.x, y: pos.y };
    win.box = box;
    const m = o.main();
    const t = pt ? targetAt(pt, win.id) : null;
    if (t?.kind === "main" || !t && m?.open && overlapShare(box, m.box) > 0.5) {
      commit(mergePanel(layout, win.id, null));
      return;
    }
    const other = t?.kind === "panel" ? t.id : [...wins.values()].find((w) => w.id !== win.id && w.shown && overlapShare(box, w.box) > 0.5)?.id;
    if (other) {
      commit(mergePanel(layout, win.id, other));
      return;
    }
    const attach = m?.open ? sideFor(box, m.box) : null;
    const b = attach ? box : snapToScreen(box, o.viewport());
    commit(updatePanel(layout, win.id, { x: b.x, y: b.y, attach }));
  }
  let sec = null;
  let swallowClick = false;
  function startSectionDrag(e, from) {
    if (e.button !== 0)
      return;
    const summary = e.target.closest?.("summary[data-part]");
    if (!summary)
      return;
    sec = { part: summary.dataset.part, from, id: e.pointerId, x: e.clientX, y: e.clientY, started: false, ghost: null, summary };
  }
  const onMove = (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    if (panelDrag) {
      if (Math.hypot(e.clientX - panelDrag.at.x, e.clientY - panelDrag.at.y) > 4)
        highlight(targetAt(pointer, panelDrag.id));
      return;
    }
    if (!sec || e.pointerId !== sec.id)
      return;
    if (!sec.started) {
      if (Math.hypot(e.clientX - sec.x, e.clientY - sec.y) < 7)
        return;
      sec.started = true;
      const ghost = document.createElement("div");
      ghost.className = "warp-drag-ghost";
      ghost.textContent = sec.summary.textContent?.trim() ?? "";
      document.body.appendChild(ghost);
      sec.ghost = ghost;
      sec.summary.closest("details")?.classList.add("warp-dragging");
      try {
        sec.summary.setPointerCapture(e.pointerId);
      } catch {}
    }
    const t = targetAt(pointer, null);
    highlight(t?.kind === "main" && sec.from === null ? null : t);
    sec.ghost.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 8}px)`;
    sec.ghost.classList.toggle("warp-ghost-new", !t);
  };
  const onUp = (e) => {
    if (panelDrag && !sec) {
      setTimeout(() => {
        if (panelDrag) {
          panelDrag = null;
          highlight(null);
        }
      }, 50);
    }
    if (!sec || e.pointerId !== sec.id)
      return;
    const s = sec;
    sec = null;
    if (!s.started)
      return;
    s.ghost?.remove();
    s.summary.closest("details")?.classList.remove("warp-dragging");
    highlight(null);
    swallowClick = true;
    setTimeout(() => {
      swallowClick = false;
    }, 0);
    const pt = { x: e.clientX, y: e.clientY };
    const t = targetAt(pt, null);
    if (t?.kind === "main") {
      if (s.from !== null)
        commit(movePart(layout, s.part, null));
      return;
    }
    if (t?.kind === "panel") {
      const w = wins.get(t.id);
      const rows = [...w.body.querySelectorAll(":scope > details[data-section]")].map((d) => rect(d));
      const index = rows.length ? slotAt(pt.y, rows) : undefined;
      commit(movePart(layout, s.part, t.id, index));
      return;
    }
    const x = toLayout(pt.x) - 24, y = toLayout(pt.y) - 14;
    let next = tearOff(layout, s.part, x, y);
    const made = panelOf(next, s.part);
    const m = o.main();
    const box = { x, y, w: widthFor([s.part]), h: 200 };
    const attach = m?.open ? sideFor(box, m.box, 60) : null;
    const b = attach ? box : snapToScreen(box, o.viewport());
    next = updatePanel(next, made.id, { x: b.x, y: b.y, attach });
    commit(next);
  };
  const onClickCapture = (e) => {
    if (swallowClick) {
      e.preventDefault();
      e.stopPropagation();
      swallowClick = false;
    }
  };
  const onKey = (e) => {
    if (e.key !== "Escape" || !sec?.started)
      return;
    sec.ghost?.remove();
    sec.summary.closest("details")?.classList.remove("warp-dragging");
    highlight(null);
    sec = null;
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("keydown", onKey);
  cleanups.push(() => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    document.removeEventListener("click", onClickCapture, true);
    document.removeEventListener("keydown", onKey);
  });
  return {
    inMain: (id) => !panelOf(layout, id),
    render(next) {
      parts = next;
      sync();
    },
    sync,
    follow,
    startSectionDrag,
    reset() {
      commit({ panels: [] });
    },
    hasPanels: () => layout.panels.length > 0,
    destroy() {
      for (const c of cleanups.splice(0)) {
        try {
          c();
        } catch {}
      }
      for (const w of [...wins.values()])
        destroyWin(w);
    }
  };
}

// src/frontend/fx-events.ts
var recKey = (r) => `${r.messageId}:${r.swipe}:${r.check?.total ?? ""}:${r.check?.tier ?? ""}`;
function fxEvents(prev, next) {
  if (!prev || prev.chatId !== next.chatId)
    return [];
  const out = [];
  const seen = new Set(prev.records.map(recKey));
  for (const r of next.records) {
    if (!r.check || seen.has(recKey(r)))
      continue;
    out.push({ kind: "roll", messageId: r.messageId, tier: r.check.tier, crit: r.check.tier.startsWith("crit"), label: r.check.label });
  }
  const before = new Map((prev.encounterLogs ?? []).map((l) => [l.messageId, l]));
  for (const l of next.encounterLogs ?? []) {
    const p = before.get(l.messageId);
    if (p && p.rounds.length === l.rounds.length && p.status === l.status)
      continue;
    const last = l.rounds[l.rounds.length - 1];
    if (!last)
      continue;
    const t = last.check?.tier ?? null;
    out.push({ kind: "round", messageId: l.messageId, tier: t === null ? null : /great/.test(t) ? "crit_success" : /badly/.test(t) ? "crit_fail" : /success/.test(t) ? "success" : t === "partial" ? "partial" : "fail", ended: l.ended ? l.ended.loss ? "loss" : "win" : null });
  }
  const ps = prev.date?.session ?? null, ns = next.date?.session ?? null;
  if (!ps && ns)
    out.push({ kind: "dateStart" });
  if (ps && !ns)
    out.push({ kind: "dateEnd" });
  if (ns?.last && (ps?.who !== ns.who || ps?.last?.label !== ns.last.label || ps?.last?.reaction !== ns.last.reaction || ps?.fatigue !== ns.fatigue)) {
    out.push({ kind: "reaction", reaction: ns.last.reaction });
  }
  if (ps && ns && ps.who === ns.who) {
    const a = prev.date?.people.find((p) => p.id === ns.who), b = next.date?.people.find((p) => p.id === ns.who);
    if (a && b && a.stage !== b.stage)
      out.push({ kind: "stage", up: (b.love ?? 0) >= (a.love ?? 0), label: b.stage });
  }
  const pd = prev.dungeon, nd = next.dungeon;
  if (pd && nd && pd.id === nd.id) {
    if (nd.depth > pd.depth)
      out.push({ kind: "floor", depth: nd.depth });
    else {
      const was = new Map(pd.tiles.map((t) => [`${t.x},${t.y}`, t]));
      for (const t of nd.tiles) {
        const o = was.get(`${t.x},${t.y}`);
        if (o?.state === "hidden" && t.state !== "hidden")
          out.push({ kind: "reveal", x: t.x, y: t.y, tile: t.kind });
      }
      const ph = pd.tiles.find((t) => t.state === "here"), nh = nd.tiles.find((t) => t.state === "here");
      if (ph && nh && (ph.x !== nh.x || ph.y !== nh.y))
        out.push({ kind: "step" });
    }
    if (nd.gold > pd.gold)
      out.push({ kind: "gold", amount: nd.gold - pd.gold });
    const bag = (v) => v.bag.reduce((n, i) => n + i.count, 0) + v.loot.reduce((n, i) => n + i.count, 0);
    if (bag(nd) > bag(pd))
      out.push({ kind: "loot" });
    if (nd.level > pd.level)
      out.push({ kind: "level", level: nd.level });
    if (!pd.battle && nd.battle)
      out.push({ kind: "battle", boss: nd.battle.kind === "boss" });
    if (pd.battle && nd.battle && !pd.battle.over && nd.battle.over)
      out.push({ kind: "battleOver", won: /won|victory|win/i.test(nd.battle.over) });
    const fighters = (v) => [...v.battle?.fighters ?? [], ...v.party];
    const old = new Map(fighters(pd).map((f) => [f.id, f]));
    const crit = (nd.battle?.log ?? []).slice(-4).some((l) => /critical|crit\b/i.test(l)) && !(pd.battle?.log ?? []).slice(-4).some((l) => /critical|crit\b/i.test(l));
    const done = new Set;
    for (const f of fighters(nd)) {
      const o = old.get(f.id);
      if (!o || done.has(f.id))
        continue;
      done.add(f.id);
      if (f.hp < o.hp)
        out.push({ kind: "hit", id: f.id, side: f.side, amount: o.hp - f.hp, ko: o.alive && !f.alive, crit });
      else if (f.hp > o.hp)
        out.push({ kind: "heal", id: f.id, amount: f.hp - o.hp });
    }
  }
  return out;
}

// src/frontend/sfx.ts
var ctx = null;
var master = null;
var volume = 0.4;
var unlocked = false;
function setVolume(v) {
  volume = Math.max(0, Math.min(1, v));
  if (master)
    master.gain.value = volume * 0.6;
}
function armAudio() {
  const unlock = () => {
    unlocked = true;
    try {
      audio()?.resume();
    } catch {}
  };
  window.addEventListener("pointerdown", unlock, { once: true, capture: true });
  window.addEventListener("keydown", unlock, { once: true, capture: true });
  return () => {
    window.removeEventListener("pointerdown", unlock, { capture: true });
    window.removeEventListener("keydown", unlock, { capture: true });
  };
}
function audio() {
  if (ctx)
    return ctx;
  try {
    const C = window.AudioContext ?? window.webkitAudioContext;
    if (!C)
      return null;
    ctx = new C;
    master = ctx.createGain();
    master.gain.value = volume * 0.6;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}
function tone(freq, at, dur, opts = {}) {
  const a = audio();
  if (!a || !master)
    return;
  const t = a.currentTime + at;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide)
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t + dur);
  const peak = opts.gain ?? 0.3;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (opts.attack ?? 0.008));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(at, dur, opts = {}) {
  const a = audio();
  if (!a || !master)
    return;
  const t = a.currentTime + at;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0;i < len; i++)
    d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = opts.type ?? "bandpass";
  f.frequency.value = opts.freq ?? 2000;
  f.Q.value = opts.q ?? 1;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.3;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}
var chord = (notes, at, step, dur, type = "triangle", gain = 0.18) => notes.forEach((n, i) => tone(n, at + i * step, dur, { type, gain }));
var SOUNDS = {
  dice: () => {
    for (let i = 0;i < 5; i++)
      noise(i * 0.055 + Math.random() * 0.02, 0.04, { freq: 2600 + Math.random() * 1500, q: 6, gain: 0.35 - i * 0.05 });
  },
  success: () => chord([523, 659, 784], 0.32, 0.07, 0.35),
  crit: () => {
    chord([523, 659, 784, 1047], 0.32, 0.06, 0.5, "triangle", 0.2);
    tone(2093, 0.6, 0.6, { gain: 0.08 });
  },
  partial: () => chord([523, 587], 0.32, 0.09, 0.3, "triangle", 0.15),
  fail: () => {
    tone(330, 0.32, 0.25, { type: "triangle", gain: 0.18, slide: 0.8 });
    tone(262, 0.44, 0.35, { type: "triangle", gain: 0.16, slide: 0.75 });
  },
  critFail: () => {
    tone(220, 0.32, 0.5, { type: "sawtooth", gain: 0.09, slide: 0.5 });
    noise(0.32, 0.25, { freq: 300, gain: 0.25, type: "lowpass" });
  },
  heart: () => {
    tone(880, 0, 0.18, { gain: 0.15 });
    tone(1175, 0.09, 0.3, { gain: 0.14 });
    tone(1568, 0.18, 0.45, { gain: 0.1 });
  },
  like: () => {
    tone(784, 0, 0.18, { gain: 0.12 });
    tone(988, 0.08, 0.25, { gain: 0.1 });
  },
  meh: () => tone(523, 0, 0.18, { type: "triangle", gain: 0.08 }),
  chill: () => {
    tone(392, 0, 0.3, { type: "triangle", gain: 0.12, slide: 0.85 });
    noise(0, 0.35, { freq: 6000, q: 0.5, gain: 0.05, type: "highpass" });
  },
  stageUp: () => chord([523, 659, 784, 1047, 1319], 0, 0.08, 0.6, "sine", 0.14),
  stageDown: () => chord([659, 523, 392], 0, 0.12, 0.45, "triangle", 0.12),
  dateStart: () => {
    tone(659, 0, 0.25, { gain: 0.1 });
    tone(988, 0.12, 0.4, { gain: 0.09 });
  },
  hit: () => {
    noise(0, 0.08, { freq: 900, q: 1.2, gain: 0.4 });
    tone(140, 0, 0.12, { type: "square", gain: 0.1, slide: 0.5 });
  },
  critHit: () => {
    noise(0, 0.12, { freq: 1400, q: 0.8, gain: 0.5 });
    tone(110, 0, 0.25, { type: "square", gain: 0.14, slide: 0.4 });
    tone(1760, 0.02, 0.2, { gain: 0.08 });
  },
  hurt: () => {
    noise(0, 0.1, { freq: 500, q: 1, gain: 0.35 });
    tone(200, 0, 0.18, { type: "sawtooth", gain: 0.07, slide: 0.6 });
  },
  ko: () => {
    tone(330, 0, 0.5, { type: "square", gain: 0.08, slide: 0.25 });
    noise(0.05, 0.3, { freq: 250, gain: 0.25, type: "lowpass" });
  },
  heal: () => chord([659, 880, 1175], 0, 0.06, 0.35, "sine", 0.1),
  flip: () => noise(0, 0.07, { freq: 3200, q: 2, gain: 0.18 }),
  step: () => noise(0, 0.05, { freq: 400, q: 1, gain: 0.2, type: "lowpass" }),
  coin: () => {
    tone(1319, 0, 0.08, { type: "square", gain: 0.06 });
    tone(1760, 0.07, 0.25, { type: "square", gain: 0.06 });
  },
  loot: () => chord([784, 988, 1175, 1568], 0, 0.05, 0.3, "triangle", 0.12),
  floor: () => {
    noise(0, 0.6, { freq: 200, q: 0.7, gain: 0.2, type: "lowpass" });
    chord([196, 247, 294], 0.1, 0.12, 0.6, "triangle", 0.1);
  },
  level: () => chord([523, 659, 784, 1047, 784, 1047], 0, 0.07, 0.35, "square", 0.06),
  battle: () => {
    tone(110, 0, 0.4, { type: "sawtooth", gain: 0.08 });
    tone(165, 0.12, 0.4, { type: "sawtooth", gain: 0.07 });
    noise(0, 0.3, { freq: 150, gain: 0.25, type: "lowpass" });
  },
  victory: () => chord([523, 659, 784, 1047], 0, 0.1, 0.5, "triangle", 0.15),
  defeat: () => chord([392, 330, 262, 196], 0, 0.16, 0.6, "triangle", 0.12)
};
function play(s) {
  if (!unlocked || volume <= 0)
    return;
  const a = audio();
  if (!a)
    return;
  if (a.state === "suspended")
    a.resume().catch(() => {});
  try {
    SOUNDS[s]();
  } catch {}
}

// src/frontend/fx.ts
var reducedMotion = () => {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
};
function temp(parent, cls, html, ms, style) {
  const el = document.createElement("div");
  el.className = cls;
  el.innerHTML = html;
  if (style)
    for (const [k, v] of Object.entries(style))
      el.style.setProperty(k, v);
  parent.appendChild(el);
  setTimeout(() => el.remove(), ms);
  return el;
}
function pulse(el, cls, ms = 900) {
  if (!el)
    return;
  el.classList.remove(cls);
  el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}
function particles(parent, glyphs, n, cls) {
  const box = document.createElement("div");
  box.className = `warp-fx-particles ${cls}`;
  for (let i = 0;i < n; i++) {
    const p = document.createElement("span");
    p.textContent = glyphs[i % glyphs.length];
    p.style.setProperty("--x", `${Math.round((Math.random() - 0.5) * 220)}px`);
    p.style.setProperty("--y", `${Math.round(-60 - Math.random() * 140)}px`);
    p.style.setProperty("--r", `${Math.round((Math.random() - 0.5) * 70)}deg`);
    p.style.setProperty("--d", `${(Math.random() * 0.35).toFixed(2)}s`);
    p.style.setProperty("--s", `${(0.8 + Math.random() * 0.8).toFixed(2)}`);
    box.appendChild(p);
  }
  parent.appendChild(box);
  setTimeout(() => box.remove(), 2200);
}
var TIER_WORD = { crit_success: "Critical!", success: "Success", partial: "Partial", fail: "Failed", crit_fail: "Disaster!" };
var TIER_TONE2 = { crit_success: "crit", success: "good", partial: "warn", fail: "bad", crit_fail: "critbad" };
var TIER_SOUND = { crit_success: "crit", success: "success", partial: "partial", fail: "fail", crit_fail: "critFail" };
function playFx(events, o) {
  if (!events.length)
    return;
  const visual = o.fx !== "off";
  const motion = o.fx === "full" && !reducedMotion();
  const sound = (s, game) => {
    if (o.sfx === "all" || o.sfx === "games" && game)
      play(s);
  };
  const stage = o.stage && o.stage.isConnected && o.stage.offsetParent !== null ? o.stage : null;
  let flips = 0, hits = 0;
  for (const e of events) {
    switch (e.kind) {
      case "roll": {
        sound("dice", false);
        sound(TIER_SOUND[e.tier] ?? "success", false);
        const row = o.message(e.messageId)?.querySelector(".warp-chips") ?? null;
        if (!visual || !row)
          break;
        const chip = row.querySelector(".warp-dice");
        pulse(chip, `warp-fx-pop`, 1400);
        pulse(row, `warp-fx-tone-${TIER_TONE2[e.tier] ?? "good"}`, 1600);
        const stamp = temp(row, `warp-fx-stamp warp-fx-${TIER_TONE2[e.tier] ?? "good"}${motion ? " moving" : ""}`, `<span class="warp-fx-die">\uD83C\uDFB2</span><b>${TIER_WORD[e.tier] ?? e.tier}</b><span class="warp-fx-label">${e.label.replace(/[<>&]/g, "")}</span>`, 2600);
        if (motion && e.crit)
          particles(stamp, e.tier === "crit_success" ? ["✦", "★", "✧"] : ["✕", "·"], 14, `warp-fx-${TIER_TONE2[e.tier]}`);
        break;
      }
      case "round": {
        if (e.tier)
          sound(TIER_SOUND[e.tier] ?? "success", true);
        if (e.ended)
          sound(e.ended === "win" ? "victory" : "defeat", true);
        const msg = o.message(e.messageId);
        if (!visual || !msg)
          break;
        const card = msg.querySelector(".warp-round-latest, .warp-enc-log .warp-round-final");
        pulse(card, `warp-fx-pop`, 1200);
        if (e.ended) {
          const host = msg.querySelector(".warp-enc-log, .warp-enc-guide") ?? msg;
          temp(host, `warp-fx-stamp warp-fx-${e.ended === "win" ? "crit" : "critbad"}${motion ? " moving" : ""}`, `<b>${e.ended === "win" ? "Over — you came out on top" : "Over — it went badly"}</b>`, 2600);
          if (motion && e.ended === "loss")
            pulse(msg, "warp-fx-shake", 600);
        }
        break;
      }
      case "reaction": {
        const s = e.reaction === "love" ? "heart" : e.reaction === "like" ? "like" : e.reaction === "neutral" ? "meh" : "chill";
        sound(s, true);
        if (!visual || !stage)
          break;
        const at = stage.querySelector(".warp-stage-portrait, .warp-stage-person, .warp-stage-scene") ?? stage;
        if (e.reaction === "love" || e.reaction === "like") {
          if (motion)
            particles(at, e.reaction === "love" ? ["\uD83D\uDC97", "\uD83D\uDC95", "\uD83D\uDC96", "♥"] : ["♥", "✧"], e.reaction === "love" ? 12 : 5, "warp-fx-hearts");
          pulse(stage, "warp-fx-warm", 1600);
        } else if (e.reaction === "dislike" || e.reaction === "hate") {
          pulse(stage, e.reaction === "hate" ? "warp-fx-frost-hard" : "warp-fx-frost", 1800);
          if (motion && e.reaction === "hate")
            pulse(stage.querySelector(".warp-stage-scene"), "warp-fx-shake", 600);
        }
        break;
      }
      case "stage": {
        sound(e.up ? "stageUp" : "stageDown", true);
        if (!visual || !stage)
          break;
        temp(stage, `warp-fx-banner ${e.up ? "up" : "down"}`, `<span>${e.up ? "Closer" : "Cooler"}</span><b>${e.label.replace(/[<>&]/g, "")}</b>`, 2800);
        if (motion && e.up)
          particles(stage, ["✦", "\uD83D\uDC97", "✧"], 18, "warp-fx-hearts");
        break;
      }
      case "dateStart":
        sound("dateStart", true);
        break;
      case "dateEnd":
        break;
      case "hit": {
        if (hits++ < 2)
          sound(e.ko ? "ko" : e.crit && e.side === "foe" ? "critHit" : e.side === "party" ? "hurt" : "hit", true);
        if (!visual || !stage)
          break;
        const el = stage.querySelector(`[data-fid="${CSS.escape(e.id)}"]`);
        if (!el)
          break;
        if (motion) {
          pulse(el, e.crit ? "warp-fx-shake-hard" : "warp-fx-shake", 600);
          temp(el, `warp-fx-number ${e.side === "party" ? "hurt" : "dmg"}${e.crit ? " crit" : ""}`, `${e.crit ? "<small>CRIT</small>" : ""}-${e.amount}`, 1300, { left: `${30 + Math.random() * 40}%` });
          if (e.crit)
            pulse(stage.querySelector(".warp-stage-arena"), "warp-fx-flash", 400);
        }
        pulse(el, "warp-fx-hurt", 700);
        if (e.ko)
          pulse(el, "warp-fx-ko", 1200);
        break;
      }
      case "heal": {
        sound("heal", true);
        const el = stage?.querySelector(`[data-fid="${CSS.escape(e.id)}"]`);
        if (!visual || !el)
          break;
        pulse(el, "warp-fx-heal", 900);
        if (motion)
          temp(el, "warp-fx-number heal", `+${e.amount}`, 1300, { left: "50%" });
        break;
      }
      case "reveal": {
        if (flips++ === 0)
          sound("flip", true);
        const el = stage?.querySelector(`[data-tile="${e.x},${e.y}"]`);
        if (visual && motion && el) {
          el.style.setProperty("--fx-delay", `${Math.min(flips, 6) * 60}ms`);
          pulse(el, "warp-fx-flip", 900);
        }
        if (visual && el && (e.tile === "treasure" || e.tile === "boss"))
          pulse(el, "warp-fx-glint", 1400);
        break;
      }
      case "step":
        sound("step", true);
        break;
      case "floor": {
        sound("floor", true);
        if (visual && stage)
          temp(stage, `warp-fx-floor${motion ? " moving" : ""}`, `<span>Floor</span><b>${e.depth}</b>`, 2200);
        break;
      }
      case "gold": {
        sound("coin", true);
        const el = stage?.querySelector(".warp-stage-gold");
        if (visual && el) {
          pulse(el, "warp-fx-glint", 1200);
          if (motion)
            temp(el, "warp-fx-number gold", `+${e.amount}`, 1300, { left: "50%" });
        }
        break;
      }
      case "loot": {
        sound("loot", true);
        const el = stage?.querySelector(".warp-stage-bag, .warp-stage-loot");
        if (visual && el) {
          pulse(el, "warp-fx-glint", 1400);
          if (motion)
            particles(el, ["✦", "✧", "·"], 10, "warp-fx-gold");
        }
        break;
      }
      case "level": {
        sound("level", true);
        if (visual && stage)
          temp(stage, "warp-fx-banner up", `<span>Level up</span><b>Level ${e.level}</b>`, 2600);
        break;
      }
      case "battle": {
        sound("battle", true);
        if (visual && stage) {
          pulse(stage.querySelector(".warp-stage-arena"), e.boss ? "warp-fx-boss" : "warp-fx-flash", 900);
        }
        break;
      }
      case "battleOver": {
        sound(e.won ? "victory" : "defeat", true);
        if (visual && stage)
          temp(stage, `warp-fx-banner ${e.won ? "up" : "down"}`, `<span>${e.won ? "Victory" : "Defeat"}</span><b>${e.won ? "The fight is won" : "You fall back"}</b>`, 2600);
        break;
      }
    }
  }
}
function typewrite(el, cps = 55) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  for (let t = walker.nextNode();t; t = walker.nextNode())
    nodes.push({ n: t, full: t.data });
  const total = nodes.reduce((a, x) => a + x.full.length, 0);
  if (total < 12)
    return () => false;
  for (const x of nodes)
    x.n.data = "";
  let shown = 0, done = false, raf = 0, last = performance.now();
  const paint = () => {
    let left = shown;
    for (const x of nodes) {
      const k = Math.max(0, Math.min(x.full.length, left));
      x.n.data = x.full.slice(0, k);
      left -= x.full.length;
    }
  };
  const tick = (now) => {
    shown = Math.min(total, shown + Math.max(1, Math.round((now - last) / 1000 * cps)));
    last = now;
    paint();
    if (shown < total)
      raf = requestAnimationFrame(tick);
    else
      done = true;
  };
  raf = requestAnimationFrame(tick);
  return () => {
    if (done)
      return false;
    cancelAnimationFrame(raf);
    shown = total;
    paint();
    done = true;
    return true;
  };
}

// src/frontend/response-gate.ts
function acceptsResponse(message, activeChat, current) {
  if (message.type === "state")
    return message.chatId === activeChat && (current?.chatId !== message.chatId || (message.revision ?? 0) >= (current.revision ?? 0));
  if (message.type === "busy")
    return message.chatId === activeChat;
  if (message.type === "builder")
    return message.chatId === undefined || message.chatId === activeChat;
  return true;
}

// src/frontend/arcade/arcade.ts
init_game_ids();

// src/frontend/arcade/kit.ts
function seeded(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0;i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
var easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
function shuffle(xs, rng) {
  const a = [...xs];
  for (let i = a.length - 1;i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function arcBeats(samples, final) {
  if (samples.length < 3)
    return final >= 0.95 ? ["flawless"] : [];
  const third = Math.max(1, Math.floor(samples.length / 3));
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const a = avg(samples.slice(0, third)), b = avg(samples.slice(third, third * 2)), c = avg(samples.slice(third * 2));
  const out = [];
  if (final >= 0.97)
    return ["flawless from start to finish"];
  if (a < 0.45 && c > a + 0.2)
    out.push("a shaky start", "found their footing", c > 0.75 ? "finished strong" : "steadied by the end");
  else if (a > 0.7 && c < a - 0.25)
    out.push("a confident start", b < a - 0.15 ? "lost the thread midway" : "held on for a while", "fell apart at the end");
  else if (b < Math.min(a, c) - 0.2)
    out.push("a good start", "a bad stumble in the middle", c > 0.6 ? "recovered" : "never quite recovered");
  else if (Math.abs(a - c) < 0.12)
    out.push(c > 0.75 ? "steady and sure throughout" : c > 0.45 ? "uneven throughout" : "struggled throughout");
  else
    out.push(c > a ? "got better as it went" : "got worse as it went");
  return out;
}
function makeCanvas(host) {
  const el = document.createElement("canvas");
  el.className = "warp-ar-canvas";
  host.appendChild(el);
  const g = el.getContext("2d");
  const subs = [];
  const c = {
    el,
    g,
    w: 1,
    h: 1,
    onResize(fn) {
      subs.push(fn);
    },
    dispose() {
      ro.disconnect();
      el.remove();
    }
  };
  const fit = () => {
    const r = host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.w = Math.max(1, r.width);
    c.h = Math.max(1, r.height);
    el.width = Math.round(c.w * dpr);
    el.height = Math.round(c.h * dpr);
    el.style.width = `${c.w}px`;
    el.style.height = `${c.h}px`;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const f of subs)
      f();
  };
  const ro = new ResizeObserver(fit);
  ro.observe(host);
  fit();
  return c;
}
function rrect(g, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

class Sparks {
  ps = [];
  burst(x, y, color, n = 14, speed = 220, size = 3) {
    for (let i = 0;i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.65);
      this.ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.4 + Math.random() * 0.45, color, size: size * (0.6 + Math.random() * 0.8) });
    }
  }
  step(dt, gravity = 0) {
    for (const p of this.ps) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += gravity * dt;
      p.vx *= 1 - dt * 2.2;
      p.vy *= 1 - dt * 2.2;
    }
    this.ps = this.ps.filter((p) => p.life < p.max);
  }
  draw(g) {
    for (const p of this.ps) {
      const k = 1 - p.life / p.max;
      g.globalAlpha = k;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size * k + 0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
}

class Floaters {
  font;
  outline;
  constructor(font = FONT_UI, outline = null) {
    this.font = font;
    this.outline = outline;
  }
  fs = [];
  add(x, y, text, color, size = 18) {
    this.fs.push({ x, y, text, color, life: 0, size });
  }
  step(dt) {
    for (const f of this.fs) {
      f.life += dt;
      f.y -= 40 * dt;
    }
    this.fs = this.fs.filter((f) => f.life < 0.7);
  }
  draw(g) {
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const f of this.fs) {
      const k = 1 - f.life / 0.7;
      g.globalAlpha = k;
      g.font = `700 ${f.size * (1 + (1 - k) * 0.15)}px ${this.font}`;
      if (this.outline) {
        g.lineWidth = 3;
        g.strokeStyle = this.outline;
        g.lineJoin = "round";
        g.strokeText(f.text, f.x, f.y);
      }
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
  }
}
var FONT_UI = `"Bahnschrift", "DIN Alternate", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif`;
function withMusic(kit, start) {
  let stop = () => {};
  kit.onPause((p) => {
    stop();
    stop = () => {};
    if (!p)
      stop = start();
  });
  return () => stop();
}

// src/frontend/arcade/songs.ts
var TIER_EASE = { easy: 0.06, normal: 0, hard: -0.06, brutal: -0.12 };
var TIER_LABEL = { easy: "Easy", normal: "Normal", hard: "Hard", brutal: "Brutal" };
var NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteMidi(n) {
  const m = /^([A-Ga-g])(#|b)?(-?\d)$/.exec(n.trim());
  if (!m)
    return null;
  return 12 * (Number(m[3]) + 1) + NAMES[m[1].toUpperCase()] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
}
function parseLine(src) {
  const out = [];
  let beat = 0, last = 1;
  for (const tok of src.split(/\s+/)) {
    if (!tok || tok === "|")
      continue;
    const [pitch, dur] = tok.split("/");
    if (dur !== undefined) {
      const [a, b] = dur.split(":");
      last = b ? Number(a) / Number(b) : Number(dur);
      if (!Number.isFinite(last) || last <= 0)
        last = 1;
    }
    if (pitch !== "-") {
      const midi = pitch.split("+").map(noteMidi).filter((x) => x !== null);
      if (midi.length)
        out.push({ b: beat, d: last, midi });
    }
    beat += last;
  }
  return out;
}
var SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 11] };
function chordsOf(tonic, mode) {
  const sc = SCALE[mode];
  const pick = mode === "major" ? [0, 3, 4, 5, 1] : [0, 3, 4, 5, 2];
  const weight = [1.2, 1.05, 1.1, 0.95, 0.85];
  return pick.map((deg, i) => {
    const tones = [0, 2, 4].map((k) => (tonic + sc[(deg + k) % 7] + (deg + k >= 7 ? 12 : 0)) % 12);
    return { root: (tonic + sc[deg]) % 12, tones, weight: weight[i] };
  });
}
function autoBacking(mel, def, beats) {
  const chords = chordsOf(def.key[0], def.key[1]);
  const span = def.harmony ?? 2;
  const out = [];
  let prev = chords[0];
  for (let b = 0;b < beats - 0.01; b += span) {
    const inside = mel.filter((n) => n.b < b + span && n.b + n.d > b);
    let best = prev, bestScore = -1;
    for (const ch of chords) {
      let sc = 0;
      for (const n of inside) {
        const w = Math.min(n.b + n.d, b + span) - Math.max(n.b, b) + (Math.abs(n.b - b) < 0.01 ? 0.75 : 0);
        for (const m of n.midi)
          sc += ch.tones.includes(m % 12) ? w : -w * 0.6;
      }
      sc *= ch.weight;
      if (ch === prev)
        sc += 0.15;
      if (sc > bestScore) {
        bestScore = sc;
        best = ch;
      }
    }
    prev = best;
    const root = 36 + best.root + (best.root > 7 ? -12 : 0);
    out.push({ b, d: span * 0.48, midi: root, voice: "bass" });
    out.push({ b: b + span / 2, d: span * 0.45, midi: root + 7, voice: "bass" });
    for (const t of best.tones)
      out.push({ b, d: span * 0.95, midi: 60 + (t - 60 % 12 + 12) % 12 - (t > 7 ? 12 : 0), voice: "pad" });
  }
  return out;
}
var DEFS = [
  {
    id: "twinkle",
    title: "Twinkle, Twinkle, Little Star",
    by: "Traditional",
    tier: "easy",
    bpm: 96,
    key: [60, "major"],
    melody: "C5/1 C5 G5 G5 | A5 A5 G5/2 | F5/1 F5 E5 E5 | D5 D5 C5/2 | G5/1 G5 F5 F5 | E5 E5 D5/2 | G5/1 G5 F5 F5 | E5 E5 D5/2 | C5/1 C5 G5 G5 | A5 A5 G5/2 | F5/1 F5 E5 E5 | D5 D5 C5/2"
  },
  {
    id: "ode",
    title: "Ode to Joy",
    by: "Beethoven",
    tier: "easy",
    bpm: 112,
    key: [60, "major"],
    melody: "E5/1 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | E5/1.5 D5/.5 D5/2 | E5/1 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | D5/1.5 C5/.5 C5/2 | D5/1 D5 E5 C5 | D5 E5/.5 F5 E5/1 C5 | D5 E5/.5 F5 E5/1 D5 | C5 D5 G4/2 | E5/1 E5 F5 G5 | G5 F5 E5 D5 | C5 C5 D5 E5 | D5/1.5 C5/.5 C5/2"
  },
  {
    id: "canon",
    title: "Canon in D",
    by: "Pachelbel",
    tier: "easy",
    bpm: 72,
    key: [62, "major"],
    melody: "F#5/2 E5 D5 C#5 | B4 A4 B4 C#5 | D5 C#5 B4 A4 | G4 F#4 G4 E4 | D4/.5 F#4 A4 G4 F#4 D4 F#4 E4 | D4 B3 D4 A4 G4 B4 A4 G4 | F#4 D4 E4 C#5 D5 F#5 A5 A4 | B4 G4 A4 F#4 D4 D5 D5/1 | F#5/1 F#5 E5 D5 C#5 B4 A4 B4 C#5/1 | D5 C#5 B4 A4 G4 F#4 G4 E4/2",
    bass: "D3/2 A2 B2 F#2 | G2 D2 G2 A2 | D3/2 A2 B2 F#2 | G2 D2 G2 A2 | D3/2 A2 B2 F#2 | G2 D2 G2 A2 | D3/2 A2 B2 F#2 | G2 D2 G2 A2/2"
  },
  {
    id: "greensleeves",
    title: "Greensleeves",
    by: "Traditional",
    tier: "normal",
    bpm: 132,
    key: [57, "minor"],
    harmony: 3,
    melody: "A4/1 | C5/2 D5/1 | E5/1.5 F5/.5 E5/1 | D5/2 B4/1 | G4/1.5 A4/.5 B4/1 | C5/2 A4/1 | A4/1.5 G#4/.5 A4/1 | B4/2 G#4/1 | E4/2 A4/1 | C5/2 D5/1 | E5/1.5 F5/.5 E5/1 | D5/2 B4/1 | G4/1.5 A4/.5 B4/1 | C5/1.5 B4/.5 A4/1 | G#4/1.5 F#4/.5 G#4/1 | A4/3 | G5/3 | G5/1.5 F#5/.5 E5/1 | D5/2 B4/1 | G4/1.5 A4/.5 B4/1 | C5/2 A4/1 | A4/1.5 G#4/.5 A4/1 | B4/2 G#4/1 | E4/3 | G5/3 | G5/1.5 F#5/.5 E5/1 | D5/2 B4/1 | G4/1.5 A4/.5 B4/1 | C5/1.5 B4/.5 A4/1 | G#4/1.5 F#4/.5 G#4/1 | A4/3",
    bass: "-/1 A2/3 C3 G2 E2 A2 E2 E2 A2 A2 C3 G2 E2 A2 E2 A2 C3 C3 G2 E2 A2 E2 E2 A2 C3 C3 G2 E2 A2 E2 A2"
  },
  {
    id: "elise",
    title: "Für Elise",
    by: "Beethoven",
    tier: "normal",
    bpm: 84,
    key: [57, "minor"],
    harmony: 1.5,
    melody: "E5/.25 D#5 | E5 D#5 E5 B4 D5 C5 | A4/.75 C4/.25 E4 A4 | B4/.75 E4/.25 G#4 B4 | C5/.75 E4/.25 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4/.75 C4/.25 E4 A4 | B4/.75 E4/.25 C5 B4 | A4/.75 B4/.25 C5 D5 | E5/.75 G4/.25 F5 E5 | D5/.75 F4/.25 E5 D5 | C5/.75 E4/.25 D5 C5 | B4/.5 E4/.25 E5 E4 E5 | E6/.25 D#5 E5 D#5 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4/.75 C4/.25 E4 A4 | B4/.75 E4/.25 G#4 B4 | C5/.75 E4/.25 E5 D#5 | E5 D#5 E5 B4 D5 C5 | A4/.75 C4/.25 E4 A4 | B4/.75 E4/.25 C5 B4 | A4/1.5"
  },
  {
    id: "mountain_king",
    title: "In the Hall of the Mountain King",
    by: "Grieg",
    tier: "normal",
    bpm: 112,
    accel: 1.6,
    key: [59, "minor"],
    melody: "B3/.5 C#4 D4 E4 F#4 D4 F#4/1 | F4/.5 C#4 F4/1 E4/.5 C4 E4/1 | B3/.5 C#4 D4 E4 F#4 D4 F#4 B4 | A4 F#4 D4 F#4 A4/2 | B3/.5 C#4 D4 E4 F#4 D4 F#4/1 | F4/.5 C#4 F4/1 E4/.5 C4 E4/1 | B3/.5 C#4 D4 E4 F#4 D4 F#4 B4 | A4 F#4 D4 F#4 A4/2 | F#4/.5 G#4 A#4 B4 C#5 A#4 C#5/1 | D5/.5 A#4 D5/1 C#5/.5 A#4 C#5/1 | F#4/.5 G#4 A#4 B4 C#5 A#4 C#5/1 | D5/.5 A#4 D5/1 C#5/2 | B4/.5 C#5 D5 E5 F#5 D5 F#5/1 | F5/.5 C#5 F5/1 E5/.5 C5 E5/1 | B4/.5 C#5 D5 E5 F#5 D5 F#5 B5 | A5 F#5 D5 F#5 A5/2",
    bass: "B2/1 F#2 B2 F#2 | C#3 F2 C3 E2 | B2 F#2 B2 F#2 | F#2 A2 D3 F#2 | B2/1 F#2 B2 F#2 | C#3 F2 C3 E2 | B2 F#2 B2 F#2 | F#2 A2 D3 F#2 | F#2 C#3 F#2 C#3 | D3 A#2 C#3 F#2 | F#2 C#3 F#2 C#3 | D3 A#2 C#3/2 | B2/1 F#2 B2 F#2 | C#3 F2 C3 E2 | B2 F#2 B2 F#2 | F#2 A2 D3 F#2"
  },
  {
    id: "entertainer",
    title: "The Entertainer",
    by: "Scott Joplin",
    tier: "normal",
    bpm: 96,
    key: [60, "major"],
    harmony: 2,
    melody: "D5/.25 D#5 | E5 C6/.5 E5/.25 C6/.5 E5/.25 C6/1.25 | C6/.25 D6 D#6 E6 C6 D6 E6/.5 B5/.25 D6/.5 C6/1.5 | D5/.25 D#5 E5 C6/.5 E5/.25 C6/.5 E5/.25 C6/1.25 | A5/.25 G5 F#5 A5 C6 E6/.5 D6/.25 C6 A5 D6/1.5 | D5/.25 D#5 E5 C6/.5 E5/.25 C6/.5 E5/.25 C6/1.25 | C6/.25 D6 D#6 E6 C6 D6 E6/.5 B5/.25 D6/.5 C6/1 | C6/.25 D6 E6 C6 D6 E6/.5 C6/.25 D6 C6 E6 C6 D6 E6/.5 | C6/.25 D6 C6 E6 C6 D6 E6/.5 B5/.25 D6/.5 C6/1.5"
  },
  {
    id: "cancan",
    title: "Galop Infernal (Can-can)",
    by: "Offenbach",
    tier: "hard",
    bpm: 152,
    key: [60, "major"],
    harmony: 2,
    repeat: 2,
    melody: "C5/1 D5/.5 F5 E5 D5 G5/1 G5 G5/.5 A5 E5 F5 D5/1 D5 D5/.5 F5 E5 D5 C5 C6 B5 A5 G5 F5 E5 D5 | C5/1 D5/.5 F5 E5 D5 G5/1 G5 G5/.5 A5 E5 F5 D5/1 D5 D5/.5 F5 E5 D5 C5 G5 E5 D5 C5/1 -/1"
  },
  {
    id: "turca",
    title: "Rondo alla Turca",
    by: "Mozart",
    tier: "hard",
    bpm: 120,
    key: [57, "minor"],
    harmony: 1,
    repeat: 2,
    melody: "B4/.25 A4 G#4 A4 C5/1 D5/.25 C5 B4 C5 E5/1 F5/.25 E5 D#5 E5 B5 A5 G#5 A5 B5 A5 G#5 A5 C6/1 A5/.5 C6 | B5/.25 A5 G5 A5 B5 A5 G5 A5 B5 A5 G5 F#5 E5/1 | B4/.25 A4 G#4 A4 C5/1 D5/.25 C5 B4 C5 E5/1 F5/.25 E5 D#5 E5 B5 A5 G#5 A5 B5 A5 G#5 A5 C6/1 A5/.5 B5 | C6/.5 B5 A5 G#5 A5 E5 F5 D5 C5/1 B4/.5 A4/1.5"
  },
  {
    id: "william_tell",
    title: "William Tell Overture (Finale)",
    by: "Rossini",
    tier: "hard",
    bpm: 150,
    key: [57, "major"],
    harmony: 2,
    repeat: 2,
    melody: "E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 B4 C#5 | E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 C#5 B4 G#4 | E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 B4 C#5 | A4/.5 C#5 E5/1.5 D5/.5 C#5 B4 A4/1 -/1 | E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 B4 C#5 | E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 C#5 B4 G#4 | E4/.25 E4 E4/.5 E4/.25 E4 E4/.5 E4/.25 E4 A4/.5 B4 C#5 | A4/.5 C#5 E5/1 C#5/.5 A4/.5 E4 A4/2"
  },
  {
    id: "bumblebee",
    title: "Flight of the Bumblebee",
    by: "Rimsky-Korsakov",
    tier: "brutal",
    bpm: 140,
    key: [57, "minor"],
    harmony: 2,
    repeat: 2,
    melody: "E6/.25 D#6 D6 C#6 D6 C#6 C6 B5 | C6 B5 A#5 A5 G#5 G5 F#5 F5 | E5 D#5 D5 C#5 C5 F5 E5 D#5 | E5 D#5 D5 C#5 C5 F5 E5 D#5 | E5 F5 E5 D#5 E5 F#5 G5 G#5 | A5 A#5 A5 G#5 A5 A#5 B5 C6 | C#6 D6 C#6 C6 C#6 D6 D#6 E6 | F6 E6 D#6 D6 C#6 C6 B5 A#5 | A5 G#5 G5 F#5 F5 E5 D#5 D5 | C#5 D5 C#5 C5 B4 C5 C#5 D5 | E5 D#5 D5 C#5 D5 C#5 C5 B4 | C5 B4 A#4 A4 G#4 G4 F#4 F4 | E4 F4 F#4 G4 G#4 A4 A#4 B4 | C5 C#5 D5 D#5 E5 F5 F#5 G5 | G#5 A5 A#5 B5 C6 C#6 D6 D#6 | E6/1 -/1 A4/1 -/1",
    bass: "A2/2 A2 A2 A2 | A2 A2 A2 A2 | D3 D3 A2 A2 | E2 E2 A2/4"
  }
];
var KOROBEINIKI = "E5/1 B4/.5 C5 D5/1 C5/.5 B4 A4/1 A4/.5 C5 E5/1 D5/.5 C5 B4/1.5 C5/.5 D5/1 E5 C5 A4 A4/2 | -/.5 D5/1 F5/.5 A5/1 G5/.5 F5 E5/1.5 C5/.5 E5/1 D5/.5 C5 B4/1 B4/.5 C5 D5/1 E5 C5 A4 A4/2";
function build(def) {
  let mel = parseLine(def.melody);
  let beats = mel.reduce((m, n) => Math.max(m, n.b + n.d), 0);
  const rep = def.repeat ?? 1;
  if (rep > 1) {
    const one = mel, len = beats;
    mel = [];
    for (let i = 0;i < rep; i++)
      mel.push(...one.map((n) => ({ ...n, b: n.b + len * i })));
    beats = len * rep;
  }
  const back = def.bass ? parseLine(def.bass).flatMap((n) => n.midi.map((m) => ({ b: n.b, d: n.d * 0.9, midi: m, voice: "bass" }))) : autoBacking(mel, def, beats);
  const accel = def.accel ?? 1;
  const secAt = (b) => {
    if (accel === 1)
      return b * 60 / def.bpm;
    const k = (accel - 1) / beats;
    return 60 / (def.bpm * k) * Math.log(1 + k * b);
  };
  const melody = mel.map((n) => ({ t: secAt(n.b), d: secAt(n.b + n.d) - secAt(n.b), midi: Math.max(...n.midi) }));
  const backing = back.filter((n) => n.b < beats).map((n) => ({ t: secAt(n.b), d: Math.max(0.05, secAt(n.b + n.d) - secAt(n.b)), midi: n.midi, voice: n.voice }));
  const length = secAt(beats);
  return { id: def.id, title: def.title, by: def.by, tier: def.tier, source: "builtin", length, melody, backing, nps: melody.length / Math.max(1, length) };
}
var built = null;
function builtinSongs() {
  if (!built)
    built = DEFS.map(build);
  return built;
}
function suggestSong(songs, level, seed) {
  const want = level < 0.3 ? "easy" : level < 0.6 ? "normal" : level < 0.85 ? "hard" : "brutal";
  const order = ["easy", "normal", "hard", "brutal"];
  for (let d = 0;d < 4; d++) {
    const pool = songs.filter((s) => Math.abs(order.indexOf(s.tier) - order.indexOf(want)) === d && s.source === "builtin");
    if (pool.length)
      return pool[Math.floor(seed() * pool.length)];
  }
  return songs[0];
}
function tileChart(notes) {
  const out = [];
  let lane = 1;
  for (let i = 0;i < notes.length; i++) {
    const n = notes[i];
    const win = notes.slice(Math.max(0, i - 6), i + 7).map((x) => x.midi);
    const lo = Math.min(...win), hi = Math.max(...win);
    let want = hi > lo ? Math.round((n.midi - lo) / (hi - lo) * 3) : lane;
    const prev = notes[i - 1];
    if (prev) {
      if (n.midi === prev.midi)
        want = lane;
      else if (want === lane)
        want = n.midi > prev.midi ? lane < 3 ? lane + 1 : lane - 1 : lane > 0 ? lane - 1 : lane + 1;
    }
    lane = Math.max(0, Math.min(3, want));
    const hold = n.d >= 0.55 ? n.d * 0.85 : 0;
    out.push({ t: n.t, lane, d: hold, midi: n.midi });
  }
  return out;
}
function aimChart(notes, seed) {
  const out = [];
  let x = 0.5, y = 0.5, ang = seed() * Math.PI * 2;
  for (let i = 0;i < notes.length; i++) {
    const n = notes[i], prev = notes[i - 1];
    if (prev) {
      const gap = n.t - prev.t;
      ang += (n.midi - prev.midi) * 0.28 + (seed() - 0.5) * 0.6;
      const dist = Math.max(0.07, Math.min(0.34, gap * 0.55));
      x += Math.cos(ang) * dist;
      y += Math.sin(ang) * dist * 0.85;
      if (x < 0.1 || x > 0.9) {
        ang = Math.PI - ang;
        x = Math.max(0.1, Math.min(0.9, x));
      }
      if (y < 0.12 || y > 0.88) {
        ang = -ang;
        y = Math.max(0.12, Math.min(0.88, y));
      }
    }
    const note = { t: n.t, x, y, midi: n.midi };
    const next = notes[i + 1];
    if (n.d >= 0.75 && (!next || next.t - n.t >= 0.75)) {
      const len = Math.min(0.32, n.d * 0.35);
      const pts = [[x, y]];
      let sx = x, sy = y, sa = ang;
      for (let k = 1;k <= 8; k++) {
        sa += (seed() - 0.5) * 0.35;
        sx += Math.cos(sa) * len / 8;
        sy += Math.sin(sa) * len / 8;
        if (sx < 0.08 || sx > 0.92) {
          sa = Math.PI - sa;
          sx = Math.max(0.08, Math.min(0.92, sx));
        }
        if (sy < 0.1 || sy > 0.9) {
          sa = -sa;
          sy = Math.max(0.1, Math.min(0.9, sy));
        }
        pts.push([sx, sy]);
      }
      note.slider = { pts, d: n.d * 0.85 };
      x = sx;
      y = sy;
      ang = sa;
    }
    out.push(note);
  }
  return out;
}
var mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// src/frontend/arcade/rhythm.ts
var JUDGE_WEIGHT = { perfect: 1, great: 0.7, ok: 0.4, miss: 0 };
var JUDGE_LABEL = { perfect: "Perfect", great: "Great", ok: "OK", miss: "Miss" };
var judgeColor = (t, j) => j === "perfect" ? t.gold : j === "great" ? t.good : j === "ok" ? t.accent2 : t.bad;
function offsetMs() {
  try {
    return Number(localStorage.getItem("warp:arcade:offset") ?? 0) || 0;
  } catch {
    return 0;
  }
}

class SongClock {
  kit;
  song;
  origin = 0;
  at = -1.6;
  running = false;
  scheduled = 0;
  stopAudio = null;
  buffer = null;
  rate;
  lead = 1.6;
  ready;
  constructor(kit, song) {
    this.kit = kit;
    this.song = song;
    this.rate = song.source === "builtin" ? 1 - kit.aid("slow") / 100 : 1;
    this.ready = song.audio ? song.audio().then(async (buf) => {
      this.buffer = buf ? await kit.synth.decode(buf) : null;
    }) : Promise.resolve();
    this.at = -this.lead;
  }
  time() {
    if (!this.running)
      return this.at;
    return (this.kit.synth.now() - this.origin) * this.rate - offsetMs() / 1000 - this.kit.synth.latency();
  }
  get length() {
    return this.song.length;
  }
  start() {
    if (this.running)
      return;
    const now = this.kit.synth.now();
    this.origin = now - this.at / this.rate;
    this.running = true;
    this.scheduled = Math.max(0, this.at);
    if (this.buffer) {
      const startAt = this.at < 0 ? now - this.at / this.rate : now;
      const from = Math.max(0, this.at);
      this.stopAudio = this.kit.synth.playBuffer(this.buffer, startAt, this.rate, from);
    }
  }
  pause() {
    if (!this.running)
      return;
    this.at = this.time() + offsetMs() / 1000 + this.kit.synth.latency();
    this.running = false;
    this.stopAudio?.();
    this.stopAudio = null;
    this.kit.synth.hush();
  }
  stop() {
    this.pause();
  }
  tick() {
    if (!this.running || !this.song.backing)
      return;
    const now = this.time();
    const until = now + 0.5;
    const toAudio = (t) => this.origin + t / this.rate;
    for (const n of this.song.backing) {
      if (n.t < this.scheduled || n.t >= until)
        continue;
      this.kit.synth.note(n.midi, toAudio(n.t), n.d / this.rate, n.voice, n.voice === "pad" ? 0.22 : n.voice === "bass" ? 0.5 : 0.35);
    }
    this.scheduled = until;
  }
  melody(midi, dur = 0.3, vel = 0.75) {
    if (midi === null || this.song.source !== "builtin")
      return;
    this.kit.synth.note(midi, this.kit.synth.now(), Math.max(0.12, dur / this.rate), "piano", vel);
  }
}
var autoplay = () => globalThis.__warpAutoplay === true;
function windows(kit) {
  const k = (1.3 - 0.55 * kit.play.level) * (1 + kit.aid("window") / 100);
  return { perfect: 0.042 * k, great: 0.085 * k, ok: 0.13 * k };
}
function judgeOf(dt, w) {
  const a = Math.abs(dt);
  if (a <= w.perfect)
    return "perfect";
  if (a <= w.great)
    return "great";
  if (a <= w.ok)
    return "ok";
  return null;
}

class Tally {
  total;
  hits = 0;
  sum = 0;
  combo = 0;
  maxCombo = 0;
  misses = 0;
  streak = 0;
  counts = { perfect: 0, great: 0, ok: 0, miss: 0 };
  window = [];
  constructor(total) {
    this.total = total;
  }
  add(j, weight = 1) {
    this.hits += weight;
    this.sum += JUDGE_WEIGHT[j] * weight;
    this.counts[j]++;
    if (j === "miss") {
      this.combo = 0;
      this.misses++;
      this.streak++;
    } else {
      this.combo++;
      this.streak = 0;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }
    this.window.push(JUDGE_WEIGHT[j]);
    if (this.window.length > 10)
      this.window.shift();
  }
  form() {
    return this.window.length ? this.window.reduce((a, b) => a + b, 0) / this.window.length : 1;
  }
  score() {
    return this.total ? this.sum / this.total * 0.9 + this.maxCombo / this.total * 0.1 : 0;
  }
  accuracy() {
    return this.hits ? this.sum / this.hits : 1;
  }
}
var missLimit = (level) => Math.round(14 - level * 8);
function aimNotes(song, rng) {
  return song.aim ??= aimChart(song.melody ?? [], rng);
}
function tileNotes(song) {
  return song.tiles ??= tileChart(song.melody ?? []);
}
function rhythmBeats(t) {
  const out = [];
  if (t.counts.miss === 0)
    out.push("never missed a beat");
  else if (t.maxCombo >= t.total * 0.6)
    out.push("one long unbroken run");
  if (t.counts.perfect >= t.total * 0.7)
    out.push("precise, almost mechanical");
  return out;
}

// src/frontend/arcade/games/aim.ts
var AIM = {
  id: "aim",
  title: "Aim",
  rhythm: true,
  howTo: [
    "Targets appear with a ring closing in — hit each one as the ring meets its edge.",
    "Long ones leave a trail: press on the head, keep holding, and follow the marker to the end.",
    "Too many misses in a row ends the song. Every hit plays the melody."
  ],
  controls: "Mouse or touch to aim · click, Z or X to hit",
  start(kit) {
    const t = kit.theme;
    const song = kit.play.song;
    const clock = new SongClock(kit, song);
    const chart = aimNotes(song, kit.rng);
    const notes = chart.map((n, i) => ({ n, i, done: false, judged: null, at: 0, holding: false, follow: 0, followN: 0, combo: i % 8 + 1 }));
    const tally = new Tally(notes.length);
    const win = windows(kit);
    const approach = (1.25 - 0.6 * kit.play.level) * (1 + kit.aid("slow") / 200);
    const limit = missLimit(kit.play.level);
    const c = kit.canvas();
    const g = c.g;
    const sparks = new Sparks, floats = new Floaters(t.fontDisplay, t.light ? "rgba(255,255,255,.7)" : null);
    const hits = [];
    let mx = -100, my = -100, down = false, keyDown = 0;
    let started = false, ended = false;
    const field = () => {
      const pad = Math.min(c.w, c.h) * 0.08;
      const w = Math.min(c.w - pad * 2, (c.h - pad * 2) * (4 / 3));
      const h = w * 0.75;
      return { x: (c.w - w) / 2, y: (c.h - h) / 2, w, h };
    };
    const radius = () => {
      const f = field();
      return Math.min(f.w, f.h) * 0.072 * (1 + kit.aid("size") / 100) * (1.22 - 0.38 * kit.play.level);
    };
    const pos = (x, y) => {
      const f = field();
      return [f.x + x * f.w, f.y + y * f.h];
    };
    const sliderPos = (n, k) => {
      const pts = n.slider.pts;
      const f = clamp(k) * (pts.length - 1);
      const i = Math.min(pts.length - 2, Math.floor(f));
      const u = f - i;
      return pos(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u);
    };
    const chipColor = t.style === "medieval" ? "#6b4426" : t.style === "modern" ? t.accent : t.accent;
    const judge = (l, j, x, y) => {
      l.judged = j;
      tally.add(j);
      floats.add(x, y - radius() * 0.2, JUDGE_LABEL[j], judgeColor(t, j), j === "miss" ? 16 : 18);
      if (j === "miss") {
        kit.synth.fx("miss");
        if (tally.streak >= limit) {
          if (kit.lives.spend("Second wind!"))
            tally.streak = 0;
          else
            end(true);
        }
      } else {
        sparks.burst(x, y, j === "perfect" ? t.gold : chipColor, j === "perfect" ? 14 : 8, 200, 2.5);
        hits.push({ x: mx, y: my, at: performance.now(), j, ang: Math.atan2(my - y, mx - x) });
        if (tally.combo > 0 && tally.combo % 25 === 0) {
          kit.synth.fx("combo");
          kit.banner(`${tally.combo} in a row`, "gold");
        }
      }
      kit.score(tally.score());
      kit.track(tally.form());
      kit.status(`${tally.combo}× combo
${Math.round(tally.accuracy() * 100)}% accuracy`);
    };
    const press = () => {
      const now = clock.time();
      const r = radius();
      const target = notes.find((l) => !l.done && l.judged === null && Math.abs(now - l.n.t) <= approach && Math.hypot(mx - pos(l.n.x, l.n.y)[0], my - pos(l.n.x, l.n.y)[1]) <= r * 1.15);
      if (!target)
        return;
      const j = judgeOf(now - target.n.t, win);
      if (!j)
        return;
      const [x, y] = pos(target.n.x, target.n.y);
      clock.melody(target.n.midi, target.n.slider ? target.n.slider.d : 0.35);
      kit.synth.fx(j === "perfect" ? "perfect" : "hit");
      if (target.n.slider) {
        target.holding = true;
        target.judged = j;
        floats.add(x, y - r * 0.2, JUDGE_LABEL[j], judgeColor(t, j), 16);
      } else {
        target.done = true;
        judge(target, j, x, y);
      }
    };
    const end = (early = false) => {
      if (ended)
        return;
      ended = true;
      clock.stop();
      for (const l of notes)
        if (!l.done && l.judged === null) {
          l.judged = "miss";
          tally.add("miss");
        }
      const beats = rhythmBeats(tally);
      if (early)
        beats.unshift("lost the rhythm and couldn't get it back");
      kit.score(tally.score());
      kit.finish({ score: tally.score(), beats, detail: `${tally.counts.perfect} perfect, ${tally.counts.miss} missed, best run ${tally.maxCombo}` });
    };
    const toLocal = (e) => {
      const r = c.el.getBoundingClientRect();
      mx = e.clientX - r.left;
      my = e.clientY - r.top;
    };
    c.el.style.cursor = "none";
    c.el.addEventListener("pointermove", toLocal);
    c.el.addEventListener("pointerdown", (e) => {
      toLocal(e);
      c.el.setPointerCapture(e.pointerId);
      if (!kit.paused) {
        down = true;
        press();
      }
    });
    c.el.addEventListener("pointerup", () => {
      down = false;
    });
    kit.onKey((e, isDown) => {
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "x")
        return false;
      if (isDown && !e.repeat) {
        keyDown++;
        press();
      } else if (!isDown)
        keyDown = Math.max(0, keyDown - 1);
      return true;
    });
    kit.onPause((p) => {
      if (p)
        clock.pause();
      else
        clock.ready.then(() => {
          if (!kit.paused && !ended) {
            clock.start();
            started = true;
          }
        });
    });
    kit.onQuit(() => end());
    kit.loop((dt) => {
      const now = clock.time();
      clock.tick();
      const r = radius();
      if (autoplay()) {
        const next = notes.find((l) => !l.done && l.judged === null);
        const hold = notes.find((l) => l.holding);
        if (hold?.n.slider) {
          [mx, my] = sliderPos(hold.n, (now - hold.n.t) / hold.n.slider.d);
          down = true;
        } else if (next) {
          const [x, y] = pos(next.n.x, next.n.y);
          mx += (x - mx) * Math.min(1, dt * 14);
          my += (y - my) * Math.min(1, dt * 14);
          down = false;
          if (now >= next.n.t) {
            mx = x;
            my = y;
            press();
          }
        }
      }
      const held = down || keyDown > 0;
      for (const l of notes) {
        if (l.done)
          continue;
        if (l.n.slider && l.holding) {
          const k = (now - l.n.t) / l.n.slider.d;
          const [bx, by] = sliderPos(l.n, k);
          l.followN++;
          if (held && Math.hypot(mx - bx, my - by) <= r * 2.4)
            l.follow++;
          if (k >= 1) {
            l.done = true;
            const ratio = l.followN ? l.follow / l.followN : 0;
            const base = l.judged ?? "ok";
            const j = ratio >= 0.85 ? base : ratio >= 0.5 ? base === "perfect" ? "great" : "ok" : "miss";
            tally.add(j);
            if (j !== "miss") {
              sparks.burst(bx, by, judgeColor(t, j), 10, 180, 2.5);
              kit.synth.fx("hit");
            } else
              kit.synth.fx("miss");
            floats.add(bx, by - r * 0.2, j === "miss" ? "Broke off" : JUDGE_LABEL[j], judgeColor(t, j), 15);
            kit.score(tally.score());
            kit.track(tally.form());
          }
        } else if (l.judged === null && now - l.n.t > win.ok) {
          l.done = true;
          const [x, y] = pos(l.n.x, l.n.y);
          judge(l, "miss", x, y);
        }
      }
      if (started && !ended && now > clock.length + 0.8)
        end();
      sparks.step(dt, t.style === "medieval" ? 400 : 0);
      floats.step(dt);
      draw(now, r);
    });
    function target(x, y, r, alpha, n) {
      g.globalAlpha = alpha;
      if (t.style === "medieval") {
        lift(g, t, 1.2);
        const rings = ["#efe4c8", "#2b2116", "#2c4a7a", "#9e2b1f", "#c9952f"];
        rings.forEach((col, i) => {
          g.fillStyle = col;
          g.beginPath();
          g.arc(x, y, r * (1 - i * 0.19), 0, Math.PI * 2);
          g.fill();
          if (i === 0)
            unlift(g);
        });
        g.strokeStyle = "rgba(43, 31, 18, .55)";
        g.lineWidth = 1;
        for (let i = 0;i < 5; i++) {
          g.beginPath();
          g.arc(x, y, r * (1 - i * 0.19), 0, Math.PI * 2);
          g.stroke();
        }
        g.strokeStyle = "#5a3d1c";
        g.lineWidth = Math.max(2, r * 0.07);
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.stroke();
      } else if (t.style === "modern") {
        lift(g, t, 1.5);
        g.fillStyle = t.accent;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        unlift(g);
        g.strokeStyle = "#fff";
        g.lineWidth = Math.max(3, r * 0.1);
        g.beginPath();
        g.arc(x, y, r - g.lineWidth / 2, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = "#fff";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `800 ${Math.round(r * 0.8)}px ${t.fontDisplay}`;
        g.fillText(String(n), x, y + 1);
      } else {
        g.fillStyle = "rgba(10, 17, 27, .85)";
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        glow(g, t, t.accent, 10);
        g.strokeStyle = t.accent;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(x, y, r - 1, 0, Math.PI * 2);
        g.stroke();
        g.shadowBlur = 0;
        g.lineWidth = 1.5;
        for (let k = 0;k < 4; k++) {
          const a = k * Math.PI / 2;
          g.beginPath();
          g.moveTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
          g.lineTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86);
          g.stroke();
        }
        g.fillStyle = t.ink;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.font = `600 ${Math.round(r * 0.62)}px ${t.fontNum}`;
        g.fillText(String(n), x, y + 1);
      }
      g.globalAlpha = 1;
    }
    function approachRing(x, y, r, k, alpha) {
      const ar = r * (1 + (1 - k) * 2.2);
      g.globalAlpha = alpha;
      if (t.style === "scifi") {
        g.setLineDash([6, 5]);
        g.strokeStyle = t.accent;
        g.lineWidth = 1.5;
      } else {
        g.strokeStyle = t.style === "medieval" ? "#2c1f12" : t.ink;
        g.lineWidth = t.style === "medieval" ? 2 : 2.5;
      }
      g.beginPath();
      g.arc(x, y, ar, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 1;
    }
    function trailOf(pts, r, alpha) {
      g.globalAlpha = alpha;
      g.lineCap = "round";
      g.lineJoin = "round";
      const path = () => {
        g.beginPath();
        pts.forEach(([px, py], i) => i ? g.lineTo(px, py) : g.moveTo(px, py));
      };
      if (t.style === "medieval") {
        path();
        g.strokeStyle = "#b48a2c";
        g.lineWidth = r * 1.5;
        g.stroke();
        path();
        g.strokeStyle = "#9e2b1f";
        g.lineWidth = r * 1.5 - 5;
        g.stroke();
        path();
        g.strokeStyle = "rgba(255,255,255,.12)";
        g.lineWidth = r * 0.3;
        g.stroke();
      } else if (t.style === "modern") {
        path();
        g.strokeStyle = t.accent;
        g.lineWidth = r * 1.7;
        g.stroke();
        path();
        g.strokeStyle = t.ground;
        g.lineWidth = r * 1.7 - 6;
        g.stroke();
      } else {
        path();
        g.strokeStyle = t.accent;
        g.lineWidth = r * 1.6;
        g.stroke();
        path();
        g.strokeStyle = "#0a111b";
        g.lineWidth = r * 1.6 - 3;
        g.stroke();
        g.setLineDash([2, 8]);
        path();
        g.strokeStyle = "rgba(94, 200, 229, .5)";
        g.lineWidth = 2;
        g.stroke();
        g.setLineDash([]);
      }
      g.globalAlpha = 1;
    }
    function marker(x, y, r) {
      if (t.style === "medieval") {
        lift(g, t);
        const gr = g.createRadialGradient(x - r * 0.25, y - r * 0.25, 1, x, y, r * 0.7);
        gr.addColorStop(0, "#f6dc8a");
        gr.addColorStop(1, "#a87b1f");
        g.fillStyle = gr;
        g.beginPath();
        g.arc(x, y, r * 0.7, 0, Math.PI * 2);
        g.fill();
        unlift(g);
        g.strokeStyle = "#6b4a12";
        g.lineWidth = 1.5;
        g.stroke();
      } else if (t.style === "modern") {
        lift(g, t);
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(x, y, r * 0.72, 0, Math.PI * 2);
        g.fill();
        unlift(g);
        g.strokeStyle = t.accent;
        g.lineWidth = 4;
        g.stroke();
      } else {
        glow(g, t, t.accent, 12);
        g.fillStyle = t.accent;
        g.beginPath();
        g.arc(x, y, r * 0.45, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      }
    }
    function struck(h) {
      const age = (performance.now() - h.at) / 700;
      if (age >= 1)
        return;
      g.globalAlpha = 1 - age;
      if (t.style === "medieval") {
        const len = 26;
        g.strokeStyle = "#4a2e16";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(h.x, h.y);
        g.lineTo(h.x + Math.cos(-0.8) * len, h.y + Math.sin(-0.8) * len);
        g.stroke();
        const fx = h.x + Math.cos(-0.8) * len, fy = h.y + Math.sin(-0.8) * len;
        g.fillStyle = "#e9e1cf";
        g.beginPath();
        g.moveTo(fx, fy);
        g.lineTo(fx + 7, fy - 2);
        g.lineTo(fx + 2, fy + 5);
        g.closePath();
        g.fill();
      } else {
        g.strokeStyle = judgeColor(t, h.j);
        g.lineWidth = 2;
        g.beginPath();
        g.arc(h.x, h.y, 6 + age * 26, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    function cursor() {
      const held = down || keyDown > 0;
      if (t.style === "medieval") {
        g.strokeStyle = held ? t.accent : "#2c1f12";
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(mx, my, 9, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.moveTo(mx - 15, my);
        g.lineTo(mx - 4, my);
        g.moveTo(mx + 4, my);
        g.lineTo(mx + 15, my);
        g.moveTo(mx, my - 15);
        g.lineTo(mx, my - 4);
        g.moveTo(mx, my + 4);
        g.lineTo(mx, my + 15);
        g.stroke();
      } else if (t.style === "modern") {
        g.fillStyle = held ? t.accent : t.ink;
        g.beginPath();
        g.arc(mx, my, 7, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#fff";
        g.lineWidth = 2;
        g.stroke();
      } else {
        g.strokeStyle = held ? t.accent2 : t.accent;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(mx - 12, my);
        g.lineTo(mx - 3, my);
        g.moveTo(mx + 3, my);
        g.lineTo(mx + 12, my);
        g.moveTo(mx, my - 12);
        g.lineTo(mx, my - 3);
        g.moveTo(mx, my + 3);
        g.lineTo(mx, my + 12);
        g.stroke();
        g.strokeRect(mx - 6.5, my - 6.5, 13, 13);
      }
    }
    function draw(now, r) {
      const f = field();
      g.clearRect(0, 0, c.w, c.h);
      ground(g, t, c.w, c.h);
      if (t.style === "scifi")
        brackets(g, f.x - r, f.y - r, f.w + r * 2, f.h + r * 2, "rgba(94, 200, 229, .35)", 18);
      else if (t.style === "medieval") {
        g.strokeStyle = "rgba(90, 61, 28, .25)";
        g.lineWidth = 1;
        g.strokeRect(f.x - r, f.y - r, f.w + r * 2, f.h + r * 2);
        g.strokeRect(f.x - r + 4, f.y - r + 4, f.w + r * 2 - 8, f.h + r * 2 - 8);
      }
      const prog = clamp(now / clock.length);
      g.fillStyle = t.line;
      g.fillRect(0, 0, c.w, 3);
      g.fillStyle = t.style === "medieval" ? t.accent : t.accent;
      g.fillRect(0, 0, c.w * prog, 3);
      const visible = notes.filter((l) => !l.done && l.n.t - now <= approach && l.n.t - now > -(l.n.slider ? l.n.slider.d + 0.2 : 0.3));
      for (let k = 0;k < visible.length - 1; k++) {
        const a = visible[k], b = visible[k + 1];
        const end0 = a.n.slider ? a.n.slider.pts[a.n.slider.pts.length - 1] : [a.n.x, a.n.y];
        const [ax, ay] = pos(end0[0], end0[1]);
        const [bx, by] = pos(b.n.x, b.n.y);
        const d = Math.hypot(bx - ax, by - ay);
        if (d < r * 2.5)
          continue;
        g.fillStyle = t.style === "scifi" ? "rgba(94, 200, 229, .35)" : t.inkSoft;
        for (let s = r * 1.3;s < d - r * 1.3; s += 14) {
          g.beginPath();
          g.arc(ax + (bx - ax) * s / d, ay + (by - ay) * s / d, 1.6, 0, Math.PI * 2);
          g.fill();
        }
      }
      for (const l of [...visible].reverse()) {
        const [x, y] = pos(l.n.x, l.n.y);
        const k = 1 - (l.n.t - now) / approach;
        const alpha = clamp(k * 2.4);
        if (l.n.slider) {
          trailOf(l.n.slider.pts.map(([px, py]) => pos(px, py)), r, alpha);
          if (l.holding) {
            const [bx, by] = sliderPos(l.n, (now - l.n.t) / l.n.slider.d);
            g.strokeStyle = t.style === "scifi" ? "rgba(94, 200, 229, .5)" : t.inkSoft;
            g.lineWidth = 1.5;
            g.setLineDash([4, 6]);
            g.beginPath();
            g.arc(bx, by, r * 2.4, 0, Math.PI * 2);
            g.stroke();
            g.setLineDash([]);
            marker(bx, by, r);
            continue;
          }
        }
        if (l.judged !== null && !l.n.slider)
          continue;
        target(x, y, r, alpha, l.combo);
        if (k < 1 && l.judged === null)
          approachRing(x, y, r, k, alpha);
      }
      for (const h of hits)
        struck(h);
      while (hits.length && performance.now() - hits[0].at > 700)
        hits.shift();
      sparks.draw(g);
      floats.draw(g);
      if (tally.combo > 1) {
        g.textAlign = "left";
        g.textBaseline = "bottom";
        g.font = `${t.style === "medieval" ? 700 : 800} ${Math.round(Math.min(40, c.h * 0.07))}px ${t.style === "scifi" ? t.fontNum : t.fontDisplay}`;
        g.fillStyle = t.style === "scifi" ? t.accent : t.ink;
        g.globalAlpha = 0.8;
        g.fillText(`${tally.combo}×`, 18, c.h - 12);
        g.globalAlpha = 1;
      }
      cursor();
    }
    return () => clock.stop();
  }
};

// src/frontend/arcade/synth.ts
var A4 = 440;
var midiHz = (m) => A4 * Math.pow(2, (m - 69) / 12);

class Synth {
  ctx;
  master = null;
  musicBus = null;
  fxBus = null;
  noise = null;
  stops = [];
  _muted = false;
  constructor(volume, muted) {
    let c = null;
    try {
      const C = window.AudioContext ?? window.webkitAudioContext;
      c = C ? new C({ latencyHint: "interactive" }) : null;
    } catch {
      c = null;
    }
    this.ctx = c;
    if (!c)
      return;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);
    this.fxBus = c.createGain();
    this.fxBus.gain.value = 0.6;
    this.fxBus.connect(this.master);
    this._muted = muted;
    this.setVolume(volume);
    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0;i < len; i++)
      d[i] = Math.random() * 2 - 1;
  }
  vol = 0.5;
  setVolume(v) {
    this.vol = Math.max(0, Math.min(1, v));
    if (this.master)
      this.master.gain.value = this._muted ? 0 : this.vol;
  }
  get muted() {
    return this._muted;
  }
  set muted(m) {
    this._muted = m;
    this.setVolume(this.vol);
  }
  resume() {
    try {
      this.ctx?.resume();
    } catch {}
  }
  now() {
    return this.ctx?.currentTime ?? performance.now() / 1000;
  }
  latency() {
    const c = this.ctx;
    return (c?.outputLatency ?? 0) + (c?.baseLatency ?? 0);
  }
  note(midi, at, dur, voice = "piano", vel = 0.7, bus = "music") {
    const c = this.ctx;
    const out = bus === "music" ? this.musicBus : this.fxBus;
    if (!c || !out)
      return;
    const t = Math.max(c.currentTime, at);
    const f = midiHz(midi);
    const g = c.createGain();
    const filt = c.createBiquadFilter();
    filt.type = "lowpass";
    g.connect(filt).connect(out);
    const oscs = [];
    const osc = (type, mult, gain, detune = 0) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = f * mult;
      o.detune.value = detune;
      const og = c.createGain();
      og.gain.value = gain;
      o.connect(og).connect(g);
      oscs.push(o);
    };
    let attack = 0.005, decay = 0.6, sustain = 0, release = 0.12, peak = vel * 0.32;
    switch (voice) {
      case "piano":
        osc("triangle", 1, 0.9);
        osc("sine", 2, 0.25);
        osc("sine", 3, 0.07);
        filt.frequency.setValueAtTime(Math.min(9000, f * 9), t);
        filt.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2), t + 0.8);
        decay = Math.max(0.35, 1.6 - (midi - 48) * 0.02);
        sustain = 0.08;
        release = 0.18;
        break;
      case "bell":
        osc("sine", 1, 0.8);
        osc("sine", 2.76, 0.3);
        osc("sine", 5.4, 0.12);
        filt.frequency.value = 9000;
        decay = 1.1;
        release = 0.4;
        peak *= 0.8;
        break;
      case "bass":
        osc("triangle", 1, 1);
        osc("sine", 0.5, 0.4);
        filt.frequency.value = 900;
        attack = 0.008;
        decay = 0.4;
        sustain = 0.45;
        release = 0.08;
        peak *= 1.2;
        break;
      case "lead":
        osc("square", 1, 0.35);
        osc("sawtooth", 1, 0.25, 7);
        filt.frequency.value = Math.min(6000, f * 6);
        attack = 0.01;
        decay = 0.15;
        sustain = 0.55;
        release = 0.08;
        peak *= 0.6;
        break;
      case "pluck":
        osc("sawtooth", 1, 0.5);
        osc("square", 2, 0.12);
        filt.frequency.setValueAtTime(f * 12, t);
        filt.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.2);
        decay = 0.25;
        release = 0.05;
        peak *= 0.7;
        break;
      case "pad":
        osc("sawtooth", 1, 0.25, -8);
        osc("sawtooth", 1, 0.25, 8);
        osc("triangle", 0.5, 0.3);
        filt.frequency.value = 1400;
        attack = 0.25;
        decay = 0.5;
        sustain = 0.7;
        release = 0.5;
        peak *= 0.35;
        break;
      case "organ":
        osc("sine", 1, 0.6);
        osc("sine", 2, 0.35);
        osc("sine", 4, 0.15);
        osc("sine", 0.5, 0.25);
        filt.frequency.value = 5000;
        attack = 0.015;
        decay = 0.2;
        sustain = 0.8;
        release = 0.1;
        peak *= 0.55;
        break;
    }
    const end = t + Math.max(dur, attack + 0.02);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * sustain + 0.0002), t + attack + decay);
    g.gain.setValueAtTime(Math.max(0.0002, peak * sustain + 0.0002), end);
    g.gain.exponentialRampToValueAtTime(0.0001, end + release);
    for (const o of oscs) {
      o.start(t);
      o.stop(end + release + 0.05);
    }
  }
  drum(kind, at, vel = 0.7, bus = "music") {
    const c = this.ctx;
    const out = bus === "music" ? this.musicBus : this.fxBus;
    if (!c || !out || !this.noise)
      return;
    const t = Math.max(c.currentTime, at);
    if (kind === "kick") {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(vel * 0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.25);
      return;
    }
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter(), g = c.createGain();
    const len = kind === "hat" ? 0.05 : kind === "clap" ? 0.14 : 0.16;
    f.type = kind === "hat" ? "highpass" : "bandpass";
    f.frequency.value = kind === "hat" ? 7000 : kind === "clap" ? 1500 : 1800;
    g.gain.setValueAtTime(vel * (kind === "hat" ? 0.25 : 0.5), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + len + 0.02);
    if (kind === "snare") {
      const o = c.createOscillator(), og = c.createGain();
      o.frequency.value = 190;
      og.gain.setValueAtTime(vel * 0.3, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(og).connect(out);
      o.start(t);
      o.stop(t + 0.12);
    }
  }
  blip(f1, f2, dur, type = "square", vel = 0.4, at = 0) {
    const c = this.ctx;
    if (!c || !this.fxBus)
      return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    g.gain.setValueAtTime(vel * 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.fxBus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  hiss(dur, freq, vel = 0.4, at = 0, type = "bandpass") {
    const c = this.ctx;
    if (!c || !this.fxBus || !this.noise)
      return;
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter(), g = c.createGain();
    f.type = type;
    f.frequency.value = freq;
    g.gain.setValueAtTime(vel * 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.fxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
  fx(name, pitch = 0) {
    const c = this.ctx;
    if (!c)
      return;
    const t = c.currentTime;
    const n = (m, at, d, v = "bell", vel = 0.6) => this.note(m + pitch, t + at, d, v, vel, "fx");
    switch (name) {
      case "tick":
        this.blip(1800, 1400, 0.03, "square", 0.25);
        break;
      case "click":
        this.blip(900, 600, 0.04, "triangle", 0.4);
        break;
      case "hit":
        this.hiss(0.05, 6000, 0.35, 0, "highpass");
        this.blip(1200, 900, 0.05, "triangle", 0.3);
        break;
      case "perfect":
        this.hiss(0.05, 8000, 0.4, 0, "highpass");
        n(96, 0, 0.12, "bell", 0.3);
        break;
      case "miss":
        this.blip(220, 110, 0.18, "sawtooth", 0.35);
        break;
      case "combo":
        n(84, 0, 0.1);
        n(88, 0.06, 0.1);
        n(91, 0.12, 0.18);
        break;
      case "flag":
        this.blip(700, 1100, 0.07, "triangle", 0.4);
        break;
      case "reveal":
        this.blip(500 + pitch * 30, 700 + pitch * 30, 0.04, "triangle", 0.25);
        break;
      case "boom":
        this.hiss(0.6, 300, 1, 0, "lowpass");
        this.blip(120, 30, 0.5, "sawtooth", 0.8);
        break;
      case "win":
        n(72, 0, 0.15, "bell");
        n(76, 0.1, 0.15, "bell");
        n(79, 0.2, 0.15, "bell");
        n(84, 0.3, 0.5, "bell", 0.8);
        break;
      case "lose":
        n(67, 0, 0.25, "piano");
        n(63, 0.22, 0.25, "piano");
        n(60, 0.44, 0.6, "piano");
        break;
      case "life":
        n(79, 0, 0.1, "bell");
        n(86, 0.08, 0.3, "bell");
        break;
      case "line":
        n(76, 0, 0.08, "pluck");
        n(83, 0.05, 0.12, "pluck");
        break;
      case "tetris":
        n(72, 0, 0.1, "pluck");
        n(76, 0.06, 0.1, "pluck");
        n(79, 0.12, 0.1, "pluck");
        n(84, 0.18, 0.3, "bell");
        break;
      case "drop":
        this.blip(300, 120, 0.08, "triangle", 0.5);
        break;
      case "rotate":
        this.blip(900, 1000, 0.03, "square", 0.15);
        break;
      case "eat":
        this.blip(600, 1200, 0.08, "square", 0.3);
        break;
      case "crash":
        this.hiss(0.3, 600, 0.8);
        this.blip(200, 50, 0.3, "sawtooth", 0.6);
        break;
      case "step":
        this.hiss(0.04, 900, 0.3, 0, "lowpass");
        break;
      case "stumble":
        this.hiss(0.18, 400, 0.6, 0, "lowpass");
        this.blip(300, 120, 0.15, "triangle", 0.4);
        break;
      case "whistle":
        this.blip(2400, 2600, 0.35, "sine", 0.5);
        this.blip(2400, 2500, 0.2, "sine", 0.4, 0.4);
        break;
      case "cheer":
        this.hiss(1.2, 1500, 0.5);
        this.hiss(1, 3000, 0.3, 0.1);
        break;
      case "flipper":
        this.blip(180, 90, 0.06, "square", 0.35);
        this.hiss(0.04, 2000, 0.25);
        break;
      case "bumper":
        this.blip(1300 + pitch * 50, 500, 0.1, "square", 0.45);
        break;
      case "launch":
        this.hiss(0.3, 1200, 0.5);
        this.blip(200, 900, 0.25, "sawtooth", 0.4);
        break;
      case "drain":
        this.blip(500, 60, 0.6, "sawtooth", 0.5);
        break;
      case "target":
        n(88, 0, 0.12, "bell", 0.5);
        break;
      case "card":
        this.hiss(0.06, 3500, 0.5);
        break;
      case "shuffle":
        for (let i = 0;i < 8; i++)
          this.hiss(0.03, 3000, 0.3, i * 0.035);
        break;
      case "chip":
        this.blip(2600, 2200, 0.03, "triangle", 0.35);
        this.blip(3100, 2900, 0.03, "triangle", 0.25, 0.035);
        break;
      case "spin":
        this.hiss(1.4, 700, 0.25);
        break;
      case "ball":
        this.blip(2200 + Math.random() * 400, 1800, 0.02, "triangle", 0.25);
        break;
      case "reel":
        this.blip(800, 760, 0.02, "square", 0.12);
        break;
      case "stop":
        this.blip(400, 200, 0.07, "square", 0.45);
        this.hiss(0.05, 1500, 0.3);
        break;
      case "coins":
        for (let i = 0;i < 6; i++)
          this.blip(2400 + i * 120, 2000, 0.05, "triangle", 0.3, i * 0.06);
        break;
      case "jackpot":
        for (let i = 0;i < 12; i++)
          n(72 + [0, 4, 7, 12][i % 4] + Math.floor(i / 4) * 12 - 12, i * 0.07, 0.1, "bell", 0.5);
        break;
      case "countdown":
        n(81, 0, 0.12, "bell", 0.5);
        break;
      case "go":
        n(93, 0, 0.3, "bell", 0.7);
        n(88, 0, 0.3, "bell", 0.5);
        break;
    }
  }
  schedule(notes) {
    for (const n of notes)
      this.note(n.midi, n.at, n.dur, n.voice, n.vel ?? 0.6);
  }
  loop(bpm, bar, beatsPerBar = 4) {
    const c = this.ctx;
    if (!c)
      return () => {};
    let next = c.currentTime + 0.1, i = 0, alive = true;
    const tick = () => {
      if (!alive)
        return;
      while (next < c.currentTime + 0.35) {
        const beat = 60 / bpm();
        bar(i++, next, beat);
        next += beat * beatsPerBar;
      }
    };
    const id = window.setInterval(tick, 60);
    tick();
    const stop = () => {
      alive = false;
      window.clearInterval(id);
    };
    this.stops.push(stop);
    return stop;
  }
  hush() {
    for (const s of this.stops)
      s();
    this.stops = [];
    const c = this.ctx;
    if (c && this.musicBus) {
      const g = this.musicBus.gain;
      g.cancelScheduledValues(c.currentTime);
      g.setValueAtTime(g.value, c.currentTime);
      g.linearRampToValueAtTime(0, c.currentTime + 0.25);
      const fresh = c.createGain();
      fresh.gain.value = 0.55;
      fresh.connect(this.master);
      this.musicBus = fresh;
    }
  }
  close() {
    this.hush();
    try {
      this.ctx?.close();
    } catch {}
  }
  async decode(data) {
    if (!this.ctx)
      return null;
    try {
      return await this.ctx.decodeAudioData(data.slice(0));
    } catch {
      return null;
    }
  }
  playBuffer(buf, at, rate = 1, offset = 0) {
    const c = this.ctx;
    if (!c || !this.musicBus)
      return () => {};
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = 1.4;
    src.connect(g).connect(this.musicBus);
    src.start(at, offset);
    const stop = () => {
      try {
        src.stop();
      } catch {}
    };
    this.stops.push(stop);
    return stop;
  }
}
var PROG = {
  bright: { root: 60, chords: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]] },
  drive: { root: 57, chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]] },
  tense: { root: 62, chords: [[0, 3, 7], [0, 3, 7], [-4, 0, 3], [-5, -1, 2]] },
  lounge: { root: 60, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 5]] }
};
function backing(s, mood, speed = () => 1) {
  const p = PROG[mood === "retro" ? "drive" : mood];
  const base = mood === "lounge" ? 96 : mood === "tense" ? 92 : mood === "retro" ? 136 : mood === "drive" ? 128 : 120;
  return s.loop(() => base * speed(), (i, at, beat) => {
    const ch = p.chords[i % p.chords.length];
    const root = p.root + ch[0] - 24;
    if (mood === "lounge") {
      const walk = [0, 4, 7, 9].map((x) => root + x);
      walk.forEach((m, k) => s.note(m, at + k * beat, beat * 0.9, "bass", 0.55));
      for (const k of [1, 3])
        for (const x of ch)
          s.note(p.root + x, at + k * beat, beat * 0.6, "piano", 0.25);
      for (let k = 0;k < 4; k++)
        s.drum("hat", at + k * beat + beat * 0.66, 0.25);
      return;
    }
    if (mood === "tense") {
      s.note(root, at, beat * 4, "pad", 0.5);
      for (let k = 0;k < 8; k++)
        s.note(p.root + ch[k % ch.length] + (k % 4 === 3 ? 12 : 0), at + k * beat / 2, beat / 2, "pluck", 0.25);
      s.drum("kick", at, 0.5);
      s.drum("kick", at + beat * 2.5, 0.35);
      return;
    }
    const arp = [0, 1, 2, 1, 0, 1, 2, 1].map((k) => p.root + ch[k % ch.length] + (mood === "retro" ? 12 : 0));
    arp.forEach((m, k) => s.note(m, at + k * beat / 2, beat / 2 * 0.9, mood === "retro" ? "lead" : "pluck", 0.22));
    for (let k = 0;k < 4; k++)
      s.note(root + (k % 2 ? 7 : 0), at + k * beat, beat * 0.8, "bass", 0.5);
    for (let k = 0;k < 4; k++) {
      s.drum(k % 2 ? "snare" : "kick", at + k * beat, 0.45);
      s.drum("hat", at + k * beat + beat / 2, 0.3);
    }
  });
}

// src/frontend/arcade/games/blackjack.ts
var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
var SUITS = ["♠", "♥", "♦", "♣"];
function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    const v = c.r === 0 ? 11 : Math.min(10, c.r + 1);
    total += v;
    if (c.r === 0)
      aces++;
  }
  while (total > 21 && aces) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}
function advice(player, dealerUp, canDouble) {
  const { total, soft } = handValue(player);
  const d = dealerUp.r === 0 ? 11 : Math.min(10, dealerUp.r + 1);
  if (soft) {
    if (total >= 19)
      return "stand";
    if (total === 18)
      return d >= 9 ? "hit" : canDouble && d >= 3 && d <= 6 ? "double" : "stand";
    return canDouble && d >= 4 && d <= 6 ? "double" : "hit";
  }
  if (total >= 17)
    return "stand";
  if (total >= 13)
    return d <= 6 ? "stand" : "hit";
  if (total === 12)
    return d >= 4 && d <= 6 ? "stand" : "hit";
  if (total === 11)
    return canDouble ? "double" : "hit";
  if (total === 10)
    return canDouble && d <= 9 ? "double" : "hit";
  if (total === 9)
    return canDouble && d >= 3 && d <= 6 ? "double" : "hit";
  return "hit";
}
var CSS2 = `
.bj { position: absolute; inset: 0; display: grid; grid-template-rows: 1fr auto 1fr auto; padding: 18px 18px 14px; gap: 8px; overflow: hidden;
  background: var(--bj-table); color: var(--bj-ink); font-family: var(--ar-ui); }
.bj::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: var(--bj-sheen, none); }
.bj-arc { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); width: min(70%, 620px); text-align: center; font: 600 11px/1.6 var(--bj-font); letter-spacing: .26em; color: var(--bj-dim); text-transform: uppercase; pointer-events: none; transition: opacity .2s; }
.bj:has(.bj-msg) .bj-arc { opacity: .1; }
.bj-arc b { display: block; font-size: 15px; letter-spacing: .2em; color: var(--bj-gold); font-weight: 700; }
.bj-side { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
.bj-label { font: 700 11px var(--bj-font); letter-spacing: .2em; text-transform: uppercase; color: var(--bj-dim); display: flex; gap: 10px; align-items: center; }
.bj-total { font: 700 15px var(--ar-num); padding: 2px 10px; border-radius: var(--bj-pill, 999px); background: var(--bj-plate); color: var(--bj-ink); letter-spacing: 0; }
.bj-total.bust { background: var(--ar-bad); color: #fff; } .bj-total.bj21 { background: var(--bj-gold); color: #1d1405; }
.bj-hand { display: flex; justify-content: center; min-height: calc(var(--cw) * 1.4); }
.bj-card { width: var(--cw); height: calc(var(--cw) * 1.4); margin-left: calc(var(--cw) * -0.38); border-radius: var(--card-r, calc(var(--cw) * .08)); position: relative; perspective: 600px; animation: bj-deal .38s cubic-bezier(.2,.9,.25,1) both; }
.bj-card:first-child { margin-left: 0; }
@keyframes bj-deal { from { transform: translate(40vw, -30vh) rotate(-30deg); opacity: 0; } }
.bj-face, .bj-back { position: absolute; inset: 0; border-radius: inherit; backface-visibility: hidden; transition: transform .45s cubic-bezier(.3,.7,.3,1); box-shadow: var(--card-shadow, 0 4px 12px rgba(0,0,0,.3)); }
.bj-face { background: var(--card-face); color: var(--card-black); display: grid; box-shadow: var(--card-shadow, 0 4px 12px rgba(0,0,0,.3)), inset 0 0 0 1px var(--card-edge, rgba(0,0,0,.12)); }
.bj-face.red { color: var(--card-red); }
.bj-face .c { position: absolute; font: 700 calc(var(--cw) * .2)/1 var(--card-font); text-align: center; }
.bj-face .c.tl { top: 6%; left: 8%; } .bj-face .c.br { bottom: 6%; right: 8%; transform: rotate(180deg); }
.bj-face .c i { display: block; font-style: normal; font-size: .8em; }
.bj-face .pip { place-self: center; font: 400 calc(var(--cw) * .5)/1 var(--card-font); }
.bj-back { transform: rotateY(180deg); background: var(--card-back); }
.bj-card.down .bj-face { transform: rotateY(180deg); } .bj-card.down .bj-back { transform: rotateY(0); }
.bj-card.peek .bj-back { opacity: .3; }
.bj-card.peek .bj-face { transform: none; opacity: .85; outline: 2px dashed var(--bj-gold); }
.bj-mid { display: flex; justify-content: center; align-items: center; gap: 18px; min-height: 44px; position: relative; }
.bj-msg { font: 700 clamp(20px, 3.2vw, 28px) var(--bj-font); letter-spacing: .05em; padding: 4px 18px; border-radius: var(--bj-pill, 999px); background: var(--bj-plate); animation: bj-pop .4s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes bj-pop { from { transform: scale(.7); opacity: 0; } }
.bj-msg.win { color: var(--bj-win); } .bj-msg.lose { color: var(--bj-lose); } .bj-msg.push { color: var(--bj-ink); }
.bj-bar { position: relative; display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap; }
.bj .bj-btn { min-width: 96px; padding: 11px 18px; border-radius: var(--bj-pill, 999px); border: 1px solid var(--bj-line); background: var(--bj-plate); color: var(--bj-ink); font: 700 13.5px var(--bj-font); letter-spacing: .08em; text-transform: uppercase; cursor: pointer; transition: transform .1s, background .12s, border-color .12s; }
.bj .bj-btn:hover:not(:disabled) { border-color: var(--bj-gold); }
.bj .bj-btn:active:not(:disabled) { transform: translateY(1px); }
.bj .bj-btn:disabled { opacity: .35; cursor: not-allowed; }
.bj .bj-btn.main { background: var(--bj-main); color: var(--bj-on-main); border-color: transparent; }
.bj .bj-btn.tip { box-shadow: 0 0 0 2px var(--bj-tip); }
.bj .bj-btn kbd { opacity: .55; font: 600 10px var(--ar-num); margin-left: 6px; }
.bj-bets { display: flex; gap: 10px; align-items: center; }
.bj .bj-chip { width: 52px; height: 52px; border-radius: 50%; border: 0; cursor: pointer; display: grid; place-items: center; font: 700 12px var(--ar-num); color: #1b1b1b;
  background: radial-gradient(circle, #fbf8f1 0 36%, transparent 37%), repeating-conic-gradient(var(--chip) 0 22.5deg, #f4efe4 22.5deg 30deg); box-shadow: 0 3px 8px rgba(0,0,0,.35), inset 0 0 0 3px rgba(0,0,0,.12); transition: transform .12s; }
.bj .bj-chip.on { transform: translateY(-5px); box-shadow: 0 0 0 3px var(--bj-gold), 0 8px 16px rgba(0,0,0,.4); }
.bj .bj-chip:disabled { opacity: .3; }
.bj-info { font: 500 12.5px var(--ar-num); color: var(--bj-dim); }
.bj-tip { font: 500 13px var(--ar-ui); color: var(--bj-tip); }

/* modern: green baize under soft light, white cards, navy backs */
.bj[data-style=modern] { --bj-table: radial-gradient(ellipse 90% 75% at 50% 40%, #2a7a5a, #1c5a42 60%, #123c2c); --bj-ink: #f6f4ef; --bj-dim: rgba(246, 244, 239, .6); --bj-gold: #f2d27a;
  --bj-plate: rgba(0, 0, 0, .22); --bj-line: rgba(255, 255, 255, .22); --bj-main: #ffffff; --bj-on-main: #1d1d1f; --bj-win: #f2d27a; --bj-lose: #ffb4a8; --bj-tip: #9be5bd; --bj-font: var(--ar-display);
  --card-face: #ffffff; --card-red: #d23434; --card-black: #1d1d1f; --card-font: var(--ar-display); --card-back: repeating-linear-gradient(45deg, #24407a 0 5px, #2c4c8e 5px 10px); --card-shadow: 0 6px 14px rgba(0,0,0,.25); }
.bj[data-style=modern] .bj-back { border: 5px solid #fff; }

/* medieval: an oak tavern table, parchment cards, crimson backs with gilt lattice, gold coins */
.bj[data-style=medieval] { --bj-table: var(--ar-wood) 0 0 / 256px; --bj-sheen: radial-gradient(ellipse 70% 60% at 50% 45%, rgba(255, 210, 140, .12), transparent 70%), radial-gradient(ellipse at center, transparent 45%, rgba(10, 5, 0, .65) 100%);
  --bj-ink: #ecdfbf; --bj-dim: rgba(236, 223, 191, .6); --bj-gold: #e9c46a; --bj-plate: rgba(20, 10, 2, .5); --bj-line: rgba(214, 181, 106, .5); --bj-pill: 2px;
  --bj-main: #9e2b1f; --bj-on-main: #f3e7c8; --bj-win: #e9c46a; --bj-lose: #e8a090; --bj-tip: #a8d08d; --bj-font: var(--ar-display);
  --card-face: var(--ar-parch) 0 0 / 512px; --card-red: #9e2b1f; --card-black: #231a10; --card-font: var(--ar-display); --card-r: 4px; --card-edge: rgba(90, 61, 28, .45);
  --card-back: linear-gradient(45deg, transparent 46%, rgba(233,196,106,.55) 47% 53%, transparent 54%) 0 0 / 14px 14px, linear-gradient(-45deg, transparent 46%, rgba(233,196,106,.55) 47% 53%, transparent 54%) 0 0 / 14px 14px, #7a1f17;
  --card-shadow: 0 4px 10px rgba(20, 10, 2, .5); }
.bj[data-style=medieval] .bj-back { box-shadow: var(--card-shadow), inset 0 0 0 3px #e9c46a, inset 0 0 0 5px #7a1f17, inset 0 0 0 6px rgba(233,196,106,.6); }
.bj[data-style=medieval] .bj-btn.main { box-shadow: inset 0 0 0 2px #9e2b1f, inset 0 0 0 3px rgba(233, 196, 106, .7); }
.bj[data-style=medieval] .bj-chip { width: 50px; height: 50px; color: #3a2508; font-family: var(--ar-display); font-weight: 700;
  background: radial-gradient(circle at 35% 30%, #f6dc8a, #c9952f 55%, #8a6214 100%); box-shadow: 0 3px 6px rgba(20,10,2,.5), inset 0 0 0 3px rgba(107,74,18,.5), inset 0 0 0 6px rgba(246,220,138,.35); }
.bj[data-style=medieval] .bj-chip:nth-child(2) { background: radial-gradient(circle at 35% 30%, #f1f1ea, #b8b6ab 55%, #6f6c61 100%); }
.bj[data-style=medieval] .bj-chip:nth-child(1) { background: radial-gradient(circle at 35% 30%, #f0b98a, #b5703a 55%, #6b3a14 100%); }
.bj[data-style=medieval] .bj-msg, .bj[data-style=medieval] .bj-total { font-family: var(--ar-display); }

/* sci-fi: a dark holo-table, light cards, mono readouts */
.bj[data-style=scifi] { --bj-table: radial-gradient(ellipse 80% 65% at 50% 45%, #0f2132, #0a1622 60%, #060c13); --bj-sheen: radial-gradient(ellipse 46% 34% at 50% 46%, transparent 98%, rgba(94,200,229,.35) 99%, transparent 100%);
  --bj-ink: #d6e2ee; --bj-dim: rgba(142, 163, 184, .8); --bj-gold: #f2c14e; --bj-plate: rgba(10, 17, 27, .85); --bj-line: rgba(94, 200, 229, .35); --bj-pill: 0px;
  --bj-main: rgba(94, 200, 229, .16); --bj-on-main: #5ec8e5; --bj-win: #5fd3a0; --bj-lose: #ef6461; --bj-tip: #5fd3a0; --bj-font: var(--ar-display);
  --card-face: linear-gradient(160deg, #eef2f6, #d9e1e9); --card-red: #c4364e; --card-black: #15202c; --card-font: var(--ar-num); --card-r: 3px;
  --card-back: repeating-linear-gradient(60deg, rgba(94,200,229,.18) 0 1px, transparent 1px 9px), repeating-linear-gradient(-60deg, rgba(94,200,229,.18) 0 1px, transparent 1px 9px), #0d1a28; --card-shadow: 0 4px 12px rgba(0,0,0,.5); }
.bj[data-style=scifi] .bj-back { box-shadow: var(--card-shadow), inset 0 0 0 1px #5ec8e5; }
.bj[data-style=scifi] .bj-btn.main { border-color: #5ec8e5; }
.bj[data-style=scifi] .bj-chip { border-radius: 0; width: 58px; height: 40px; background: rgba(10,17,27,.9); color: #d6e2ee; box-shadow: inset 0 0 0 1px rgba(120,170,210,.35); clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }
.bj[data-style=scifi] .bj-chip.on { transform: none; color: #5ec8e5; box-shadow: inset 0 0 0 1px #5ec8e5; background: rgba(94,200,229,.14); }
.bj[data-style=scifi] .bj-arc { font-family: var(--ar-num); }
`;
var BLACKJACK = {
  id: "blackjack",
  title: "Blackjack",
  howTo: [
    "Pick a bet, then get closer to 21 than the dealer without going over.",
    "Hit for another card, Stand to stop, Double to double the bet for exactly one more card.",
    "Aces count 1 or 11; face cards 10. Blackjack (an ace and a ten) pays extra."
  ],
  controls: "H hit · S stand · D double · Enter deal · 1–3 bet size",
  start(kit) {
    const L = kit.play.level;
    const gamble = kit.play.mode === "gamble";
    const start = gamble ? kit.play.stake : 100;
    const hands = gamble ? kit.play.rounds ?? 5 : 5;
    const edge = kit.play.edge ?? 0;
    const hitsSoft17 = gamble ? edge > 0.025 : L >= 0.45;
    const bjPays = (gamble ? edge > 0.045 : L >= 0.75) ? 1.2 : 1.5;
    const peek = kit.aid("peek") > 0;
    let reads = kit.aid("hint");
    const unit = Math.max(1, Math.round(start / 10));
    const betOptions = [unit, unit * 2, unit * 5];
    let bet = betOptions[1];
    let chips = start, hand = 0, phase = "bet", over = false;
    let shoe = [];
    let player = [], dealer = [], stake = 0, doubled = false;
    let wins = 0, losses = 0, pushes = 0, blackjacks = 0, busts = 0, saved = 0;
    let bestMoment = "";
    const fill = () => {
      shoe = shuffle(Array.from({ length: 312 }, (_, i) => ({ r: i % 13, s: Math.floor(i / 13) % 4 })), kit.rng);
      kit.synth.fx("shuffle");
    };
    fill();
    const draw = () => {
      if (shoe.length < 20)
        fill();
      return shoe.pop();
    };
    const root = document.createElement("div");
    root.className = "bj";
    root.dataset.style = kit.theme.style;
    root.innerHTML = `<style>${CSS2}</style>
      <div class="bj-arc"><b>Blackjack pays ${bjPays === 1.5 ? "3 to 2" : "6 to 5"}</b>Dealer ${hitsSoft17 ? "hits" : "stands on"} soft 17</div>
      <div class="bj-side"><div class="bj-label">Dealer <span class="bj-total" data-dt></span></div><div class="bj-hand" data-dealer></div></div>
      <div class="bj-mid" data-msg></div>
      <div class="bj-side"><div class="bj-hand" data-player></div><div class="bj-label">You <span class="bj-total" data-pt></span></div></div>
      <div class="bj-bar" data-bar></div>`;
    kit.root.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const size = () => {
      const r = root.getBoundingClientRect();
      root.style.setProperty("--cw", `${Math.max(48, Math.min(104, Math.min(r.width / 7, r.height / 6.2)))}px`);
    };
    const ro = new ResizeObserver(size);
    ro.observe(root);
    size();
    const cardHtml = (c, down = false) => {
      const red = c.s === 1 || c.s === 2;
      return `<div class="bj-card${down ? peek ? " down peek" : " down" : ""}"><div class="bj-face${red ? " red" : ""}"><span class="c tl">${RANKS[c.r]}<i>${SUITS[c.s]}</i></span><span class="pip">${c.r >= 10 ? ["J", "Q", "K"][c.r - 10] : SUITS[c.s]}</span><span class="c br">${RANKS[c.r]}<i>${SUITS[c.s]}</i></span></div><div class="bj-back"></div></div>`;
    };
    const showHands = (hideHole) => {
      const put = (el, cards, hide) => {
        while (el.children.length > cards.length)
          el.lastElementChild.remove();
        for (let i = el.children.length;i < cards.length; i++)
          el.insertAdjacentHTML("beforeend", cardHtml(cards[i], i === hide));
        if (hide < 0)
          el.querySelectorAll(".bj-card.down").forEach((x) => x.classList.remove("down", "peek"));
      };
      put($("[data-dealer]"), dealer, hideHole ? 1 : -1);
      put($("[data-player]"), player, -1);
      const pv = handValue(player), dv = handValue(hideHole ? dealer.slice(0, 1) : dealer);
      const pt = $("[data-pt]"), dt = $("[data-dt]");
      pt.textContent = player.length ? `${pv.soft && pv.total < 21 ? "soft " : ""}${pv.total}` : "";
      pt.className = `bj-total${pv.total > 21 ? " bust" : pv.total === 21 && player.length === 2 ? " bj21" : ""}`;
      dt.textContent = dealer.length ? hideHole ? `${dv.total}${peek ? ` · ${handValue(dealer).total}` : " + ?"}` : String(dv.total) : "";
      dt.className = `bj-total${!hideHole && dv.total > 21 ? " bust" : ""}`;
    };
    const msg = (text, cls = "") => {
      $("[data-msg]").innerHTML = text ? `<div class="bj-msg ${cls}">${text}</div>` : "";
    };
    const sync = () => {
      kit.chips(chips);
      if (!gamble)
        kit.track(clamp(chips / (start * 2)));
      kit.status(`Hand ${Math.min(hand + 1, hands)} of ${hands}
Chips ${Math.round(chips)}`);
    };
    const tip = () => reads > 0 && phase === "play" ? advice(player, dealer[0], player.length === 2 && chips >= stake) : null;
    const bar = () => {
      const b = $("[data-bar]");
      if (phase === "bet") {
        b.innerHTML = `<div class="bj-bets">${betOptions.map((x, i) => `<button class="bj-chip${x === bet ? " on" : ""}" style="--chip:${["#b8352a", "#2f5fa8", "#2a7a4b"][i]}" data-bet="${x}" ${x > chips ? "disabled" : ""}>${x}</button>`).join("")}</div>
          <button class="bj-btn main" data-deal ${bet > chips ? "disabled" : ""}>Deal <kbd>Enter</kbd></button>
          ${gamble && hand > 0 ? `<button class="bj-btn" data-leave>Cash out</button>` : ""}
          <span class="bj-info">${kit.play.currency ?? ""}${Math.round(chips)} in chips</span>`;
      } else if (phase === "play") {
        const t = tip();
        b.innerHTML = `<button class="bj-btn main${t === "hit" ? " tip" : ""}" data-hit>Hit <kbd>H</kbd></button>
          <button class="bj-btn${t === "stand" ? " tip" : ""}" data-stand>Stand <kbd>S</kbd></button>
          <button class="bj-btn${t === "double" ? " tip" : ""}" data-double ${player.length === 2 && chips >= stake ? "" : "disabled"}>Double <kbd>D</kbd></button>
          ${t ? `<span class="bj-tip">A whisper: ${t}</span>` : ""}`;
      } else
        b.innerHTML = `<span class="bj-info">…</span>`;
    };
    const deal = () => {
      if (over || phase !== "bet" || bet > chips)
        return;
      stake = bet;
      chips -= stake;
      doubled = false;
      player = [draw(), draw()];
      dealer = [draw(), draw()];
      $("[data-dealer]").innerHTML = "";
      $("[data-player]").innerHTML = "";
      kit.synth.fx("card");
      setTimeout(() => kit.synth.fx("card"), 120);
      phase = "play";
      msg("");
      showHands(true);
      sync();
      const pv = handValue(player).total, dv = handValue(dealer).total;
      if (pv === 21 || dv === 21) {
        setTimeout(() => settle(), 600);
        return;
      }
      bar();
    };
    const hit = () => {
      if (phase !== "play")
        return;
      if (reads > 0 && tip())
        reads--;
      player.push(draw());
      kit.synth.fx("card");
      showHands(true);
      const v = handValue(player).total;
      if (v > 21) {
        if (kit.lives.spend("Took it back!")) {
          player.pop();
          saved++;
          showHands(true);
          bar();
          return;
        }
        busts++;
        settle();
        return;
      }
      if (v === 21) {
        stand();
        return;
      }
      bar();
    };
    const stand = () => {
      if (phase !== "play")
        return;
      if (reads > 0 && tip())
        reads--;
      phase = "dealer";
      bar();
      showHands(false);
      const step = () => {
        const d = handValue(dealer);
        if (d.total < 17 || d.total === 17 && d.soft && hitsSoft17) {
          dealer.push(draw());
          kit.synth.fx("card");
          showHands(false);
          setTimeout(step, 520);
        } else
          settle();
      };
      setTimeout(step, 520);
    };
    const double = () => {
      if (phase !== "play" || player.length !== 2 || chips < stake)
        return;
      if (reads > 0 && tip())
        reads--;
      chips -= stake;
      stake *= 2;
      doubled = true;
      kit.synth.fx("chip");
      player.push(draw());
      kit.synth.fx("card");
      showHands(true);
      if (handValue(player).total > 21) {
        if (kit.lives.spend("Took it back!")) {
          player.pop();
          saved++;
          showHands(true);
          stand();
          return;
        }
        busts++;
        settle();
        return;
      }
      stand();
    };
    const settle = () => {
      phase = "done";
      showHands(false);
      const p = handValue(player), d = handValue(dealer);
      const pBJ = p.total === 21 && player.length === 2, dBJ = d.total === 21 && dealer.length === 2;
      let won = 0, text = "", cls = "";
      if (p.total > 21) {
        text = "Bust";
        cls = "lose";
        losses++;
      } else if (pBJ && !dBJ) {
        won = stake + stake * bjPays;
        text = "Blackjack!";
        cls = "win";
        wins++;
        blackjacks++;
        bestMoment = "dealt a natural blackjack";
      } else if (dBJ && !pBJ) {
        text = "Dealer blackjack";
        cls = "lose";
        losses++;
      } else if (d.total > 21) {
        won = stake * 2;
        text = "Dealer busts";
        cls = "win";
        wins++;
      } else if (p.total > d.total) {
        won = stake * 2;
        text = "You win";
        cls = "win";
        wins++;
        if (doubled)
          bestMoment = "doubled down and won";
      } else if (p.total < d.total) {
        text = "Dealer wins";
        cls = "lose";
        losses++;
      } else {
        won = stake;
        text = "Push";
        cls = "push";
        pushes++;
      }
      chips += won;
      msg(`${text}${won > stake ? ` · +${Math.round(won - stake)}` : ""}`, cls);
      kit.synth.fx(cls === "win" ? pBJ ? "jackpot" : "coins" : cls === "lose" ? "miss" : "click");
      if (cls === "win" && doubled)
        kit.banner("Doubled!", "gold");
      hand++;
      sync();
      setTimeout(() => {
        if (over)
          return;
        if (hand >= hands || chips < betOptions[0]) {
          finish();
          return;
        }
        phase = "bet";
        if (bet > chips)
          bet = betOptions.filter((x) => x <= chips).pop() ?? betOptions[0];
        bar();
      }, 1300);
    };
    const finish = () => {
      if (over)
        return;
      over = true;
      const beats = [];
      if (wins > losses + 1)
        beats.push("the cards ran their way");
      else if (losses > wins + 1)
        beats.push("the cards went against them");
      else
        beats.push("a close-run thing at the table");
      if (bestMoment)
        beats.push(bestMoment);
      if (busts >= 2)
        beats.push("pushed their luck too far more than once");
      if (saved)
        beats.push("got away with a bad call");
      kit.finish({ chips, score: clamp(chips / (start * 2)), beats, detail: `${wins} won, ${losses} lost${pushes ? `, ${pushes} pushed` : ""}${blackjacks ? `, ${blackjacks} blackjack` : ""}` });
    };
    root.addEventListener("click", (e) => {
      if (kit.paused)
        return;
      const t = e.target;
      const b = t.closest("[data-bet]");
      if (b) {
        bet = Number(b.dataset.bet);
        kit.synth.fx("chip");
        bar();
        return;
      }
      if (t.closest("[data-deal]"))
        deal();
      else if (t.closest("[data-hit]"))
        hit();
      else if (t.closest("[data-stand]"))
        stand();
      else if (t.closest("[data-double]"))
        double();
      else if (t.closest("[data-leave]"))
        finish();
    });
    kit.onKey((e, down) => {
      if (!down || e.repeat)
        return false;
      const k = e.key.toLowerCase();
      if (k === "enter" || k === " ") {
        if (phase === "bet")
          deal();
        return true;
      }
      if (k === "h") {
        hit();
        return true;
      }
      if (k === "s") {
        stand();
        return true;
      }
      if (k === "d") {
        double();
        return true;
      }
      if (/^[1-3]$/.test(k) && phase === "bet") {
        const x = betOptions[Number(k) - 1];
        if (x <= chips) {
          bet = x;
          kit.synth.fx("chip");
          bar();
        }
        return true;
      }
      return false;
    });
    withMusic(kit, () => backing(kit.synth, "lounge"));
    kit.onQuit(() => finish());
    bar();
    sync();
    msg(`Place your bet`, "push");
    return () => {
      ro.disconnect();
      root.remove();
    };
  }
};

// src/frontend/arcade/games/mines.ts
var CSS3 = `
.mn { position: absolute; inset: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 12px; padding: 16px; align-items: center; justify-items: center; background: var(--ar-panel); }
.mn-bar { width: min(100%, 680px); display: flex; align-items: center; gap: 14px; }
.mn-time { flex: 1; height: 6px; border-radius: 3px; background: var(--ar-bg2); overflow: hidden; }
.mn-time i { display: block; height: 100%; background: var(--ar-ink); transition: width .25s linear; }
.mn-time.low i { background: var(--ar-bad); animation: mn-blink .6s steps(2) infinite; }
@keyframes mn-blink { 50% { opacity: .4; } }
.mn-count { font-family: var(--ar-num); font-weight: 700; font-size: 15px; min-width: 60px; text-align: center; color: var(--ar-ink); }
.mn-board { display: grid; gap: 2px; padding: 8px; touch-action: manipulation; }
.mn .mn-c { position: relative; border: 0; padding: 0; display: grid; place-items: center; width: var(--cell); height: var(--cell); font: 700 calc(var(--cell) * .5)/1 var(--ar-display); transition: transform 90ms, background 120ms, filter 120ms; }
.mn .mn-c:active:not(.open) { transform: scale(.94); }
.mn .mn-c.cur { outline: 2px solid var(--ar-ac2); outline-offset: 1px; z-index: 1; }
.mn .mn-c.open { animation: mn-pop .18s ease-out both; }
@keyframes mn-pop { from { transform: scale(.86); } }
.mn .mn-c.flag::after { content: ""; width: 42%; height: 46%; background: var(--mn-flag); clip-path: polygon(0 0, 100% 30%, 0 60%); box-shadow: inset 2px 0 0 var(--mn-pole); }
.mn .mn-c.mine::after, .mn .mn-c.boom::after, .mn .mn-c.saved::after { content: ""; width: 46%; height: 46%; border-radius: 50%; background: var(--mn-mine); box-shadow: 0 0 0 2px var(--mn-mine-ring); }
.mn .mn-c.boom { z-index: 2; animation: mn-boom .45s ease-out both; }
@keyframes mn-boom { from { transform: scale(1.6); } }
.mn .mn-c.wrong::after { content: "✕"; color: var(--ar-bad); font-size: calc(var(--cell) * .55); }
.mn .mn-c.hinted { outline: 2px solid var(--ar-good); outline-offset: 1px; }
.mn-tools { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; }
.mn .mn-tool { padding: 8px 16px; border-radius: 999px; border: 1px solid var(--ar-line); background: transparent; color: var(--ar-ink); font: 600 13px var(--ar-ui); }
.mn .mn-tool.on { background: var(--ar-ink); color: var(--ar-panel); }
.mn .mn-tool:disabled { opacity: .4; }

/* modern: paper tiles that lift, flat opened squares */
.mn[data-style=modern] { --mn-flag: var(--ar-ac); --mn-pole: #1d1d1f; --mn-mine: #1d1d1f; --mn-mine-ring: rgba(29,29,31,.15); background: #f3f1ec; }
.mn[data-style=modern] .mn-board { background: #e4e1d9; border-radius: 14px; gap: 3px; }
.mn[data-style=modern] .mn-c { border-radius: 7px; background: #ffffff; box-shadow: 0 1px 0 rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.05); color: var(--ar-ink); }
.mn[data-style=modern] .mn-c:hover:not(.open) { background: #fffaf4; box-shadow: 0 0 0 2px rgba(255, 90, 54, .35); }
.mn[data-style=modern] .mn-c.open { background: #ece9e2; box-shadow: none; }
.mn[data-style=modern] .mn-c.boom { background: var(--ar-bad); --mn-mine: #fff; --mn-mine-ring: rgba(255,255,255,.3); }
.mn[data-style=modern] .mn-c.saved { background: var(--ar-good); --mn-mine: #fff; }
.mn[data-style=modern] .mn-c.mine { background: #ece9e2; }
.mn[data-style=modern] .n1 { color: #2f6fe4; } .mn[data-style=modern] .n2 { color: #1f9d55; } .mn[data-style=modern] .n3 { color: #e0452b; } .mn[data-style=modern] .n4 { color: #6a3fd1; } .mn[data-style=modern] .n5 { color: #a8500f; } .mn[data-style=modern] .n6 { color: #00879e; } .mn[data-style=modern] .n7 { color: #1d1d1f; } .mn[data-style=modern] .n8 { color: #8e8e93; }

/* medieval: flagstones over packed earth, ink numerals, a red pennant, a black-powder keg */
.mn[data-style=medieval] { --mn-flag: #9e2b1f; --mn-pole: #3b2414; --mn-mine: radial-gradient(circle at 35% 35%, #5a5248, #1d1914 70%); --mn-mine-ring: #6b4a12; background: var(--ar-wood) 0 0 / 256px; box-shadow: inset 0 0 80px rgba(0,0,0,.6); }
.mn[data-style=medieval] .mn-board { background: #3b2414; box-shadow: 0 0 0 2px #b48a2c, 0 0 0 6px #2a1a0d, 0 0 0 7px rgba(180,138,44,.6), 0 18px 40px rgba(0,0,0,.5); gap: 2px; padding: 4px; }
.mn[data-style=medieval] .mn-c { border-radius: 2px; background: var(--mn-stone) 0 0 / 128px; box-shadow: inset 2px 2px 0 rgba(255, 240, 210, .28), inset -2px -2px 0 rgba(30, 18, 6, .45); color: #2c1f12; font-family: var(--ar-ui); font-weight: 700; font-size: calc(var(--cell) * .62); }
.mn[data-style=medieval] .mn-c:nth-child(3n) { filter: brightness(.94) sepia(.15); }
.mn[data-style=medieval] .mn-c:nth-child(7n+2) { filter: brightness(1.05); }
.mn[data-style=medieval] .mn-c:hover:not(.open) { filter: brightness(1.15) !important; }
.mn[data-style=medieval] .mn-c.open { background: var(--ar-parch) 0 0 / 512px; box-shadow: inset 0 0 8px rgba(110, 70, 25, .35); filter: none; }
.mn[data-style=medieval] .mn-c.boom { background: radial-gradient(circle, #f6dc8a 0 20%, #c2453a 50%, #5e110c 85%); }
.mn[data-style=medieval] .mn-c.saved { background: var(--ar-parch) 0 0 / 512px; box-shadow: inset 0 0 0 3px #3e6b3a; }
.mn[data-style=medieval] .mn-c.mine { background: var(--ar-parch) 0 0 / 512px; }
.mn[data-style=medieval] .n1 { color: #2c4a7a; } .mn[data-style=medieval] .n2 { color: #3e6b3a; } .mn[data-style=medieval] .n3 { color: #9e2b1f; } .mn[data-style=medieval] .n4 { color: #5e2f6b; } .mn[data-style=medieval] .n5 { color: #7a4a14; } .mn[data-style=medieval] .n6 { color: #2c5a5e; } .mn[data-style=medieval] .n7 { color: #2c1f12; } .mn[data-style=medieval] .n8 { color: #6b5638; }
.mn[data-style=medieval] .mn-count { color: #ecdfbf; font-family: var(--ar-display); }
.mn[data-style=medieval] .mn-time { background: rgba(236, 223, 191, .15); border-radius: 0; height: 8px; box-shadow: 0 0 0 1px rgba(180,138,44,.6); }
.mn[data-style=medieval] .mn-time i { background: linear-gradient(90deg, #e9c46a, #b48a2c); }
.mn[data-style=medieval] .mn-tool { border-radius: 2px; color: #ecdfbf; border-color: rgba(214,181,106,.5); font-family: var(--ar-display); font-size: 12px; letter-spacing: .1em; }
.mn[data-style=medieval] .mn-tool.on { background: #9e2b1f; color: #f3e7c8; border-color: #9e2b1f; }

/* sci-fi: dark console cells with a notch, mono readouts */
.mn[data-style=scifi] { --mn-flag: var(--ar-ac2); --mn-pole: var(--ar-ac2); --mn-mine: var(--ar-bad); --mn-mine-ring: rgba(239,100,97,.35); background: transparent; }
.mn[data-style=scifi] .mn-board { gap: 3px; }
.mn[data-style=scifi] .mn-c { background: #132131; box-shadow: inset 0 0 0 1px rgba(120,170,210,.22); color: var(--ar-ink); font-family: var(--ar-num); font-weight: 600; clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 0 100%); }
.mn[data-style=scifi] .mn-c:hover:not(.open) { background: #1a2e44; box-shadow: inset 0 0 0 1px var(--ar-ac); }
.mn[data-style=scifi] .mn-c.open { background: #080e16; box-shadow: inset 0 0 0 1px rgba(120,170,210,.07); clip-path: none; }
.mn[data-style=scifi] .mn-c.mine::after, .mn[data-style=scifi] .mn-c.boom::after { border-radius: 0; transform: rotate(45deg) scale(.8); }
.mn[data-style=scifi] .mn-c.boom { background: rgba(239,100,97,.25); box-shadow: inset 0 0 0 1px var(--ar-bad); }
.mn[data-style=scifi] .mn-c.saved { background: rgba(95,211,160,.18); box-shadow: inset 0 0 0 1px var(--ar-good); --mn-mine: var(--ar-good); }
.mn[data-style=scifi] .n1 { color: #5ec8e5; } .mn[data-style=scifi] .n2 { color: #5fd3a0; } .mn[data-style=scifi] .n3 { color: #f2a541; } .mn[data-style=scifi] .n4 { color: #c792ea; } .mn[data-style=scifi] .n5 { color: #ef6461; } .mn[data-style=scifi] .n6 { color: #8f9cff; } .mn[data-style=scifi] .n7 { color: #e0e6ec; } .mn[data-style=scifi] .n8 { color: #7d92a8; }
.mn[data-style=scifi] .mn-time { border-radius: 0; height: 8px; background: repeating-linear-gradient(90deg, rgba(120,170,210,.16) 0 6px, transparent 6px 8px); }
.mn[data-style=scifi] .mn-time i { background: var(--ar-ac); -webkit-mask: repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 8px); mask: repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 8px); }
.mn[data-style=scifi] .mn-count { color: var(--ar-ac); font-weight: 600; }
.mn[data-style=scifi] .mn-tool { border-radius: 0; font-family: var(--ar-num); font-size: 12px; }
.mn[data-style=scifi] .mn-tool.on { background: rgba(242,165,65,.15); color: var(--ar-ac2); border-color: var(--ar-ac2); }
`;
var MINES = {
  id: "mines",
  title: "Mines",
  howTo: [
    "Open squares; a number says how many of the 8 around it are mines.",
    "Flag mines you're sure of. Click a number with its mines all flagged to open the rest.",
    "Clear every safe square before time runs out. The more you clear, the better it goes."
  ],
  controls: "Click to open · right-click or long-press to flag · arrows + Space / F",
  start(kit) {
    const L = kit.play.level;
    const rows = 8 + Math.round(L * 3), cols = rows + 3;
    const total = rows * cols;
    const mines = Math.round(total * (0.11 + 0.11 * L));
    const safe = total - mines;
    const limit = Math.round((30 + safe * 0.7) * (1.15 - 0.3 * L) * (1 + kit.aid("time") / 100));
    let hints = kit.aid("hint");
    const cell = { mine: new Array(total).fill(false), open: new Array(total).fill(false), flag: new Array(total).fill(false), n: new Array(total).fill(0) };
    let placed = false, opened = 0, over = false, timeLeft = limit, cur = Math.floor(total / 2), flagMode = false, saves = 0;
    const root = document.createElement("div");
    root.className = "mn";
    root.dataset.style = kit.theme.style;
    if (kit.theme.style === "medieval")
      root.style.setProperty("--mn-stone", `url(${textureUrl("stone", kit.theme)})`);
    root.innerHTML = `<style>${CSS3}</style>
      <div class="mn-bar"><span class="mn-count" data-mines>${mines}</span><div class="mn-time"><i style="width:100%"></i></div><span class="mn-count" data-time>${limit}s</span></div>
      <div class="mn-board" style="grid-template-columns:repeat(${cols}, var(--cell))"></div>
      <div class="mn-tools"><button class="mn-tool" data-flagmode>Flag mode</button><button class="mn-tool" data-hint ${hints ? "" : "disabled"}>Hint (${hints})</button></div>`;
    kit.root.appendChild(root);
    const board = root.querySelector(".mn-board");
    const timeBar = root.querySelector(".mn-time");
    const timeTxt = root.querySelector("[data-time]");
    const mineTxt = root.querySelector("[data-mines]");
    const hintBtn = root.querySelector("[data-hint]");
    const flagBtn = root.querySelector("[data-flagmode]");
    board.innerHTML = Array.from({ length: total }, (_, i) => `<button class="mn-c" data-i="${i}" aria-label="Square"></button>`).join("");
    const btns = [...board.children];
    const size = () => {
      const r = root.getBoundingClientRect();
      const s = Math.floor(Math.min((r.width - 40) / cols, (r.height - 130) / rows)) - 3;
      board.style.setProperty("--cell", `${Math.max(22, Math.min(54, s))}px`);
    };
    const ro = new ResizeObserver(size);
    ro.observe(root);
    size();
    const around = (i) => {
      const x = i % cols, y = Math.floor(i / cols), out = [];
      for (let dy = -1;dy <= 1; dy++)
        for (let dx = -1;dx <= 1; dx++) {
          if (!dx && !dy)
            continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < cols && ny < rows)
            out.push(ny * cols + nx);
        }
      return out;
    };
    const place = (first) => {
      const keep = new Set([first, ...around(first)]);
      const pool = shuffle([...Array(total).keys()].filter((i) => !keep.has(i)), kit.rng).slice(0, mines);
      for (const i of pool)
        cell.mine[i] = true;
      for (let i = 0;i < total; i++)
        cell.n[i] = around(i).filter((j) => cell.mine[j]).length;
      placed = true;
    };
    const score = () => opened >= safe ? 1 : Math.pow(opened / safe, 1.6);
    const paint = (i) => {
      const b = btns[i];
      b.className = "mn-c" + (i === cur ? " cur" : "");
      b.textContent = "";
      if (cell.open[i]) {
        b.classList.add("open");
        if (cell.n[i]) {
          b.textContent = String(cell.n[i]);
          b.classList.add(`n${cell.n[i]}`);
        }
      } else if (cell.flag[i])
        b.classList.add("flag");
    };
    const flood = (start) => {
      const stack = [start];
      let k = 0;
      while (stack.length) {
        const i = stack.pop();
        if (cell.open[i] || cell.flag[i] || cell.mine[i])
          continue;
        cell.open[i] = true;
        opened++;
        k++;
        paint(i);
        if (cell.n[i] === 0)
          stack.push(...around(i));
      }
      return k;
    };
    const progress = () => {
      kit.score(score());
      kit.status(`${opened} / ${safe} safe
${cell.flag.filter(Boolean).length} flagged`);
      const elapsed = 1 - timeLeft / limit;
      kit.track(clamp(opened / safe / Math.max(0.15, elapsed)));
      mineTxt.textContent = `${mines - cell.flag.filter(Boolean).length}`;
      if (opened >= safe)
        finish("cleared");
    };
    const open = (i) => {
      if (over || kit.paused || cell.open[i] || cell.flag[i])
        return;
      if (!placed)
        place(i);
      if (cell.mine[i]) {
        kit.shake(1.6);
        kit.synth.fx("boom");
        if (kit.lives.spend("Shielded!")) {
          saves++;
          cell.flag[i] = true;
          btns[i].className = "mn-c saved";
          return;
        }
        btns[i].classList.add("boom");
        finish("boom", i);
        return;
      }
      const k = flood(i);
      kit.synth.fx("reveal", Math.min(12, k));
      progress();
    };
    const chord = (i) => {
      if (!cell.open[i] || !cell.n[i])
        return;
      const nb = around(i);
      if (nb.filter((j) => cell.flag[j]).length !== cell.n[i])
        return;
      for (const j of nb)
        if (!cell.open[j] && !cell.flag[j])
          open(j);
    };
    const flag = (i) => {
      if (over || kit.paused || cell.open[i])
        return;
      cell.flag[i] = !cell.flag[i];
      kit.synth.fx("flag");
      paint(i);
      progress();
    };
    const hint = () => {
      if (!hints || over || kit.paused)
        return;
      if (!placed) {
        open(cur);
      }
      const edge = [...Array(total).keys()].filter((i) => !cell.open[i] && !cell.mine[i] && !cell.flag[i] && around(i).some((j) => cell.open[j]));
      const pool = edge.length ? edge : [...Array(total).keys()].filter((i) => !cell.open[i] && !cell.mine[i]);
      if (!pool.length)
        return;
      const i = pool[Math.floor(kit.rng() * pool.length)];
      hints--;
      hintBtn.textContent = `Hint (${hints})`;
      hintBtn.disabled = !hints;
      open(i);
      btns[i].classList.add("hinted");
      setTimeout(() => btns[i].classList.remove("hinted"), 900);
    };
    const finish = (how, at) => {
      if (over)
        return;
      over = true;
      for (let i = 0;i < total; i++) {
        if (cell.mine[i] && !cell.flag[i] && i !== at)
          btns[i].classList.add("mine");
        if (cell.flag[i] && !cell.mine[i])
          btns[i].classList.add("wrong");
      }
      const s = score();
      kit.score(s);
      if (how === "cleared") {
        kit.synth.fx("win");
        kit.banner("Cleared!", "good");
      } else if (how === "time") {
        kit.synth.fx("lose");
        kit.banner("Time!", "bad");
      }
      const beats = how === "cleared" ? [timeLeft > limit * 0.4 ? "cleared it with time to spare" : timeLeft < limit * 0.1 ? "cleared it with seconds left" : "cleared it"] : how === "boom" ? [s > 0.7 ? "one wrong move, late, when it was nearly done" : "one wrong move"] : ["ran out of time"];
      if (saves)
        beats.push("got away with a mistake");
      kit.finish({ score: s, beats, detail: `${opened} of ${safe} safe squares, ${mines} mines` });
    };
    let press = null, swallow = false;
    board.addEventListener("pointerdown", (e) => {
      swallow = false;
      if (e.pointerType === "mouse")
        return;
      const b = e.target.closest("[data-i]");
      if (!b)
        return;
      const i = Number(b.dataset.i);
      press = window.setTimeout(() => {
        press = null;
        swallow = true;
        flag(i);
      }, 380);
    });
    const cancel = () => {
      if (press !== null) {
        clearTimeout(press);
        press = null;
      }
    };
    board.addEventListener("pointerup", cancel);
    board.addEventListener("pointercancel", cancel);
    board.addEventListener("click", (e) => {
      if (swallow) {
        swallow = false;
        return;
      }
      const b = e.target.closest("[data-i]");
      if (!b)
        return;
      const i = Number(b.dataset.i);
      const old = cur;
      cur = i;
      paint(old);
      paint(i);
      if (flagMode && !cell.open[i])
        flag(i);
      else if (cell.open[i])
        chord(i);
      else
        open(i);
    });
    board.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const b = e.target.closest("[data-i]");
      if (b && !swallow)
        flag(Number(b.dataset.i));
    });
    hintBtn.addEventListener("click", hint);
    flagBtn.addEventListener("click", () => {
      flagMode = !flagMode;
      flagBtn.classList.toggle("on", flagMode);
    });
    kit.onKey((e, down) => {
      if (!down)
        return false;
      const k = e.key.toLowerCase();
      const x = cur % cols, y = Math.floor(cur / cols);
      const move = (nx, ny) => {
        const old = cur;
        cur = Math.max(0, Math.min(rows - 1, ny)) * cols + Math.max(0, Math.min(cols - 1, nx));
        paint(old);
        paint(cur);
      };
      if (k === "arrowleft")
        move(x - 1, y);
      else if (k === "arrowright")
        move(x + 1, y);
      else if (k === "arrowup")
        move(x, y - 1);
      else if (k === "arrowdown")
        move(x, y + 1);
      else if (k === " " || k === "enter") {
        if (cell.open[cur])
          chord(cur);
        else
          open(cur);
      } else if (k === "f")
        flag(cur);
      else if (k === "h")
        hint();
      else
        return false;
      return true;
    });
    kit.onQuit(() => finish("time"));
    let acc = 0;
    kit.loop((dt) => {
      if (over)
        return;
      if (!placed)
        return;
      timeLeft = Math.max(0, timeLeft - dt);
      acc += dt;
      if (acc > 0.2) {
        acc = 0;
        timeBar.querySelector("i").setAttribute("style", `width:${timeLeft / limit * 100}%`);
        timeBar.classList.toggle("low", timeLeft < Math.min(10, limit * 0.2));
        timeTxt.textContent = `${Math.ceil(timeLeft)}s`;
      }
      if (timeLeft <= 0)
        finish("time");
    });
    progress();
    kit.status(`${safe} safe squares
clock starts on your first`);
    return () => {
      ro.disconnect();
      root.remove();
    };
  }
};

// src/frontend/arcade/games/pinball.ts
var TW = 400;
var TH = 720;
var BR = 9;
function table() {
  const segs = [];
  const poly = (pts, e = 0.45) => {
    for (let i = 0;i < pts.length - 1; i++)
      segs.push({ a: { x: pts[i][0], y: pts[i][1] }, b: { x: pts[i + 1][0], y: pts[i + 1][1] }, e });
  };
  const arc = [];
  for (let k = 0;k <= 18; k++) {
    const a = Math.PI + k / 18 * Math.PI;
    arc.push([200 + Math.cos(a) * 182, 150 + Math.sin(a) * 135]);
  }
  poly([[18, 600], [18, 150], ...arc.slice(1, -1), [382, 150], [382, 720]]);
  poly([[350, 720], [350, 230]]);
  segs.push({ a: { x: 350, y: 700 }, b: { x: 382, y: 700 }, e: 0.15 });
  poly([[18, 560], [112, 636]]);
  poly([[350, 560], [288, 636]]);
  segs.push({ a: { x: 62, y: 470 }, b: { x: 104, y: 560 }, kick: 520, e: 0.9, kind: "sling" });
  segs.push({ a: { x: 306, y: 470 }, b: { x: 264, y: 560 }, kick: 520, e: 0.9, kind: "sling" });
  poly([[62, 470], [62, 548], [104, 560]], 0.4);
  poly([[306, 470], [306, 548], [264, 560]], 0.4);
  return segs;
}
var PINBALL = {
  id: "pinball",
  title: "Pinball",
  howTo: [
    "Hold Space to pull the plunger and let go to launch.",
    "Flip to keep the ball alive. Bumpers and slingshots score; light all three top lanes to raise the multiplier.",
    "Reach the target score before your last ball drains (or time runs out)."
  ],
  controls: "Z / ← left flipper · M / → right flipper · Space launch · touch the left or right half",
  start(kit) {
    const L = kit.play.level;
    const goal = Math.round((4000 + L * 14000) / 500) * 500;
    let balls = 3;
    let savers = kit.aid("saver") + (L < 0.4 ? 1 : 0);
    const limit = 150;
    const flipLen = 74 * (1 + kit.aid("size") / 100) * (1.06 - 0.12 * L);
    const segs = table();
    const bumpers = [{ x: 140, y: 210, r: 24, lit: 0 }, { x: 258, y: 210, r: 24, lit: 0 }, { x: 199, y: 292, r: 24, lit: 0 }];
    const lanes = [{ x: 132, y: 92, on: false, flash: 0 }, { x: 200, y: 80, on: false, flash: 0 }, { x: 268, y: 92, on: false, flash: 0 }];
    const targets = [{ x: 30, y: 330, hit: 0 }, { x: 370 - 30, y: 330, hit: 0 }];
    const flippers = [
      { pivot: { x: 112, y: 640 }, len: flipLen, rest: 0.52, up: -0.48, ang: 0.52, w: 0, side: 1, pressed: false },
      { pivot: { x: 288, y: 640 }, len: flipLen, rest: 0.52, up: -0.48, ang: 0.52, w: 0, side: -1, pressed: false }
    ];
    let ball = { x: 366, y: 690, vx: 0, vy: 0, live: false, inLane: true };
    let points = 0, mult = 1, timeLeft = limit, plunge = 0, pulling = false, over = false, launched = 0, drained = 0, bestBall = 0, ballPts = 0;
    const c = kit.canvas();
    const g = c.g;
    const th = kit.theme;
    const sparks = new Sparks, floats = new Floaters(th.style === "scifi" ? th.fontNum : th.fontDisplay, th.style === "scifi" ? null : "rgba(0,0,0,.45)");
    const hue = th.style === "medieval" ? { sling: "#e9c46a", bump: "#e9c46a", lane: "#e9c46a", bonus: "#f3e7c8", target: "#f3e7c8" } : th.style === "modern" ? { sling: "#2f6fe4", bump: "#ff5a36", lane: "#22a06b", bonus: "#ffb020", target: "#8e5cf0" } : { sling: th.accent, bump: th.accent2, lane: th.good, bonus: th.gold, target: "#c792ea" };
    const trail = [];
    const tip = (f) => ({ x: f.pivot.x + Math.cos(f.ang) * f.len * f.side, y: f.pivot.y + Math.sin(f.ang) * f.len });
    const add = (n, at, color = "#ffe066") => {
      const v = n * mult;
      points += v;
      ballPts += v;
      floats.add(at.x, at.y - 10, `+${v}`, color, 13);
      kit.score(clamp(points / goal));
      kit.status(`${points.toLocaleString()} / ${goal.toLocaleString()}
Ball ${Math.min(3, drained + 1)} · ×${mult}`);
      if (points >= goal && !over) {
        kit.banner("Target reached!", "good");
        kit.synth.fx("win");
        setTimeout(() => finish("goal"), 900);
      }
    };
    const newBall = () => {
      ball = { x: 366, y: 690, vx: 0, vy: 0, live: true, inLane: true };
      plunge = 0;
      ballPts = 0;
    };
    newBall();
    const collideSeg = (s, vel, radius = BR) => {
      const ax = s.a.x, ay = s.a.y, bx = s.b.x, by = s.b.y;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const k = clamp(((ball.x - ax) * dx + (ball.y - ay) * dy) / len2);
      const px = ax + dx * k, py = ay + dy * k;
      let nx = ball.x - px, ny = ball.y - py;
      const d = Math.hypot(nx, ny);
      if (d >= radius || d === 0)
        return false;
      nx /= d;
      ny /= d;
      ball.x = px + nx * radius;
      ball.y = py + ny * radius;
      const u = vel ? vel({ x: px, y: py }) : { x: 0, y: 0 };
      const rvx = ball.vx - u.x, rvy = ball.vy - u.y;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const e = s.e ?? 0.45;
        ball.vx -= (1 + e) * vn * nx;
        ball.vy -= (1 + e) * vn * ny;
        if (s.kick) {
          ball.vx += nx * s.kick;
          ball.vy += ny * s.kick;
          kit.synth.fx("bumper", 4);
          add(50, { x: px, y: py }, hue.sling);
          sparks.burst(px, py, hue.sling, 8, 160, 2.5);
        }
      }
      return true;
    };
    const physics = (dt) => {
      for (const f of flippers) {
        const target = f.pressed ? f.up : f.rest;
        const speed = 22;
        const prev = f.ang;
        f.ang = f.ang < target ? Math.min(target, f.ang + speed * dt) : Math.max(target, f.ang - speed * dt);
        f.w = (f.ang - prev) / dt;
      }
      if (!ball.live)
        return;
      ball.vy += 820 * dt;
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      const sp = Math.hypot(ball.vx, ball.vy);
      if (sp > 1600) {
        ball.vx *= 1600 / sp;
        ball.vy *= 1600 / sp;
      }
      if (ball.inLane && ball.x < 345)
        ball.inLane = false;
      for (const s of segs)
        collideSeg(s);
      for (const b of bumpers) {
        const dx = ball.x - b.x, dy = ball.y - b.y, d = Math.hypot(dx, dy);
        if (d < b.r + BR) {
          const nx = dx / d, ny = dy / d;
          ball.x = b.x + nx * (b.r + BR);
          ball.y = b.y + ny * (b.r + BR);
          const vn = ball.vx * nx + ball.vy * ny;
          if (vn < 0) {
            ball.vx -= 2 * vn * nx;
            ball.vy -= 2 * vn * ny;
          }
          ball.vx += nx * 380;
          ball.vy += ny * 380;
          b.lit = 1;
          kit.synth.fx("bumper", bumpers.indexOf(b) * 3);
          sparks.burst(ball.x - nx * BR, ball.y - ny * BR, hue.bump, 8, 170, 2.5);
          add(100, { x: b.x, y: b.y - b.r }, hue.bump);
        }
      }
      for (const f of flippers) {
        const t = tip(f);
        const vel = (p) => {
          const rx = p.x - f.pivot.x, ry = p.y - f.pivot.y;
          const w = f.w;
          return f.side === 1 ? { x: -w * ry, y: w * rx } : { x: w * ry, y: -w * rx };
        };
        collideSeg({ a: f.pivot, b: t, e: 0.25 }, vel, BR + 6);
      }
      for (const l of lanes) {
        if (Math.hypot(ball.x - l.x, ball.y - l.y) < 16 && l.flash <= 0) {
          l.flash = 0.6;
          if (!l.on) {
            l.on = true;
            kit.synth.fx("target");
            add(250, l, hue.lane);
          }
          if (lanes.every((x) => x.on)) {
            for (const x of lanes)
              x.on = false;
            mult = Math.min(5, mult + 1);
            kit.banner(`Multiplier ×${mult}`, "gold");
            kit.synth.fx("combo");
            add(1000, { x: 200, y: 120 }, hue.bonus);
          }
        }
      }
      for (const tg of targets) {
        if (Math.abs(ball.x - tg.x) < 16 && Math.abs(ball.y - tg.y) < 30 && tg.hit <= 0) {
          tg.hit = 0.8;
          ball.vx = -ball.vx * 0.8 + (tg.x < 200 ? 200 : -200);
          kit.synth.fx("target", 5);
          add(500, tg, hue.target);
        }
      }
      if (ball.y > TH + 30)
        drain();
    };
    const drain = () => {
      ball.live = false;
      kit.synth.fx("drain");
      if (savers > 0 && performance.now() - launched < 9000) {
        savers--;
        kit.banner("Ball saved!", "gold");
        setTimeout(newBall, 500);
        return;
      }
      drained++;
      bestBall = Math.max(bestBall, ballPts);
      kit.shake(0.8);
      if (drained >= balls) {
        if (kit.lives.spend("Extra ball!")) {
          balls++;
          setTimeout(newBall, 700);
          return;
        }
        finish("drained");
        return;
      }
      kit.banner(`Ball ${drained + 1}`, "info");
      setTimeout(newBall, 700);
    };
    const finish = (how) => {
      if (over)
        return;
      over = true;
      bestBall = Math.max(bestBall, ballPts);
      const s = clamp(points / goal);
      kit.score(s);
      const beats = how === "goal" ? [drained === 0 ? "did it all on the first ball" : "got there"] : how === "time" ? ["time ran out"] : [s > 0.8 ? "the last ball drained just short" : "the balls kept draining"];
      if (mult >= 3)
        beats.push("built up a real head of steam");
      if (bestBall > goal * 0.6)
        beats.push("one long, brilliant run");
      kit.finish({ score: s, beats, detail: `${points.toLocaleString()} points of ${goal.toLocaleString()}` });
    };
    const press = (side, down) => {
      if (side === "launch") {
        if (down && ball.inLane && ball.live && ball.y > 660 && Math.abs(ball.vy) < 60)
          pulling = true;
        else if (!down && pulling) {
          pulling = false;
          ball.vy = -(1150 + plunge * 700);
          ball.vx = 0;
          launched = performance.now();
          kit.synth.fx("launch");
          plunge = 0;
        }
        return;
      }
      const f = flippers[side === "L" ? 0 : 1];
      if (down && !f.pressed)
        kit.synth.fx("flipper");
      f.pressed = down;
    };
    kit.onKey((e, down) => {
      const k = e.key.toLowerCase();
      if (k === "z" || k === "arrowleft" || k === "shift" && e.location === 1) {
        press("L", down);
        return true;
      }
      if (k === "m" || k === "/" || k === "arrowright") {
        press("R", down);
        return true;
      }
      if (k === " " || k === "arrowdown" || k === "enter") {
        if (!e.repeat || !down)
          press("launch", down);
        return true;
      }
      return false;
    });
    const touches = new Map;
    c.el.addEventListener("pointerdown", (e) => {
      if (kit.paused)
        return;
      c.el.setPointerCapture(e.pointerId);
      const r = c.el.getBoundingClientRect();
      const side = ball.inLane && ball.live && ball.y > 660 ? "launch" : e.clientX - r.left < r.width / 2 ? "L" : "R";
      touches.set(e.pointerId, side);
      press(side, true);
    });
    const up = (e) => {
      const s = touches.get(e.pointerId);
      if (s) {
        touches.delete(e.pointerId);
        press(s, false);
      }
    };
    c.el.addEventListener("pointerup", up);
    c.el.addEventListener("pointercancel", up);
    withMusic(kit, () => backing(kit.synth, "drive", () => 1 + (mult - 1) * 0.05));
    kit.onQuit(() => finish("time"));
    let acc = 0;
    kit.loop((dt) => {
      if (!over) {
        timeLeft = Math.max(0, timeLeft - dt);
        if (timeLeft <= 0)
          finish("time");
        if (pulling)
          plunge = Math.min(1, plunge + dt * 1.2);
        acc += dt;
        const h = 1 / 480;
        while (acc >= h) {
          physics(h);
          acc -= h;
        }
        if (Math.floor(timeLeft) !== Math.floor(timeLeft + dt))
          kit.track(clamp(points / goal / Math.max(0.15, 1 - timeLeft / limit)));
      }
      for (const b of bumpers)
        b.lit = Math.max(0, b.lit - dt * 4);
      for (const l of lanes)
        l.flash = Math.max(0, l.flash - dt);
      for (const t of targets)
        t.hit = Math.max(0, t.hit - dt);
      if (ball.live) {
        trail.push({ x: ball.x, y: ball.y });
        if (trail.length > 8)
          trail.shift();
      }
      sparks.step(dt);
      floats.step(dt);
      draw();
    });
    function tablePath() {
      g.beginPath();
      g.moveTo(18, 720);
      g.lineTo(18, 150);
      g.arc(200, 150, 182, Math.PI, 0);
      g.lineTo(382, 720);
      g.closePath();
    }
    function playfield() {
      if (th.style === "medieval") {
        g.save();
        tablePath();
        g.clip();
        paint(g, "parchment", th, 0, 0, TW, TH);
        g.strokeStyle = "rgba(90, 61, 28, .18)";
        g.lineWidth = 1.5;
        for (let k = 0;k < 16; k++) {
          const a = k * Math.PI / 8;
          g.beginPath();
          g.moveTo(200, 400);
          g.lineTo(200 + Math.cos(a) * (k % 2 ? 60 : 110), 400 + Math.sin(a) * (k % 2 ? 60 : 110));
          g.stroke();
        }
        g.beginPath();
        g.arc(200, 400, 70, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = "rgba(158, 43, 31, .14)";
        g.lineWidth = 6;
        g.beginPath();
        for (let k = 0;k < 120; k++) {
          const u = k / 119;
          g.lineTo(200 + Math.sin(u * 9) * 120 * (1 - u * 0.5), 200 + u * 340);
        }
        g.stroke();
        g.restore();
        g.strokeStyle = "#4a2e16";
        g.lineWidth = 10;
        tablePath();
        g.stroke();
      } else if (th.style === "modern") {
        g.save();
        tablePath();
        g.clip();
        const bg = g.createLinearGradient(0, 0, 0, TH);
        bg.addColorStop(0, "#fbfaf7");
        bg.addColorStop(1, "#ece9e2");
        g.fillStyle = bg;
        g.fillRect(0, 0, TW, TH);
        g.fillStyle = "rgba(255, 90, 54, .08)";
        g.beginPath();
        g.arc(200, 260, 150, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(47, 111, 228, .07)";
        g.beginPath();
        g.moveTo(80, 600);
        g.lineTo(200, 470);
        g.lineTo(320, 600);
        g.lineTo(290, 600);
        g.lineTo(200, 500);
        g.lineTo(110, 600);
        g.closePath();
        g.fill();
        g.restore();
      } else {
        g.save();
        tablePath();
        g.clip();
        g.fillStyle = "#08101a";
        g.fillRect(0, 0, TW, TH);
        g.strokeStyle = "rgba(120, 170, 210, .06)";
        g.lineWidth = 1;
        for (let x = 0;x < TW; x += 20) {
          g.beginPath();
          g.moveTo(x, 0);
          g.lineTo(x, TH);
          g.stroke();
        }
        for (let y = 0;y < TH; y += 20) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(TW, y);
          g.stroke();
        }
        g.strokeStyle = "rgba(94, 200, 229, .12)";
        g.beginPath();
        g.arc(200, 400, 90, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }
    function walls() {
      g.lineCap = "round";
      g.lineJoin = "round";
      for (const sg of segs) {
        const line = () => {
          g.beginPath();
          g.moveTo(sg.a.x, sg.a.y);
          g.lineTo(sg.b.x, sg.b.y);
          g.stroke();
        };
        if (th.style === "medieval") {
          if (sg.kind === "sling") {
            g.strokeStyle = "#6b1a12";
            g.lineWidth = 8;
            line();
            g.strokeStyle = "#b48a2c";
            g.lineWidth = 3;
            line();
          } else {
            g.strokeStyle = "#5a3d1c";
            g.lineWidth = 6;
            line();
            g.strokeStyle = "#c9952f";
            g.lineWidth = 2.5;
            line();
          }
        } else if (th.style === "modern") {
          if (sg.kind === "sling") {
            g.strokeStyle = hue.sling;
            g.lineWidth = 7;
            line();
          } else {
            g.strokeStyle = "#1d1d1f";
            g.lineWidth = 4;
            line();
          }
        } else {
          g.strokeStyle = sg.kind === "sling" ? th.accent2 : th.accent;
          g.lineWidth = sg.kind === "sling" ? 3 : 1.5;
          glow(g, th, g.strokeStyle, 6);
          line();
          g.shadowBlur = 0;
        }
      }
    }
    function bumper(b) {
      const r = b.r * (1 + b.lit * 0.1);
      if (th.style === "medieval") {
        lift(g, th, 1.5);
        g.fillStyle = "#c9952f";
        g.beginPath();
        g.arc(b.x, b.y, r + 3, 0, Math.PI * 2);
        g.fill();
        unlift(g);
        const q = ["#9e2b1f", "#2c4a7a", "#9e2b1f", "#2c4a7a"];
        for (let k = 0;k < 4; k++) {
          g.fillStyle = q[k];
          g.beginPath();
          g.moveTo(b.x, b.y);
          g.arc(b.x, b.y, r, k * Math.PI / 2, (k + 1) * Math.PI / 2);
          g.closePath();
          g.fill();
        }
        g.fillStyle = b.lit > 0 ? "#f6dc8a" : "#c9952f";
        g.beginPath();
        g.arc(b.x, b.y, r * 0.3, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#5a3d1c";
        g.lineWidth = 1;
        g.stroke();
      } else if (th.style === "modern") {
        lift(g, th, 2);
        g.fillStyle = hue.bump;
        g.beginPath();
        g.arc(b.x, b.y, r, 0, Math.PI * 2);
        g.fill();
        unlift(g);
        g.fillStyle = "#fff";
        g.beginPath();
        g.arc(b.x, b.y - 2, r * 0.62, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = b.lit > 0 ? hue.bump : "#ece9e2";
        g.beginPath();
        g.arc(b.x, b.y - 2, r * 0.32, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = b.lit > 0 ? "rgba(242, 165, 65, .3)" : "rgba(242, 165, 65, .08)";
        g.beginPath();
        for (let k = 0;k < 6; k++) {
          const a = k * Math.PI / 3 + Math.PI / 6;
          g.lineTo(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
        }
        g.closePath();
        g.fill();
        glow(g, th, th.accent2, 8);
        g.strokeStyle = th.accent2;
        g.lineWidth = 1.5;
        g.stroke();
        g.shadowBlur = 0;
        g.beginPath();
        g.arc(b.x, b.y, r * 0.38, 0, Math.PI * 2);
        g.stroke();
      }
    }
    function flipper(f) {
      const tp = tip(f);
      if (th.style === "medieval") {
        lift(g, th, 1.5);
        g.strokeStyle = "#3b2414";
        g.lineWidth = 16;
        g.beginPath();
        g.moveTo(f.pivot.x, f.pivot.y);
        g.lineTo(tp.x, tp.y);
        g.stroke();
        unlift(g);
        g.strokeStyle = "#7a5230";
        g.lineWidth = 11;
        g.beginPath();
        g.moveTo(f.pivot.x, f.pivot.y);
        g.lineTo(tp.x, tp.y);
        g.stroke();
        g.fillStyle = "#c9952f";
        g.beginPath();
        g.arc(f.pivot.x, f.pivot.y, 5, 0, Math.PI * 2);
        g.fill();
      } else if (th.style === "modern") {
        lift(g, th, 1.5);
        g.strokeStyle = "#1d1d1f";
        g.lineWidth = 16;
        g.beginPath();
        g.moveTo(f.pivot.x, f.pivot.y);
        g.lineTo(tp.x, tp.y);
        g.stroke();
        unlift(g);
        g.strokeStyle = "#ffffff";
        g.lineWidth = 10;
        g.beginPath();
        g.moveTo(f.pivot.x, f.pivot.y);
        g.lineTo(tp.x, tp.y);
        g.stroke();
      } else {
        g.strokeStyle = "#0d1724";
        g.lineWidth = 14;
        g.beginPath();
        g.moveTo(f.pivot.x, f.pivot.y);
        g.lineTo(tp.x, tp.y);
        g.stroke();
        glow(g, th, th.accent, f.pressed ? 10 : 4);
        g.strokeStyle = th.accent;
        g.lineWidth = 2;
        const nx = -(tp.y - f.pivot.y), ny = tp.x - f.pivot.x, nl = Math.hypot(nx, ny) || 1;
        for (const sg of [-1, 1]) {
          g.beginPath();
          g.moveTo(f.pivot.x + nx / nl * 6 * sg, f.pivot.y + ny / nl * 6 * sg);
          g.lineTo(tp.x + nx / nl * 4 * sg, tp.y + ny / nl * 4 * sg);
          g.stroke();
        }
        g.shadowBlur = 0;
      }
    }
    function draw() {
      g.clearRect(0, 0, c.w, c.h);
      if (th.style === "medieval")
        paint(g, "wood", th, 0, 0, c.w, c.h);
      else if (th.style === "modern") {
        g.fillStyle = "#e4e1d9";
        g.fillRect(0, 0, c.w, c.h);
      } else {
        g.fillStyle = "#05080d";
        g.fillRect(0, 0, c.w, c.h);
      }
      const s = Math.min((c.h - 16) / TH, (c.w - 16) / TW);
      const ox = (c.w - TW * s) / 2, oy = (c.h - TH * s) / 2;
      g.save();
      g.translate(ox, oy);
      g.scale(s, s);
      playfield();
      walls();
      for (const l of lanes) {
        if (th.style === "medieval") {
          g.fillStyle = "#efe4c8";
          g.fillRect(l.x - 3, l.y - 4, 6, 14);
          if (l.on) {
            g.fillStyle = "#e9a43a";
            g.beginPath();
            g.ellipse(l.x, l.y - 8, 3, 6 + l.flash * 4, 0, 0, Math.PI * 2);
            g.fill();
          }
        } else if (th.style === "modern") {
          g.fillStyle = l.on ? hue.lane : "#d9d6cf";
          g.beginPath();
          g.arc(l.x, l.y, 7 + l.flash * 4, 0, Math.PI * 2);
          g.fill();
        } else {
          g.strokeStyle = l.on ? th.good : "rgba(95, 211, 160, .3)";
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(l.x, l.y - 8);
          g.lineTo(l.x + 7, l.y);
          g.lineTo(l.x, l.y + 8);
          g.lineTo(l.x - 7, l.y);
          g.closePath();
          g.stroke();
          if (l.on) {
            g.fillStyle = "rgba(95, 211, 160, .4)";
            g.fill();
          }
        }
      }
      for (const tg of targets) {
        const hit = tg.hit > 0;
        if (th.style === "medieval") {
          g.fillStyle = hit ? "#f6dc8a" : "#6b4426";
          g.fillRect(tg.x - 6, tg.y - 22, 12, 44);
          g.strokeStyle = "#c9952f";
          g.lineWidth = 1.5;
          g.strokeRect(tg.x - 6, tg.y - 22, 12, 44);
        } else if (th.style === "modern") {
          g.fillStyle = hit ? "#1d1d1f" : hue.target;
          rrect(g, tg.x - 6, tg.y - 22, 12, 44, 6);
          g.fill();
        } else {
          g.strokeStyle = hue.target;
          g.lineWidth = 1.5;
          g.strokeRect(tg.x - 5, tg.y - 22, 10, 44);
          if (hit) {
            g.fillStyle = "rgba(199, 146, 234, .4)";
            g.fillRect(tg.x - 5, tg.y - 22, 10, 44);
          }
        }
      }
      for (const b of bumpers)
        bumper(b);
      for (const f of flippers)
        flipper(f);
      g.fillStyle = th.style === "medieval" ? "#6b4426" : th.style === "modern" ? "#1d1d1f" : "#2a3a4c";
      g.fillRect(358, 700 + plunge * 18, 16, 24);
      g.fillStyle = th.style === "medieval" ? "#c9952f" : th.style === "modern" ? th.accent : th.accent2;
      g.fillRect(356, 698 + plunge * 18, 20, 5);
      if (ball.live) {
        if (th.style === "scifi")
          trail.forEach((p, i) => {
            g.globalAlpha = i / trail.length * 0.25;
            g.fillStyle = th.accent;
            g.beginPath();
            g.arc(p.x, p.y, BR * (i / trail.length), 0, Math.PI * 2);
            g.fill();
          });
        g.globalAlpha = 1;
        lift(g, th, 1);
        const bg2 = g.createRadialGradient(ball.x - 3, ball.y - 3, 1, ball.x, ball.y, BR);
        bg2.addColorStop(0, "#ffffff");
        bg2.addColorStop(1, th.style === "medieval" ? "#6f6658" : "#8a93a6");
        g.fillStyle = bg2;
        g.beginPath();
        g.arc(ball.x, ball.y, BR, 0, Math.PI * 2);
        g.fill();
        unlift(g);
      }
      sparks.draw(g);
      floats.draw(g);
      if (th.style === "medieval") {
        g.fillStyle = "#2a1a0d";
        g.fillRect(108, 116, 184, 50);
        paint(g, "parchment", th, 111, 119, 178, 44);
        g.strokeStyle = "#b48a2c";
        g.lineWidth = 1;
        g.strokeRect(114.5, 122.5, 171, 37);
        g.fillStyle = "#2c1f12";
        g.font = `700 21px ${th.fontDisplay}`;
      } else if (th.style === "modern") {
        g.fillStyle = "#1d1d1f";
        rrect(g, 110, 118, 180, 46, 23);
        g.fill();
        g.fillStyle = "#fff";
        g.font = `800 20px ${th.fontDisplay}`;
      } else {
        g.fillStyle = "rgba(8, 14, 22, .9)";
        g.fillRect(110, 118, 180, 46);
        g.strokeStyle = th.accent;
        g.lineWidth = 1;
        g.strokeRect(110.5, 118.5, 179, 45);
        g.fillStyle = th.accent;
        g.font = `600 20px ${th.fontNum}`;
      }
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(points.toLocaleString(), 200, 136);
      g.font = th.style === "scifi" ? `500 9px ${th.fontNum}` : `600 10px ${th.fontUi}`;
      g.fillStyle = th.style === "medieval" ? "#6b5638" : th.style === "modern" ? "rgba(255,255,255,.7)" : th.inkSoft;
      g.fillText(`BALL ${Math.min(balls, drained + 1)} OF ${balls} · ×${mult} · ${Math.ceil(timeLeft)}s`, 200, 155);
      if (ball.inLane && ball.live && ball.y > 660) {
        g.font = th.style === "scifi" ? `600 11px ${th.fontNum}` : `700 11px ${th.fontUi}`;
        g.fillStyle = th.style === "medieval" ? "#2c1f12" : th.style === "modern" ? "#1d1d1f" : th.accent;
        g.fillText("HOLD SPACE", 366, 650);
      }
      g.restore();
    }
    kit.status(`Target ${goal.toLocaleString()}
3 balls`);
    return () => {};
  }
};

// src/frontend/arcade/games/race.ts
var RACE = {
  id: "race",
  title: "Three-legged race",
  howTo: [
    "Your partner's tied leg swings left and right along the meter.",
    "Step LEFT when it reaches the left zone, RIGHT when it reaches the right — alternating.",
    "Good steps build speed; stepping out of time makes you stumble, and three stumbles in a row is a fall.",
    "Beat the other pair to the tape."
  ],
  controls: "A / ← left step · D / → right step · tap the left or right half on touch",
  start(kit) {
    const L = kit.play.level;
    const sync = kit.play.partner?.sync ?? 0;
    const partner = kit.play.partner?.name ?? "your partner";
    const distance = 60;
    const zone = clamp((0.34 - 0.12 * L) * (1 + kit.aid("window") / 100), 0.12, 0.6);
    const basePeriod = 1 - 0.22 * L;
    const drift = (0.26 - 0.18 * sync) * (0.6 + 0.6 * L);
    const rivalTime = 52 - 26 * L;
    let phase = -Math.PI / 2, t = 0, you = 0, rival = 0, speed = 0, momentum = 1, expect = null;
    let lastZone = null, armed = { L: true, R: true };
    let stumbles = 0, stumbleRun = 0, falls = 0, down = 0, good = 0, steps = 0, over = false, perfect = 0;
    let legL = 0, legR = 0, rivalLeg = 0;
    const c = kit.canvas();
    const g = c.g;
    const th = kit.theme;
    const sparks = new Sparks, floats = new Floaters(th.fontDisplay, th.style === "scifi" ? null : "rgba(255,255,255,.8)");
    const seedOff = kit.rng() * 10;
    const marker = () => Math.sin(phase);
    const inZone = (side) => side === "L" ? marker() <= -(1 - zone) : marker() >= 1 - zone;
    const step = (side) => {
      if (over || down > 0)
        return;
      steps++;
      const ok = inZone(side) && (expect === null || expect === side);
      if (ok && armed[side]) {
        armed[side] = false;
        const q = (Math.abs(marker()) - (1 - zone)) / zone;
        const stride = 0.55 + 0.55 * clamp(q);
        if (q > 0.6)
          perfect++;
        good++;
        stumbleRun = 0;
        momentum = Math.min(1.5, momentum + 0.06);
        speed += stride * momentum * 1.9;
        expect = side === "L" ? "R" : "L";
        if (side === "L")
          legL = 1;
        else
          legR = 1;
        kit.synth.fx("step");
        sparks.burst(c.w * 0.3, lay().yy + lay().s * 0.5, th.style === "scifi" ? "rgba(94, 200, 229, .8)" : "rgba(150, 110, 70, .8)", 5, 90, 2);
        if (q > 0.6)
          floats.add(c.w * 0.3, lay().yy - lay().s * 1.3, "In step!", th.style === "scifi" ? th.accent : th.good, 15);
      } else {
        stumbles++;
        stumbleRun++;
        momentum = Math.max(0.6, momentum - 0.25);
        speed *= 0.4;
        kit.synth.fx("stumble");
        kit.shake(0.5);
        floats.add(c.w * 0.3, lay().yy - lay().s * 1.3, "Out of step", th.bad, 15);
        if (stumbleRun >= 3) {
          stumbleRun = 0;
          if (kit.lives.spend("Caught each other!"))
            return;
          falls++;
          down = 1.6;
          speed = 0;
          momentum = 1;
          kit.synth.fx("crash");
          kit.shake(1.2);
          kit.banner("Down you go!", "bad");
        }
      }
    };
    kit.onKey((e, isDown) => {
      const k = e.key.toLowerCase();
      const side = k === "a" || k === "arrowleft" ? "L" : k === "d" || k === "arrowright" ? "R" : null;
      if (!side)
        return false;
      if (isDown && !e.repeat)
        step(side);
      return true;
    });
    c.el.addEventListener("pointerdown", (e) => {
      if (kit.paused)
        return;
      const r = c.el.getBoundingClientRect();
      step(e.clientX - r.left < r.width / 2 ? "L" : "R");
    });
    withMusic(kit, () => backing(kit.synth, "bright", () => 1.1));
    kit.onQuit(() => finish(false));
    const finish = (won) => {
      if (over)
        return;
      over = true;
      const margin = won ? (distance - rival) / Math.max(0.5, distance / rivalTime) : 0;
      const s = won ? clamp(0.75 + 0.25 * clamp(margin / 6)) : clamp(0.75 * (you / distance));
      kit.score(s);
      kit.synth.fx(won ? "cheer" : "lose");
      if (won)
        kit.banner("First across!", "good");
      else
        kit.banner("Beaten to the tape", "bad");
      const beats = [];
      if (won)
        beats.push(margin > 4 ? `${partner} and {{user}} won going away` : margin < 1 ? `${partner} and {{user}} won by a whisker` : `${partner} and {{user}} won it`);
      else
        beats.push(you > distance * 0.85 ? "lost by a stride" : "the other pair ran away with it");
      if (falls)
        beats.push(falls > 1 ? "fell over more than once" : "went down in a heap once");
      else if (stumbles === 0)
        beats.push(`perfectly in step with ${partner}`);
      else if (stumbles < 4)
        beats.push(`mostly in step with ${partner}`);
      else
        beats.push(`kept tripping over each other`);
      kit.finish({ score: s, beats, detail: `${good} good steps, ${stumbles} stumbles${falls ? `, ${falls} fall${falls > 1 ? "s" : ""}` : ""}` });
    };
    kit.loop((dt) => {
      t += dt;
      if (!over) {
        const period = basePeriod * (1 + drift * Math.sin(t * 0.55 + seedOff) + drift * 0.5 * Math.sin(t * 1.7 + seedOff * 2));
        phase += dt * Math.PI * 2 / Math.max(0.35, period);
        const zoneNow = marker() <= -(1 - zone) ? "L" : marker() >= 1 - zone ? "R" : null;
        if (zoneNow !== lastZone) {
          if (lastZone && armed[lastZone] && down <= 0 && expect === lastZone) {
            momentum = Math.max(0.7, momentum - 0.1);
          }
          if (zoneNow)
            armed[zoneNow] = true;
          lastZone = zoneNow;
        }
        if (down > 0) {
          down -= dt;
          if (down <= 0)
            expect = null;
        }
        speed *= Math.pow(0.35, dt);
        you = Math.min(distance, you + speed * dt);
        rival = Math.min(distance, rival + distance / rivalTime * dt * (0.92 + 0.16 * Math.sin(t * 0.9 + seedOff)));
        rivalLeg = (rivalLeg + dt * 3.4) % (Math.PI * 2);
        kit.score(you >= distance ? 0.75 + 0.25 * clamp((distance - rival) / 8) : 0.75 * (you / distance));
        if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
          kit.track(clamp(0.5 + (you - rival) / 10));
          kit.status(`${Math.round(you)} m / ${distance}
${you >= rival ? "Ahead" : `${Math.round(rival - you)} m behind`}`);
        }
        if (you >= distance)
          finish(true);
        else if (rival >= distance)
          finish(false);
      }
      legL = Math.max(0, legL - dt * 4);
      legR = Math.max(0, legR - dt * 4);
      sparks.step(dt);
      floats.step(dt);
      draw();
    });
    const lay = () => {
      const meterH = 84;
      const top = Math.max(c.h * 0.36, 96), lane = Math.max(28, (c.h - meterH - top - 14) / 2);
      const s = Math.min(70, lane * 0.9);
      return { meterH, top, lane, s, ry: top + lane * 0.74, yy: top + lane * 1.78 };
    };
    const look = th.style === "medieval" ? { you: ["#9e2b1f", "#2c4a7a"], them: ["#5a6b2f", "#7a5a2c"], skin: ["#e3b98f", "#b98458"], legs: "#3b2a1c" } : th.style === "modern" ? { you: ["#ff5a36", "#2f6fe4"], them: ["#22a06b", "#8e5cf0"], skin: ["#f1c9a0", "#9a6845"], legs: "#1d1d1f" } : { you: ["#e9eef3", "#d5dde5"], them: ["#40566e", "#40566e"], skin: ["#5ec8e5", "#5ec8e5"], legs: "#2a3a4c" };
    const runner = (x, y, s, swing, shirt, skin, lean) => {
      g.save();
      g.translate(x, y);
      g.rotate(lean);
      g.lineCap = "round";
      g.strokeStyle = look.legs;
      g.lineWidth = s * 0.15;
      g.beginPath();
      g.moveTo(0, -s * 0.05);
      g.lineTo(Math.sin(swing) * s * 0.35, s * 0.55);
      g.stroke();
      g.beginPath();
      g.moveTo(0, -s * 0.05);
      g.lineTo(-Math.sin(swing) * s * 0.35, s * 0.55);
      g.stroke();
      if (th.style === "medieval") {
        g.fillStyle = shirt;
        g.beginPath();
        g.moveTo(-s * 0.13, -s * 0.6);
        g.lineTo(s * 0.13, -s * 0.6);
        g.lineTo(s * 0.2, s * 0.08);
        g.lineTo(-s * 0.2, s * 0.08);
        g.closePath();
        g.fill();
        g.fillStyle = "#4a2e16";
        g.fillRect(-s * 0.16, -s * 0.18, s * 0.32, s * 0.05);
      } else if (th.style === "scifi") {
        g.fillStyle = shirt;
        rrect(g, -s * 0.15, -s * 0.62, s * 0.3, s * 0.62, s * 0.08);
        g.fill();
        g.fillStyle = th.accent;
        g.fillRect(-s * 0.15, -s * 0.4, s * 0.3, s * 0.035);
      } else {
        g.fillStyle = shirt;
        rrect(g, -s * 0.14, -s * 0.6, s * 0.28, s * 0.6, s * 0.1);
        g.fill();
        g.fillStyle = "rgba(255,255,255,.85)";
        g.font = `800 ${s * 0.16}px ${th.fontDisplay}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(Math.abs(Math.round(x)) % 9 + 1), 0, -s * 0.33);
      }
      g.strokeStyle = th.style === "scifi" ? shirt : skin;
      g.lineWidth = s * 0.09;
      g.beginPath();
      g.moveTo(0, -s * 0.5);
      g.lineTo(-Math.sin(swing) * s * 0.3, -s * 0.15);
      g.stroke();
      g.beginPath();
      g.moveTo(0, -s * 0.5);
      g.lineTo(Math.sin(swing) * s * 0.3, -s * 0.15);
      g.stroke();
      if (th.style === "scifi") {
        g.fillStyle = shirt;
        g.beginPath();
        g.arc(0, -s * 0.77, s * 0.16, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#0a111b";
        g.beginPath();
        g.ellipse(s * 0.05, -s * 0.78, s * 0.1, s * 0.07, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = skin;
        g.lineWidth = 1;
        g.stroke();
      } else {
        g.fillStyle = skin;
        g.beginPath();
        g.arc(0, -s * 0.76, s * 0.14, 0, Math.PI * 2);
        g.fill();
        if (th.style === "medieval") {
          g.fillStyle = shirt;
          g.beginPath();
          g.arc(0, -s * 0.8, s * 0.15, Math.PI, 0);
          g.fill();
        }
      }
      g.restore();
    };
    function scenery(W, top, camera) {
      if (th.style === "medieval") {
        const sky = g.createLinearGradient(0, 0, 0, top);
        sky.addColorStop(0, "#c9d6d3");
        sky.addColorStop(1, "#efe4c8");
        g.fillStyle = sky;
        g.fillRect(0, 0, W, top);
        g.fillStyle = "#9aa889";
        g.beginPath();
        g.moveTo(0, top * 0.62);
        for (let x = 0;x <= W; x += 20)
          g.lineTo(x, top * 0.55 + Math.sin((x + camera * 0.1) * 0.012) * top * 0.08);
        g.lineTo(W, top);
        g.lineTo(0, top);
        g.fill();
        const tentW = 90;
        for (let i = -1;i < W / tentW + 2; i++) {
          const x = i * tentW * 1.4 - camera * 0.45 % (tentW * 1.4);
          const base = top - 4, h = top * 0.38;
          const stripes = i % 2 ? ["#9e2b1f", "#efe4c8"] : ["#2c4a7a", "#efe4c8"];
          for (let k = 0;k < 6; k++) {
            g.fillStyle = stripes[k % 2];
            g.beginPath();
            g.moveTo(x + tentW / 2, base - h);
            g.lineTo(x + k / 6 * tentW, base);
            g.lineTo(x + (k + 1) / 6 * tentW, base);
            g.closePath();
            g.fill();
          }
          g.strokeStyle = "#4a2e16";
          g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(x + tentW / 2, base - h);
          g.lineTo(x + tentW / 2, base - h - 12);
          g.stroke();
          g.fillStyle = "#b48a2c";
          g.beginPath();
          g.moveTo(x + tentW / 2, base - h - 12);
          g.lineTo(x + tentW / 2 + 10, base - h - 9);
          g.lineTo(x + tentW / 2, base - h - 6);
          g.fill();
        }
        g.strokeStyle = "#4a2e16";
        g.lineWidth = 1;
        g.beginPath();
        for (let x = 0;x <= W; x += 10)
          g.lineTo(x, top * 0.18 + Math.sin(x * 0.02) * 6);
        g.stroke();
        const cols = ["#9e2b1f", "#b48a2c", "#2c4a7a", "#3e6b3a"];
        for (let k = 0, x = -(camera * 0.2 % 30);x < W; x += 30, k++) {
          const y = top * 0.18 + Math.sin(x * 0.02) * 6;
          g.fillStyle = cols[k % 4];
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + 14, y);
          g.lineTo(x + 7, y + 14);
          g.closePath();
          g.fill();
        }
      } else if (th.style === "modern") {
        const sky = g.createLinearGradient(0, 0, 0, top);
        sky.addColorStop(0, "#bfe0f5");
        sky.addColorStop(1, "#eaf5fb");
        g.fillStyle = sky;
        g.fillRect(0, 0, W, top);
        const st = top * 0.32, sh = top * 0.6;
        g.fillStyle = "#d9d6cf";
        g.fillRect(0, st, W, sh);
        g.fillStyle = "#c9c5bc";
        for (let r = 1;r < 5; r++)
          g.fillRect(0, st + sh / 5 * r, W, 1.5);
        const head = Math.max(3, sh / 13);
        const colors = ["#ff5a36", "#2f6fe4", "#ffb020", "#22a06b", "#8e5cf0", "#ffffff", "#1d1d1f"];
        for (let r = 0;r < 5; r++)
          for (let i = 0;i < W / (head * 2.6) + 2; i++) {
            const x = ((i * head * 2.6 + r * head * 1.3 - camera * 0.3) % (W + head * 6) + W + head * 6) % (W + head * 6) - head * 3;
            const y = st + sh / 5 * (r + 0.55) + Math.sin(tt * 7 + i + r) * (over ? head * 0.6 : head * 0.12);
            g.fillStyle = colors[(i * 3 + r * 2) % colors.length];
            g.beginPath();
            g.arc(x, y, head, 0, Math.PI * 2);
            g.fill();
          }
        g.fillStyle = "#1d1d1f";
        g.fillRect(0, st - 6, W, 6);
      } else {
        g.fillStyle = "#04070c";
        g.fillRect(0, 0, W, top);
        for (let i = 0;i < 70; i++) {
          const x = ((i * 137.5 - camera * 0.05) % W + W) % W, y = i * 61.7 % (top * 0.9);
          g.fillStyle = `rgba(214, 226, 238, ${0.25 + i % 5 * 0.12})`;
          g.fillRect(x, y, i % 7 ? 1 : 2, i % 7 ? 1 : 2);
        }
        const pr = W * 0.9;
        const pg = g.createRadialGradient(W * 0.7, top + pr * 0.85, pr * 0.8, W * 0.7, top + pr * 0.85, pr);
        pg.addColorStop(0, "#16324a");
        pg.addColorStop(0.97, "#1f4f73");
        pg.addColorStop(1, "rgba(94, 200, 229, .5)");
        g.fillStyle = pg;
        g.beginPath();
        g.arc(W * 0.7, top + pr * 0.85, pr, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(120, 170, 210, .25)";
        g.lineWidth = 2;
        for (let x = -(camera * 0.6 % 120);x < W; x += 120) {
          g.beginPath();
          g.moveTo(x, top);
          g.lineTo(x + 40, 0);
          g.stroke();
        }
      }
    }
    function track(W, top, lane, camera) {
      const h = lane * 2 + 8;
      if (th.style === "medieval") {
        g.fillStyle = "#6f8a4a";
        g.fillRect(0, top - 10, W, c.h - top + 10);
        g.fillStyle = "#b08a5a";
        g.fillRect(0, top, W, h);
        g.globalAlpha = 0.35;
        paint(g, "parchment", { ...th, ground: "#a07c4e" }, 0, top, W, h);
        g.globalAlpha = 1;
        g.strokeStyle = "rgba(239, 228, 200, .7)";
        g.lineWidth = 2;
        g.setLineDash([10, 8]);
        g.beginPath();
        g.moveTo(0, top + lane + 4);
        g.lineTo(W, top + lane + 4);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = "#4a2e16";
        g.fillRect(0, top - 2, W, 3);
        g.fillRect(0, top + h - 1, W, 3);
      } else if (th.style === "modern") {
        g.fillStyle = "#7cb35b";
        g.fillRect(0, top - 10, W, c.h - top + 10);
        g.fillStyle = "#c8613a";
        g.fillRect(0, top, W, h);
        g.strokeStyle = "rgba(255,255,255,.9)";
        g.lineWidth = 2;
        for (const y of [top + 1, top + lane + 4, top + h - 1]) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(W, y);
          g.stroke();
        }
      } else {
        g.fillStyle = "#0b131d";
        g.fillRect(0, top - 10, W, c.h - top + 10);
        g.fillStyle = "#121e2c";
        g.fillRect(0, top, W, h);
        for (let x = -(camera % 40);x < W; x += 40) {
          g.fillStyle = "rgba(120, 170, 210, .06)";
          g.fillRect(x, top, 1, h);
        }
        g.fillStyle = th.accent;
        for (const y of [top, top + lane + 4, top + h - 1])
          g.fillRect(0, y, W, 1);
      }
      for (let m = 0;m <= distance; m += 10) {
        const x = m * 26 - camera;
        if (x < -60 || x > W + 60)
          continue;
        const fin = m === distance;
        if (fin) {
          if (th.style === "medieval") {
            g.fillStyle = "#4a2e16";
            g.fillRect(x - 3, top - 40, 5, h + 40);
            g.fillRect(x - 3, top + h - 2, 5, 6);
            if (!over) {
              g.strokeStyle = "#9e2b1f";
              g.lineWidth = 3;
              g.beginPath();
              g.moveTo(x, top - 30);
              g.quadraticCurveTo(x + 6, top + h / 2, x, top + h);
              g.stroke();
            }
          } else if (th.style === "modern") {
            for (let yy = 0;yy < h; yy += 8)
              for (let k = 0;k < 2; k++) {
                g.fillStyle = (yy / 8 + k) % 2 ? "#1d1d1f" : "#fff";
                g.fillRect(x - 8 + k * 8, top + yy, 8, 8);
              }
          } else {
            g.strokeStyle = th.accent2;
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(x, top);
            g.lineTo(x, top + h);
            g.stroke();
            g.strokeStyle = "rgba(242, 165, 65, .4)";
            g.beginPath();
            g.arc(x, top + h / 2, h * 0.7, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9);
            g.stroke();
          }
        } else {
          g.fillStyle = th.style === "scifi" ? "rgba(94, 200, 229, .35)" : "rgba(255,255,255,.55)";
          g.fillRect(x - 1, top, 2, h);
        }
        const label = fin ? th.style === "medieval" ? "The ribbon" : th.style === "scifi" ? "FINISH" : "Finish" : th.style === "medieval" ? `${m} paces` : `${m} m`;
        if (th.style === "medieval") {
          g.font = `600 13px ${th.fontUi}`;
          const w = g.measureText(label).width + 12;
          g.fillStyle = "#6b4426";
          g.fillRect(x - w / 2, top - 22, w, 16);
          g.fillStyle = "#4a2e16";
          g.fillRect(x - 1, top - 6, 2, 6);
          g.fillStyle = "#efe4c8";
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText(label, x, top - 14);
        } else {
          g.font = th.style === "scifi" ? `500 11px ${th.fontNum}` : `700 11px ${th.fontUi}`;
          g.fillStyle = th.style === "scifi" ? th.accent : "#1d1d1f";
          g.textAlign = "center";
          g.textBaseline = "bottom";
          g.fillText(label, x, top - 5);
        }
      }
    }
    function meter(W, H) {
      const mw = Math.min(W * 0.8, 520), mx = W / 2, my = H - 40;
      const zw = mw / 2 * zone;
      const zl = expect !== "R" && down <= 0, zr = expect !== "L" && down <= 0;
      const px = mx + marker() * (mw / 2 - 8);
      if (th.style === "medieval") {
        lift(g, th, 1.5);
        g.fillStyle = "#2a1a0d";
        g.fillRect(mx - mw / 2 - 18, my - 34, mw + 36, 62);
        unlift(g);
        paint(g, "parchment", th, mx - mw / 2 - 15, my - 31, mw + 30, 56);
        g.strokeStyle = "#b48a2c";
        g.lineWidth = 1;
        g.strokeRect(mx - mw / 2 - 11.5, my - 27.5, mw + 23, 49);
        g.fillStyle = "rgba(74, 52, 28, .15)";
        g.fillRect(mx - mw / 2, my - 5, mw, 10);
        g.fillStyle = zl ? "#3e6b3a" : "rgba(62, 107, 58, .3)";
        g.fillRect(mx - mw / 2, my - 5, zw, 10);
        g.fillStyle = zr ? "#3e6b3a" : "rgba(62, 107, 58, .3)";
        g.fillRect(mx + mw / 2 - zw, my - 5, zw, 10);
        g.fillStyle = "#6b4426";
        g.beginPath();
        g.ellipse(px, my, 7, 12, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#2c1f12";
        g.lineWidth = 1;
        g.stroke();
      } else if (th.style === "modern") {
        lift(g, th, 2);
        g.fillStyle = "#fff";
        rrect(g, mx - mw / 2 - 18, my - 32, mw + 36, 60, 30);
        g.fill();
        unlift(g);
        g.fillStyle = "#ece9e2";
        rrect(g, mx - mw / 2, my - 6, mw, 12, 6);
        g.fill();
        g.fillStyle = zl ? th.good : "rgba(31, 157, 85, .25)";
        rrect(g, mx - mw / 2, my - 6, zw, 12, 6);
        g.fill();
        g.fillStyle = zr ? th.good : "rgba(31, 157, 85, .25)";
        rrect(g, mx + mw / 2 - zw, my - 6, zw, 12, 6);
        g.fill();
        lift(g, th);
        g.fillStyle = "#1d1d1f";
        g.beginPath();
        g.arc(px, my, 10, 0, Math.PI * 2);
        g.fill();
        unlift(g);
        g.strokeStyle = "#fff";
        g.lineWidth = 2;
        g.stroke();
      } else {
        g.fillStyle = "rgba(10, 17, 27, .92)";
        g.fillRect(mx - mw / 2 - 18, my - 32, mw + 36, 60);
        brackets(g, mx - mw / 2 - 18, my - 32, mw + 36, 60, th.accent, 10);
        g.fillStyle = "rgba(120, 170, 210, .14)";
        for (let x = mx - mw / 2;x < mx + mw / 2; x += 8)
          g.fillRect(x, my - 4, 6, 8);
        g.fillStyle = zl ? th.accent : "rgba(94, 200, 229, .25)";
        for (let x = mx - mw / 2;x < mx - mw / 2 + zw; x += 8)
          g.fillRect(x, my - 4, 6, 8);
        g.fillStyle = zr ? th.accent : "rgba(94, 200, 229, .25)";
        for (let x = mx + mw / 2 - zw;x < mx + mw / 2; x += 8)
          g.fillRect(x, my - 4, 6, 8);
        g.fillStyle = th.accent2;
        g.fillRect(px - 2, my - 12, 4, 24);
      }
      const ink = th.style === "scifi" ? th.accent : th.style === "medieval" ? "#2c1f12" : "#1d1d1f";
      const font = th.style === "scifi" ? `500 12px ${th.fontNum}` : th.style === "medieval" ? `700 12px ${th.fontDisplay}` : `700 12px ${th.fontUi}`;
      g.font = font;
      g.textBaseline = "middle";
      g.fillStyle = zl ? ink : "rgba(128,128,128,.5)";
      g.textAlign = "left";
      g.fillText("A", mx - mw / 2 - 4, my - 18);
      g.fillStyle = zr ? ink : "rgba(128,128,128,.5)";
      g.textAlign = "right";
      g.fillText("D", mx + mw / 2 + 4, my - 18);
      g.fillStyle = ink;
      g.textAlign = "center";
      g.fillText(down > 0 ? "Getting up…" : `${partner}'s stride`, mx, my - 18);
    }
    let tt = 0;
    function draw() {
      tt += 1 / 60;
      const { w: W, h: H } = c;
      const L = lay();
      const camera = you * 26 - W * 0.3;
      g.clearRect(0, 0, W, H);
      scenery(W, L.top, camera);
      track(W, L.top, L.lane, camera);
      const rx = rival * 26 - camera;
      runner(rx - L.s * 0.18, L.ry, L.s * 0.9, Math.sin(rivalLeg) * 0.9, look.them[0], look.skin[0], 0.12);
      runner(rx + L.s * 0.18, L.ry, L.s * 0.9, -Math.sin(rivalLeg) * 0.9, look.them[1], look.skin[1], 0.12);
      const yx = you * 26 - camera;
      const stride = (legL - legR) * 1.1;
      if (down > 0) {
        g.save();
        g.translate(yx, L.yy + L.s * 0.2);
        g.rotate(-1.2);
        runner(0, 0, L.s, 0.4, look.you[0], look.skin[0], 0);
        g.restore();
        g.save();
        g.translate(yx + L.s * 0.4, L.yy + L.s * 0.25);
        g.rotate(-1.4);
        runner(0, 0, L.s, -0.3, look.you[1], look.skin[1], 0);
        g.restore();
      } else {
        runner(yx - L.s * 0.2, L.yy, L.s, stride + Math.sin(tt * 12) * 0.05, look.you[0], look.skin[0], 0.08 + speed * 0.01);
        runner(yx + L.s * 0.2, L.yy, L.s, -stride, look.you[1], look.skin[1], 0.08 + speed * 0.01);
        g.strokeStyle = th.style === "medieval" ? "#c9a96a" : th.style === "scifi" ? th.accent2 : "#fff";
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(yx - L.s * 0.06, L.yy + L.s * 0.42);
        g.lineTo(yx + L.s * 0.06, L.yy + L.s * 0.42);
        g.stroke();
      }
      g.font = th.style === "scifi" ? `500 11px ${th.fontNum}` : `700 12px ${th.style === "medieval" ? th.fontUi : th.fontUi}`;
      g.fillStyle = th.style === "scifi" ? th.accent : "#fff";
      g.textAlign = "center";
      g.textBaseline = "bottom";
      if (th.style !== "scifi") {
        g.lineWidth = 3;
        g.strokeStyle = "rgba(0,0,0,.35)";
        g.strokeText(`You & ${partner}`, yx, L.yy - L.s * 1);
      }
      g.fillText(`You & ${partner}`, yx, L.yy - L.s * 1);
      sparks.draw(g);
      floats.draw(g);
      meter(W, H);
      g.textAlign = "left";
      g.textBaseline = "top";
      g.font = th.style === "scifi" ? `600 14px ${th.fontNum}` : `700 15px ${th.fontDisplay}`;
      g.fillStyle = th.style === "scifi" ? th.ink : "#1d1d1f";
      g.fillText(`${Math.round(you)}${th.style === "medieval" ? " paces" : " m"}`, 14, 12);
      g.fillStyle = th.style === "scifi" ? th.inkSoft : "rgba(29,29,31,.6)";
      g.font = th.style === "scifi" ? `500 12px ${th.fontNum}` : `600 13px ${th.fontUi}`;
      g.fillText(`Rivals ${Math.round(rival)}`, 14, 32);
    }
    kit.status(`Tied to ${partner}`);
    kit.synth.fx("whistle");
    return () => {};
  }
};

// src/frontend/arcade/games/roulette.ts
var ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
var REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
var colorOf = (n) => n === 0 ? "green" : REDS.has(n) ? "red" : "black";
function betWins(bet, n) {
  if (bet.startsWith("n:"))
    return Number(bet.slice(2)) === n ? 35 : -1;
  if (n === 0)
    return -1;
  switch (bet) {
    case "red":
      return REDS.has(n) ? 1 : -1;
    case "black":
      return !REDS.has(n) ? 1 : -1;
    case "odd":
      return n % 2 ? 1 : -1;
    case "even":
      return n % 2 ? -1 : 1;
    case "low":
      return n <= 18 ? 1 : -1;
    case "high":
      return n >= 19 ? 1 : -1;
    case "d1":
      return n <= 12 ? 2 : -1;
    case "d2":
      return n >= 13 && n <= 24 ? 2 : -1;
    case "d3":
      return n >= 25 ? 2 : -1;
    case "c1":
      return n % 3 === 1 ? 2 : -1;
    case "c2":
      return n % 3 === 2 ? 2 : -1;
    case "c3":
      return n % 3 === 0 ? 2 : -1;
  }
  return -1;
}
var CSS4 = `
.rl { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr); gap: 18px; padding: 16px; align-items: center;
  background: var(--rl-table); color: var(--rl-ink); font-family: var(--ar-ui); }
.rl-wheel { position: relative; height: 100%; min-height: 0; display: grid; place-items: center; }
.rl-wheel canvas { width: 100%; height: 100%; }
.rl-right { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.rl-board { display: grid; grid-template-columns: .9fr repeat(12, 1fr) 1.15fr; grid-template-rows: repeat(3, var(--rh)) var(--rh) var(--rh); gap: 3px; padding: 8px; border-radius: var(--rl-r, 10px); background: var(--rl-felt); box-shadow: var(--rl-frame); }
.rl .rl-c { position: relative; border: 1px solid var(--rl-cell-line); border-radius: var(--rl-cr, 4px); display: grid; place-items: center; font: 700 clamp(10px, 1.2vw, 14px) var(--rl-font); color: var(--rl-num); background: transparent; cursor: pointer; padding: 0; transition: filter .1s, box-shadow .1s; }
.rl .rl-c:hover { filter: brightness(1.15); box-shadow: inset 0 0 0 2px var(--rl-hi); }
.rl .rl-c.red, .rl .rl-c.out.red { background: var(--rl-red); } .rl-c.black, .rl .rl-c.out.black { background: var(--rl-black); } .rl-c.green { background: var(--rl-green); }
.rl .rl-c.zero { grid-row: 1 / 4; }
.rl .rl-c.out { background: var(--rl-out); font-size: clamp(9px, 1vw, 12px); letter-spacing: .04em; }
.rl .rl-c.win { animation: rl-win .9s ease-in-out 3; box-shadow: 0 0 0 3px var(--rl-hi); z-index: 1; }
@keyframes rl-win { 50% { filter: brightness(1.5); } }
.rl-chipon { position: absolute; right: -4px; top: -6px; min-width: 24px; height: 24px; padding: 0 4px; border-radius: 12px; display: grid; place-items: center; font: 700 10px var(--ar-num); color: #1b1b1b;
  background: var(--rl-chipon); box-shadow: 0 2px 5px rgba(0,0,0,.4); pointer-events: none; z-index: 2; animation: rl-drop .2s ease-out both; }
@keyframes rl-drop { from { transform: translateY(-10px) scale(1.3); opacity: 0; } }
.rl-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.rl .rl-chip { width: 48px; height: 48px; border-radius: 50%; border: 0; cursor: pointer; font: 700 11px var(--ar-num); color: #1b1b1b;
  background: radial-gradient(circle, #fbf8f1 0 36%, transparent 37%), repeating-conic-gradient(var(--chip) 0 22.5deg, #f4efe4 22.5deg 30deg); box-shadow: 0 3px 8px rgba(0,0,0,.35); transition: transform .12s; }
.rl .rl-chip.on { transform: translateY(-5px); box-shadow: 0 0 0 3px var(--rl-hi), 0 8px 16px rgba(0,0,0,.4); }
.rl .rl-btn { padding: 11px 18px; border-radius: var(--rl-pill, 999px); border: 1px solid var(--rl-line); background: var(--rl-plate); color: var(--rl-ink); font: 700 13.5px var(--rl-font); letter-spacing: .08em; text-transform: uppercase; cursor: pointer; }
.rl .rl-btn.main { background: var(--rl-main); color: var(--rl-on-main); border-color: transparent; min-width: 120px; }
.rl .rl-btn:disabled { opacity: .35; cursor: not-allowed; }
.rl .rl-btn.luck { border-color: var(--rl-hi); color: var(--rl-hi); }
.rl-info { font: 500 12.5px var(--ar-num); color: var(--rl-dim); }
.rl-hist { display: flex; gap: 4px; }
.rl-hist span { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font: 700 11px var(--ar-num); color: #fff; }
.rl-hist .red { background: var(--rl-red); } .rl-hist .black { background: var(--rl-black); } .rl-hist .green { background: var(--rl-green); }
@media (max-width: 760px) { .rl { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, .8fr) auto; } }

.rl[data-style=modern] { --rl-table: #f3f1ec; --rl-ink: #1d1d1f; --rl-dim: #6e6e73; --rl-felt: #1f6b4f; --rl-frame: 0 10px 30px rgba(0,0,0,.12); --rl-cell-line: rgba(255,255,255,.4); --rl-num: #fff; --rl-font: var(--ar-display);
  --rl-red: #c8302d; --rl-black: #1d1d1f; --rl-green: #22a06b; --rl-out: rgba(255,255,255,.08); --rl-hi: #f2d27a; --rl-chipon: radial-gradient(circle, #fff 0 45%, #f2d27a 46%);
  --rl-line: rgba(29,29,31,.15); --rl-plate: #fff; --rl-main: #1d1d1f; --rl-on-main: #fff; }
.rl[data-style=medieval] { --rl-table: var(--ar-wood) 0 0 / 256px; --rl-ink: #ecdfbf; --rl-dim: rgba(236,223,191,.7); --rl-felt: #2f4a2a; --rl-r: 2px; --rl-cr: 1px;
  --rl-frame: 0 0 0 2px #b48a2c, 0 0 0 6px #3b2414, 0 0 0 7px rgba(180,138,44,.6), 0 14px 30px rgba(0,0,0,.5); --rl-cell-line: rgba(233,196,106,.35); --rl-num: #f3e7c8; --rl-font: var(--ar-display);
  --rl-red: #8c2a1f; --rl-black: #231a10; --rl-green: #3e6b3a; --rl-out: rgba(0,0,0,.18); --rl-hi: #e9c46a; --rl-chipon: radial-gradient(circle at 35% 30%, #f6dc8a, #b48a2c 70%);
  --rl-line: rgba(214,181,106,.5); --rl-plate: rgba(20,10,2,.5); --rl-main: #9e2b1f; --rl-on-main: #f3e7c8; --rl-pill: 2px; }
.rl[data-style=medieval] .rl-chip { color: #3a2508; font-family: var(--ar-display); background: radial-gradient(circle at 35% 30%, #f6dc8a, #c9952f 55%, #8a6214 100%); box-shadow: 0 3px 6px rgba(20,10,2,.5), inset 0 0 0 3px rgba(107,74,18,.5); }
.rl[data-style=medieval] .rl-chip:nth-child(1) { background: radial-gradient(circle at 35% 30%, #f0b98a, #b5703a 55%, #6b3a14 100%); }
.rl[data-style=medieval] .rl-chip:nth-child(2) { background: radial-gradient(circle at 35% 30%, #f1f1ea, #b8b6ab 55%, #6f6c61 100%); }
.rl[data-style=medieval] .rl-c { box-shadow: inset 0 0 0 1px rgba(0,0,0,.25); }
.rl[data-style=scifi] { --rl-table: radial-gradient(ellipse at 30% 50%, #0f2132, #08111b 60%); --rl-ink: #d6e2ee; --rl-dim: #8ea3b8; --rl-felt: rgba(8, 14, 22, .9); --rl-r: 0; --rl-cr: 0;
  --rl-frame: inset 0 0 0 1px rgba(94,200,229,.4); --rl-cell-line: rgba(120,170,210,.25); --rl-num: #d6e2ee; --rl-font: var(--ar-num);
  --rl-red: rgba(239, 100, 97, .28); --rl-black: rgba(20, 32, 46, .9); --rl-green: rgba(95, 211, 160, .28); --rl-out: transparent; --rl-hi: #5ec8e5; --rl-chipon: #5ec8e5;
  --rl-line: rgba(94,200,229,.35); --rl-plate: rgba(10,17,27,.9); --rl-main: rgba(94,200,229,.16); --rl-on-main: #5ec8e5; --rl-pill: 0; }
.rl[data-style=scifi] .rl-chip { border-radius: 0; width: 54px; height: 38px; background: rgba(10,17,27,.9); color: #d6e2ee; box-shadow: inset 0 0 0 1px rgba(120,170,210,.35); clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }
.rl[data-style=scifi] .rl-chip.on { transform: none; color: #5ec8e5; box-shadow: inset 0 0 0 1px #5ec8e5; background: rgba(94,200,229,.14); }
.rl[data-style=scifi] .rl-btn.main { border-color: #5ec8e5; }
.rl[data-style=scifi] .rl-hist span { border-radius: 0; }
`;
var ROULETTE = {
  id: "roulette",
  title: "Roulette",
  howTo: [
    "Pick a chip, then click the felt to bet: numbers pay 35 to 1, dozens and columns 2 to 1, red/black/odd/even 1 to 1.",
    "Spin. Zero beats every outside bet.",
    "Played as a check, your odds lean on the wheel: easy checks land your way more often, hard ones less."
  ],
  controls: "Click the felt to bet · right-click to take a chip back · Space spins",
  start(kit) {
    const L = kit.play.level;
    const gamble = kit.play.mode === "gamble";
    const start = gamble ? kit.play.stake : 100;
    const spins = gamble ? kit.play.rounds ?? 5 : 4;
    const unit = Math.max(1, Math.round(start / 20));
    const denoms = [unit, unit * 2, unit * 5, unit * 10];
    const lean = gamble ? kit.aid("luck") / 200 - Math.max(0, (kit.play.edge ?? 0.027) - 0.027) * 3 : (0.45 - L) * 0.6 + kit.aid("luck") / 100;
    let chip = denoms[1], chips = start, spin = 0, over = false, spinning = false;
    let bets = new Map, lastBets = new Map;
    const history = [];
    let bigWin = 0, rescued = 0;
    let undo = null;
    const root = document.createElement("div");
    root.className = "rl";
    root.dataset.style = kit.theme.style;
    const th = kit.theme;
    const cells = [];
    cells.push(`<button class="rl-c green zero" data-bet="n:0">0</button>`);
    for (let col = 0;col < 12; col++)
      for (let row = 0;row < 3; row++) {
        const n = col * 3 + (3 - row);
        cells.push(`<button class="rl-c ${colorOf(n)}" style="grid-column:${col + 2};grid-row:${row + 1}" data-bet="n:${n}">${n}</button>`);
      }
    for (let row = 0;row < 3; row++)
      cells.push(`<button class="rl-c out" style="grid-column:14;grid-row:${row + 1}" data-bet="c${3 - row}">2 to 1</button>`);
    ["1st 12", "2nd 12", "3rd 12"].forEach((t, i) => cells.push(`<button class="rl-c out" style="grid-column:${2 + i * 4} / span 4;grid-row:4" data-bet="d${i + 1}">${t}</button>`));
    [["low", "1–18"], ["even", "Even"], ["red", "◆"], ["black", "◆"], ["odd", "Odd"], ["high", "19–36"]].forEach(([k, t], i) => cells.push(`<button class="rl-c out${k === "red" ? " red" : k === "black" ? " black" : ""}" style="grid-column:${2 + i * 2} / span 2;grid-row:5" data-bet="${k}">${t}</button>`));
    root.innerHTML = `<style>${CSS4}</style>
      <div class="rl-wheel"><canvas></canvas></div>
      <div class="rl-right">
        <div class="rl-row"><div class="rl-hist" data-hist></div><span class="rl-info" data-info></span></div>
        <div class="rl-board">${cells.join("")}</div>
        <div class="rl-row" data-chips>${denoms.map((d, i) => `<button class="rl-chip${d === chip ? " on" : ""}" style="--chip:${["#b8352a", "#2f5fa8", "#2a7a4b", "#232323"][i]}" data-chip="${d}">${d}</button>`).join("")}</div>
        <div class="rl-row" data-actions></div>
      </div>`;
    kit.root.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const board = $(".rl-board");
    const size = () => {
      const r = root.getBoundingClientRect();
      board.style.setProperty("--rh", `${Math.max(28, Math.min(54, (r.height - 220) / 5, r.width / 26))}px`);
    };
    const ro = new ResizeObserver(size);
    ro.observe(root);
    size();
    const staked = () => [...bets.values()].reduce((a, b) => a + b, 0);
    const paint2 = () => {
      board.querySelectorAll(".rl-chipon").forEach((x) => x.remove());
      for (const [k, v] of bets)
        board.querySelector(`[data-bet="${k}"]`)?.insertAdjacentHTML("beforeend", `<span class="rl-chipon">${v}</span>`);
      $("[data-hist]").innerHTML = history.slice(-8).map((n) => `<span class="${colorOf(n)}">${n}</span>`).join("");
      $("[data-info]").textContent = `Spin ${Math.min(spin + 1, spins)} of ${spins} · ${kit.play.currency ?? ""}${chips} · on the felt ${staked()}`;
      root.querySelectorAll("[data-chip]").forEach((b) => {
        b.classList.toggle("on", Number(b.dataset.chip) === chip);
        b.disabled = Number(b.dataset.chip) > chips;
      });
      const done = spin >= spins || chips + staked() < denoms[0];
      $("[data-actions]").innerHTML = done && !spinning ? `<button class="rl-btn main" data-leave>Done</button>${undo && kit.lives.left() > 0 ? `<button class="rl-btn luck" data-luck>Lucky re-spin</button>` : ""}` : `<button class="rl-btn main" data-spin ${staked() && !spinning ? "" : "disabled"}>Spin</button>
        <button class="rl-btn" data-clear ${staked() && !spinning ? "" : "disabled"}>Clear</button>
        <button class="rl-btn" data-rebet ${lastBets.size && !staked() && !spinning ? "" : "disabled"}>Rebet</button>
        ${gamble && spin > 0 && !spinning ? `<button class="rl-btn" data-leave>Cash out</button>` : ""}
        ${undo && kit.lives.left() > 0 && !spinning ? `<button class="rl-btn luck" data-luck>Lucky re-spin</button>` : ""}`;
      kit.chips(chips + staked());
      kit.status(`Spin ${Math.min(spin + 1, spins)} of ${spins}
Chips ${chips + staked()}`);
    };
    const place = (bet, sign = 1) => {
      if (spinning || over)
        return;
      if (undo)
        undo = null;
      if (sign > 0) {
        if (chip > chips)
          return;
        bets.set(bet, (bets.get(bet) ?? 0) + chip);
        chips -= chip;
        kit.synth.fx("chip");
      } else {
        const v = bets.get(bet) ?? 0;
        if (!v)
          return;
        const back = Math.min(v, chip);
        if (v - back <= 0)
          bets.delete(bet);
        else
          bets.set(bet, v - back);
        chips += back;
        kit.synth.fx("click");
      }
      paint2();
    };
    const cv = root.querySelector("canvas");
    const g = cv.getContext("2d");
    let wheelAng = 0, ballAng = 0, ballR = 1, anim = null;
    const fit = () => {
      const r = cv.getBoundingClientRect();
      const d = Math.min(2, devicePixelRatio || 1);
      cv.width = r.width * d;
      cv.height = r.height * d;
      g.setTransform(d, 0, 0, d, 0, 0);
    };
    const ro2 = new ResizeObserver(fit);
    ro2.observe(cv);
    fit();
    const drawWheel = () => {
      const r0 = cv.getBoundingClientRect();
      const { width: W, height: H } = r0, R = Math.min(W, H) * 0.46, cx = W / 2, cy = H / 2;
      g.clearRect(0, 0, W, H);
      const n = ORDER.length, step = Math.PI * 2 / n;
      const pocket = (num) => {
        const col = colorOf(num);
        if (th.style === "medieval")
          return col === "red" ? "#8c2a1f" : col === "black" ? "#231a10" : "#3e6b3a";
        if (th.style === "modern")
          return col === "red" ? "#c8302d" : col === "black" ? "#1d1d1f" : "#22a06b";
        return col === "red" ? "#3a1a22" : col === "black" ? "#0d1724" : "#123a2c";
      };
      if (th.style === "medieval") {
        g.save();
        g.beginPath();
        g.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
        g.clip();
        paint(g, "wood", { ...th, wood: "#5a3a20" }, cx - R * 1.1, cy - R * 1.1, R * 2.2, R * 2.2);
        g.restore();
        g.strokeStyle = "#2a1a0d";
        g.lineWidth = 4;
        g.beginPath();
        g.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
        g.stroke();
        g.strokeStyle = "#c9952f";
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, R * 0.96, 0, Math.PI * 2);
        g.stroke();
        for (let k = 0;k < 24; k++) {
          const a = k * Math.PI / 12;
          g.fillStyle = "#c9952f";
          g.beginPath();
          g.arc(cx + Math.cos(a) * R * 1.02, cy + Math.sin(a) * R * 1.02, Math.max(2, R * 0.018), 0, Math.PI * 2);
          g.fill();
        }
      } else if (th.style === "modern") {
        lift(g, th, 3);
        g.fillStyle = "#2b2b2e";
        g.beginPath();
        g.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
        g.fill();
        unlift(g);
        const rim = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.08);
        rim.addColorStop(0, "#3a3a3e");
        rim.addColorStop(1, "#1d1d1f");
        g.fillStyle = rim;
        g.beginPath();
        g.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = "#08111b";
        g.beginPath();
        g.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(94, 200, 229, .5)";
        g.lineWidth = 1;
        g.beginPath();
        g.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([2, 6]);
        g.beginPath();
        g.arc(cx, cy, R * 0.97, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
      }
      for (let i = 0;i < n; i++) {
        const a = wheelAng + i * step - Math.PI / 2;
        g.fillStyle = pocket(ORDER[i]);
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, R * 0.9, a - step / 2, a + step / 2);
        g.closePath();
        g.fill();
        g.save();
        g.translate(cx + Math.cos(a) * R * 0.8, cy + Math.sin(a) * R * 0.8);
        g.rotate(a + Math.PI / 2);
        g.fillStyle = th.style === "medieval" ? "#f3e7c8" : th.style === "scifi" ? colorOf(ORDER[i]) === "red" ? "#ef6461" : colorOf(ORDER[i]) === "green" ? "#5fd3a0" : "#d6e2ee" : "#fff";
        g.font = `${th.style === "scifi" ? 500 : 700} ${Math.max(8, R * 0.075)}px ${th.style === "scifi" ? th.fontNum : th.fontDisplay}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(ORDER[i]), 0, 0);
        g.restore();
      }
      g.strokeStyle = th.style === "medieval" ? "rgba(201, 149, 47, .8)" : th.style === "modern" ? "rgba(255,255,255,.35)" : "rgba(94, 200, 229, .3)";
      g.lineWidth = th.style === "modern" ? 1 : 1.5;
      for (let i = 0;i < n; i++) {
        const a = wheelAng + i * step - Math.PI / 2 + step / 2;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62);
        g.lineTo(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9);
        g.stroke();
      }
      if (th.style === "medieval") {
        g.save();
        g.beginPath();
        g.arc(cx, cy, R * 0.62, 0, Math.PI * 2);
        g.clip();
        paint(g, "wood", { ...th, wood: "#7a5230" }, cx - R, cy - R, R * 2, R * 2);
        g.restore();
        g.strokeStyle = "#c9952f";
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, R * 0.62, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = "#c9952f";
        for (let k = 0;k < 12; k++) {
          const a = wheelAng + k * Math.PI / 6;
          g.beginPath();
          g.moveTo(cx + Math.cos(a - 0.12) * R * 0.14, cy + Math.sin(a - 0.12) * R * 0.14);
          g.lineTo(cx + Math.cos(a) * R * 0.36, cy + Math.sin(a) * R * 0.36);
          g.lineTo(cx + Math.cos(a + 0.12) * R * 0.14, cy + Math.sin(a + 0.12) * R * 0.14);
          g.closePath();
          g.fill();
        }
        g.beginPath();
        g.arc(cx, cy, R * 0.14, 0, Math.PI * 2);
        g.fill();
      } else if (th.style === "modern") {
        const hub = g.createRadialGradient(cx - R * 0.15, cy - R * 0.15, 2, cx, cy, R * 0.62);
        hub.addColorStop(0, "#f3f1ec");
        hub.addColorStop(1, "#c9c5bc");
        g.fillStyle = hub;
        g.beginPath();
        g.arc(cx, cy, R * 0.62, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "#8e8e93";
        g.lineWidth = Math.max(3, R * 0.03);
        for (let k = 0;k < 4; k++) {
          const a = wheelAng + k * Math.PI / 2;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(a) * R * 0.42, cy + Math.sin(a) * R * 0.42);
          g.stroke();
        }
        g.fillStyle = "#1d1d1f";
        g.beginPath();
        g.arc(cx, cy, R * 0.07, 0, Math.PI * 2);
        g.fill();
      } else {
        g.fillStyle = "#0b131d";
        g.beginPath();
        g.arc(cx, cy, R * 0.62, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(94, 200, 229, .5)";
        g.lineWidth = 1;
        g.beginPath();
        g.arc(cx, cy, R * 0.62, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(cx, cy, R * 0.3, wheelAng, wheelAng + Math.PI * 1.4);
        g.stroke();
        g.strokeStyle = "rgba(242, 165, 65, .6)";
        g.beginPath();
        g.arc(cx, cy, R * 0.2, -wheelAng * 2, -wheelAng * 2 + Math.PI * 0.8);
        g.stroke();
      }
      const br = R * (0.86 + 0.12 * ballR);
      const bx = cx + Math.cos(ballAng - Math.PI / 2) * br, by = cy + Math.sin(ballAng - Math.PI / 2) * br, bs = Math.max(4, R * 0.04);
      if (th.style === "scifi") {
        g.fillStyle = th.accent;
        glow(g, th, th.accent, 8);
        g.beginPath();
        g.arc(bx, by, bs * 0.8, 0, Math.PI * 2);
        g.fill();
        g.shadowBlur = 0;
      } else {
        lift(g, th, 1);
        const bg2 = g.createRadialGradient(bx - bs * 0.3, by - bs * 0.3, 1, bx, by, bs);
        bg2.addColorStop(0, "#ffffff");
        bg2.addColorStop(1, th.style === "medieval" ? "#cfc6b0" : "#c8c8cc");
        g.fillStyle = bg2;
        g.beginPath();
        g.arc(bx, by, bs, 0, Math.PI * 2);
        g.fill();
        unlift(g);
      }
    };
    const pickResult = () => {
      const fair = () => ORDER[Math.floor(kit.rng() * ORDER.length)];
      if (Math.abs(lean) < 0.01)
        return fair();
      const netOf = (n) => [...bets].reduce((t, [k, v]) => t + v * betWins(k, n), 0);
      const want = lean > 0 ? ORDER.filter((n) => netOf(n) > 0) : ORDER.filter((n) => netOf(n) < 0);
      if (want.length && kit.rng() < Math.abs(lean))
        return want[Math.floor(kit.rng() * want.length)];
      return fair();
    };
    const doSpin = () => {
      if (spinning || over || !staked())
        return;
      spinning = true;
      lastBets = new Map(bets);
      const result = pickResult();
      const T = 4.2;
      anim = { t: 0, T, from: wheelAng, to: wheelAng + 0.35 * T * 0.5 + Math.PI * 2, result };
      kit.synth.fx("spin");
      paint2();
    };
    const land = (n) => {
      history.push(n);
      let won = 0;
      const before = chips + staked();
      for (const [k, v] of bets) {
        const m = betWins(k, n);
        if (m > 0)
          won += v * (m + 1);
      }
      const stakedNow = staked();
      chips += won;
      bets = new Map;
      board.querySelectorAll(".win").forEach((x) => x.classList.remove("win"));
      board.querySelector(`[data-bet="n:${n}"]`)?.classList.add("win");
      const net = won - stakedNow;
      if (won > 0) {
        kit.synth.fx(net >= stakedNow * 5 ? "jackpot" : "coins");
        kit.banner(`${n} ${colorOf(n)} · +${net}`, net > 0 ? "good" : "info");
        if (net > bigWin)
          bigWin = net;
      } else {
        kit.synth.fx("miss");
        kit.banner(`${n} ${colorOf(n)}`, "bad");
      }
      undo = net < 0 ? { chips: before, bets: new Map(lastBets) } : null;
      spin++;
      spinning = false;
      kit.track(clamp(chips / (start * 2)));
      paint2();
      if (spin >= spins || chips < denoms[0])
        setTimeout(() => {
          if (!undo || kit.lives.left() <= 0)
            finish();
        }, 1600);
    };
    const luckySpin = () => {
      if (!undo || spinning)
        return;
      if (!kit.lives.spend("Lucky charm!"))
        return;
      rescued++;
      chips = undo.chips - [...undo.bets.values()].reduce((a, b) => a + b, 0);
      bets = new Map(undo.bets);
      spin--;
      undo = null;
      paint2();
      doSpin();
    };
    const finish = () => {
      if (over)
        return;
      over = true;
      chips += staked();
      bets = new Map;
      const beats = [chips > start * 1.3 ? "the wheel was kind" : chips < start * 0.7 ? "the wheel was cruel" : "the wheel giveth and taketh"];
      if (bigWin >= start * 0.5)
        beats.push("one spin that made the table gasp");
      if (rescued)
        beats.push("a second spin saved them");
      kit.finish({ chips, score: clamp(chips / (start * 2)), beats, detail: `${history.length} spins: ${history.join(", ")}` });
    };
    root.addEventListener("click", (e) => {
      if (kit.paused)
        return;
      const t = e.target;
      const b = t.closest("[data-bet]");
      if (b) {
        place(b.dataset.bet);
        return;
      }
      const ch = t.closest("[data-chip]");
      if (ch) {
        chip = Number(ch.dataset.chip);
        kit.synth.fx("chip");
        paint2();
        return;
      }
      if (t.closest("[data-spin]"))
        doSpin();
      else if (t.closest("[data-clear]")) {
        for (const v of bets.values())
          chips += v;
        bets = new Map;
        paint2();
      } else if (t.closest("[data-rebet]")) {
        const need = [...lastBets.values()].reduce((a, b2) => a + b2, 0);
        if (need <= chips) {
          bets = new Map(lastBets);
          chips -= need;
          kit.synth.fx("chip");
          paint2();
        }
      } else if (t.closest("[data-leave]"))
        finish();
      else if (t.closest("[data-luck]"))
        luckySpin();
    });
    board.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const b = e.target.closest("[data-bet]");
      if (b)
        place(b.dataset.bet, -1);
    });
    kit.onKey((e, down) => {
      if (down && (e.key === " " || e.key === "Enter")) {
        doSpin();
        return true;
      }
      return false;
    });
    withMusic(kit, () => backing(kit.synth, "lounge"));
    kit.onQuit(() => finish());
    let tick = 0;
    kit.loop((dt) => {
      if (anim) {
        anim.t += dt;
        const k = clamp(anim.t / anim.T);
        wheelAng = anim.from + (anim.to - anim.from) * easeOut(k);
        const step = Math.PI * 2 / ORDER.length;
        const pocket = wheelAng + ORDER.indexOf(anim.result) * step;
        const laps = 5;
        ballAng = pocket + laps * Math.PI * 2 * (1 - easeOut(Math.min(1, k * 1.05)));
        ballR = k < 0.65 ? 1 : k < 0.9 ? 1 - (k - 0.65) / 0.25 * 0.85 + Math.abs(Math.sin(k * 60)) * 0.08 * (0.9 - k) : 0.15;
        tick += dt;
        if (k > 0.5 && k < 0.92 && tick > 0.06 + k * 0.1) {
          tick = 0;
          kit.synth.fx("ball");
        }
        if (k >= 1) {
          const r = anim.result;
          anim = null;
          land(r);
        }
      } else {
        wheelAng += dt * 0.25;
        if (!history.length)
          ballAng = wheelAng;
        else
          ballAng = wheelAng + ORDER.indexOf(history[history.length - 1]) * (Math.PI * 2 / ORDER.length);
      }
      drawWheel();
    });
    paint2();
    return () => {
      ro.disconnect();
      ro2.disconnect();
      root.remove();
    };
  }
};

// src/frontend/arcade/games/slots.ts
var STRIP_WEIGHTS = [["cherry", 5], ["lemon", 5], ["bell", 4], ["star", 3], ["bar", 2], ["diamond", 2], ["seven", 1]];
var PAYS = { seven: 50, diamond: 25, bar: 15, star: 10, bell: 8, lemon: 5, cherry: 4 };
var NAMES2 = {
  modern: { seven: "sevens", diamond: "diamonds", bar: "bars", star: "stars", bell: "bells", lemon: "lemons", cherry: "cherries" },
  medieval: { seven: "crowns", diamond: "rubies", bar: "shields", star: "stars", bell: "goblets", lemon: "pears", cherry: "cherries" },
  scifi: { seven: "cores", diamond: "crystals", bar: "chips", star: "stars", bell: "planets", lemon: "moons", cherry: "orbs" }
};
var TITLE = { modern: "Lucky Sevens", medieval: "Fortuna", scifi: "JACKPOT//CORE" };
function linePays(line) {
  if (line[0] === line[1] && line[1] === line[2])
    return PAYS[line[0]];
  const ch = line.filter((s) => s === "cherry").length;
  return ch === 2 ? 2 : ch === 1 ? 1 : 0;
}
var CSS5 = `
.sl { position: absolute; inset: 0; display: grid; place-items: center; padding: 14px; background: var(--sl-room); }
.sl-cab { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: center; width: min(760px, 100%); }
.sl-box { position: relative; padding: 18px 18px 16px; border-radius: var(--sl-r, 22px); background: var(--sl-cab); box-shadow: var(--sl-cab-shadow); }
.sl-title { text-align: center; font: var(--sl-title-font); letter-spacing: var(--sl-title-ls, .1em); color: var(--sl-title); margin-bottom: 12px; text-transform: uppercase; }
.sl-window { position: relative; border-radius: var(--sl-wr, 12px); overflow: hidden; background: var(--sl-reel); box-shadow: var(--sl-window-shadow); }
.sl-window canvas { display: block; width: 100%; height: calc(var(--sw) * .62); }
.sl-window::after { content: ""; position: absolute; inset: 0; background: var(--sl-glass); pointer-events: none; }
.sl-led { display: flex; justify-content: space-between; gap: 10px; margin-top: 12px; }
.sl-led div { flex: 1; padding: 6px 10px; border-radius: var(--sl-pr, 8px); background: var(--sl-plate); font: 600 10.5px var(--ar-ui); letter-spacing: .12em; text-transform: uppercase; color: var(--sl-dim); }
.sl-led b { display: block; font: 700 19px var(--sl-num-font); color: var(--sl-num); letter-spacing: .02em; }
.sl-ctrl { display: flex; gap: 8px; justify-content: center; margin-top: 12px; flex-wrap: wrap; }
.sl .sl-btn { padding: 10px 16px; border-radius: var(--sl-br, 999px); border: 1px solid var(--sl-btn-line); cursor: pointer; font: 700 12.5px var(--sl-font); letter-spacing: .08em; text-transform: uppercase; color: var(--sl-btn-ink); background: var(--sl-btn); transition: transform .1s; }
.sl .sl-btn:active:not(:disabled) { transform: translateY(1px); }
.sl .sl-btn:disabled { opacity: .4; cursor: not-allowed; }
.sl .sl-btn.main { background: var(--sl-main); color: var(--sl-on-main); border-color: transparent; }
.sl .sl-btn.on { box-shadow: 0 0 0 2px var(--sl-title); }
.sl .sl-btn.hold { border-color: var(--sl-hold); color: var(--sl-hold); }
.sl .sl-lever { position: relative; width: 46px; height: 220px; cursor: pointer; touch-action: none; }
.sl .sl-lever .rod { position: absolute; left: 19px; top: 30px; width: 8px; height: 160px; border-radius: 4px; background: var(--sl-rod); transform-origin: 50% 100%; transition: transform .25s cubic-bezier(.3,1.6,.5,1); }
.sl .sl-lever .knob { position: absolute; left: 3px; top: 0; width: 40px; height: 40px; border-radius: 50%; background: var(--sl-knob); box-shadow: 0 4px 10px rgba(0,0,0,.35); transition: transform .25s cubic-bezier(.3,1.6,.5,1); }
.sl .sl-lever.pull .rod { transform: scaleY(-.3); } .sl-lever.pull .knob { transform: translateY(150px); }
.sl .sl-lever .base { position: absolute; left: 6px; bottom: 0; width: 34px; height: 36px; border-radius: 8px; background: var(--sl-base); }
.sl-pay { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 4px 12px; justify-content: center; font: 500 11.5px var(--ar-ui); color: var(--sl-dim); }
@media (max-width: 600px) { .sl-cab { grid-template-columns: minmax(0, 1fr); } .sl-lever { display: none; } }

/* modern: a cream fruit machine, coral trim, crisp reels */
.sl[data-style=modern] { --sl-room: #ece9e2; --sl-cab: #fbfaf7; --sl-cab-shadow: 0 0 0 1px rgba(29,29,31,.08), 0 24px 60px rgba(0,0,0,.12); --sl-title-font: 800 24px/1 var(--ar-display); --sl-title: #ff5a36; --sl-title-ls: .04em;
  --sl-reel: #ffffff; --sl-window-shadow: inset 0 0 0 1px rgba(29,29,31,.12), inset 0 10px 18px rgba(0,0,0,.06); --sl-glass: linear-gradient(180deg, rgba(0,0,0,.06), transparent 25%, transparent 75%, rgba(0,0,0,.06));
  --sl-plate: #f1efe9; --sl-dim: #8e8e93; --sl-num-font: var(--ar-display); --sl-num: #1d1d1f; --sl-font: var(--ar-display); --sl-btn: #fff; --sl-btn-ink: #1d1d1f; --sl-btn-line: rgba(29,29,31,.15);
  --sl-main: #1d1d1f; --sl-on-main: #fff; --sl-hold: #1f9d55; --sl-rod: linear-gradient(90deg, #e2e2e6, #a8a8ae); --sl-knob: radial-gradient(circle at 35% 35%, #ff8d73, #ff5a36 60%, #c23a1d); --sl-base: #1d1d1f; }
/* medieval: an oak chest bound in brass, parchment reels, a ruby knob */
.sl[data-style=medieval] { --sl-room: var(--ar-wood) 0 0 / 256px; --sl-r: 4px; --sl-wr: 2px; --sl-pr: 2px; --sl-br: 2px;
  --sl-cab: linear-gradient(rgba(20,10,2,.25), rgba(20,10,2,.25)), var(--ar-wood) 0 0 / 256px; --sl-cab-shadow: 0 0 0 3px #b48a2c, 0 0 0 8px #2a1a0d, 0 0 0 9px rgba(180,138,44,.6), 0 30px 60px rgba(0,0,0,.6);
  --sl-title-font: 700 28px/1 var(--ar-display); --sl-title: #e9c46a; --sl-title-ls: .22em;
  --sl-reel: var(--ar-parch) 0 0 / 512px; --sl-window-shadow: 0 0 0 2px #b48a2c, inset 0 0 30px rgba(110,70,25,.45); --sl-glass: linear-gradient(180deg, rgba(60,30,5,.35), transparent 25%, transparent 75%, rgba(60,30,5,.35));
  --sl-plate: rgba(20,10,2,.55); --sl-dim: rgba(236,223,191,.7); --sl-num-font: var(--ar-display); --sl-num: #ecdfbf; --sl-font: var(--ar-display); --sl-btn: rgba(20,10,2,.5); --sl-btn-ink: #ecdfbf; --sl-btn-line: rgba(214,181,106,.5);
  --sl-main: #9e2b1f; --sl-on-main: #f3e7c8; --sl-hold: #a8d08d; --sl-rod: linear-gradient(90deg, #6b4426, #3b2414); --sl-knob: radial-gradient(circle at 35% 35%, #e0605a, #9e2b1f 60%, #5e110c); --sl-base: #2a1a0d; }
.sl[data-style=medieval] .sl-pay { font-family: var(--ar-ui); font-style: italic; font-size: 13px; }
/* sci-fi: a console, glass reels, a slider for a lever */
.sl[data-style=scifi] { --sl-room: transparent; --sl-r: 0; --sl-wr: 0; --sl-pr: 0; --sl-br: 0;
  --sl-cab: rgba(10, 17, 27, .94); --sl-cab-shadow: inset 0 0 0 1px rgba(94,200,229,.35); --sl-title-font: 600 20px/1 var(--ar-display); --sl-title: #5ec8e5; --sl-title-ls: .18em;
  --sl-reel: #07101a; --sl-window-shadow: inset 0 0 0 1px rgba(94,200,229,.35); --sl-glass: linear-gradient(180deg, rgba(5,8,13,.7), transparent 28%, transparent 72%, rgba(5,8,13,.7));
  --sl-plate: #0d1825; --sl-dim: #61768c; --sl-num-font: var(--ar-num); --sl-num: #5ec8e5; --sl-font: var(--ar-display); --sl-btn: transparent; --sl-btn-ink: #d6e2ee; --sl-btn-line: rgba(94,200,229,.35);
  --sl-main: rgba(94,200,229,.16); --sl-on-main: #5ec8e5; --sl-hold: #5fd3a0; --sl-rod: rgba(94,200,229,.4); --sl-knob: #0d1825; --sl-base: #0d1825; }
.sl[data-style=scifi] .sl-box { clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); }
.sl[data-style=scifi] .sl-lever .knob { border-radius: 0; box-shadow: inset 0 0 0 1px #5ec8e5; }
.sl[data-style=scifi] .sl-btn.main { border-color: #5ec8e5; }
.sl[data-style=scifi] .sl-pay { font-family: var(--ar-num); font-size: 10.5px; }
`;
var SLOTS = {
  id: "slots",
  title: "Slots",
  howTo: [
    "Pick a bet and pull the lever. The reels spin until you stop them — left to right.",
    "Line three of a kind on the middle line. Cherries pay even alone.",
    "On easy checks the reels crawl; on hard ones they blur, and slip a little after you stop them."
  ],
  controls: "Space / lever pulls · Space or 1 2 3 stops reels · H holds a reel",
  start(kit) {
    const L = kit.play.level;
    const gamble = kit.play.mode === "gamble";
    const start = gamble ? kit.play.stake : 100;
    const pulls = gamble ? kit.play.rounds ?? 6 : 6;
    const unit = Math.max(1, Math.round(start / 20));
    const bets = [unit, unit * 2, unit * 4];
    const speed = (5 + L * 17) * (1 - kit.aid("slow") / 100);
    const slipMax = Math.round(L * 2.2);
    let holds = kit.aid("hold");
    let bet = bets[1], chips = start, pull = 0, over = false;
    const strips = [0, 1, 2].map(() => {
      const base = STRIP_WEIGHTS.flatMap(([s, n]) => Array(n).fill(s));
      const out = [];
      const pool = [...base];
      while (pool.length) {
        const i = Math.floor(kit.rng() * pool.length);
        out.push(pool.splice(i, 1)[0]);
      }
      return out;
    });
    const N = strips[0].length;
    const reels = [0, 1, 2].map(() => ({ pos: kit.rng() * N, v: 0, state: "idle", target: 0, held: false }));
    let wins = 0, best = 0, bestLine = "";
    const root = document.createElement("div");
    root.className = "sl";
    const th = kit.theme;
    root.dataset.style = th.style;
    const NAME = NAMES2[th.style];
    root.innerHTML = `<style>${CSS5}</style>
      <div class="sl-cab">
        <div class="sl-box">
          <div class="sl-title">${TITLE[th.style]}</div>
          <div class="sl-window"><canvas></canvas></div>
          <div class="sl-led"><div>Credits<b data-cr>0</b></div><div>Bet<b data-bet>0</b></div><div>Win<b data-win>0</b></div></div>
          <div class="sl-ctrl" data-ctrl></div>
          <div class="sl-pay">${["seven", "diamond", "bar", "star", "bell", "lemon", "cherry"].map((k) => `3 ${NAME[k]} ×${PAYS[k]}`).join(" · ")} · 2 ${NAME.cherry} ×2 · 1 ×1</div>
        </div>
        <div class="sl-lever" data-lever><div class="rod"></div><div class="knob"></div><div class="base"></div></div>
      </div>`;
    kit.root.appendChild(root);
    const $ = (s) => root.querySelector(s);
    const cv = root.querySelector("canvas");
    const g = cv.getContext("2d");
    const fit = () => {
      const box = root.getBoundingClientRect();
      const sw = Math.min(box.width - 120, (box.height - 260) / 0.62, 640);
      $(".sl-window").style.setProperty("--sw", `${Math.max(240, sw)}px`);
      $(".sl-box").style.width = `${Math.max(280, sw + 36)}px`;
      const r = cv.getBoundingClientRect();
      const d = Math.min(2, devicePixelRatio || 1);
      cv.width = r.width * d;
      cv.height = r.height * d;
      g.setTransform(d, 0, 0, d, 0, 0);
    };
    const ro = new ResizeObserver(fit);
    ro.observe(root);
    fit();
    const spinning = () => reels.some((r) => r.state !== "idle");
    const ctrl = () => {
      const busy = spinning();
      $("[data-ctrl]").innerHTML = busy ? reels.map((r, i) => `<button class="sl-btn alt" data-stop="${i}" ${r.state === "spin" ? "" : "disabled"}>Stop ${i + 1}</button>`).join("") : `${bets.map((b) => `<button class="sl-btn alt${b === bet ? " on" : ""}" data-b="${b}" ${b > chips ? "disabled" : ""}>Bet ${b}</button>`).join("")}
           <button class="sl-btn main" data-pull ${bet > chips || over || pull >= pulls ? "disabled" : ""}>Pull</button>
           ${holds > 0 && pull > 0 ? reels.map((r, i) => `<button class="sl-btn hold${r.held ? " on" : ""}" data-hold="${i}">${r.held ? "Held" : "Hold"} ${i + 1}</button>`).join("") : ""}
           ${gamble && pull > 0 || pull >= pulls ? `<button class="sl-btn alt" data-leave>${pull >= pulls ? "Done" : "Cash out"}</button>` : ""}`;
      $("[data-cr]").textContent = String(Math.round(chips));
      $("[data-bet]").textContent = String(bet);
      kit.chips(chips);
      kit.status(`Pull ${Math.min(pull + 1, pulls)} of ${pulls}
${holds ? `${holds} hold${holds > 1 ? "s" : ""}` : ""}`);
    };
    const doPull = () => {
      if (over || spinning() || bet > chips || pull >= pulls)
        return;
      chips -= bet;
      $("[data-win]").textContent = "0";
      const lever = $("[data-lever]");
      lever.classList.add("pull");
      setTimeout(() => lever.classList.remove("pull"), 350);
      kit.synth.fx("launch");
      reels.forEach((r, i) => {
        if (r.held) {
          r.held = false;
          holds--;
          return;
        }
        setTimeout(() => {
          r.state = "spin";
          r.v = speed * (1 + i * 0.07);
          ctrl();
        }, i * 140);
      });
      ctrl();
      const p = pull;
      setTimeout(() => {
        if (pull === p)
          reels.forEach((_, i) => stop(i));
      }, 7000);
    };
    const stop = (i) => {
      const r = reels[i];
      if (r.state !== "spin")
        return;
      const slip = slipMax ? Math.floor(kit.rng() * (slipMax + 1)) : 0;
      r.target = Math.ceil(r.pos) + 1 + slip;
      r.state = "stopping";
      kit.synth.fx("stop");
      ctrl();
    };
    const nextToStop = () => reels.findIndex((r) => r.state === "spin");
    const settle = () => {
      const line = reels.map((r) => strips[reels.indexOf(r)][(Math.round(r.pos) % N + N) % N]);
      const m = linePays(line);
      const won = bet * m;
      chips += won;
      pull++;
      $("[data-win]").textContent = String(won);
      if (m >= 4) {
        wins++;
        kit.synth.fx(m >= 15 ? "jackpot" : "coins");
        kit.banner(`${NAME[line[0]]}! +${won}`, m >= 15 ? "gold" : "good");
        if (won > best) {
          best = won;
          bestLine = `three ${NAME[line[0]]}`;
        }
        kit.shake(m >= 25 ? 1 : 0.4);
      } else if (m > 0) {
        kit.synth.fx("chip");
        wins++;
      } else
        kit.synth.fx("click");
      kit.track(clamp(chips / (start * 2)));
      ctrl();
      if (pull >= pulls || chips < bets[0])
        setTimeout(finish, 1400);
    };
    const finish = () => {
      if (over)
        return;
      over = true;
      const beats = [chips > start * 1.3 ? "the machine paid out" : chips < start * 0.7 ? "the machine ate their money" : "a few small wins, a few losses"];
      if (bestLine)
        beats.push(`lined up ${bestLine}`);
      kit.finish({ chips, score: clamp(chips / (start * 2)), beats, detail: `${pull} pulls, ${wins} paid` });
    };
    root.addEventListener("click", (e) => {
      if (kit.paused)
        return;
      const t = e.target;
      const b = t.closest("[data-b]");
      if (b) {
        bet = Number(b.dataset.b);
        kit.synth.fx("chip");
        ctrl();
        return;
      }
      const st = t.closest("[data-stop]");
      if (st) {
        stop(Number(st.dataset.stop));
        return;
      }
      const h = t.closest("[data-hold]");
      if (h) {
        const r = reels[Number(h.dataset.hold)];
        const heldNow = reels.filter((x) => x.held).length;
        if (r.held || heldNow < holds) {
          r.held = !r.held;
          kit.synth.fx("click");
          ctrl();
        }
        return;
      }
      if (t.closest("[data-pull]") || t.closest("[data-lever]")) {
        if (spinning()) {
          const i = nextToStop();
          if (i >= 0)
            stop(i);
        } else
          doPull();
        return;
      }
      if (t.closest("[data-leave]"))
        finish();
    });
    cv.addEventListener("pointerdown", (e) => {
      if (kit.paused || !spinning())
        return;
      const r = cv.getBoundingClientRect();
      stop(Math.min(2, Math.floor((e.clientX - r.left) / r.width * 3)));
    });
    kit.onKey((e, down) => {
      if (!down || e.repeat)
        return false;
      const k = e.key.toLowerCase();
      if (k === " " || k === "enter") {
        if (spinning()) {
          const i = nextToStop();
          if (i >= 0)
            stop(i);
        } else
          doPull();
        return true;
      }
      if (/^[1-3]$/.test(k)) {
        stop(Number(k) - 1);
        return true;
      }
      if (k === "h") {
        const r = reels.find((x) => !x.held);
        if (r && holds > reels.filter((x) => x.held).length && !spinning() && pull > 0) {
          r.held = true;
          ctrl();
        }
        return true;
      }
      return false;
    });
    withMusic(kit, () => backing(kit.synth, "lounge"));
    kit.onQuit(() => finish());
    let tickAcc = 0;
    kit.loop((dt) => {
      let anyMoving = false;
      for (const r of reels) {
        if (r.state === "spin") {
          r.pos += r.v * dt;
          anyMoving = true;
        } else if (r.state === "stopping") {
          anyMoving = true;
          const left = r.target - r.pos;
          const v = Math.max(1.2, Math.min(r.v, left * 7));
          r.pos = Math.min(r.target, r.pos + v * dt);
          if (r.pos >= r.target - 0.001) {
            r.pos = r.target;
            r.state = "idle";
            kit.synth.fx("reel");
            if (!spinning())
              settle();
          }
        }
      }
      if (anyMoving) {
        tickAcc += dt * speed;
        if (tickAcc > 1) {
          tickAcc = 0;
          kit.synth.fx("reel");
        }
      }
      draw();
    });
    const sym = (k, x, y, z) => {
      g.save();
      g.translate(x, y);
      if (th.style === "medieval")
        medievalSym(k, z);
      else if (th.style === "scifi")
        scifiSym(k, z);
      else
        modernSym(k, z);
      g.restore();
    };
    const star = (r1, r2) => {
      g.beginPath();
      for (let i = 0;i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r2 : r1;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
    };
    function modernSym(k, z) {
      switch (k) {
        case "seven":
          g.font = `800 ${z * 0.78}px ${th.fontDisplay}`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillStyle = "#ff5a36";
          g.fillText("7", 0, z * 0.04);
          break;
        case "bar":
          g.fillStyle = "#1d1d1f";
          rrect(g, -z * 0.36, -z * 0.16, z * 0.72, z * 0.32, z * 0.08);
          g.fill();
          g.fillStyle = "#fff";
          g.font = `800 ${z * 0.2}px ${th.fontDisplay}`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText("BAR", 0, z * 0.01);
          break;
        case "diamond":
          g.fillStyle = "#2f6fe4";
          g.beginPath();
          g.moveTo(0, -z * 0.34);
          g.lineTo(z * 0.28, -z * 0.06);
          g.lineTo(0, z * 0.34);
          g.lineTo(-z * 0.28, -z * 0.06);
          g.closePath();
          g.fill();
          g.fillStyle = "rgba(255,255,255,.35)";
          g.beginPath();
          g.moveTo(0, -z * 0.34);
          g.lineTo(z * 0.1, -z * 0.06);
          g.lineTo(-z * 0.1, -z * 0.06);
          g.closePath();
          g.fill();
          break;
        case "star":
          g.fillStyle = "#ffb020";
          star(z * 0.34, z * 0.15);
          g.fill();
          break;
        case "bell":
          g.fillStyle = "#ffb020";
          g.beginPath();
          g.moveTo(-z * 0.28, z * 0.18);
          g.quadraticCurveTo(-z * 0.24, -z * 0.3, 0, -z * 0.3);
          g.quadraticCurveTo(z * 0.24, -z * 0.3, z * 0.28, z * 0.18);
          g.closePath();
          g.fill();
          g.fillStyle = "#1d1d1f";
          g.beginPath();
          g.arc(0, z * 0.24, z * 0.06, 0, Math.PI * 2);
          g.fill();
          break;
        case "lemon":
          g.fillStyle = "#f2d027";
          g.beginPath();
          g.ellipse(0, 0, z * 0.3, z * 0.22, -0.3, 0, Math.PI * 2);
          g.fill();
          break;
        case "cherry":
          cherries(z, "#e0452b", "#22a06b");
          break;
      }
    }
    function cherries(z, fruit, stem) {
      g.strokeStyle = stem;
      g.lineWidth = z * 0.05;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(-z * 0.14, z * 0.06);
      g.quadraticCurveTo(0, -z * 0.3, z * 0.12, -z * 0.34);
      g.moveTo(z * 0.16, z * 0.1);
      g.quadraticCurveTo(z * 0.12, -z * 0.15, z * 0.12, -z * 0.34);
      g.stroke();
      for (const [cx, cy] of [[-z * 0.15, z * 0.15], [z * 0.16, z * 0.19]]) {
        g.fillStyle = fruit;
        g.beginPath();
        g.arc(cx, cy, z * 0.15, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(255,255,255,.4)";
        g.beginPath();
        g.arc(cx - z * 0.05, cy - z * 0.05, z * 0.035, 0, Math.PI * 2);
        g.fill();
      }
    }
    function medievalSym(k, z) {
      const gold = "#c9952f", ink = "#2c1f12";
      g.lineJoin = "round";
      switch (k) {
        case "seven": {
          g.fillStyle = gold;
          g.beginPath();
          g.moveTo(-z * 0.32, z * 0.2);
          g.lineTo(-z * 0.34, -z * 0.18);
          g.lineTo(-z * 0.16, 0);
          g.lineTo(0, -z * 0.3);
          g.lineTo(z * 0.16, 0);
          g.lineTo(z * 0.34, -z * 0.18);
          g.lineTo(z * 0.32, z * 0.2);
          g.closePath();
          g.fill();
          g.strokeStyle = "#6b4a12";
          g.lineWidth = 1.5;
          g.stroke();
          g.fillStyle = "#9e2b1f";
          g.beginPath();
          g.arc(0, z * 0.08, z * 0.06, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#2c4a7a";
          for (const dx of [-0.2, 0.2]) {
            g.beginPath();
            g.arc(dx * z, z * 0.1, z * 0.04, 0, Math.PI * 2);
            g.fill();
          }
          break;
        }
        case "diamond": {
          g.fillStyle = "#9e2b1f";
          g.beginPath();
          for (let i = 0;i < 8; i++) {
            const a = i * Math.PI / 4 + Math.PI / 8;
            g.lineTo(Math.cos(a) * z * 0.3, Math.sin(a) * z * 0.3);
          }
          g.closePath();
          g.fill();
          g.strokeStyle = "#5e110c";
          g.lineWidth = 1.5;
          g.stroke();
          g.fillStyle = "rgba(255, 220, 200, .35)";
          g.beginPath();
          for (let i = 0;i < 8; i++) {
            const a = i * Math.PI / 4 + Math.PI / 8;
            g.lineTo(Math.cos(a) * z * 0.15, Math.sin(a) * z * 0.15);
          }
          g.closePath();
          g.fill();
          break;
        }
        case "bar": {
          const shield = () => {
            g.beginPath();
            g.moveTo(-z * 0.26, -z * 0.3);
            g.lineTo(z * 0.26, -z * 0.3);
            g.lineTo(z * 0.26, 0);
            g.quadraticCurveTo(z * 0.2, z * 0.26, 0, z * 0.34);
            g.quadraticCurveTo(-z * 0.2, z * 0.26, -z * 0.26, 0);
            g.closePath();
          };
          g.save();
          shield();
          g.clip();
          g.fillStyle = "#2c4a7a";
          g.fillRect(-z * 0.3, -z * 0.4, z * 0.3, z * 0.8);
          g.fillStyle = "#9e2b1f";
          g.fillRect(0, -z * 0.4, z * 0.3, z * 0.8);
          g.restore();
          shield();
          g.strokeStyle = gold;
          g.lineWidth = z * 0.04;
          g.stroke();
          break;
        }
        case "star":
          g.fillStyle = gold;
          star(z * 0.32, z * 0.13);
          g.fill();
          g.strokeStyle = "#6b4a12";
          g.lineWidth = 1.5;
          g.stroke();
          break;
        case "bell": {
          g.fillStyle = gold;
          g.beginPath();
          g.moveTo(-z * 0.22, -z * 0.3);
          g.lineTo(z * 0.22, -z * 0.3);
          g.quadraticCurveTo(z * 0.22, z * 0.02, 0, z * 0.06);
          g.quadraticCurveTo(-z * 0.22, z * 0.02, -z * 0.22, -z * 0.3);
          g.fill();
          g.fillRect(-z * 0.03, z * 0.04, z * 0.06, z * 0.18);
          g.beginPath();
          g.ellipse(0, z * 0.25, z * 0.14, z * 0.05, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#6b1a12";
          g.beginPath();
          g.ellipse(0, -z * 0.28, z * 0.2, z * 0.04, 0, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case "lemon": {
          g.fillStyle = "#a8a83a";
          g.beginPath();
          g.arc(0, z * 0.1, z * 0.2, 0, Math.PI * 2);
          g.arc(0, -z * 0.1, z * 0.12, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = "#4a2e16";
          g.lineWidth = z * 0.04;
          g.beginPath();
          g.moveTo(0, -z * 0.2);
          g.lineTo(z * 0.04, -z * 0.32);
          g.stroke();
          g.fillStyle = "#3e6b3a";
          g.beginPath();
          g.ellipse(z * 0.11, -z * 0.28, z * 0.09, z * 0.04, -0.4, 0, Math.PI * 2);
          g.fill();
          break;
        }
        case "cherry":
          cherries(z, "#8c2a1f", "#3e6b3a");
          break;
      }
    }
    function scifiSym(k, z) {
      const { accent: ac, accent2: am } = th;
      g.lineWidth = 1.8;
      g.lineJoin = "round";
      switch (k) {
        case "seven": {
          glow(g, th, am, 10);
          g.strokeStyle = am;
          g.beginPath();
          g.arc(0, 0, z * 0.3, 0, Math.PI * 2);
          g.stroke();
          g.shadowBlur = 0;
          g.fillStyle = am;
          g.beginPath();
          g.arc(0, 0, z * 0.12, 0, Math.PI * 2);
          g.fill();
          for (let i = 0;i < 3; i++) {
            const a = i * Math.PI * 2 / 3;
            g.beginPath();
            g.arc(0, 0, z * 0.22, a, a + 0.9);
            g.stroke();
          }
          break;
        }
        case "diamond":
          g.strokeStyle = ac;
          g.fillStyle = "rgba(94,200,229,.18)";
          g.beginPath();
          g.moveTo(0, -z * 0.34);
          g.lineTo(z * 0.2, 0);
          g.lineTo(0, z * 0.34);
          g.lineTo(-z * 0.2, 0);
          g.closePath();
          g.fill();
          g.stroke();
          g.beginPath();
          g.moveTo(-z * 0.2, 0);
          g.lineTo(z * 0.2, 0);
          g.stroke();
          break;
        case "bar":
          g.strokeStyle = "#8f9cff";
          g.strokeRect(-z * 0.2, -z * 0.2, z * 0.4, z * 0.4);
          for (let i = -1;i <= 1; i++) {
            g.beginPath();
            g.moveTo(-z * 0.3, i * z * 0.1);
            g.lineTo(-z * 0.2, i * z * 0.1);
            g.moveTo(z * 0.2, i * z * 0.1);
            g.lineTo(z * 0.3, i * z * 0.1);
            g.stroke();
          }
          g.fillStyle = "#8f9cff";
          g.fillRect(-z * 0.08, -z * 0.08, z * 0.16, z * 0.16);
          break;
        case "star":
          g.strokeStyle = th.gold;
          star(z * 0.32, z * 0.12);
          g.stroke();
          break;
        case "bell":
          g.strokeStyle = th.good;
          g.beginPath();
          g.arc(0, 0, z * 0.2, 0, Math.PI * 2);
          g.stroke();
          g.beginPath();
          g.ellipse(0, 0, z * 0.36, z * 0.1, -0.3, 0, Math.PI * 2);
          g.stroke();
          break;
        case "lemon":
          g.strokeStyle = "#c792ea";
          g.beginPath();
          g.arc(0, 0, z * 0.24, 0.6, Math.PI * 2 - 0.6);
          g.arc(z * 0.1, 0, z * 0.18, Math.PI * 2 - 0.9, 0.9, true);
          g.closePath();
          g.stroke();
          break;
        case "cherry":
          for (const [cx, cy] of [[-z * 0.12, z * 0.08], [z * 0.12, z * 0.08], [0, -z * 0.14]]) {
            g.strokeStyle = th.bad;
            g.beginPath();
            g.arc(cx, cy, z * 0.11, 0, Math.PI * 2);
            g.stroke();
          }
          break;
      }
    }
    function draw() {
      const r = cv.getBoundingClientRect();
      const { width: W, height: H } = r, cw = W / 3, z = Math.min(cw * 0.8, H / 3 * 0.95);
      g.clearRect(0, 0, W, H);
      for (let i = 0;i < 3; i++) {
        const reel = reels[i];
        const x0 = i * cw;
        if (th.style === "medieval")
          paint(g, "parchment", th, x0 + 2, 0, cw - 4, H);
        else if (th.style === "modern") {
          const bg = g.createLinearGradient(x0, 0, x0 + cw, 0);
          bg.addColorStop(0, "#f1efe9");
          bg.addColorStop(0.5, "#ffffff");
          bg.addColorStop(1, "#f1efe9");
          g.fillStyle = bg;
          g.fillRect(x0 + 2, 0, cw - 4, H);
        } else {
          g.fillStyle = "#07101a";
          g.fillRect(x0 + 2, 0, cw - 4, H);
          g.fillStyle = "rgba(94,200,229,.05)";
          for (let yy = 0;yy < H; yy += 4)
            g.fillRect(x0 + 2, yy, cw - 4, 1);
        }
        const rowH = H / 3;
        const blur = reel.state === "spin" ? clamp(reel.v / 14) : 0;
        const base = Math.floor(reel.pos), frac = reel.pos - base;
        for (let k = -2;k <= 2; k++) {
          const idx = ((base - k) % N + N) % N;
          const y = H / 2 + (k + frac) * rowH;
          if (y < -rowH || y > H + rowH)
            continue;
          g.globalAlpha = 1 - blur * 0.55;
          sym(strips[i][idx], x0 + cw / 2, y, z);
          if (blur > 0.2) {
            g.globalAlpha = blur * 0.25;
            sym(strips[i][idx], x0 + cw / 2, y - rowH * 0.18, z);
          }
          g.globalAlpha = 1;
        }
        if (reel.held) {
          g.fillStyle = th.style === "scifi" ? "rgba(95, 211, 160, .12)" : "rgba(31, 157, 85, .14)";
          g.fillRect(x0 + 2, 0, cw - 4, H);
          g.fillStyle = th.style === "scifi" ? th.good : th.style === "medieval" ? "#3e6b3a" : "#1f9d55";
          g.font = `700 12px ${th.style === "scifi" ? th.fontNum : th.fontDisplay}`;
          g.textAlign = "center";
          g.textBaseline = "top";
          g.fillText("HELD", x0 + cw / 2, 8);
        }
        g.fillStyle = th.style === "medieval" ? "#5a3d1c" : th.style === "modern" ? "rgba(29,29,31,.1)" : "rgba(94,200,229,.3)";
        g.fillRect(x0 + cw - 1, 0, 2, H);
      }
      const line = th.style === "medieval" ? "#9e2b1f" : th.style === "modern" ? "#ff5a36" : th.accent2;
      g.strokeStyle = line;
      g.lineWidth = th.style === "scifi" ? 1 : 2;
      g.globalAlpha = 0.8;
      g.beginPath();
      g.moveTo(0, H / 2);
      g.lineTo(W, H / 2);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = line;
      g.beginPath();
      g.moveTo(0, H / 2 - 8);
      g.lineTo(11, H / 2);
      g.lineTo(0, H / 2 + 8);
      g.fill();
      g.beginPath();
      g.moveTo(W, H / 2 - 8);
      g.lineTo(W - 11, H / 2);
      g.lineTo(W, H / 2 + 8);
      g.fill();
    }
    ctrl();
    return () => {
      ro.disconnect();
      root.remove();
    };
  }
};

// src/frontend/arcade/games/snake.ts
var DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
var KEYMAP = { arrowup: "up", w: "up", arrowdown: "down", s: "down", arrowleft: "left", a: "left", arrowright: "right", d: "right" };
var SNAKE = {
  id: "snake",
  title: "Snake",
  howTo: [
    "Steer the snake to the food. Every bite makes it longer — and a little faster.",
    "Don't hit the walls, the rocks, or your own tail.",
    "Eat enough before the clock runs out."
  ],
  controls: "Arrows or WASD · swipe on touch",
  start(kit) {
    const L = kit.play.level;
    const cols = 24, rows = 15;
    const goal = Math.round(8 + L * 14);
    const limit = Math.round(goal * 4.2 * (1.25 - 0.25 * L) * (1 + kit.aid("time") / 100));
    const wrap = kit.aid("wrap") > 0;
    const baseSpeed = (6.5 + L * 7) * (1 - kit.aid("slow") / 100);
    const rocks = [];
    const nRocks = L > 0.45 ? Math.round((L - 0.45) * 22) : 0;
    let snake = [];
    let dir = DIRS.right, queue = [];
    let food = { x: 0, y: 0 }, eaten = 0, timeLeft = limit, step = 0, over = false, grace = 0, crashes = 0, close = 0;
    const c = kit.canvas();
    const g = c.g;
    const t = kit.theme;
    const sparks = new Sparks, floats = new Floaters(t.fontDisplay, t.light ? "rgba(255,255,255,.75)" : null);
    const foodColor = t.style === "scifi" ? t.accent2 : t.style === "modern" ? "#e7471d" : "#a8281c";
    const key = (v) => `${v.x},${v.y}`;
    const occupied = () => new Set([...snake, ...rocks].map(key));
    const reset = () => {
      const y = Math.floor(rows / 2);
      snake = [{ x: 6, y }, { x: 5, y }, { x: 4, y }, { x: 3, y }];
      dir = DIRS.right;
      queue = [];
    };
    const placeFood = () => {
      const taken = occupied();
      const free = [];
      for (let y = 0;y < rows; y++)
        for (let x = 0;x < cols; x++)
          if (!taken.has(`${x},${y}`))
            free.push({ x, y });
      food = free[Math.floor(kit.rng() * free.length)];
    };
    reset();
    for (let i = 0;i < nRocks; i++) {
      const taken = occupied();
      let r;
      do
        r = { x: 2 + Math.floor(kit.rng() * (cols - 4)), y: 1 + Math.floor(kit.rng() * (rows - 2)) };
      while (taken.has(key(r)) || Math.abs(r.y - rows / 2) < 2);
      rocks.push(r);
    }
    placeFood();
    const speed = () => baseSpeed * (1 + eaten * 0.012);
    const status = () => kit.status(`Eaten ${eaten} / ${goal}
${Math.ceil(timeLeft)}s left`);
    const finish = (how) => {
      if (over)
        return;
      over = true;
      const s = clamp(eaten / goal);
      kit.score(s);
      if (how === "goal") {
        kit.synth.fx("win");
        kit.banner("Full!", "good");
      }
      const beats = how === "goal" ? [timeLeft > limit * 0.35 ? "quick and sure" : "got there in the end"] : how === "crash" ? [s > 0.7 ? "tripped up right near the end" : "a careless mistake"] : ["ran out of time"];
      if (close > 2)
        beats.push("a few near misses");
      if (crashes)
        beats.push("recovered from a fall");
      kit.finish({ score: s, beats, detail: `${eaten} of ${goal}` });
    };
    const crash = () => {
      kit.synth.fx("crash");
      kit.shake(1.2);
      const B = box();
      sparks.burst(B.x + (snake[0].x + 0.5) * B.s, B.y + (snake[0].y + 0.5) * B.s, t.bad, 20, 220, 3);
      if (kit.lives.spend("Back on your feet!")) {
        crashes++;
        reset();
        grace = 1.2;
        return;
      }
      finish("crash");
    };
    const advance = () => {
      if (queue.length) {
        const d = queue.shift();
        if (d.x !== -dir.x || d.y !== -dir.y)
          dir = d;
      }
      let head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (wrap)
        head = { x: (head.x + cols) % cols, y: (head.y + rows) % rows };
      const out = head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows;
      const hitRock = rocks.some((r) => r.x === head.x && r.y === head.y);
      const hitSelf = snake.slice(0, -1).some((p) => p.x === head.x && p.y === head.y);
      if ((out || hitRock || hitSelf) && grace <= 0) {
        crash();
        return;
      }
      if (out)
        head = { x: (head.x + cols) % cols, y: (head.y + rows) % rows };
      snake.unshift(head);
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
        const x = head.x + dx, y = head.y + dy;
        return !wrap && (x < 0 || y < 0 || x >= cols || y >= rows) || snake.slice(3).some((p) => p.x === x && p.y === y);
      }).length;
      if (nb >= 2)
        close++;
      if (head.x === food.x && head.y === food.y) {
        eaten++;
        kit.synth.fx("eat");
        const B = box();
        sparks.burst(B.x + (food.x + 0.5) * B.s, B.y + (food.y + 0.5) * B.s, foodColor, 12, 170, 2.5);
        floats.add(B.x + (food.x + 0.5) * B.s, B.y + food.y * B.s, `+1`, t.style === "scifi" ? t.accent2 : t.ink, 16);
        kit.score(clamp(eaten / goal));
        kit.track(clamp(eaten / goal / Math.max(0.15, 1 - timeLeft / limit)));
        if (eaten >= goal) {
          finish("goal");
          return;
        }
        placeFood();
      } else
        snake.pop();
      status();
    };
    kit.onKey((e, down) => {
      const d = KEYMAP[e.key.toLowerCase()];
      if (!d)
        return false;
      if (down && queue.length < 3) {
        const last = queue[queue.length - 1] ?? dir;
        const nd = DIRS[d];
        if (!(nd.x === last.x && nd.y === last.y) && !(nd.x === -last.x && nd.y === -last.y))
          queue.push(nd);
      }
      return true;
    });
    let sw = null;
    c.el.addEventListener("pointerdown", (e) => {
      sw = { x: e.clientX, y: e.clientY };
    });
    c.el.addEventListener("pointermove", (e) => {
      if (!sw)
        return;
      const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
      if (Math.hypot(dx, dy) < 24)
        return;
      const d = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "right" : "left" : dy > 0 ? "down" : "up";
      const last = queue[queue.length - 1] ?? dir, nd = DIRS[d];
      if (!(nd.x === last.x && nd.y === last.y) && !(nd.x === -last.x && nd.y === -last.y) && queue.length < 3)
        queue.push(nd);
      sw = { x: e.clientX, y: e.clientY };
    });
    c.el.addEventListener("pointerup", () => {
      sw = null;
    });
    withMusic(kit, () => backing(kit.synth, "retro", () => 1 + eaten / goal * 0.25));
    kit.onQuit(() => finish("time"));
    const box = () => {
      const s = Math.floor(Math.min((c.w - 48) / cols, (c.h - 64) / rows));
      return { s, x: Math.round((c.w - s * cols) / 2), y: Math.round((c.h - s * rows) / 2) + 10 };
    };
    kit.loop((dt) => {
      if (!over) {
        timeLeft = Math.max(0, timeLeft - dt);
        grace = Math.max(0, grace - dt);
        if (timeLeft <= 0)
          finish("time");
        step += dt * speed();
        while (step >= 1 && !over) {
          step -= 1;
          advance();
        }
      }
      sparks.step(dt);
      floats.step(dt);
      draw();
    });
    const body = t.style === "medieval" ? ["#3e6b3a", "#2a4a27"] : t.style === "modern" ? ["#4674e9", "#3a64d0"] : [t.accent, "#2f8fae"];
    function field(B) {
      const W = B.s * cols, H = B.s * rows;
      if (t.style === "medieval") {
        lift(g, t, 2);
        g.fillStyle = "#2a1a0d";
        g.fillRect(B.x - 10, B.y - 10, W + 20, H + 20);
        unlift(g);
        paint(g, "parchment", t, B.x - 6, B.y - 6, W + 12, H + 12);
        g.strokeStyle = wrap ? "rgba(44, 31, 18, .3)" : "#5a3d1c";
        g.lineWidth = wrap ? 1 : 2;
        if (wrap)
          g.setLineDash([4, 4]);
        g.strokeRect(B.x - 2, B.y - 2, W + 4, H + 4);
        g.setLineDash([]);
        g.strokeStyle = "rgba(90, 61, 28, .1)";
        g.lineWidth = 1;
        for (let x = 1;x < cols; x++) {
          g.beginPath();
          g.moveTo(B.x + x * B.s + 0.5, B.y);
          g.lineTo(B.x + x * B.s + 0.5, B.y + H);
          g.stroke();
        }
        for (let y = 1;y < rows; y++) {
          g.beginPath();
          g.moveTo(B.x, B.y + y * B.s + 0.5);
          g.lineTo(B.x + W, B.y + y * B.s + 0.5);
          g.stroke();
        }
      } else if (t.style === "modern") {
        g.fillStyle = "#578a34";
        rrect(g, B.x - 10, B.y - 10, W + 20, H + 20, 14);
        g.fill();
        for (let y = 0;y < rows; y++)
          for (let x = 0;x < cols; x++) {
            g.fillStyle = (x + y) % 2 ? "#a2d149" : "#aad751";
            g.fillRect(B.x + x * B.s, B.y + y * B.s, B.s, B.s);
          }
        if (wrap) {
          g.strokeStyle = "rgba(255,255,255,.5)";
          g.setLineDash([6, 6]);
          g.lineWidth = 2;
          g.strokeRect(B.x - 4, B.y - 4, W + 8, H + 8);
          g.setLineDash([]);
        }
      } else {
        g.fillStyle = "rgba(8, 14, 22, .92)";
        g.fillRect(B.x, B.y, W, H);
        g.strokeStyle = "rgba(120, 170, 210, .07)";
        g.lineWidth = 1;
        for (let x = 1;x < cols; x++) {
          g.beginPath();
          g.moveTo(B.x + x * B.s + 0.5, B.y);
          g.lineTo(B.x + x * B.s + 0.5, B.y + H);
          g.stroke();
        }
        for (let y = 1;y < rows; y++) {
          g.beginPath();
          g.moveTo(B.x, B.y + y * B.s + 0.5);
          g.lineTo(B.x + W, B.y + y * B.s + 0.5);
          g.stroke();
        }
        g.strokeStyle = wrap ? "rgba(94, 200, 229, .3)" : "rgba(94, 200, 229, .55)";
        if (wrap)
          g.setLineDash([6, 6]);
        g.strokeRect(B.x - 0.5, B.y - 0.5, W + 1, H + 1);
        g.setLineDash([]);
        brackets(g, B.x - 6, B.y - 6, W + 12, H + 12, t.accent, 16);
      }
    }
    function rock(x, y, s) {
      if (t.style === "medieval") {
        lift(g, t);
        paint(g, "stone", t, x + 2, y + 2, s - 4, s - 4);
        unlift(g);
        g.strokeStyle = "rgba(30, 18, 6, .5)";
        g.lineWidth = 1;
        g.strokeRect(x + 2.5, y + 2.5, s - 5, s - 5);
      } else if (t.style === "modern") {
        g.fillStyle = "#8a8f7a";
        rrect(g, x + 3, y + 3, s - 6, s - 6, s * 0.3);
        g.fill();
        g.fillStyle = "rgba(255,255,255,.25)";
        rrect(g, x + 5, y + 4, s * 0.4, s * 0.2, s * 0.1);
        g.fill();
      } else {
        g.fillStyle = "rgba(239, 100, 97, .15)";
        g.fillRect(x + 2, y + 2, s - 4, s - 4);
        g.strokeStyle = t.bad;
        g.lineWidth = 1;
        g.strokeRect(x + 2.5, y + 2.5, s - 5, s - 5);
        g.save();
        g.beginPath();
        g.rect(x + 2, y + 2, s - 4, s - 4);
        g.clip();
        g.strokeStyle = "rgba(239, 100, 97, .5)";
        for (let k = -s;k < s; k += 5) {
          g.beginPath();
          g.moveTo(x + k, y + s);
          g.lineTo(x + k + s, y);
          g.stroke();
        }
        g.restore();
      }
    }
    function snack(cx, cy, s, pulse) {
      if (t.style === "scifi") {
        glow(g, t, t.accent2, 10);
        g.fillStyle = t.accent2;
        g.beginPath();
        g.moveTo(cx, cy - s * 0.3 * pulse);
        g.lineTo(cx + s * 0.22, cy);
        g.lineTo(cx, cy + s * 0.3 * pulse);
        g.lineTo(cx - s * 0.22, cy);
        g.closePath();
        g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = "rgba(242, 165, 65, .5)";
        g.lineWidth = 1;
        g.beginPath();
        g.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
        g.stroke();
        return;
      }
      lift(g, t, 0.8);
      g.fillStyle = foodColor;
      g.beginPath();
      g.arc(cx - s * 0.08, cy + s * 0.04, s * 0.3, 0, Math.PI * 2);
      g.arc(cx + s * 0.08, cy + s * 0.04, s * 0.3, 0, Math.PI * 2);
      g.fill();
      unlift(g);
      g.fillStyle = "rgba(255,255,255,.35)";
      g.beginPath();
      g.ellipse(cx - s * 0.14, cy - s * 0.06, s * 0.07, s * 0.1, -0.5, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = t.style === "medieval" ? "#4a2e16" : "#5b3a1e";
      g.lineWidth = Math.max(1.5, s * 0.06);
      g.beginPath();
      g.moveTo(cx, cy - s * 0.2);
      g.lineTo(cx + s * 0.04, cy - s * 0.38);
      g.stroke();
      g.fillStyle = t.style === "medieval" ? "#3e6b3a" : "#4caf50";
      g.beginPath();
      g.ellipse(cx + s * 0.15, cy - s * 0.33, s * 0.13, s * 0.06, -0.5, 0, Math.PI * 2);
      g.fill();
    }
    function serpent(B) {
      const cx = (p) => B.x + (p.x + 0.5) * B.s, cy = (p) => B.y + (p.y + 0.5) * B.s;
      g.lineCap = "round";
      g.lineJoin = "round";
      if (t.style === "scifi") {
        for (let i = snake.length - 1;i >= 0; i--) {
          const p = snake[i], k = 1 - i / Math.max(1, snake.length);
          const s2 = B.s * (0.5 + k * 0.22);
          g.fillStyle = `rgba(94, 200, 229, ${0.25 + k * 0.5})`;
          g.fillRect(cx(p) - s2 / 2, cy(p) - s2 / 2, s2, s2);
          g.strokeStyle = t.accent;
          g.lineWidth = 1;
          g.strokeRect(cx(p) - s2 / 2 + 0.5, cy(p) - s2 / 2 + 0.5, s2 - 1, s2 - 1);
        }
      } else {
        for (let i = snake.length - 1;i > 0; i--) {
          const a = snake[i], b = snake[i - 1];
          if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1)
            continue;
          const k = 1 - i / Math.max(1, snake.length);
          g.strokeStyle = i % 2 && t.style === "medieval" ? body[1] : body[0];
          g.lineWidth = B.s * (0.56 + k * 0.2);
          g.beginPath();
          g.moveTo(cx(a), cy(a));
          g.lineTo(cx(b), cy(b));
          g.stroke();
        }
        if (t.style === "medieval") {
          g.strokeStyle = "rgba(20, 30, 15, .45)";
          g.lineWidth = 1;
          for (let i = 1;i < snake.length; i++) {
            const p = snake[i];
            g.beginPath();
            g.arc(cx(p), cy(p) - B.s * 0.06, B.s * 0.16, Math.PI * 0.15, Math.PI * 0.85);
            g.stroke();
          }
          g.strokeStyle = "rgba(220, 210, 150, .35)";
          g.lineWidth = B.s * 0.12;
          g.beginPath();
          snake.forEach((p, i) => i ? g.lineTo(cx(p), cy(p)) : g.moveTo(cx(p), cy(p)));
          g.stroke();
        }
      }
      const h = snake[0];
      const hx = cx(h), hy = cy(h);
      if (t.style === "scifi") {
        g.fillStyle = "#0a111b";
        g.fillRect(hx - B.s * 0.42, hy - B.s * 0.42, B.s * 0.84, B.s * 0.84);
        glow(g, t, t.accent, 8);
        g.strokeStyle = t.accent;
        g.lineWidth = 1.5;
        g.strokeRect(hx - B.s * 0.42, hy - B.s * 0.42, B.s * 0.84, B.s * 0.84);
        g.shadowBlur = 0;
        g.fillStyle = t.accent;
        g.fillRect(hx + dir.x * B.s * 0.18 - (dir.y ? B.s * 0.25 : B.s * 0.06), hy + dir.y * B.s * 0.18 - (dir.x ? B.s * 0.25 : B.s * 0.06), dir.y ? B.s * 0.5 : B.s * 0.12, dir.x ? B.s * 0.5 : B.s * 0.12);
        return;
      }
      g.fillStyle = body[0];
      g.beginPath();
      g.ellipse(hx + dir.x * B.s * 0.08, hy + dir.y * B.s * 0.08, B.s * (dir.x ? 0.52 : 0.44), B.s * (dir.y ? 0.52 : 0.44), 0, 0, Math.PI * 2);
      g.fill();
      if (t.style === "medieval") {
        if (Math.sin(tick * 7) > 0.4) {
          g.strokeStyle = "#a8281c";
          g.lineWidth = 1.5;
          const tx = hx + dir.x * B.s * 0.55, ty = hy + dir.y * B.s * 0.55;
          g.beginPath();
          g.moveTo(tx, ty);
          g.lineTo(tx + dir.x * B.s * 0.25 + dir.y * B.s * 0.1, ty + dir.y * B.s * 0.25 + dir.x * B.s * 0.1);
          g.moveTo(tx, ty);
          g.lineTo(tx + dir.x * B.s * 0.25 - dir.y * B.s * 0.1, ty + dir.y * B.s * 0.25 - dir.x * B.s * 0.1);
          g.stroke();
        }
      }
      for (const sgn of [-1, 1]) {
        const ex = hx + dir.x * B.s * 0.16 + (dir.y !== 0 ? sgn * B.s * 0.2 : 0), ey = hy + dir.y * B.s * 0.16 + (dir.x !== 0 ? sgn * B.s * 0.2 : 0);
        g.fillStyle = t.style === "medieval" ? "#e9c46a" : "#fff";
        g.beginPath();
        g.arc(ex, ey, B.s * 0.12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#1d1d1f";
        if (t.style === "medieval") {
          g.fillRect(ex + dir.x * 1.5 - (dir.y ? 1 : B.s * 0.03), ey + dir.y * 1.5 - (dir.x ? 1 : B.s * 0.03), dir.y ? 2 : B.s * 0.06, dir.x ? 2 : B.s * 0.06);
        } else {
          g.beginPath();
          g.arc(ex + dir.x * 2, ey + dir.y * 2, B.s * 0.06, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
    let tick = 0;
    function draw() {
      tick += 1 / 60;
      const B = box();
      g.clearRect(0, 0, c.w, c.h);
      ground(g, t, c.w, c.h, t.style === "medieval" ? "table" : "page");
      field(B);
      for (const r of rocks)
        rock(B.x + r.x * B.s, B.y + r.y * B.s, B.s);
      snack(B.x + (food.x + 0.5) * B.s, B.y + (food.y + 0.5) * B.s, B.s, 1 + Math.sin(tick * 5) * 0.06);
      const blink = grace > 0 && Math.floor(tick * 10) % 2 === 0;
      if (!blink && snake.length)
        serpent(B);
      sparks.draw(g);
      floats.draw(g);
      g.font = `${t.style === "scifi" ? 500 : 600} 13px ${t.style === "scifi" ? t.fontNum : t.fontUi}`;
      g.fillStyle = t.style === "medieval" ? "#ecdfbf" : t.style === "scifi" ? t.accent : t.inkSoft;
      g.textAlign = "left";
      g.textBaseline = "bottom";
      g.fillText(`${eaten} / ${goal}  ·  ${Math.ceil(timeLeft)}s`, B.x, Math.max(16, B.y - 14));
    }
    status();
    return () => {};
  }
};

// src/frontend/arcade/games/stack.ts
var W = 10;
var H = 20;
var SHAPES = {
  I: [[-1, 0], [0, 0], [1, 0], [2, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[-1, 0], [0, 0], [1, 0], [0, -1]],
  S: [[-1, 0], [0, 0], [0, -1], [1, -1]],
  Z: [[-1, -1], [0, -1], [0, 0], [1, 0]],
  J: [[-1, -1], [-1, 0], [0, 0], [1, 0]],
  L: [[1, -1], [-1, 0], [0, 0], [1, 0]]
};
var ORDER2 = ["Z", "O", "J", "S", "T", "L", "I"];
var KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [0, 1]];
var BASS = "E2/.5 E3 E2 E3 E2 E3 E2 E3 | A2 A3 A2 A3 A2 A3 A2 A3 | E2 E3 E2 E3 E2 E3 E2 E3 | A2 A3 A2 A3 A2 A3 A2 A3 | D2 D3 D2 D3 D2 D3 D2 D3 | C2 C3 C2 C3 C2 C3 C2 C3 | E2 E3 E2 E3 E2 E3 E2 E3 | A2 A3 A2 A3 A2 A3 A2 A3";
var STACK = {
  id: "stack",
  title: "Stack",
  howTo: [
    "Blocks fall one at a time. Move and turn them to fill whole rows — full rows clear.",
    "Clear enough lines before time's up. Four at once counts as five.",
    "If the stack reaches the top, it's over."
  ],
  controls: "← → move · ↑ / X turn · Z turn back · ↓ soft drop · Space drop · C / Shift hold · swipe & tap on touch",
  start(kit) {
    const L = kit.play.level;
    const goal = Math.round(4 + L * 10);
    const limit = Math.round(goal * 13 * (1.25 - 0.25 * L) * (1 + kit.aid("time") / 100));
    const gravity = (1 + L * 4.5) * (1 - kit.aid("slow") / 100);
    const previews = Math.min(5, (L < 0.5 ? 2 : 1) + kit.aid("preview"));
    const canHold = kit.aid("hold") > 0 || L < 0.35;
    const grid = Array.from({ length: H }, () => Array(W).fill(null));
    let bag = [];
    const queue = [];
    const next = () => {
      if (!bag.length)
        bag = shuffle(["I", "O", "T", "S", "Z", "J", "L"], kit.rng);
      return bag.pop();
    };
    while (queue.length < 6)
      queue.push(next());
    let cur = { p: queue.shift(), x: 4, y: 1, r: 0 };
    queue.push(next());
    let hold = null, held = false;
    let lines = 0, credit = 0, timeLeft = limit, fall = 0, lock = 0, lockResets = 0, over = false, clearing = null;
    let tetrises = 0, maxHeight = 0;
    const c = kit.canvas();
    const g = c.g;
    const t = kit.theme;
    const colorOf = (p) => t.pieces[ORDER2.indexOf(p)];
    const sparks = new Sparks, floats = new Floaters(t.fontDisplay, t.light ? "rgba(255,255,255,.75)" : null);
    const cells = (p, r, x, y) => SHAPES[p].map(([cx, cy]) => {
      let a = cx, b = cy;
      if (p !== "O")
        for (let k = 0;k < (r & 3); k++) {
          const t = a;
          a = -b;
          b = t;
          if (p === "I") {}
        }
      return [x + a, y + b];
    });
    const fits = (p, r, x, y) => cells(p, r, x, y).every(([a, b]) => a >= 0 && a < W && b < H && (b < 0 || !grid[b][a]));
    const ghostY = () => {
      let y = cur.y;
      while (fits(cur.p, cur.r, cur.x, y + 1))
        y++;
      return y;
    };
    const resetLock = () => {
      if (lockResets < 15) {
        lock = 0;
        lockResets++;
      }
    };
    const move = (dx) => {
      if (fits(cur.p, cur.r, cur.x + dx, cur.y)) {
        cur.x += dx;
        kit.synth.fx("tick");
        resetLock();
      }
    };
    const rotate = (dir) => {
      const r = (cur.r + dir + 4) % 4;
      for (const [kx, ky] of KICKS)
        if (fits(cur.p, r, cur.x + kx, cur.y + ky)) {
          cur.x += kx;
          cur.y += ky;
          cur.r = r;
          kit.synth.fx("rotate");
          resetLock();
          return;
        }
    };
    const spawn = () => {
      cur = { p: queue.shift(), x: 4, y: 1, r: 0 };
      queue.push(next());
      held = false;
      lock = 0;
      lockResets = 0;
      fall = 0;
      if (!fits(cur.p, cur.r, cur.x, cur.y))
        topOut();
    };
    const doHold = () => {
      if (!canHold || held)
        return;
      const p = cur.p;
      if (hold) {
        cur = { p: hold, x: 4, y: 1, r: 0 };
      } else
        spawn();
      hold = p;
      held = true;
      kit.synth.fx("click");
    };
    const place = () => {
      for (const [a, b] of cells(cur.p, cur.r, cur.x, cur.y))
        if (b >= 0)
          grid[b][a] = cur.p;
      kit.synth.fx("drop");
      const full = grid.map((row, i) => row.every(Boolean) ? i : -1).filter((i) => i >= 0);
      const top = grid.findIndex((row) => row.some(Boolean));
      maxHeight = Math.max(maxHeight, top < 0 ? 0 : H - top);
      if (full.length) {
        clearing = { rows: full, t: 0 };
        const n = full.length === 4 ? 5 : full.length;
        lines += full.length;
        credit += n;
        if (full.length === 4) {
          tetrises++;
          kit.synth.fx("tetris");
          kit.banner("Four lines!", "gold");
          kit.shake(0.8);
        } else
          kit.synth.fx("line");
        const B = board();
        for (const row of full)
          for (let x = 0;x < W; x++)
            sparks.burst(B.x + (x + 0.5) * B.s, B.y + (row + 0.5) * B.s, colorOf(grid[row][x] ?? "I"), 3, 160, 2.5);
        floats.add(B.x + B.w / 2, B.y + (full[0] + 0.5) * B.s, full.length === 4 ? "+5" : `+${full.length}`, t.style === "medieval" ? "#9e2b1f" : t.gold, 26);
        kit.score(clamp(credit / goal));
        kit.track(clamp(credit / goal / Math.max(0.15, 1 - timeLeft / limit)));
        if (credit >= goal)
          setTimeout(() => finish("goal"), 400);
      } else
        spawn();
      status();
    };
    const hardDrop = () => {
      const y = ghostY();
      const d = y - cur.y;
      cur.y = y;
      place();
      if (d > 2)
        kit.shake(0.3);
    };
    const topOut = () => {
      kit.synth.fx("crash");
      kit.shake(1.4);
      if (kit.lives.spend("Cleared the top!")) {
        for (let y = 0;y < H; y++)
          if (y >= H / 2)
            grid[y].fill(null);
        const rows = grid.splice(H / 2);
        grid.unshift(...rows);
        cur = { p: cur.p, x: 4, y: 1, r: 0 };
        return;
      }
      finish("top");
    };
    const status = () => kit.status(`Lines ${Math.min(credit, goal)} / ${goal}
${Math.ceil(timeLeft)}s left`);
    const finish = (how) => {
      if (over)
        return;
      over = true;
      const s = clamp(credit / goal);
      kit.score(s);
      if (how === "goal") {
        kit.synth.fx("win");
        kit.banner("Done!", "good");
      }
      const beats = how === "goal" ? [timeLeft > limit * 0.4 ? "made it look easy" : timeLeft < limit * 0.1 ? "got there with seconds left" : "got it done"] : how === "top" ? ["it all piled up"] : ["ran out of time"];
      if (tetrises)
        beats.push(tetrises > 1 ? "some beautifully neat work" : "one beautifully neat moment");
      if (maxHeight > H * 0.75 && how === "goal")
        beats.push("came close to losing it");
      kit.finish({ score: s, beats, detail: `${lines} lines cleared${tetrises ? `, ${tetrises} four-at-once` : ""}` });
    };
    const held_ = { left: 0, right: 0, down: false };
    let das = 0;
    kit.onKey((e, down) => {
      const k = e.key.toLowerCase();
      if (over || clearing)
        return ["arrowleft", "arrowright", "arrowdown", "arrowup", " "].includes(k);
      if (k === "arrowleft") {
        if (down && !e.repeat) {
          move(-1);
          das = 0;
        }
        held_.left = down ? 1 : 0;
        return true;
      }
      if (k === "arrowright") {
        if (down && !e.repeat) {
          move(1);
          das = 0;
        }
        held_.right = down ? 1 : 0;
        return true;
      }
      if (k === "arrowdown") {
        held_.down = down;
        return true;
      }
      if (!down || e.repeat)
        return ["arrowup", "x", "z", " ", "c", "shift"].includes(k);
      if (k === "arrowup" || k === "x") {
        rotate(1);
        return true;
      }
      if (k === "z") {
        rotate(-1);
        return true;
      }
      if (k === " ") {
        hardDrop();
        return true;
      }
      if (k === "c" || k === "shift") {
        doHold();
        return true;
      }
      return false;
    });
    let drag = null;
    c.el.addEventListener("pointerdown", (e) => {
      c.el.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), cx: cur.x };
    });
    c.el.addEventListener("pointermove", (e) => {
      if (!drag || over || clearing || kit.paused)
        return;
      const B = board();
      const want = drag.cx + Math.round((e.clientX - drag.x) / (B.s * 0.9));
      while (cur.x < want && fits(cur.p, cur.r, cur.x + 1, cur.y)) {
        cur.x++;
        drag.moved++;
      }
      while (cur.x > want && fits(cur.p, cur.r, cur.x - 1, cur.y)) {
        cur.x--;
        drag.moved++;
      }
    });
    c.el.addEventListener("pointerup", (e) => {
      if (!drag || over || clearing || kit.paused) {
        drag = null;
        return;
      }
      const dy = e.clientY - drag.y, dt = performance.now() - drag.t;
      if (dy > 60 && dt < 350)
        hardDrop();
      else if (!drag.moved && Math.abs(dy) < 12 && dt < 300)
        rotate(1);
      else if (dy < -60 && dt < 350)
        doHold();
      drag = null;
    });
    const mel = parseLine(KOROBEINIKI), bass = parseLine(BASS);
    const tuneBeats = 32;
    const speed = () => 1 + clamp(maxHeight / H) * 0.35 + L * 0.15;
    let stopMusic = () => {};
    const startMusic = () => {
      stopMusic();
      stopMusic = kit.synth.loop(() => 150 * speed(), (_, at, beat) => {
        for (const n of mel)
          kit.synth.note(n.midi[0], at + n.b * beat, n.d * beat * 0.9, "pluck", 0.4);
        for (const n of bass)
          kit.synth.note(n.midi[0], at + n.b * beat, n.d * beat * 0.8, "bass", 0.38);
        for (let k = 0;k < tuneBeats; k++) {
          kit.synth.drum(k % 2 ? "snare" : "kick", at + k * beat, 0.3);
          kit.synth.drum("hat", at + (k + 0.5) * beat, 0.18);
        }
      }, tuneBeats);
    };
    kit.onPause((p) => {
      if (p) {
        stopMusic();
        kit.synth.hush();
      } else if (!over)
        startMusic();
    });
    kit.onQuit(() => finish("time"));
    const board = () => {
      const s = Math.floor(Math.min((c.h - 24) / H, (c.w - 300) / W, 36));
      const w = s * W, h = s * H;
      return { s: Math.max(12, s), x: Math.round((c.w - w) / 2), y: Math.round((c.h - h) / 2), w, h };
    };
    kit.loop((dt) => {
      if (over) {
        draw();
        return;
      }
      timeLeft = Math.max(0, timeLeft - dt);
      if (timeLeft <= 0) {
        finish("time");
        return;
      }
      if (clearing) {
        clearing.t += dt;
        if (clearing.t > 0.28) {
          for (const row of clearing.rows.sort((a, b) => a - b)) {
            grid.splice(row, 1);
            grid.unshift(Array(W).fill(null));
          }
          clearing = null;
          if (!over)
            spawn();
        }
      } else {
        if (held_.left || held_.right) {
          das += dt;
          if (das > 0.16) {
            das -= 0.045;
            move(held_.left ? -1 : 1);
          }
        }
        const g2 = held_.down ? Math.max(gravity * 8, 18) : gravity;
        fall += dt * g2;
        while (fall >= 1) {
          fall -= 1;
          if (fits(cur.p, cur.r, cur.x, cur.y + 1)) {
            cur.y++;
            lock = 0;
          } else
            break;
        }
        if (!fits(cur.p, cur.r, cur.x, cur.y + 1)) {
          lock += dt;
          if (lock > 0.5)
            place();
        }
      }
      sparks.step(dt);
      floats.step(dt);
      if (Math.floor(timeLeft * 4) !== Math.floor((timeLeft + dt) * 4))
        status();
      draw();
    });
    const block = (x, y, s, p, alpha = 1) => {
      const col = colorOf(p);
      g.globalAlpha = alpha;
      if (t.style === "medieval") {
        g.fillStyle = col;
        g.fillRect(x + 1, y + 1, s - 2, s - 2);
        g.globalAlpha = alpha * 0.35;
        paint(g, "stone", t, x + 1, y + 1, s - 2, s - 2);
        g.globalAlpha = alpha;
        g.fillStyle = "rgba(255, 240, 210, .28)";
        g.fillRect(x + 1, y + 1, s - 2, 2);
        g.fillRect(x + 1, y + 1, 2, s - 2);
        g.fillStyle = "rgba(20, 10, 2, .4)";
        g.fillRect(x + 1, y + s - 3, s - 2, 2);
        g.fillRect(x + s - 3, y + 1, 2, s - 2);
        g.strokeStyle = "rgba(20, 10, 2, .5)";
        g.lineWidth = 1;
        g.strokeRect(x + 1.5, y + 1.5, s - 3, s - 3);
      } else if (t.style === "modern") {
        g.fillStyle = col;
        rrect(g, x + 1, y + 1, s - 2, s - 2, Math.max(2, s * 0.16));
        g.fill();
        g.fillStyle = "rgba(255,255,255,.18)";
        rrect(g, x + 1, y + 1, s - 2, (s - 2) * 0.45, Math.max(2, s * 0.16));
        g.fill();
      } else {
        g.fillStyle = `${col}2e`;
        g.fillRect(x + 1.5, y + 1.5, s - 3, s - 3);
        glow(g, t, col, 6);
        g.strokeStyle = col;
        g.lineWidth = 1.5;
        g.strokeRect(x + 2, y + 2, s - 4, s - 4);
        g.shadowBlur = 0;
        g.fillStyle = col;
        g.fillRect(x + s * 0.38, y + s * 0.38, s * 0.24, s * 0.24);
      }
      g.globalAlpha = 1;
    };
    const ghost = (x, y, s, p) => {
      const col = colorOf(p);
      if (t.style === "modern") {
        g.fillStyle = "rgba(29,29,31,.07)";
        rrect(g, x + 1, y + 1, s - 2, s - 2, Math.max(2, s * 0.16));
        g.fill();
        return;
      }
      g.setLineDash([3, 3]);
      g.strokeStyle = t.style === "medieval" ? "rgba(236, 223, 191, .5)" : `${col}99`;
      g.lineWidth = 1.5;
      g.strokeRect(x + 2.5, y + 2.5, s - 5, s - 5);
      g.setLineDash([]);
    };
    const mini = (p, cx, cy, s, alpha = 1) => {
      const pts = cells(p, 0, 0, 0);
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      const w = (Math.max(...xs) - Math.min(...xs) + 1) * s, h = (Math.max(...ys) - Math.min(...ys) + 1) * s;
      for (const [a, b] of pts)
        block(cx - w / 2 + (a - Math.min(...xs)) * s, cy - h / 2 + (b - Math.min(...ys)) * s, s, p, alpha);
    };
    const panel = (x, y, w, h, title) => {
      if (t.style === "medieval") {
        lift(g, t, 1.5);
        g.fillStyle = "#2a1a0d";
        g.fillRect(x, y, w, h);
        unlift(g);
        paint(g, "parchment", t, x + 3, y + 3, w - 6, h - 6);
        g.strokeStyle = "#b48a2c";
        g.lineWidth = 1;
        g.strokeRect(x + 6.5, y + 6.5, w - 13, h - 13);
        g.fillStyle = "#9e2b1f";
        g.font = `700 11px ${t.fontDisplay}`;
      } else if (t.style === "modern") {
        lift(g, t, 1);
        g.fillStyle = "#fff";
        rrect(g, x, y, w, h, 14);
        g.fill();
        unlift(g);
        g.fillStyle = t.inkSoft;
        g.font = `700 10.5px ${t.fontUi}`;
      } else {
        g.fillStyle = "rgba(10, 17, 27, .9)";
        g.fillRect(x, y, w, h);
        g.strokeStyle = "rgba(120, 170, 210, .22)";
        g.lineWidth = 1;
        g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        brackets(g, x, y, w, h, t.accent, 8);
        g.fillStyle = t.accent;
        g.font = `500 10.5px ${t.fontNum}`;
      }
      g.textAlign = "center";
      g.textBaseline = "top";
      g.fillText(t.style === "scifi" ? `// ${title}` : title.toUpperCase(), x + w / 2, y + 12);
    };
    const inkOn = () => t.style === "medieval" ? "#2c1f12" : t.ink;
    function draw() {
      const B = board();
      g.clearRect(0, 0, c.w, c.h);
      ground(g, t, c.w, c.h, t.style === "medieval" ? "table" : "page");
      if (t.style === "medieval") {
        lift(g, t, 2);
        g.fillStyle = "#1a0f06";
        g.fillRect(B.x - 10, B.y - 10, B.w + 20, B.h + 20);
        unlift(g);
        g.strokeStyle = "#b48a2c";
        g.lineWidth = 2;
        g.strokeRect(B.x - 6, B.y - 6, B.w + 12, B.h + 12);
        g.fillStyle = "#24170c";
        g.fillRect(B.x, B.y, B.w, B.h);
        g.strokeStyle = "rgba(236, 223, 191, .05)";
      } else if (t.style === "modern") {
        lift(g, t, 2);
        g.fillStyle = "#ffffff";
        rrect(g, B.x - 8, B.y - 8, B.w + 16, B.h + 16, 14);
        g.fill();
        unlift(g);
        g.strokeStyle = "rgba(29, 29, 31, .05)";
      } else {
        g.fillStyle = "rgba(8, 14, 22, .92)";
        g.fillRect(B.x, B.y, B.w, B.h);
        g.strokeStyle = "rgba(120, 170, 210, .25)";
        g.lineWidth = 1;
        g.strokeRect(B.x - 0.5, B.y - 0.5, B.w + 1, B.h + 1);
        brackets(g, B.x - 6, B.y - 6, B.w + 12, B.h + 12, t.accent, 14);
        g.strokeStyle = "rgba(120, 170, 210, .07)";
      }
      g.lineWidth = 1;
      for (let x = 1;x < W; x++) {
        g.beginPath();
        g.moveTo(B.x + x * B.s + 0.5, B.y);
        g.lineTo(B.x + x * B.s + 0.5, B.y + B.h);
        g.stroke();
      }
      for (let y = 1;y < H; y++) {
        g.beginPath();
        g.moveTo(B.x, B.y + y * B.s + 0.5);
        g.lineTo(B.x + B.w, B.y + y * B.s + 0.5);
        g.stroke();
      }
      for (let y = 0;y < H; y++)
        for (let x = 0;x < W; x++) {
          const p = grid[y][x];
          if (!p)
            continue;
          if (clearing?.rows.includes(y)) {
            const k = 1 - clearing.t / 0.28;
            g.fillStyle = t.style === "medieval" ? `rgba(233, 196, 106, ${k})` : t.style === "modern" ? `rgba(255, 255, 255, ${k})` : `rgba(94, 200, 229, ${k * 0.8})`;
            g.fillRect(B.x + x * B.s, B.y + y * B.s, B.s, B.s);
          } else
            block(B.x + x * B.s, B.y + y * B.s, B.s, p);
        }
      if (!clearing && !over) {
        const gy = ghostY();
        for (const [a, b] of cells(cur.p, cur.r, cur.x, gy))
          if (b >= 0)
            ghost(B.x + a * B.s, B.y + b * B.s, B.s, cur.p);
        for (const [a, b] of cells(cur.p, cur.r, cur.x, cur.y))
          if (b >= 0)
            block(B.x + a * B.s, B.y + b * B.s, B.s, cur.p);
      }
      const side = Math.min(130, (c.w - B.w) / 2 - 36);
      const ms = Math.max(9, Math.min(18, B.s * 0.55));
      if (side > 64) {
        const lx = B.x - 24 - side, rx = B.x + B.w + 24;
        if (canHold) {
          panel(lx, B.y, side, 92, "Hold");
          if (hold)
            mini(hold, lx + side / 2, B.y + 58, ms, held ? 0.4 : 1);
        }
        const nh = 40 + previews * ms * 3;
        panel(rx, B.y, side, nh, "Next");
        for (let i = 0;i < previews; i++)
          mini(queue[i], rx + side / 2, B.y + 48 + i * ms * 3 + ms, i ? ms * 0.8 : ms);
        const sy = canHold ? B.y + 108 : B.y;
        panel(lx, sy, side, 130, "Lines");
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillStyle = inkOn();
        g.font = `${t.style === "medieval" ? 700 : t.style === "scifi" ? 600 : 800} ${Math.round(Math.min(30, side * 0.26))}px ${t.style === "scifi" ? t.fontNum : t.fontDisplay}`;
        g.fillText(`${Math.min(credit, goal)} / ${goal}`, lx + side / 2, sy + 52);
        g.fillStyle = timeLeft < 10 ? t.bad : t.style === "medieval" ? "#6b5638" : t.inkSoft;
        g.font = `${t.style === "scifi" ? 500 : 600} 15px ${t.style === "scifi" ? t.fontNum : t.fontUi}`;
        g.fillText(`${Math.ceil(timeLeft)}s left`, lx + side / 2, sy + 92);
      }
      sparks.draw(g);
      floats.draw(g);
    }
    status();
    return () => {
      stopMusic();
    };
  }
};

// src/frontend/arcade/games/tiles.ts
var KEYS = ["d", "f", "j", "k"];
var ALT = { a: 0, s: 1, l: 3, ";": 3, arrowleft: 0, arrowdown: 1, arrowup: 2, arrowright: 3 };
var TILES = {
  id: "tiles",
  title: "Keys",
  rhythm: true,
  howTo: [
    "Notes fall down four lanes. Press the lane's key as a note crosses the line.",
    "Long notes: hold until the end.",
    "Every note you hit plays the melody — miss and the tune stumbles."
  ],
  controls: "D F J K (or A S ← ↓ ↑ →) · tap the lanes on touch",
  start(kit) {
    const t = kit.theme;
    const song = kit.play.song;
    const clock = new SongClock(kit, song);
    const chart = tileNotes(song);
    const notes = chart.map((n) => ({ n, done: false, holding: false, judged: null }));
    const tally = new Tally(notes.length + notes.filter((l) => l.n.d > 0).length * 0.5);
    const win = windows(kit);
    const travel = (1.55 - 0.7 * kit.play.level) * (1 + kit.aid("slow") / 150);
    const limit = missLimit(kit.play.level);
    const c = kit.canvas();
    const g = c.g;
    const sparks = new Sparks;
    const pressed = [false, false, false, false];
    const flash = [0, 0, 0, 0];
    let started = false, ended = false, lastJudge = null;
    const geo = () => {
      const w = Math.min(c.w * 0.92, 520, c.h * 0.85);
      const x = (c.w - w) / 2;
      const keyH = Math.min(64, c.h * 0.12);
      const line = c.h - keyH - 14;
      return { x, w, lane: w / 4, line, keyH, speed: line / travel };
    };
    const judge = (j, lane, weight = 1) => {
      tally.add(j, weight);
      lastJudge = { j, at: performance.now() };
      const G = geo();
      const x = G.x + G.lane * (lane + 0.5);
      if (j === "miss") {
        kit.synth.fx("miss");
        if (tally.streak >= limit) {
          if (kit.lives.spend("Second wind!"))
            tally.streak = 0;
          else
            end(true);
        }
      } else {
        sparks.burst(x, G.line, j === "perfect" ? t.gold : t.style === "modern" ? t.accent : t.lanes[lane], j === "perfect" ? 12 : 7, 180, 2.5);
        if (tally.combo > 0 && tally.combo % 25 === 0) {
          kit.synth.fx("combo");
          kit.banner(`${tally.combo} in a row`, "gold");
        }
      }
      kit.score(tally.score());
      kit.track(tally.form());
      kit.status(`${tally.combo}× combo
${Math.round(tally.accuracy() * 100)}% accuracy`);
    };
    const hit = (lane) => {
      pressed[lane] = true;
      flash[lane] = 1;
      const now = clock.time();
      const l = notes.find((x) => !x.done && x.judged === null && x.n.lane === lane && Math.abs(now - x.n.t) <= win.ok * 1.6);
      if (!l)
        return;
      const j = judgeOf(now - l.n.t, win);
      if (!j)
        return;
      clock.melody(l.n.midi, l.n.d || 0.3);
      kit.synth.fx(j === "perfect" ? "perfect" : "hit");
      l.judged = j;
      if (l.n.d > 0)
        l.holding = true;
      else
        l.done = true;
      judge(j, lane);
    };
    const release = (lane) => {
      pressed[lane] = false;
      const now = clock.time();
      const l = notes.find((x) => x.holding && x.n.lane === lane);
      if (!l)
        return;
      l.holding = false;
      l.done = true;
      const left = l.n.t + l.n.d - now;
      judge(left <= win.great ? "perfect" : left <= l.n.d * 0.35 ? "ok" : "miss", lane, 0.5);
    };
    const end = (early = false) => {
      if (ended)
        return;
      ended = true;
      clock.stop();
      for (const l of notes)
        if (!l.done && l.judged === null) {
          tally.add("miss");
          l.done = true;
        }
      const beats = rhythmBeats(tally);
      if (early)
        beats.unshift("lost the thread of the tune and couldn't find it again");
      kit.score(tally.score());
      kit.finish({ score: tally.score(), beats, detail: `${tally.counts.perfect} perfect, ${tally.counts.miss} missed, best run ${tally.maxCombo}` });
    };
    kit.onKey((e, isDown) => {
      const k = e.key.toLowerCase();
      const lane = KEYS.indexOf(k) >= 0 ? KEYS.indexOf(k) : ALT[k] ?? -1;
      if (lane < 0)
        return false;
      if (isDown && !e.repeat)
        hit(lane);
      else if (!isDown)
        release(lane);
      return true;
    });
    const laneAt = (e) => {
      const r = c.el.getBoundingClientRect();
      const G = geo();
      return Math.floor((e.clientX - r.left - G.x) / G.lane);
    };
    const touches = new Map;
    c.el.addEventListener("pointerdown", (e) => {
      const lane = laneAt(e);
      if (lane < 0 || lane > 3 || kit.paused)
        return;
      c.el.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, lane);
      hit(lane);
    });
    const up = (e) => {
      const lane = touches.get(e.pointerId);
      if (lane !== undefined) {
        touches.delete(e.pointerId);
        release(lane);
      }
    };
    c.el.addEventListener("pointerup", up);
    c.el.addEventListener("pointercancel", up);
    kit.onPause((p) => {
      if (p)
        clock.pause();
      else
        clock.ready.then(() => {
          if (!kit.paused && !ended) {
            clock.start();
            started = true;
          }
        });
    });
    kit.onQuit(() => end());
    kit.loop((dt) => {
      const now = clock.time();
      clock.tick();
      if (autoplay()) {
        for (const l of notes)
          if (!l.done && l.judged === null && now >= l.n.t) {
            hit(l.n.lane);
            if (!l.n.d)
              setTimeout(() => {
                pressed[l.n.lane] = false;
              }, 90);
            else
              setTimeout(() => release(l.n.lane), l.n.d * 1000);
          }
      }
      for (const l of notes) {
        if (l.done)
          continue;
        if (l.holding) {
          if (now >= l.n.t + l.n.d) {
            l.holding = false;
            l.done = true;
            judge("perfect", l.n.lane, 0.5);
            kit.synth.fx("hit");
          }
        } else if (l.judged === null && now - l.n.t > win.ok) {
          l.done = true;
          judge("miss", l.n.lane, l.n.d > 0 ? 1.5 : 1);
        }
      }
      if (started && !ended && now > clock.length + 0.8)
        end();
      for (let i = 0;i < 4; i++)
        flash[i] = Math.max(0, flash[i] - dt * 4);
      sparks.step(dt, t.style === "medieval" ? 300 : 0);
      draw(now);
    });
    function lanes(G) {
      if (t.style === "medieval") {
        paint(g, "wood", t, G.x - 14, 0, G.w + 28, c.h);
        paint(g, "parchment", t, G.x, 0, G.w, G.line);
        g.strokeStyle = "rgba(74, 52, 28, .3)";
        g.lineWidth = 1;
        for (let i = 1;i < 4; i++) {
          g.beginPath();
          g.moveTo(G.x + G.lane * i, 0);
          g.lineTo(G.x + G.lane * i, G.line);
          g.stroke();
        }
        g.fillStyle = "#b48a2c";
        g.fillRect(G.x - 2, 0, 2, c.h);
        g.fillRect(G.x + G.w, 0, 2, c.h);
      } else if (t.style === "modern") {
        g.fillStyle = "#ffffff";
        g.fillRect(G.x, 0, G.w, c.h);
        g.strokeStyle = "rgba(29, 29, 31, .08)";
        g.lineWidth = 1;
        for (let i = 0;i <= 4; i++) {
          g.beginPath();
          g.moveTo(G.x + G.lane * i + 0.5, 0);
          g.lineTo(G.x + G.lane * i + 0.5, c.h);
          g.stroke();
        }
      } else {
        g.fillStyle = "rgba(10, 17, 27, .9)";
        g.fillRect(G.x, 0, G.w, c.h);
        g.strokeStyle = "rgba(120, 170, 210, .12)";
        g.lineWidth = 1;
        for (let i = 0;i <= 4; i++) {
          g.beginPath();
          g.moveTo(G.x + G.lane * i + 0.5, 0);
          g.lineTo(G.x + G.lane * i + 0.5, c.h);
          g.stroke();
        }
        g.fillStyle = "rgba(120, 170, 210, .12)";
        for (let y = G.line - 40;y > 0; y -= 40)
          g.fillRect(G.x, y, 6, 1);
      }
      for (let i = 0;i < 4; i++) {
        const k = Math.max(flash[i], pressed[i] ? 0.5 : 0);
        if (k <= 0)
          continue;
        const lg = g.createLinearGradient(0, G.line, 0, G.line - c.h * 0.4);
        const col = t.style === "medieval" ? "180, 138, 44" : t.style === "modern" ? "255, 90, 54" : "94, 200, 229";
        lg.addColorStop(0, `rgba(${col}, ${0.22 * k})`);
        lg.addColorStop(1, `rgba(${col}, 0)`);
        g.fillStyle = lg;
        g.fillRect(G.x + G.lane * i, G.line - c.h * 0.4, G.lane, c.h * 0.4);
      }
    }
    function note(x, y, w, h, lane) {
      if (t.style === "medieval") {
        lift(g, t, 1.2);
        g.fillStyle = "#231710";
        rrect(g, x, y, w, h, 3);
        g.fill();
        unlift(g);
        paint(g, "wood", { ...t, wood: "#3a2616" }, x, y, w, h);
        g.strokeStyle = "#b48a2c";
        g.lineWidth = 1.5;
        rrect(g, x + 2.5, y + 2.5, w - 5, h - 5, 2);
        g.stroke();
        const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.18;
        g.fillStyle = "#c9952f";
        for (let k = 0;k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          g.beginPath();
          g.ellipse(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6, r * 0.55, r * 0.3, a, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "#9e2b1f";
        g.beginPath();
        g.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
        g.fill();
      } else if (t.style === "modern") {
        g.fillStyle = "#1d1d1f";
        rrect(g, x, y, w, h, 6);
        g.fill();
      } else {
        const col = t.lanes[lane];
        g.fillStyle = "rgba(94, 200, 229, .06)";
        g.fillStyle = `${col}22`;
        rrect(g, x, y, w, h, 2);
        g.fill();
        glow(g, t, col, 10);
        g.strokeStyle = col;
        g.lineWidth = 1.5;
        rrect(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, 2);
        g.stroke();
        g.shadowBlur = 0;
        g.fillStyle = col;
        g.fillRect(x + 6, y + h - 4, w - 12, 2);
      }
    }
    function hold(x, top, bottom, w, lane, active) {
      const h = Math.max(0, bottom - top);
      if (h <= 0)
        return;
      if (t.style === "medieval") {
        g.fillStyle = active ? "#9e2b1f" : "rgba(158, 43, 31, .55)";
        g.fillRect(x + w * 0.38, top, w * 0.24, h);
        g.fillStyle = "#b48a2c";
        g.fillRect(x + w * 0.38, top, 1.5, h);
        g.fillRect(x + w * 0.62 - 1.5, top, 1.5, h);
      } else if (t.style === "modern") {
        g.fillStyle = active ? t.accent : "rgba(29, 29, 31, .78)";
        rrect(g, x + w * 0.3, top, w * 0.4, h, 4);
        g.fill();
      } else {
        const col = t.lanes[lane];
        g.fillStyle = active ? `${col}55` : `${col}22`;
        g.fillRect(x + w * 0.32, top, w * 0.36, h);
        g.fillStyle = col;
        g.fillRect(x + w * 0.32, top, 1, h);
        g.fillRect(x + w * 0.68 - 1, top, 1, h);
      }
    }
    function keyboard(G) {
      const y = G.line + 8, h = G.keyH;
      if (t.style === "medieval") {
        g.fillStyle = "#b48a2c";
        g.fillRect(G.x, G.line - 1.5, G.w, 3);
        g.fillStyle = "#6b4a12";
        g.fillRect(G.x, G.line + 1.5, G.w, 1);
        for (const dx of [G.x, G.x + G.w]) {
          g.save();
          g.translate(dx, G.line);
          g.rotate(Math.PI / 4);
          g.fillStyle = "#c9952f";
          g.fillRect(-5, -5, 10, 10);
          g.restore();
        }
      } else if (t.style === "modern") {
        g.fillStyle = "rgba(29, 29, 31, .08)";
        g.fillRect(G.x, G.line - 18, G.w, 36);
        g.fillStyle = t.ink;
        g.fillRect(G.x, G.line - 1, G.w, 2);
      } else {
        g.fillStyle = t.accent;
        g.fillRect(G.x, G.line - 0.5, G.w, 1.5);
        brackets(g, G.x - 6, G.line - 10, G.w + 12, 20, "rgba(94, 200, 229, .6)", 8);
      }
      for (let i = 0;i < 4; i++) {
        const x = G.x + G.lane * i + 4, w = G.lane - 8;
        const on = pressed[i];
        if (t.style === "medieval") {
          lift(g, t, on ? 0.3 : 1);
          const kg = g.createLinearGradient(0, y, 0, y + h);
          kg.addColorStop(0, on ? "#d8c79f" : "#f3ead2");
          kg.addColorStop(1, on ? "#c2ae82" : "#ddcfae");
          g.fillStyle = kg;
          rrect(g, x, y + (on ? 2 : 0), w, h - 2, 3);
          g.fill();
          unlift(g);
          g.strokeStyle = "rgba(74, 52, 28, .5)";
          g.lineWidth = 1;
          rrect(g, x, y + (on ? 2 : 0), w, h - 2, 3);
          g.stroke();
          g.fillStyle = "#5e4a30";
          g.font = `700 ${Math.round(Math.min(18, h * 0.32))}px ${t.fontDisplay}`;
        } else if (t.style === "modern") {
          g.fillStyle = on ? t.accent : "#ffffff";
          rrect(g, x, y, w, h - 2, 12);
          g.fill();
          g.strokeStyle = on ? t.accent : "rgba(29, 29, 31, .12)";
          g.lineWidth = 1;
          rrect(g, x + 0.5, y + 0.5, w - 1, h - 3, 12);
          g.stroke();
          g.fillStyle = on ? "#fff" : t.inkSoft;
          g.font = `700 ${Math.round(Math.min(17, h * 0.3))}px ${t.fontDisplay}`;
        } else {
          g.fillStyle = on ? `${t.lanes[i]}33` : "rgba(16, 27, 40, .9)";
          g.beginPath();
          g.moveTo(x + 8, y);
          g.lineTo(x + w, y);
          g.lineTo(x + w, y + h - 10);
          g.lineTo(x + w - 8, y + h - 2);
          g.lineTo(x, y + h - 2);
          g.lineTo(x, y + 8);
          g.closePath();
          g.fill();
          g.strokeStyle = on ? t.lanes[i] : "rgba(120, 170, 210, .3)";
          g.lineWidth = 1;
          g.stroke();
          g.fillStyle = on ? t.lanes[i] : t.inkSoft;
          g.font = `600 ${Math.round(Math.min(15, h * 0.28))}px ${t.fontNum}`;
        }
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(KEYS[i].toUpperCase(), x + w / 2, y + h / 2);
      }
    }
    function draw(now) {
      const G = geo();
      g.clearRect(0, 0, c.w, c.h);
      ground(g, t, c.w, c.h, t.style === "medieval" ? "table" : "page");
      lanes(G);
      const pad = Math.max(3, G.lane * 0.07);
      g.save();
      g.beginPath();
      g.rect(G.x, 0, G.w, G.line + 2);
      g.clip();
      for (const l of notes) {
        if (l.done && !l.holding)
          continue;
        const yHead = G.line - (l.n.t - now) * G.speed;
        const yTail = G.line - (l.n.t + l.n.d - now) * G.speed;
        if (yTail > c.h + 40 || yHead < -80)
          continue;
        const x = G.x + G.lane * l.n.lane + pad, w = G.lane - pad * 2;
        const th = Math.max(26, Math.min(G.lane * 0.55, 46));
        if (l.n.d > 0)
          hold(x, yTail, l.holding ? G.line : yHead - th, w, l.n.lane, l.holding);
        if (l.holding)
          continue;
        note(x, yHead - th, w, th, l.n.lane);
      }
      g.restore();
      keyboard(G);
      if (tally.combo > 2) {
        g.globalAlpha = t.style === "scifi" ? 0.14 : 0.1;
        g.fillStyle = t.style === "scifi" ? t.accent : t.ink;
        g.font = `${t.style === "scifi" ? 600 : 800} ${Math.round(Math.min(130, c.h * 0.2))}px ${t.style === "scifi" ? t.fontNum : t.fontDisplay}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(tally.combo), c.w / 2, c.h * 0.36);
        g.globalAlpha = 1;
      }
      if (lastJudge && performance.now() - lastJudge.at < 450) {
        const k = (performance.now() - lastJudge.at) / 450;
        g.globalAlpha = 1 - k;
        g.fillStyle = judgeColor(t, lastJudge.j);
        g.font = `${t.style === "medieval" ? 700 : 800} ${Math.round(26 * (1.1 - k * 0.1))}px ${t.fontDisplay}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        const label = t.style === "scifi" || t.style === "medieval" ? JUDGE_LABEL[lastJudge.j].toUpperCase() : JUDGE_LABEL[lastJudge.j];
        if (t.light) {
          g.lineWidth = 4;
          g.strokeStyle = "rgba(255,255,255,.85)";
          g.lineJoin = "round";
          g.strokeText(label, c.w / 2, G.line - c.h * 0.2);
        }
        g.fillText(label, c.w / 2, G.line - c.h * 0.2);
        g.globalAlpha = 1;
      }
      const prog = clamp(now / clock.length);
      g.fillStyle = t.line;
      g.fillRect(G.x, 0, G.w, 3);
      g.fillStyle = t.style === "modern" ? t.accent : t.style === "medieval" ? "#b48a2c" : t.accent;
      g.fillRect(G.x, 0, G.w * prog, 3);
      sparks.draw(g);
    }
    return () => clock.stop();
  }
};

// src/frontend/arcade/games/index.ts
var GAME_DEFS = {
  aim: AIM,
  tiles: TILES,
  mines: MINES,
  stack: STACK,
  snake: SNAKE,
  race: RACE,
  pinball: PINBALL,
  blackjack: BLACKJACK,
  roulette: ROULETTE,
  slots: SLOTS
};

// src/frontend/arcade/library.ts
async function inflate(data) {
  const DS = globalThis.DecompressionStream;
  if (!DS)
    throw new Error("This browser can't unpack .osz files.");
  const stream = new Blob([data]).stream().pipeThrough(new DS("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(buf) {
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22;i >= Math.max(0, buf.byteLength - 70000); i--)
    if (v.getUint32(i, true) === 101010256) {
      eocd = i;
      break;
    }
  if (eocd < 0)
    throw new Error("That isn't a .osz (zip) file.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  const out = new Map;
  const dec = new TextDecoder;
  for (let i = 0;i < count; i++) {
    if (v.getUint32(p, true) !== 33639248)
      break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    const lname = v.getUint16(local + 26, true), lextra = v.getUint16(local + 28, true);
    const start = local + 30 + lname + lextra;
    const raw = u8.subarray(start, start + size);
    out.set(name.toLowerCase(), async () => method === 0 ? raw.slice() : method === 8 ? inflate(raw) : Promise.reject(new Error("Unsupported compression")));
  }
  return out;
}
function sections(text) {
  const out = {};
  let cur = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("//"))
      continue;
    const m = /^\[(.+)\]$/.exec(line);
    if (m) {
      cur = m[1];
      out[cur] = [];
      continue;
    }
    (out[cur] ??= []).push(line);
  }
  return out;
}
var kv = (lines = []) => Object.fromEntries(lines.map((l) => {
  const i = l.indexOf(":");
  return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
}));
function curve(kind, pts) {
  if (kind === "L" || pts.length < 3)
    return pts;
  const segs = [[pts[0]]];
  for (let i = 1;i < pts.length; i++) {
    const last = segs[segs.length - 1];
    const prev = pts[i - 1];
    if (kind === "B" && pts[i][0] === prev[0] && pts[i][1] === prev[1])
      segs.push([pts[i]]);
    else
      last.push(pts[i]);
  }
  const out = [];
  for (const s of segs) {
    for (let k = 0;k <= 12; k++) {
      let q = s.map((x) => [...x]);
      const t = k / 12;
      while (q.length > 1)
        q = q.slice(1).map((b, j) => [q[j][0] + (b[0] - q[j][0]) * t, q[j][1] + (b[1] - q[j][1]) * t]);
      out.push(q[0]);
    }
  }
  return out;
}
function trim(pts, len) {
  const out = [pts[0]];
  let left = len;
  for (let i = 1;i < pts.length && left > 0; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const d = Math.hypot(bx - ax, by - ay);
    if (d <= left) {
      out.push(pts[i]);
      left -= d;
    } else {
      const t = left / d;
      out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
      left = 0;
    }
  }
  return out;
}
function parseOsu(text) {
  const s = sections(text);
  const gen = kv(s.General), meta = kv(s.Metadata), diff = kv(s.Difficulty);
  const mode = Number(gen.Mode ?? 0);
  if (mode !== 0 && mode !== 3)
    return null;
  const keys = Math.max(1, Math.round(Number(diff.CircleSize ?? 4)));
  const svBase = Number(diff.SliderMultiplier ?? 1.4);
  const timing = (s.TimingPoints ?? []).map((l) => l.split(",").map(Number)).filter((x) => x.length >= 2).map(([t, bl, , , , , inh]) => ({ t, bl, uninherited: inh === undefined ? bl > 0 : inh === 1 }));
  const at = (t) => {
    let bl = 500, sv = 1;
    for (const p of timing) {
      if (p.t > t)
        break;
      if (p.uninherited) {
        bl = p.bl;
        sv = 1;
      } else if (p.bl < 0)
        sv = -100 / p.bl;
    }
    return { bl, sv };
  };
  const objs = (s.HitObjects ?? []).map((l) => l.split(","));
  const aim = [];
  const tiles = [];
  let end = 0;
  for (const o of objs) {
    const x = Number(o[0]), y = Number(o[1]), t = Number(o[2]) / 1000, type = Number(o[3]);
    if (!Number.isFinite(t))
      continue;
    if (mode === 3) {
      const lane = Math.min(3, Math.floor(Math.floor(x * keys / 512) * 4 / keys));
      const hold = type & 128 ? Math.max(0, Number((o[5] ?? "").split(":")[0]) / 1000 - t) : 0;
      tiles.push({ t, lane, d: hold, midi: null });
      end = Math.max(end, t + hold);
      continue;
    }
    if (type & 8)
      continue;
    const note = { t, x: x / 512, y: y / 384, midi: null };
    if (type & 2 && o[5]) {
      const [kind, ...rest] = o[5].split("|");
      const pts = [[x, y], ...rest.map((p) => p.split(":").map(Number))];
      const slides = Math.max(1, Number(o[6] ?? 1));
      const length = Number(o[7] ?? 0);
      const { bl, sv } = at(Number(o[2]));
      const one = length > 0 ? length / (svBase * 100 * sv) * bl / 1000 : 0.3;
      let path = length > 0 ? trim(curve(kind, pts), length) : curve(kind, pts);
      if (slides > 1) {
        const back = [...path].reverse();
        const full = [...path];
        for (let k = 1;k < slides; k++)
          full.push(...k % 2 ? back : path);
        path = full;
      }
      note.slider = { pts: path.map(([px, py]) => [px / 512, py / 384]), d: one * slides };
      end = Math.max(end, t + one * slides);
    }
    aim.push(note);
    end = Math.max(end, t);
  }
  const out = { title: meta.TitleUnicode || meta.Title || "Untitled", artist: meta.ArtistUnicode || meta.Artist || "", version: meta.Version || "", audio: gen.AudioFilename ?? "", mode, keys, length: end + 1 };
  if (mode === 3)
    out.tiles = tiles;
  else
    out.aim = aim;
  return out;
}
var tierOf = (nps, kind) => {
  const k = kind === "tiles" ? nps / 1.4 : nps;
  return k < 2 ? "easy" : k < 3.6 ? "normal" : k < 5.5 ? "hard" : "brutal";
};
var DB = "warp-arcade";
function db() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("songs", { keyPath: "id" });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = fn(d.transaction("songs", mode).objectStore("songs"));
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function importOsz(file) {
  const files = await unzip(await file.arrayBuffer());
  const charts = [];
  let title = "", artist = "", audioName = "";
  for (const [name, read] of files) {
    if (!name.endsWith(".osu"))
      continue;
    const m = parseOsu(new TextDecoder().decode(await read()));
    if (!m)
      continue;
    title ||= m.title;
    artist ||= m.artist;
    audioName ||= m.audio.toLowerCase();
    const kind = m.tiles ? "tiles" : "aim";
    const n = (m.tiles ?? m.aim ?? []).length;
    if (n < 8)
      continue;
    charts.push({ version: m.version, kind, ...m.aim ? { aim: m.aim } : {}, ...m.tiles ? { tiles: m.tiles } : {}, length: m.length, nps: n / Math.max(1, m.length) });
  }
  if (!charts.length)
    throw new Error("No standard or mania difficulties in that file.");
  const audio = files.get(audioName);
  if (!audio)
    throw new Error("The song's audio file is missing from the .osz.");
  const bytes = await audio();
  const id = `osz:${title}:${artist}`.toLowerCase();
  const rec = { id, title, artist, audio: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), charts, added: Date.now() };
  await tx("readwrite", (s) => s.put(rec));
  return { title, charts: charts.length };
}
async function importedSongs(kind) {
  let all = [];
  try {
    all = await tx("readonly", (s) => s.getAll());
  } catch {
    return [];
  }
  const out = [];
  for (const rec of all.sort((a, b) => b.added - a.added)) {
    for (const c of rec.charts.filter((x) => x.kind === kind)) {
      out.push({
        id: `${rec.id}:${c.version}`,
        title: `${rec.title}${c.version ? ` [${c.version}]` : ""}`,
        by: rec.artist,
        tier: tierOf(c.nps, kind),
        source: "import",
        length: c.length,
        nps: c.nps,
        ...c.aim ? { aim: c.aim } : {},
        ...c.tiles ? { tiles: c.tiles } : {},
        audio: async () => rec.audio
      });
    }
  }
  return out;
}
async function removeImported(songId) {
  const base = songId.split(":").slice(0, 3).join(":");
  try {
    await tx("readwrite", (s) => s.delete(base));
  } catch {}
}

// src/frontend/arcade/arcade.ts
var TIER_WORD2 = { crit_success: "Critical!", success: "Success", partial: "Partial", fail: "Failed", crit_fail: "Disaster" };
var TIER_TONE3 = { crit_success: "crit", success: "good", partial: "warn", fail: "bad", crit_fail: "bad" };
var esc3 = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
var pct = (x) => `${Math.round(x * 100)}%`;
function store(key, value) {
  try {
    if (value !== undefined)
      localStorage.setItem(`warp:arcade:${key}`, value);
    return localStorage.getItem(`warp:arcade:${key}`);
  } catch {
    return null;
  }
}
function createArcade(host) {
  let surface = null;
  let running = false;
  async function run(choice, auto) {
    if (running)
      return { kind: "cancel" };
    surface ??= host.surface();
    if (!surface || !choice.game && !choice.gamble)
      return { kind: "roll" };
    running = true;
    try {
      return await session(surface, choice, auto, host);
    } finally {
      running = false;
      surface.show(false);
      surface.root.innerHTML = "";
    }
  }
  return { run, busy: () => running };
}
async function session(surface, choice, auto, host) {
  const root = surface.root;
  const muted = store("muted") === "1" || !host.sound();
  const synth = new Synth(host.volume(), muted);
  const offer = choice.game ?? null;
  const gamble = choice.gamble ?? null;
  let game = offer?.game ?? gamble.game;
  let def = GAME_DEFS[game];
  const style = host.look?.() ?? offer?.style ?? gamble?.style ?? "modern";
  const theme = THEMES[style];
  loadFonts();
  const el = document.createElement("div");
  el.className = "warp-ar";
  el.dataset.style = style;
  el.tabIndex = -1;
  if (style === "medieval") {
    el.style.setProperty("--ar-wood", `url(${textureUrl("wood", { ...theme, wood: "#4a2e18" })})`);
    el.style.setProperty("--ar-parch", `url(${textureUrl("parchment", theme)})`);
  } else if (style === "scifi")
    el.style.setProperty("--ar-panel-tex", `url(${textureUrl("panel", { ...theme, ground: "#060a10" })})`);
  root.innerHTML = "";
  root.appendChild(el);
  surface.show(true);
  let songs = [];
  let song = null;
  let stake = gamble?.stakes[0] ?? 0;
  const rng0 = seeded(offer?.seed ?? gamble?.seed ?? String(Date.now()));
  const loadSongs = async () => {
    if (!def.rhythm) {
      songs = [];
      song = null;
      return;
    }
    const mine = await importedSongs(game === "aim" ? "aim" : "tiles").catch(() => []);
    songs = [...builtinSongs(), ...mine];
    const last = store(`song:${game}`);
    song = songs.find((s) => s.id === last) ?? suggestSong(songs, offer?.level ?? 0.5, rng0);
  };
  await loadSongs();
  const briefing = () => new Promise((resolve) => {
    const draw = () => {
      el.dataset.game = game;
      const info = GAMES[game];
      const aids = offer?.aids ?? gamble?.aids ?? [];
      const ease = song ? TIER_EASE[song.tier] : 0;
      const bar = offer ? shift(offer.bar, ease) : null;
      const switcher = offer && offer.options.length > 1 ? `<div class="warp-ar-switch" role="tablist">${offer.options.map((g) => `<button role="tab" aria-selected="${g === game}" data-ar-game="${g}"><i>${GAMES[g].icon}</i>${esc3(GAMES[g].name)}</button>`).join("")}</div>` : "";
      const odds = offer ? `<div class="warp-ar-odds"><span>The dice would give you</span><b>${pct(offer.chance)}</b></div>` : `<div class="warp-ar-odds"><span>House edge</span><b>${(gamble.edge * 100).toFixed(1)}%</b></div>`;
      const barHtml = bar ? `<div class="warp-ar-need">
          <div class="warp-ar-need-track">
            <span class="z fail" style="width:${pct(bar.partial)}"></span><span class="z partial" style="width:${pct(bar.success - bar.partial)}"></span><span class="z success" style="width:${pct(bar.crit - bar.success)}"></span><span class="z crit" style="width:${pct(1 - bar.crit)}"></span>
          </div>
          <div class="warp-ar-need-legend"><span><i class="partial"></i>Partial ${pct(bar.partial)}</span><span><i class="success"></i>Success ${pct(bar.success)}</span><span><i class="crit"></i>Critical ${pct(bar.crit)}</span></div>
        </div>` : "";
      const aidHtml = aids.length ? `<div class="warp-ar-aids">${aids.map((a) => `<span class="warp-ar-aid${a.from.startsWith("★") ? " perk" : ""}"><b>${esc3(a.from)}</b>${esc3(aidWords(a.kind, a.amount))}</span>`).join("")}</div>` : `<div class="warp-ar-aids none">No aids — it's all you.</div>`;
      const partner = offer?.partner ? `<div class="warp-ar-partner">Tied to <b>${esc3(offer.partner.name)}</b> · in step ${pct(offer.partner.sync)}</div>` : "";
      const stakes = gamble ? `<div class="warp-ar-stakes">
          <div class="warp-ar-label">Buy-in · you have ${esc3(gamble.money.currency)}${gamble.money.have}</div>
          <div class="warp-ar-chips">${gamble.stakes.length ? gamble.stakes.map((x) => `<button class="warp-ar-chip${x === stake ? " on" : ""}" data-ar-stake="${x}"><span>${esc3(gamble.money.currency)}${x}</span></button>`).join("") : `<span class="warp-ar-dim">You can't cover the smallest buy-in.</span>`}</div>
          <div class="warp-ar-dim">${gamble.rounds} ${game === "blackjack" ? "hands" : game === "roulette" ? "spins" : "pulls"} · walk away whenever you like</div>
        </div>` : "";
      const songHtml = def.rhythm ? songPicker() : "";
      el.innerHTML = `<div class="warp-ar-bg"></div>
        <div class="warp-ar-brief">
          <button class="warp-ar-x" data-ar-cancel title="Back to the story (Esc)" aria-label="Close">✕</button>
          <div class="warp-ar-brief-head">
            <div class="warp-ar-badge" aria-hidden="true"><span class="i">${info.icon}</span><span class="l">${esc3(def.title.charAt(0))}</span></div>
            <div class="warp-ar-brief-title">
              <div class="warp-ar-kicker">${esc3(offer ? `${offer.action} · ${offer.label}` : gamble.action)}</div>
              <h1>${esc3(def.title)}</h1>
              <p>${esc3(info.pitch)}</p>
            </div>
            ${odds}
          </div>
          ${switcher}
          <div class="warp-ar-brief-body">
            <div class="warp-ar-col">
              ${barHtml}
              ${stakes}
              <div class="warp-ar-label">${offer ? "In your favour" : "Your edge"}</div>
              ${aidHtml}
              ${partner}
              <div class="warp-ar-label">How to play</div>
              <ul class="warp-ar-how">${def.howTo.map((h) => `<li>${esc3(h)}</li>`).join("")}</ul>
              <div class="warp-ar-keys">${esc3(def.controls)}</div>
            </div>
            ${songHtml ? `<div class="warp-ar-col songs">${songHtml}</div>` : ""}
          </div>
          <div class="warp-ar-brief-foot">
            <button class="warp-ar-btn primary" data-ar-play ${gamble && !gamble.stakes.length ? "disabled" : ""}>${gamble ? "Sit down" : "Play"} <kbd>Enter</kbd></button>
            <button class="warp-ar-btn ghost" data-ar-roll>${gamble ? "Let it play out" : "Roll the dice instead"}</button>
          </div>
        </div>`;
      el.querySelector("[data-ar-play]")?.focus({ preventScroll: true });
    };
    const songPicker = () => {
      const by = {};
      for (const s of songs)
        (by[s.source === "import" ? "Your songs" : TIER_LABEL[s.tier]] ??= []).push(s);
      const order = ["Easy", "Normal", "Hard", "Brutal", "Your songs"];
      const easeTxt = (s) => {
        const e = TIER_EASE[s.tier];
        return e === 0 ? "bar as is" : e > 0 ? `bar +${Math.round(e * 100)}%` : `bar −${Math.round(-e * 100)}%`;
      };
      const offset = Number(store("offset") ?? 0);
      return `<div class="warp-ar-label">Song <span class="warp-ar-dim">· harder songs lower the bar</span></div>
        <div class="warp-ar-songs">${order.filter((k) => by[k]).map((k) => `<div class="warp-ar-song-group"><div class="warp-ar-song-tier t-${k.toLowerCase().replace(/\s/g, "")}">${k}</div>${by[k].map((s) => `<button class="warp-ar-song${s.id === song?.id ? " on" : ""}" data-ar-song="${esc3(s.id)}">
            <span class="warp-ar-song-t">${esc3(s.title)}</span><span class="warp-ar-song-m">${esc3(s.by)} · ${mmss(s.length)} · ${easeTxt(s)}</span>
            ${s.source === "import" ? `<span class="warp-ar-song-x" data-ar-unsong="${esc3(s.id)}" title="Remove from this browser">✕</span>` : ""}</button>`).join("")}</div>`).join("")}</div>
        <label class="warp-ar-import"><input type="file" accept=".osz" data-ar-osz hidden><span>＋ Import an osu! beatmap (.osz)</span></label>
        <div class="warp-ar-dim small">Imported songs stay in this browser. ${game === "aim" ? "Standard" : "Mania"} difficulties show up here.</div>
        <label class="warp-ar-offset">Audio offset <input type="range" min="-150" max="150" step="5" value="${offset}" data-ar-offset><b>${offset > 0 ? "+" : ""}${offset} ms</b></label>`;
    };
    draw();
    const onClick = async (e) => {
      const t = e.target;
      synth.resume();
      const g = t.closest("[data-ar-game]");
      if (g) {
        game = g.dataset.arGame;
        def = GAME_DEFS[game];
        await loadSongs();
        draw();
        return;
      }
      const st = t.closest("[data-ar-stake]");
      if (st) {
        stake = Number(st.dataset.arStake);
        synth.fx("chip");
        draw();
        return;
      }
      const un = t.closest("[data-ar-unsong]");
      if (un) {
        e.stopPropagation();
        await removeImported(un.dataset.arUnsong);
        await loadSongs();
        draw();
        return;
      }
      const so = t.closest("[data-ar-song]");
      if (so) {
        song = songs.find((s) => s.id === so.dataset.arSong) ?? song;
        if (song)
          store(`song:${game}`, song.id);
        draw();
        return;
      }
      if (t.closest("[data-ar-play]")) {
        done("play");
        return;
      }
      if (t.closest("[data-ar-roll]")) {
        done("roll");
        return;
      }
      if (t.closest("[data-ar-cancel]")) {
        done("cancel");
        return;
      }
    };
    const onChange = async (e) => {
      const t = e.target;
      if (t.matches("[data-ar-osz]") && t.files?.[0]) {
        const label = el.querySelector(".warp-ar-import span");
        if (label)
          label.textContent = "Importing…";
        try {
          const r = await importOsz(t.files[0]);
          await loadSongs();
          const mine = songs.filter((s) => s.source === "import" && s.title.startsWith(r.title));
          if (mine[0]) {
            song = mine[0];
            store(`song:${game}`, song.id);
          }
          draw();
        } catch (err) {
          if (label)
            label.textContent = `Couldn't import: ${err.message}`;
        }
      }
    };
    const onInput = (e) => {
      const t = e.target;
      if (t.matches("[data-ar-offset]")) {
        store("offset", t.value);
        const b = t.parentElement?.querySelector("b");
        if (b)
          b.textContent = `${Number(t.value) > 0 ? "+" : ""}${t.value} ms`;
      }
    };
    const onKey = (e) => {
      if (e.target.matches?.("input"))
        return;
      if (e.key === "Enter" && e.target.closest?.("button"))
        return;
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (!gamble || gamble.stakes.length)
          done("play");
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        done("cancel");
      }
    };
    let settled = false;
    function done(v) {
      if (settled)
        return;
      settled = true;
      el.removeEventListener("click", onClick);
      el.removeEventListener("change", onChange);
      el.removeEventListener("input", onInput);
      document.removeEventListener("keydown", onKey, true);
      resolve(v);
    }
    el.addEventListener("click", onClick);
    el.addEventListener("change", onChange);
    el.addEventListener("input", onInput);
    document.addEventListener("keydown", onKey, true);
    if (auto && (!gamble || gamble.stakes.length))
      setTimeout(() => done("play"), 0);
  });
  const pick = await briefing();
  if (pick !== "play") {
    synth.close();
    return pick === "roll" ? { kind: "roll", ...gamble ? { params: { stake: String(stake) } } : {} } : { kind: "cancel" };
  }
  const picked = song;
  const ease = picked ? TIER_EASE[picked.tier] : 0;
  const bar = offer ? shift(offer.bar, ease) : null;
  const play = {
    mode: gamble ? "gamble" : "check",
    game,
    level: offer?.level ?? 0.5,
    bar,
    aids: offer?.aids ?? gamble?.aids ?? [],
    seed: offer?.seed ?? gamble.seed,
    ...offer?.partner ? { partner: offer.partner } : {},
    ...gamble ? { stake, rounds: gamble.rounds, currency: gamble.money.currency, edge: gamble.edge } : {},
    ...picked ? { song: picked } : {}
  };
  const finish = await playGame(el, def, play, synth, host, theme, gamble ? `${gamble.action}` : `${offer.action} · ${offer.label}`);
  synth.hush();
  const result = {
    game,
    beats: finish.beats,
    ...finish.detail ? { detail: finish.detail } : {},
    ...finish.quit ? { quit: true } : {},
    ...picked ? { song: picked.title } : {},
    ...ease ? { ease } : {},
    ...finish.livesUsed ? { livesUsed: finish.livesUsed } : {},
    ...finish.perk ? { perk: finish.perk } : {}
  };
  if (gamble) {
    result.stake = stake;
    result.net = Math.round((finish.chips ?? stake) - stake);
  } else
    result.score = Math.max(0, Math.min(1, finish.score ?? 0));
  await resultCard(el, result, bar, gamble?.money.currency ?? "", synth, def);
  synth.close();
  return { kind: "played", result };
}
function shift(bar, by) {
  const f = (x) => Math.round(Math.max(0.05, Math.min(0.99, x + by)) * 100) / 100;
  return { critFail: bar.critFail === null ? null : f(bar.critFail), partial: f(bar.partial), success: f(bar.success), crit: f(bar.crit) };
}
function playGame(el, def, play, synth, host, theme, kicker) {
  return new Promise((resolve) => {
    const bar = play.bar;
    const gamble = play.mode === "gamble";
    const lifeAids = play.aids.filter((a) => a.kind === "lives");
    let lives = aidTotal(play.aids, "lives");
    const startLives = lives;
    el.innerHTML = `<div class="warp-ar-bg"></div>
      <header class="warp-ar-top">
        <div class="warp-ar-title"><div class="warp-ar-kicker">${esc3(kicker)}</div><h1><i>${GAMES[def.id].icon}</i>${esc3(def.title)}${play.song ? `<small>♪ ${esc3(play.song.title)}</small>` : ""}</h1></div>
        <div class="warp-ar-lives" aria-label="Lives"></div>
        <div class="warp-ar-tools">
          <button class="warp-ar-tool" data-ar-mute title="Sound on/off">${synth.muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}</button>
          <button class="warp-ar-tool" data-ar-pause title="Pause (Esc)">❚❚</button>
        </div>
      </header>
      <main class="warp-ar-main">
        <section class="warp-ar-stage"><div class="warp-ar-game"></div><div class="warp-ar-banner" aria-live="polite"></div><div class="warp-ar-count"></div></section>
        <aside class="warp-ar-gauge${gamble ? " chips" : ""}">
          <div class="warp-ar-gauge-num"><b>${gamble ? `${esc3(play.currency ?? "")}${play.stake}` : "0%"}</b><span>${GAMES[def.id].kind === "luck" ? "chips" : "score"}</span></div>
          <div class="warp-ar-gauge-track">
            <div class="warp-ar-gauge-fill"></div>
            ${bar ? [["partial", bar.partial], ["success", bar.success], ["crit", bar.crit]].map(([k, v]) => `<div class="warp-ar-tick ${k}" style="--at:${pct(v)}"><span>${k === "crit" ? "Critical" : k === "success" ? "Success" : "Partial"}</span></div>`).join("") : `<div class="warp-ar-tick even" style="--at:50%"><span>Break even</span></div>`}
          </div>
          <div class="warp-ar-status"></div>
        </aside>
      </main>
      <div class="warp-ar-pausecard" hidden>
        <div class="warp-ar-card"><h2>Paused</h2>
          <button class="warp-ar-btn primary" data-ar-resume>Resume <kbd>Esc</kbd></button>
          <button class="warp-ar-btn ghost" data-ar-quit>${gamble ? "Cash out now" : "Give up — keep the score so far"}</button>
        </div>
      </div>`;
    const stage = el.querySelector(".warp-ar-stage");
    const gameEl = el.querySelector(".warp-ar-game");
    const bannerEl = el.querySelector(".warp-ar-banner");
    const countEl = el.querySelector(".warp-ar-count");
    const fill = el.querySelector(".warp-ar-gauge-fill");
    const num = el.querySelector(".warp-ar-gauge-num b");
    const statusEl = el.querySelector(".warp-ar-status");
    const livesEl = el.querySelector(".warp-ar-lives");
    const pauseCard = el.querySelector(".warp-ar-pausecard");
    const drawLives = () => {
      livesEl.innerHTML = startLives ? Array.from({ length: startLives }, (_, i) => `<i class="${i < lives ? "on" : ""}">♥</i>`).join("") : "";
    };
    drawLives();
    let paused = true, over = false, rafId = 0;
    const loops = [];
    const keys = [];
    const canvases = [];
    const samples = [];
    let lastScore = 0, livesUsed = 0, perk;
    const pauseHooks = [];
    const tone = (x) => {
      if (!bar)
        return x >= 0.5 ? "good" : "bad";
      const t = tierFromScore(bar, x);
      return TIER_TONE3[t];
    };
    const quitFns = [];
    const kit = {
      play,
      theme,
      root: gameEl,
      rng: seeded(`${play.seed}:${Date.now()}`),
      synth,
      aid: (k) => aidTotal(play.aids, k),
      canvas() {
        const c = makeCanvas(gameEl);
        canvases.push(c);
        return c;
      },
      loop(fn) {
        loops.push(fn);
      },
      onKey(fn) {
        keys.push(fn);
      },
      score(x) {
        lastScore = Math.max(0, Math.min(1, x));
        fill.style.setProperty("--v", pct(lastScore));
        fill.dataset.tone = tone(lastScore);
        num.textContent = pct(lastScore);
      },
      chips(n) {
        const stake = play.stake ?? 100;
        const x = Math.max(0, Math.min(1, n / (stake * 2)));
        fill.style.setProperty("--v", pct(x));
        fill.dataset.tone = n >= stake ? "good" : "bad";
        num.textContent = gamble ? `${play.currency ?? ""}${Math.round(n)}` : `${Math.round(n)}`;
        if (!gamble)
          lastScore = x;
      },
      status(text) {
        statusEl.textContent = text;
      },
      lives: {
        left: () => lives,
        spend(why) {
          if (lives <= 0)
            return false;
          lives--;
          livesUsed++;
          const from = lifeAids.find((a) => a.from.startsWith("★"));
          if (from && !perk)
            perk = from.from.replace(/^★\s*/, "");
          drawLives();
          synth.fx("life");
          kit.banner(why ?? "Second chance!", "gold");
          return true;
        }
      },
      banner(text, t = "info") {
        const b = document.createElement("div");
        b.className = `warp-ar-ban ${t}`;
        b.textContent = text;
        bannerEl.appendChild(b);
        setTimeout(() => b.remove(), 1500);
      },
      shake(s = 1) {
        if (host.reduced())
          return;
        stage.style.setProperty("--ar-shake", `${Math.min(14, 5 * s)}px`);
        stage.classList.remove("shake");
        stage.offsetWidth;
        stage.classList.add("shake");
      },
      finish(f) {
        if (over)
          return;
        over = true;
        cancelAnimationFrame(rafId);
        cleanup();
        const final = f.score ?? lastScore;
        const beats = [...arcBeats(samples, final), ...f.beats].slice(0, 5);
        setTimeout(() => resolve({ ...f, beats, livesUsed, ...perk ? { perk } : {} }), 650);
      },
      track(x) {
        samples.push(Math.max(0, Math.min(1, x)));
      },
      get paused() {
        return paused;
      },
      get reduced() {
        return host.reduced();
      },
      onPause(fn) {
        pauseHooks.push(fn);
      },
      onQuit(fn) {
        quitFns.push(fn);
      }
    };
    const setPaused = (p) => {
      if (over || p === paused)
        return;
      paused = p;
      pauseCard.hidden = !p;
      for (const h of pauseHooks)
        h(p);
    };
    const onKey = (e, down) => {
      if (over)
        return;
      if (e.target.matches?.("input, textarea"))
        return;
      if (down && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (countEl.dataset.on)
          return;
        setPaused(!paused);
        return;
      }
      if (paused) {
        if (down && e.key === "Enter" && !pauseCard.hidden) {
          e.preventDefault();
          setPaused(false);
        }
        e.stopPropagation();
        return;
      }
      let used = false;
      for (const k of keys)
        if (k(e, down))
          used = true;
      if (used || [" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
        e.preventDefault();
      e.stopPropagation();
    };
    const kd = (e) => onKey(e, true);
    const ku = (e) => onKey(e, false);
    document.addEventListener("keydown", kd, true);
    document.addEventListener("keyup", ku, true);
    const onClick = (e) => {
      const t = e.target;
      synth.resume();
      if (t.closest("[data-ar-pause]"))
        setPaused(!paused);
      else if (t.closest("[data-ar-resume]"))
        setPaused(false);
      else if (t.closest("[data-ar-quit]")) {
        paused = false;
        pauseCard.hidden = true;
        for (const h of pauseHooks)
          h(false);
        quit();
      } else if (t.closest("[data-ar-mute]")) {
        synth.muted = !synth.muted;
        store("muted", synth.muted ? "1" : "0");
        t.closest("[data-ar-mute]").textContent = synth.muted ? "\uD83D\uDD07" : "\uD83D\uDD0A";
      }
    };
    el.addEventListener("click", onClick);
    const onBlur = () => {
      if (!def.rhythm)
        setPaused(true);
    };
    window.addEventListener("blur", onBlur);
    let stopGame = () => {};
    function quit() {
      for (const q of quitFns)
        q();
      if (!over)
        kit.finish({ beats: ["gave up partway"], quit: true });
    }
    function cleanup() {
      document.removeEventListener("keydown", kd, true);
      document.removeEventListener("keyup", ku, true);
      el.removeEventListener("click", onClick);
      window.removeEventListener("blur", onBlur);
      try {
        stopGame();
      } catch {}
      for (const c of canvases)
        c.dispose();
    }
    stopGame = def.start(kit);
    if (gamble)
      kit.chips(play.stake ?? 0);
    else
      kit.score(0);
    el.focus({ preventScroll: true });
    let last = performance.now();
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!paused && !over)
        for (const f of loops)
          f(dt, now / 1000);
      if (!over)
        rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    const counts = ["3", "2", "1", "Go!"];
    countEl.dataset.on = "1";
    const step = (i) => {
      if (over)
        return;
      if (i >= counts.length) {
        countEl.textContent = "";
        delete countEl.dataset.on;
        paused = false;
        for (const h of pauseHooks)
          h(false);
        return;
      }
      countEl.innerHTML = `<span>${counts[i]}</span>`;
      synth.fx(i === counts.length - 1 ? "go" : "countdown");
      setTimeout(() => step(i + 1), i === counts.length - 1 ? 350 : 560);
    };
    synth.resume();
    for (const h of pauseHooks)
      h(true);
    setTimeout(() => step(0), 250);
  });
}
function resultCard(el, res, bar, currency, synth, def) {
  return new Promise((resolve) => {
    let html;
    if (res.net !== undefined) {
      const net = res.net;
      const tone = net > 0 ? "good" : net < 0 ? "bad" : "warn";
      synth.fx(net > 0 ? "coins" : net < 0 ? "lose" : "click");
      html = `<div class="warp-ar-stamp ${tone}">${net > 0 ? "Up" : net < 0 ? "Down" : "Even"}</div>
        <div class="warp-ar-big ${tone}">${net > 0 ? "+" : net < 0 ? "−" : "±"}${esc3(currency)}${Math.abs(net)}</div>
        <div class="warp-ar-dim">Stake ${esc3(currency)}${res.stake}</div>`;
    } else {
      const t = tierFromScore(bar, res.score ?? 0);
      synth.fx(t === "crit_success" ? "jackpot" : t === "success" ? "win" : t === "partial" ? "click" : "lose");
      html = `<div class="warp-ar-stamp ${TIER_TONE3[t]}">${TIER_WORD2[t]}</div>
        <div class="warp-ar-big ${TIER_TONE3[t]}" data-count="${Math.round((res.score ?? 0) * 100)}">0%</div>
        <div class="warp-ar-dim">needed ${pct(bar.success)} · critical ${pct(bar.crit)}</div>`;
    }
    const card = document.createElement("div");
    card.className = "warp-ar-result";
    card.innerHTML = `<div class="warp-ar-card">
      <div class="warp-ar-kicker">${GAMES[def.id].icon} ${esc3(def.title)}${res.song ? ` · ♪ ${esc3(res.song)}` : ""}</div>
      ${html}
      ${res.beats.length ? `<ul class="warp-ar-beats">${res.beats.map((b) => `<li>${esc3(b[0].toUpperCase() + b.slice(1))}</li>`).join("")}</ul>` : ""}
      ${res.detail ? `<div class="warp-ar-dim">${esc3(res.detail)}</div>` : ""}
      <button class="warp-ar-btn primary" data-ar-back>Back to the story <kbd>Enter</kbd></button>
    </div>`;
    el.appendChild(card);
    const big = card.querySelector("[data-count]");
    if (big) {
      const to = Number(big.dataset.count);
      const t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / 700);
        big.textContent = `${Math.round(to * (1 - Math.pow(1 - k, 3)))}%`;
        if (k < 1)
          requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    const btn = card.querySelector("[data-ar-back]");
    setTimeout(() => btn.focus({ preventScroll: true }), 50);
    const done = () => {
      document.removeEventListener("keydown", onKey, true);
      resolve();
    };
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        done();
      } else
        e.stopPropagation();
    };
    btn.addEventListener("click", done);
    setTimeout(() => document.addEventListener("keydown", onKey, true), 300);
  });
}

// src/frontend/arcade/choice-flow.ts
function playableChoice(choices, actionId) {
  return choices.find((c) => c.id === actionId && !c.locked && (c.game || c.gamble));
}
function acceptsArcadeResult(snapshot, current, startedChat, activeChat, busy) {
  return snapshot === current && startedChat === activeChat && !busy;
}
function automaticChallenge(mode, choice) {
  return mode === "always" && !!choice && !choice.locked && !!(choice.game || choice.gamble);
}

// src/frontend/arcade/styles.ts
var ARCADE_STYLES = `
.warp-ar {
  --ar-bg: #eeece7; --ar-bg2: #e6e3dc; --ar-panel: #ffffff; --ar-panel2: #f6f4ef;
  --ar-ink: #1d1d1f; --ar-muted: #5f5f66; --ar-dim: #8e8e93; --ar-line: rgba(29, 29, 31, .1);
  --ar-ac: #ff5a36; --ar-ac2: #2f6fe4; --ar-on-ac: #ffffff;
  --ar-good: #1f9d55; --ar-warn: #d9930f; --ar-bad: #d93a3a; --ar-crit: #c99a06;
  --ar-display: "Manrope", "Inter", "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif;
  --ar-ui: "Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  --ar-num: "Inter", "Segoe UI", system-ui, sans-serif;
  --ar-radius: 18px;
  position: absolute; inset: 0; overflow: hidden; outline: none;
  display: grid; grid-template-rows: auto minmax(0, 1fr);
  background: var(--ar-bg); color: var(--ar-ink);
  font-family: var(--ar-ui); font-size: 14px; line-height: 1.45;
  user-select: none; -webkit-user-select: none; touch-action: none;
  font-variant-numeric: tabular-nums;
  animation: warp-ar-in 300ms cubic-bezier(.2, .8, .2, 1) both;
}
@keyframes warp-ar-in { from { opacity: 0; } }
.warp-ar *, .warp-ar *::before, .warp-ar *::after { box-sizing: border-box; }
.warp-ar button { font: inherit; color: inherit; cursor: pointer; }
.warp-ar button:disabled { cursor: not-allowed; opacity: .45; }
.warp-ar kbd { font-family: var(--ar-num); font-size: 10.5px; padding: 1px 6px; border-radius: 5px; border: 1px solid currentColor; opacity: .5; margin-left: 8px; font-weight: 500; }
.warp-ar-bg { position: absolute; inset: 0; pointer-events: none; z-index: 0; }
.warp-ar-kicker { font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--ar-dim); }
.warp-ar-label { margin: 18px 0 8px; font-size: 10.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ar-dim); }
.warp-ar-dim { color: var(--ar-dim); font-size: 12.5px; }
.warp-ar-dim.small { font-size: 11.5px; margin-top: 6px; }

/* ── buttons ── */
.warp-ar-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; white-space: nowrap; min-height: 44px; padding: 10px 22px; border-radius: 999px; border: 1px solid var(--ar-line); background: transparent; font-weight: 600; font-size: 14.5px; transition: transform 120ms, background 120ms, border-color 120ms, color 120ms; }
.warp-ar-btn:hover:not(:disabled) { border-color: var(--ar-ink); }
.warp-ar-btn:active:not(:disabled) { transform: translateY(1px); }
.warp-ar-btn.primary { background: var(--ar-ink); color: var(--ar-panel); border-color: var(--ar-ink); font-family: var(--ar-display); font-weight: 700; }
.warp-ar-btn.primary:hover:not(:disabled) { background: #000; }
.warp-ar-btn.ghost { color: var(--ar-muted); border-color: transparent; }
.warp-ar-btn.ghost:hover:not(:disabled) { color: var(--ar-ink); border-color: var(--ar-line); }
.warp-ar-btn:focus-visible, .warp-ar-chip:focus-visible, .warp-ar-song:focus-visible, .warp-ar-switch button:focus-visible { outline: 2px solid var(--ar-ac2); outline-offset: 2px; }

/* ── briefing ── */
.warp-ar-brief { position: relative; z-index: 1; grid-row: 1 / -1; align-self: center; justify-self: center; width: min(1000px, calc(100% - 32px)); max-height: calc(100% - 32px);
  display: flex; flex-direction: column; border-radius: var(--ar-radius); background: var(--ar-panel); border: 1px solid var(--ar-line);
  box-shadow: 0 30px 80px rgba(0, 0, 0, .12); overflow: hidden; animation: warp-ar-rise 380ms cubic-bezier(.2,.8,.2,1) both; }
@keyframes warp-ar-rise { from { opacity: 0; transform: translateY(14px); } }
.warp-ar-x { position: absolute; top: 16px; right: 16px; width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--ar-line); background: transparent; color: var(--ar-muted); z-index: 2; }
.warp-ar-x:hover { color: var(--ar-ink); border-color: var(--ar-ink); }
.warp-ar-brief-head { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 20px; align-items: center; padding: 28px 64px 22px 28px; border-bottom: 1px solid var(--ar-line); }
.warp-ar-badge { position: relative; width: 66px; height: 66px; border-radius: 18px; display: grid; place-items: center; background: var(--ar-ac); color: var(--ar-on-ac); }
.warp-ar-badge .i { font-size: 30px; font-weight: 700; line-height: 1; }
.warp-ar-badge .l { display: none; }
.warp-ar-brief-title { min-width: 0; }
.warp-ar-brief-title h1 { margin: 2px 0 4px; font-family: var(--ar-display); font-size: clamp(26px, 3.6vw, 38px); line-height: 1.05; font-weight: 800; letter-spacing: -.01em; text-wrap: balance; }
.warp-ar-brief-title p { margin: 0; color: var(--ar-muted); max-width: 56ch; }
.warp-ar-odds { display: flex; flex-direction: column; align-items: flex-end; gap: 0; text-align: right; }
.warp-ar-odds span { font-size: 11.5px; color: var(--ar-dim); }
.warp-ar-odds b { font-family: var(--ar-num); font-size: 30px; font-weight: 700; }
.warp-ar-switch { display: flex; gap: 6px; padding: 14px 28px 0; flex-wrap: wrap; }
.warp-ar-switch button { display: inline-flex; gap: 8px; align-items: center; padding: 7px 14px; border-radius: 999px; border: 1px solid var(--ar-line); background: transparent; color: var(--ar-muted); font-weight: 600; }
.warp-ar-switch button i { font-style: normal; }
.warp-ar-switch button[aria-selected=true] { background: var(--ar-ink); color: var(--ar-panel); border-color: var(--ar-ink); }
.warp-ar-brief-body { display: grid; grid-template-columns: minmax(0, 1fr); gap: 32px; padding: 6px 28px 20px; overflow-y: auto; min-height: 0; scrollbar-width: thin; }
.warp-ar-brief-body:has(.warp-ar-col.songs) { grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); }
.warp-ar-col { min-width: 0; }
.warp-ar-brief-foot { display: flex; gap: 10px; align-items: center; padding: 16px 28px 22px; border-top: 1px solid var(--ar-line); flex-wrap: wrap; }
.warp-ar-brief-foot .primary { min-width: 180px; }

.warp-ar-need { margin-top: 18px; }
.warp-ar-need-track { display: flex; height: 12px; border-radius: 6px; overflow: hidden; background: var(--ar-bg2); }
.warp-ar-need-track .z { display: block; height: 100%; }
.warp-ar-need-track .fail { background: transparent; }
.warp-ar-need-track .partial { background: color-mix(in srgb, var(--ar-warn) 55%, transparent); }
.warp-ar-need-track .success { background: color-mix(in srgb, var(--ar-good) 75%, transparent); }
.warp-ar-need-track .crit { background: var(--ar-crit); }
.warp-ar-need-legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; font-size: 12.5px; color: var(--ar-muted); }
.warp-ar-need-legend i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
.warp-ar-need-legend i.partial { background: var(--ar-warn); } .warp-ar-need-legend i.success { background: var(--ar-good); } .warp-ar-need-legend i.crit { background: var(--ar-crit); }
.warp-ar-aids { display: flex; flex-wrap: wrap; gap: 6px; }
.warp-ar-aids.none { color: var(--ar-dim); font-size: 13px; }
.warp-ar-aid { display: inline-flex; gap: 6px; align-items: baseline; padding: 5px 11px; border-radius: 999px; background: var(--ar-panel2); border: 1px solid var(--ar-line); font-size: 12.5px; color: var(--ar-muted); }
.warp-ar-aid b { font-weight: 650; color: var(--ar-ink); }
.warp-ar-aid.perk b { color: var(--ar-ac); }
.warp-ar-partner { margin-top: 8px; font-size: 13px; color: var(--ar-muted); }
.warp-ar-how { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
.warp-ar-keys { margin-top: 10px; font-size: 12px; color: var(--ar-dim); }
.warp-ar-chips { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 8px; }
.warp-ar-chip { width: 72px; height: 72px; border-radius: 50%; border: none; padding: 0; display: grid; place-items: center; position: relative;
  background: radial-gradient(circle, var(--ar-panel) 0 34%, transparent 35%), repeating-conic-gradient(var(--chip, #c0392b) 0 22.5deg, #f4efe4 22.5deg 30deg);
  box-shadow: 0 4px 10px rgba(0,0,0,.18), inset 0 0 0 4px rgba(0,0,0,.12); transition: transform 140ms; }
.warp-ar-chip span { position: relative; font-family: var(--ar-num); font-weight: 700; font-size: 13px; color: var(--ar-ink); }
.warp-ar-chip:nth-child(2) { --chip: #2f5fa8; } .warp-ar-chip:nth-child(3) { --chip: #2a7a4b; } .warp-ar-chip:nth-child(4) { --chip: #232323; }
.warp-ar-chip:hover { transform: translateY(-3px); }
.warp-ar-chip.on { transform: translateY(-5px); box-shadow: 0 0 0 3px var(--ar-ink), 0 10px 20px rgba(0,0,0,.2); }

.warp-ar-songs { display: flex; flex-direction: column; gap: 12px; max-height: min(360px, 42vh); overflow-y: auto; padding-right: 4px; scrollbar-width: thin; }
.warp-ar-song-group { display: flex; flex-direction: column; gap: 3px; }
.warp-ar-song-tier { font-size: 10.5px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--ar-dim); margin-bottom: 2px; }
.warp-ar-song-tier.t-easy { color: var(--ar-good); } .warp-ar-song-tier.t-normal { color: var(--ar-ac2); } .warp-ar-song-tier.t-hard { color: var(--ar-warn); } .warp-ar-song-tier.t-brutal { color: var(--ar-bad); }
.warp-ar-song { position: relative; display: flex; flex-direction: column; align-items: flex-start; text-align: left; padding: 8px 34px 8px 12px; border-radius: 10px; border: 1px solid transparent; background: transparent; transition: background 120ms, border-color 120ms; }
.warp-ar-song:hover { background: var(--ar-panel2); }
.warp-ar-song.on { border-color: var(--ar-ink); background: var(--ar-panel2); }
.warp-ar-song.on::after { content: "♪"; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); }
.warp-ar-song-t { font-weight: 600; }
.warp-ar-song-m { font-size: 11.5px; color: var(--ar-dim); }
.warp-ar-song-x { position: absolute; right: 30px; top: 8px; color: var(--ar-dim); font-size: 11px; padding: 2px 4px; }
.warp-ar-song-x:hover { color: var(--ar-bad); }
.warp-ar-import { display: block; margin-top: 10px; padding: 9px 12px; border-radius: 10px; border: 1px dashed var(--ar-line); cursor: pointer; text-align: center; font-weight: 600; font-size: 13px; color: var(--ar-muted); }
.warp-ar-import:hover { color: var(--ar-ink); border-color: var(--ar-ink); }
.warp-ar-offset { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 12px; color: var(--ar-muted); }
.warp-ar-offset input { flex: 1; accent-color: var(--ar-ac); }
.warp-ar-offset b { font-family: var(--ar-num); min-width: 56px; text-align: right; font-weight: 600; }

/* ── playing ── */
.warp-ar-top { position: relative; z-index: 2; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 16px; align-items: center; padding: calc(14px + env(safe-area-inset-top, 0px)) 22px 12px; }
.warp-ar-title { min-width: 0; }
.warp-ar-title h1 { margin: 0; display: flex; align-items: baseline; gap: 10px; font-family: var(--ar-display); font-size: 22px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.warp-ar-title h1 i { font-style: normal; color: var(--ar-ac); }
.warp-ar-title h1 small { font-family: var(--ar-ui); font-size: 12.5px; color: var(--ar-muted); font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
.warp-ar-lives { display: flex; gap: 4px; font-size: 17px; }
.warp-ar-lives i { font-style: normal; color: var(--ar-line); transition: color 200ms; }
.warp-ar-lives i.on { color: var(--ar-bad); }
.warp-ar-tools { display: flex; gap: 6px; }
.warp-ar-tool { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--ar-line); background: var(--ar-panel); font-size: 13px; }
.warp-ar-tool:hover { border-color: var(--ar-ink); }
.warp-ar-main { position: relative; z-index: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 16px; padding: 2px 22px calc(18px + env(safe-area-inset-bottom, 0px)); }
.warp-ar-stage { position: relative; min-height: 0; border-radius: var(--ar-radius); overflow: hidden; background: var(--ar-panel); border: 1px solid var(--ar-line); box-shadow: 0 20px 50px rgba(0,0,0,.08); }
.warp-ar-stage.shake { animation: warp-ar-shake 320ms cubic-bezier(.36,.07,.19,.97); }
@keyframes warp-ar-shake { 20% { transform: translate(calc(var(--ar-shake) * -1), 2px); } 40% { transform: translate(var(--ar-shake), -2px); } 60% { transform: translate(calc(var(--ar-shake) * -.6), 1px); } 80% { transform: translate(calc(var(--ar-shake) * .4), 0); } }
.warp-ar-game { position: absolute; inset: 0; }
.warp-ar-canvas { position: absolute; inset: 0; display: block; touch-action: none; }
.warp-ar-banner { position: absolute; left: 0; right: 0; top: 14%; display: grid; place-items: center; pointer-events: none; z-index: 3; }
.warp-ar-ban { grid-area: 1 / 1; font-family: var(--ar-display); font-weight: 800; font-size: clamp(22px, 3.8vw, 38px); padding: 6px 20px; border-radius: 999px; background: var(--ar-panel); color: var(--ar-ink); box-shadow: 0 10px 30px rgba(0,0,0,.15); animation: warp-ar-ban 1.5s cubic-bezier(.2,.9,.2,1) both; }
.warp-ar-ban.good { color: var(--ar-good); } .warp-ar-ban.bad { color: var(--ar-bad); } .warp-ar-ban.gold { color: var(--ar-crit); }
@keyframes warp-ar-ban { 0% { opacity: 0; transform: translateY(8px) scale(.92); } 12% { opacity: 1; transform: none; } 75% { opacity: 1; } 100% { opacity: 0; transform: translateY(-10px); } }
.warp-ar-count { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; z-index: 4; }
.warp-ar-count[data-on] { background: color-mix(in srgb, var(--ar-bg) 55%, transparent); }
.warp-ar-count span { font-family: var(--ar-display); font-weight: 800; font-size: clamp(72px, 14vw, 150px); color: var(--ar-ink); animation: warp-ar-count 560ms cubic-bezier(.2,.9,.2,1) both; }
@keyframes warp-ar-count { from { opacity: 0; transform: scale(1.4); } 40% { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.9); } }

.warp-ar-gauge { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 10px; justify-items: center; min-height: 0; padding: 6px 0; }
.warp-ar-gauge-num { display: flex; flex-direction: column; align-items: center; }
.warp-ar-gauge-num b { font-family: var(--ar-num); font-size: 21px; font-weight: 700; }
.warp-ar-gauge-num span { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--ar-dim); }
.warp-ar-gauge-track { position: relative; width: 14px; height: 100%; min-height: 120px; border-radius: 7px; background: var(--ar-bg2); justify-self: end; margin-right: 18px; }
.warp-ar-gauge-fill { position: absolute; left: 0; right: 0; bottom: 0; height: var(--v, 0); border-radius: 7px; transition: height 220ms cubic-bezier(.2,.8,.2,1), background 220ms; background: var(--ar-bad); }
.warp-ar-gauge-fill[data-tone=warn] { background: var(--ar-warn); }
.warp-ar-gauge-fill[data-tone=good] { background: var(--ar-good); }
.warp-ar-gauge-fill[data-tone=crit] { background: var(--ar-crit); }
.warp-ar-tick { position: absolute; left: -7px; right: -7px; bottom: var(--at); height: 0; border-top: 2px solid var(--ar-ink); }
.warp-ar-tick span { position: absolute; right: calc(100% + 5px); top: -8px; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; white-space: nowrap; color: var(--ar-muted); }
.warp-ar-tick.success { border-color: var(--ar-good); } .warp-ar-tick.success span { color: var(--ar-good); }
.warp-ar-tick.crit { border-color: var(--ar-crit); } .warp-ar-tick.crit span { color: var(--ar-crit); }
.warp-ar-tick.partial { border-color: var(--ar-warn); } .warp-ar-tick.partial span { color: var(--ar-warn); }
.warp-ar-status { font-size: 11.5px; color: var(--ar-muted); text-align: center; line-height: 1.35; min-height: 30px; white-space: pre-line; max-width: 112px; }

.warp-ar-pausecard, .warp-ar-result { position: absolute; inset: 0; z-index: 10; display: grid; place-items: center; background: color-mix(in srgb, var(--ar-bg) 70%, transparent); backdrop-filter: blur(6px); animation: warp-ar-in 220ms ease both; }
.warp-ar-pausecard[hidden] { display: none; }
.warp-ar-card { position: relative; width: min(440px, calc(100% - 32px)); display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 30px 26px 24px; border-radius: var(--ar-radius); background: var(--ar-panel); border: 1px solid var(--ar-line); box-shadow: 0 30px 80px rgba(0,0,0,.15); text-align: center; }
.warp-ar-card h2 { margin: 0 0 6px; font-family: var(--ar-display); font-size: 26px; font-weight: 800; }
.warp-ar-card .warp-ar-btn { width: 100%; }
.warp-ar-stamp { font-family: var(--ar-display); font-weight: 800; font-size: clamp(36px, 7vw, 54px); line-height: 1; letter-spacing: -.02em; margin: 6px 0 0; animation: warp-ar-stamp 480ms cubic-bezier(.2,1.2,.3,1) both; }
@keyframes warp-ar-stamp { from { opacity: 0; transform: scale(1.4); } }
.warp-ar-stamp.good, .warp-ar-big.good { color: var(--ar-good); } .warp-ar-stamp.warn, .warp-ar-big.warn { color: var(--ar-warn); } .warp-ar-stamp.bad, .warp-ar-big.bad { color: var(--ar-bad); } .warp-ar-stamp.crit, .warp-ar-big.crit { color: var(--ar-crit); }
.warp-ar-big { font-family: var(--ar-num); font-size: 40px; font-weight: 700; line-height: 1; }
.warp-ar-beats { list-style: none; margin: 4px 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.warp-ar-beats li { font-size: 12.5px; padding: 4px 10px; border-radius: 999px; background: var(--ar-panel2); color: var(--ar-muted); }

/* ═════════════ medieval: oak, parchment, gold leaf ═════════════ */
.warp-ar[data-style=medieval] {
  --ar-bg: #1e140b; --ar-bg2: #c9b68e; --ar-panel: #ecdfbf; --ar-panel2: #e2d2ab;
  --ar-ink: #2c1f12; --ar-muted: #5e4a30; --ar-dim: #7d6646; --ar-line: rgba(74, 52, 28, .28);
  --ar-ac: #9e2b1f; --ar-ac2: #2c4a7a; --ar-on-ac: #f3e7c8; --ar-gold: #b48a2c;
  --ar-good: #3e6b3a; --ar-warn: #a8741a; --ar-bad: #8c1f1a; --ar-crit: #b48a2c;
  --ar-display: "Cinzel", "Trajan Pro", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --ar-ui: "EB Garamond", "Garamond", "Palatino Linotype", "Book Antiqua", Georgia, serif;
  --ar-num: "EB Garamond", "Palatino Linotype", Georgia, serif;
  --ar-radius: 3px;
  font-size: 15.5px;
  background: var(--ar-wood, #3b2414) 0 0 / 256px 256px; color: var(--ar-ink);
}
.warp-ar[data-style=medieval] .warp-ar-bg { background: radial-gradient(ellipse at center, transparent 30%, rgba(10, 5, 0, .75) 100%); }
.warp-ar[data-style=medieval] :is(.warp-ar-brief, .warp-ar-card) {
  background: var(--ar-parch, #ecdfbf) 0 0 / 512px 512px; border: 1px solid #5a3d1c;
  box-shadow: inset 0 0 0 6px transparent, inset 0 0 0 7px var(--ar-gold), inset 0 0 0 10px transparent, inset 0 0 0 11px rgba(90, 61, 28, .5), inset 0 0 60px rgba(120, 70, 20, .28), 0 30px 70px rgba(0, 0, 0, .6); }
.warp-ar[data-style=medieval] .warp-ar-brief-head { padding-top: 34px; }
.warp-ar[data-style=medieval] .warp-ar-kicker { font-family: var(--ar-ui); font-style: italic; font-size: 14px; letter-spacing: .02em; text-transform: none; color: var(--ar-ac); font-weight: 500; }
.warp-ar[data-style=medieval] .warp-ar-label { font-family: var(--ar-display); font-size: 11px; letter-spacing: .18em; color: var(--ar-ac); font-weight: 700; }
.warp-ar[data-style=medieval] .warp-ar-brief-title h1, .warp-ar[data-style=medieval] .warp-ar-card h2 { font-weight: 700; letter-spacing: .06em; }
.warp-ar[data-style=medieval] .warp-ar-badge { width: 70px; height: 70px; border-radius: 2px; background: var(--ar-ac2); box-shadow: inset 0 0 0 3px var(--ar-gold), inset 0 0 0 6px var(--ar-ac2), inset 0 0 0 7px rgba(180, 138, 44, .6), 0 3px 8px rgba(40, 20, 5, .35); }
.warp-ar[data-style=medieval] .warp-ar-badge .i { display: none; }
.warp-ar[data-style=medieval] .warp-ar-badge .l { display: block; font-family: var(--ar-display); font-weight: 900; font-size: 40px; color: #e9c46a; text-shadow: 0 1px 0 #6b4a12; line-height: 1; }
.warp-ar[data-style=medieval] .warp-ar-odds b { font-family: var(--ar-display); font-weight: 700; }
.warp-ar[data-style=medieval] .warp-ar-btn { border-radius: 2px; font-family: var(--ar-display); font-size: 13px; letter-spacing: .12em; text-transform: uppercase; border-color: rgba(74, 52, 28, .45); }
.warp-ar[data-style=medieval] .warp-ar-btn.primary { background: var(--ar-ac); color: var(--ar-on-ac); border-color: #5e140c; box-shadow: inset 0 0 0 2px var(--ar-ac), inset 0 0 0 3px rgba(233, 196, 106, .7); }
.warp-ar[data-style=medieval] .warp-ar-btn.primary:hover:not(:disabled) { background: #8a2419; }
.warp-ar[data-style=medieval] .warp-ar-btn.ghost { border-color: transparent; text-transform: none; font-family: var(--ar-ui); font-style: italic; font-size: 15px; letter-spacing: 0; }
.warp-ar[data-style=medieval] .warp-ar-x { border-radius: 2px; }
.warp-ar[data-style=medieval] .warp-ar-switch button { border-radius: 2px; font-family: var(--ar-display); font-size: 12px; letter-spacing: .1em; }
.warp-ar[data-style=medieval] .warp-ar-need-track { border-radius: 0; height: 12px; background: rgba(74, 52, 28, .12); box-shadow: inset 0 0 0 1px rgba(74, 52, 28, .35); }
.warp-ar[data-style=medieval] .warp-ar-need-track .fail { background: repeating-linear-gradient(135deg, rgba(74, 52, 28, .2) 0 2px, transparent 2px 6px); }
.warp-ar[data-style=medieval] .warp-ar-need-legend i { border-radius: 0; transform: rotate(45deg); }
.warp-ar[data-style=medieval] .warp-ar-aid { border-radius: 2px; background: transparent; border-style: dashed; }
.warp-ar[data-style=medieval] .warp-ar-how { list-style: "❧  "; }
.warp-ar[data-style=medieval] .warp-ar-keys { font-style: italic; }
.warp-ar[data-style=medieval] .warp-ar-song { border-radius: 0; border-width: 0 0 0 3px; }
.warp-ar[data-style=medieval] .warp-ar-song.on { border-color: var(--ar-ac); background: rgba(158, 43, 31, .07); }
.warp-ar[data-style=medieval] .warp-ar-song-tier { font-family: var(--ar-display); }
.warp-ar[data-style=medieval] .warp-ar-chip { background: radial-gradient(circle at 35% 30%, #f6dc8a, #c9952f 55%, #8a6214 100%); box-shadow: 0 3px 8px rgba(40, 20, 5, .4), inset 0 0 0 3px rgba(107, 74, 18, .5), inset 0 0 0 6px rgba(246, 220, 138, .35); }
.warp-ar[data-style=medieval] .warp-ar-chip span { color: #3a2508; font-family: var(--ar-display); }
.warp-ar[data-style=medieval] .warp-ar-chip.on { box-shadow: 0 0 0 3px var(--ar-ac), 0 8px 16px rgba(40, 20, 5, .45); }
.warp-ar[data-style=medieval] .warp-ar-top { color: #ecdfbf; }
.warp-ar[data-style=medieval] .warp-ar-top .warp-ar-kicker { color: #d6b56a; }
.warp-ar[data-style=medieval] .warp-ar-title h1 { font-weight: 700; letter-spacing: .08em; color: #ecdfbf; }
.warp-ar[data-style=medieval] .warp-ar-title h1 i { color: #d6b56a; }
.warp-ar[data-style=medieval] .warp-ar-title h1 small { color: #c9b68e; font-style: italic; letter-spacing: 0; }
.warp-ar[data-style=medieval] .warp-ar-tool { border-radius: 2px; background: rgba(236, 223, 191, .1); border-color: rgba(214, 181, 106, .45); color: #ecdfbf; }
.warp-ar[data-style=medieval] .warp-ar-lives i { color: rgba(236, 223, 191, .25); }
.warp-ar[data-style=medieval] .warp-ar-lives i.on { color: #c4413a; }
.warp-ar[data-style=medieval] .warp-ar-stage { border-radius: 4px; border: 0; background: #2a1a0d; box-shadow: 0 0 0 2px #b48a2c, 0 0 0 7px #4a2e16, 0 0 0 8px #b48a2c, 0 24px 60px rgba(0, 0, 0, .6); }
.warp-ar[data-style=medieval] .warp-ar-main { padding-left: 30px; padding-right: 30px; padding-bottom: calc(26px + env(safe-area-inset-bottom, 0px)); }
.warp-ar[data-style=medieval] .warp-ar-gauge-num b { font-family: var(--ar-display); color: #ecdfbf; }
.warp-ar[data-style=medieval] .warp-ar-gauge-num span { color: #c9b68e; }
.warp-ar[data-style=medieval] .warp-ar-gauge-track { width: 16px; border-radius: 2px; background: #2a1a0d; box-shadow: 0 0 0 2px #b48a2c, inset 0 0 8px rgba(0,0,0,.6); }
.warp-ar[data-style=medieval] .warp-ar-gauge-fill { border-radius: 1px; }
.warp-ar[data-style=medieval] .warp-ar-gauge-fill[data-tone=good] { background: #6f9a5e; } .warp-ar[data-style=medieval] .warp-ar-gauge-fill[data-tone=crit] { background: #e9c46a; } .warp-ar[data-style=medieval] .warp-ar-gauge-fill[data-tone=warn] { background: #c99a4a; } .warp-ar[data-style=medieval] .warp-ar-gauge-fill:not([data-tone]), .warp-ar[data-style=medieval] .warp-ar-gauge-fill[data-tone=bad] { background: #b5413a; }
.warp-ar[data-style=medieval] .warp-ar-tick { border-top-color: #ecdfbf; }
.warp-ar[data-style=medieval] .warp-ar-tick span { font-family: var(--ar-display); font-size: 9px; color: #c9b68e; }
.warp-ar[data-style=medieval] .warp-ar-tick.success span { color: #8fbf7a; } .warp-ar[data-style=medieval] .warp-ar-tick.crit span { color: #e9c46a; } .warp-ar[data-style=medieval] .warp-ar-tick.partial span { color: #d9a54a; }
.warp-ar[data-style=medieval] .warp-ar-tick.success { border-color: #8fbf7a; } .warp-ar[data-style=medieval] .warp-ar-tick.crit { border-color: #e9c46a; } .warp-ar[data-style=medieval] .warp-ar-tick.partial { border-color: #d9a54a; }
.warp-ar[data-style=medieval] .warp-ar-status { color: #c9b68e; font-style: italic; font-size: 13px; }
.warp-ar[data-style=medieval] .warp-ar-ban { font-family: var(--ar-display); font-weight: 700; letter-spacing: .08em; border-radius: 2px; background: var(--ar-parch, #ecdfbf) 0 0 / 512px; box-shadow: inset 0 0 0 1px var(--ar-gold), 0 10px 30px rgba(0,0,0,.45); }
.warp-ar[data-style=medieval] .warp-ar-count[data-on] { background: rgba(20, 12, 4, .45); }
.warp-ar[data-style=medieval] .warp-ar-count span { font-family: var(--ar-display); font-weight: 900; color: #ecdfbf; text-shadow: 0 4px 20px rgba(0,0,0,.6); }
.warp-ar[data-style=medieval] :is(.warp-ar-pausecard, .warp-ar-result) { background: rgba(20, 12, 4, .55); }
.warp-ar[data-style=medieval] .warp-ar-stamp { width: 132px; height: 132px; border-radius: 50%; display: grid; place-items: center; text-align: center; padding: 18px; font-size: 15px; line-height: 1.15; letter-spacing: .12em; text-transform: uppercase; font-weight: 700; color: #f3d9c0 !important;
  background: radial-gradient(circle at 38% 32%, #c2453a, #8c1f1a 60%, #5e110c); box-shadow: inset 0 0 0 6px rgba(94, 17, 12, .5), inset 0 0 0 9px rgba(243, 217, 192, .25), 0 4px 10px rgba(40, 10, 5, .45); transform: rotate(-8deg); }
.warp-ar[data-style=medieval] .warp-ar-stamp.good { background: radial-gradient(circle at 38% 32%, #6f9a5e, #3e6b3a 60%, #24401f); }
.warp-ar[data-style=medieval] .warp-ar-stamp.crit { background: radial-gradient(circle at 38% 32%, #e9c46a, #b48a2c 60%, #6b4a12); color: #3a2508 !important; }
.warp-ar[data-style=medieval] .warp-ar-stamp.warn { background: radial-gradient(circle at 38% 32%, #c99a4a, #a8741a 60%, #6b4a12); }
.warp-ar[data-style=medieval] .warp-ar-big { font-family: var(--ar-display); font-weight: 700; }
.warp-ar[data-style=medieval] .warp-ar-beats li { border-radius: 2px; background: transparent; font-style: italic; font-size: 14px; }

/* ═════════════ sci-fi: an instrument panel ═════════════ */
.warp-ar[data-style=scifi] {
  --ar-bg: #05080d; --ar-bg2: #13202e; --ar-panel: #0b131d; --ar-panel2: #101b28;
  --ar-ink: #d6e2ee; --ar-muted: #8ea3b8; --ar-dim: #61768c; --ar-line: rgba(120, 170, 210, .18);
  --ar-ac: #5ec8e5; --ar-ac2: #f2a541; --ar-on-ac: #05080d;
  --ar-good: #5fd3a0; --ar-warn: #f2a541; --ar-bad: #ef6461; --ar-crit: #f2c14e;
  --ar-display: "Oxanium", "Bahnschrift", "DIN Alternate", "Segoe UI", system-ui, sans-serif;
  --ar-ui: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
  --ar-num: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
  --ar-radius: 0px;
  background: var(--ar-panel-tex, #070b12) 0 0 / 256px 256px;
}
.warp-ar[data-style=scifi] .warp-ar-bg { background: radial-gradient(ellipse at 50% 40%, rgba(94, 200, 229, .05), transparent 60%), radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,.7) 100%); }
.warp-ar[data-style=scifi] :is(.warp-ar-brief, .warp-ar-card, .warp-ar-stage) { border: 1px solid var(--ar-line); box-shadow: none;
  clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px); }
.warp-ar[data-style=scifi] :is(.warp-ar-brief, .warp-ar-card)::before { content: ""; position: absolute; inset: 0; pointer-events: none; z-index: 3;
  background:
    linear-gradient(var(--ar-ac), var(--ar-ac)) 16px 0 / 48px 2px no-repeat,
    linear-gradient(var(--ar-ac), var(--ar-ac)) right 16px bottom 0 / 48px 2px no-repeat,
    linear-gradient(135deg, transparent 10.5px, var(--ar-ac) 10.5px 12px, transparent 12px) 0 0 / 16px 16px no-repeat,
    linear-gradient(-45deg, transparent 10.5px, var(--ar-ac) 10.5px 12px, transparent 12px) 100% 100% / 16px 16px no-repeat; }
.warp-ar[data-style=scifi] .warp-ar-kicker { font-family: var(--ar-num); font-size: 11px; letter-spacing: .08em; color: var(--ar-ac); font-weight: 500; }
.warp-ar[data-style=scifi] .warp-ar-kicker::before { content: "// "; opacity: .6; }
.warp-ar[data-style=scifi] .warp-ar-label { font-family: var(--ar-num); font-weight: 500; letter-spacing: .12em; color: var(--ar-dim); }
.warp-ar[data-style=scifi] .warp-ar-brief-title h1, .warp-ar[data-style=scifi] .warp-ar-card h2 { font-weight: 600; text-transform: uppercase; letter-spacing: .1em; }
.warp-ar[data-style=scifi] .warp-ar-badge { border-radius: 0; background: transparent; color: var(--ar-ac); box-shadow: inset 0 0 0 1px var(--ar-ac); clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); }
.warp-ar[data-style=scifi] .warp-ar-badge::after { content: ""; position: absolute; inset: 6px; border: 1px dashed rgba(94, 200, 229, .35); }
.warp-ar[data-style=scifi] .warp-ar-odds b { font-family: var(--ar-num); font-weight: 600; color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-btn { border-radius: 0; font-family: var(--ar-display); text-transform: uppercase; letter-spacing: .12em; font-size: 13px; clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); }
.warp-ar[data-style=scifi] .warp-ar-btn.primary { background: rgba(94, 200, 229, .14); color: var(--ar-ac); border-color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-btn.primary:hover:not(:disabled) { background: var(--ar-ac); color: var(--ar-on-ac); }
.warp-ar[data-style=scifi] .warp-ar-btn.ghost:hover:not(:disabled) { border-color: var(--ar-line); }
.warp-ar[data-style=scifi] .warp-ar-x { border-radius: 0; }
.warp-ar[data-style=scifi] .warp-ar-switch button { border-radius: 0; font-family: var(--ar-num); font-size: 12px; }
.warp-ar[data-style=scifi] .warp-ar-switch button[aria-selected=true] { background: rgba(94, 200, 229, .14); color: var(--ar-ac); border-color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-need-track { border-radius: 0; height: 10px; background: repeating-linear-gradient(90deg, rgba(120,170,210,.16) 0 6px, transparent 6px 8px); }
.warp-ar[data-style=scifi] .warp-ar-need-track .z { -webkit-mask: repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 8px); mask: repeating-linear-gradient(90deg, #000 0 6px, transparent 6px 8px); }
.warp-ar[data-style=scifi] .warp-ar-need-legend { font-family: var(--ar-num); font-size: 11.5px; }
.warp-ar[data-style=scifi] .warp-ar-need-legend i { border-radius: 0; }
.warp-ar[data-style=scifi] .warp-ar-aid { border-radius: 0; background: transparent; font-family: var(--ar-num); font-size: 11.5px; }
.warp-ar[data-style=scifi] .warp-ar-aid.perk b { color: var(--ar-ac2); }
.warp-ar[data-style=scifi] .warp-ar-how { list-style: "▸  "; }
.warp-ar[data-style=scifi] .warp-ar-how li::marker { color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-keys { font-family: var(--ar-num); }
.warp-ar[data-style=scifi] .warp-ar-song { border-radius: 0; }
.warp-ar[data-style=scifi] .warp-ar-song.on { border-color: var(--ar-ac); background: rgba(94, 200, 229, .07); }
.warp-ar[data-style=scifi] .warp-ar-song-tier { font-family: var(--ar-num); font-weight: 500; }
.warp-ar[data-style=scifi] .warp-ar-chip { border-radius: 0; width: 76px; height: 44px; background: transparent; box-shadow: inset 0 0 0 1px var(--ar-line); clip-path: polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px); }
.warp-ar[data-style=scifi] .warp-ar-chip span { color: var(--ar-ink); font-family: var(--ar-num); }
.warp-ar[data-style=scifi] .warp-ar-chip.on { transform: none; background: rgba(94, 200, 229, .14); box-shadow: inset 0 0 0 1px var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-chip.on span { color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-title h1 { font-weight: 600; text-transform: uppercase; letter-spacing: .12em; font-size: 19px; }
.warp-ar[data-style=scifi] .warp-ar-title h1 small { font-family: var(--ar-num); text-transform: none; letter-spacing: 0; font-size: 11.5px; }
.warp-ar[data-style=scifi] .warp-ar-tool { border-radius: 0; background: transparent; }
.warp-ar[data-style=scifi] .warp-ar-lives { align-items: center; }
.warp-ar[data-style=scifi] .warp-ar-lives i { font-size: 0; width: 14px; height: 6px; background: var(--ar-line); }
.warp-ar[data-style=scifi] .warp-ar-lives i.on { background: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-stage { background: var(--ar-panel); }
.warp-ar[data-style=scifi] .warp-ar-gauge-num b { color: var(--ar-ac); font-weight: 600; }
.warp-ar[data-style=scifi] .warp-ar-gauge-num span { font-family: var(--ar-num); }
.warp-ar[data-style=scifi] .warp-ar-gauge-track { width: 12px; border-radius: 0; background: repeating-linear-gradient(0deg, rgba(120,170,210,.14) 0 5px, transparent 5px 7px); }
.warp-ar[data-style=scifi] .warp-ar-gauge-fill { border-radius: 0; -webkit-mask: repeating-linear-gradient(0deg, #000 0 5px, transparent 5px 7px); mask: repeating-linear-gradient(0deg, #000 0 5px, transparent 5px 7px); }
.warp-ar[data-style=scifi] .warp-ar-tick span { font-family: var(--ar-num); font-weight: 500; }
.warp-ar[data-style=scifi] .warp-ar-status { font-family: var(--ar-num); font-size: 11px; }
.warp-ar[data-style=scifi] .warp-ar-ban { border-radius: 0; background: rgba(11, 19, 29, .92); border: 1px solid currentColor; text-transform: uppercase; letter-spacing: .1em; font-weight: 600; box-shadow: none; clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px); }
.warp-ar[data-style=scifi] .warp-ar-count span { font-weight: 600; color: var(--ar-ac); }
.warp-ar[data-style=scifi] .warp-ar-stamp { font-weight: 600; text-transform: uppercase; letter-spacing: .14em; font-size: clamp(30px, 6vw, 44px); padding: 6px 18px; border-top: 1px solid currentColor; border-bottom: 1px solid currentColor; }
.warp-ar[data-style=scifi] .warp-ar-stamp::before { content: "OUTCOME // "; font-family: var(--ar-num); font-size: 11px; letter-spacing: .1em; display: block; opacity: .7; margin-bottom: 4px; }
.warp-ar[data-style=scifi] .warp-ar-big { font-weight: 600; }
.warp-ar[data-style=scifi] .warp-ar-beats li { border-radius: 0; font-family: var(--ar-num); font-size: 11.5px; }

/* ── phones ── */
@media (max-width: 720px) {
  .warp-ar-brief { width: 100%; max-height: 100%; border-radius: 0; align-self: stretch; }
  .warp-ar[data-style=scifi] .warp-ar-brief { clip-path: none; }
  .warp-ar-brief-head { grid-template-columns: auto minmax(0, 1fr); padding: calc(18px + env(safe-area-inset-top, 0px)) 52px 16px 16px; }
  .warp-ar-odds { grid-column: 1 / -1; flex-direction: row; align-items: baseline; gap: 10px; justify-content: flex-start; }
  .warp-ar-odds b { font-size: 22px; }
  .warp-ar-badge { width: 54px !important; height: 54px !important; }
  .warp-ar-brief-body, .warp-ar-brief-body:has(.warp-ar-col.songs) { grid-template-columns: minmax(0, 1fr); padding: 4px 16px 14px; gap: 6px; }
  .warp-ar-switch { padding: 10px 16px 0; }
  .warp-ar-brief-foot { padding: 12px 16px calc(14px + env(safe-area-inset-bottom, 0px)); }
  .warp-ar-brief-foot .warp-ar-btn { flex: 1; }
  .warp-ar-main, .warp-ar[data-style=medieval] .warp-ar-main { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; padding: 0 12px calc(10px + env(safe-area-inset-bottom, 0px)); gap: 10px; }
  .warp-ar-top { padding: calc(8px + env(safe-area-inset-top, 0px)) 12px 8px; }
  .warp-ar-title h1 { font-size: 18px; }
  .warp-ar-gauge { grid-template-rows: none; grid-template-columns: auto minmax(0, 1fr); align-items: center; padding: 0 6px 6px 4px; gap: 12px; }
  .warp-ar-gauge-num { flex-direction: row; gap: 6px; align-items: baseline; }
  .warp-ar-gauge-num b { font-size: 17px; }
  .warp-ar-gauge-track { width: 100% !important; height: 12px; min-height: 0; justify-self: stretch; margin-right: 0; }
  .warp-ar-gauge-fill { top: 0; bottom: 0; right: auto; height: 100%; width: var(--v, 0); transition: width 220ms; }
  .warp-ar-tick { left: var(--at); right: auto; top: -5px; bottom: -5px; width: 0; height: auto; border-top: 0 !important; border-left: 2px solid var(--ar-ink); }
  .warp-ar-tick span { right: auto; left: -14px; top: auto; bottom: calc(100% + 1px); font-size: 8.5px; }
  .warp-ar-tick.partial span { display: none; }
  .warp-ar-status { grid-column: 1 / -1; min-height: 0; max-width: none; white-space: normal; }
  .warp-ar-songs { max-height: none; overflow: visible; }
}
@media (prefers-reduced-motion: reduce) {
  .warp-ar, .warp-ar-brief, .warp-ar-ban, .warp-ar-count span, .warp-ar-stamp { animation: none !important; }
}
`;

// src/frontend.ts
var CLEANUP_KEY = "__warpCleanup";
var ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/></svg>`;
function store2(key, value) {
  try {
    if (value !== undefined)
      localStorage.setItem(`warp:${key}`, value);
    return localStorage.getItem(`warp:${key}`);
  } catch {
    return null;
  }
}
function setup(ctx) {
  const prev = globalThis[CLEANUP_KEY];
  if (typeof prev === "function")
    prev();
  const cleanups = [];
  cleanups.push(ctx.dom.addStyle(STYLES));
  cleanups.push(ctx.dom.addStyle(STAGE_STYLES));
  cleanups.push(ctx.dom.addStyle(FX_STYLES));
  cleanups.push(ctx.dom.addStyle(ARCADE_STYLES));
  cleanups.push(armAudio());
  let state = null;
  let settings = { ...DEFAULT_SETTINGS };
  let templates = [];
  let connections = [];
  let imageConnections = [];
  let jevKeySet = false;
  let builder = null;
  let exported = null;
  let bDraft = emptyDraft();
  let busy = { chatId: "", on: false, label: "" };
  let editingBar = null;
  let allocDraft = {};
  let drawerView = "sheet";
  let dateCat = null;
  let dgPick = null;
  const dgMates = new Set;
  const openSections = new Map;
  const send = (m) => ctx.sendToBackend(m);
  const chatId = () => {
    try {
      return ctx.getActiveChat().chatId ?? null;
    } catch {
      return null;
    }
  };
  const tab = ctx.ui.registerDrawerTab({
    id: "warp",
    title: "Warp — game state",
    shortName: "Warp",
    headerTitle: "Warp",
    description: "Stats, dice, inventory, people and game settings",
    keywords: ["stats", "dice", "game", "ruleset", "rpg", "tracker"],
    iconSvg: ICON
  });
  cleanups.push(() => tab.destroy());
  const drawerRoot = document.createElement("div");
  drawerRoot.className = "warp-root";
  tab.root.appendChild(drawerRoot);
  cleanups.push(tab.onActivate(() => renderDrawer()));
  const narrow = () => window.innerWidth < 760;
  const viewport = () => {
    try {
      return ctx.ui.geometry?.layoutViewportSize() ?? { width: window.innerWidth, height: window.innerHeight };
    } catch {
      return { width: window.innerWidth, height: window.innerHeight };
    }
  };
  let overlayOpen = store2("overlayOpen") !== null ? store2("overlayOpen") === "1" : !narrow();
  const savedEdge = store2("overlayEdge");
  let edge = savedEdge === "left" || savedEdge === "right" || savedEdge === "top" || savedEdge === "bottom" ? savedEdge : null;
  let overlay = null;
  const overlayEl = document.createElement("div");
  overlayEl.className = "warp-overlay";
  overlayEl.innerHTML = `<div class="warp-overlay-head" title="Drag to move · drop on a screen edge to attach"></div><div class="warp-overlay-body warp-root"></div>`;
  const headEl = overlayEl.firstElementChild;
  const dockRoot = overlayEl.lastElementChild;
  dockRoot.addEventListener("pointerdown", (e) => {
    if (!e.target.closest?.("input, select, textarea"))
      e.preventDefault();
    panels.startSectionDrag(e, null);
  });
  let cur = { x: 0, y: 72, w: PILL.w, h: PILL.h };
  try {
    const vp = viewport();
    const w = overlayOpen ? PANEL_W : PILL.w;
    const h = overlayOpen ? 420 : PILL.h;
    const start = edge ? attachedBox(edge, overlayOpen, vp) : { x: Math.max(PAD, vp.width - w - 20), y: 72, w, h };
    overlay = ctx.ui.createFloatWidget({
      width: start.w,
      height: start.h,
      initialPosition: { x: start.x, y: start.y },
      snapToEdge: false,
      tooltip: "Warp",
      chromeless: true
    });
    overlay.root.appendChild(overlayEl);
    overlay.setVisible(false);
    cur = start;
    cleanups.push(() => overlay?.destroy());
  } catch {
    overlay = null;
  }
  const stageEl = document.createElement("div");
  stageEl.className = "warp-stage";
  stageEl.innerHTML = `<div class="warp-stage-scene"></div>
    <section class="warp-stage-story" aria-label="The story">
      <div class="warp-stage-story-head"><span class="warp-stage-speaker"></span><button class="warp-stage-fold" type="button" data-stage-fold title="Fold the story" aria-label="Fold the story">▾</button></div>
      <div class="warp-stage-story-body"><div class="warp-stage-said"></div><div class="warp-stage-text" aria-live="polite"></div><div class="warp-stage-status"></div></div>
      <form class="warp-stage-say"><textarea rows="1" placeholder="Say or do something…" aria-label="Your line" enterkeyhint="send"></textarea><button type="submit" class="warp-stage-btn primary">Send</button></form>
    </section>`;
  const sceneEl = stageEl.querySelector(".warp-stage-scene");
  const storyEl = stageEl.querySelector(".warp-stage-story");
  const storyBody = stageEl.querySelector(".warp-stage-story-body");
  const speakerEl = stageEl.querySelector(".warp-stage-speaker");
  const saidEl = stageEl.querySelector(".warp-stage-said");
  const textEl = stageEl.querySelector(".warp-stage-text");
  const statusEl = stageEl.querySelector(".warp-stage-status");
  const sayForm = stageEl.querySelector(".warp-stage-say");
  const sayInput = sayForm.querySelector("textarea");
  const sayButton = sayForm.querySelector("button");
  let stage = null;
  try {
    stage = ctx.ui.createFloatWidget({ fullscreen: true, chromeless: true, snapToEdge: false });
    stage.root.appendChild(stageEl);
    stage.setVisible(false);
    cleanups.push(() => stage?.destroy());
  } catch {
    stage = null;
  }
  stageEl.addEventListener("contextmenu", (e) => e.stopPropagation());
  let arcadeWidget = null;
  const arcadeEl = document.createElement("div");
  arcadeEl.className = "warp-arcade-host";
  arcadeEl.style.cssText = "position:absolute;inset:0";
  arcadeEl.addEventListener("contextmenu", (e) => e.stopPropagation());
  const arcade = createArcade({
    surface: () => {
      try {
        if (!arcadeWidget) {
          arcadeWidget = ctx.ui.createFloatWidget({ fullscreen: true, chromeless: true, snapToEdge: false });
          arcadeWidget.root.appendChild(arcadeEl);
          cleanups.push(() => arcadeWidget?.destroy());
        }
        const w = arcadeWidget;
        return {
          root: arcadeEl,
          show: (on) => {
            w.setVisible(on);
            const host = w.root.parentElement?.parentElement;
            if (on && host instanceof HTMLElement)
              host.style.zIndex = "9994";
          }
        };
      } catch {
        return null;
      }
    },
    volume: () => settings.sfxVolume,
    sound: () => settings.sfx !== "off",
    reduced: () => settings.fx !== "full" || matchMedia("(prefers-reduced-motion: reduce)").matches,
    look: () => settings.look === "rulebook" ? null : settings.look
  });
  let stageOpen = false;
  let stageWantGate = false;
  let stageMode = null;
  let stageKey = "";
  let lingering = false;
  const stageDismissed = new Set;
  let reactionKey = null;
  let storyFolded = store2("storyFolded") === "1";
  storyEl.classList.toggle("folded", storyFolded);
  let shownScene = null;
  let sceneKey = "";
  let lineAt = 0;
  let shownLine = "";
  let skipLine = () => false;
  const stageVisible = () => !!stage?.isVisible();
  const panels = createPanels({
    ctx,
    viewport,
    main: () => overlay?.isVisible() ? { box: cur, el: overlayEl, open: overlayOpen } : null,
    shown: () => !!overlay && (!!state?.hud || state?.status.state === "broken") && !stageVisible(),
    wire: (body) => wirePanel(body),
    rememberSections: (root) => rememberSections(root),
    restoreSections: (root) => restoreSections(root),
    changed: () => {
      renderDock();
      fitOverlay();
    },
    load: () => store2("panels"),
    save: (v) => {
      store2("panels", v);
    }
  });
  cleanups.push(() => panels.destroy());
  function place(b) {
    if (!overlay)
      return;
    if (b.w !== cur.w || b.h !== cur.h)
      overlay.setSize(b.w, b.h);
    const p = overlay.getPosition();
    if (p.x !== b.x || p.y !== b.y)
      overlay.moveTo(b.x, b.y);
    cur = b;
    panels.follow();
  }
  function resizeFloating(w, h) {
    if (!overlay)
      return;
    const p = overlay.getPosition();
    const rightAnchored = p.x + cur.w / 2 > viewport().width / 2;
    const x = rightAnchored ? Math.max(PAD, p.x + cur.w - w) : p.x;
    place({ x, y: p.y, w, h });
  }
  function fitOverlay() {
    if (!overlay)
      return;
    overlayEl.classList.toggle("warp-overlay-collapsed", !overlayOpen);
    overlayEl.dataset.edge = edge ?? "";
    const vp = viewport();
    if (edge) {
      const b = attachedBox(edge, overlayOpen, vp);
      overlayEl.style.setProperty("--warp-overlay-max", `${b.h - PILL.h}px`);
      place(b);
      return;
    }
    if (!overlayOpen) {
      resizeFloating(PILL.w, PILL.h);
      return;
    }
    const maxH = Math.max(240, vp.height - 140);
    overlayEl.style.setProperty("--warp-overlay-max", `${maxH - PILL.h}px`);
    requestAnimationFrame(() => resizeFloating(PANEL_W, Math.min(maxH, PILL.h + dockRoot.scrollHeight + 2)));
  }
  let dragStart = null;
  let pressAt = null;
  headEl.addEventListener("pointerdown", (e) => {
    if (!overlay || e.button !== 0)
      return;
    pressAt = { x: e.clientX, y: e.clientY };
    dragStart = overlay.getPosition();
    mainDrag = true;
  });
  let mainDrag = false;
  let followFrame = 0;
  const onPointerMove = (e) => {
    if (mainDrag && overlay && !followFrame && panels.hasPanels()) {
      followFrame = requestAnimationFrame(() => {
        followFrame = 0;
        if (!overlay || !mainDrag)
          return;
        const p = overlay.getPosition();
        cur = { ...cur, x: p.x, y: p.y };
        panels.follow();
      });
    }
    if (!pressAt || !overlay)
      return;
    if (Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) < 4)
      return;
    pressAt = null;
    if (edge) {
      edge = null;
      store2("overlayEdge", "");
      overlayEl.dataset.edge = "";
      const w = overlayOpen ? PANEL_W : PILL.w;
      const h = overlayOpen ? Math.min(420, cur.h) : PILL.h;
      overlay.setSize(w, h);
      cur = { ...cur, w, h };
    }
  };
  const onPointerUp = () => {
    pressAt = null;
    mainDrag = false;
  };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  cleanups.push(() => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  });
  if (overlay) {
    cleanups.push(overlay.onDragEnd((pos) => {
      const from = dragStart ?? pos;
      dragStart = null;
      mainDrag = false;
      cur = { ...cur, x: pos.x, y: pos.y };
      edge = edgeForDrop(from, cur, viewport());
      store2("overlayEdge", edge ?? "");
      renderHead();
      fitOverlay();
    }));
  }
  const onResize = () => {
    if (overlay?.isVisible())
      fitOverlay();
  };
  window.addEventListener("resize", onResize);
  cleanups.push(() => window.removeEventListener("resize", onResize));
  function syncDockVisibility() {
    if (!overlay)
      return;
    const show = (!!state?.hud || state?.status.state === "broken") && !stageVisible();
    if (show !== overlay.isVisible())
      overlay.setVisible(show);
    if (show)
      fitOverlay();
    panels.sync();
  }
  function renderHead() {
    const h = state?.hud;
    const clock = h?.clock ? `${h.clock.time}` : "";
    const worst = h?.bars.find((b) => b.tone === "bad") ?? h?.bars.find((b) => b.tone === "warn");
    const dot = `<span class="warp-dot warp-bg-${worst?.tone ?? "good"}" title="${esc(worst ? `${worst.label}: ${worst.text ?? worst.display}` : "All good")}"></span>`;
    const where = overlayOpen && h?.location ? ` <span class="warp-dim">· ${esc(h.location.name)}</span>` : "";
    headEl.innerHTML = `
      <span class="warp-overlay-title">\uD83C\uDFB2 ${clock ? `<b>${esc(clock)}</b>` : "Warp"}${where}</span>
      ${dot}
      <span class="warp-overlay-actions">
        ${stageMode && !stageVisible() ? `<button class="warp-btn warp-btn-ghost" data-open-stage title="Back to the ${stageMode === "date" ? "date" : "dungeon"}" aria-label="Back to the ${stageMode === "date" ? "date" : "dungeon"}">${stageMode === "date" ? "\uD83D\uDCAC" : "⚔"}</button>` : ""}
        ${overlayOpen && edge ? `<button class="warp-btn warp-btn-ghost" data-detach title="Float" aria-label="Detach">⇱</button>` : ""}
        ${overlayOpen ? `<button class="warp-btn warp-btn-ghost" data-open-sheet title="Open full sheet" aria-label="Open full sheet">⤢</button>` : ""}
        <button class="warp-btn warp-btn-ghost" data-toggle-overlay title="${overlayOpen ? "Collapse" : "Expand"}" aria-label="${overlayOpen ? "Collapse" : "Expand"}">${overlayOpen ? "–" : "+"}</button>
      </span>`;
  }
  headEl.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-open-sheet]")) {
      drawerView = "sheet";
      tab.activate();
      return;
    }
    if (t.closest("[data-open-stage]")) {
      openStage();
      return;
    }
    if (t.closest("[data-detach]")) {
      const vp = viewport();
      edge = null;
      store2("overlayEdge", "");
      place({ x: Math.max(PAD, vp.width - PANEL_W - 40), y: 72, w: PANEL_W, h: Math.min(420, cur.h) });
      renderHead();
      fitOverlay();
      return;
    }
    if (t.closest("[data-toggle-overlay]") || !overlayOpen) {
      overlayOpen = !overlayOpen;
      store2("overlayOpen", overlayOpen ? "1" : "0");
      renderHead();
      fitOverlay();
      panels.sync();
    }
  });
  function rememberSections(root) {
    root.querySelectorAll("details[data-section]").forEach((d) => openSections.set(d.dataset.section, d.open));
  }
  function restoreSections(root) {
    root.querySelectorAll("details[data-section]").forEach((d) => {
      const v = openSections.get(d.dataset.section);
      if (v !== undefined)
        d.open = v;
    });
  }
  let lastBars = new Map;
  function flashChangedBars(root) {
    if (!state?.hud)
      return;
    for (const b of state.hud.bars) {
      const prevV = lastBars.get(b.id);
      if (prevV !== undefined && Math.abs(prevV - b.value) > 0.5)
        root.querySelector(`[data-bar="${CSS.escape(b.id)}"]`)?.classList.add("warp-changed");
    }
  }
  function renderDock() {
    if (!overlay)
      return;
    renderHead();
    rememberSections(dockRoot);
    const kept = dockRoot.scrollTop;
    if (state?.hud) {
      const { head, parts } = hudParts(state.hud, { editing: editingBar, compact: true, map: state.map, alloc: allocDraft });
      const mine = parts.filter((p) => panels.inMain(p.id));
      dockRoot.innerHTML = historyNotice() + head + mine.map((p) => renderPart(p, true)).join("");
      panels.render(parts);
    } else if (state?.status.state === "broken") {
      dockRoot.innerHTML = renderRulesetCard(state.status, true);
      panels.render([]);
    } else {
      dockRoot.innerHTML = "";
      panels.render([]);
    }
    restoreSections(dockRoot);
    restoreMaps(dockRoot);
    dockRoot.scrollTop = kept;
    flashChangedBars(dockRoot);
  }
  function historyNotice() {
    return state?.historyConflict ? `<div class="warp-card"><h3>History changed</h3><p>Earlier messages or rules changed. Later results are paused. Keep their recorded outcomes, or discard those results and replay from the changed turn. Your chat text stays in place.</p><button class="warp-btn" data-history="keep">Keep recorded outcomes</button> <button class="warp-btn" data-history="discard">Discard affected results</button></div>` : "";
  }
  const reconcileClick = (e) => {
    const button = e.target.closest("[data-history]");
    const id = chatId();
    if (button && id)
      send({ type: "reconcile_history", chatId: id, keep: button.dataset.history === "keep" });
  };
  dockRoot.addEventListener("click", reconcileClick);
  drawerRoot.addEventListener("click", reconcileClick);
  cleanups.push(() => dockRoot.removeEventListener("click", reconcileClick));
  cleanups.push(() => drawerRoot.removeEventListener("click", reconcileClick));
  function renderDrawer() {
    rememberSections(drawerRoot);
    const hasChat = !!state?.chatId;
    const status = state?.status ?? { state: "none", name: null, source: null, issues: [], characterName: null, cardKind: "character", tags: [] };
    const views = [
      ["sheet", "Sheet"],
      ...state?.hud ? [["journal", "Journal"]] : [],
      ...state?.date ? [["date", state.date.session ? "Dating \uD83D\uDCAC" : "Dating"]] : [],
      ...state?.dungeon || state?.dungeonEntries?.length ? [["dungeon", state?.dungeon ? "Dungeon ⚔" : "Dungeon"]] : [],
      ["rules", `Ruleset${status.issues.some((i) => i.level === "error") ? " ⚠" : ""}`],
      ["settings", "Settings"]
    ];
    if (!views.some(([v]) => v === drawerView))
      drawerView = "sheet";
    const tabs = `<div class="warp-tabs" role="tablist">
      ${views.map(([v, label]) => `<button class="warp-tab" role="tab" data-view="${v}" aria-selected="${drawerView === v}">${label}</button>`).join("")}
    </div>`;
    let body = "";
    if (drawerView === "sheet") {
      body = state?.hud ? renderHud(state.hud, { editing: editingBar, compact: false, map: state.map, alloc: allocDraft }) : renderRulesetCard(status, hasChat);
    } else if (drawerView === "date") {
      body = renderDate(state?.date ?? null, { cat: dateCat, busy: busy.on && busy.chatId === state?.chatId });
    } else if (drawerView === "dungeon") {
      const isBusy = busy.on && busy.chatId === state?.chatId;
      body = renderDungeon(state?.dungeon ?? null, state?.dungeonEntries ?? [], { pick: dgPick, mates: dgMates, busy: isBusy });
    } else if (drawerView === "journal") {
      body = renderJournal(state?.hud ?? null, state?.records ?? []);
    } else if (drawerView === "rules" && builder) {
      body = renderBuilder(builder, bDraft, templates, connections, status.state !== "none");
    } else if (drawerView === "rules") {
      body = renderBuilderCta(status.state !== "none", hasChat, exported) + renderRulesetCard(status, hasChat) + renderDepthCard(status) + `<div class="warp-card"><h3>Writing rules</h3><p>Rules live in entries titled <b>warp-ruleset · …</b> (or any lorebook named <b>warp-ruleset</b>). Each entry is YAML; entries merge together. Warp keeps them out of the prompt automatically.</p></div>`;
    } else {
      body = renderSettings(settings, state?.status ?? null, connections, jevKeySet, imageConnections);
    }
    drawerRoot.innerHTML = tabs + historyNotice() + body;
    restoreSections(drawerRoot);
    restoreMaps(drawerRoot);
    flashChangedBars(drawerRoot);
    tab.setBadge(status.issues.some((i) => i.level === "error") ? "!" : null);
  }
  let choicesEl = null;
  let choicesFor = null;
  let choicesHtml = "";
  const chipEls = new Map;
  const wantChips = new Map;
  function messageSlot(messageId) {
    const row = ctx.dom.findMessageElement(messageId);
    if (!row)
      return null;
    const card = row.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
    return card ? { target: card, position: "afterend" } : { target: row, position: "beforeend" };
  }
  function healPlacement() {
    const fix = (el, id) => {
      if (!el?.isConnected || !id)
        return;
      const slot = messageSlot(id);
      if (slot?.position === "afterend" && slot.target.contains(el))
        slot.target.after(el);
    };
    for (const [id, { el }] of chipEls)
      fix(el, id);
    fix(choicesEl, choicesFor);
    const chips = choicesFor ? chipEls.get(choicesFor)?.el : null;
    if (chips?.isConnected && choicesEl?.isConnected && chips.parentElement === choicesEl.parentElement && chips.nextElementSibling !== choicesEl)
      chips.after(choicesEl);
  }
  function injectChips(messageId, html) {
    const slot = messageSlot(messageId);
    if (!slot)
      return false;
    const el = ctx.dom.inject(slot.target, `<div class="warp-chips" data-warp-chips="${messageId}">${html}</div>`, slot.position);
    chipEls.set(messageId, { el, html });
    return true;
  }
  function liveLog() {
    const anchor = state?.choicesAnchor;
    if (!anchor || !state?.hud?.encounter)
      return null;
    return (state.encounterLogs ?? []).find((l) => l.messageId === anchor && l.status !== "ended" && l.rounds.length) ?? null;
  }
  function placeChoices(force = false) {
    const anchor = state?.choicesAnchor ?? null;
    const isBusy = busy.on && busy.chatId === state?.chatId;
    const live = liveLog();
    const recap = live ? { foe: live.foe, rounds: live.rounds, why: renderWhyFold(state?.records.find((r) => r.messageId === live.messageId)) } : null;
    const html = settings.enabled && state?.hud && anchor ? renderChoices(state.choices, { minigames: settings.minigames, showOdds: settings.showOdds, hotkeys: settings.hotkeys, busy: isBusy, busyLabel: busy.label || undefined, encounter: state.hud.encounter, recap }) : "";
    if (!force && anchor === choicesFor && html === choicesHtml && choicesEl?.isConnected)
      return;
    if (choicesEl) {
      ctx.dom.uninject(choicesEl);
      choicesEl = null;
    }
    choicesFor = anchor;
    choicesHtml = html;
    if (!anchor || !html)
      return;
    const slot = messageSlot(anchor);
    if (!slot)
      return;
    choicesEl = ctx.dom.inject(slot.target, `<div class="warp-choices${isBusy ? " warp-busy" : ""}">${html}</div>`, slot.position);
    healPlacement();
  }
  function reconcileMessages() {
    const records = state?.records ?? [];
    wantChips.clear();
    if (settings.enabled) {
      const logs = new Map((state?.encounterLogs ?? []).map((l) => [l.messageId, l]));
      for (const r of records) {
        if (logs.has(r.messageId))
          continue;
        const html = renderChips(r, { showDice: settings.showDiceChips });
        if (html)
          wantChips.set(r.messageId, html);
      }
      for (const s of state?.suggestions ?? [])
        wantChips.set(s.messageId, (wantChips.get(s.messageId) ?? "") + renderSuggestion(s));
      const live = liveLog();
      for (const log of state?.encounterLogs ?? []) {
        if (log === live)
          continue;
        const html = renderEncounterLog(log, renderWhyFold(records.find((r) => r.messageId === log.messageId)));
        if (html)
          wantChips.set(log.messageId, (wantChips.get(log.messageId) ?? "") + html);
      }
    }
    let anchorTouched = false;
    for (const [id, cur] of chipEls) {
      if (wantChips.get(id) !== cur.html) {
        ctx.dom.uninject(cur.el);
        chipEls.delete(id);
        if (id === choicesFor)
          anchorTouched = true;
      }
    }
    for (const [id, html] of wantChips) {
      if (chipEls.has(id))
        continue;
      if (injectChips(id, html) && id === state?.choicesAnchor)
        anchorTouched = true;
    }
    placeChoices(anchorTouched);
  }
  let mo = null;
  let moTimer = null;
  const pendingCheck = () => {
    moTimer = null;
    let touched = false;
    for (const [id, html] of wantChips)
      if (!chipEls.has(id) && injectChips(id, html))
        touched = touched || id === state?.choicesAnchor;
    if (touched || choicesFor && choicesHtml && !choicesEl?.isConnected)
      placeChoices(true);
    healPlacement();
  };
  try {
    mo = new MutationObserver(() => {
      if (!moTimer)
        moTimer = setTimeout(pendingCheck, 200);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    cleanups.push(() => {
      mo?.disconnect();
      if (moTimer)
        clearTimeout(moTimer);
    });
  } catch {}
  const cue = connectCue({
    act: (id) => act(id),
    chatId,
    imageResult: (result) => send({ type: "cue_image_result", chatId: result.chatId, result }),
    imageFit: (id, fit) => send({ type: "cue_image_fit", chatId: id, fit })
  });
  cleanups.push(() => cue.destroy());
  function syncCue() {
    cue.update({ state, enabled: settings.enabled, imagesEnabled: settings.dateImages, showOdds: settings.showOdds, busy: busy.on && busy.chatId === state?.chatId, busyLabel: busy.label });
  }
  function raiseStage() {
    const host = stage?.root.parentElement?.parentElement;
    if (host instanceof HTMLElement)
      host.style.zIndex = "9992";
  }
  function syncStage() {
    const mode = settings.enabled ? stageModeOf(state, stageWantGate) : null;
    const key = mode ? `${state?.chatId}:${mode}` : "";
    if (key !== stageKey) {
      const sameChat = !!stageKey && stageKey.startsWith(`${state?.chatId}:`);
      if (stageKey)
        stageDismissed.delete(stageKey);
      stageKey = key;
      reactionKey = null;
      if (mode) {
        lingering = false;
        stageMode = mode;
        if (!stageDismissed.has(key))
          stageOpen = true;
      } else if (sameChat && stageVisible() && stageMode && stageMode !== "gate") {
        lingering = true;
        sceneEl.insertAdjacentHTML("beforeend", `<div class="warp-stage-ended"><div><div class="warp-stage-kicker">${stageMode === "date" ? "The date is over" : "Out of the dungeon"}</div><button class="warp-stage-btn primary" data-stage-close>Back to the chat</button></div></div>`);
      } else {
        stageOpen = false;
        stageMode = null;
        stageWantGate = false;
        lingering = false;
      }
      stageEl.dataset.mode = stageMode === "date" ? "date" : stageMode ? "dungeon" : "";
      stageEl.dataset.view = stageMode ?? "";
    }
    const show = !!stage && stageOpen && (!!mode || lingering);
    if (show !== stageVisible()) {
      stage?.setVisible(show);
      if (show) {
        raiseStage();
        requestAnimationFrame(() => requestAnimationFrame(raiseStage));
      }
    }
    if (show)
      renderStageScene();
  }
  function openStage() {
    if (!stage) {
      openDungeonDrawer();
      return;
    }
    if (stageKey)
      stageDismissed.delete(stageKey);
    stageOpen = true;
    syncStage();
    syncDockVisibility();
    renderHead();
  }
  function closeStage() {
    if (stageKey)
      stageDismissed.add(stageKey);
    stageOpen = false;
    if (lingering) {
      lingering = false;
      stageMode = null;
      stageWantGate = false;
      stageKey = "";
    }
    if (stageMode === "gate") {
      stageWantGate = false;
      stageMode = null;
      stageKey = "";
    }
    stage?.setVisible(false);
    syncDockVisibility();
    renderHead();
  }
  function renderStageScene() {
    if (!state || !stageMode || lingering || !stageVisible()) {
      renderStory();
      return;
    }
    const isBusy = busy.on && busy.chatId === state.chatId;
    const sess = state.date?.session;
    const rk = sess?.last ? `${sess.who}|${sess.last.label}|${sess.last.reaction}|${sess.fatigue}` : "";
    const fresh = reactionKey !== null && rk !== "" && rk !== reactionKey;
    reactionKey = rk;
    dressStage(stageEl, settings.look === "rulebook" ? state.look ?? "modern" : settings.look);
    replaceStageScene(sceneEl, renderStage(state, stageMode, { pick: dgPick, mates: dgMates, busy: isBusy, cat: dateCat, freshReaction: fresh }));
    renderStory();
  }
  function renderStory() {
    if (!stageVisible())
      return;
    if (state?.scene)
      shownScene = state.scene;
    else if (!lingering)
      shownScene = null;
    const sc = shownScene;
    const key = sc ? `${sc.kind}:${sc.seq}` : "";
    if (key !== sceneKey) {
      sceneKey = key;
      lineAt = 0;
    }
    const lines = sc?.lines ?? [];
    const line = lines[Math.min(lineAt, Math.max(0, lines.length - 1))];
    const writing = !!sc?.writing || busy.on && busy.chatId === state?.chatId;
    speakerEl.textContent = line?.speaker ?? "";
    storyEl.classList.toggle("narration", !!line && !line.speaker);
    const said = sc?.said?.replace(/\*/g, "").trim();
    saidEl.innerHTML = said && lineAt === 0 ? `<span>You</span>${esc(said.length > 280 ? `${said.slice(0, 280)}…` : said)}` : "";
    const lineKey = `${sceneKey}:${lineAt}:${line?.text.length ?? 0}`;
    if (lineKey !== shownLine) {
      shownLine = lineKey;
      skipLine();
      textEl.innerHTML = line ? formatStory(line.text) : "";
      skipLine = line && settings.fx === "full" ? typewrite(textEl) : () => false;
    }
    const more = lineAt < lines.length - 1;
    storyEl.classList.toggle("more", more && !writing);
    statusEl.innerHTML = writing ? `<span class="warp-stage-dots" aria-hidden="true"><i></i><i></i><i></i></span>` : more ? `<span class="warp-stage-next">${lineAt + 1} / ${lines.length} · click to continue ▸</span>` : "";
    sayButton.disabled = writing;
  }
  function nextLine() {
    if (skipLine())
      return true;
    const n = shownScene?.lines.length ?? 0;
    if (lineAt >= n - 1)
      return false;
    lineAt += 1;
    renderStory();
    return true;
  }
  storyBody.addEventListener("click", () => {
    nextLine();
  });
  try {
    const ro = new ResizeObserver(() => stageEl.style.setProperty("--warp-story-h", `${storyEl.offsetHeight}px`));
    ro.observe(storyEl);
    cleanups.push(() => ro.disconnect());
  } catch {}
  function growSay() {
    sayInput.style.height = "auto";
    sayInput.style.height = `${Math.min(120, sayInput.scrollHeight)}px`;
  }
  function sendLine() {
    const text = sayInput.value.trim();
    const cid = chatId();
    if (!text || !cid || busy.on && busy.chatId === cid)
      return;
    send({ type: "say", chatId: cid, text });
    sayInput.value = "";
    growSay();
    lockUntilReply(cid);
  }
  stageEl.addEventListener("click", (e) => {
    if (e.target.closest("[data-date-image-retry]")) {
      const id = chatId();
      if (id)
        send({ type: "retry_date_image", chatId: id });
      return;
    }
    const t = e.target;
    if (t.closest("[data-stage-close]")) {
      closeStage();
      return;
    }
    if (t.closest("[data-stage-fold]")) {
      storyFolded = !storyFolded;
      store2("storyFolded", storyFolded ? "1" : "0");
      storyEl.classList.toggle("folded", storyFolded);
      return;
    }
    if (onDungeonClick(t))
      return;
    const dateCatEl = t.closest("[data-date-cat]");
    if (dateCatEl) {
      dateCat = dateCatEl.dataset.dateCat;
      renderPick();
      return;
    }
    const dateAct = t.closest("[data-date-act]");
    if (dateAct && !dateAct.disabled)
      act(dateAct.dataset.dateAct);
  });
  stageEl.addEventListener("change", (e) => onPanelChange(e));
  sayForm.addEventListener("submit", (e) => {
    e.preventDefault();
    sendLine();
  });
  sayInput.addEventListener("input", growSay);
  sayInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendLine();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeStage();
    }
  });
  const onStageKey = (e) => {
    if (!stageVisible() || e.ctrlKey || e.metaKey || e.altKey)
      return;
    const a = document.activeElement;
    if (a && a !== document.body && !stageEl.contains(a))
      return;
    if (a instanceof HTMLTextAreaElement || a instanceof HTMLInputElement)
      return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeStage();
      return;
    }
    if ((e.key === " " || e.key === "Enter") && !(a instanceof HTMLButtonElement) && nextLine()) {
      e.preventDefault();
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      const btn = sceneEl.querySelector(`.warp-stage-menu-col [data-key="${e.key}"]`);
      if (btn && !btn.disabled) {
        e.preventDefault();
        btn.click();
      }
    }
  };
  document.addEventListener("keydown", onStageKey);
  cleanups.push(() => document.removeEventListener("keydown", onStageKey));
  function renderPick() {
    renderDrawer();
    renderStageScene();
  }
  function renderAll() {
    renderDock();
    renderDrawer();
    reconcileMessages();
    syncStage();
    syncDockVisibility();
    syncCue();
    if (state?.hud)
      lastBars = new Map(state.hud.bars.map((b) => [b.id, b.value]));
  }
  function openPicker() {
    const id = chatId();
    if (!id)
      return;
    const modal = ctx.ui.showModal({ title: "Add a Warp ruleset", width: 520, maxHeight: 640 });
    modal.root.innerHTML = renderTemplatePicker(templates, state?.status.characterName ? { name: state.status.characterName, track: state.status.cardKind !== "scenario" } : null);
    modal.root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-template]");
      if (!btn)
        return;
      if (btn.dataset.template === "__ai") {
        drawerView = "rules";
        tab.activate();
        send({ type: "builder_open", chatId: id, mode: "build" });
      } else {
        const track = modal.root.querySelector("[data-track]");
        send({ type: "install_template", chatId: id, templateId: btn.dataset.template, ...track ? { trackCharacter: track.checked } : {} });
      }
      modal.dismiss();
    });
  }
  async function confirmReplace() {
    if (state?.status.state === "none")
      return openPicker();
    const res = await ctx.ui.showConfirm({
      title: "Add another ruleset?",
      message: "This character already has warp-ruleset entries. A new template is added as another lorebook and merged with the existing rules — remove the old lorebook if you want a clean start.",
      confirmLabel: "Choose a template",
      variant: "warning"
    });
    if (res.confirmed)
      openPicker();
  }
  function builderAnswers() {
    const out = {};
    for (const r of builder?.rounds ?? [])
      for (const q of r.questions) {
        const v = bDraft.answers[q.id] ?? r.answers[q.id] ?? q.default;
        if (v !== undefined)
          out[q.id] = v;
      }
    return out;
  }
  function currentAnswer(id) {
    for (const r of builder?.rounds ?? [])
      for (const q of r.questions)
        if (q.id === id)
          return bDraft.answers[id] ?? r.answers[id] ?? q.default;
    return;
  }
  function onBuilderClick(t) {
    const opt = t.closest("[data-bq-opt]");
    if (opt) {
      const id = opt.dataset.bq, v = opt.dataset.bqOpt;
      if (opt.dataset.bqKind === "multi") {
        const cur = currentAnswer(id);
        const set = new Set(Array.isArray(cur) ? cur : []);
        if (set.has(v))
          set.delete(v);
        else
          set.add(v);
        bDraft.answers[id] = [...set];
      } else
        bDraft.answers[id] = v;
      renderDrawer();
      return true;
    }
    const seg = t.closest('[data-bset="creative"]');
    if (seg) {
      bDraft.creative = seg.dataset.v === "1";
      renderDrawer();
      return true;
    }
    const eff = t.closest('[data-bset="effort"]');
    if (eff) {
      bDraft.effort = eff.dataset.v === "quick" ? "quick" : "thorough";
      renderDrawer();
      return true;
    }
    const b = t.closest("[data-b]");
    if (!b)
      return false;
    const cid = chatId();
    if (!cid)
      return true;
    switch (b.dataset.b) {
      case "open-build":
        drawerView = "rules";
        send({ type: "builder_open", chatId: cid, mode: "build" });
        break;
      case "import": {
        const text = drawerRoot.querySelector("[data-import-text]")?.value ?? "";
        if (!text.trim()) {
          const ta = drawerRoot.querySelector("[data-import-text]");
          if (ta) {
            ta.placeholder = "Paste a rulebook (YAML) here, or choose a file first.";
            ta.focus();
          }
          break;
        }
        drawerView = "rules";
        send({ type: "builder_import", chatId: cid, text });
        break;
      }
      case "export":
        send({ type: "export_rulebook", chatId: cid });
        break;
      case "export-close":
        exported = null;
        renderDrawer();
        break;
      case "export-copy": {
        const ta = drawerRoot.querySelector("[data-export-text]");
        if (!ta)
          break;
        navigator.clipboard?.writeText(ta.value).then(() => {
          b.textContent = "Copied ✓";
        }, () => {
          ta.select();
          b.textContent = "Press Ctrl+C";
        });
        break;
      }
      case "export-save": {
        if (!exported)
          break;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([exported.text], { type: "text/yaml" }));
        a.download = `${(b.dataset.name || "rulebook").replace(/[^\w -]+/g, "").trim() || "rulebook"}.warp.yaml`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        break;
      }
      case "open-refine":
        drawerView = "rules";
        send({ type: "builder_open", chatId: cid, mode: "refine" });
        break;
      case "open-deepen":
        drawerView = "rules";
        tab.activate();
        send({ type: "builder_open", chatId: cid, mode: "deepen" });
        break;
      case "deepen":
        send({ type: "builder_deepen", chatId: cid });
        break;
      case "revisit-waivers":
        send({ type: "builder_deepen", chatId: cid, revisitWaivers: true });
        break;
      case "start":
        send({ type: "builder_start", chatId: cid, connectionId: bDraft.connectionId, creative: bDraft.creative, base: bDraft.base || undefined, effort: bDraft.effort });
        break;
      case "more":
      case "build":
        send({ type: "builder_answer", chatId: cid, answers: builderAnswers(), additions: bDraft.additions, more: b.dataset.b === "more" });
        break;
      case "back":
        send({ type: "builder_back", chatId: cid });
        break;
      case "close":
        (async () => {
          if (builder && builder.step !== "done" && builder.step !== "start") {
            const res = await ctx.ui.showConfirm({ title: "Close the builder?", message: "The draft is discarded. Your current ruleset isn't touched.", confirmLabel: "Discard draft", variant: "warning" });
            if (!res.confirmed)
              return;
          }
          send({ type: "builder_close", chatId: cid });
        })();
        break;
      case "install":
        (async () => {
          if (b.dataset.replacing === "1" && builder?.mode === "build") {
            const res = await ctx.ui.showConfirm({ title: "Replace the current ruleset?", message: "The character's existing warp-ruleset sections are overwritten with this draft. Game state already recorded in chats is kept.", confirmLabel: "Replace", variant: "warning" });
            if (!res.confirmed)
              return;
          }
          send({ type: "builder_install", chatId: cid });
        })();
        break;
      case "refine":
        if (bDraft.refine.trim()) {
          send({ type: "builder_refine", chatId: cid, request: bDraft.refine.trim() });
          bDraft.refine = "";
        }
        break;
      case "chip":
        bDraft.refine = b.dataset.text ?? "";
        renderDrawer();
        break;
      case "fix":
        send({ type: "builder_fix", chatId: cid, warning: b.dataset.w });
        break;
      case "redo": {
        const part = b.dataset.part;
        send({ type: "builder_redo", chatId: cid, part, note: bDraft.notes[part] || undefined });
        delete bDraft.notes[part];
        break;
      }
      case "add-row":
        bDraft.additions.push({ name: "", kind: "skill", note: "" });
        renderDrawer();
        break;
      case "add-remove":
        bDraft.additions.splice(Number(b.dataset.i), 1);
        renderDrawer();
        break;
      default:
        return false;
    }
    return true;
  }
  function onBuilderInput(t) {
    if (t.dataset.bq && (t.dataset.bqKind === "text" || t.dataset.bqKind === "scale")) {
      bDraft.answers[t.dataset.bq] = t.dataset.bqKind === "scale" ? Number(t.value) : t.value;
      return true;
    }
    if (t.dataset.badd !== undefined) {
      const row = bDraft.additions[Number(t.dataset.badd)];
      const field = t.dataset.baddField;
      if (row)
        row[field] = t.value;
      return true;
    }
    if (t.dataset.bnote) {
      bDraft.notes[t.dataset.bnote] = t.value;
      return true;
    }
    if (t.dataset.brefine !== undefined) {
      bDraft.refine = t.value;
      return true;
    }
    if (t.dataset.bset === "base") {
      bDraft.base = t.value;
      return true;
    }
    if (t.dataset.bset === "connectionId") {
      bDraft.connectionId = t.value;
      return true;
    }
    return false;
  }
  function onPanelClick(e) {
    const t = e.target;
    if (t.closest("[data-jev-openrouter]")) {
      send({ type: "settings", patch: { ...OPENROUTER_JEV } });
      return;
    }
    const view = t.closest("[data-view]");
    if (view) {
      drawerView = view.dataset.view;
      renderDrawer();
      return;
    }
    if (onBuilderClick(t))
      return;
    if (onDungeonClick(t))
      return;
    const dateCatEl = t.closest("[data-date-cat]");
    if (dateCatEl) {
      dateCat = dateCatEl.dataset.dateCat;
      renderDrawer();
      return;
    }
    const dateAct = t.closest("[data-date-act]");
    if (dateAct) {
      if (!dateAct.disabled)
        act(dateAct.dataset.dateAct);
      return;
    }
    const runBtn = t.closest("[data-run]");
    if (runBtn) {
      act(runBtn.dataset.run);
      return;
    }
    const go = t.closest("[data-go]");
    if (go) {
      act(`go:${go.dataset.go}`);
      return;
    }
    const jump = t.closest("[data-jump]");
    if (jump) {
      const el = ctx.dom.findMessageElement(jump.dataset.jump);
      if (el)
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      else
        jump.setAttribute("title", "That message isn't loaded — scroll up in the chat to find it.");
      return;
    }
    const use = t.closest("[data-use]");
    if (use) {
      if (!use.disabled)
        act(use.dataset.use);
      return;
    }
    const sure = t.closest("[data-confirm-use]");
    if (sure) {
      if (sure.dataset.armed) {
        act(sure.dataset.confirmUse);
        return;
      }
      sure.dataset.armed = "1";
      sure.textContent = "Really? Tap again";
      sure.classList.add("warp-btn-danger");
      setTimeout(() => {
        if (sure.isConnected) {
          delete sure.dataset.armed;
          sure.textContent = "Give up";
          sure.classList.remove("warp-btn-danger");
        }
      }, 4000);
      return;
    }
    const allocAdd = t.closest("[data-alloc-add]");
    const allocSub = t.closest("[data-alloc-sub]");
    if (allocAdd || allocSub) {
      const id = (allocAdd ?? allocSub).dataset[allocAdd ? "allocAdd" : "allocSub"];
      const n = Math.max(0, (allocDraft[id] ?? 0) + (allocAdd ? 1 : -1));
      allocDraft = { ...allocDraft, [id]: n };
      if (!n)
        delete allocDraft[id];
      renderDock();
      renderDrawer();
      return;
    }
    if (t.closest("[data-alloc-clear]")) {
      allocDraft = {};
      renderDock();
      renderDrawer();
      return;
    }
    if (t.closest("[data-alloc-confirm]")) {
      const cid = chatId();
      if (cid && Object.keys(allocDraft).length)
        send({ type: "allocate", chatId: cid, spend: allocDraft });
      allocDraft = {};
      return;
    }
    const perk = t.closest("[data-buy-perk]");
    if (perk) {
      const cid = chatId();
      if (cid)
        send({ type: "buy_perk", chatId: cid, perk: perk.dataset.buyPerk });
      return;
    }
    if (t.closest("[data-install]")) {
      confirmReplace();
      return;
    }
    if (t.closest("[data-theme-dating]")) {
      const cid = chatId();
      if (cid)
        send({ type: "theme_dating", chatId: cid });
      return;
    }
    if (t.closest("[data-draft-items]")) {
      const cid = chatId();
      if (cid)
        send({ type: "draft_item_uses", chatId: cid });
      return;
    }
    if (t.closest("[data-reload]")) {
      send({ type: "reload", chatId: chatId() });
      return;
    }
    const save = t.closest("[data-save]");
    if (save) {
      const id = save.dataset.save;
      const input = save.parentElement?.querySelector(`[data-num]`);
      const v = Number(input?.value);
      const cid = chatId();
      if (cid && Number.isFinite(v))
        send({ type: "adjust", chatId: cid, stat: id, value: v });
      editingBar = null;
      return;
    }
    const saveRel = t.closest("[data-save-rel]");
    if (saveRel) {
      const [who, stat] = saveRel.dataset.saveRel.split(":");
      const v = Number(saveRel.parentElement?.querySelector("[data-num]")?.value);
      const cid = chatId();
      if (cid && Number.isFinite(v))
        send({ type: "adjust_rel", chatId: cid, who, stat, value: v });
      editingBar = null;
      return;
    }
    if (t.closest(".warp-bar-edit"))
      return;
    const bar = t.closest("[data-bar]");
    if (bar) {
      editingBar = editingBar === bar.dataset.bar ? null : bar.dataset.bar;
      renderDock();
      renderDrawer();
      return;
    }
    const rel = t.closest("[data-rel]");
    if (rel) {
      const k = `rel:${rel.dataset.rel}`;
      editingBar = editingBar === k ? null : k;
      renderDock();
      renderDrawer();
      return;
    }
    const forget = t.closest("[data-forget]");
    if (forget) {
      const cid = chatId();
      const who = forget.dataset.forget;
      ctx.ui.showConfirm({
        title: `Stop tracking ${forget.dataset.name}?`,
        message: "They're removed from People and relationships. If the story brings them back, they're tracked again from scratch.",
        confirmLabel: "Forget",
        variant: "warning"
      }).then((res) => {
        if (res.confirmed && cid)
          send({ type: "forget", chatId: cid, who });
      });
      return;
    }
    if (t.closest("[data-save-jev]")) {
      const input = drawerRoot.querySelector("[data-jevkey]");
      if (input?.value.trim()) {
        send({ type: "set_jev_key", key: input.value.trim() });
        input.value = "";
      }
      return;
    }
    if (t.closest("[data-clear-jev]")) {
      send({ type: "set_jev_key", key: "" });
      return;
    }
    if (t.closest("[data-test-decider]")) {
      send({ type: "test_decider" });
      return;
    }
    const tag = t.closest("[data-tag]");
    if (tag) {
      const name = tag.dataset.tag;
      const mode = tag.dataset.mode;
      const lines = settings.lines.filter((x) => x !== name);
      const veils = settings.veils.filter((x) => x !== name);
      if (mode === "on")
        veils.push(name);
      else if (mode === "veil")
        lines.push(name);
      send({ type: "settings", patch: { lines, veils } });
    }
  }
  function dg(op) {
    const cid = chatId();
    if (!cid)
      return;
    dgPick = null;
    send({ type: "dungeon", chatId: cid, ...op });
  }
  function openDungeonDrawer() {
    drawerView = state?.date?.session && !state.dungeon ? "date" : "dungeon";
    tab.activate();
    renderDrawer();
  }
  function openDungeon() {
    if (!stage) {
      openDungeonDrawer();
      return;
    }
    if (!state?.dungeon)
      stageWantGate = true;
    openStage();
  }
  async function confirmLeave() {
    const res = await ctx.ui.showConfirm({
      title: "Leave the dungeon?",
      message: "The party climbs back out and keeps everything found so far.",
      confirmLabel: "Leave",
      variant: "info"
    });
    if (res.confirmed)
      dg({ op: "leave" });
  }
  function onDungeonClick(t) {
    const el = t.closest("[data-dg-move],[data-dg-choose],[data-dg-skill],[data-dg-item],[data-dg-target],[data-dg-escape],[data-dg-auto],[data-dg-descend],[data-dg-leave],[data-dg-buy],[data-dg-use],[data-dg-enter],[data-dg-cancel]");
    if (!el || el.disabled)
      return !!el;
    const d = el.dataset;
    const v = state?.dungeon;
    if (d.dgMove) {
      const [x, y] = d.dgMove.split(",").map(Number);
      dg({ op: "move", x, y });
      return true;
    }
    if (d.dgChoose) {
      dg({ op: "choose", choice: d.dgChoose });
      return true;
    }
    if (d.dgCancel !== undefined) {
      dgPick = null;
      renderPick();
      return true;
    }
    if (d.dgSkill) {
      const target = d.dgSkillTarget;
      const foes = v?.battle?.fighters.filter((f) => f.side === "foe" && f.alive) ?? [];
      if (target === "foe" && foes.length > 1) {
        dgPick = { kind: "skill", id: d.dgSkill, target: "foe" };
        renderPick();
        return true;
      }
      if (target === "ally") {
        dgPick = { kind: "skill", id: d.dgSkill, target: "ally" };
        renderPick();
        return true;
      }
      dg({ op: "battle", skill: d.dgSkill, target: foes[0]?.id });
      return true;
    }
    if (d.dgItem) {
      if (d.dgItem === "bomb") {
        dg({ op: "battle", item: "bomb" });
        return true;
      }
      dgPick = { kind: "item", id: d.dgItem, target: "ally" };
      renderPick();
      return true;
    }
    if (d.dgUse) {
      dgPick = { kind: "use", id: d.dgUse, target: "ally" };
      renderPick();
      return true;
    }
    if (d.dgTarget && dgPick) {
      const p = dgPick;
      if (p.kind === "skill")
        dg({ op: "battle", skill: p.id, target: d.dgTarget });
      else if (p.kind === "item")
        dg({ op: "battle", item: p.id, target: d.dgTarget });
      else
        dg({ op: "use", item: p.id, target: d.dgTarget });
      return true;
    }
    if (d.dgEscape !== undefined) {
      dg({ op: "battle", escape: true });
      return true;
    }
    if (d.dgAuto) {
      dg({ op: "battle", auto: d.dgAuto });
      return true;
    }
    if (d.dgDescend !== undefined) {
      dg({ op: "descend" });
      return true;
    }
    if (d.dgLeave !== undefined) {
      confirmLeave();
      return true;
    }
    if (d.dgBuy) {
      dg({ op: "buy", item: d.dgBuy });
      return true;
    }
    if (d.dgEnter) {
      const entry = state?.dungeonEntries.find((e) => e.id === d.dgEnter);
      const mates = [...dgMates].filter((m) => entry?.companions.some((c) => c.id === m));
      dg({ op: "enter", id: d.dgEnter, companions: mates });
      dgMates.clear();
      return true;
    }
    return true;
  }
  function onPanelInput(e) {
    const t = e.target;
    if (onBuilderInput(t))
      return;
    if (t.dataset.range) {
      const num = t.parentElement?.querySelector("[data-num]");
      if (num)
        num.value = t.value;
    } else if (t.dataset.num) {
      const range = t.parentElement?.querySelector("[data-range]");
      if (range)
        range.value = t.value;
    }
  }
  function onPanelChange(e) {
    const t = e.target;
    if (onBuilderInput(t))
      return;
    if ("importFile" in t.dataset) {
      const file = t.files?.[0];
      if (file)
        file.text().then((text) => {
          const ta = drawerRoot.querySelector("[data-import-text]");
          if (ta)
            ta.value = text;
        });
      return;
    }
    if (t.dataset.dgMate) {
      if (t.checked)
        dgMates.add(t.dataset.dgMate);
      else
        dgMates.delete(t.dataset.dgMate);
      renderPick();
      return;
    }
    if (t.dataset.wearSlot) {
      const cid = chatId();
      if (cid && t.value)
        send({ type: "wear", chatId: cid, slot: t.dataset.wearSlot, item: t.value === "__off" ? null : t.value });
      return;
    }
    if (t.dataset.settingVolume !== undefined) {
      const v = Number(t.value) / 100;
      setVolume(v);
      play("heart");
      send({ type: "settings", patch: { sfxVolume: v } });
      return;
    }
    const pctKey = t.dataset.settingPct;
    if (pctKey) {
      let v = Number(t.value) / 100;
      if (pctKey === "askConfidence")
        v = Math.min(v, settings.autoConfidence - 0.01);
      else
        v = Math.max(v, settings.askConfidence + 0.01);
      send({ type: "settings", patch: { [pctKey]: v } });
      return;
    }
    const key = t.dataset.setting;
    if (!key)
      return;
    const value = t instanceof HTMLInputElement && t.type === "checkbox" ? t.checked : t.value;
    send({ type: "settings", patch: { [key]: value } });
  }
  function onPanelKey(e) {
    const t = e.target;
    if (e.key === "Enter" && t.dataset.newtag !== undefined && t.value.trim()) {
      send({ type: "settings", patch: { veils: [...settings.veils, t.value.trim().toLowerCase()] } });
      t.value = "";
    }
  }
  function wirePanel(root) {
    root.addEventListener("click", onPanelClick);
    root.addEventListener("input", onPanelInput);
    root.addEventListener("change", onPanelChange);
    root.addEventListener("keydown", onPanelKey);
    root.addEventListener("toggle", () => rememberSections(root), true);
  }
  for (const root of [drawerRoot, dockRoot]) {
    wirePanel(root);
    cleanups.push(wireMaps(root));
  }
  function act(actionId, params) {
    if (actionId === "date:open") {
      if (stage && state?.date?.session)
        openStage();
      else {
        drawerView = "date";
        tab.activate();
        renderDrawer();
      }
      return;
    }
    if (actionId.startsWith("run:") && actionId !== "run:epilogue") {
      confirmRun(actionId);
      return;
    }
    if (actionId.startsWith("dungeon:")) {
      if (actionId === "dungeon:leave")
        confirmLeave();
      else
        openDungeon();
      return;
    }
    const cid = chatId();
    if (!cid || busy.on && busy.chatId === cid)
      return;
    if (arcade.busy())
      return;
    if (!params && automaticChallenge(settings.minigames, state?.choices.find((c) => c.id === actionId))) {
      playChoice(actionId, true);
      return;
    }
    send({ type: "act", chatId: cid, actionId, ...params ? { params } : {} });
    lockUntilReply(cid);
  }
  async function playChoice(actionId, auto = false) {
    const cid = chatId();
    const snapshot = state;
    const choice = snapshot && playableChoice(snapshot.choices, actionId);
    if (!cid || snapshot?.chatId !== cid || !choice || settings.minigames === "off" || arcade.busy() || busy.on && busy.chatId === cid)
      return;
    const out = await arcade.run(choice, auto);
    if (out.kind === "cancel" || !acceptsArcadeResult(snapshot, state, cid, chatId(), busy.on && busy.chatId === cid))
      return;
    send({ type: "act", chatId: cid, actionId: choice.id, ...out.kind === "played" ? { game: out.result } : out.params ? { params: out.params } : {} });
    lockUntilReply(cid);
  }
  function lockUntilReply(cid) {
    busy = { chatId: cid, on: true, label: "Rolling…" };
    placeChoices(true);
    syncCue();
    renderStageScene();
    setTimeout(() => {
      if (busy.on && busy.label === "Rolling…" && busy.chatId === cid) {
        busy = { chatId: "", on: false, label: "" };
        placeChoices(true);
        syncCue();
        renderStageScene();
      }
    }, 15000);
  }
  async function confirmRun(actionId) {
    const cid = chatId();
    if (!cid)
      return;
    const [, op, slot] = actionId.split(":");
    const run = state?.hud?.run;
    if (op === "load" || op === "restart") {
      const res = await ctx.ui.showConfirm({
        title: op === "load" ? "Rewind to this save?" : "Start over?",
        message: op === "load" ? `The game rewinds to ${slot === "start" ? "the very beginning" : slot === "auto" ? "the autosave" : `slot ${slot}`}. The chat keeps its messages; the next reply picks up from the rewind. Kept: ${run?.keeps ?? "nothing"}.` : `A new playthrough from the beginning. Carried over: ${run?.legacy ?? "nothing"}.`,
        confirmLabel: op === "load" ? "Rewind" : "Start over",
        variant: "warning"
      });
      if (!res.confirmed)
        return;
    }
    send({ type: "run", chatId: cid, op, ...slot ? { slot } : {} });
  }
  async function confirmRedo(btn) {
    const cid = chatId();
    const userMessageId = btn.dataset.redo;
    if (!cid || !userMessageId)
      return;
    const actionId = btn.dataset.redoAction || null;
    let params;
    try {
      params = btn.dataset.redoParams ? JSON.parse(btn.dataset.redoParams) : undefined;
    } catch {
      params = undefined;
    }
    const res = await ctx.ui.showConfirm({
      title: actionId ? "Roll for it?" : "Redo without a roll?",
      message: actionId ? "The reply to your message is replaced with a new one where the dice decide." : "The reply to your message is replaced with a new one, treating your message as plain roleplay (no check).",
      confirmLabel: actionId ? "Roll it" : "Redo turn",
      variant: "info"
    });
    if (!res.confirmed)
      return;
    busy = { chatId: cid, on: true, label: "Rolling…" };
    placeChoices(true);
    send({ type: "redo", chatId: cid, userMessageId, actionId, params });
  }
  const onDocClick = (e) => {
    const t = e.target;
    if (!t?.closest)
      return;
    const resistance = t.closest(".warp-choices [data-resist-action]");
    if (resistance) {
      e.preventDefault();
      if (!resistance.disabled)
        act(resistance.dataset.resistAction, { mind_resist: resistance.dataset.resistId });
      return;
    }
    const challenge = t.closest(".warp-choices [data-play-challenge]");
    if (challenge) {
      e.preventDefault();
      if (!challenge.disabled)
        playChoice(challenge.dataset.playChallenge);
      return;
    }
    const choice = t.closest(".warp-choices [data-act]");
    if (choice) {
      e.preventDefault();
      if (!choice.disabled)
        act(choice.dataset.act);
      return;
    }
    if (t.closest(".warp-choices [data-enc-send]")) {
      e.preventDefault();
      sendEncounterLine(t.closest(".warp-choices")?.querySelector("[data-enc-say]") ?? null);
      return;
    }
    const dice = t.closest(".warp-chips [data-dice]");
    if (dice) {
      const row = dice.closest(".warp-chips");
      if (row.hasAttribute("data-open"))
        row.removeAttribute("data-open");
      else
        row.setAttribute("data-open", "");
      return;
    }
    const why = t.closest(".warp-chips [data-why]");
    if (why) {
      const row = why.closest(".warp-chips");
      if (row.hasAttribute("data-why-open"))
        row.removeAttribute("data-why-open");
      else
        row.setAttribute("data-why-open", "");
      return;
    }
    const redo = t.closest(".warp-chips [data-redo]");
    if (redo) {
      e.preventDefault();
      confirmRedo(redo);
      return;
    }
    const dismiss = t.closest(".warp-chips [data-dismiss-suggest]");
    if (dismiss) {
      const cid = chatId();
      if (cid)
        send({ type: "dismiss_suggestion", chatId: cid, messageId: dismiss.dataset.dismissSuggest });
      return;
    }
    const undo = t.closest(".warp-chips [data-undo]");
    if (undo) {
      const row = undo.closest("[data-warp-chips]");
      const messageId = row?.dataset.warpChips;
      const rec = state?.records.find((r) => r.messageId === messageId);
      const cid = chatId();
      if (rec && cid)
        send({ type: "undo", chatId: cid, messageId: rec.messageId, swipe: rec.swipe, events: undo.dataset.undo.split(",").map(Number) });
    }
  };
  document.addEventListener("click", onDocClick, true);
  cleanups.push(() => document.removeEventListener("click", onDocClick, true));
  function sendEncounterLine(input) {
    const text = input?.value.trim();
    const cid = chatId();
    if (!input || !text || !cid || busy.on && busy.chatId === cid)
      return;
    send({ type: "say", chatId: cid, text });
    input.value = "";
    lockUntilReply(cid);
  }
  const onEncKey = (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement) || !t.matches(".warp-choices [data-enc-say]"))
      return;
    e.stopPropagation();
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      sendEncounterLine(t);
    }
  };
  document.addEventListener("keydown", onEncKey, true);
  cleanups.push(() => document.removeEventListener("keydown", onEncKey, true));
  const onKey = (e) => {
    if (!settings.hotkeys || e.ctrlKey || e.metaKey || e.altKey || stageVisible())
      return;
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))
      return;
    if (!/^[0-9]$/.test(e.key) || !state?.choices.length || !choicesEl?.isConnected)
      return;
    const n = e.key === "0" ? 10 : Number(e.key);
    const c = state.choices[n - 1];
    if (!c)
      return;
    e.preventDefault();
    act(c.id);
  };
  document.addEventListener("keydown", onKey);
  cleanups.push(() => document.removeEventListener("keydown", onKey));
  cleanups.push(ctx.onBackendMessage((raw) => {
    const m = raw;
    if (!acceptsResponse(m, chatId(), state))
      return;
    switch (m.type) {
      case "state": {
        if (state?.chatId !== m.chatId) {
          editingBar = null;
          lastBars = new Map;
          allocDraft = {};
        }
        const entered = !state?.dungeon && !!m.dungeon && state?.chatId === m.chatId;
        if (!m.dungeon?.battle)
          dgPick = dgPick?.kind === "use" ? dgPick : null;
        const fx = settings.enabled ? fxEvents(state, m) : [];
        state = m;
        if (entered)
          drawerView = "dungeon";
        if (m.chatId === busy.chatId && !m.busy && busy.label === "Rolling…")
          busy = { chatId: "", on: false, label: "" };
        if (m.busy && m.chatId)
          busy = { chatId: m.chatId, on: true, label: busy.label };
        renderAll();
        if (fx.length)
          requestAnimationFrame(() => playFx(fx, { fx: settings.fx, sfx: settings.sfx, stage: stageEl, message: (id) => ctx.dom.findMessageElement(id) }));
        break;
      }
      case "busy":
        busy = { chatId: m.chatId, on: m.busy, label: m.busy ? m.label ?? busy.label ?? "" : "" };
        placeChoices(true);
        syncCue();
        renderStageScene();
        break;
      case "builder": {
        const prev = builder;
        builder = m.session;
        if (!builder || !prev || prev.characterId !== builder.characterId || prev.mode !== builder.mode || prev.step !== builder.step && builder.step === "start") {
          const keep = { creative: bDraft.creative, connectionId: bDraft.connectionId, effort: bDraft.effort };
          bDraft = { ...emptyDraft(), ...keep, ...builder ? { additions: builder.additions.map((a) => ({ ...a })) } : {} };
        }
        if (builder && prev?.step !== builder.step)
          bDraft.notes = {};
        renderDrawer();
        break;
      }
      case "settings":
        settings = m.settings;
        setVolume(settings.sfxVolume);
        templates = m.templates;
        connections = m.connections;
        imageConnections = m.imageConnections ?? [];
        jevKeySet = m.jevKeySet;
        renderAll();
        break;
      case "command":
        if (m.command === "install")
          confirmReplace();
        else if (m.command === "dungeon")
          openDungeon();
        else {
          drawerView = "sheet";
          tab.activate();
        }
        break;
      case "rulebook_export":
        exported = { name: m.name, text: m.text };
        drawerView = "rules";
        renderDrawer();
        break;
      case "toast":
        console.info(`[warp] ${m.message}`);
        break;
    }
  }));
  send({ type: "hello", chatId: chatId() });
  let lastChat = chatId();
  const poll = setInterval(() => {
    const now = chatId();
    if (now !== lastChat) {
      lastChat = now;
      state = null;
      builder = null;
      busy = { chatId: "", on: false, label: "" };
      renderAll();
      send({ type: "refresh", chatId: now });
    }
  }, 1000);
  cleanups.push(() => clearInterval(poll));
  const cleanup = () => {
    for (const { el } of chipEls.values())
      ctx.dom.uninject(el);
    if (choicesEl)
      ctx.dom.uninject(choicesEl);
    for (const c of cleanups.reverse()) {
      try {
        c();
      } catch {}
    }
  };
  globalThis[CLEANUP_KEY] = cleanup;
  return cleanup;
}
export {
  setup
};
