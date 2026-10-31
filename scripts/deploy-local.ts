// Reversible local bundle deployment. Does not restart servers, alter accounts,
// grant permissions, rewrite source, or change conversation data.
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const args = process.argv.slice(2);
const value = (flag: string) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const source = resolve(value("--source") ?? join(import.meta.dir, ".."));
const target = resolve(value("--target") ?? "D:/Lumiverse/data/extensions/warp/repo");
const apply = args.includes("--apply");
const restoring = value("--restore");
const load = async (root: string) => JSON.parse(await readFile(join(root, "spindle.json"), "utf8"));
const old = await load(target), next = await load(restoring ? resolve(restoring) : source);
if (old.identifier !== "warp" || next.identifier !== "warp") throw new Error("Both manifests must identify Warp. No file changed.");
const grants = new Set(old.permissions ?? []);
if ((next.permissions ?? []).some((p: string) => !grants.has(p))) throw new Error("This update requests an additional permission. Install it through Lumiverse's normal permission review instead.");
const files = ["spindle.json", "dist/backend.js", "dist/frontend.js"];
const from = restoring ? resolve(restoring) : source;
for (const file of files) if (!await Bun.file(join(from, file)).exists()) throw new Error(`Missing bundle file: ${file}`);
if (source === target && !restoring) throw new Error("Source and target must be different directories.");
if (!apply) {
  console.log(JSON.stringify({ operation: restoring ? "restore-preview" : "deploy-preview", target, fromVersion: old.version, toVersion: next.version, changes: files, applied: false }));
} else {
  const backup = resolve(value("--backup") ?? join(source, ".artifacts", `warp-backup-${Date.now()}`));
  if (files.some(file => resolve(join(backup, file)) === resolve(join(target, file)))) throw new Error("Backup must be outside the target files.");
  await mkdir(dirname(backup), { recursive: true });
  await mkdir(backup, { recursive: false });
  // Verify and back up every target before replacing any file.
  for (const file of files) {
    await mkdir(resolve(join(backup, file), ".."), { recursive: true });
    await cp(join(target, file), join(backup, file));
  }
  await writeFile(join(backup, "deployment.json"), JSON.stringify({ target, files, priorVersion: old.version, nextVersion: next.version }, null, 2));
  try {
    for (const file of files) await cp(join(from, file), join(target, file));
  } catch (error) {
    for (const file of files) await cp(join(backup, file), join(target, file));
    throw error;
  }
  console.log(JSON.stringify({ operation: restoring ? "restored" : "deployed", target, backup, version: next.version, restartRequired: true }));
}
