import type { ExperimentMetric } from "@/lib/domain/experiments";

export const STATISTICAL_CONFIG = {
  algorithmVersion: "17h-v1",
  minimumSampleSize: 30,
  minimumDurationHours: 24,
  staleAfterHours: 72,
  confidenceLevel: 0.95,
  alpha: 0.05,
  targetPower: 0.8,
  minimumRelativeEffect: 0.05,
  minimumAbsoluteEffect: 0.02,
  adequatePower: 0.8,
  borderlinePower: 0.6,
  adequateCoverage: 80,
} as const;

export type StatisticalFreshness = "fresh" | "aging" | "stale" | "unavailable";
export type StatisticalDataQuality = "high" | "medium" | "low" | "insufficient";
export type StatisticalStatus = "invalid" | "insufficient_data" | "running" | "inconclusive" | "statistically_promising" | "statistically_significant" | "winner" | "completed";
export type StatisticalRecommendation = "continue_experiment" | "review_promising_variant" | "winner_candidate" | "no_clear_winner" | "data_quality_issue";

export type MetricObservation = {
  value: number | null;
  sampleSize: number;
  coverage?: number;
  freshness?: StatisticalFreshness;
};

export type VariantObservation = MetricObservation & { id: string; label?: string; platform?: string | null };

export type ConfidenceInterval = { estimate: number; lowerBound: number; upperBound: number };
export type VariantStatisticalResult = {
  id: string;
  metric: number | null;
  sampleSize: number;
  sampleRatio: number | null;
  absoluteUplift: number | null;
  relativeUplift: number | null;
  direction: "positive" | "neutral" | "negative" | "insufficient_data";
  confidenceInterval: ConfidenceInterval | null;
  winnerConfidence: number;
  status: "insufficient_data" | "promising" | "likely_winner" | "winner" | "negative_signal" | "no_winner";
  power: number | null;
  platform?: string | null;
};

export type ExperimentStatisticalResult = {
  validity: StatisticalStatus;
  statisticalStatus: StatisticalStatus;
  sampleSize: number;
  sampleSufficiency: "below_threshold" | "exactly_threshold" | "above_threshold";
  control: { metric: number | null; sampleSize: number; confidenceInterval: ConfidenceInterval | null };
  variants: VariantStatisticalResult[];
  mde: { absolute: number | null; relative: number | null; confidenceLevel: number; targetPower: number };
  power: { currentPowerEstimate: number | null; targetPower: number; status: "insufficient" | "borderline" | "adequate" };
  duration: { durationHours: number; durationDays: number; minimumRecommendedDuration: number; status: "too_short" | "adequate" | "long_running" | "stale" };
  dataQuality: { status: StatisticalDataQuality; coverage: number; freshness: StatisticalFreshness };
  winnerVariantId: string | null;
  winnerConfidence: number;
  recommendation: StatisticalRecommendation;
  reasons: string[];
  algorithmVersion: string;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, finite(value) ? value : min));
const safeDivide = (numerator: number, denominator: number): number | null => denominator === 0 ? null : finite(numerator / denominator) ? numerator / denominator : null;

// Abramowitz-Stegun approximation: deterministic, bounded, and sufficient for UI intelligence.
function normalCdf(value: number): number {
  if (!finite(value)) return value > 0 ? 1 : 0;
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return clamp(0.5 * (1 + sign * erf), 0, 1);
}

export function isFiniteNumber(value: unknown): value is number { return finite(value); }
export function calculateUplift(control: number, variant: number): { absoluteUplift: number; relativeUplift: number | null; direction: "positive" | "neutral" | "negative" } {
  const absoluteUplift = variant - control;
  const relativeUplift = safeDivide(absoluteUplift, control);
  const direction = absoluteUplift > STATISTICAL_CONFIG.minimumAbsoluteEffect ? "positive" : absoluteUplift < -STATISTICAL_CONFIG.minimumAbsoluteEffect ? "negative" : "neutral";
  return { absoluteUplift, relativeUplift, direction };
}

