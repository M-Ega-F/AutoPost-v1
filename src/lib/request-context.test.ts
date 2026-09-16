import assert from "node:assert/strict";
import test from "node:test";

import { currentPerfContext, withPerfRequest } from "@/lib/perf";
import {
  currentRequestContext,
  setRequestTransportCorrelation,
  withRequestContext,
} from "@/lib/request-context";
import type { TransportCorrelation } from "@/lib/transport";

test("request contexts stay isolated across concurrent requests", async () => {
  const [first, second] = await Promise.all([
    withRequestContext(async () => {
      const context = currentRequestContext();
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.strictEqual(currentRequestContext(), context);
      return context;
    }),
    withRequestContext(async () => {
      const context = currentRequestContext();
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.strictEqual(currentRequestContext(), context);
      return context;
    }),
  ]);

  assert.ok(first);
  assert.ok(second);
  assert.notStrictEqual(first, second);
  assert.equal(currentRequestContext(), undefined);
});

test("nested perf boundaries reuse request and correlation context", async () => {
  const previousAppEnv = process.env.APP_ENV;
  process.env.APP_ENV = "staging";

  try {
    await withPerfRequest("outer", async () => {
      const outerRequestContext = currentRequestContext();
      const outerPerfContext = currentPerfContext();
      assert.ok(outerRequestContext);
      assert.ok(outerPerfContext);

      await withPerfRequest("inner", async () => {
        const innerRequestContext = currentRequestContext();
        const innerPerfContext = currentPerfContext();
        assert.strictEqual(innerRequestContext, outerRequestContext);
        assert.equal(innerPerfContext?.requestId, outerPerfContext.requestId);
        assert.equal(innerPerfContext?.contextId, outerPerfContext.contextId);
        assert.equal(innerPerfContext?.endpoint, "inner");
        assert.equal(innerPerfContext?.contextReused, true);
      });

      assert.strictEqual(currentRequestContext(), outerRequestContext);
      assert.strictEqual(currentPerfContext(), outerPerfContext);
    });
  } finally {
    if (previousAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previousAppEnv;
  }

  assert.equal(currentRequestContext(), undefined);
  assert.equal(currentPerfContext(), undefined);
});

test("transport affinity prevents a cached render context crossing transports", async () => {
  let firstContext;
  let secondContext;

  await withRequestContext(() => {
    firstContext = currentRequestContext();
  }, "transport-a");

  await withRequestContext(() => {
    secondContext = currentRequestContext();
  }, "transport-b");

  assert.ok(firstContext);
  assert.ok(secondContext);
  assert.notStrictEqual(firstContext, secondContext);
});

test("transport correlation cannot be overwritten by another transport", async () => {
  const first: TransportCorrelation = {
    transportId: "transport-a",
    transportKind: "DOCUMENT",
  };
  const second: TransportCorrelation = {
    transportId: "transport-b",
    transportKind: "API",
  };

  await withRequestContext(() => {
    assert.equal(setRequestTransportCorrelation(first), true);
    assert.equal(setRequestTransportCorrelation(second), false);
    assert.equal(currentRequestContext()?.transportId, first.transportId);
    assert.equal(currentRequestContext()?.transportKind, first.transportKind);
  }, first.transportId);
});
