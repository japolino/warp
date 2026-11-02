import { revision } from "../shared/revision.js";
import type { Evidence, Fact, Message, World } from "./world.js";

export interface KnowledgeAccess {
  about: string;
  version: string;
  via: "witnessed" | "discovered" | "told";
  from?: string;
  fromKnowledge?: string;
}

export const propositionVersion = (fact: Fact) => revision([fact.id, fact.kind, fact.subject, fact.text, fact.holder ?? ""]);
const samePerson = (a: string, b: string) => a.normalize("NFKC").toLocaleLowerCase() === b.normalize("NFKC").toLocaleLowerCase();
function namesPerson(quote: string, person: string, playerNames: string[], world: World): boolean {
  const normalized = quote.normalize("NFKC").toLocaleLowerCase();
  const entity = world.mechanics?.entities?.find(e => samePerson(e.name, person));
  const names = person === "you" ? ["you", "your", ...playerNames.filter(n => !["i", "me", "player", "{{user}}"].includes(n.toLocaleLowerCase()))] : [person, ...(entity ? [entity.displayName, ...entity.aliases] : [])];
  return names.some(name => {
    const needle = name.normalize("NFKC").toLocaleLowerCase();
    if (!needle) return false;
    let start = normalized.indexOf(needle);
    while (start >= 0) {
      if (!/[\p{L}\p{N}_]/u.test(normalized[start - 1] ?? "") && !/[\p{L}\p{N}_]/u.test(normalized[start + needle.length] ?? "")) return true;
      start = normalized.indexOf(needle, start + 1);
    }
    return false;
  });
}

export function knowledgeDependencyHolds(fact: Fact, facts: Iterable<Fact>): boolean {
  const access = fact.access;
  if (!access) return true; // Previously saved knowledge retains its original meaning.
  if (!["witnessed", "discovered", "told"].includes(access.via)) return false;
  const all = [...facts], topic = all.find(f => f.id === access.about);
  if (access.via !== "told") return !!topic && propositionVersion(topic) === access.version && fact.text === topic.text && !access.from && !access.fromKnowledge;
  const sender = all.find(f => f.id === access.fromKnowledge && f.kind === "knowledge" && samePerson(f.subject, access.from ?? ""));
  return !!sender && sender.text === fact.text && (sender.access ? sender.access.about === access.about && sender.access.version === access.version : sender.id === access.about && propositionVersion(sender) === access.version);
}

/** A recorded fact and access to that fact are separate. No audience is inferred from presence. */
export function learnKnowledge(raw: Record<string, unknown>, source: Evidence, world: World, messages: Message[], learner: string, sender: string, playerNames: string[]): Fact | undefined {
  if (!["witnessed", "discovered", "told"].includes(raw.via as string) || !learner) return;
  const topic = world.facts.find(f => f.id === raw.about);
  if (!topic || topic.kind === "motive" || topic.access && raw.via !== "told") return;
  const message = messages.find(m => m.id === source.message), index = messages.findIndex(m => m.id === source.message);
  const causeIndex = messages.findIndex(m => m.id === topic.message);
  const correction = message?.is_user && /^\s*\(?OOC correction:/i.test(message.content);
  if (!message || message.is_user && !correction || causeIndex > index || !namesPerson(source.quote, learner, playerNames, world)) return;
  // Witnessing an old event requires a new discovery/disclosure, not retroactive attendance.
  if (raw.via === "witnessed" && topic.message !== source.message) return;
  if (raw.via !== "told" && (raw.from !== undefined || raw.fromKnowledge !== undefined)) return;
  const about = topic.access?.about ?? topic.id, version = topic.access?.version ?? propositionVersion(topic);
  let fromKnowledge: Fact | undefined;
  if (raw.via === "told") {
    if (!sender || samePerson(sender, learner) || !namesPerson(source.quote, sender, playerNames, world)) return;
    fromKnowledge = world.facts.find(f => f.kind === "knowledge" && samePerson(f.subject, sender)
      && (f.id === topic.id || f.access?.about === about && f.access.version === version));
    if (!fromKnowledge) return;
  }
  const access: KnowledgeAccess = { about, version, via: raw.via as KnowledgeAccess["via"], ...(fromKnowledge ? { from: sender, fromKnowledge: fromKnowledge.id } : {}) };
  const id = `knowledge-${revision([learner.normalize("NFKC").toLocaleLowerCase(), about, version])}`;
  // Repeated extraction or a second account of the same disclosure cannot replace its cause.
  if (world.facts.some(f => f.id === id)) return;
  return { id, kind: "knowledge", subject: learner, text: topic.text, status: "open", access, ...source };
}

export const KNOWLEDGE_INSTRUCTIONS = `Record a fact separately from who has learned it. A fact's subject is not automatically a witness. Physical presence, a card's omniscient description and the narrator knowing a secret grant nobody access.
For actual learning, first put the relevant fact with a stable id if it is new, then add {op:"learn",about:"that fact id",subject:"learner",via:"witnessed|discovered|told",from:"sender only for told",message,quote}. Code assigns the knowledge id and copies the exact recorded proposition. Do not use put kind:knowledge for new grants. The quote must explicitly name the learner (or you/the player's name) and establish their access. For told it must name both sender and recipient; the sender must already have recorded knowledge of that proposition. A player saying I tell Jo is an attempt, not completed disclosure. Unsuccessful persuasion does not erase a listener's actual hearing.
IMPORTANT: Every learn event must cite an actual NARRATOR message id and quote, never the player's message. When a player tells someone a secret, cite the listener's acknowledgement/repetition/reaction in the narrator's reply. For example player I tell Mira the donor is Vale, then narrator Mira nods at you. "Vale? I had no idea." means learn subject:Mira from:you cites that narrator reply, NOT I tell Mira. A learn quote may use up to 400 characters when needed to include the named people and acknowledgement. Omit learning if the narrator never establishes it.
Witnessed applies only to the fact's actual source message. For later evidence use discovered, or told for a real disclosure. A later arrival cannot witness an earlier event. A whisper has only its established listeners, never everyone present. Discovery needs actual perceptible evidence, not a hidden thought, guessed secret or denial. Claims, suspicions and lies remain claims, suspicions and lies in the fact's text; hearing an allegation does not prove its truth. Do not invent a clue, witness, relationship score, accepted promise or forced revelation to populate this system. Existing knowledge persists without repeated grants.`;
