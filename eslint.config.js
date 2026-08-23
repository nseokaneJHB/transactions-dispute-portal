import js from "@eslint/js";
import ts from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	prettier,
	{
		ignores: [
			"**/dist/**",
			"**/.turbo/**",
			"**/.tanstack/**",
			"**/node_modules/**",
			// plain runtime .mjs entry, not part of any tsconfig program
			"web/server.mjs",
		],
	},
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					// drizzle-kit config: outside api/tsconfig.json's `src/**/*`
					// include (which sets `rootDir: "src"` for `tsc`'s build
					// output — widening it there would break `outDir`), but
					// still real TS worth type-aware linting via the default
					// in-memory project.
					allowDefaultProject: ["api/drizzle.config.ts"],
				},
			},
		},
	},
);
