import { defineConfig } from "vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";

export default defineConfig({
	optimizeDeps: {
		include: ["@transaction-dispute-portal/shared"],
	},
	server: {
		port: 3000,
		watch: {
			ignored: ["!**/node_modules/@transaction-dispute-portal/shared/**"],
		},
	},
	plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
