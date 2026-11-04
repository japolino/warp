// Production sandbox worker with disposable chat/model RPC fixtures. No account or provider traffic.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(import.meta.dir, ".."), checkout = resolve(process.argv[2] ?? "D:/Lumiverse");
const manifest = await Bun.file(join(root, "spindle.json")).json();
const opening = "Echo is your summoned familiar, currently absent. Echo has an injured wing. You have 12 of 12 Focus. Echo has 0 of 8 Focus. Echo's Focus costs are paid one for one from your Focus. Recall costs 2 Focus to summon Echo. Echo's Beacon costs 3 Focus and grants a Beacon condition until dismissed.";
const msg = (id: string, role: string, content: string, index: number): any => ({ id, role, content, is_user: role === "user", index_in_chat: index, swipe_id: 0, chat_id: "companion-smoke", metadata: {}, extra: {} });
const messages = [msg("opening", "assistant", opening, 0)], cite = (row: object) => ({ ...row, message: "opening", quote: opening });
const observations = [
 cite({kind:"entity",name:"Echo",entityKind:"person",present:false}),
 cite({kind:"resource",id:"focus",owner:"you",name:"Focus",current:12,max:12,role:"effort"}),
 cite({kind:"resource",id:"echo-focus",owner:"Echo",name:"Focus",current:0,max:8,role:"effort"}),
 cite({kind:"companion",actor:"Echo",controller:"you",companionKind:"summon"}),
 cite({kind:"cost_link",from:"echo-focus",to:"focus",enabled:true,unsupported:[]}),
 cite({kind:"condition",id:"wing",owner:"Echo",name:"Injured wing",hinders:["movement"],ending:"After treatment"}),
];
const abilityDefinitions = [
 cite({owner:"you",name:"Recall",approach:"concentration",target:"self",costs:[{kind:"resource",id:"focus",amount:2}],effects:[{kind:"summon",target:"self",companion:"Echo"}],requires:[],unsupported:[]}),
 cite({owner:"Echo",name:"Beacon",approach:"concentration",target:"self",costs:[{kind:"resource",id:"echo-focus",amount:3}],effects:[{kind:"condition",target:"self",name:"Beacon",ending:"Until dismissed",untilDismissed:true}],requires:[],unsupported:[]}),
];
let phase = "bootstrap", registrationId = "", timer: ReturnType<typeof setTimeout>;
const worker = new Worker(pathToFileURL(join(checkout, "src/spindle/worker-runtime.ts")).href);
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(new Error(`Companion worker timed out at ${phase}`)), 20000); worker.onerror = reject;
    worker.onmessage = ({ data: e }) => {
      try {
        const respond = (result: unknown) => worker.postMessage({ type: "response", requestId: e.requestId, result });
        if (e.type === "register_interceptor") registrationId = e.registrationId;
        else if (e.type === "permissions_get_granted") respond(manifest.permissions);
        else if (e.type === "log") { if (e.level === "error") throw new Error(e.message); if (e.message === "__worker_ready__") worker.postMessage({ type: "frontend_message", userId: "fixture-user", payload: { type: "hello", chatId: "companion-smoke" } }); }
        else if (e.type === "chats_get") respond({ id: "companion-smoke", character_id: "station", metadata: {} });
        else if (e.type === "characters_get") respond({ id: "station", name: "Station", description: "An adult visitor and an established familiar.", world_book_ids: [] });
        else if (e.type === "chat_get_messages") respond(structuredClone(messages));
        else if (e.type === "connections_list") respond([]);
        else if (e.type === "enclave_has") respond(false);
        else if (e.type === "macros_resolve") respond({ text: e.template === "{{persona}}" ? "Sam is an adult visitor." : "Sam", diagnostics: [] });
        else if (e.type === "user_storage_read") { if (e.path === "settings.json") respond("{}"); else worker.postMessage({ type: "response", requestId: e.requestId, error: "Fixture file absent" }); }
        else if (e.type === "chat_update_message") { const m = messages.find(m => m.id === e.messageId); if (!m) throw new Error("Unknown message"); m.metadata = e.patch.metadata; respond(undefined); }
        else if (e.type === "request_generation") {
          const attempt = e.input.messages[0].content.includes("Determine whether");
          if (attempt) {
            const recall = phase === "prepare-recall";
            respond({ content: JSON.stringify({ risky:false, contested:false, exchange:!recall,
              mechanicalActions: recall ? [{kind:"ability",ability:"Recall",quote:"I summon Echo."}] : [{kind:"wait",quote:"I wait."}],
              ...(!recall ? {responses:[{actor:"Echo",action:{kind:"ability",ability:"Beacon"},assessment:{contested:false},message:"reply-recall",quote:"Echo offers to light Beacon."}]} : {}) }) });
          } else respond({ content: JSON.stringify({ changes: [], mechanicalObservations: observations, abilityDefinitions }) });
        } else if (e.type === "frontend_message" && e.payload?.type === "living") {
          const state = e.payload.world.mechanics;
          const start = (name: string, action: string) => {
            phase = `prepare-${name}`;
            messages.push(msg(`action-${name}`, "user", action, messages.length), msg(`reply-${name}`, "assistant", "", messages.length+1));
            worker.postMessage({type:"event",event:"GENERATION_STARTED",userId:"fixture-user",payload:{chatId:"companion-smoke",generationId:name,targetMessageId:`reply-${name}`,generationType:"normal"}});
            worker.postMessage({type:"intercept_request",requestId:name,registrationId,messages:messages.filter(m=>m.content).map(m=>({role:m.role,content:m.content,sourceMessageId:m.id})),context:{chatId:"companion-smoke",userId:"fixture-user",generationType:"normal"}});
          };
          if (phase === "bootstrap" && state?.companions?.length && !e.payload.busy) {
            if (state.resources[0].current!==12 || state.entities[0].present) throw Error("Bootstrap spent or manifested");
            start("recall","I summon Echo.");
          } else if (phase === "commit-recall" && !e.payload.busy) {
            if (state.resources[0].current!==10 || !state.entities[0].present || state.conditions[0].id!=="wing") throw Error("Recall lost identity, injury or cost");
            start("beacon","I wait.");
          } else if (phase === "commit-beacon" && !e.payload.busy) {
            if (state.resources[0].current!==7 || state.resources[1].current!==0 || !state.conditions.some((c:any)=>c.name==="Beacon") || state.conditions[0].id!=="wing") throw Error("Shared cost failed conservation");
            if(e.payload.decision) throw Error("Routine action invented a roll");
            done();
          }
        } else if (e.type === "intercept_result" && ["recall","beacon"].includes(e.requestId)) {
          const action=messages.at(-2)!, reply=messages.at(-1)!,receipt=action.metadata.warpLivingAttempt?.receipt;
          if(e.error || receipt?.engine!==7 || receipt.status!=="ready") throw Error("No saved companion receipt");
          if(reply.metadata.warpMechanics) throw Error("Companion operation committed before narration");
          phase=`commit-${e.requestId}`;reply.content=e.requestId==="recall" ? "Echo appears with the same injured wing. Echo offers to light Beacon." : "Echo lights Beacon.";
          worker.postMessage({type:"event",event:"GENERATION_ENDED",userId:"fixture-user",payload:{chatId:"companion-smoke",generationId:e.requestId,messageId:reply.id}});
        } else if (e.requestId) worker.postMessage({ type: "response", requestId: e.requestId, error: `Unsupported fixture RPC ${e.type}` });
      } catch (error) { reject(error); }
    };
    worker.postMessage({ type: "init", manifest: { ...manifest, entry_backend: pathToFileURL(join(root, "dist/backend.js")).href }, storagePath: join(root, ".artifacts/companion-worker-smoke") });
  });
  console.log("PASS: production worker recalled the same injured familiar, committed only after narration and charged a sourced companion action to its shared payer once.");
} finally { clearTimeout(timer!); worker.terminate(); }
