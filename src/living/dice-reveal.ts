// Presentation only. The saved outcome is never changed by the animation.
const seen = new Set<string>();
export const DICE_REVEAL_MS = 1250;

export function percentileDice(roll?: number): string {
  const known = Number.isInteger(roll) && roll! >= 1 && roll! <= 100;
  const n = known ? roll! % 100 : undefined;
  const values = n === undefined ? ["?", "?"] : [String(Math.floor(n / 10) * 10).padStart(2, "0"), String(n % 10)];
  return values.map((value, i) => `<span class="warp-percentile-die warp-percentile-${i}" aria-hidden="true">
    <svg viewBox="0 0 76 84" focusable="false"><path class="warp-die-body" d="M38 3 69 23 73 54 38 80 3 54 7 23Z"/>
    <path class="warp-die-facet-a" d="M38 3 38 23 7 23Z M3 54 21 59 38 80Z"/>
    <path class="warp-die-facet-b" d="M38 3 69 23 55 59 38 80 38 23Z"/>
    <path class="warp-die-facet-c" d="M38 23 55 59 21 59Z"/>
    <path class="warp-die-edges" d="M38 3 69 23 73 54 38 80 3 54 7 23Z M7 23 38 23 69 23 M38 3 38 23 21 59 3 54 M38 23 55 59 73 54 M21 59 38 80 55 59"/>
    </svg><span class="warp-die-number" data-die-final="${value}">${value}</span></span>`).join("");
}

export function createDiceReveal() {
  let target: HTMLElement | null = null, observer: IntersectionObserver | null = null;
  let frame = 0;
  const stop = () => {
    observer?.disconnect(); observer = null;
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    if (target) {
      target.classList.remove("warp-dice-rolling");
      for (const number of target.querySelectorAll<HTMLElement>("[data-die-final]")) number.textContent = number.dataset.dieFinal!;
    }
  };
  return {
    observe(next: HTMLElement | null, key: string) {
      if (next === target) return;
      stop(); target = next;
      if (!next || seen.has(key) || !next.querySelector('[data-die-final]:not([data-die-final="?"])')) return;
      if (!window.IntersectionObserver || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      observer = new window.IntersectionObserver(entries => {
        if (target !== next) return;
        if (!entries.some(e => e.target === next && e.isIntersecting && e.intersectionRatio >= 0.4)) return;
        observer?.disconnect(); observer = null;
        seen.add(key);
        if (seen.size > 2000) seen.delete(seen.values().next().value!);
        next.classList.add("warp-dice-rolling");
        const numbers = [...next.querySelectorAll<HTMLElement>("[data-die-final]")];
        let start: number | undefined, lastTick = -1;
        const tick = (now: number) => {
          start ??= now;
          const elapsed = now - start, step = Math.floor(elapsed / 70);
          if (elapsed >= DICE_REVEAL_MS) { stop(); return; }
          if (step !== lastTick) {
            lastTick = step;
            numbers.forEach((node, i) => { const digit = (step * 7 + i * 3) % 10; node.textContent = i ? String(digit) : String(digit * 10).padStart(2, "0"); });
          }
          frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
      }, { threshold: 0.4 });
      observer.observe(next);
    },
    destroy() { stop(); target = null; },
  };
}

export const DICE_STYLE = `
.warp-check{--die-edge:#c8a96b;--die-ink:#f6e5b8;display:flex;align-items:center;gap:12px;margin:10px 0;padding:3px 0;perspective:500px}
.warp-check-die{display:flex;align-items:center;flex-shrink:0;width:106px;height:74px;perspective:350px}
.warp-percentile-die{position:relative;display:block;width:58px;height:66px;flex-shrink:0;filter:drop-shadow(0 5px 4px #0006);transform:rotate(-9deg);transform-origin:50% 65%}
.warp-percentile-1{margin-left:-9px;transform:translateY(5px) rotate(12deg);--die-edge:#a8becf;--die-ink:#e7f2fa}
.warp-percentile-die svg{width:100%;height:100%;overflow:visible}.warp-die-body{fill:#32263f}.warp-die-facet-a{fill:#63516d}.warp-die-facet-b{fill:#211b30}.warp-die-facet-c{fill:#493653}.warp-percentile-1 .warp-die-body{fill:#263644}.warp-percentile-1 .warp-die-facet-a{fill:#516879}.warp-percentile-1 .warp-die-facet-b{fill:#172532}.warp-percentile-1 .warp-die-facet-c{fill:#354c60}
.warp-die-edges{fill:none;stroke:var(--die-edge);stroke-width:1.1;stroke-linejoin:round}.warp-die-number{position:absolute;inset:0;display:grid;place-content:center;padding-top:5px;color:var(--die-ink);font:600 20px Georgia,serif;font-variant-numeric:tabular-nums;text-shadow:0 1px 2px #000}
.warp-check-copy{min-width:0}.warp-check-copy strong{font-size:13px}.warp-check-copy p{margin:2px 0;opacity:.7}.warp-check-none{font-size:11px;opacity:.5;margin-top:7px}
.warp-dice-rolling .warp-percentile-0{animation:warp-die-tumble 1.25s both}.warp-dice-rolling .warp-percentile-1{animation:warp-die-tumble-second 1.25s both}
@keyframes warp-die-tumble{0%{transform:translate(-12px,-16px) rotateX(35deg) rotateY(0deg) rotateZ(-85deg)}25%{transform:translate(4px,-22px) rotateX(200deg) rotateY(155deg) rotateZ(80deg)}55%{transform:translate(-3px,2px) rotateX(360deg) rotateY(330deg) rotateZ(190deg)}75%{transform:translate(0,-8px) rotateX(375deg) rotateY(365deg) rotateZ(330deg)}100%{transform:rotateX(360deg) rotateY(360deg) rotateZ(351deg)}}
@keyframes warp-die-tumble-second{0%{transform:translate(15px,-10px) rotateX(-30deg) rotateY(30deg) rotateZ(65deg)}30%{transform:translate(-3px,-18px) rotateX(-180deg) rotateY(-160deg) rotateZ(-90deg)}60%{transform:translate(2px,7px) rotateX(-350deg) rotateY(-320deg) rotateZ(-220deg)}80%{transform:translate(0,-3px) rotateX(-375deg) rotateY(-365deg) rotateZ(-360deg)}100%{transform:translateY(5px) rotateX(-360deg) rotateY(-360deg) rotateZ(-348deg)}}
@media(prefers-reduced-motion:reduce){.warp-dice-rolling .warp-percentile-die{animation:none!important}}
`;