export function wilsonInterval(estimate: number, sampleSize: number, confidenceLevel = STATISTICAL_CONFIG.confidenceLevel): ConfidenceInterval | null {
  if (!finite(estimate) || !Number.isInteger(sampleSize) || sampleSize <= 0 || !finite(confidenceLevel) || confidenceLevel <= 0 || confidenceLevel >= 1) return null;
  const p = clamp(estimate, 0, 1);
  const z = confidenceLevel >= 0.99 ? 2.576 : confidenceLevel >= 0.95 ? 1.96 : 1.645;
  const denominator = 1 + (z * z) / sampleSize;
  const centre = (p + (z * z) / (2 * sampleSize)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) / sampleSize) + (z * z) / (4 * sampleSize * sampleSize)) / denominator;
  return { estimate: p, lowerBound: clamp(centre - margin, 0, 1), upperBound: clamp(centre + margin, 0, 1) };
}

export function sampleSufficiency(sampleSize: number, minimum = STATISTICAL_CONFIG.minimumSampleSize): "below_threshold" | "exactly_threshold" | "above_threshold" {
  if (!Number.isFinite(sampleSize) || sampleSize < minimum) return "below_threshold";
  return sampleSize === minimum ? "exactly_threshold" : "above_threshold";
}

export function calculateMde(control: MetricObservation, variantSampleSize: number, confidenceLevel = STATISTICAL_CONFIG.confidenceLevel, targetPower = STATISTICAL_CONFIG.targetPower): { absolute: number | null; relative: number | null; confidenceLevel: number; targetPower: number; reason?: string } {
  const nControl = Math.max(0, Math.floor(control.sampleSize));
  const nVariant = Math.max(0, Math.floor(variantSampleSize));
  if (!finite(control.value) || nControl < 2 || nVariant < 2 || !finite(confidenceLevel) || confidenceLevel <= 0 || confidenceLevel >= 1 || !finite(targetPower) || targetPower <= 0 || targetPower >= 1) return { absolute: null, relative: null, confidenceLevel, targetPower, reason: "insufficient_sample_or_invalid_baseline" };
  const p = clamp(control.value / 100, 0, 1);
  const zAlpha = confidenceLevel >= 0.99 ? 2.576 : confidenceLevel >= 0.95 ? 1.96 : 1.645;
  const zPower = targetPower >= 0.8 ? 0.842 : targetPower >= 0.7 ? 0.524 : 0.253;
  const absolute = clamp((zAlpha + zPower) * Math.sqrt(Math.max(0.000001, p * (1 - p) * (1 / nControl + 1 / nVariant))), 0, 1);
  return { absolute, relative: safeDivide(absolute, p), confidenceLevel, targetPower };
}

export function normalizePlatformMetrics(input: Array<{ platform: string; control: MetricObservation; variant: MetricObservation }>): { platforms: Array<{ platform: string; coverage: number; absoluteUplift: number | null; relativeUplift: number | null }>; aggregate: { coverage: number; absoluteUplift: number | null; relativeUplift: number | null }; platformDependent: boolean } {
  const platforms = input.map((row) => {
    const coverage = Math.min(row.control.coverage ?? 0, row.variant.coverage ?? 0);
    const uplift = finite(row.control.value) && finite(row.variant.value) ? calculateUplift(row.control.value, row.variant.value) : null;
    return { platform: row.platform, coverage, absoluteUplift: uplift?.absoluteUplift ?? null, relativeUplift: uplift?.relativeUplift ?? null };
  });
  const usable = platforms.filter((row) => row.absoluteUplift !== null);
  const positive = usable.some((row) => row.absoluteUplift! > STATISTICAL_CONFIG.minimumAbsoluteEffect);
  const negative = usable.some((row) => row.absoluteUplift! < -STATISTICAL_CONFIG.minimumAbsoluteEffect);
  const coverage = usable.length === 0 ? 0 : usable.reduce((sum, row) => sum + row.coverage, 0) / usable.length;
  const weighted = input.filter((row) => finite(row.control.value) && finite(row.variant.value)).reduce((acc, row) => {
    const weight = Math.min(row.control.sampleSize, row.variant.sampleSize);
    acc.control += row.control.value! * weight; acc.variant += row.variant.value! * weight; acc.weight += weight; return acc;
  }, { control: 0, variant: 0, weight: 0 });
  const aggregate = weighted.weight === 0 ? { coverage, absoluteUplift: null, relativeUplift: null } : { coverage, ...calculateUplift(weighted.control / weighted.weight, weighted.variant / weighted.weight) };
  return { platforms, aggregate, platformDependent: positive && negative };
}

