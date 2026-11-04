// Production sandbox worker with disposable chat/model RPC fixtures. No account or provider traffic.
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve(import.meta.dir, ".."), checkout = resolve(process.argv[2] ?? "D:/Lumiverse");
const manifest = await Bun.file(join(root, "spindle.json")).json();
const opening = "You have 30 Focus. Ada, Bryn and Cora face you in the practice ring. Pulse costs 2 Focus and briefly disorients another person.";
const msg = (id: string, role: string, content: string, index: number): any => ({ id, role, content, is_user: role === "user", index_in_chat: index, swipe_id: 0, chat_id: "growth-smoke", metadata: {}, extra: {} });
const messages = [msg("opening", "assistant", opening, 0)], cite = (row: object) => ({ ...row, message: "opening", quote: opening });
const observations = [cite({kind:"resource",id:"focus",owner:"you",name:"Focus",current:30}), ...["Ada","Bryn","Cora"].map(name=>cite({kind:"entity",name,entityKind:"person",present:true}))];
const abilityDefinitions = [cite({owner:"you",name:"Pulse",approach:"concentration",target:"other",costs:[{kind:"resource",id:"focus",amount:2}],effects:[{kind:"condition",target:"target",name:"Disoriented",hinders:["perception"],ending:"After a pause"}],requires:[],unsupported:[]})];
let step=0;
let phase = "bootstrap", registrationId = "", timer: ReturnType<typeof setTimeout>;
const worker = new Worker(pathToFileURL(join(checkout, "src/spindle/worker-runtime.ts")).href);
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(new Error(`Growth worker timed out at ${phase}`)), 20000); worker.onerror = reject;
    worker.onmessage = ({ data: e }) => {
      try {
        const respond = (result: unknown) => worker.postMessage({ type: "response", requestId: e.requestId, result });
        if (e.type === "register_interceptor") registrationId = e.registrationId;
        else if (e.type === "permissions_get_granted") respond(manifest.permissions);
        else if (e.type === "log") { if (e.level === "error") throw new Error(e.message); if (e.message === "__worker_ready__") worker.postMessage({ type: "frontend_message", userId: "fixture-user", payload: { type: "hello", chatId: "growth-smoke" } }); }
        else if (e.type === "chats_get") respond({ id: "growth-smoke", character_id: "station", metadata: {} });
        else if (e.type === "characters_get") respond({ id: "station", name: "Station", description: "An adult visitor practices an established technique.", world_book_ids: [] });
        else if (e.type === "chat_get_messages") respond(structuredClone(messages));
        else if (e.type === "connections_list") respond([]);
        else if (e.type === "enclave_has") respond(false);
        else if (e.type === "macros_resolve") respond({ text: e.template === "{{persona}}" ? "Sam is an adult visitor." : "Sam", diagnostics: [] });
        else if (e.type === "user_storage_read") { if (e.path === "settings.json") respond("{}"); else worker.postMessage({ type: "response", requestId: e.requestId, error: "Fixture file absent" }); }
        else if (e.type === "chat_update_message") { const m = messages.find(m => m.id === e.messageId); if (!m) throw new Error("Unknown message"); m.metadata = e.patch.metadata; respond(undefined); }
        else if (e.type === "request_generation") {
          const attempt = e.input.messages[0].content.includes("Determine whether");
          if (attempt) {
            const target=["Ada","Bryn","Cora"][step-1];
            respond({content:JSON.stringify({risky:true,contested:true,tier:"uncertain",approach:"concentration",target,intent:"Disorient the resisting opponent",stakes:"Lose the opening",reasons:["The opponent resists"],mechanicalActions:[{kind:"ability",ability:"Pulse",target,quote:`I cast Pulse at ${target}.`}]})});
          } else respond({ content: JSON.stringify({ changes: [], mechanicalObservations: observations, abilityDefinitions }) });
        } else if (e.type === "frontend_message" && e.payload?.type === "living") {
          const state = e.payload.world.mechanics;
          const start = (name: string, action: string) => {
            phase = `prepare-${name}`;
            messages.push(msg(`action-${name}`, "user", action, messages.length), msg(`reply-${name}`, "assistant", "", messages.length+1));
            worker.postMessage({type:"event",event:"GENERATION_STARTED",userId:"fixture-user",payload:{chatId:"growth-smoke",generationId:name,targetMessageId:`reply-${name}`,generationType:"normal"}});
            worker.postMessage({type:"intercept_request",requestId:name,registrationId,messages:messages.filter(m=>m.content).map(m=>({role:m.role,content:m.content,sourceMessageId:m.id})),context:{chatId:"growth-smoke",userId:"fixture-user",generationType:"normal"}});
          };
          if (phase === "bootstrap" && state?.abilities?.length && !e.payload.busy) {
            if(state.resources[0].current!==30 || state.growth?.length) throw Error("Bootstrap spent or trained");
            step=1; start("step1","I cast Pulse at Ada.");
          } else if (phase === `commit-step${step}` && !e.payload.busy) {
            if(state.resources[0].current!==30-2*step || state.growth?.[0]?.credits.length!==step) throw Error("Practice lost a debit or an eligible opportunity");
            if(state.growth[0].familiar!==(step===3)) throw Error("Milestone occurred at the wrong opportunity");
            if(!Number.isInteger(e.payload.decision?.roll)) throw Error("No saved engine roll");
            if(step===3){if(!e.payload.notes?.includes("Pulse: familiar"))throw Error("Milestone was not visible");done();}
            else {step++;start(`step${step}`,`I cast Pulse at ${["Ada","Bryn","Cora"][step-1]}.`);}
          }
        } else if(e.type==="intercept_result" && e.requestId===`step${step}`){
          const action=messages.at(-2)!,reply=messages.at(-1)!,receipt=action.metadata.warpLivingAttempt?.receipt;
          if(e.error || receipt?.engine!==8 || receipt.status!=="ready" || !receipt.learning || !receipt.changes.some((c:any)=>c.kind==="growth"))throw Error("No saved practice receipt");
          if(reply.metadata.warpMechanics)throw Error("Practice committed before narration");
          phase=`commit-step${step}`;reply.content="The opponent reacts to the recorded attempt.";
          worker.postMessage({type:"event",event:"GENERATION_ENDED",userId:"fixture-user",payload:{chatId:"growth-smoke",generationId:e.requestId,messageId:reply.id}});
        } else if (e.requestId) worker.postMessage({ type: "response", requestId: e.requestId, error: `Unsupported fixture RPC ${e.type}` });
      } catch (error) { reject(error); }
    };
    worker.postMessage({ type: "init", manifest: { ...manifest, entry_backend: pathToFileURL(join(root, "dist/backend.js")).href }, storagePath: join(root, ".artifacts/growth-worker-smoke") });
  });
  console.log("PASS: production worker saved real deterministic checks, committed practice and costs only after narration, and exposed one familiarity milestone after three varied opponents.");
} finally { clearTimeout(timer!); worker.terminate(); }
