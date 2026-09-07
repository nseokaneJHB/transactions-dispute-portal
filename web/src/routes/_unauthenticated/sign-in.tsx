import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { ArrowLeftIcon, MailIcon } from "lucide-react";

import {
	OTP,
	authOtpRequestBodySchema,
	authOtpVerifyBodySchema,
	type AuthOtpRequestBody,
	type AuthOtpVerifyBody,
} from "@transaction-dispute-portal/shared";

import { requestOtp, verifyOtp } from "@/api/auth";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { TextField } from "@/components/custom/text-field";
import { useFormField } from "@/hooks/use-form-field";
import { useToastMutation } from "@/hooks/use-toast-mutation";
import type { ApiError } from "@/api";

const searchSchema = z.object({ email: z.string().optional() });

const RequestStep = ({ onSent }: { onSent: (email: string) => void }) => {
	const { control, handleSubmit, setError } = useForm<AuthOtpRequestBody>({
		mode: "onChange",
		resolver: zodResolver(authOtpRequestBodySchema),
		defaultValues: { email: "" },
	});

	const email = useFormField({ name: "email", control });
	const { mutateAsync, isPending } = useMutation({ mutationFn: requestOtp });

	const onSubmit = (values: AuthOtpRequestBody) =>
		useToastMutation({
			loading: "Sending your code…",
			promise: mutateAsync(values),
			onSuccess: () => onSent(values.email),
			onError: (error: ApiError) =>
				error.errors?.forEach((issue) =>
					setError(issue.field as keyof AuthOtpRequestBody, {
						message: issue.message,
					}),
				),
		});

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={handleSubmit(onSubmit)}
			noValidate
		>
			<TextField
				id="email"
				type="email"
				label="Email address"
				placeholder="you@example.com"
				autoComplete="email"
				autoFocus
				value={email.value}
				onChange={email.onChange}
				error={email.error}
				hint="We'll email you a one-time sign-in code."
			/>
			<Button type="submit" disabled={isPending}>
				{isPending ? <Spinner /> : <MailIcon />}
				Send code
			</Button>
		</form>
	);
};

const VerifyStep = ({
	email,
	onBack,
}: {
	email: string;
	onBack: () => void;
}) => {
	const router = useRouter();

	const { control, handleSubmit, setError } = useForm<AuthOtpVerifyBody>({
		mode: "onChange",
		resolver: zodResolver(authOtpVerifyBodySchema),
		defaultValues: { email, otp: "" },
	});

	const otp = useFormField({ name: "otp", control });
	const { mutateAsync, isPending } = useMutation({ mutationFn: verifyOtp });

	const onSubmit = (values: AuthOtpVerifyBody) =>
		useToastMutation({
			loading: "Checking your code…",
			promise: mutateAsync(values),
			onSuccess: async () => {
				await router.invalidate();
				await router.navigate({ to: "/" });
			},
			onError: (error: ApiError) =>
				error.errors?.forEach((issue) =>
					setError(issue.field as keyof AuthOtpVerifyBody, {
						message: issue.message,
					}),
				),
		});

	return (
		<form
			className="flex flex-col gap-4"
			onSubmit={handleSubmit(onSubmit)}
			noValidate
		>
			<TextField
				id="otp"
				inputMode="numeric"
				autoComplete="one-time-code"
				maxLength={OTP.LENGTH}
				label={`Code sent to ${email}`}
				placeholder={"0".repeat(OTP.LENGTH)}
				autoFocus
				className="text-center text-lg tracking-[0.4em]"
				value={otp.value}
				onChange={otp.onChange}
				error={otp.error}
				hint={`Expires in ${OTP.EXPIRY_MINUTES} minutes.`}
			/>
			<Button type="submit" disabled={isPending}>
				{isPending && <Spinner />}
				Sign in
			</Button>
			<Button type="button" variant="ghost" size="sm" onClick={onBack}>
				<ArrowLeftIcon />
				Use a different email
			</Button>
		</form>
	);
};

const SignInPage = () => {
	const { email } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<Card className="w-full max-w-sm">
			<CardHeader>
				<CardTitle>Sign in</CardTitle>
				<CardDescription>
					{email
						? "Enter the code from your inbox."
						: "Access your transactions and disputes."}
				</CardDescription>
			</CardHeader>

			{email ? (
				<VerifyStep email={email} onBack={() => navigate({ search: {} })} />
			) : (
				<RequestStep
					onSent={(value) => navigate({ search: { email: value } })}
				/>
			)}
		</Card>
	);
};

export const Route = createFileRoute("/_unauthenticated/sign-in")({
	component: SignInPage,
	validateSearch: searchSchema,
});
