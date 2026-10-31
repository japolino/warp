import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

test("local deployment backs up bundles, preserves source and data, and restores the prior build", async () => {
  const root = await mkdtemp(join(tmpdir(), "warp-deploy-test-"));
  const src = join(root, "source"), dst = join(root, "target"), backup = join(root, "backup"), rollbackBackup = join(root, "rollback-backup");
  const seed = async (path: string, version: string) => {
    await mkdir(join(path, "dist"), { recursive: true });
    await writeFile(join(path, "spindle.json"), JSON.stringify({ identifier: "warp", version, permissions: ["generation"] }));
    await writeFile(join(path, "dist/backend.js"), version);
    await writeFile(join(path, "dist/frontend.js"), version);
  };
  try {
    await seed(src, "new"); await seed(dst, "old");
    await writeFile(join(dst, "unrelated-source.ts"), "keep");
    const command = [process.execPath, resolve(import.meta.dir, "deploy-local.ts"), "--source", src, "--target", dst];
    const preview = Bun.spawn([...command], { stdout: "pipe", stderr: "pipe" });
    expect(await preview.exited).toBe(0);
    expect(await readFile(join(dst, "dist/backend.js"), "utf8")).toBe("old");
    const update = Bun.spawn([...command, "--apply", "--backup", backup], { stdout: "pipe", stderr: "pipe" });
    expect(await update.exited).toBe(0);
    expect(await readFile(join(dst, "dist/backend.js"), "utf8")).toBe("new");
    expect(await readFile(join(backup, "dist/backend.js"), "utf8")).toBe("old");
    expect(await readFile(join(dst, "unrelated-source.ts"), "utf8")).toBe("keep");
    const restore = Bun.spawn([...command, "--restore", backup, "--apply", "--backup", rollbackBackup], { stdout: "pipe", stderr: "pipe" });
    expect(await restore.exited).toBe(0);
    expect(await readFile(join(dst, "dist/backend.js"), "utf8")).toBe("old");
  } finally {
    // mkdtemp created this exact named test root, and every target above is beneath it.
    if (!resolve(root).startsWith(resolve(tmpdir()) + sep) || !basename(root).startsWith("warp-deploy-test-")) throw new Error("Test cleanup escaped its temporary directory");
    await rm(root, { recursive: true, force: true });
  }
});
