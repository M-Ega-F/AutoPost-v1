import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import type { MediaAsset, PublishInput } from "../types";
import { linkedinProvider } from "./index";

const previousClientId = process.env.LINKEDIN_CLIENT_ID;
const previousClientSecret = process.env.LINKEDIN_CLIENT_SECRET;
const previousApiVersion = process.env.LINKEDIN_API_VERSION;
const originalFetch = globalThis.fetch;

process.env.LINKEDIN_CLIENT_ID = "test-linkedin-client-id";
process.env.LINKEDIN_CLIENT_SECRET = "test-linkedin-client-secret";
process.env.LINKEDIN_API_VERSION = "202604";

type FetchCall = { url: string; init: RequestInit };

function response(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function mockFetch(
  ...responses: Array<{
    body?: unknown;
    status?: number;
    headers?: Record<string, string>;
  }>
): FetchCall[] {
  const calls: FetchCall[] = [];
  let index = 0;
  globalThis.fetch = (async (input, init = {}) => {
    calls.push({ url: String(input), init });
    const next = responses[index++];
    if (!next) throw new Error("Unexpected test fetch call.");
    return response(next.body, next.status, next.headers);
  }) as typeof globalThis.fetch;
  return calls;
}

function media(mediaType: MediaAsset["mediaType"]): MediaAsset {
  return {
    mediaType,
    mimeType: mediaType === "image" ? "image/jpeg" : "video/mp4",
    storageKey: `user-1/${mediaType}.bin`,
    sourceUrl: null,
    fileSize: 3,
    width: mediaType === "image" ? 1080 : 720,
    height: mediaType === "image" ? 1080 : 1280,
    duration: mediaType === "video" ? 5 : null,
  };
}

function publishInput(mediaType: MediaAsset["mediaType"]): PublishInput {
  return {
    postPlatformId: "post-platform-1",
    account: {
      id: "account-1",
      userId: "user-1",
      platform: "linkedin",
      platformAccountId: "member-1",
      username: "member",
      displayName: "Member",
      avatarUrl: null,
      encryptedAccessToken: "not-used-by-publish",
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      scopes: "openid,profile,w_member_social",
      status: "active",
      lastErrorCode: null,
      lastErrorMessage: null,
      metadata: { authorUrn: "urn:li:person:member-1" },
    },
    accessToken: "test-access-token",
    caption: "Hello LinkedIn",
    media: media(mediaType),
    resolveMediaUrl: async () => "https://media.example.test/media",
    readMedia: async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: mediaType === "image" ? "image/jpeg" : "video/mp4",
      size: 3,
    }),
  };
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  if (previousClientId === undefined) delete process.env.LINKEDIN_CLIENT_ID;
  else process.env.LINKEDIN_CLIENT_ID = previousClientId;
  if (previousClientSecret === undefined) delete process.env.LINKEDIN_CLIENT_SECRET;
  else process.env.LINKEDIN_CLIENT_SECRET = previousClientSecret;
  if (previousApiVersion === undefined) delete process.env.LINKEDIN_API_VERSION;
  else process.env.LINKEDIN_API_VERSION = previousApiVersion;
});

test("LinkedIn image publishing uses Images API and image URNs", async () => {
  const calls = mockFetch(
    {
      body: {
        value: {
          uploadUrl: "https://upload.example.test/image",
          image: "urn:li:image:test-image",
        },
      },
    },
    { status: 201 },
    { status: 201, headers: { "x-restli-id": "urn:li:share:image-1" } },
  );

  const result = await linkedinProvider.publish(publishInput("image"));
  const initializeBody = JSON.parse(String(calls[0]?.init.body)) as {
    initializeUploadRequest: { owner: string };
  };
  const postBody = JSON.parse(String(calls[2]?.init.body)) as {
    content: { media: { id: string } };
  };

  assert.equal(result.status, "published");
  assert.equal(calls.length, 3);
  assert.equal(new URL(calls[0].url).pathname, "/rest/images");
  assert.equal(new URL(calls[0].url).searchParams.get("action"), "initializeUpload");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(initializeBody.initializeUploadRequest.owner, "urn:li:person:member-1");
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer test-access-token");
  assert.equal(new Headers(calls[0].init.headers).get("linkedin-version"), "202604");
  assert.equal(new Headers(calls[0].init.headers).get("x-restli-protocol-version"), "2.0.0");
  assert.equal(calls[1].url, "https://upload.example.test/image");
  assert.equal(calls[1].init.method, "PUT");
  assert.equal(new URL(calls[2].url).pathname, "/rest/posts");
  assert.equal(calls[2].init.method, "POST");
  assert.equal(postBody.content.media.id, "urn:li:image:test-image");
  assert.equal(JSON.stringify(postBody).includes("digitalmediaAsset"), false);
  assert.equal(calls.some((call) => call.url.includes("/rest/assets?action=registerUpload")), false);
});

test("LinkedIn video publishing keeps the Assets API flow", async () => {
  const calls = mockFetch(
    {
      body: {
        value: {
          asset: "urn:li:digitalmediaAsset:test-video",
          uploadMechanism: {
            "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
              uploadUrl: "https://upload.example.test/video",
            },
          },
        },
      },
    },
    { status: 201 },
    { status: 201, headers: { "x-restli-id": "urn:li:share:video-1" } },
  );

  const result = await linkedinProvider.publish(publishInput("video"));
  const registerBody = JSON.parse(String(calls[0]?.init.body)) as {
    registerUploadRequest: { recipes: string[] };
  };
  const postBody = JSON.parse(String(calls[2]?.init.body)) as {
    content: { media: { id: string } };
  };

  assert.equal(result.status, "published");
  assert.equal(calls.length, 3);
  assert.equal(new URL(calls[0].url).pathname, "/rest/assets");
  assert.equal(new URL(calls[0].url).searchParams.get("action"), "registerUpload");
  assert.deepEqual(registerBody.registerUploadRequest.recipes, [
    "urn:li:digitalmediaRecipe:feedshare-video",
  ]);
  assert.equal(calls[1].url, "https://upload.example.test/video");
  assert.equal(new URL(calls[2].url).pathname, "/rest/posts");
  assert.equal(postBody.content.media.id, "urn:li:digitalmediaAsset:test-video");
});

