import { useRouter, type ErrorComponentProps } from "@tanstack/react-router";

import { isApiError } from "@/api";
import { Button } from "@/components/ui/button";

export const RouteError = ({ error }: ErrorComponentProps) => {
	const router = useRouter();

	const message = isApiError(error)
		? error.message
		: "Something went wrong loading this page.";

	return (
		<div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
			<p className="text-lg font-semibold">We hit a snag</p>
			<p className="text-muted-foreground max-w-md text-sm">{message}</p>
			<Button variant="secondary" onClick={() => router.invalidate()}>
				Try again
			</Button>
		</div>
	);
};
