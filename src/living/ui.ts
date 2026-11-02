import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import type { World, Decision } from "./world.js";
import { createDiceReveal, DICE_STYLE, percentileDice } from "./dice-reveal.js";
import { inspectMechanics, INSPECTOR_STYLE } from "./inspector.js";
import { esc } from "../frontend/html.js";
import type { WarpStateV1 } from "../frontend/public-events.js";
import type { ResponseCheck } from "./exchanges.js";

interface View { type: "living"; chatId: string; signature: string; revision: number; enabled: boolean; busy: boolean; retry: boolean; anchor: string | null; world: World; notes: string[]; decision?: Decision; responses?: ResponseCheck[]; notice?: string; }
function checkMarkup(view: View): string {
  const checks = [...(view.decision ? [{ id: "player", decision: view.decision, actor: "" }] : []), ...(view.responses ?? []).slice(0, 3).map((r, i) => ({ id: `response-${i}`, decision: r.decision, actor: r.actor }))];
  if (!checks.length) return `<div class="warp-check-none">${view.busy ? "Updating Warp's record for this reply…" : "No recorded Warp roll for this reply."}</div>`;
  return checks.map(({ id, decision: d, actor }) => {
    const label = actor ? `${actor} ${ { clean: "succeeds", mixed: "succeeds with a cost", setback: "falters" }[d.result]}` : { clean: "Clean success", mixed: "Success with a cost", setback: "Setback" }[d.result];
    const hasRoll = Number.isInteger(d.roll) && d.roll! >= 1 && d.roll! <= 100;
    return `<section class="warp-check${actor ? " warp-check-response" : ""}" data-check-id="${id}" aria-label="${actor ? `${esc(actor)} dice check` : "Warp dice check"}">
    <div class="warp-check-die" role="img" aria-label="${hasRoll ? `Rolled ${d.roll} on a d100` : "Roll value not saved"}">${percentileDice(d.roll)}</div>
    <div class="warp-check-copy"><strong>${esc(label)}</strong><p>${esc(d.intent)}</p></div></section>`;
  }).join("");
}
const STYLE = `
.warp-scene{font:inherit;font-size:13px;line-height:1.5;color:inherit;margin:12px 0 18px;padding:12px 18px;box-sizing:border-box;border-top:1px solid color-mix(in srgb,currentColor 14%,transparent);opacity:.9;max-width:100%;overflow-wrap:anywhere}
.warp-scene-top{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}.warp-scene-place{font-weight:600}.warp-scene-people{opacity:.7}.warp-scene-tools{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
.warp-scene button{font:inherit;color:inherit;background:transparent;border:1px solid transparent;border-radius:5px;padding:3px 7px;cursor:pointer;text-align:left}.warp-scene button:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.warp-scene button:focus-visible,.warp-scene textarea:focus-visible,.warp-scene input:focus-visible{outline:2px solid currentColor;outline-offset:3px}.warp-scene button:disabled{opacity:.5;cursor:wait}
.warp-scene-note{margin-top:5px;opacity:.8}.warp-scene details{margin-top:7px}.warp-scene summary{cursor:pointer;opacity:.7}.warp-scene textarea{display:block;box-sizing:border-box;width:100%;min-height:72px;font:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 28%,transparent);border-radius:6px;padding:9px;margin:9px 0;resize:vertical}
.warp-scene-ideas{display:grid;gap:5px;margin-top:9px}.warp-scene-idea{border:1px solid color-mix(in srgb,currentColor 18%,transparent)!important;padding:9px!important}.warp-scene-fact{padding:7px 0;border-bottom:1px solid color-mix(in srgb,currentColor 8%,transparent)}.warp-scene-source{display:block;font-size:12px;opacity:.6}.warp-scene-error{margin-top:8px;opacity:.75}
.warp-scene input[type=search]{box-sizing:border-box;width:100%;font:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:5px;padding:6px;margin:8px 0}
.warp-scene select{max-width:100%;font:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:5px;padding:5px}.warp-scene-settings{margin:9px 0}.warp-scene-settings p{font-size:12px;opacity:.7}
${DICE_STYLE}
.warp-check-response{margin:5px 0;gap:10px}.warp-check-response .warp-check-die{width:76px;height:52px}.warp-check-response .warp-percentile-die{width:42px;height:48px}.warp-check-response .warp-die-number{font-size:14px}.warp-check-response .warp-check-copy strong{font-size:12px}.warp-check-response .warp-check-copy p{font-size:12px}
${INSPECTOR_STYLE}
@media(max-width:540px){.warp-scene-tools{margin-left:0;width:100%}.warp-scene{font-size:12px}}
`;

