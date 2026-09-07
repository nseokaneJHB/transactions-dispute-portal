import {
	DISPUTE_STATUS,
	type DisputeStatus,
} from "@transaction-dispute-portal/shared";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { humanize } from "@/lib/format";

const toneClass: Record<DisputeStatus, string> = {
	[DISPUTE_STATUS.SUBMITTED]:
		"border-status-submitted/30 text-status-submitted bg-status-submitted/10",
	[DISPUTE_STATUS.UNDER_REVIEW]:
		"border-status-under-review/30 text-status-under-review bg-status-under-review/10",
	[DISPUTE_STATUS.RESOLVED]:
		"border-status-resolved/30 text-status-resolved bg-status-resolved/10",
	[DISPUTE_STATUS.REJECTED]:
		"border-status-rejected/30 text-status-rejected bg-status-rejected/10",
	[DISPUTE_STATUS.WITHDRAWN]:
		"border-status-withdrawn/30 text-status-withdrawn bg-status-withdrawn/10",
};

export const StatusBadge = ({ status }: { status: DisputeStatus }) => (
	<Badge className={cn(toneClass[status])}>{humanize(status)}</Badge>
);
