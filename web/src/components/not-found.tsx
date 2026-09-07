import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export const NotFound = () => (
	<div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
		<p className="text-3xl font-semibold">404</p>
		<p className="text-muted-foreground">That page doesn't exist.</p>
		<Button asChild variant="secondary">
			<Link to="/">Back to safety</Link>
		</Button>
	</div>
);
