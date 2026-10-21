import { describe, expect, it } from "vitest";

import {
	AMOUNT_SLIDER_MAX_CENTS,
	amountBoundsToSlider,
	sliderToAmountBounds,
} from "./list-query";

describe("amountBoundsToSlider", () => {
	it("puts unset bounds at the slider's ends", () => {
		expect(amountBoundsToSlider(undefined, undefined)).toEqual([
			0,
			AMOUNT_SLIDER_MAX_CENTS,
		]);
	});

	it("clamps a bound above the slider's top end", () => {
		expect(amountBoundsToSlider(10_000, 9_000_000)).toEqual([
			10_000,
			AMOUNT_SLIDER_MAX_CENTS,
		]);
	});
});

describe("sliderToAmountBounds", () => {
	it("leaves a side unbounded when its thumb is at the end", () => {
		expect(sliderToAmountBounds([0, AMOUNT_SLIDER_MAX_CENTS])).toEqual({
			min_amount_cents: undefined,
			max_amount_cents: undefined,
		});
	});

	it("sends the bounds of a narrowed range", () => {
		expect(sliderToAmountBounds([50_000, 200_000])).toEqual({
			min_amount_cents: 50_000,
			max_amount_cents: 200_000,
		});
	});
});
