// Evaluate captured answers against human labels without contacting a model.
import assert from "node:assert/strict";
import { decodeAnswers, type Questions } from "../src/engine/decide.js";
import { objectOf } from "../src/engine/proposal.js";

const args = process.argv.slice(2), path = args[0] ?? "fixtures/decisions.synthetic.jsonl";
const rows = (await Bun.file(path).text()).split(/\r?\n/).filter((s) => s.trim()).map((s, i) => {
  try { return JSON.parse(s); } catch { throw new Error(`Invalid JSON on line ${i + 1}`); }
});
let total = 0, accepted = 0, brier = 0, auto = 0, correctAuto = 0, falseAuto = 0;
const threshold = 0.75, rejected: string[] = [];
for (const [index, row] of rows.entries()) {
  const q = objectOf(row.questions) as Questions, expected = objectOf(row.expected), answers = decodeAnswers(row.answers, q);
  for (const [id, truth] of Object.entries(expected)) {
    const question = q[id]; assert(question && ["choice", "score", "noul"].includes(question.type), `Unknown question on row ${index + 1}`);
    total++;
    const answer = answers[id];
    if (!answer) { rejected.push(`${row.id ?? index + 1}:${id}`); continue; }
    accepted++;
    if (answer.type === "noul") { assert(typeof truth === "boolean", "noul labels must be boolean"); brier += (answer.noul - Number(truth)) ** 2; }
    else {
      const keys = question.type === "choice" ? Object.keys(question.criteria) : question.type === "score" ? question.criteria.map((_, i) => String(i)) : [];
      assert(keys.includes(String(truth)), `Label outside the question on row ${index + 1}`);
      brier += keys.reduce((n, key) => n + ((answer.probabilities[key] ?? 0) - Number(key === String(truth))) ** 2, 0);
      if (id === "action" && answer.type === "choice" && answer.choice !== "none" && answer.confidence >= threshold) {
        auto++; if (answer.choice === truth) correctAuto++; else falseAuto++;
      }
    }
  }
}
assert(total > 0, "No labelled questions in dataset");
const report = { dataset: path, labelled: total, accepted, coverage: accepted / total, meanBrier: accepted ? brier / accepted : null,
  autoThreshold: threshold, autoActions: auto, autoPrecision: auto ? correctAuto / auto : null, falseAutoActions: falseAuto, rejected };
console.log(JSON.stringify(report, null, 2));
const gate = args.indexOf("--min-precision");
if (gate >= 0) { const minimum = Number(args[gate + 1]); assert(minimum >= 0 && minimum <= 1, "Precision gate must be 0..1"); assert(auto > 0 && correctAuto / auto >= minimum, "Auto-action precision gate failed"); }