/** The full default play interface lives below the latest reply. */
export function connectLiving(ctx: SpindleFrontendContext): { accept(raw: unknown): boolean; openSettings(): void; publicState(): WarpStateV1 | null; destroy(): void } {
  let view: View | null = null, root: HTMLElement | null = null, ideas: string[] = [], loading = false, error = "", draft: string | null = null;
  let mode: "say" | "correct" = "say";
  let memoryQuery = "";
  let inspectorOpen = false;
  let settingsOpen = false, helperConnection = "", decisionConnection = "", decisionConnections: { id: string; name: string }[] = [], connections: { id: string; name: string }[] = [];
  let injected: Element | null = null;
  const diceReveals = new Map<string, ReturnType<typeof createDiceReveal>>();
  let renderedCheckKey = "";
  const remove = () => { for (const reveal of diceReveals.values()) reveal.destroy(); diceReveals.clear(); if (injected) ctx.dom.uninject(injected); injected = null; root = null; renderedCheckKey = ""; };
  const unstyle = ctx.dom.addStyle(STYLE);
  const active = () => ctx.getActiveChat().chatId ?? null;
  const send = (action: string, value?: string) => { if (view) ctx.sendToBackend({ type: "living_action", chatId: view.chatId, action, text: value }); };
  function markup(): string {
    if (!view) return "";
    if (!view.enabled) return `<div class="warp-scene-top"><span>Warp paused</span><button data-living="resume">Resume</button></div>`;
    const world = view.world;
    const inspectable = !!world.mechanics && [...world.mechanics.resources, ...world.mechanics.items.filter(i => i.quantity > 0), ...world.mechanics.conditions, ...(world.mechanics.abilities ?? []), ...(world.mechanics.resilience ?? []).filter(r => r.band !== "ordinary"), ...(world.mechanics.agreements ?? [])].some(row => row.owner === "you" || "from" in row && row.from === "you");
    const matches = world.facts.filter(f => !memoryQuery || `${f.subject} ${f.text} ${f.quote}`.toLocaleLowerCase().includes(memoryQuery.toLocaleLowerCase()));
    const remembered = matches.slice(-80).reverse();
    const relevant = world.facts.filter(f => f.status === "open" && ["commitment", "situation"].includes(f.kind)).slice(-2);
    const reminders = new Set(relevant.map(f => f.text.trim().toLocaleLowerCase()));
    const notes = view.notes.filter(note => { const key = note.trim().toLocaleLowerCase(); if (reminders.has(key)) return false; reminders.add(key); return true; });
    return `<div class="warp-scene-top"><span class="warp-scene-place">${esc(world.place || "Here")}</span><span class="warp-scene-people">${world.present.map(esc).join(" · ")}${view.busy ? ' <span role="status" aria-label="Updating the scene">…</span>' : ""}</span><span class="warp-scene-tools"><button data-living="ideas" ${loading ? "disabled" : ""}>${loading ? "Thinking…" : "Ideas"}</button>${inspectable ? `<button data-living="inspect" aria-expanded="${inspectorOpen}">Inspect</button>` : ""}<button data-living="correct">Correct</button><button data-living="pause">Pause</button><button data-living="settings" aria-expanded="${settingsOpen}">Settings</button></span></div>
      ${settingsOpen ? `<div class="warp-scene-settings"><label>Helper connection <select data-helper-connection><option value="">Use this chat's connection</option>${connections.map(c => `<option value="${esc(c.id)}"${helperConnection === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label><label style="display:block;margin-top:8px">Decision connection <select data-decision-connection><option value="">Use the helper</option>${decisionConnection && !decisionConnections.some(c => c.id === decisionConnection) ? `<option value="${esc(decisionConnection)}" selected>Saved profile unavailable</option>` : ""}${decisionConnections.map(c => `<option value="${esc(c.id)}"${decisionConnection === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label><p>Decision profiles come from Lumiverse Connections. They assess contested attempts; Warp rolls the outcome. Unavailable profiles fall back to the helper.</p><p>Reading the scene uses an additional model call. A risky attempt may use one more. You can choose a faster helper connection here.</p></div>` : ""}
      ${!notes.length && relevant.length ? `<div class="warp-scene-note">${relevant.map(f => esc(f.text)).join(" · ")}</div>` : ""}
      ${notes.length ? `<div class="warp-scene-note">${notes.map(esc).join(" · ")}</div>` : ""}
      ${checkMarkup(view)}
      ${inspectorOpen && inspectable && world.mechanics ? inspectMechanics(world.mechanics) : ""}
      ${view.retry ? `<button data-living="retry">Scene read unavailable · Retry</button>` : ""}
      ${view.notice ? `<div class="warp-scene-error" role="status">${esc(view.notice)}</div>` : ""}
      ${ideas.length ? `<div class="warp-scene-ideas">${ideas.map((s, i) => `<button class="warp-scene-idea" data-idea="${i}">${esc(s)}</button>`).join("")}</div>` : ""}
      ${draft !== null ? `<label>${mode === "correct" ? "What should Warp know?" : "Your message"}<textarea data-living-draft>${esc(draft)}</textarea></label><button data-living="submit">${mode === "correct" ? "Save correction" : "Send"}</button><button data-living="cancel">Cancel</button>` : ""}
      ${error ? `<div class="warp-scene-error" role="status">${esc(error)}</div>` : ""}
      <details data-memory><summary>Remembered</summary>
      <input type="search" data-memory-query aria-label="Find a remembered event" placeholder="Find a remembered event" value="${esc(memoryQuery)}">
      ${remembered.map(f => `<div class="warp-scene-fact">${esc(f.subject)} · ${esc(f.text)}${f.holder ? ` · with ${esc(f.holder)}` : ""}${f.status === "done" ? " · settled" : ""}<span class="warp-scene-source">${f.kind === "motive" ? "Possible motive · " : ""}${esc(f.quote)}</span></div>`).join("") || (memoryQuery ? "No matching events." : "No lasting events recorded yet.")}${matches.length > 80 ? `<p>Showing the latest 80 matches. Search to find an older event.</p>` : ""}</details>`;
  }
  function paint() {
    if (!view || view.chatId !== active() || !view.anchor) { remove(); return; }
    const row = ctx.dom.findMessageElement(view.anchor);
    if (!row) return;
    const card = row.querySelector(`[data-message-id="${CSS.escape(view.anchor)}"]`) ?? row;
    if (!root) {
      injected = ctx.dom.inject(card, '<div class="warp-scene" data-warp-living="true"></div>', card === row ? "beforeend" : "afterend");
      root = injected.querySelector<HTMLElement>(".warp-scene")!;
      if (!root) { ctx.dom.uninject(injected); injected = null; return; }
      root.addEventListener("input", e => {
        if ((e.target as HTMLElement).matches("[data-living-draft]")) draft = (e.target as HTMLTextAreaElement).value;
        if ((e.target as HTMLElement).matches("[data-memory-query]")) { memoryQuery = (e.target as HTMLInputElement).value; paint(); }
      });
      root.addEventListener("change", e => { if ((e.target as HTMLElement).matches("[data-decision-connection]")) ctx.sendToBackend({ type: "settings", patch: { decisionConnectionId: (e.target as HTMLSelectElement).value } }); if ((e.target as HTMLElement).matches("[data-helper-connection]")) ctx.sendToBackend({ type: "settings", patch: { helperConnectionId: (e.target as HTMLSelectElement).value } }); });
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
          case "settings": settingsOpen = !settingsOpen; break;
          case "inspect": inspectorOpen = !inspectorOpen; break;
        }
        paint();
      });
    }
    if (card === row) { if (injected!.parentElement !== row) row.append(injected!); }
    else if (card.nextElementSibling !== injected) card.after(injected!);
    const detailsOpen = root.querySelector<HTMLDetailsElement>("[data-memory]")?.open;
    const checkKey = JSON.stringify([view.chatId, view.anchor, view.decision, view.responses]);
    const previousChecks = new Map(renderedCheckKey === checkKey ? [...root.querySelectorAll<HTMLElement>("[data-check-id]")].map(e => [e.dataset.checkId!, e]) : []);
    const expandedAbilities = [...root.querySelectorAll<HTMLDetailsElement>("[data-inspect-ability][open]")].map(e => e.dataset.inspectAbility);
    const expandedAgreements = [...root.querySelectorAll<HTMLDetailsElement>("[data-inspect-agreement][open]")].map(e => e.dataset.inspectAgreement);
    const focused = root.contains(document.activeElement) && document.activeElement?.matches("textarea,[data-memory-query]");
    const selector = document.activeElement?.matches("[data-memory-query]") ? "[data-memory-query]" : "textarea";
    const selection = focused ? [(document.activeElement as HTMLTextAreaElement).selectionStart ?? 0, (document.activeElement as HTMLTextAreaElement).selectionEnd ?? 0] : null;
    root.innerHTML = markup();
    for (const check of root.querySelectorAll<HTMLElement>("[data-check-id]")) { const previous = previousChecks.get(check.dataset.checkId!); if (previous) check.replaceWith(previous); }
    renderedCheckKey = checkKey;
    const ids = new Set<string>();
    for (const check of root.querySelectorAll<HTMLElement>("[data-check-id]")) {
      const id = check.dataset.checkId!; ids.add(id);
      let reveal = diceReveals.get(id); if (!reveal) { reveal = createDiceReveal(); diceReveals.set(id, reveal); }
      reveal.observe(check, JSON.stringify([view.chatId, view.anchor, id, id === "player" ? view.decision : view.responses?.[Number(id.slice("response-".length))]]));
    }
    for (const [id, reveal] of diceReveals) if (!ids.has(id)) { reveal.destroy(); diceReveals.delete(id); }
    if (detailsOpen) root.querySelector("[data-memory]")?.setAttribute("open", "");
    for (const id of expandedAbilities) root.querySelector(`[data-inspect-ability="${CSS.escape(id!)}"]`)?.setAttribute("open", "");
    for (const id of expandedAgreements) root.querySelector(`[data-inspect-agreement="${CSS.escape(id!)}"]`)?.setAttribute("open", "");
    if (selection) { const input = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector); input?.focus(); input?.setSelectionRange(selection[0], selection[1]); }
  }
  const poll = setInterval(() => {
    if (view?.chatId !== active()) { remove(); view = null; ideas = []; draft = null; loading = false; memoryQuery = ""; inspectorOpen = false; }
    else if (root && injected && !injected.contains(root)) { remove(); paint(); }
    else if (view && !root?.isConnected) paint();
  }, 600);
  const publicSnapshot = (): WarpStateV1 | null => {
    if (!view || view.chatId !== active()) return null;
    const counted = view.world.mechanics?.items ?? [];
    const possessions = view.world.facts.filter(f => f.kind === "possession" && f.holder === "you" && !counted.some(i => i.id === f.id || i.name.toLocaleLowerCase() === f.subject.toLocaleLowerCase())).map(f => f.text);
    return { version: 1, provider: "warp", chatId: view.chatId, messageId: view.anchor, place: view.enabled ? view.world.place || undefined : undefined,
      you: { name: "You", items: view.enabled ? [...possessions, ...counted.filter(i => i.owner === "you" && i.quantity > 0).map(i => `${i.name} × ${i.quantity}`)] : [] },
      people: view.enabled ? view.world.present.map(name => ({ id: name, name, present: true })) : [] };
  };
  return {
    accept(raw) {
      if (!raw || typeof raw !== "object") return false;
      const m = raw as Omit<View, "type"> & { type: string; ideas?: string[]; error?: string; settings?: { helperConnectionId?: string; decisionConnectionId?: string }; decisionConnections?: { id: string; name: string }[]; connections?: { id: string; name: string }[] };
      if (m.type === "settings") { helperConnection = m.settings?.helperConnectionId ?? ""; decisionConnection = m.settings?.decisionConnectionId ?? ""; decisionConnections = m.decisionConnections ?? []; connections = m.connections ?? []; paint(); return false; }
      if (m.type === "state" && m.chatId === active()) { view = null; remove(); return false; }
      if (m.type === "living_ideas") {
        if (!view || m.chatId !== active() || m.chatId !== view.chatId || m.signature !== view.signature) return true;
        loading = false; ideas = m.ideas ?? []; error = m.error ?? (ideas.length ? "" : "No suggestions this time. You can keep typing."); paint(); return true;
      }
      if (m.type !== "living") return false;
      if (m.chatId !== active() || (view?.chatId === m.chatId && m.revision < view.revision)) return true;
      if (view?.anchor !== m.anchor || view?.signature !== m.signature) { ideas = []; draft = null; loading = false; }
      if (view?.chatId !== m.chatId) inspectorOpen = false;
      view = { ...m, type: "living" }; paint();
      window.dispatchEvent(new CustomEvent("warp-state-v1", { detail: publicSnapshot() }));
      return true;
    },
    publicState: publicSnapshot,
    openSettings() { settingsOpen = true; paint(); root?.querySelector<HTMLSelectElement>("[data-helper-connection]")?.focus(); },
    destroy() { clearInterval(poll); remove(); unstyle(); },
  };
}
