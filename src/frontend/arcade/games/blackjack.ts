// Blackjack: a few hands against the dealer from a six-deck shoe. Bet, then hit,
// stand or double. Harder checks get a sharper dealer (hits soft 17, blackjack pays
// 6:5); aids let you see the hole card, get a whispered read, or take back a bust.

import { clamp, shuffle, type GameDef, type Kit } from "../kit.js";
import { backing } from "../synth.js";
import { withMusic } from "../kit.js";

type Card = { r: number; s: number };
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0, aces = 0;
  for (const c of cards) { const v = c.r === 0 ? 11 : Math.min(10, c.r + 1); total += v; if (c.r === 0) aces++; }
  while (total > 21 && aces) { total -= 10; aces--; }
  return { total, soft: aces > 0 };
}

/** Basic strategy, simplified (no splits): what a careful player would do. */
export function advice(player: Card[], dealerUp: Card, canDouble: boolean): "hit" | "stand" | "double" {
  const { total, soft } = handValue(player);
  const d = dealerUp.r === 0 ? 11 : Math.min(10, dealerUp.r + 1);
  if (soft) {
    if (total >= 19) return "stand";
    if (total === 18) return d >= 9 ? "hit" : canDouble && d >= 3 && d <= 6 ? "double" : "stand";
    return canDouble && d >= 4 && d <= 6 ? "double" : "hit";
  }
  if (total >= 17) return "stand";
  if (total >= 13) return d <= 6 ? "stand" : "hit";
  if (total === 12) return d >= 4 && d <= 6 ? "stand" : "hit";
  if (total === 11) return canDouble ? "double" : "hit";
  if (total === 10) return canDouble && d <= 9 ? "double" : "hit";
  if (total === 9) return canDouble && d >= 3 && d <= 6 ? "double" : "hit";
  return "hit";
}

