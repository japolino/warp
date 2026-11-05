import { storyReadContent } from "./story-view.js";
import { revision } from "../shared/revision.js";
import { sourceContains } from "./story-text.js";
import { messageOwnsAction } from "./condition-history.js";
import type { Evidence, Message } from "./world.js";
import type { MechanicalState, MechanicalOperation, MechanicalChange, Item } from "./mechanics.js";
import { MechanicalKnowledgeError, carriedObject, type EncounterBeat } from "./encounters.js";

export interface Place { id: string; name: string; parent?: string; visited: boolean; source: Evidence; }
export interface Position { id: string; owner: string; site: string; name: string; source: Evidence; }
export interface Route { id: string; from: string; to: string; via: string; bidirectional: boolean; status: "open" | "blocked" | "unknown"; reason?: string; unsupported: string[]; source: Evidence; }
export interface Discovery { id: string; site: string; name: string; text: string; source: Evidence; }
export interface SiteStock { id: string; site: string; name: string; quantity: number; available: boolean; source: Evidence; accessSource?: Evidence; }
export type ExplorationObservation =
  | { kind: "place"; value: Place; entered?: true }
  | { kind: "route"; value: Route }
  | { kind: "discovery"; value: Discovery }
  | { kind: "stock"; value: SiteStock; correction?: true }
  | { kind: "stock_access"; value: { stock: string; available: boolean; source: Evidence } };

const str = (v: unknown, max = 100) => typeof v === "string" && v.trim().length <= max ? v.trim().replace(/\s+/g, " ") : "";
const normalized = (s: string) => s.normalize("NFKC").toLocaleLowerCase();
export const placeId = (name: string, parent?: string) => `place-${revision(parent ? [parent, normalized(name)] : normalized(name))}`;
export const positionId = (actor: string) => `position-${revision(actor)}`;
export const currentSite = (state: MechanicalState, actor = "you") => state.positions?.find(p => p.owner === actor);
export function findPlace(state: MechanicalState, reference: unknown): Place | undefined {
  const key = str(reference), found = state.places?.filter(p => p.id === key || normalized(p.name) === normalized(key)) ?? [];
  return found.length === 1 ? found[0] : undefined;
}
export function evidenceIndex(source: Evidence, messages: Message[]) {
  return messages.findIndex(m => m.id === source.message || source.message.startsWith("warp-action:") && messageOwnsAction(m, source.message.slice("warp-action:".length)));
}
function newer(source: Evidence, previous: Evidence | undefined, messages: Message[]) {
  if (!previous) return true;
  const next = evidenceIndex(source, messages), old = evidenceIndex(previous, messages);
  if (old < 0 && previous.message.startsWith("warp-action:")) return false;
  return next > old || next === old && !previous.message.startsWith("warp-action:");
}
const countIn = (quote: string, count: number) => (quote.match(/\d+(?:\.\d+)?/g) ?? []).some(n => Number(n) === count)
  || ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].some((word, i) => i === count && new RegExp(`\\b${word}\\b`, "i").test(quote));

