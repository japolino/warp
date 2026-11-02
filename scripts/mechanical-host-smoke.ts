// Production bundle + Lumiverse's actual sandbox worker. All chat/model RPCs are fixtures.
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const checkout = resolve(process.argv[2] ?? "D:/Lumiverse"), root = resolve(import.meta.dir, "..");
const manifest = await Bun.file(join(root, "spindle.json")).json();
const message = (id: string, role: "user" | "assistant", content: string, index: number): any => ({ id, chat_id: "smoke", role, is_user: role === "user", content, index_in_chat: index, swipe_id: 0, metadata: {}, extra: {} });
const messages = [message("greeting", "assistant", "Jo waits in the café. You have three bandages.", 0)];
const types = new Set<string>();
let registrationId = "", phase = "bootstrap", timer: ReturnType<typeof setTimeout>;
const worker = new Worker(pathToFileURL(join(checkout, "src/spindle/worker-runtime.ts")).href);
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(new Error(`Mechanical worker smoke timed out at ${phase}: ${[...types].join(", ")}`)), 15000);
    worker.onerror = reject;
    worker.onmessage = ({ data: event }) => {
      try {
        types.add(event.type);
        const respond = (result: unknown) => worker.postMessage({ type: "response", requestId: event.requestId, result });
        if (event.type === "register_interceptor") registrationId = event.registrationId;
        else if (event.type === "permissions_get_granted") respond(manifest.permissions);
        else if (event.type === "log") {
          if (event.level === "error") throw new Error(event.message);
          if (event.message === "__worker_ready__") worker.postMessage({ type: "frontend_message", userId: "fixture-user", payload: { type: "hello", chatId: "smoke" } });
        } else if (event.type === "chats_get") respond({ id: "smoke", character_id: "jo", metadata: {} });
        else if (event.type === "characters_get") respond({ id: "jo", name: "Jo", description: "Jo runs a café.", world_book_ids: [] });
        else if (event.type === "chat_get_messages") respond(structuredClone(messages));
        else if (event.type === "connections_list") respond([]);
        else if (event.type === "enclave_has") respond(false);
        else if (event.type === "macros_resolve") respond({ text: "Sam", warnings: [] });
        else if (event.type === "user_storage_read") {
          if (event.path === "settings.json") respond("{}");
          else worker.postMessage({ type: "response", requestId: event.requestId, error: "Fixture file not found" });
        } else if (event.type === "request_generation") {
          const system = event.input.messages[0]?.content ?? "";
          respond({ content: JSON.stringify(system.includes("Determine whether")
            ? { risky: false, contested: false, approach: "other", mechanicalActions: [{ kind: "consume", item: "bandages", amount: 1, quote: "I use a bandage." }] }
            : { changes: [], mechanicalObservations: [{ kind: "item", id: "bandages", owner: "you", name: "Bandages", quantity: 3, message: "greeting", quote: "three bandages" }] }) });
        } else if (event.type === "chat_update_message") {
          const target = messages.find(m => m.id === event.messageId);
          if (!target) throw new Error(`Unknown fixture message: ${JSON.stringify(event)}`);
          target.metadata = event.patch.metadata; respond(undefined);
        } else if (event.type === "frontend_message" && event.payload?.type === "living") {
          const items = event.payload.world.mechanics?.items;
          if (phase === "bootstrap" && items?.[0]?.quantity === 3) {
            if (!registrationId) throw new Error("No registered production interceptor");
            phase = "prepare";
            messages.push(message("player", "user", "I use a bandage.", 1), message("reply", "assistant", "", 2));
            worker.postMessage({ type: "event", event: "GENERATION_STARTED", userId: "fixture-user", payload: { chatId: "smoke", generationId: "generation", targetMessageId: "reply", generationType: "normal" } });
            worker.postMessage({ type: "intercept_request", requestId: "mechanical-action", registrationId, messages: messages.filter(m => m.content).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), context: { chatId: "smoke", userId: "fixture-user", generationType: "normal", isDryRun: false } });
          } else if (phase === "commit" && !event.payload.busy && items?.[0]?.quantity === 2) {
            if (!event.payload.notes.includes("Bandages: 2 left")) throw new Error("Missing committed change note");
            done();
          }
        } else if (event.type === "intercept_result" && event.requestId === "mechanical-action") {
          if (event.error || !JSON.stringify(event.messages).includes("mechanical receipt")) throw new Error(`Missing prepared receipt: ${event.error ?? ""}`);
          if (messages[2].metadata.warpMechanics) throw new Error("Spent the bandage before reply completion");
          phase = "commit"; messages[2].content = "You bind the wound with a bandage.";
          worker.postMessage({ type: "event", event: "GENERATION_ENDED", userId: "fixture-user", payload: { chatId: "smoke", generationId: "generation", messageId: "reply", content: messages[2].content } });
        } else if (event.requestId) worker.postMessage({ type: "response", requestId: event.requestId, error: `Unsupported fixture RPC: ${event.type}` });
      } catch (error) { reject(error); }
    };
    worker.postMessage({ type: "init", manifest: { ...manifest, entry_backend: pathToFileURL(join(root, "dist/backend.js")).href }, storagePath: join(root, ".artifacts/mechanical-worker-smoke") });
  });
  console.log("PASS: production backend bootstrapped counted inventory, prepared a use before narration, and committed it once with an inline change note inside Lumiverse's sandbox worker.");
} finally { clearTimeout(timer!); worker.terminate(); }
