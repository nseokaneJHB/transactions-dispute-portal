import Fastify from "fastify";

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