const CSS = `
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

export const BLACKJACK: GameDef = {
  id: "blackjack",
  title: "Blackjack",
  howTo: [
    "Pick a bet, then get closer to 21 than the dealer without going over.",
    "Hit for another card, Stand to stop, Double to double the bet for exactly one more card.",
    "Aces count 1 or 11; face cards 10. Blackjack (an ace and a ten) pays extra.",
  ],
  controls: "H hit · S stand · D double · Enter deal · 1–3 bet size",
  start(kit: Kit) {
    const L = kit.play.level;
    const gamble = kit.play.mode === "gamble";
    const start = gamble ? kit.play.stake! : 100;
    const hands = gamble ? kit.play.rounds ?? 5 : 5;
    const edge = kit.play.edge ?? 0;
    const hitsSoft17 = gamble ? edge > 0.025 : L >= 0.45;
    const bjPays = (gamble ? edge > 0.045 : L >= 0.75) ? 1.2 : 1.5;
    const peek = kit.aid("peek") > 0;
    let reads = kit.aid("hint");
    const unit = Math.max(1, Math.round(start / 10));
    const betOptions = [unit, unit * 2, unit * 5];
    let bet = betOptions[1];
    let chips = start, hand = 0, phase: "bet" | "play" | "dealer" | "done" = "bet", over = false;
    let shoe: Card[] = [];
    let player: Card[] = [], dealer: Card[] = [], stake = 0, doubled = false;
    let wins = 0, losses = 0, pushes = 0, blackjacks = 0, busts = 0, saved = 0;
    let bestMoment = "";
    const fill = () => { shoe = shuffle(Array.from({ length: 312 }, (_, i) => ({ r: i % 13, s: Math.floor(i / 13) % 4 })), kit.rng); kit.synth.fx("shuffle"); };
    fill();
    const draw = () => { if (shoe.length < 20) fill(); return shoe.pop()!; };

    const root = document.createElement("div");
    root.className = "bj";
    root.dataset.style = kit.theme.style;
    root.innerHTML = `<style>${CSS}</style>
      <div class="bj-arc"><b>Blackjack pays ${bjPays === 1.5 ? "3 to 2" : "6 to 5"}</b>Dealer ${hitsSoft17 ? "hits" : "stands on"} soft 17</div>
      <div class="bj-side"><div class="bj-label">Dealer <span class="bj-total" data-dt></span></div><div class="bj-hand" data-dealer></div></div>
      <div class="bj-mid" data-msg></div>
      <div class="bj-side"><div class="bj-hand" data-player></div><div class="bj-label">You <span class="bj-total" data-pt></span></div></div>
      <div class="bj-bar" data-bar></div>`;
    kit.root.appendChild(root);
    const $ = (s: string) => root.querySelector<HTMLElement>(s)!;
    const size = () => { const r = root.getBoundingClientRect(); root.style.setProperty("--cw", `${Math.max(48, Math.min(104, Math.min(r.width / 7, r.height / 6.2)))}px`); };
    const ro = new ResizeObserver(size); ro.observe(root); size();

    const cardHtml = (c: Card, down = false) => {
      const red = c.s === 1 || c.s === 2;
      return `<div class="bj-card${down ? (peek ? " down peek" : " down") : ""}"><div class="bj-face${red ? " red" : ""}"><span class="c tl">${RANKS[c.r]}<i>${SUITS[c.s]}</i></span><span class="pip">${c.r >= 10 ? ["J", "Q", "K"][c.r - 10] : SUITS[c.s]}</span><span class="c br">${RANKS[c.r]}<i>${SUITS[c.s]}</i></span></div><div class="bj-back"></div></div>`;
    };
    const showHands = (hideHole: boolean) => {
      // Only new cards are dealt in; the hole card flips over in place.
      const put = (el: HTMLElement, cards: Card[], hide: number) => {
        while (el.children.length > cards.length) el.lastElementChild!.remove();
        for (let i = el.children.length; i < cards.length; i++) el.insertAdjacentHTML("beforeend", cardHtml(cards[i], i === hide));
        if (hide < 0) el.querySelectorAll(".bj-card.down").forEach((x) => x.classList.remove("down", "peek"));
      };
      put($("[data-dealer]"), dealer, hideHole ? 1 : -1);
      put($("[data-player]"), player, -1);
      const pv = handValue(player), dv = handValue(hideHole ? dealer.slice(0, 1) : dealer);
      const pt = $("[data-pt]"), dt = $("[data-dt]");
      pt.textContent = player.length ? `${pv.soft && pv.total < 21 ? "soft " : ""}${pv.total}` : "";
      pt.className = `bj-total${pv.total > 21 ? " bust" : pv.total === 21 && player.length === 2 ? " bj21" : ""}`;
      dt.textContent = dealer.length ? (hideHole ? `${dv.total}${peek ? ` · ${handValue(dealer).total}` : " + ?"}` : String(dv.total)) : "";
      dt.className = `bj-total${!hideHole && dv.total > 21 ? " bust" : ""}`;
    };
    const msg = (text: string, cls = "") => { $("[data-msg]").innerHTML = text ? `<div class="bj-msg ${cls}">${text}</div>` : ""; };
    const sync = () => {
      kit.chips(chips);
      if (!gamble) kit.track(clamp(chips / (start * 2)));
      kit.status(`Hand ${Math.min(hand + 1, hands)} of ${hands}\nChips ${Math.round(chips)}`);
    };
    const tip = () => (reads > 0 && phase === "play" ? advice(player, dealer[0], player.length === 2 && chips >= stake) : null);
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
      } else b.innerHTML = `<span class="bj-info">…</span>`;
    };

    const deal = () => {
      if (over || phase !== "bet" || bet > chips) return;
      stake = bet; chips -= stake; doubled = false;
      player = [draw(), draw()]; dealer = [draw(), draw()];
      $("[data-dealer]").innerHTML = ""; $("[data-player]").innerHTML = "";
      kit.synth.fx("card"); setTimeout(() => kit.synth.fx("card"), 120);
      phase = "play";
      msg("");
      showHands(true); sync();
      const pv = handValue(player).total, dv = handValue(dealer).total;
      if (pv === 21 || dv === 21) { setTimeout(() => settle(), 600); return; }
      bar();
    };
    const hit = () => {
      if (phase !== "play") return;
      if (reads > 0 && tip()) reads--;
      player.push(draw());
      kit.synth.fx("card");
      showHands(true);
      const v = handValue(player).total;
      if (v > 21) {
        if (kit.lives.spend("Took it back!")) { player.pop(); saved++; showHands(true); bar(); return; }
        busts++;
        settle();
        return;
      }
      if (v === 21) { stand(); return; }
      bar();
    };
    const stand = () => {
      if (phase !== "play") return;
      if (reads > 0 && tip()) reads--;
      phase = "dealer";
      bar();
      showHands(false);
      const step = () => {
        const d = handValue(dealer);
        if (d.total < 17 || (d.total === 17 && d.soft && hitsSoft17)) {
          dealer.push(draw()); kit.synth.fx("card"); showHands(false);
          setTimeout(step, 520);
        } else settle();
      };
      setTimeout(step, 520);
    };
    const double = () => {
      if (phase !== "play" || player.length !== 2 || chips < stake) return;
      if (reads > 0 && tip()) reads--;
      chips -= stake; stake *= 2; doubled = true;
      kit.synth.fx("chip");
      player.push(draw()); kit.synth.fx("card"); showHands(true);
      if (handValue(player).total > 21) {
        if (kit.lives.spend("Took it back!")) { player.pop(); saved++; showHands(true); stand(); return; }
        busts++; settle(); return;
      }
      stand();
    };
    const settle = () => {
      phase = "done";
      showHands(false);
      const p = handValue(player), d = handValue(dealer);
      const pBJ = p.total === 21 && player.length === 2, dBJ = d.total === 21 && dealer.length === 2;
      let won = 0, text = "", cls = "";
      if (p.total > 21) { text = "Bust"; cls = "lose"; losses++; }
      else if (pBJ && !dBJ) { won = stake + stake * bjPays; text = "Blackjack!"; cls = "win"; wins++; blackjacks++; bestMoment = "dealt a natural blackjack"; }
      else if (dBJ && !pBJ) { text = "Dealer blackjack"; cls = "lose"; losses++; }
      else if (d.total > 21) { won = stake * 2; text = "Dealer busts"; cls = "win"; wins++; }
      else if (p.total > d.total) { won = stake * 2; text = "You win"; cls = "win"; wins++; if (doubled) bestMoment = "doubled down and won"; }
      else if (p.total < d.total) { text = "Dealer wins"; cls = "lose"; losses++; }
      else { won = stake; text = "Push"; cls = "push"; pushes++; }
      chips += won;
      msg(`${text}${won > stake ? ` · +${Math.round(won - stake)}` : ""}`, cls);
      kit.synth.fx(cls === "win" ? (pBJ ? "jackpot" : "coins") : cls === "lose" ? "miss" : "click");
      if (cls === "win" && doubled) kit.banner("Doubled!", "gold");
      hand++;
      sync();
      setTimeout(() => {
        if (over) return;
        if (hand >= hands || chips < betOptions[0]) { finish(); return; }
        phase = "bet";
        if (bet > chips) bet = betOptions.filter((x) => x <= chips).pop() ?? betOptions[0];
        bar();
      }, 1300);
    };
    const finish = () => {
      if (over) return;
      over = true;
      const beats: string[] = [];
      if (wins > losses + 1) beats.push("the cards ran their way");
      else if (losses > wins + 1) beats.push("the cards went against them");
      else beats.push("a close-run thing at the table");
      if (bestMoment) beats.push(bestMoment);
      if (busts >= 2) beats.push("pushed their luck too far more than once");
      if (saved) beats.push("got away with a bad call");
      kit.finish({ chips, score: clamp(chips / (start * 2)), beats, detail: `${wins} won, ${losses} lost${pushes ? `, ${pushes} pushed` : ""}${blackjacks ? `, ${blackjacks} blackjack` : ""}` });
    };

    root.addEventListener("click", (e) => {
      if (kit.paused) return;
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLElement>("[data-bet]");
      if (b) { bet = Number(b.dataset.bet); kit.synth.fx("chip"); bar(); return; }
      if (t.closest("[data-deal]")) deal();
      else if (t.closest("[data-hit]")) hit();
      else if (t.closest("[data-stand]")) stand();
      else if (t.closest("[data-double]")) double();
      else if (t.closest("[data-leave]")) finish();
    });
    kit.onKey((e, down) => {
      if (!down || e.repeat) return false;
      const k = e.key.toLowerCase();
      if (k === "enter" || k === " ") { if (phase === "bet") deal(); return true; }
      if (k === "h") { hit(); return true; }
      if (k === "s") { stand(); return true; }
      if (k === "d") { double(); return true; }
      if (/^[1-3]$/.test(k) && phase === "bet") { const x = betOptions[Number(k) - 1]; if (x <= chips) { bet = x; kit.synth.fx("chip"); bar(); } return true; }
      return false;
    });
    withMusic(kit, () => backing(kit.synth, "lounge"));
    kit.onQuit(() => finish());
    bar(); sync();
    msg(`Place your bet`, "push");
    return () => { ro.disconnect(); root.remove(); };
  },
};
