import { after, test } from "node:test";
import assert from "node:assert/strict";

import {
  createInstagramContainer,
  getInstagramContainerStatus,
  publishInstagramContainer,
  publishPagePhoto,
} from "./graph";

const previousFetch = globalThis.fetch;

after(() => {
  globalThis.fetch = previousFetch;
});

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("Instagram Login uses graph.instagram.com for the full container lifecycle", async () => {
  const calls: Array<{ url: string; method: string; authorization: string }> = [];
  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      authorization: headers.get("authorization") ?? "",
    });

    if (calls.length === 1) return okResponse({ id: "container-1" });
    if (calls.length === 2) return okResponse({ status_code: "FINISHED" });
    return okResponse({ id: "media-1" });
  };

  const token = "test-instagram-login-token";
  await createInstagramContainer({
    igUserId: "ig-user-1",
    token,
    platform: "instagram",
    authSource: "instagram_login",
    mediaType: "IMAGE",
    mediaUrl: "https://cdn.example.test/image.jpg",
    caption: "Test caption",
  });
  await getInstagramContainerStatus({
    token,
    platform: "instagram",
    authSource: "instagram_login",
    containerId: "container-1",
  });
  await publishInstagramContainer({
    igUserId: "ig-user-1",
    token,
    platform: "instagram",
    authSource: "instagram_login",
    creationId: "container-1",
  });

  assert.deepEqual(
    calls.map(({ url, method }) => ({
      host: new URL(url).host,
      pathname: new URL(url).pathname,
      method,
    })),
    [
      {
        host: "graph.instagram.com",
        pathname: "/v26.0/ig-user-1/media",
        method: "POST",
      },
      {
        host: "graph.instagram.com",
        pathname: "/v26.0/container-1",
        method: "GET",
      },
      {
        host: "graph.instagram.com",
        pathname: "/v26.0/ig-user-1/media_publish",
        method: "POST",
      },
    ],
  );
  assert.equal(calls.every((call) => call.authorization === `Bearer ${token}`), true);
});

test("Facebook Page publishing remains on graph.facebook.com", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    return okResponse({ id: "page-photo-1" });
  };

  await publishPagePhoto({
    pageId: "page-1",
    token: "test-facebook-page-token",
    platform: "facebook",
    url: "https://cdn.example.test/image.jpg",
    message: "Test caption",
  });

  const request = calls[0];
  assert.ok(request);
  assert.equal(new URL(request.url).host, "graph.facebook.com");
  assert.equal(new URL(request.url).pathname, "/v26.0/page-1/photos");
  assert.equal(request.method, "POST");
});
