/** Disposable fixed-narration/reader fixture in the actual Lumiverse worker. No user chats or models. */
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { revision } from "../src/shared/revision.js";
const root = resolve(import.meta.dir, ".."), checkout = resolve(process.argv[2] ?? "D:/Lumiverse"), chatId = "agreement-focus-smoke";
const manifest = await Bun.file(join(root, "spindle.json")).json();
const offer = (n: number) => `Jo says, 'If you clean room ${n}, I will pay 2 Coins.'`;
const opening = `Jo stands beside you. Jo has 10 Coins. You have 0 Coins. ${offer(1)}`;
const steps = [1, 2, 3, 4, 5].map(n => `I agree to clean room ${n}.`).concat(["List all my agreements.", "I clean room 1.", "I collect my pay for Clean room 1."]);
const replies = [2, 3, 4, 5].map(n => `Jo acknowledges your agreement. ${offer(n)}`).concat(["Jo acknowledges your fifth agreement.", "Jo repeats all five accepted jobs.", "You finish cleaning room 1. Jo holds out 2 Coins as promised.", "Jo hands you the two coins."]);
const message = (id: string, role: string, content: string, index: number): any => ({ id, role, content, is_user: role === "user", index_in_chat: index, swipe_id: 0, chat_id: chatId, metadata: {}, extra: {} });
const messages = [message("opening", "assistant", opening, 0)];
const cite = (row: object) => ({ ...row, message: "opening", quote: opening });
const initial = [cite({ kind: "entity", name: "Jo", entityKind: "person", present: true }), cite({ kind: "resource", owner: "Jo", name: "Coins", role: "money", unit: "coin", current: 10 }), cite({ kind: "resource", owner: "you", name: "Coins", role: "money", unit: "coin", current: 0 })];
let phase = "bootstrap", step = 0, registrationId = "", priorWarp: any[] = [], expectedReload = "", timer: ReturnType<typeof setTimeout>, worker: Worker;
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(Error(`Agreement worker timed out at ${phase}`)), 30000);
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
          else if (e.type === "chats_get") respond({ id: chatId, character_id: "cafe", metadata: {} });
          else if (e.type === "characters_get") respond({ id: "cafe", name: "Cafe", description: "A quiet cafe with ordinary paid jobs.", world_book_ids: [] });
          else if (e.type === "chat_get_messages") respond(structuredClone(messages));
          else if (e.type === "connections_list") respond([]);
          else if (e.type === "enclave_has") respond(false);
          else if (e.type === "macros_resolve") respond({ text: e.template === "{{persona}}" ? "Sam is an adult visitor." : "Sam", diagnostics: [] });
          else if (e.type === "user_storage_read") { if (e.path === "settings.json") respond("{}"); else worker.postMessage({ type: "response", requestId: e.requestId, error: "Disposable fixture absent" }); }
          else if (e.type === "chat_update_message") { const m = messages.find(m => m.id === e.messageId); if (!m) throw Error("Unknown fixture message"); m.metadata = e.patch.metadata; respond(undefined); }
          else if (e.type === "request_generation") {
            if (phase === "reload") throw Error("Saved agreement reload requested another model call");
            if (e.input.messages[0].content.includes("Determine whether")) {
              const rows = step === 8 ? [{ kind: "claim", agreement: "Clean room 1", reward: "Coins", quote: steps[step - 1] }] : [];
              respond({ content: JSON.stringify({ risky: false, contested: false, mechanicalActions: rows, responses: [] }) }); return;
            }
            const latest = [...messages].reverse().find(m => !m.is_user && m.content)!;
            const agreements = [1, 2, 3, 4, 5].flatMap(n => {
              const acceptance = messages.find(m => m.id === `action-${n}`), source = messages.find(m => m.id === (n === 1 ? "opening" : `reply-${n - 1}`));
              return acceptance && source?.content ? [{ kind: "agreement", owner: "you", from: "Jo", name: `Clean room ${n}`, offer: { message: source.id, quote: offer(n) }, requirements: [{ message: source.id, quote: `clean room ${n}` }], rewards: [{ kind: "resource", asset: "Coins", amount: 2, message: source.id, quote: "2 Coins" }], message: acceptance.id, quote: acceptance.content }] : [];
            });
            const completed = messages.find(m => m.id === "reply-7" && m.content);
            respond({ content: JSON.stringify({ changes: [], scene: { place: "cafe", present: ["Jo"], message: latest.id, quote: latest.content }, mechanicalObservations: [...initial, ...agreements, ...(completed ? [{ kind: "agreement_progress", agreement: "Clean room 1", requirement: "clean room 1", message: completed.id, quote: completed.content }, { kind: "reward_ready", agreement: "Clean room 1", reward: "Coins", ready: true, uncontested: true, message: completed.id, quote: completed.content }] : [])], abilityDefinitions: [] }) });
          } else if (e.type === "intercept_result" && e.requestId === `step-${step}`) {
            if (e.error) throw Error(e.error);
            const wire = e.messages as any[], latest = wire.at(-1).content as string;
            if (!priorWarp.every(old => wire.some(m => JSON.stringify(m) === JSON.stringify(old)))) throw Error("A previous Warp block changed");
            priorWarp = wire.filter(m => typeof m.content === "string" && m.content.includes("<warp>"));
            if (step === 6 && (!latest.includes('"shown":5') || !latest.includes('"overview":true') || !latest.includes('"name":"Clean room 1"'))) throw Error("Overview did not recall the older saved job");
            const player = messages.at(-2)!, reply = messages.at(-1)!, receipt = player.metadata.warpLivingAttempt?.receipt;
            if (step === 8 && (receipt?.status !== "ready" || !receipt.changes.some((c: any) => c.kind === "agreement"))) throw Error(`Old job was not settled before narration: ${JSON.stringify(receipt ?? player.metadata.warpLivingAttempt ?? "no preparation")}`);
            if (step < 8 && receipt) throw Error("A question or promise executed a mechanical transfer");
            if (reply.metadata.warpMechanics) throw Error("Agreement receipt committed before narration");
            phase = `commit-${step}`; reply.content = replies[step - 1];
            worker.postMessage({ type: "event", event: "GENERATION_ENDED", userId: "fixture-user", payload: { chatId, generationId: e.requestId, messageId: reply.id } });
          } else if (e.type === "frontend_message" && e.payload?.type === "living" && !e.payload.busy) {
            const s = e.payload.world.mechanics;
            if (phase === "bootstrap" && s?.resources?.length === 2) { step = 1; next(); }
            else if (phase === "reload") { if (revision(s) !== expectedReload) throw Error("Reload lost a promise or repeated its payment"); done(); }
            else if (phase === `commit-${step}`) {
              if (s.agreements?.length !== Math.min(step, 5)) throw Error(`Dropped acceptance ${step}`);
              if (s.resources.find((r: any) => r.owner === "Jo")?.current !== (step === 8 ? 8 : 10) || s.resources.find((r: any) => r.owner === "you")?.current !== (step === 8 ? 2 : 0)) throw Error("Job reward was premature, missing or repeated");
              if (step === 8) { expectedReload = revision(s); phase = "reload"; worker.terminate(); launch(); }
              else { step++; next(); }
            }
          } else if (e.requestId) worker.postMessage({ type: "response", requestId: e.requestId, error: `Unsupported fixture RPC ${e.type}` });
        } catch (error) { reject(error); }
      };
      worker.postMessage({ type: "init", manifest: { ...manifest, entry_backend: pathToFileURL(join(root, "dist/backend.js")).href }, storagePath: join(root, ".artifacts/agreement-worker-smoke") });
    };
    launch();
  });
  console.log("PASS: production worker retains five acceptances, recalls all through chat, completes and pays the oldest once, replays without a model call, and preserves every earlier Warp block.");
} finally { clearTimeout(timer!); worker!.terminate(); }
