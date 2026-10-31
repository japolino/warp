import { join } from "node:path";
import { makeHost } from "../src/backend/test-host.js";
import { syncLiving } from "../src/living/runtime.js";

export async function runPlaytest(model: (input: any) => Promise<any>) {
  const calls: any[] = [], results: any[] = [];
  const h = makeHost("synthetic-live-playtest", false);
  const original = (globalThis as any).spindle;
  const invoke = async (input: any, kind: string) => {
    const start = performance.now();
    const category = kind === "helper" && input.messages[0]?.content?.includes("Determine whether") ? "attempt" : kind;
    const entry: any = { kind: category, pending: true }; calls.push(entry);
    try {
      const response = await model({ ...input, signal: input.signal ?? AbortSignal.timeout(30000), reasoning: { source: "off" } });
      Object.assign(entry, { pending: false, ms: Math.round(performance.now() - start), usage: response.usage, ...(category === "attempt" ? { response: response.content } : {}) });
      return response;
    } catch (error) { Object.assign(entry, { pending: false, ms: Math.round(performance.now() - start), failed: true }); throw error; }
  };
  h.fake.generate.quiet = (input: any) => invoke(input, "helper");
  (globalThis as any).spindle = h.fake;
  try {
    await import("../src/backend.ts" + "?live-model-playtest");
    const cases = [
      { name: "social", card: "Jo, 32, runs a small café. She values reliability, cares for her staff, and has little patience for evasions. Dex, 29, is her friend, worried about being seen by a creditor. Neither person exists to agree with every request.", greeting: "Jo is counting the café's till before closing. 'Can you cover the counter while I call the supplier?' Dex waits by the back door, watching the street. You own a distinctive blue jacket. You have not promised to help either of them yet.", turns: [
        '"Yes, Jo. I promise to cover the counter until closing." I stay at the till.',
        '"Dex, I can lend you my jacket, but I am staying here. Will that help?"',
        '"Jo, I helped Dex with a jacket. I did not want to break my promise to you."',
      ] },
      { name: "quiet", card: "Mira, 30, is an archivist. She is reserved, enjoys comfortable silence, and dislikes being pressed about her family. She can be affectionate without abandoning her independence. Tonight she wants to finish repairing a damaged book.", greeting: "Mira sits at the archive worktable repairing a book. Rain taps the window. She moves an empty chair a little closer without interrupting her work. You are a welcome adult visitor, Sam.", turns: [
        '"I am happy just to sit with you. No need to entertain me." I take the chair.',
        '"I would rather leave your family out of tonight. How is the repair going?"',
        '"I will head home now. Thank you for the quiet company." I stand and put on my coat.',
      ] },
      { name: "adventure", card: "Tamsin, 35, is an experienced scout guiding Sam through abandoned ruins. She is practical and cautious. Sam has a sound climbing rope and has climbed before. The stonework is unreliable, and a watchful sentry patrols the far side. Established equipment and preparation matter.", greeting: "Tamsin crouches beside a broken stair in the ruins. A narrow gap separates you from a landing. A stout iron ring is fixed in the near wall. You carry a climbing rope. Across the gap a sentry's lantern passes behind an arch.", turns: [
        'I examine the iron ring and the rope, checking whether they can safely take my weight before I commit to crossing.',
        'I secure the rope to the sound ring, wait until the sentry turns away, and try to cross the gap quietly using the rope.',
        '"Tamsin, what can we do from here now?" I keep my voice low.',
      ] },
      { name: "contest", card: "An adult city guard confronts Sam in a narrow alley. The guard is trained, alert, and unwilling to surrender his weapon. Sam is an ordinary adult with no special powers or equipment. Nearby witnesses can hear loud noises. The guard wants to detain Sam alive.", greeting: "The guard blocks the alley exit, both hands tight on his spear. He is watching you closely from a spear's length away. 'Stay where you are,' he says. No one has been hurt yet.", turns: [
        "I try to wrestle the spear from the alert guard's hands with my bare hands before he can push me back.",
        '"Enough. I will stop fighting. What do you want from me?" I keep my hands visible.',
      ] },
    ];
    for (const scenario of cases) {
      const filter = process.argv.find(arg => arg.startsWith("--case="))?.slice(7);
      if (filter && scenario.name !== filter) continue;
      const chatId = `live-${scenario.name}`;
      h.chat(chatId, "name: unused", scenario.greeting);
      h.characters[`char-${chatId}`] = { id: `char-${chatId}`, name: scenario.name, description: scenario.card, world_book_ids: [] };
      await syncLiving(chatId, h.userId);
      const transcript: any[] = [{ role: "assistant", content: scenario.greeting }];
      for (const [index, turn] of scenario.turns.entries()) {
        await h.say(chatId, turn);
        const generated = await h.generate(chatId, async messages => {
          const prompt = [{ role: "system", content: `Continue a roleplay as the people and world in this character card. Sam is the adult player. Do not write Sam's speech, actions or feelings. Keep this reply under 180 words. Respect established facts and the player's freedom to decline.\nCard:\n${scenario.card}` }, ...transcript, ...messages.filter(m => m.role !== "system")];
          const response = await invoke({ messages: prompt, parameters: { max_tokens: 700, temperature: 0.7 } }, "narrator");
          return response.content ?? "";
        });
        transcript.push({ role: "user", content: turn }, { role: "assistant", content: generated.target.content });
        const state = [...h.sent].reverse().find(m => m.type === "living" && m.chatId === chatId);
        console.log(`${scenario.name} turn ${index + 1}: ${state?.world.facts.length ?? 0} facts, ${state?.decision?.result ?? "no roll"}, retry=${state?.retry ?? false}`);
        results.push({ scenario: scenario.name, turn: index + 1, player: turn, reply: generated.target.content, state });
      }
      if (process.argv.includes("--extras") && scenario.name === "quiet") {
        const correction = "The current scene is the archive worktable. Sam is alone; Mira has gone to the next room.";
        await h.frontend({ type: "living_action", chatId, action: "correct", text: correction });
        let state = [...h.sent].reverse().find(m => m.type === "living" && m.chatId === chatId);
        if (state.retry) { await h.frontend({ type: "living_action", chatId, action: "retry" }); state = [...h.sent].reverse().find(m => m.type === "living" && m.chatId === chatId); }
        results.push({ scenario: scenario.name, action: "correction", correction, state });
        console.log(`quiet correction: place=${state.world.place}, present=${JSON.stringify(state.world.present)}, retry=${state.retry}`);
        await h.frontend({ type: "living_action", chatId, action: "ideas" });
        const ideas = [...h.sent].reverse().find(m => m.type === "living_ideas" && m.chatId === chatId);
        results.push({ scenario: scenario.name, action: "ideas", ideas });
        console.log(`quiet suggestions: ${ideas?.ideas?.length ?? 0}`);
      }
    }
  } finally {
    (globalThis as any).spindle = original;
    const target = join(import.meta.dir, "../.artifacts", `live-playtest-${Date.now()}.json`);
    await Bun.write(target, JSON.stringify({ calls, results }, null, 2));
    console.log(`Synthetic playtest report: ${target}`);
  }
}
