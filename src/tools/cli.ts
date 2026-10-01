#!/usr/bin/env node
// warp-rulebook: write Warp rulebooks outside Lumiverse. A command line for people
// and harnesses with a shell, and an MCP server (`mcp`) for harnesses that speak it.
// Built to dist/warp-rulebook.js (plain Node, no dependencies).

import { readFileSync, writeFileSync } from "node:fs";
import { checkReport, checkText, guideMarkdown, guideText, previewText, simulateText, templateList, templateText } from "./rulebook-tools.js";

const VERSION = "0.2.0";

const USAGE = `warp-rulebook — write Warp rulebooks with any tool

  guide [--section workflow|format|design]   The authoring guide (format reference + design guide)
  templates                                   The starting templates
  template <id>                               One template as a rulebook file
  check <file...> [--json]                    Load, lint, balance-review and depth-audit (exit 1 on errors)
  simulate <file...> [--encounter id] [--runs n]   Random play through the encounters
  preview <file...>                           The sidebar, choices and narrator view at the start
  mcp                                         Serve all of this over MCP (stdio)

Import the finished file in Lumiverse: Warp → Ruleset → Import a rulebook.`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

function files(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) { if (args[i] !== "--json") i++; continue; }
    out.push(args[i]);
  }
  return out;
}

function read(paths: string[]): string[] {
  if (!paths.length) throw new Error("Give the rulebook file (e.g. rulebook.yaml).");
  return paths.map((p) => readFileSync(p, "utf8"));
}

// ───────────────────────── MCP (JSON-RPC 2.0 over stdio, one message per line) ─────────────────────────

const SOURCE = {
  yaml: { type: "string", description: "The rulebook YAML (the whole file)." },
  path: { type: "string", description: "Or a path to the rulebook file." },
};

const TOOLS = [
  {
    name: "warp_guide",
    description: "The Warp rulebook authoring guide: workflow, sections, the full YAML format reference and the design guide. Read it before writing a rulebook.",
    inputSchema: { type: "object", properties: { section: { type: "string", enum: ["all", "workflow", "format", "design"], description: "Default all." } } },
  },
  { name: "warp_templates", description: "List the starting templates (complete, balanced games to adapt).", inputSchema: { type: "object", properties: {} } },
  {
    name: "warp_template",
    description: "One template as a complete rulebook file, to adapt.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "warp_check",
    description: "Check a rulebook the way Warp does: load errors, lint warnings, balance review, and the depth audit (what doesn't connect yet, with fixes). Run after every meaningful change.",
    inputSchema: { type: "object", properties: SOURCE },
  },
  {
    name: "warp_simulate",
    description: "Simulate the encounters with random play from the starting state: how often each ending happens and how many rounds it takes.",
    inputSchema: { type: "object", properties: { ...SOURCE, encounter: { type: "string", description: "Just this encounter id." }, runs: { type: "number", description: "Default 200." } } },
  },
  {
    name: "warp_preview",
    description: "What the player sees at the start (sidebar and choices with odds) and what the narrator is told.",
    inputSchema: { type: "object", properties: SOURCE },
  },
];

function sourceOf(a: Record<string, unknown>): string[] {
  if (typeof a.yaml === "string" && a.yaml.trim()) return [a.yaml];
  if (typeof a.path === "string" && a.path.trim()) return [readFileSync(a.path, "utf8")];
  throw new Error("Pass the rulebook as `yaml` (its text) or `path` (a file).");
}

function callTool(name: string, a: Record<string, unknown>): string {
  switch (name) {
    case "warp_guide": return guideText((["workflow", "format", "design"].includes(String(a.section)) ? a.section : "all") as "all");
    case "warp_templates": return templateList();
    case "warp_template": return templateText(String(a.id ?? "")) ?? `No template "${a.id}". ${templateList()}`;
    case "warp_check": return checkText(checkReport(sourceOf(a)));
    case "warp_simulate": return simulateText(sourceOf(a), typeof a.encounter === "string" ? a.encounter : undefined, Math.max(20, Math.min(2000, Number(a.runs) || 200)));
    case "warp_preview": return previewText(sourceOf(a));
  }
  throw new Error(`Unknown tool "${name}"`);
}

function serveMcp() {
  const reply = (id: unknown, result: unknown) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
  const fail = (id: unknown, code: number, message: string) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })}\n`);
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk: string) => {
    buf += chunk;
    for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let msg: { id?: unknown; method?: string; params?: Record<string, unknown> };
      try { msg = JSON.parse(line); } catch { fail(null, -32700, "Parse error"); continue; }
      const { id, method, params = {} } = msg;
      if (id === undefined) continue; // notifications (initialized, cancelled…) need no answer
      try {
        switch (method) {
          case "initialize":
            reply(id, {
              protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2024-11-05",
              capabilities: { tools: {} },
              serverInfo: { name: "warp-rulebook", version: VERSION },
              instructions: "Tools for writing Warp rulebooks (game rules that run under a Lumiverse roleplay chat). Start with warp_guide, adapt a template, and run warp_check after every change until it's clean; simulate encounters; preview; then the user imports the file in Warp → Ruleset → Import a rulebook.",
            });
            break;
          case "ping": reply(id, {}); break;
          case "tools/list": reply(id, { tools: TOOLS }); break;
          case "tools/call": {
            const name = String(params.name ?? "");
            try {
              reply(id, { content: [{ type: "text", text: callTool(name, (params.arguments ?? {}) as Record<string, unknown>) }] });
            } catch (e) {
              reply(id, { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true });
            }
            break;
          }
          default: fail(id, -32601, `Method not found: ${method}`);
        }
      } catch (e) {
        fail(id, -32603, e instanceof Error ? e.message : String(e));
      }
    }
  });
}

// ───────────────────────── command line ─────────────────────────

function main(argv: string[]): number {
  const [cmd, ...args] = argv;
  try {
    switch (cmd) {
      case "guide": {
        if (args.includes("--markdown")) {
          const out = flag(args, "--out");
          if (out) writeFileSync(out, guideMarkdown());
          else process.stdout.write(guideMarkdown());
          return 0;
        }
        console.log(guideText((flag(args, "--section") ?? "all") as "all"));
        return 0;
      }
      case "templates": console.log(templateList()); return 0;
      case "template": {
        const t = templateText(args[0] ?? "");
        if (!t) { console.error(`No template "${args[0] ?? ""}".\n\n${templateList()}`); return 1; }
        process.stdout.write(t);
        return 0;
      }
      case "check": {
        const rep = checkReport(read(files(args)));
        console.log(args.includes("--json") ? JSON.stringify(rep, null, 2) : checkText(rep));
        return rep.ok ? 0 : 1;
      }
      case "simulate": console.log(simulateText(read(files(args)), flag(args, "--encounter"), Number(flag(args, "--runs")) || 200)); return 0;
      case "preview": console.log(previewText(read(files(args)))); return 0;
      case "mcp": serveMcp(); return -1;
      case "version": case "--version": console.log(VERSION); return 0;
      default: console.log(USAGE); return cmd && cmd !== "help" && cmd !== "--help" ? 1 : 0;
    }
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 1;
  }
}

const code = main(process.argv.slice(2));
if (code >= 0) process.exitCode = code;
