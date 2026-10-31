import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { World, Decision } from "./world.js";
import { esc } from "../frontend/html.js";
import type { WarpStateV1 } from "../frontend/public-events.js";

interface View { type: "living"; chatId: string; signature: string; revision: number; enabled: boolean; busy: boolean; retry: boolean; anchor: string | null; world: World; notes: string[]; decision?: Decision; }
const STYLE = `
.warp-scene{font:inherit;font-size:13px;line-height:1.5;color:inherit;margin:12px 0 18px;padding:10px 0;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);opacity:.9;max-width:100%;overflow-wrap:anywhere}
.warp-scene-top{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}.warp-scene-place{font-weight:600}.warp-scene-people{opacity:.7}.warp-scene-tools{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
.warp-scene button{font:inherit;color:inherit;background:transparent;border:1px solid transparent;border-radius:5px;padding:3px 7px;cursor:pointer;text-align:left}.warp-scene button:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.warp-scene button:focus-visible,.warp-scene textarea:focus-visible{outline:2px solid currentColor;outline-offset:3px}.warp-scene button:disabled{opacity:.5;cursor:wait}
.warp-scene-note{margin-top:5px;opacity:.8}.warp-scene details{margin-top:7px}.warp-scene summary{cursor:pointer;opacity:.7}.warp-scene textarea{display:block;box-sizing:border-box;width:100%;min-height:72px;font:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 28%,transparent);border-radius:6px;padding:9px;margin:9px 0;resize:vertical}
.warp-scene-ideas{display:grid;gap:5px;margin-top:9px}.warp-scene-idea{border:1px solid color-mix(in srgb,currentColor 18%,transparent)!important;padding:9px!important}.warp-scene-fact{padding:7px 0;border-bottom:1px solid color-mix(in srgb,currentColor 8%,transparent)}.warp-scene-source{display:block;font-size:12px;opacity:.6}.warp-scene-error{margin-top:8px;opacity:.75}
@media(max-width:540px){.warp-scene-tools{margin-left:0;width:100%}.warp-scene{font-size:12px}}
`;

