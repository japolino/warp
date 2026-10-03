// Serves the doll bench: bun run bench, then open /.
const root = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const port = Number(process.env.PORT ?? 5177);
Bun.serve({
  port,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    const file = Bun.file(`${root}${path === "/" ? "doll.html" : path.slice(1)}`);
    return (await file.exists()) ? new Response(file) : new Response("Not found", { status: 404 });
  },
});
console.log(`Doll bench: http://localhost:${port}/`);