/** Spatial knowledge comes from actual narrator discoveries or explicit corrections, never hidden card maps. */
export function readExplorationObservation(row: Record<string, unknown>, state: MechanicalState, source: Evidence, messages: Message[], correction: boolean, historical = false): ExplorationObservation | undefined {
  if (source.message.startsWith("warp-source:")) return;
  const message = messages.find(m => m.id === source.message); if (!message || message.is_user && !correction) return;
  const fields: Record<string, string[]> = { place: ["name", "parent", "entered", ...(historical ? ["visited"] : [])], route: ["from", "to", "via", "bidirectional", "status", "reason", "unsupported"], discovery: ["site", "name", "text"], stock: ["site", "name", "quantity", "available"], stock_access: ["site", "stock", "available"] };
  if (!fields[row.kind as string] || Object.keys(row).some(k => !["kind", "id", "message", "quote", ...(historical ? ["source", "sourceRevision", "viewRevision"] : []), ...fields[row.kind as string]].includes(k))) return;
  if (row.kind === "place") {
    const name = str(row.name), parent = row.parent === undefined ? undefined : findPlace(state, row.parent);
    if (row.parent !== undefined && !parent) return;
    const named = state.places?.filter(p => normalized(p.name) === normalized(name)) ?? [];
    const known = row.id ? findPlace(state, row.id) : parent ? named.find(p => p.parent === parent.id) : named.length === 1 ? named[0] : undefined;
    if (!parent && !known && named.length > 1 || known && parent && known.parent !== parent.id) return;
    if (!name || !known && !sourceContains((source.viewRevision ? storyReadContent(message) : message.content).toLocaleLowerCase(), name.toLocaleLowerCase()) || known && normalized(known.name) !== normalized(name)) return;
    const here = currentSite(state), current = findPlace(state, here?.site);
    if (parent && !known && here?.site !== parent.id && current?.parent !== parent.id && !sourceContains((source.viewRevision ? storyReadContent(message) : message.content).toLocaleLowerCase(), parent.name.toLocaleLowerCase())) return;
    if (row.entered !== undefined && typeof row.entered !== "boolean") return;
    if (known && !newer(source, known.source, messages)) return;
    return { kind: "place", value: { id: known?.id ?? placeId(name, parent?.id), name, ...(parent ?? known?.parent ? { parent: parent?.id ?? known?.parent } : {}), visited: known?.visited === true || row.entered === true || historical && row.visited === true, source },
      ...(row.entered === true && newer(source, currentSite(state)?.source, messages) ? { entered: true } : {}) };
  }
  if (row.kind === "route") {
    const known = state.routes?.find(r => r.id === row.id);
    const from = findPlace(state, row.from ?? known?.from), to = findPlace(state, row.to ?? known?.to), via = str(row.via ?? known?.via, 80);
    if (!from || !to || from.id === to.id || !via || !["open", "blocked", "unknown"].includes(row.status as string)) return;
    if (row.bidirectional !== undefined && typeof row.bidirectional !== "boolean") return;
    const bidirectional = row.bidirectional === true || row.bidirectional === undefined && known?.bidirectional === true;
    const id = known?.id ?? `route-${revision([...(bidirectional ? [from.id, to.id].sort() : [from.id, to.id]), normalized(via)])}`;
    const old = state.routes?.find(r => r.id === id);
    if (known && (known.from !== from.id || known.to !== to.id || known.via !== via) || old && !newer(source, old.source, messages)) return;
    if (row.unsupported !== undefined && (!Array.isArray(row.unsupported) || row.unsupported.length > 4 || row.unsupported.some(v => !str(v, 160)))) return;
    const unsupported = Array.isArray(row.unsupported) ? row.unsupported.map(v => str(v, 160)) : old?.unsupported ?? [];
    return { kind: "route", value: { id, from: from.id, to: to.id, via, bidirectional, status: row.status as Route["status"], ...(str(row.reason, 160) ? { reason: str(row.reason, 160) } : {}), unsupported, source } };
  }
  const site = findPlace(state, row.site ?? (row.kind === "stock_access" ? state.stocks?.find(s => s.id === row.stock)?.site : undefined)); if (!site) return;
  if (row.kind === "discovery") {
    const name = str(row.name), text = str(row.text, 240); if (!name || !text) return;
    const id = `discovery-${revision([site.id, normalized(name)])}`, old = state.discoveries?.find(d => d.id === id);
    if (old && !newer(source, old.source, messages)) return;
    return { kind: "discovery", value: { id, site: site.id, name, text, source } };
  }
  if (row.kind === "stock") {
    const name = str(row.name), quantity = row.quantity;
    if (!name || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0 || quantity > 1e6 || !countIn(source.quote, quantity) || typeof row.available !== "boolean") return;
    const id = `stock-${revision([site.id, normalized(name)])}`, old = state.stocks?.find(s => s.id === id);
    if (old && (!correction || !newer(source, old.source, messages))) return;
    return { kind: "stock", value: { id, site: site.id, name, quantity, available: row.available, source }, ...(correction ? { correction: true } : {}) };
  }
  if (row.kind === "stock_access") {
    const found = state.stocks?.filter(s => s.site === site.id && (s.id === row.stock || normalized(s.name) === normalized(str(row.stock)))) ?? [], stock = found.length === 1 ? found[0] : undefined;
    if (!stock || typeof row.available !== "boolean" || !newer(source, stock.accessSource ?? stock.source, messages)) return;
    return { kind: "stock_access", value: { stock: stock.id, available: row.available, source } };
  }
}

export function observeExploration(state: MechanicalState, o: ExplorationObservation) {
  if (o.kind === "stock_access") {
    const stock = state.stocks?.find(s => s.id === o.value.stock);
    if (stock) { stock.available = o.value.available; stock.accessSource = structuredClone(o.value.source); }
    return;
  }
  if (o.kind === "place") {
    state.places ??= []; const old = state.places.findIndex(p => p.id === o.value.id);
    if (old < 0) state.places.push(structuredClone(o.value)); else state.places[old] = structuredClone(o.value);
    if (o.entered) {
      state.positions ??= []; const id = positionId("you"), index = state.positions.findIndex(p => p.id === id);
      const position: Position = { id, owner: "you", site: o.value.id, name: o.value.name, source: structuredClone(o.value.source) };
      if (index < 0) state.positions.push(position); else state.positions[index] = position;
    }
    return;
  }
  const rows = o.kind === "route" ? (state.routes ??= []) : o.kind === "discovery" ? (state.discoveries ??= []) : (state.stocks ??= []);
  const index = rows.findIndex(r => r.id === o.value.id);
  if (index < 0) (rows as (Route | Discovery | SiteStock)[]).push(structuredClone(o.value));
  else if (o.kind !== "stock" || o.correction) (rows as (Route | Discovery | SiteStock)[])[index] = structuredClone(o.value);
}

