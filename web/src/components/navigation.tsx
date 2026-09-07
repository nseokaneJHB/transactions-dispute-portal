import { useState } from "react";

import { Link } from "@tanstack/react-router";
import {
	MenuIcon,
	XIcon,
	ReceiptTextIcon,
	ScaleIcon,
	UserCogIcon,
	ShieldCheckIcon,
} from "lucide-react";

import {
	APP_NAME,
	USER_ROLE,
	FRONTEND_URLS,
	type AuthSession,
} from "@transaction-dispute-portal/shared";

import { cn } from "@/lib/utils";
import { SignOutButton } from "@/components/sign-out-button";

const customerLinks = [
	{
		to: FRONTEND_URLS.TRANSACTIONS,
		label: "Transactions",
		icon: ReceiptTextIcon,
	},
	{ to: FRONTEND_URLS.DISPUTES, label: "Disputes", icon: ScaleIcon },
	{ to: "/account", label: "Account", icon: UserCogIcon },
] as const;

const adminLink = {
	to: FRONTEND_URLS.ADMIN,
	label: "Review queue",
	icon: ShieldCheckIcon,
} as const;

export const Navigation = ({ user }: { user: AuthSession }) => {
	const [open, setOpen] = useState(false);

	const links =
		user.role === USER_ROLE.ADMIN
			? [adminLink, { to: "/account", label: "Account", icon: UserCogIcon }]
			: customerLinks;

	return (
		<header className="border-b">
			<div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
				<Link to="/" className="flex items-center gap-2 text-sm font-semibold">
					<span className="bg-primary size-6 rounded-md" />
					<span className="hidden sm:inline">{APP_NAME}</span>
				</Link>

				<nav className="hidden items-center gap-1 md:flex">
					{links.map(({ to, label, icon: Icon }) => (
						<Link
							key={to}
							to={to}
							className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors"
							activeProps={{ className: "bg-muted text-foreground" }}
							activeOptions={{ exact: to === "/" }}
						>
							<Icon className="size-4" />
							{label}
						</Link>
					))}
				</nav>

				<div className="hidden items-center gap-3 md:flex">
					<span className="text-muted-foreground text-xs">{user.email}</span>
					<SignOutButton />
				</div>

				<button
					type="button"
					className="hover:bg-muted rounded-md p-2 md:hidden"
					onClick={() => setOpen((value) => !value)}
					aria-label="Toggle menu"
				>
					{open ? (
						<XIcon className="size-5" />
					) : (
						<MenuIcon className="size-5" />
					)}
				</button>
			</div>

			<nav
				className={cn(
					"flex-col gap-1 border-t px-4 py-3 md:hidden",
					open ? "flex" : "hidden",
				)}
			>
				{links.map(({ to, label, icon: Icon }) => (
					<Link
						key={to}
						to={to}
						onClick={() => setOpen(false)}
						className="text-muted-foreground hover:bg-muted flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
						activeProps={{ className: "bg-muted text-foreground" }}
						activeOptions={{ exact: to === "/" }}
					>
						<Icon className="size-4" />
						{label}
					</Link>
				))}
				<div className="mt-2 flex items-center justify-between border-t pt-3">
					<span className="text-muted-foreground text-xs">{user.email}</span>
					<SignOutButton />
				</div>
			</nav>
		</header>
	);
};