export function evaluateExperimentStatistics(input: { metric: ExperimentMetric; control: MetricObservation; variants: VariantObservation[]; startedAt: Date | null; evaluatedAt: Date; dataQuality?: { coverage?: number; freshness?: StatisticalFreshness }; complete?: boolean }): ExperimentStatisticalResult {
  const controlValue = finite(input.control.value) ? clamp(input.control.value, 0, 100) : null;
  const controlSampleSize = Number.isFinite(input.control.sampleSize) && input.control.sampleSize >= 0 ? Math.floor(input.control.sampleSize) : 0;
  const variantSampleSizes = input.variants.map((variant) => Math.max(0, Math.floor(Number.isFinite(variant.sampleSize) ? variant.sampleSize : 0)));
  const minimumVariantSample = variantSampleSizes.length ? Math.min(...variantSampleSizes) : 0;
  const totalSampleSize = controlSampleSize + variantSampleSizes.reduce((sum, size) => sum + size, 0);
  const sufficiency = sampleSufficiency(Math.min(controlSampleSize, minimumVariantSample));
  const freshness: StatisticalFreshness = input.dataQuality?.freshness ?? (input.variants.map((variant) => variant.freshness).includes("stale") ? "stale" : input.control.freshness ?? "unavailable");
  const coverage = clamp(Math.min(input.dataQuality?.coverage ?? 100, input.control.coverage ?? 100, ...input.variants.map((variant) => variant.coverage ?? 100)), 0, 100);
  const quality: StatisticalDataQuality = freshness === "unavailable" || coverage < 50 ? "insufficient" : freshness === "stale" || coverage < STATISTICAL_CONFIG.adequateCoverage ? "low" : freshness === "aging" ? "medium" : "high";
  const durationHours = input.startedAt ? Math.max(0, (input.evaluatedAt.getTime() - input.startedAt.getTime()) / 3_600_000) : 0;
  const durationStatus = freshness === "stale" ? "stale" : durationHours < STATISTICAL_CONFIG.minimumDurationHours ? "too_short" : durationHours > 24 * 30 ? "long_running" : "adequate";
  const controlInterval = controlValue === null ? null : wilsonInterval(controlValue / 100, controlSampleSize);
  const variants: VariantStatisticalResult[] = input.variants.map((variant, index) => {
    const sampleSize = variantSampleSizes[index];
    const metric = finite(variant.value) ? clamp(variant.value, 0, 100) : null;
    const interval = metric === null ? null : wilsonInterval(metric / 100, sampleSize);
    if (metric === null || controlValue === null || sampleSize < 2 || controlSampleSize < 2) return { id: variant.id, metric, sampleSize, sampleRatio: safeDivide(sampleSize, controlSampleSize), absoluteUplift: null, relativeUplift: null, direction: "insufficient_data", confidenceInterval: interval ? { estimate: interval.estimate * 100, lowerBound: interval.lowerBound * 100, upperBound: interval.upperBound * 100 } : null, winnerConfidence: 0, status: "insufficient_data", power: null, platform: variant.platform ?? null };
    const uplift = calculateUplift(controlValue, metric);
    const standardError = Math.sqrt(Math.max(0.000001, (controlValue / 100) * (1 - controlValue / 100) / controlSampleSize + (metric / 100) * (1 - metric / 100) / sampleSize));
    const zScore = Math.abs((metric - controlValue) / 100) / standardError;
    const power = clamp(normalCdf(zScore - 1.96) + normalCdf(-zScore - 1.96), 0, 1);
    const evidence = clamp((normalCdf(zScore) * 0.45) + (Math.min(sampleSize, STATISTICAL_CONFIG.minimumSampleSize) / STATISTICAL_CONFIG.minimumSampleSize * 0.25) + (quality === "high" ? 0.2 : quality === "medium" ? 0.1 : 0) + (durationStatus === "adequate" ? 0.1 : 0), 0, 1);
    const sufficient = sufficiency !== "below_threshold" && durationStatus === "adequate" && quality === "high";
    const statisticallyPositive = uplift.absoluteUplift >= STATISTICAL_CONFIG.minimumAbsoluteEffect && zScore >= 1.96;
    const statisticallyNegative = uplift.absoluteUplift <= -STATISTICAL_CONFIG.minimumAbsoluteEffect && zScore >= 1.96;
    const status = statisticallyPositive && sufficient && power >= STATISTICAL_CONFIG.adequatePower ? "winner" : statisticallyPositive ? "promising" : statisticallyNegative ? "negative_signal" : sufficient ? "no_winner" : uplift.direction === "positive" ? "promising" : "no_winner";
    return { id: variant.id, metric, sampleSize, sampleRatio: safeDivide(sampleSize, controlSampleSize), absoluteUplift: uplift.absoluteUplift, relativeUplift: uplift.relativeUplift, direction: uplift.direction, confidenceInterval: interval ? { estimate: interval.estimate * 100, lowerBound: interval.lowerBound * 100, upperBound: interval.upperBound * 100 } : null, winnerConfidence: evidence, status, power, platform: variant.platform ?? null };
  });
  const best = [...variants].filter((variant) => variant.status === "winner").sort((a, b) => b.winnerConfidence - a.winnerConfidence || a.id.localeCompare(b.id))[0];
  const anyPromising = variants.some((variant) => variant.status === "promising");
  const commonReasons: string[] = [];
  if (sufficiency === "below_threshold") commonReasons.push("Sample belum cukup untuk membedakan perubahan kecil secara meyakinkan.");
  if (durationStatus === "too_short") commonReasons.push("Experiment belum berjalan selama durasi minimum.");
  if (durationStatus === "stale") commonReasons.push("Analytics stale; hasil lama tidak diperlakukan sebagai bukti real-time.");
  if (quality !== "high") commonReasons.push("Coverage atau freshness data menurunkan kekuatan evidence.");
  if (anyPromising && !best) commonReasons.push("Variant terlihat promising, tetapi belum cukup bukti untuk menentukan pemenang.");
  if (!best && sufficiency !== "below_threshold" && durationStatus === "adequate" && quality === "high") commonReasons.push("Tidak ada perbedaan yang cukup konsisten untuk memilih winner.");
  const statisticalStatus: StatisticalStatus = input.complete ? best ? "winner" : anyPromising ? "statistically_promising" : "inconclusive" : best ? "statistically_significant" : anyPromising ? "statistically_promising" : sufficiency === "below_threshold" ? "insufficient_data" : "running";
  const currentPower = variants.length ? Math.max(...variants.map((variant) => variant.power ?? 0)) : 0;
  const mde = calculateMde(input.control, minimumVariantSample);
  return {
    validity: quality === "insufficient" || controlValue === null ? "invalid" : statisticalStatus,
    statisticalStatus,
    sampleSize: totalSampleSize,
    sampleSufficiency: sufficiency,
    control: { metric: controlValue, sampleSize: controlSampleSize, confidenceInterval: controlInterval ? { estimate: controlInterval.estimate * 100, lowerBound: controlInterval.lowerBound * 100, upperBound: controlInterval.upperBound * 100 } : null },
    variants,
    mde: { absolute: mde.absolute === null ? null : mde.absolute * 100, relative: mde.relative, confidenceLevel: mde.confidenceLevel, targetPower: mde.targetPower },
    power: { currentPowerEstimate: currentPower, targetPower: STATISTICAL_CONFIG.targetPower, status: currentPower >= STATISTICAL_CONFIG.adequatePower ? "adequate" : currentPower >= STATISTICAL_CONFIG.borderlinePower ? "borderline" : "insufficient" },
    duration: { durationHours: Math.round(durationHours * 100) / 100, durationDays: Math.round(durationHours / 24 * 100) / 100, minimumRecommendedDuration: STATISTICAL_CONFIG.minimumDurationHours, status: durationStatus },
    dataQuality: { status: quality, coverage, freshness },
    winnerVariantId: best?.id ?? null,
    winnerConfidence: best?.winnerConfidence ?? 0,
    recommendation: best ? "winner_candidate" : anyPromising ? "review_promising_variant" : quality !== "high" ? "data_quality_issue" : sufficiency === "below_threshold" || durationStatus === "too_short" ? "continue_experiment" : "no_clear_winner",
    reasons: commonReasons.length ? commonReasons : ["Evidence saat ini konsisten dengan perbandingan yang tersedia."],
    algorithmVersion: STATISTICAL_CONFIG.algorithmVersion,
  };
}
