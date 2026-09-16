import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyTransport,
  transportCorrelationFromHeaders,
  TRANSPORT_ID_HEADER,
  TRANSPORT_KIND_HEADER,
} from "@/lib/transport";

function classify(
  method: string,
  pathname: string,
  headers: Record<string, string> = {},
  query = "",
) {
  return classifyTransport({
    method,
    pathname,
    searchParams: new URLSearchParams(query),
    headers: new Headers(headers),
  });
}

test("classifies document, RSC, prefetch, action, and API signals", () => {
  assert.equal(classify("GET", "/history").kind, "DOCUMENT");
  assert.equal(classify("GET", "/history", { rsc: "1" }).kind, "RSC");
  assert.equal(
    classify("GET", "/history", { "next-router-prefetch": "1" }).kind,
    "PREFETCH",
  );
  assert.equal(
    classify("POST", "/history", { "next-action": "opaque-action-id" }).kind,
    "SERVER_ACTION",
  );
  assert.equal(classify("GET", "/api/notifications").kind, "API");
});

test("transport correlation accepts only proxy-shaped metadata", () => {
  const headers = new Headers({
    [TRANSPORT_ID_HEADER]: "123e4567-e89b-42d3-a456-426614174000",
    [TRANSPORT_KIND_HEADER]: "RSC",
  });
  assert.deepEqual(transportCorrelationFromHeaders(headers), {
    transportId: "123e4567-e89b-42d3-a456-426614174000",
    transportKind: "RSC",
  });

  headers.set(TRANSPORT_KIND_HEADER, "not-a-kind");
  assert.equal(transportCorrelationFromHeaders(headers), undefined);
});
