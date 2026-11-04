// Production sandbox worker with disposable chat/model RPC fixtures. No account or provider traffic.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(import.meta.dir, ".."), checkout = resolve(process.argv[2] ?? "D:/Lumiverse");
const manifest = await Bun.file(join(root, "spindle.json")).json();
const opening = "You stand in the Dock. An open corridor connects the Dock and Clinic in both directions. The supply log lists three free Rations in the Clinic.";
const msg = (id: string, role: string, content: string, index: number): any => ({ id, role, content, is_user: role === "user", index_in_chat: index, swipe_id: 0, chat_id: "exploration-smoke", metadata: {}, extra: {} });
const messages = [msg("opening", "assistant", opening, 0)], cite = (quote: string, row: object) => ({ ...row, message: "opening", quote });
const observations = [cite("You stand in the Dock.", { kind: "place", name: "Dock", entered: true }), cite("An open corridor connects the Dock and Clinic in both directions.", { kind: "place", name: "Clinic" }), cite("An open corridor connects the Dock and Clinic in both directions.", { kind: "route", from: "Dock", to: "Clinic", via: "corridor", bidirectional: true, status: "open" }), cite("The supply log lists three free Rations in the Clinic.", { kind: "stock", site: "Clinic", name: "Rations", quantity: 3, available: true })];
let phase = "bootstrap", registrationId = "", timer: ReturnType<typeof setTimeout>;
const worker = new Worker(pathToFileURL(join(checkout, "src/spindle/worker-runtime.ts")).href);
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(new Error(`Exploration worker timed out at ${phase}`)), 20000); worker.onerror = reject;
    worker.onmessage = ({ data: e }) => {
      try {
        const respond = (result: unknown) => worker.postMessage({ type: "response", requestId: e.requestId, result });
        if (e.type === "register_interceptor") registrationId = e.registrationId;
        else if (e.type === "permissions_get_granted") respond(manifest.permissions);
        else if (e.type === "log") { if (e.level === "error") throw new Error(e.message); if (e.message === "__worker_ready__") worker.postMessage({ type: "frontend_message", userId: "fixture-user", payload: { type: "hello", chatId: "exploration-smoke" } }); }
        else if (e.type === "chats_get") respond({ id: "exploration-smoke", character_id: "station", metadata: {} });
        else if (e.type === "characters_get") respond({ id: "station", name: "Station", description: "An adult visitor explores a station.", world_book_ids: [] });
        else if (e.type === "chat_get_messages") respond(structuredClone(messages));
        else if (e.type === "connections_list") respond([]);
        else if (e.type === "enclave_has") respond(false);
        else if (e.type === "macros_resolve") respond({ text: e.template === "{{persona}}" ? "Sam is an adult visitor." : "Sam", diagnostics: [] });
        else if (e.type === "user_storage_read") { if (e.path === "settings.json") respond("{}"); else worker.postMessage({ type: "response", requestId: e.requestId, error: "Fixture file absent" }); }
        else if (e.type === "chat_update_message") { const m = messages.find(m => m.id === e.messageId); if (!m) throw new Error("Unknown message"); m.metadata = e.patch.metadata; respond(undefined); }
        else if (e.type === "request_generation") {
          const attempt = e.input.messages[0].content.includes("Determine whether");
          if (attempt) {
            const body = e.input.messages[1].content, state = JSON.parse(body.split("State:\n")[1].split("\nScene:")[0]).mechanics;
            respond({ content: JSON.stringify({ risky: false, contested: false, mechanicalActions: [{ kind: "travel", route: state.routes[0].id, quote: "I walk through the corridor to the Clinic" }, { kind: "gather", stock: state.stocks[0].id, amount: 2, quote: "take two Rations" }] }) });
          } else respond({ content: JSON.stringify({ changes: [], mechanicalObservations: observations }) });
        } else if (e.type === "frontend_message" && e.payload?.type === "living") {
          const state = e.payload.world.mechanics;
          if (phase === "bootstrap" && state?.stocks?.length && !e.payload.busy) {
            if (state.positions[0].name !== "Dock" || state.stocks[0].quantity !== 3) throw new Error("Bootstrap moved or depleted supplies");
            phase = "prepare"; messages.push(msg("action", "user", "I walk through the corridor to the Clinic and take two Rations.", 1), msg("reply", "assistant", "", 2));
            worker.postMessage({ type: "event", event: "GENERATION_STARTED", userId: "fixture-user", payload: { chatId: "exploration-smoke", generationId: "trip", targetMessageId: "reply", generationType: "normal" } });
            worker.postMessage({ type: "intercept_request", requestId: "trip", registrationId, messages: messages.filter(m => m.content).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), context: { chatId: "exploration-smoke", userId: "fixture-user", generationType: "normal" } });
          } else if (phase === "commit" && !e.payload.busy) {
            if (state?.positions?.[0].name !== "Clinic" || state.stocks[0].quantity !== 1 || state.items[0]?.quantity !== 2) throw new Error("Travel/gather did not conserve state");
            if (e.payload.world.place !== "Clinic" || e.payload.decision) throw new Error("Ordinary travel has the wrong place or an invented roll");
            done();
          }
        } else if (e.type === "intercept_result" && e.requestId === "trip") {
          const receipt = messages[1].metadata.warpLivingAttempt?.receipt;
          if (e.error || receipt?.engine !== 6 || receipt.status !== "ready" || receipt.operations.length !== 2) throw new Error("No atomic exploration receipt");
          if (messages[2].metadata.warpMechanics) throw new Error("Exploration committed before narration");
          phase = "commit"; messages[2].content = "You enter the Clinic and collect two Rations.";
          worker.postMessage({ type: "event", event: "GENERATION_ENDED", userId: "fixture-user", payload: { chatId: "exploration-smoke", generationId: "trip", messageId: "reply" } });
        } else if (e.requestId) worker.postMessage({ type: "response", requestId: e.requestId, error: `Unsupported fixture RPC ${e.type}` });
      } catch (error) { reject(error); }
    };
    worker.postMessage({ type: "init", manifest: { ...manifest, entry_backend: pathToFileURL(join(root, "dist/backend.js")).href }, storagePath: join(root, ".artifacts/exploration-worker-smoke") });
  });
  console.log("PASS: production worker prepared travel and gathering atomically, moved only after narration, conserved supplies, and retained the authoritative current place.");
} finally { clearTimeout(timer!); worker.terminate(); }
