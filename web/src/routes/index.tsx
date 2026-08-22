import { createFileRoute } from "@tanstack/react-router";

const Index = () => (
	<main className="flex min-h-screen items-center justify-center p-8">
		<div className="text-center">
			<h1 className="text-2xl font-semibold">Transactions Dispute Portal</h1>
			<p className="mt-2 text-gray-500">
				Placeholder route — see docs/definition-of-done.md.
			</p>
		</div>
	</main>
);

export const Route = createFileRoute("/")({
	component: Index,
});