export function explorationPacket(state: MechanicalState, focus = "") {
  const clean = <T extends { source: Evidence }>({ source, ...value }: T) => value;
  const selected = new Set<string>(), text = normalized(focus), places = state.places ?? [], routes = state.routes ?? [];
  const add = (id?: string) => { if (id && selected.size < 24) selected.add(id); };
  add(currentSite(state)?.site);
  for (const place of places) if (text.includes(normalized(place.name)) || text.includes(place.id)) add(place.id);
  for (const row of [...(state.stocks ?? []), ...(state.discoveries ?? [])]) if (text.includes(normalized(row.name))) add(row.site);
  for (const route of routes) if (text.includes(route.id) || text.includes(normalized(route.via))) { add(route.from); add(route.to); }
  if (!selected.size) add(places.find(p => p.visited)?.id ?? places[0]?.id);
  for (let hop = 0; hop < 2 && selected.size < 24; hop++) {
    const before = new Set(selected);
    for (const route of routes) if (before.has(route.from) || before.has(route.to)) { add(route.from); add(route.to); }
  }
  for (let depth = 0; depth < 24 && selected.size < 24; depth++) {
    const before = selected.size;
    for (const place of places) if (selected.has(place.id)) add(place.parent);
    if (selected.size === before) break;
  }
  const shownRoutes = routes.filter(r => selected.has(r.from) && selected.has(r.to)).slice(0, 48);
  const relevant = <T extends { site: string; name: string }>(rows: T[]) => rows.map((row, index) => ({ row, index, requested: text.includes(normalized(row.name)) ? 1 : 0 }))
    .filter(({ row }) => selected.has(row.site)).sort((a, b) => b.requested - a.requested || b.index - a.index).slice(0, 24).map(({ row }) => row);
  return { ...(places.length ? { places: places.filter(p => selected.has(p.id)).map(clean) } : {}), ...(state.positions?.length ? { positions: state.positions.map(clean) } : {}),
    ...(routes.length ? { routes: shownRoutes.map(clean) } : {}), ...(state.discoveries?.length ? { discoveries: relevant(state.discoveries).map(clean) } : {}),
    ...(state.stocks?.length ? { stocks: relevant(state.stocks).map(({ source, accessSource, ...stock }) => stock) } : {}) };
}

/** Travel and gathering use the same atomic working copy as costs and effects. */
export function executeExploration(state: MechanicalState, actor: string, op: Extract<MechanicalOperation, { kind: "travel" | "gather" }>, actionId: string, index: number, changes: MechanicalChange[], beats: EncounterBeat[]) {
  if (actor !== "you") throw new Error("This exploration action requires the player's own choice");
  if (op.outcome !== undefined && !["clean", "mixed", "setback"].includes(op.outcome)) throw new Error("Invalid exploration outcome");
  const position = currentSite(state, actor);
  if (!position) throw new MechanicalKnowledgeError("The current place is not established");
  if (op.kind === "travel") {
    const route = state.routes?.find(r => r.id === op.route);
    if (!route) throw new MechanicalKnowledgeError("That route is not established");
    const destination = route.from === position.site ? route.to : route.bidirectional && route.to === position.site ? route.from : undefined;
    if (!destination) throw new Error("This route does not leave the current place in that direction");
    if (route.status === "unknown") throw new MechanicalKnowledgeError(`Access through ${route.via} is unknown`);
    if (route.status === "blocked") throw new Error(`${route.via} is blocked${route.reason ? `: ${route.reason}` : ""}`);
    if (route.unsupported.length) throw new MechanicalKnowledgeError(`${route.via}: ${route.unsupported.join("; ")}`);
    const place = state.places?.find(p => p.id === destination);
    if (!place) throw new MechanicalKnowledgeError("The route's destination is unknown");
    if (op.outcome === "setback") { beats.push({ kind: "attempt", actor, name: `Travel through ${route.via}` }); return; }
    const old = structuredClone(position), source = { message: `warp-action:${actionId}`, quote: `Travel to ${place.name}`, sourceRevision: revision(op) };
    Object.assign(position, { site: place.id, name: place.name, source });
    changes.push({ kind: "position", id: position.id, before: old, after: structuredClone(position) });
    if (!place.visited) { const before = structuredClone(place); place.visited = true; changes.push({ kind: "place", id: place.id, before, after: structuredClone(place) }); }
    for (const entity of state.entities ?? []) if (entity.name !== actor && entity.present && !carriedObject(state, entity, actor)) {
      const before = structuredClone(entity); entity.present = false;
      changes.push({ kind: "entity", id: entity.id, before, after: structuredClone(entity) });
    }
    const oldDistances = state.distances?.filter(d => d.from === actor || d.to === actor) ?? [];
    if (oldDistances.length) state.distances = state.distances!.filter(d => d.from !== actor && d.to !== actor);
    for (const distance of oldDistances) changes.push({ kind: "distance", id: distance.id, before: distance, after: null });
    beats.push({ kind: "travel", actor, name: place.name });
  } else {
    const stock = state.stocks?.find(s => s.id === op.stock);
    if (!stock) throw new MechanicalKnowledgeError("Those supplies are not established");
    if (stock.site !== position.site) throw new Error("Those supplies are at another place");
    if (!stock.available) throw new Error(`${stock.name} are not accessible for collection`);
    if (!Number.isInteger(op.amount) || op.amount <= 0 || op.amount > stock.quantity) throw new Error(`Not enough ${stock.name} remain here`);
    if (op.outcome === "setback") { beats.push({ kind: "attempt", actor, name: `Gather ${stock.name}` }); return; }
    const before = structuredClone(stock), id = `gathered-${revision([actionId, index, stock.id])}`;
    if (state.items.some(i => i.id === id)) throw new Error("These supplies were already gathered");
    const item: Item = { id, owner: actor, name: stock.name, quantity: op.amount, equipped: false, source: structuredClone(stock.source) };
    stock.quantity -= op.amount; state.items.push(item);
    changes.push({ kind: "stock", id: stock.id, before, after: structuredClone(stock) }, { kind: "item", id, before: null, after: item });
    beats.push({ kind: "gather", actor, name: stock.name, amount: op.amount });
  }
}

