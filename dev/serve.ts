// Serves the benches: bun run bench, then / for the arcade and /stage.html for the stage.
const root = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const port = Number(process.env.PORT ?? 5177);
Bun.serve({
  port,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const file = Bun.file(`${root}${path === "/" ? "arcade.html" : path.slice(1)}`);
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});
console.log(`Arcade bench: http://localhost:${port}/  ·  Stage bench: http://localhost:${port}/stage.html`);
