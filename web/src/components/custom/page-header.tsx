import type { ReactNode } from "react";

interface PageHeaderProps {
	title: string;
	description?: string;
	action?: ReactNode;
}

export const PageHeader = ({ title, description, action }: PageHeaderProps) => (
	<div className="flex flex-wrap items-start justify-between gap-3">
		<div className="flex flex-col gap-1">
			<h1 className="text-xl font-semibold tracking-tight">{title}</h1>
			{description && (
				<p className="text-muted-foreground text-sm">{description}</p>
			)}
		</div>
		{action}
	</div>
);