/** The full default play interface lives below the latest reply. */
export function connectLiving(ctx: SpindleFrontendContext): { accept(raw: unknown): boolean; publicState(): WarpStateV1 | null; destroy(): void } {
  let view: View | null = null, root: HTMLElement | null = null, ideas: string[] = [], loading = false, error = "", draft: string | null = null;
  let mode: "say" | "correct" = "say";
  let injected: Element | null = null;
  const remove = () => { if (injected) ctx.dom.uninject(injected); injected = null; root = null; };
  const unstyle = ctx.dom.addStyle(STYLE);
  const active = () => ctx.getActiveChat().chatId ?? null;
  const send = (action: string, value?: string) => { if (view) ctx.sendToBackend({ type: "living_action", chatId: view.chatId, action, text: value }); };
  function markup(): string {
    if (!view) return "";
    if (!view.enabled) return `<div class="warp-scene-top"><span>Warp paused</span><button data-living="resume">Resume</button></div>`;
    const world = view.world;
    const relevant = world.facts.filter(f => f.status === "open" && ["commitment", "situation"].includes(f.kind)).slice(-2);
    return `<div class="warp-scene-top"><span class="warp-scene-place">${esc(world.place || "Here")}</span><span class="warp-scene-people">${world.present.map(esc).join(" · ")}</span><span class="warp-scene-tools"><button data-living="ideas" ${loading ? "disabled" : ""}>${loading ? "Thinking…" : "Ideas"}</button><button data-living="correct">Correct</button><button data-living="pause">Pause</button></span></div>
      ${relevant.length ? `<div class="warp-scene-note">${relevant.map(f => esc(f.text)).join(" · ")}</div>` : ""}
      ${view.notes.length ? `<div class="warp-scene-note">${view.notes.map(esc).join(" · ")}</div>` : ""}
      ${view.retry ? `<button data-living="retry">Scene read unavailable · Retry</button>` : ""}
      ${ideas.length ? `<div class="warp-scene-ideas">${ideas.map((s, i) => `<button class="warp-scene-idea" data-idea="${i}">${esc(s)}</button>`).join("")}</div>` : ""}
      ${draft !== null ? `<label>${mode === "correct" ? "What should Warp know?" : "Your message"}<textarea data-living-draft>${esc(draft)}</textarea></label><button data-living="submit">${mode === "correct" ? "Save correction" : "Send"}</button><button data-living="cancel">Cancel</button>` : ""}
      ${error ? `<div class="warp-scene-error" role="status">${esc(error)}</div>` : ""}
      <details><summary>Remembered${view.decision ? " · This attempt" : ""}</summary>
      ${view.decision ? `<p>${esc(view.decision.intent)}: ${esc(view.decision.result)}. ${esc(view.decision.stakes)}<br>${view.decision.reasons.map(esc).join(" · ")}</p>` : ""}
      ${world.facts.map(f => `<div class="warp-scene-fact">${esc(f.subject)} · ${esc(f.text)}${f.holder ? ` · with ${esc(f.holder)}` : ""}<span class="warp-scene-source">${f.kind === "motive" ? "Possible motive · " : ""}${esc(f.quote)}</span></div>`).join("") || "No lasting events recorded yet."}</details>`;
  }
  function paint() {
    if (!view || view.chatId !== active() || !view.anchor) { remove(); return; }
    const row = ctx.dom.findMessageElement(view.anchor);
    if (!row) return;
    const card = row.querySelector(`[data-message-id="${CSS.escape(view.anchor)}"]`) ?? row;
    if (!root) {
      injected = ctx.dom.inject(card, '<div class="warp-scene" data-warp-living="true"></div>', card === row ? "beforeend" : "afterend");
      root = injected.querySelector<HTMLElement>(".warp-scene")!;
      root.addEventListener("input", e => { if ((e.target as HTMLElement).matches("[data-living-draft]")) draft = (e.target as HTMLTextAreaElement).value; });
      root.addEventListener("click", e => {
        const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button"); if (!button || !view) return;
        if (button.dataset.idea !== undefined) { draft = ideas[Number(button.dataset.idea)] ?? ""; mode = "say"; paint(); root?.querySelector("textarea")?.focus(); return; }
        switch (button.dataset.living) {
          case "ideas": loading = true; ideas = []; error = ""; send("ideas"); break;
          case "retry": send("retry"); break;
          case "correct": mode = "correct"; draft = ""; break;
          case "cancel": draft = null; break;
          case "submit": if (draft?.trim()) { send(mode, draft); draft = null; ideas = []; } break;
          case "pause": send("pause"); break;
          case "resume": send("resume"); break;
        }
        paint();
      });
    }
    if (card === row) { if (injected!.parentElement !== row) row.append(injected!); }
    else if (card.nextElementSibling !== injected) card.after(injected!);
    const detailsOpen = root.querySelector("details")?.open;
    const focused = root.contains(document.activeElement) && document.activeElement instanceof HTMLTextAreaElement;
    const selection = focused ? [(document.activeElement as HTMLTextAreaElement).selectionStart, (document.activeElement as HTMLTextAreaElement).selectionEnd] : null;
    root.innerHTML = markup();
    if (detailsOpen) root.querySelector("details")?.setAttribute("open", "");
    if (selection) { const input = root.querySelector("textarea"); input?.focus(); input?.setSelectionRange(selection[0], selection[1]); }
  }
  const poll = setInterval(() => {
    if (view?.chatId !== active()) { remove(); view = null; ideas = []; draft = null; loading = false; }
    else if (root && injected && !injected.contains(root)) { remove(); paint(); }
    else if (view && !root?.isConnected) paint();
  }, 600);
  return {
    accept(raw) {
      if (!raw || typeof raw !== "object") return false;
      const m = raw as Omit<View, "type"> & { type: string; ideas?: string[]; error?: string };
      if (m.type === "state" && m.chatId === active()) { view = null; remove(); return false; }
      if (m.type === "living_ideas") {
        if (!view || m.chatId !== active() || m.chatId !== view.chatId || m.signature !== view.signature) return true;
        loading = false; ideas = m.ideas ?? []; error = m.error ?? (ideas.length ? "" : "No suggestions this time. You can keep typing."); paint(); return true;
      }
      if (m.type !== "living") return false;
      if (m.chatId !== active() || (view?.chatId === m.chatId && m.revision < view.revision)) return true;
      if (view?.anchor !== m.anchor || view?.signature !== m.signature) { ideas = []; draft = null; loading = false; }
      view = { ...m, type: "living" }; paint();
      window.dispatchEvent(new CustomEvent("warp-state-v1", { detail: { version: 1, provider: "warp", chatId: m.chatId, messageId: m.anchor, place: m.world.place || undefined, you: {}, people: m.enabled ? m.world.present.map(name => ({ id: name, name, present: true })) : [] } }));
      return true;
    },
    publicState() {
      if (!view || view.chatId !== active()) return null;
      return { version: 1, provider: "warp", chatId: view.chatId, messageId: view.anchor, place: view.world.place || undefined,
        you: { name: "You", items: view.enabled ? view.world.facts.filter(f => f.kind === "possession" && f.holder === "you").map(f => f.text) : [] },
        people: view.enabled ? view.world.present.map(name => ({ id: name, name, present: true })) : [] };
    },
    destroy() { clearInterval(poll); remove(); unstyle(); },
  };
}
