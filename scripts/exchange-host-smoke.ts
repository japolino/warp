// Production backend in Lumiverse's real sandbox worker; all model/chat RPCs are disposable fixtures.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dir, ".."), checkout = resolve(process.argv[2] ?? "D:/Lumiverse");
const manifest = await Bun.file(join(root, "spindle.json")).json();
const qualitative = process.argv.includes("--qualitative");
const opening = "Jo stands at touch distance and prepares to strike you." + (qualitative ? "" : " You have 40 of 40 Health. Jo has 40 of 40 Health and 10 of 10 Focus.");
const description = qualitative ? "Jo can use Jab, a light physical strike at touch range." : "Jo can use Jab, costing 2 Focus to deal 10 physical Health damage at touch range.";
const message = (id: string, role: "user" | "assistant", content: string, index: number): any => ({ id, chat_id: "exchange-smoke", role, is_user: role === "user", content, index_in_chat: index, swipe_id: 0, metadata: {}, extra: {} });
const messages = [message("greeting", "assistant", opening, 0)];
let registrationId = "", phase = "bootstrap", receipt: any, timer: ReturnType<typeof setTimeout>;
const worker = new Worker(pathToFileURL(join(checkout, "src/spindle/worker-runtime.ts")).href);
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(new Error(`Exchange worker timed out at ${phase}`)), 20000);
    worker.onerror = reject;
    worker.onmessage = ({ data: e }) => {
      try {
        const respond = (result: unknown) => worker.postMessage({ type: "response", requestId: e.requestId, result });
        if (e.type === "register_interceptor") registrationId = e.registrationId;
        else if (e.type === "permissions_get_granted") respond(manifest.permissions);
        else if (e.type === "log") {
          if (e.level === "error") throw new Error(e.message);
          if (e.message === "__worker_ready__") worker.postMessage({ type: "frontend_message", userId: "fixture-user", payload: { type: "hello", chatId: "exchange-smoke" } });
        } else if (e.type === "chats_get") respond({ id: "exchange-smoke", character_id: "jo", metadata: {} });
        else if (e.type === "characters_get") respond({ id: "jo", name: "Jo", description, world_book_ids: [] });
        else if (e.type === "chat_get_messages") respond(structuredClone(messages));
        else if (e.type === "connections_list") respond([]);
        else if (e.type === "enclave_has") respond(false);
        else if (e.type === "macros_resolve") respond({ text: e.template === "{{persona}}" ? "Sam is an adult visitor." : "Sam", diagnostics: [] });
        else if (e.type === "user_storage_read") {
          if (e.path === "settings.json") respond("{}"); else worker.postMessage({ type: "response", requestId: e.requestId, error: "Fixture file absent" });
        } else if (e.type === "request_generation") {
          const system = e.input.messages[0].content, user = e.input.messages[1].content;
          const source = JSON.parse(user.split("\n").find((line: string) => line.startsWith('[{"id":"warp-source:')) ?? "[]").find((s: any) => s.kind === "card");
          if (!source) throw new Error("Missing production character source");
          respond({ content: JSON.stringify(system.includes("Determine whether") ? {
            risky: false, contested: false, approach: "movement", exchange: true, mechanicalActions: [{ kind: "defend", quote: "I guard my flank." }],
            responses: [{ actor: "Jo", action: { kind: "ability", ability: "Jab", target: "you" }, assessment: { contested: true, tier: "uncertain", intent: "Strike the player", stakes: "Leave an opening", reasons: ["You can resist"] }, message: "greeting", quote: "Jo stands at touch distance and prepares to strike you." }],
          } : { changes: [], mechanicalObservations: [
            { kind: "entity", name: "Jo", entityKind: "person", present: true, message: "greeting", quote: "Jo stands at touch distance and prepares to strike you." },
            { kind: "distance", from: "you", to: "Jo", band: "touch", message: "greeting", quote: "Jo stands at touch distance and prepares to strike you." },
            ...qualitative ? [] : [{ kind: "resource", id: "you-hp", owner: "you", name: "Health", role: "vital", current: 40, max: 40, message: "greeting", quote: "You have 40 of 40 Health." },
            { kind: "resource", id: "Jo-hp", owner: "Jo", name: "Health", role: "vital", current: 40, max: 40, message: "greeting", quote: "Jo has 40 of 40 Health and 10 of 10 Focus." },
            { kind: "resource", id: "Jo-focus", owner: "Jo", name: "Focus", role: "effort", current: 10, max: 10, message: "greeting", quote: "Jo has 40 of 40 Health and 10 of 10 Focus." }],
          ], abilityDefinitions: [{ owner: "Jo", name: "Jab", approach: "force", target: "other", range: "touch", costs: qualitative ? [] : [{ kind: "resource", id: "Jo-focus", amount: 2 }], effects: qualitative ? [{ kind: "harm", target: "target", impact: "minor", damageType: "physical" }] : [{ kind: "damage", target: "target", resource: "Health", amount: 10, damageType: "physical" }], message: source.id, quote: description }] }) });
        } else if (e.type === "chat_update_message") {
          const target = messages.find(m => m.id === e.messageId); if (!target) throw new Error("Unknown fixture message");
          target.metadata = e.patch.metadata; respond(undefined);
        } else if (e.type === "frontend_message" && e.payload?.type === "living") {
          const state = e.payload.world.mechanics;
          if (phase === "bootstrap" && state?.abilities?.length === 1 && !e.payload.busy) {
            if (!registrationId) throw new Error("Missing production interceptor");
            phase = "prepare"; messages.push(message("player", "user", "I guard my flank.", 1), message("reply", "assistant", "", 2));
            worker.postMessage({ type: "event", event: "GENERATION_STARTED", userId: "fixture-user", payload: { chatId: "exchange-smoke", generationId: "exchange-generation", targetMessageId: "reply", generationType: "normal" } });
            worker.postMessage({ type: "intercept_request", requestId: "exchange", registrationId, messages: messages.filter(m => m.content).map(m => ({ role: m.role, content: m.content, sourceMessageId: m.id })), context: { chatId: "exchange-smoke", userId: "fixture-user", generationType: "normal" } });
          } else if (phase === "commit" && !e.payload.busy) {
            const check = receipt.beats.find((b: any) => b.kind === "response").decision;
            if (qualitative) {
              if (state.resources.length) throw new Error("Invented a numerical resource");
              const load = state.conditions.find((c: any) => c.owner === "you" && c.injury)?.injury.load ?? 0;
              if (load !== (check.result === "setback" ? 0 : 0.5)) throw new Error("The guard did not reduce the actual qualitative injury");
            } else {
              const health = state.resources.find((r: any) => r.id === "you-hp").current, focus = state.resources.find((r: any) => r.id === "Jo-focus").current;
              if (health !== (check.result === "setback" ? 40 : 35) || focus !== 8) throw new Error("The exchange did not commit both actors correctly");
            }
            if (state.clocks.length !== 2 || state.clocks.some((c: any) => c.actions !== 1)) throw new Error("Wrong actor timing");
            if (e.payload.responses?.[0]?.decision?.roll !== check.roll) throw new Error("Saved NPC roll did not reach the frontend");
            done();
          }
        } else if (e.type === "intercept_result" && e.requestId === "exchange") {
          receipt = messages[1].metadata.warpLivingAttempt?.receipt;
          if (e.error || receipt?.status !== "ready" || receipt?.engine !== 4 || !receipt.beats.some((b: any) => b.kind === "response")) throw new Error("No production exchange receipt");
          if (messages[2].metadata.warpMechanics) throw new Error("Committed before narration completed");
          phase = "commit"; messages[2].content = "Jo attempts the jab while you guard.";
          worker.postMessage({ type: "event", event: "GENERATION_ENDED", userId: "fixture-user", payload: { chatId: "exchange-smoke", generationId: "exchange-generation", messageId: "reply", content: messages[2].content } });
        } else if (e.requestId) worker.postMessage({ type: "response", requestId: e.requestId, error: `Unsupported fixture RPC ${e.type}` });
      } catch (error) { reject(error); }
    };
    worker.postMessage({ type: "init", manifest: { ...manifest, entry_backend: pathToFileURL(join(root, "dist/backend.js")).href }, storagePath: join(root, ".artifacts/exchange-worker-smoke") });
  });
  console.log(qualitative ? "PASS: production sandbox resolved a stat-free card's guarded injury, invented no Health or Focus, committed both clocks and published the saved NPC roll." : "PASS: production sandbox prepared one exchange, applied the player's guard and NPC ability/cost, committed both clocks, and published the saved NPC roll.");
} finally { clearTimeout(timer!); worker.terminate(); }
