import type { ComponentType } from "react";

import {
	CircleCheckIcon,
	CircleXIcon,
	ClockIcon,
	InboxIcon,
	Undo2Icon,
} from "lucide-react";

import {
	DISPUTE_STATUS,
	OPEN_DISPUTE_STATUS,
	type DisputeStatus,
	type DisputeStatusCounts,
} from "@transaction-dispute-portal/shared";

import { cn } from "@/lib/utils";
import { humanize } from "@/lib/format";
import { disputeStatusToneClass } from "@/components/custom/status-badge";

interface DisputeSummaryCardsProps {
	counts: DisputeStatusCounts;
	activeStatus?: DisputeStatus;
	onSelect: (status: DisputeStatus | undefined) => void;
}

const OPEN_STATUSES: readonly string[] = OPEN_DISPUTE_STATUS;

const statusIcon: Record<DisputeStatus, ComponentType<{ className?: string }>> = {
	[DISPUTE_STATUS.SUBMITTED]: InboxIcon,
	[DISPUTE_STATUS.UNDER_REVIEW]: ClockIcon,
	[DISPUTE_STATUS.RESOLVED]: CircleCheckIcon,
	[DISPUTE_STATUS.REJECTED]: CircleXIcon,
	[DISPUTE_STATUS.WITHDRAWN]: Undo2Icon,
};

/** Solid fill per open status, so a non-empty queue is loud rather than a faint tint. */
const attentionToneClass: Record<string, string> = {
	[DISPUTE_STATUS.SUBMITTED]: "border-status-submitted bg-status-submitted text-white",
	[DISPUTE_STATUS.UNDER_REVIEW]:
		"border-status-under-review bg-status-under-review text-white",
};

/**
 * One card per dispute lifecycle status, in enum (lifecycle) order: the status
 * icon top-left, the live unfiltered count top-right, the status pill below.
 * The two open statuses (`SUBMITTED`, `UNDER_REVIEW`) render as a solid,
 * high-contrast alert whenever their count is non-zero — that is the reviewer's
 * backlog. Terminal statuses stay quiet. Clicking a card filters the queue to
 * that status; clicking the active one clears the filter.
 */
export const DisputeSummaryCards = ({
	counts,
	activeStatus,
	onSelect,
}: DisputeSummaryCardsProps) => (
	<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
		{Object.values(DISPUTE_STATUS).map((status) => {
			const active = status === activeStatus;
			const count = counts[status] ?? 0;
			const screaming = OPEN_STATUSES.includes(status) && count > 0;
			const Icon = statusIcon[status];

			return (
				<button
					key={status}
					type="button"
					aria-pressed={active}
					onClick={() => onSelect(active ? undefined : status)}
					className={cn(
						"flex flex-col gap-2 rounded-xl border p-4 text-left shadow-sm transition-colors",
						"focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
						screaming
							? attentionToneClass[status]
							: "bg-card hover:border-ring/60",
						active && "ring-ring ring-2 ring-offset-2",
					)}
				>
					<span className="flex items-start justify-between">
						<Icon
							className={cn(
								"size-5 shrink-0",
								screaming ? "text-white" : "text-muted-foreground",
							)}
						/>
						<span
							className={cn(
								"tabular-nums",
								screaming
									? "text-3xl font-bold"
									: "text-muted-foreground text-2xl font-semibold",
							)}
						>
							{count}
						</span>
					</span>
					<span
						className={cn(
							"w-fit rounded-full px-2 py-0.5 text-xs font-medium",
							screaming
								? "bg-white/20 text-white"
								: cn("border", disputeStatusToneClass[status]),
						)}
					>
						{humanize(status)}
					</span>
				</button>
			);
		})}
	</div>
);
