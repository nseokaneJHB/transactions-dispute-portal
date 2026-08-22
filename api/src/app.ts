import Fastify from "fastify";

// Placeholder entry point — replace with the real build()/app.ts split
// (auth, drizzle, routes) once the domain model lands. See docs/api.md.
const app = Fastify({ logger: true });

app.get("/healthz", async () => ({ status: "ok" }));
app.get("/readyz", async () => ({ status: "ok" }));

const port = Number(process.env.PORT ?? 8080);

const start = async () => {
	await app.listen({ port, host: "0.0.0.0" });
};

start().catch((err) => {
	app.log.error(err);
	process.exit(1);
});
