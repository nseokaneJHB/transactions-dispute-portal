/// <reference types="vite/client" />
import type { PropsWithChildren } from "react";
import {
	Outlet,
	Scripts,
	HeadContent,
	createRootRoute,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

const RootDocument = ({ children }: PropsWithChildren) => (
	<html lang="en">
		<head>
			<HeadContent />
		</head>
		<body>
			{children}
			<Scripts />
		</body>
	</html>
);

export const Route = createRootRoute({
	component: () => (
		<RootDocument>
			<Outlet />
		</RootDocument>
	),
	head: () => ({
		links: [{ rel: "stylesheet", href: appCss }],
		meta: [
			{ charSet: "utf-8" },
			{ title: "Transactions Dispute Portal" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
		],
	}),
});
