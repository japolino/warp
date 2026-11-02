// Real Lumiverse worker, disposable chat/model RPC fixtures, no account conversations.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(import.meta.dir, ".."), checkout = resolve(process.argv[2] ?? "D:/Lumiverse");
const manifest = await Bun.file(join(root, "spindle.json")).json();
const local = process.argv.includes("--local");
const offer = "Jo says, 'If you cover the counter and clean the cups, I will give you 10 Coins.'";
const opening = `Jo waits in the café. Jo has 20 Coins. You have 3 Coins. ${offer}`;
const acceptance = "I accept. I will cover the counter and clean the cups.";
const completed = "You finish covering the counter and cleaning the cups. Jo holds out the promised 10 Coins.";
const msg = (id: string, role: string, content: string, index: number): any => ({ id, chat_id: "agreement-smoke", role, is_user: role === "user", content, index_in_chat: index, swipe_id: 0, metadata: {}, extra: {} });
const messages = [msg("opening", "assistant", opening, 0), msg("accept", "user", acceptance, 1), msg("completed", "assistant", completed, 2)];
const observations = [
  { kind: "entity", name: "Jo", entityKind: "person", present: true, message: "opening", quote: "Jo waits in the café." },
  { kind: "resource", owner: "Jo", name: "Coins", role: "money", current: 20, message: "opening", quote: "Jo has 20 Coins." },
  { kind: "resource", owner: "you", name: "Coins", role: "money", current: 3, message: "opening", quote: "You have 3 Coins." },
  { kind: "agreement", owner: "you", name: "Help at the café", from: "Jo", offer: { message: "opening", quote: offer }, requirements: ["cover the counter", "clean the cups"].map(quote => ({ message: "opening", quote })), rewards: [{ kind: "resource", asset: "Coins", amount: 10, message: "opening", quote: "10 Coins" }], message: "accept", quote: acceptance },
  ...["cover the counter", "clean the cups"].map(requirement => ({ kind: "agreement_progress", agreement: "Help at the café", requirement, message: "completed", quote: completed })),
  { kind: "reward_ready", agreement: "Help at the café", reward: "Coins", ready: true, ...(local ? { uncontested: true } : {}), message: "completed", quote: completed },
];
let phase = "bootstrap", registrationId = "", receipt: any, timer: ReturnType<typeof setTimeout>;
const worker = new Worker(pathToFileURL(join(checkout, "src/spindle/worker-runtime.ts")).href);
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(new Error(`Agreement worker timed out at ${phase}`)), 20000);
    worker.onerror = reject;
    worker.onmessage = ({ data: e }) => {
      try {
        const respond = (result: unknown) => worker.postMessage({ type: "response", requestId: e.requestId, result });
        if (e.type === "register_interceptor") registrationId = e.registrationId;
        else if (e.type === "permissions_get_granted") respond(manifest.permissions);
        else if (e.type === "log") {
          if (e.level === "error") throw new Error(e.message);
          if (e.message === "__worker_ready__") worker.postMessage({ type: "frontend_message", userId: "fixture-user", payload: { type: "hello", chatId: "agreement-smoke" } });
        } else if (e.type === "chats_get") respond({ id: "agreement-smoke", character_id: "jo", metadata: {} });
        else if (e.type === "characters_get") respond({ id: "jo", name: "Jo", description: "Jo runs a café and pays for agreed work.", world_book_ids: [] });
        else if (e.type === "chat_get_messages") respond(structuredClone(messages));
        else if (e.type === "connections_list") respond([]);
        else if (e.type === "enclave_has") respond(false);
        else if (e.type === "macros_resolve") respond({ text: e.template === "{{persona}}" ? "Sam is an adult visitor." : "Sam", diagnostics: [] });
        else if (e.type === "user_storage_read") {
          if (e.path === "settings.json") respond("{}"); else worker.postMessage({ type: "response", requestId: e.requestId, error: "Fixture file absent" });
        } else if (e.type === "request_generation") {
          if (local && e.input.messages[0].content.includes("Determine whether")) throw new Error("The local collection made a redundant interpretation call");
          respond({ content: JSON.stringify(e.input.messages[0].content.includes("Determine whether") ? { risky: false, contested: false, approach: "other", mechanicalActions: [{ kind: "claim", agreement: "Help at the café", reward: "Coins", quote: "I collect my pay." }] } : { scene: { place: "Café", present: ["Jo"], message: "completed", quote: completed }, changes: [], mechanicalObservations: observations.filter(o => o.kind !== "entity") }) });
        } else if (e.type === "chat_update_message") {
          const target = messages.find(m => m.id === e.messageId); if (!target) throw new Error("Unknown fixture message"); target.metadata = e.patch.metadata; respond(undefined);
        } else if (e.type === "frontend_message" && e.payload?.type === "living") {
          const state = e.payload.world.mechanics;
          if (phase === "bootstrap" && state?.agreements?.[0]?.rewards[0]?.ready?.allowed && !e.payload.busy) {
            if (!registrationId) throw new Error("Production interceptor absent");
            phase = "prepare"; messages.push(msg("claim", "user", "I collect my pay.", 3), msg("reply", "assistant", "", 4));
            worker.postMessage({ type: "event", event: "GENERATION_STARTED", userId: "fixture-user", payload: { chatId: "agreement-smoke", generationId: "claim-generation", targetMessageId: "reply", generationType: "normal" } });
            worker.postMessage({ type: "intercept_request", requestId: "claim", registrationId, messages: messages.filter(m => m.content).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), context: { chatId: "agreement-smoke", userId: "fixture-user", generationType: "normal" } });
          } else if (phase === "commit" && !e.payload.busy) {
            const payer = state.resources.find((r: any) => r.owner === "Jo"), recipient = state.resources.find((r: any) => r.owner === "you");
            if (payer.current !== 10 || recipient.current !== 13 || !state.agreements[0].rewards[0].paid) throw new Error("Reward did not commit both balances and paid marker");
            if (state.resources.some((r: any) => r.name === "Health") || e.payload.decision) throw new Error("Ordinary payment acquired a Health pool or roll");
            done();
          }
        } else if (e.type === "intercept_result" && e.requestId === "claim") {
          receipt = messages[3].metadata.warpLivingAttempt?.receipt;
          if (e.error || receipt?.engine !== 5 || receipt.status !== "ready" || !receipt.beats.some((b: any) => b.kind === "reward")) throw new Error("No production reward receipt");
          if (messages[4].metadata.warpMechanics) throw new Error("Reward committed before narration");
          phase = "commit"; messages[4].content = "Jo hands you the agreed coins.";
          worker.postMessage({ type: "event", event: "GENERATION_ENDED", userId: "fixture-user", payload: { chatId: "agreement-smoke", generationId: "claim-generation", messageId: "reply", content: messages[4].content } });
        } else if (e.requestId) worker.postMessage({ type: "response", requestId: e.requestId, error: `Unsupported fixture RPC ${e.type}` });
      } catch (error) { reject(error); }
    };
    worker.postMessage({ type: "init", manifest: { ...manifest, entry_backend: pathToFileURL(join(root, "dist/backend.js")).href }, storagePath: join(root, ".artifacts/agreement-worker-smoke") });
  });
  console.log(local ? "PASS: production sandbox collected a fresh uncontested reward without a pre-read, conserved both balances, and committed the saved receipt." : "PASS: production sandbox compiled an accepted multi-part agreement and prepared/committed its willing payer's conserved reward without a roll or ruleset.");
} finally { clearTimeout(timer!); worker.terminate(); }
