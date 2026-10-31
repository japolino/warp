// Run the built backend inside the target checkout's real Spindle worker.
// All host data and model responses are disposable fixtures, never user chats.
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const checkout = resolve(process.argv[2] ?? "D:/Lumiverse");
const root = resolve(import.meta.dir, "..");
const manifest = await Bun.file(join(root, "spindle.json")).json();
const message: any = { id: "greeting", chat_id: "smoke", role: "assistant", is_user: false, content: "Jo waits in the café. You own a distinctive jacket.", index_in_chat: 0, swipe_id: 0, metadata: {}, extra: {} };
const types = new Set<string>();
let writes = 0, timer: ReturnType<typeof setTimeout>;
const worker = new Worker(pathToFileURL(join(checkout, "src/spindle/worker-runtime.ts")).href);
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(new Error(`Worker timed out. Messages: ${[...types].join(", ")}`)), 10000);
    worker.onerror = reject;
    worker.onmessage = ({ data: event }) => {
      types.add(event.type);
      const respond = (result: unknown) => worker.postMessage({ type: "response", requestId: event.requestId, result });
      if (event.type === "permissions_get_granted") respond(manifest.permissions);
      else if (event.type === "log") {
        if (event.level === "error") reject(new Error(event.message));
        if (event.message === "__worker_ready__") worker.postMessage({ type: "frontend_message", userId: "fixture-user", payload: { type: "hello", chatId: "smoke" } });
      } else if (event.type === "chats_get") respond({ id: "smoke", character_id: "jo", metadata: {} });
      else if (event.type === "characters_get") respond({ id: "jo", name: "Jo", description: "Jo runs a café.", world_book_ids: [] });
      else if (event.type === "chat_get_messages") respond([structuredClone(message)]);
      else if (event.type === "connections_list") respond([]);
      else if (event.type === "enclave_has") respond(false);
      else if (event.type === "user_storage_read") {
        if (event.path === "settings.json") respond("{}");
        else worker.postMessage({ type: "response", requestId: event.requestId, error: "Fixture file not found" });
      }
      else if (event.type === "request_generation") respond({ content: JSON.stringify({ scene: { place: "The café", present: ["Jo"], message: "greeting", quote: "Jo waits in the café." }, changes: [{ op: "put", id: "jacket", kind: "possession", subject: "jacket", holder: "you", text: "Distinctive jacket", message: "greeting", quote: "You own a distinctive jacket." }] }) });
      else if (event.type === "chat_update_message") { message.metadata = event.patch.metadata; writes++; respond(undefined); }
      else if (event.type === "frontend_message" && event.payload?.type === "living" && event.payload.world.facts.length) {
        if (event.payload.world.place !== "The café" || event.payload.world.facts[0].holder !== "you" || writes !== 1) reject(new Error("Worker scene mismatch"));
        else done();
      } else if (event.requestId) worker.postMessage({ type: "response", requestId: event.requestId, error: `Unsupported fixture RPC: ${event.type}` });
    };
    worker.postMessage({ type: "init", manifest: { ...manifest, entry_backend: pathToFileURL(join(root, "dist/backend.js")).href }, storagePath: join(root, ".artifacts/worker-smoke") });
  });
  console.log("PASS: built Warp loaded in Lumiverse's sandboxed worker, initialized an unconfigured chat, and committed a sourced possession without a ruleset install.");
} finally { clearTimeout(timer!); worker.terminate(); }
