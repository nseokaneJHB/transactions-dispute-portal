// Production entry point: wraps the built TanStack Start fetch handler
// (dist/server/server.js) in a real Node HTTP server via srvx. TanStack
// Start's build output is a bare Web-standard fetch handler with no
// runtime attached — this is the missing piece for `node`-based hosting
// (as opposed to Cloudflare/Vercel/etc adapters).
import { serve } from "srvx";
import handler from "./dist/server/server.js";

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: handler.fetch, port, hostname: "0.0.0.0" });
