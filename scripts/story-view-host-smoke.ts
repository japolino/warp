// Production Lumiverse worker, disposable public story/model fixtures, no account or provider traffic.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(import.meta.dir, ".."), checkout = resolve(process.argv[2] ?? "D:/Lumiverse"), chatId = "story-view-smoke";
const manifest = await Bun.file(join(root, "spindle.json")).json();
const opening = "Jo stands within arm's reach in the clinic. Jo has 10 Focus and owns Mend, which gently treats routine physical injury at touch range and costs 2 Focus. You have a small routine cooking burn.";
const steps = ["Could you treat my arm?", "No, thanks.", "Could you treat my arm?", "How much Focus would Mend use?", "Yes, please."];
const replies = ["Jo offers Mend to treat your cooking burn.", "Jo accepts your refusal and does not perform the treatment.", "Jo offers Mend to treat your cooking burn.", "Jo offers Mend for your cooking burn; it uses two of his Focus.", "Jo uses Mend and clears your cooking burn."];
const message = (id: string, role: string, content: string, index: number): any => ({ id, role, content, is_user: role === "user", index_in_chat: index, swipe_id: 0, chat_id: chatId, metadata: {}, extra: {} });
const rawOpening = "{{#when::en}}" + opening + "{{/when}}{{#when::jp}}Hidden Hall. Evil has 999 Focus.{{/when}}";
const messages = [message("opening", "assistant", rawOpening, 0)], cite = (row: object) => ({ ...row, message: "opening", quote: opening });
const observations = [cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "distance", from: "you", to: "Jo", band: "touch" }), cite({ kind: "resource", id: "focus", owner: "Jo", name: "Focus", current: 10, role: "effort" }), cite({ kind: "condition", id: "burn", owner: "you", name: "Cooking burn", category: "physical_injury", severity: "minor", recovery: "routine", helps: [], hinders: ["movement"], blocks: [], ending: "Treatment" })];
const definitions = [cite({ owner: "Jo", name: "Mend", approach: "concentration", target: "other", range: "touch", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], requires: [], unsupported: [] })];
let phase = "bootstrap", step = 0, registrationId = "", priorWarp: any[] = [], preCalls = 0, timer: ReturnType<typeof setTimeout>;
const worker = new Worker(pathToFileURL(join(checkout, "src/spindle/worker-runtime.ts")).href);
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(Error(`Aid worker timed out at ${phase}`)), 30000); worker.onerror = reject;
    const next = () => {
      const id = `step-${step}`; phase = `prepare-${step}`;
      messages.push(message(`action-${step}`, "user", steps[step - 1], messages.length), message(`reply-${step}`, "assistant", "", messages.length + 1));
      worker.postMessage({ type: "event", event: "GENERATION_STARTED", userId: "fixture-user", payload: { chatId, generationId: id, targetMessageId: `reply-${step}`, generationType: "normal" } });
      worker.postMessage({ type: "intercept_request", requestId: id, registrationId, messages: messages.filter(m => m.content).map(m => ({ role: m.role, content: m.id === "opening" ? opening : m.content, sourceMessageId: m.id })), context: { chatId, userId: "fixture-user", generationType: "normal" } });
    };
    worker.onmessage = ({ data: e }) => {
      try {
        const respond = (result: unknown) => worker.postMessage({ type: "response", requestId: e.requestId, result });
        if (e.type === "register_interceptor") registrationId = e.registrationId;
        else if (e.type === "permissions_get_granted") respond(manifest.permissions);
        else if (e.type === "log") { if (e.level === "error") throw Error(e.message); if (e.message === "__worker_ready__") worker.postMessage({ type: "frontend_message", userId: "fixture-user", payload: { type: "hello", chatId } }); }
        else if (e.type === "chats_get") respond({ id: chatId, character_id: "clinic", metadata: {} });
        else if (e.type === "characters_get") respond({ id: "clinic", name: "Clinic", description: "A clinic with a source-backed voluntary treatment.", world_book_ids: [] });
        else if (e.type === "chat_get_messages") respond(structuredClone(messages));
        else if (e.type === "connections_list") respond([]);
        else if (e.type === "enclave_has") respond(false);
        else if (e.type === "macros_resolve") respond({ text: e.template === "{{persona}}" ? "Sam is an adult visitor." : "Sam", diagnostics: [] });
        else if (e.type === "user_storage_read") { if (e.path === "settings.json") respond("{}"); else worker.postMessage({ type: "response", requestId: e.requestId, error: "Disposable fixture file absent" }); }
        else if (e.type === "chat_update_message") { const m = messages.find(m => m.id === e.messageId); if (!m) throw Error("Unknown fixture message"); m.metadata = e.patch.metadata; respond(undefined); }
        else if (e.type === "request_generation") {
          if (e.input.messages[0].content.includes("Determine whether")) { preCalls++; throw Error("A fresh simple request, refusal, query or acceptance opened another interpretation call"); }
          if (e.input.messages[1].content.includes("Hidden Hall") || e.input.messages[1].content.includes("999") || e.input.messages[1].content.includes("#when")) throw Error("An inactive source branch leaked into the helper");
          const latest = [...messages].reverse().find(m => !m.is_user && m.content)!, currentOffer = latest.content.includes("offers Mend");
          respond({ content: JSON.stringify({ changes: [], scene: { place: "clinic", present: ["Jo"], message: latest.id, quote: latest.content }, mechanicalObservations: [...observations, ...(currentOffer ? [{ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], message: latest.id, quote: latest.content }] : [])], abilityDefinitions: definitions }) });
        } else if (e.type === "intercept_result" && e.requestId === `step-${step}`) {
          if (e.error) throw Error(e.error); const wire = e.messages as any[];
          if (!priorWarp.every(old => wire.some(m => JSON.stringify(m) === JSON.stringify(old)))) throw Error("A prior Warp prompt block changed");
          priorWarp = wire.filter(m => typeof m.content === "string" && m.content.includes("<warp>"));
          const player = messages.at(-2)!, reply = messages.at(-1)!, receipt = player.metadata.warpLivingAttempt?.receipt;
          if ([2, 5].includes(step) && (receipt?.engine !== 10 || receipt.status !== "ready")) throw Error("Aid permission was not prepared before narration");
          if (step === 1 && messages[0].metadata.warpStoryView?.["0"]?.text !== opening) throw Error("The real worker did not capture the source view");
          if ([1, 3, 4].includes(step) && receipt) throw Error("A request or question acquired a mechanical execution");
          if (reply.metadata.warpMechanics) throw Error("Aid committed before narration");
          phase = `commit-${step}`; reply.content = replies[step - 1];
          worker.postMessage({ type: "event", event: "GENERATION_ENDED", userId: "fixture-user", payload: { chatId, generationId: e.requestId, messageId: reply.id } });
        } else if (e.type === "frontend_message" && e.payload?.type === "living" && !e.payload.busy) {
          const s = e.payload.world.mechanics;
          if (phase === "bootstrap") { if (s?.abilities?.length) throw Error("The unresolved greeting was read before projection"); step = 1; next(); }
          else if (phase === `commit-${step}`) {
            if (s.resources.find((r: any) => r.id === "focus")?.current !== (step === 5 ? 8 : 10)) throw Error("NPC aid payment was premature, missing or repeated");
            if ((s.clocks?.find((c: any) => c.actor === "you")?.actions ?? 0) !== 0 || (s.clocks?.find((c: any) => c.actor === "Jo")?.actions ?? 0) !== (step === 5 ? 1 : 0)) throw Error("Wrong actor advanced for aid permission");
            if (s.conditions.some((c: any) => c.id === "burn") !== (step !== 5)) throw Error("Offer, question or refusal healed early");
            if (s.abilities.some((a: any) => a.owner === "you")) throw Error("The player acquired the NPC's power");
            const status = s.aidOffers?.[0]?.status, expected = step === 2 ? "withdrawn" : step === 5 ? "used" : "offered";
            if (status !== expected) throw Error("Wrong aid offer status");
            if (step === 1 && !e.payload.notes.some((n: string) => n.includes("2 Focus"))) throw Error("The aid price was hidden before acceptance");
            if (step === 5) { if (preCalls) throw Error("Unneeded preparation call"); done(); } else { step++; next(); }
          }
        } else if (e.requestId) worker.postMessage({ type: "response", requestId: e.requestId, error: `Unsupported fixture RPC ${e.type}` });
      } catch (error) { reject(error); }
    };
    worker.postMessage({ type: "init", manifest: { ...manifest, entry_backend: pathToFileURL(join(root, "dist/backend.js")).href }, storagePath: join(root, ".artifacts/aid-worker-smoke") });
  });
  console.log("PASS: production worker ignores unresolved branches, captures host-rendered source by ID, prepares the actual NPC ability and cost from that view, executes aid once and keeps all prior Warp prompt blocks unchanged.");
} finally { clearTimeout(timer!); worker.terminate(); }
