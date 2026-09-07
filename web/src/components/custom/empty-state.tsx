import type { ComponentType, ReactNode } from "react";

import { InboxIcon } from "lucide-react";

interface EmptyStateProps {
	title: string;
	description?: string;
	icon?: ComponentType<{ className?: string }>;
	action?: ReactNode;
}

export const EmptyState = ({
	title,
	description,
	icon: Icon = InboxIcon,
	action,
}: EmptyStateProps) => (
	<div className="border-border flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
		<Icon className="text-muted-foreground size-8" />
		<p className="font-medium">{title}</p>
		{description && (
			<p className="text-muted-foreground max-w-sm text-sm">{description}</p>
		)}
		{action && <div className="mt-2">{action}</div>}
	</div>
);
