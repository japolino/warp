// Actual Lumiverse worker, disposable public narrative/helper fixtures, no account or provider traffic.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { revision } from "../src/shared/revision.js";
const root = resolve(import.meta.dir, ".."), checkout = resolve(process.argv[2] ?? "D:/Lumiverse"), chatId = "barter-smoke";
const manifest = await Bun.file(join(root, "spindle.json")).json();
const clauses = ["sweep the chapel steps", "wash the basin"];
const opening = "Jo stands within arm's reach in the clinic. Jo has 10 Focus and owns Mend, which gently treats routine physical injury at touch range and costs 2 Focus. You have 12 coins and a small routine cooking burn. Jo offers Mend for five coins if you sweep the chapel steps and wash the basin.";
const steps = ["Yes, please.", "What work did we agree to?", "I sweep the chapel steps.", "I wash the basin.", "No, thanks.", "Could you treat my arm now?", "Yes, please."];
const replies = ["Jo acknowledges your agreement. The work and treatment have not happened yet.", "Jo repeats that you agreed to sweep the chapel steps and wash the basin.", "You sweep the chapel steps completely. Jo checks that the steps are clean.", "You wash the basin completely. Jo checks the completed work and offers Mend as promised.", "Jo accepts your refusal without performing the treatment.", "Jo offers Mend as promised.", "Jo receives five coins and uses Mend to treat your cooking burn."];
const message = (id: string, role: string, content: string, index: number): any => ({ id, role, content, is_user: role === "user", index_in_chat: index, swipe_id: 0, chat_id: chatId, metadata: {}, extra: {} });
const messages = [message("opening", "assistant", opening, 0)], cite = (row: object) => ({ ...row, message: "opening", quote: opening });
const observations = [cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "distance", from: "you", to: "Jo", band: "touch" }), cite({ kind: "resource", id: "focus", owner: "Jo", name: "Focus", current: 10, role: "effort" }), cite({ kind: "resource", id: "coins", owner: "you", name: "Coins", current: 12, unit: "coin", role: "money" }), cite({ kind: "condition", id: "burn", owner: "you", name: "Cooking burn", category: "physical_injury", severity: "minor", recovery: "routine", helps: [], hinders: ["movement"], blocks: [], ending: "Treatment" })];
const definitions = [cite({ owner: "Jo", name: "Mend", approach: "concentration", target: "other", range: "touch", costs: [{ kind: "resource", id: "focus", amount: 2 }], effects: [{ kind: "mend", target: "target", impact: "minor" }], requires: [], unsupported: [] })];
let phase = "bootstrap", step = 0, registrationId = "", priorWarp: any[] = [], foregroundYes = 0, expectedReload = "", timer: ReturnType<typeof setTimeout>;
let worker: Worker;
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(Error(`Barter worker timed out at ${phase}`)), 30000);
    const next = () => {
      const id = `step-${step}`; phase = `prepare-${step}`;
      messages.push(message(`action-${step}`, "user", steps[step - 1], messages.length), message(`reply-${step}`, "assistant", "", messages.length + 1));
      worker.postMessage({ type: "event", event: "GENERATION_STARTED", userId: "fixture-user", payload: { chatId, generationId: id, targetMessageId: `reply-${step}`, generationType: "normal" } });
      worker.postMessage({ type: "intercept_request", requestId: id, registrationId, messages: messages.filter(m => m.content).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), context: { chatId, userId: "fixture-user", generationType: "normal" } });
    };
    const launch = () => {
      worker = new Worker(pathToFileURL(join(checkout, "src/spindle/worker-runtime.ts")).href); worker.onerror = reject;
      worker.onmessage = ({ data: e }) => {
        try {
          const respond = (result: unknown) => worker.postMessage({ type: "response", requestId: e.requestId, result });
          if (e.type === "register_interceptor") registrationId = e.registrationId;
          else if (e.type === "permissions_get_granted") respond(manifest.permissions);
          else if (e.type === "log") { if (e.level === "error") throw Error(e.message); if (e.message === "__worker_ready__") worker.postMessage({ type: "frontend_message", userId: "fixture-user", payload: { type: "hello", chatId } }); }
          else if (e.type === "chats_get") respond({ id: chatId, character_id: "clinic", metadata: {} });
          else if (e.type === "characters_get") respond({ id: "clinic", name: "Clinic", description: "A clinic with a voluntary work-for-treatment offer.", world_book_ids: [] });
          else if (e.type === "chat_get_messages") respond(structuredClone(messages));
          else if (e.type === "connections_list") respond([]);
          else if (e.type === "enclave_has") respond(false);
          else if (e.type === "macros_resolve") respond({ text: e.template === "{{persona}}" ? "Sam is an adult visitor." : "Sam", diagnostics: [] });
          else if (e.type === "user_storage_read") { if (e.path === "settings.json") respond("{}"); else worker.postMessage({ type: "response", requestId: e.requestId, error: "Disposable fixture absent" }); }
          else if (e.type === "chat_update_message") { const m = messages.find(m => m.id === e.messageId); if (!m) throw Error("Unknown fixture message"); m.metadata = e.patch.metadata; respond(undefined); }
          else if (e.type === "request_generation") {
            if (phase === "reload") throw Error("Reload required another model call");
            if (e.input.messages[0].content.includes("Determine whether")) {
              if ([1, 5, 7].includes(step)) { foregroundYes++; throw Error("Fresh work/treatment permission opened another interpretation call"); }
              respond({ content: JSON.stringify({ risky: false, contested: false, mechanicalActions: [], responses: [] }) }); return;
            }
            const latest = [...messages].reverse().find(m => !m.is_user && m.content)!;
            const accepted = messages.find(m => m.id === "action-1"), first = messages.find(m => m.id === "reply-3" && m.content), second = messages.find(m => m.id === "reply-4" && m.content);
            respond({ content: JSON.stringify({ changes: [], scene: { place: "clinic", present: ["Jo"], message: latest.id, quote: latest.content }, mechanicalObservations: [
              ...observations, cite({ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], fee: { kind: "resource", id: "coins", amount: 5 }, work: clauses }),
              ...(accepted ? [{ kind: "agreement", owner: "you", name: "Clinic work", from: "Jo", offer: { message: "opening", quote: opening }, requirements: clauses.map(quote => ({ message: "opening", quote })), rewards: [], service: { offer: "Mend" }, unsupported: [], message: accepted.id, quote: accepted.content }] : []),
              ...(first ? [{ kind: "agreement_progress", agreement: "Clinic work", requirement: clauses[0], message: first.id, quote: first.content }] : []),
              ...(second ? [{ kind: "agreement_progress", agreement: "Clinic work", requirement: clauses[1], message: second.id, quote: second.content }] : []),
              ...(latest.id !== "opening" && latest.content.includes("offers Mend as promised") ? [{ kind: "aid_offer", actor: "Jo", target: "you", ability: "Mend", uncontested: true, unsupported: [], agreement: "Clinic work", message: latest.id, quote: latest.content }] : []),
            ], abilityDefinitions: definitions }) });
          } else if (e.type === "intercept_result" && e.requestId === `step-${step}`) {
            if (e.error) throw Error(e.error); const wire = e.messages as any[];
            if (!priorWarp.every(old => wire.some(m => JSON.stringify(m) === JSON.stringify(old)))) throw Error("A prior Warp prompt block changed");
            priorWarp = wire.filter(m => typeof m.content === "string" && m.content.includes("<warp>"));
            const player = messages.at(-2)!, reply = messages.at(-1)!, receipt = player.metadata.warpLivingAttempt?.receipt;
            if ([5, 7].includes(step) && (receipt?.engine !== 12 || receipt.status !== "ready")) throw Error("Treatment permission was not prepared before narration");
            if ([1, 2, 3, 4, 6].includes(step) && receipt) throw Error("Work acceptance, a question or a request executed treatment");
            if (reply.metadata.warpMechanics) throw Error("Barter committed before narration");
            phase = `commit-${step}`; reply.content = replies[step - 1];
            worker.postMessage({ type: "event", event: "GENERATION_ENDED", userId: "fixture-user", payload: { chatId, generationId: e.requestId, messageId: reply.id } });
          } else if (e.type === "frontend_message" && e.payload?.type === "living" && !e.payload.busy) {
            const s = e.payload.world.mechanics;
            if (phase === "bootstrap" && s?.aidOffers?.[0]?.work) { step = 1; next(); }
            else if (phase === "reload") { if (revision(s) !== expectedReload) throw Error("Reload changed the service or repeated costs"); if (foregroundYes) throw Error("Unexpected permission interpretation"); done(); }
            else if (phase === `commit-${step}`) {
              if (s.resources.find((r: any) => r.id === "focus")?.current !== (step === 7 ? 8 : 10) || s.resources.find((r: any) => r.id === "coins")?.current !== (step === 7 ? 7 : 12)) throw Error("Service fee or caster cost was premature, missing or repeated");
              if (s.conditions.some((c: any) => c.id === "burn") !== (step !== 7)) throw Error("Work or a question healed early");
              const agreement = s.agreements?.[0], count = agreement?.requirements.filter((r: any) => r.done).length;
              if (count !== (step < 3 ? 0 : step === 3 ? 1 : 2)) throw Error("Work clauses were dropped or completed early");
              if (!!agreement.service?.used !== (step === 7)) throw Error("Wrong service consumption");
              if (step >= 4 && s.aidOffers?.[0]?.fee?.amount !== 5) throw Error("A renewal waived the original fee");
              if (s.resources.some((r: any) => r.owner === "Jo" && r.role === "money")) throw Error("Invented NPC wallet");
              if (step === 7) { expectedReload = revision(s); phase = "reload"; worker.terminate(); launch(); } else { step++; next(); }
            }
          } else if (e.requestId) worker.postMessage({ type: "response", requestId: e.requestId, error: `Unsupported fixture RPC ${e.type}` });
        } catch (error) { reject(error); }
      };
      worker.postMessage({ type: "init", manifest: { ...manifest, entry_backend: pathToFileURL(join(root, "dist/backend.js")).href }, storagePath: join(root, ".artifacts/barter-worker-smoke") });
    };
    launch();
  });
  console.log("PASS: production worker accepts all quoted work through a plain yes, preserves it through questions, records each completion, permits refusal, renews the earned treatment with its original fee, executes it once, reloads without a model call, and preserves every earlier Warp prompt block.");
} finally { clearTimeout(timer!); worker!.terminate(); }
