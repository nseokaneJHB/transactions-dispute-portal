import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { LogOutIcon } from "lucide-react";

import { FRONTEND_URLS } from "@transaction-dispute-portal/shared";

import { signOut } from "@/api/auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToastMutation } from "@/hooks/use-toast-mutation";

export const SignOutButton = () => {
	const router = useRouter();
	const queryClient = useQueryClient();

	const { mutateAsync, isPending } = useMutation({ mutationFn: signOut });

	const handleSignOut = () => {
		useToastMutation({
			loading: "Signing out…",
			promise: mutateAsync(),
			onSuccess: async () => {
				queryClient.clear();
				await router.navigate({ to: FRONTEND_URLS.SIGN_IN, replace: true });
				await router.invalidate();
			},
		});
	};

	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={handleSignOut}
			disabled={isPending}
		>
			{isPending ? <Spinner /> : <LogOutIcon />}
			Sign out
		</Button>
	);
};
