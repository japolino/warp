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
.bj { position: absolute; inset: 0; display: grid; grid-template-rows: 1fr auto 1fr auto; padding: 18px 18px 14px; gap: 8px;
  background: radial-gradient(ellipse 90% 70% at 50% 40%, #14794f, #0b4a31 60%, #062a1c); color: #f7f1e1; overflow: hidden; }
.bj::before { content: ""; position: absolute; inset: 0; background-image: radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px); background-size: 5px 5px; pointer-events: none; }
.bj-arc { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); width: min(70%, 620px); text-align: center; font: 700 11px/1.6 "Bahnschrift", system-ui, sans-serif; letter-spacing: .3em; color: rgba(232, 195, 106, .55); text-transform: uppercase; pointer-events: none; }
.bj:has(.bj-msg) .bj-arc { opacity: .12; }
.bj-arc { transition: opacity .2s; }
.bj-arc b { display: block; font-size: 15px; letter-spacing: .24em; color: rgba(232, 195, 106, .75); }
.bj-side { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
.bj-label { font: 700 11px "Bahnschrift", system-ui, sans-serif; letter-spacing: .2em; text-transform: uppercase; color: rgba(247,241,225,.65); display: flex; gap: 10px; align-items: center; }
.bj-total { font: 800 15px ui-monospace, Consolas, monospace; padding: 2px 10px; border-radius: 999px; background: rgba(0,0,0,.35); color: #fff; letter-spacing: 0; }
.bj-total.bust { background: #b8323f; } .bj-total.bj21 { background: #e8c36a; color: #2a1d05; }
.bj-hand { display: flex; justify-content: center; min-height: calc(var(--cw) * 1.4); }
.bj-card { width: var(--cw); height: calc(var(--cw) * 1.4); margin-left: calc(var(--cw) * -0.38); border-radius: calc(var(--cw) * .09); position: relative; perspective: 600px; animation: bj-deal .38s cubic-bezier(.2,.9,.25,1) both; }
.bj-card:first-child { margin-left: 0; }
@keyframes bj-deal { from { transform: translate(40vw, -30vh) rotate(-30deg); opacity: 0; } }
.bj-face, .bj-back { position: absolute; inset: 0; border-radius: inherit; backface-visibility: hidden; transition: transform .45s cubic-bezier(.3,.7,.3,1); box-shadow: 0 6px 14px rgba(0,0,0,.4); }
.bj-face { background: linear-gradient(160deg, #fffdf6, #efe7d4); color: #1c1c22; display: grid; }
.bj-face.red { color: #c0243a; }
.bj-face .c { position: absolute; font: 800 calc(var(--cw) * .2)/1 "Georgia", serif; text-align: center; }
.bj-face .c.tl { top: 6%; left: 8%; } .bj-face .c.br { bottom: 6%; right: 8%; transform: rotate(180deg); }
.bj-face .c i { display: block; font-style: normal; font-size: .8em; }
.bj-face .pip { place-self: center; font-size: calc(var(--cw) * .5); line-height: 1; }
.bj-back { transform: rotateY(180deg); background: repeating-linear-gradient(45deg, #8c1d2c 0 6px, #a32436 6px 12px); border: 4px solid #f3ead4; }
.bj-card.down .bj-face { transform: rotateY(180deg); } .bj-card.down .bj-back { transform: rotateY(0); }
.bj-card.peek .bj-back { opacity: .3; }
.bj-card.peek .bj-face { transform: none; opacity: .85; outline: 2px dashed #e8c36a; }
.bj-mid { display: flex; justify-content: center; align-items: center; gap: 18px; min-height: 44px; position: relative; }
.bj-msg { font: 800 clamp(20px, 3.4vw, 30px) "Bahnschrift", system-ui, sans-serif; letter-spacing: .06em; text-transform: uppercase; text-shadow: 0 3px 12px rgba(0,0,0,.5); animation: bj-pop .4s cubic-bezier(.2,1.3,.4,1) both; }
@keyframes bj-pop { from { transform: scale(.6); opacity: 0; } }
.bj-msg.win { color: #ffe066; } .bj-msg.lose { color: #ff8a95; } .bj-msg.push { color: #cfe; }
.bj-bar { position: relative; display: flex; justify-content: center; align-items: center; gap: 10px; flex-wrap: wrap; }
.bj-btn { min-width: 96px; padding: 11px 16px; border-radius: 12px; border: 1px solid rgba(232,195,106,.45); background: rgba(0,0,0,.35); color: #f7f1e1; font: 700 14px "Bahnschrift", system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; cursor: pointer; transition: transform .1s, background .12s; }
.bj-btn:hover:not(:disabled) { background: rgba(232,195,106,.18); }
.bj-btn:disabled { opacity: .35; cursor: not-allowed; }
.bj-btn.main { background: linear-gradient(180deg, #f1d488, #c99a3d); color: #2a1d05; border-color: transparent; }
.bj-btn.tip { box-shadow: 0 0 0 2px #7cff9a, 0 0 18px rgba(124,255,154,.6); }
.bj-btn kbd { opacity: .55; font: 600 10px ui-monospace, monospace; margin-left: 6px; }
.bj-bets { display: flex; gap: 8px; align-items: center; }
.bj-chip { width: 52px; height: 52px; border-radius: 50%; border: 0; cursor: pointer; display: grid; place-items: center; font: 800 12px ui-monospace, monospace; color: #1b1b1b;
  background: radial-gradient(circle, #fff 0 36%, transparent 37%), repeating-conic-gradient(var(--chip) 0 22.5deg, #f6efe2 22.5deg 30deg); box-shadow: 0 4px 10px rgba(0,0,0,.45); transition: transform .12s; }
.bj-chip.on { transform: translateY(-5px); box-shadow: 0 0 0 3px #ffe066, 0 8px 18px rgba(0,0,0,.5); }
.bj-chip:disabled { opacity: .3; }
.bj-info { font: 600 12px ui-monospace, monospace; color: rgba(247,241,225,.75); }
.bj-tip { font: 600 12px system-ui, sans-serif; color: #b9ffcf; }
`;

export const BLACKJACK: GameDef = {
  id: "blackjack",
  title: "Blackjack",
  theme: { bg: "#06170f", bg2: "#0f4a31", accent: "#e8c36a", accent2: "#c0243a" },
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
        b.innerHTML = `<div class="bj-bets">${betOptions.map((x, i) => `<button class="bj-chip${x === bet ? " on" : ""}" style="--chip:${["#c0392b", "#1f6fbf", "#1d8f4e"][i]}" data-bet="${x}" ${x > chips ? "disabled" : ""}>${x}</button>`).join("")}</div>
          <button class="bj-btn main" data-deal ${bet > chips ? "disabled" : ""}>Deal <kbd>Enter</kbd></button>
          ${gamble && hand > 0 ? `<button class="bj-btn" data-leave>Cash out</button>` : ""}
          <span class="bj-info">${kit.play.currency ?? ""}${Math.round(chips)} in chips</span>`;
      } else if (phase === "play") {
        const t = tip();
        b.innerHTML = `<button class="bj-btn main${t === "hit" ? " tip" : ""}" data-hit>Hit <kbd>H</kbd></button>
          <button class="bj-btn${t === "stand" ? " tip" : ""}" data-stand>Stand <kbd>S</kbd></button>
          <button class="bj-btn${t === "double" ? " tip" : ""}" data-double ${player.length === 2 && chips >= stake ? "" : "disabled"}>Double <kbd>D</kbd></button>
          ${t ? `<span class="bj-tip">✦ A whisper: ${t}</span>` : ""}`;
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
