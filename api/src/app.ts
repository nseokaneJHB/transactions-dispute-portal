import closeWithGrace from "close-with-grace";

import { build } from "./build.js";

import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { setShuttingDown } from "./lib/shutdown.js";

const start = async (): Promise<void> => {
	const app = await build(logger);

	closeWithGrace({ delay: 500 }, async ({ signal, err: error }) => {
		setShuttingDown(true);
		app.log.warn({ signal }, "Draining: no longer accepting new requests");

		await app.close();

		if (error) {
			app.log.error({ signal, error }, "Shutdown complete (after error)");
		} else {
			app.log.warn({ signal }, "Shutdown complete");
		}
	});

	try {
		await app.listen({ port: env.PORT, host: "0.0.0.0" });
		app.log.info(`Server listening on ${env.API_URL}`);
	} catch (error) {
		app.log.error(error, "Failed to start the server");
		process.exit(1);
	}
};

void start();
