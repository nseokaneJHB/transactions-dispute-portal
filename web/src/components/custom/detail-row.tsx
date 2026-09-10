/** A label/value row for the card-based detail pages (transaction, dispute). */
export const DetailRow = ({
	label,
	value,
}: {
	label: string;
	value: string;
}) => (
	<div className="flex items-start justify-between gap-4 py-2 text-sm">
		<span className="text-muted-foreground">{label}</span>
		<span className="max-w-[60%] text-right font-medium break-all">{value}</span>
	</div>
);
