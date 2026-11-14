/** Actual Lumiverse worker and tool RPC; disposable fixed reader/narrator responses. */
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { revision } from "../src/shared/revision.js";
const root = resolve(import.meta.dir, ".."), checkout = resolve(process.argv[2] ?? "D:/Lumiverse"), chatId = "native-aid-smoke";
const manifest = await Bun.file(join(root, "spindle.json")).json();
const opening = "Jo stands within arm's reach in the clinic. Jo has 10 Focus. You have a small routine cooking burn.";
const profile = "Jo's Mend gently treats routine physical injury at touch range and costs 2 Focus.";
const msg = (id: string, role: string, content: string, index: number): any => ({ id, role, content, is_user: role === "user", index_in_chat: index, swipe_id: 0, chat_id: chatId, metadata: {}, extra: {} });
const messages = [msg("opening", "assistant", opening, 0)];
let worker: Worker, registrationId = "", toolRegistered = false, phase = "bootstrap", wire: any[] = [], args: any, firstResult = "", expectedReload = "", timer: ReturnType<typeof setTimeout>;
try {
  await new Promise<void>((done, reject) => {
    timer = setTimeout(() => reject(Error(`Native aid worker timed out at ${phase}`)), 30000);
    const invoke = (requestId: string, userId = "fixture-user") => worker.postMessage({ type: "tool_invocation", requestId, userId, toolName: "npc_aid", args, contextMessages: wire });
    const launch = () => {
      worker = new Worker(pathToFileURL(join(checkout, "src/spindle/worker-runtime.ts")).href); worker.onerror = reject;
      worker.onmessage = ({data:e}) => {
        try {
          const respond = (result: unknown) => worker.postMessage({type:"response",requestId:e.requestId,result});
          if (e.type === "register_interceptor") registrationId = e.registrationId;
          else if (e.type === "permissions_get_granted") respond(manifest.permissions);
          else if (e.type === "register_tool") { if (e.tool.name !== "npc_aid" || !e.tool.inline_available || e.tool.parameters.properties.turn.enum) throw Error("Invalid native schema"); toolRegistered = true; }
          else if (e.type === "log") { if (e.level === "error") throw Error(e.message); if (e.message === "__worker_ready__") worker.postMessage({type:"frontend_message",userId:"fixture-user",payload:{type:"hello",chatId}}); }
          else if (e.type === "chats_get") respond({id:chatId,character_id:"jo",metadata:{}});
          else if (e.type === "characters_get") respond({id:"jo",name:"Jo",description:profile,world_book_ids:[]});
          else if (e.type === "chat_get_messages") respond(structuredClone(messages));
          else if (e.type === "connections_list") respond([]);
          else if (e.type === "enclave_has") respond(false);
          else if (e.type === "macros_resolve") respond({text:e.template==="{{persona}}"?"Sam is an adult visitor.":"Sam",diagnostics:[]});
          else if (e.type === "user_storage_read") { if (e.path==="settings.json") respond("{}"); else worker.postMessage({type:"response",requestId:e.requestId,error:"Disposable fixture absent"}); }
          else if (e.type === "chat_update_message") { const m=messages.find(m=>m.id===e.messageId); if(!m) throw Error("Unknown fixture message"); m.metadata=e.patch.metadata; respond(undefined); }
          else if (e.type === "request_generation") {
            if (phase === "reload") throw Error("Reload requested a model call");
            if (e.input.messages[0].content.includes("Determine whether")) throw Error("A direct request added an unnecessary foreground model call");
            const sources = JSON.parse(e.input.messages[1].content.split("\n").find((l:string)=>l.startsWith('[{"id":"warp-source:'))??"[]"), source=sources.find((s:any)=>s.kind==="card");
            const latest=[...messages].reverse().find(m=>!m.is_user&&m.content)!;
            const cite=(row:object)=>({...row,message:"opening",quote:opening});
            respond({content:JSON.stringify({changes:[],scene:{place:"clinic",present:["Jo"],message:latest.id,quote:latest.content},mechanicalObservations:[cite({kind:"entity",name:"Jo",entityKind:"person",present:true}),cite({kind:"distance",from:"you",to:"Jo",band:"touch"}),cite({kind:"resource",owner:"Jo",id:"focus",name:"Focus",current:10,role:"effort"}),cite({kind:"condition",owner:"you",id:"burn",name:"Cooking burn",category:"physical_injury",severity:"minor",recovery:"routine",helps:[],hinders:["movement"],blocks:[],ending:"Treatment"})],abilityDefinitions:[{owner:"Jo",name:"Mend",approach:"concentration",target:"other",range:"touch",costs:[{kind:"resource",id:"focus",amount:2}],effects:[{kind:"mend",target:"target",impact:"minor"}],requires:[],unsupported:[],message:source.id,quote:profile}]})});
          } else if (e.type === "intercept_result") {
            if(e.error) throw Error(e.error); wire=e.messages;
            const invitation=messages[1].metadata.warpLivingPrompt?.["0"].packet.narratorAid;
            if(!toolRegistered||invitation?.choices?.length!==1) throw Error("No native invitation in the actual worker");
            args={turn:invitation.turn,actor:invitation.choices[0].actor,ability:invitation.choices[0].ability}; phase="foreign";invoke("foreign","another-user");
          } else if (e.type === "tool_invocation_result") {
            if(e.error) throw Error(e.error); const result=JSON.parse(e.result);
            if(e.requestId==="foreign") { if(result.status!=="blocked") throw Error("Foreign caller was accepted");phase="prepare";invoke("first"); }
            else if(e.requestId==="first") { if(result.status!=="ready"||!result.receipt.events.some((b:any)=>b.kind==="mend"&&b.actor==="Jo")) throw Error("Native aid was not correctly prepared: "+e.result);if(messages[2].metadata.warpMechanics)throw Error("Aid committed before narration");firstResult=e.result;invoke("duplicate"); }
            else if(e.requestId==="duplicate") {if(e.result!==firstResult)throw Error("Duplicate call changed the result");phase="commit";messages[2].content="Jo chooses to help and uses Mend to treat your cooking burn.";worker.postMessage({type:"event",event:"GENERATION_ENDED",userId:"fixture-user",payload:{chatId,generationId:"native-turn",messageId:"reply"}});}
          } else if(e.type==="frontend_message"&&e.payload?.type==="living"&&!e.payload.busy) {
            const state=e.payload.world.mechanics;
            if(phase==="bootstrap"&&state?.abilities?.length===1) {phase="intercept";messages.push(msg("request","user",'"Could you treat my arm?"',1),msg("reply","assistant","",2));worker.postMessage({type:"event",event:"GENERATION_STARTED",userId:"fixture-user",payload:{chatId,generationId:"native-turn",targetMessageId:"reply",generationType:"normal"}});worker.postMessage({type:"intercept_request",requestId:"native",registrationId,messages:messages.filter(m=>m.content).map(m=>({role:m.role,content:m.content,sourceMessageId:m.id})),context:{chatId,userId:"fixture-user",generationType:"normal"}});}
            else if(phase==="commit") {if(state.resources[0].current!==8||state.conditions.length||state.applied.length!==1||messages[2].metadata.warpMechanics?.["0"].receipt?.engine!==13)throw Error("Native aid did not commit once");expectedReload=revision(state);phase="reload";worker.terminate();launch();}
            else if(phase==="reload") {if(revision(state)!==expectedReload)throw Error("Reload repeated or lost aid");done();}
          } else if(e.requestId) worker.postMessage({type:"response",requestId:e.requestId,error:`Unsupported fixture RPC ${e.type}`});
        } catch(error) {reject(error);}
      };
      worker.postMessage({type:"init",manifest:{...manifest,entry_backend:pathToFileURL(join(root,"dist/backend.js")).href},storagePath:join(root,".artifacts/native-aid-worker-smoke")});
    }; launch();
  });
  console.log("PASS: actual worker registers a stable native tool, binds a narrator action to its authenticated prompt, rejects a foreign caller, reuses duplicate preparation, commits one NPC-owned use after narration, and reloads without another model call.");
} finally {clearTimeout(timer!);worker!.terminate();}