export const EXPLORATION_INSTRUCTIONS = `When actual exploration, a route, a lasting local change or a location's countable supplies matter, optionally include mechanicalObservations:
{kind:"place",id?:"existing id",name:"actual established place name",parent?:"known containing place id/name",entered:true|false,message,quote}; entered means the player is actually there, not a proposed trip or reading about it. Use parent for distinct rooms with the same name, such as bedrooms in different buildings. Introduce the containing place first. Use saved IDs when a name is ambiguous; never merge rooms just because both are called Bedroom.
{kind:"route",id?:"existing id when updating",from:"known place id/name",to:"known place id/name",via:"distinct actual exit/passage",bidirectional:true|false,status:"open|blocked|unknown",reason?,unsupported:[],message,quote}. Preserve any unmapped mandatory toll, prerequisite, traversal cost or source restriction in unsupported instead of silently granting free passage. An actually fulfilled restriction can clear only with new actual evidence; never discard it because a later route observation omits it.
{kind:"discovery",site:"known place id/name",name:"stable feature/clue name",text:"current established condition or discovery",message,quote}.
{kind:"stock",site,name,quantity,available:true|false,message,quote}; quantity needs an actual explicit count. available:true requires actual accessible unowned supplies or explicit permission, not somebody's property or an inaccessible/locked cache.
{kind:"stock_access",site,stock:"saved id or name",available:true|false,message,quote} changes access without replenishing a count.
Supply the places before their routes, discoveries or stocks. Reuse known names and IDs; never merge distinct rooms or invent exits, geographic distances, connections, permission or quantities. Narrator evidence or an explicit OOC correction is required; hidden card/lore maps and player attempts are not discoveries. Ordinary quiet scenes need no map. Reading a map reveals only what it actually shows, without moving the player. Investigating can reveal a clue without moving. Only actual arrival sets entered:true. A one-way drop is not a two-way passage; bidirectional:true needs a supported return route. An unknown route status is not proof of access.
When the exchange investigates an exit or travel access, record its established connection and current restriction as route observations, not only prose facts. A saved scene or fact does not mean its routes are in the spatial state. Compare the supplied narrator context with known places/routes and recover missing connections relevant to that investigation, including an earlier supplied reply. Cite each original source. Preserve distinct normal and emergency passages separately; do not invent an endpoint or assume that a key opens an unrelated door.
Keep old broken doors, clues, emptied supplies and known exits when returning. Updating one feature does not replace every discovery at that place. Repeating the old stock description cannot refill it. Counted gathering requires a saved gather receipt; narration can reveal or offer supplies, but must not hand over a counted amount before its transaction. Return at most eight newly relevant spatial observations; prioritize the current place, the actual next exit and requested supplies instead of repeating the whole map. Do not activate survival meters, currencies, XP or an exploration quest simply because a place exists.`;
