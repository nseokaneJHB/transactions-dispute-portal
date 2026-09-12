import { useEffect, useState } from "react";

import { Toaster as SonnerToaster } from "sonner";

/**
 * App-wide toast host — rendered once in the root document. Mounted only
 * after the client takes over (never during SSR/hydration): sonner's
 * subscription effect was silently going dead when this rendered as part of
 * the initial hydration pass, so toasts queued but never painted.
 */
export const Toaster = () => {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) return null;

	return (
		<SonnerToaster
			position="top-center"
			richColors
			closeButton
			toastOptions={{
				classNames: {
					toast: "rounded-xl border text-sm",
				},
			}}
		/>
	);
};
