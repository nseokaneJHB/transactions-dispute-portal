import { describe, expect, it } from "vitest";

import { DISPUTE_STATUS } from "@transaction-dispute-portal/shared";

import { formatZar, humanize } from "@/lib/format";

const normalize = (value: string) => value.replace(/\s+/g, " ").trim();

describe("formatZar", () => {
	it("renders integer cents as a ZAR amount with a comma decimal", () => {
		expect(normalize(formatZar(123456))).toBe("R 1 234,56");
	});

	it("handles zero", () => {
		expect(normalize(formatZar(0))).toBe("R 0,00");
	});
});

describe("humanize", () => {
	it("title-cases a SCREAMING_SNAKE enum value", () => {
		expect(humanize(DISPUTE_STATUS.UNDER_REVIEW)).toBe("Under Review");
	});
});
