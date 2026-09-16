import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateMde, calculateUplift, evaluateExperimentStatistics, normalizePlatformMetrics, sampleSufficiency, wilsonInterval } from "@/lib/domain/experiment-statistics";

const now = new Date("2026-09-15T12:00:00.000Z");
const started = new Date("2026-09-14T12:00:00.000Z");

test("uplift is finite for positive, negative, zero, and zero baselines", () => {
  assert.deepEqual(calculateUplift(10, 12).direction, "positive");
  assert.deepEqual(calculateUplift(10, 8).direction, "negative");
  assert.deepEqual(calculateUplift(10, 10).absoluteUplift, 0);
  assert.equal(calculateUplift(0, 12).relativeUplift, null);
});

test("Wilson confidence interval stays inside a valid proportion", () => {
  const interval = wilsonInterval(0.12, 100);
  assert.ok(interval);
  assert.ok(interval.lowerBound <= interval.estimate && interval.estimate <= interval.upperBound);
  assert.equal(wilsonInterval(0.12, 0), null);
  assert.equal(wilsonInterval(Number.NaN, 100), null);
});

test("sample sufficiency recognizes below, exact, and above thresholds", () => {
  assert.equal(sampleSufficiency(29), "below_threshold");
  assert.equal(sampleSufficiency(30), "exactly_threshold");
  assert.equal(sampleSufficiency(31), "above_threshold");
});

test("MDE and power return safe values when data is valid or insufficient", () => {
  const mde = calculateMde({ value: 10, sampleSize: 100 }, 100);
  assert.ok(mde.absolute !== null && mde.absolute > 0);
  assert.ok(mde.relative !== null && Number.isFinite(mde.relative));
  assert.equal(calculateMde({ value: 0, sampleSize: 100 }, 100).relative, null);
  assert.equal(calculateMde({ value: 10, sampleSize: 1 }, 100).absolute, null);
});

test("high uplift with a small sample remains promising, not a winner", () => {
  const result = evaluateExperimentStatistics({ metric: "views", control: { value: 10, sampleSize: 3, coverage: 100, freshness: "fresh" }, variants: [{ id: "variant-a", value: 40, sampleSize: 3, coverage: 100, freshness: "fresh" }], startedAt: started, evaluatedAt: now, dataQuality: { coverage: 100, freshness: "fresh" } });
  assert.equal(result.winnerVariantId, null);
  assert.equal(result.recommendation, "review_promising_variant");
  assert.match(result.reasons.join(" "), /belum cukup/i);
});

test("adequate positive evidence can identify a winner deterministically", () => {
  const input = { metric: "views" as const, control: { value: 10, sampleSize: 500, coverage: 100, freshness: "fresh" as const }, variants: [{ id: "variant-a", value: 30, sampleSize: 500, coverage: 100, freshness: "fresh" as const }], startedAt: started, evaluatedAt: now, dataQuality: { coverage: 100, freshness: "fresh" as const } };
  const first = evaluateExperimentStatistics(input);
  const second = evaluateExperimentStatistics(input);
  assert.deepEqual(first, second);
  assert.equal(first.winnerVariantId, "variant-a");
  assert.equal(first.statisticalStatus, "statistically_significant");
});

test("stale or incomplete data lowers quality and blocks winner claims", () => {
  const result = evaluateExperimentStatistics({ metric: "views", control: { value: 10, sampleSize: 500, coverage: 100, freshness: "stale" }, variants: [{ id: "variant-a", value: 30, sampleSize: 500, coverage: 100, freshness: "stale" }], startedAt: started, evaluatedAt: now, dataQuality: { coverage: 100, freshness: "stale" } });
  assert.equal(result.dataQuality.status, "low");
  assert.equal(result.winnerVariantId, null);
  assert.equal(result.duration.status, "stale");
});

test("platform normalization reports mixed platform direction instead of a global winner", () => {
  const result = normalizePlatformMetrics([
    { platform: "instagram", control: { value: 10, sampleSize: 100, coverage: 100 }, variant: { value: 15, sampleSize: 100, coverage: 100 } },
    { platform: "tiktok", control: { value: 10, sampleSize: 100, coverage: 100 }, variant: { value: 8, sampleSize: 100, coverage: 100 } },
  ]);
  assert.equal(result.platformDependent, true);
  assert.equal(result.aggregate.coverage, 100);
});
