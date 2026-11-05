// Actual Lumiverse worker transport, disposable public story/model fixtures, no provider traffic.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(import.meta.dir, ".."), checkout = resolve(process.argv[2] ?? "D:/Lumiverse"), chatId = "lingering-smoke";
const manifest = await Bun.file(join(root, "spindle.json")).json();
const opening = "You have 40 of 50 Health and 20 Energy. Jo is here with 40 of 50 Health and already has 3 Venom accumulated. Burn costs 2 Energy and applies Burning for 3 subsequent affected-owner actions, dealing 5 fire Health damage after each action. Salve costs 1 Energy and clears Burning. Venom adds 2 toward threshold 5 and applies Slowed for 2 owner actions.";
const msg = (id: string, role: string, content: string, index: number): any => ({ id, role, content, is_user: role === "user", index_in_chat: index, swipe_id: 0, chat_id: chatId, metadata: {}, extra: {} });
const messages = [msg("opening", "assistant", opening, 0)], cite = (row: object) => ({ ...row, message: "opening", quote: opening });
const observations = [cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "resource", id: "hp", owner: "you", name: "Health", current: 40, max: 50, role: "vital" }), cite({ kind: "resource", id: "jo-hp", owner: "Jo", name: "Health", current: 40, max: 50, role: "vital" }), cite({ kind: "resource", id: "energy", owner: "you", name: "Energy", current: 20, role: "effort" }), cite({ kind: "buildup", owner: "Jo", name: "Venom", current: 3, caster: "you", ability: "Venom" })];
const def = (name: string, effects: object[], cost = 0) => cite({ owner: "you", name, approach: "concentration", target: "either", costs: cost ? [{ kind: "resource", id: "energy", amount: cost }] : [], effects, requires: [], unsupported: [] });
const abilityDefinitions = [
  def("Burn", [{ kind: "periodic", target: "target", name: "Burning", ending: "After 3 affected-owner actions", cadence: "owner_action", duration: 3, pulse: { kind: "damage", resource: "Health", amount: 5, damageType: "fire" } }], 2),
  def("Salve", [{ kind: "clear_condition", target: "target", name: "Burning" }], 1),
  def("Venom", [{ kind: "buildup", target: "target", name: "Venom", amount: 2, threshold: 5, trigger: { kind: "condition", name: "Slowed", ending: "After 2 owner actions", duration: 2, hinders: ["movement"], helps: [], blocks: [] } }]),
];
const steps = ["I cast Burn on myself.", "How many Burning pulses remain?", "I wait.", "I cast Salve on myself.", "I cast Venom at Jo.", "I cast Burn at Jo.", "I wait."];
let phase = "bootstrap", step = 0, registrationId = "", preparations = 0, priorWarp: any[] = [], timer: ReturnType<typeof setTimeout>;
const worker = new Worker(pathToFileURL(join(checkout, "src/spindle/worker-runtime.ts")).href);
const read = (s: any, id: string) => s.resources.find((r: any) => r.id === id).current;
const remaining = (s: any, owner: string) => s.conditions.find((c: any) => c.owner === owner && c.periodic)?.periodic.remaining;
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(Error(`Lingering worker timed out at ${phase}`)), 30000); worker.onerror = reject;
    const start = () => {
      const name = `step-${step}`, action = steps[step - 1]; phase = `prepare-${step}`;
      messages.push(msg(`action-${step}`, "user", action, messages.length), msg(`reply-${step}`, "assistant", "", messages.length + 1));
      worker.postMessage({ type: "event", event: "GENERATION_STARTED", userId: "fixture-user", payload: { chatId, generationId: name, targetMessageId: `reply-${step}`, generationType: "normal" } });
      worker.postMessage({ type: "intercept_request", requestId: name, registrationId, messages: messages.filter(m => m.content).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), context: { chatId, userId: "fixture-user", generationType: "normal" } });
    };
    worker.onmessage = ({ data: e }) => {
      try {
        const respond = (result: unknown) => worker.postMessage({ type: "response", requestId: e.requestId, result });
        if (e.type === "register_interceptor") registrationId = e.registrationId;
        else if (e.type === "permissions_get_granted") respond(manifest.permissions);
        else if (e.type === "log") { if (e.level === "error") throw Error(e.message); if (e.message === "__worker_ready__") worker.postMessage({ type: "frontend_message", userId: "fixture-user", payload: { type: "hello", chatId } }); }
        else if (e.type === "chats_get") respond({ id: chatId, character_id: "clinic", metadata: {} });
        else if (e.type === "characters_get") respond({ id: "clinic", name: "Clinic", description: "A controlled demonstration of established treatment and exposure.", world_book_ids: [] });
        else if (e.type === "chat_get_messages") respond(structuredClone(messages));
        else if (e.type === "connections_list") respond([]);
        else if (e.type === "enclave_has") respond(false);
        else if (e.type === "macros_resolve") respond({ text: e.template === "{{persona}}" ? "Sam is an adult visitor." : "Sam", diagnostics: [] });
        else if (e.type === "user_storage_read") { if (e.path === "settings.json") respond("{}"); else worker.postMessage({ type: "response", requestId: e.requestId, error: "Disposable fixture file absent" }); }
        else if (e.type === "chat_update_message") { const m = messages.find(m => m.id === e.messageId); if (!m) throw Error("Unknown fixture message"); m.metadata = e.patch.metadata; respond(undefined); }
        else if (e.type === "request_generation") {
          if (e.input.messages[0].content.includes("Determine whether")) {
            preparations++;
            if (step === 2) throw Error("A read-only question requested action preparation");
            const action = steps[step - 1], name = step === 4 ? "Salve" : step === 5 ? "Venom" : "Burn";
            respond({ content: JSON.stringify({ risky: false, contested: false, exchange: step === 7, mechanicalActions: action === "I wait." ? [{ kind: "wait", quote: action }] : [{ kind: "ability", ability: name, target: step === 1 || step === 4 ? "you" : "Jo", quote: action }], ...(step === 7 ? { responses: [{ actor: "Jo", action: { kind: "wait" }, assessment: { contested: false }, quote: "Jo waits in the clinic, ready for the timing test." }] } : {}) }) });
          } else respond({ content: JSON.stringify({ changes: [], mechanicalObservations: observations, abilityDefinitions }) });
        } else if (e.type === "intercept_result" && e.requestId === `step-${step}`) {
          if (e.error) throw Error(e.error);
          const wire = e.messages as any[];
          if (!priorWarp.every(old => wire.some(current => JSON.stringify(current) === JSON.stringify(old)))) throw Error("A prior Warp prompt message changed");
          priorWarp = wire.filter(m => typeof m.content === "string" && m.content.includes("<warp>"));
          const player = messages.at(-2)!, reply = messages.at(-1)!, receipt = player.metadata.warpLivingAttempt?.receipt;
          if (step !== 2 && (receipt?.engine !== 9 || receipt.status !== "ready")) throw Error("No complete resolver-9 preparation");
          if (reply.metadata.warpMechanics) throw Error("Effects committed before narration");
          if (step === 2 && !wire.some(m => typeof m.content === "string" && m.content.includes('"remaining":3'))) throw Error("The question lost its saved schedule");
          phase = `commit-${step}`; reply.content = "Jo waits in the clinic, ready for the timing test.";
          worker.postMessage({ type: "event", event: "GENERATION_ENDED", userId: "fixture-user", payload: { chatId, generationId: e.requestId, messageId: reply.id } });
        } else if (e.type === "frontend_message" && e.payload?.type === "living" && !e.payload.busy) {
          const s = e.payload.world.mechanics;
          if (phase === "bootstrap" && s?.abilities?.length) {
            if (s.buildups?.[0]?.current !== 3) throw Error("Initial sourced accumulation was not reconstructed");
            step = 1; start();
          } else if (phase === `commit-${step}`) {
            if (read(s, "hp") !== (step < 3 ? 40 : 35)) throw Error("Wrong player pulse count");
            if (read(s, "energy") !== (step < 4 ? 18 : step < 6 ? 17 : 15)) throw Error("Wrong conserved ability costs");
            if (remaining(s, "you") !== (step < 3 ? 3 : step === 3 ? 2 : undefined)) throw Error("A question or cure changed the wrong schedule");
            if (step >= 5 && s.buildups[0].current !== 0) throw Error("Stale observation refilled spent buildup");
            if (read(s, "jo-hp") !== (step === 7 ? 35 : 40)) throw Error("NPC pulse did not follow its own response action");
            if (step === 7) { if (preparations !== 6 || remaining(s, "Jo") !== 2) throw Error("Extra preparation or NPC pulse"); done(); }
            else { step++; start(); }
          }
        } else if (e.requestId) worker.postMessage({ type: "response", requestId: e.requestId, error: `Unsupported fixture RPC ${e.type}` });
      } catch (error) { reject(error); }
    };
    worker.postMessage({ type: "init", manifest: { ...manifest, entry_backend: pathToFileURL(join(root, "dist/backend.js")).href }, storagePath: join(root, ".artifacts/lingering-worker-smoke") });
  });
  console.log("PASS: production worker conserves periodic costs, skips read-only preparation/ticks, cures a due pulse, consumes sourced buildup, advances an NPC effect on its own response, and preserves every prior Warp prompt message.");
} finally { clearTimeout(timer!); worker.terminate(); }
