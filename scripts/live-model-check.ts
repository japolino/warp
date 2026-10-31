// Exercise Warp with the existing Lumiverse model connection and synthetic RP data.
// No credentials, private cards or real chat history are printed or exported.
import { Database } from "bun:sqlite";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const checkout = resolve(process.argv[2] ?? "D:/Lumiverse");
const inspect = process.argv.includes("--inspect");
const playtest = process.argv.includes("--playtest");
const readonly = new Database(join(checkout, "data/lumiverse.db"), { readonly: true });
const installed = readonly.query("SELECT installed_by_user_id FROM extensions WHERE identifier = ?").get("warp") as { installed_by_user_id?: string } | null;
const users = readonly.query('SELECT id FROM "user"').all() as { id: string }[];
const owner = installed?.installed_by_user_id || (users.length === 1 ? users[0].id : null);
readonly.close();
if (!owner) throw new Error("Cannot identify the existing Warp account unambiguously. No model call was made.");
const load = (path: string) => import(pathToFileURL(join(checkout, path)).href);
const database = await load("src/db/connection.ts");
database.initDatabase(join(checkout, "data/lumiverse.db"));
try {
  const connections = await load("src/services/connections.service.ts");
  const id = connections.resolveActingConnectionId(owner);
  const profile = id ? connections.getConnection(owner, id) : null;
  if (!profile) throw new Error("The existing Warp account has no active model connection. No model call was made.");
  console.log(JSON.stringify({ accountIdentified: true, existingConnection: true, provider: profile.provider, model: profile.model, mode: inspect ? "inspect" : "live" }));
  if (!inspect) {
    const config = await load("src/env.ts");
    if (resolve(config.env.dataDir) !== join(checkout, "data") || !await Bun.file(join(checkout, "data/lumiverse.identity")).exists()) throw new Error("The existing installation identity was not found at the expected location. No model call was made.");
    await (await load("src/crypto/init.ts")).initIdentity();
    const { quietGenerate } = await load("src/services/generation/direct-generation.ts");
    if (playtest) {
      const { runPlaytest } = await import("./live-playtest.js");
      await runPlaytest(async (input: any) => quietGenerate(owner, { ...input, connection_id: id }));
    } else {
    const result = await quietGenerate(owner, { connection_id: id, messages: [
      { role: "system", content: "This is a synthetic integration test. Reply with JSON only, without commentary: {\"ready\":true}." },
      { role: "user", content: "Return the ready object." },
    ], parameters: { max_tokens: 100, temperature: 0 }, reasoning: { source: "off" }, signal: AbortSignal.timeout(20000) });
    if (!/"ready"\s*:\s*true/.test(result.content ?? "")) throw new Error("The connection answered, but not with the requested test object.");
    console.log("PASS: existing Lumiverse connection answered the synthetic test.");
    }
  }
} finally { database.closeDatabase(); }
process.exit(0);
