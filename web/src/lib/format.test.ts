import { afterEach, describe, expect, it } from "vitest";

import { DISPUTE_STATUS } from "@transaction-dispute-portal/shared";

import { formatDate, formatDateTime, formatZar, humanize } from "@/lib/format";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("formatZar", () => {
	it("renders integer cents as a ZAR amount with a comma decimal", () => {
		expect(normalize(formatZar(123456))).toBe("R 1 234,56");
	});

	it("handles zero", () => {
		expect(normalize(formatZar(0))).toBe("R 0,00");
	});
});

describe("formatDate / formatDateTime timezone independence", () => {
	const originalTz = process.env.TZ;

	afterEach(() => {
		process.env.TZ = originalTz;
	});

	it("renders the same string regardless of the process's local timezone", () => {
		const iso = "2026-09-06T22:30:00.000Z";

		process.env.TZ = "UTC";
		const inUtc = { date: formatDate(iso), dateTime: formatDateTime(iso) };

		process.env.TZ = "America/New_York";
		const inNewYork = { date: formatDate(iso), dateTime: formatDateTime(iso) };

		expect(inNewYork).toEqual(inUtc);
		expect(inUtc.date).toBe("7 September 2026");
		expect(inUtc.dateTime).toBe("7 Sep 2026, 00:30");
	});
});

describe("humanize", () => {
	it("title-cases a SCREAMING_SNAKE enum value", () => {
		expect(humanize(DISPUTE_STATUS.UNDER_REVIEW)).toBe("Under Review");
	});
});
