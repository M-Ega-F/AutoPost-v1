import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import { createCampaign } from "@/lib/domain/campaigns";
import { createOptimizationAction, canTransitionOptimizationAction, listOptimizationActions, transitionOptimizationAction } from "@/lib/domain/campaign-optimization";
import { addExperimentVariant, canTransitionExperiment, createExperiment, evaluateExperiment, listExperimentResultHistory, transitionExperiment } from "@/lib/domain/experiments";
import { AppError } from "@/lib/errors";

import { insertPost, setupTestDatabase, OTHER_USER_ID, USER_ID } from "./fixtures";

beforeEach(async () => setupTestDatabase());

test("optimization actions use a guarded lifecycle and stay campaign-scoped", async () => {
  const campaign = await createCampaign(USER_ID, { name: "Optimization actions" });
  const action = await createOptimizationAction(USER_ID, campaign.id, { title: "Test a shorter hook", actionType: "test_hook" });
  assert.equal(action.status, "proposed");
  assert.equal(canTransitionOptimizationAction("proposed", "accepted"), true);
  assert.equal(canTransitionOptimizationAction("completed", "accepted"), false);
  const accepted = await transitionOptimizationAction(USER_ID, campaign.id, action.id, "accepted");
  assert.equal(accepted.status, "accepted");
  assert.equal((await listOptimizationActions(USER_ID, campaign.id)).length, 1);
  await assert.rejects(() => listOptimizationActions(OTHER_USER_ID, campaign.id), (error: unknown) => error instanceof AppError && (error.code === "forbidden" || error.code === "not_found"));
});

test("experiments require variants, cap lifecycle transitions, and return insufficient data safely", async () => {
  const campaign = await createCampaign(USER_ID, { name: "Experiment safety" });
  const controlPost = await insertPost({ campaignId: campaign.id, status: "published" });
  const variantPost = await insertPost({ campaignId: campaign.id, status: "published" });
  const experiment = await createExperiment(USER_ID, campaign.id, { name: "Hook test", experimentType: "hook", primaryMetric: "views", controlPostId: controlPost });
  assert.equal(canTransitionExperiment("draft", "planned"), true);
  await assert.rejects(() => transitionExperiment(USER_ID, campaign.id, experiment.id, "planned"), (error: unknown) => error instanceof AppError && error.code === "validation_failed");
  await addExperimentVariant(USER_ID, campaign.id, experiment.id, { label: "Alternative hook", variantType: "hook", postId: variantPost });
  const planned = await transitionExperiment(USER_ID, campaign.id, experiment.id, "planned");
  assert.equal(planned.status, "planned");
  const running = await transitionExperiment(USER_ID, campaign.id, experiment.id, "running");
  assert.equal(running.status, "running");
  const result = await evaluateExperiment(USER_ID, campaign.id, experiment.id);
  assert.equal(result.status, "insufficient_data");
  assert.equal(result.winnerVariantId, null);
  assert.equal(result.algorithmVersion, "17h-v1");
  assert.equal(result.statisticalStatus, "insufficient_data");
  const retried = await evaluateExperiment(USER_ID, campaign.id, experiment.id);
  assert.equal(retried.id, result.id);
  assert.equal((await listExperimentResultHistory(USER_ID, campaign.id, experiment.id)).total, 1);
  await assert.rejects(() => addExperimentVariant(USER_ID, campaign.id, experiment.id, { label: "Too late", variantType: "hook" }), (error: unknown) => error instanceof AppError && error.code === "conflict");
});

test("experiment control and variant posts cannot cross campaign boundaries", async () => {
  const campaign = await createCampaign(USER_ID, { name: "Primary campaign" });
  const otherCampaign = await createCampaign(USER_ID, { name: "Other campaign" });
  const foreignPost = await insertPost({ campaignId: otherCampaign.id, status: "published" });
  await assert.rejects(() => createExperiment(USER_ID, campaign.id, { name: "Invalid control", experimentType: "content", primaryMetric: "views", controlPostId: foreignPost }), (error: unknown) => error instanceof AppError && error.code === "validation_failed");
});
