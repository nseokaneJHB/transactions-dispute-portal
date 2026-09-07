import { Toaster as SonnerToaster } from "sonner";

/** App-wide toast host — rendered once in the root document. */
export const Toaster = () => (
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
