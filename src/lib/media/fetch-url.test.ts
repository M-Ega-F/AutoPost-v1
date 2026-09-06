import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { fetchMediaFromUrl, isBlockedAddress, isBlockedHostname } from "@/lib/media/fetch-url";
import { AppError } from "@/lib/errors";

describe("isBlockedHostname", () => {
  test("internal names are blocked", () => {
    for (const hostname of [
      "localhost",
      "LOCALHOST",
      "localhost.",
      "metadata",
      "metadata.google.internal",
      "metadata.goog",
      "instance-data",
      "ip6-localhost",
      "ip6-loopback",
    ]) {
      assert.equal(isBlockedHostname(hostname), true, hostname);
    }
  });

  test("internal suffixes are blocked", () => {
    for (const hostname of [
      "api.localhost",
      "nas.local",
      "vault.internal",
      "printer.localdomain",
      "router.home.arpa",
    ]) {
      assert.equal(isBlockedHostname(hostname), true, hostname);
    }
  });

  test("an empty hostname is blocked", () => {
    assert.equal(isBlockedHostname(""), true);
  });

  test("ordinary public hosts are allowed", () => {
    for (const hostname of [
      "example.com",
      "cdn.example.co.uk",
      "scontent.cdninstagram.com",
      "p16-sign.tiktokcdn.com",
    ]) {
      assert.equal(isBlockedHostname(hostname), false, hostname);
    }
  });
});

describe("isBlockedAddress", () => {
  test("loopback, unspecified and private IPv4 are blocked", () => {
    for (const address of [
      "127.0.0.1",
      "127.1.2.3",
      "0.0.0.0",
      "10.1.2.3",
      "10.255.255.255",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
    ]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });

  test("link-local and cloud metadata addresses are blocked", () => {
    for (const address of [
      "169.254.169.254",
      "169.254.0.1",
      "100.100.100.200",
      "100.64.0.1",
      "100.127.255.255",
    ]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });

  test("documentation, benchmarking and multicast ranges are blocked", () => {
    for (const address of [
      "192.0.2.1",
      "198.51.100.7",
      "203.0.113.9",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });

  test("IPv6 special ranges are blocked", () => {
    for (const address of [
      "::1",
      "::",
      "fc00::1",
      "fd00::abcd",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "2002::1",
      "64:ff9b::1.2.3.4",
      "100::",
    ]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });

  test("IPv4-mapped IPv6 wraps a private IPv4", () => {
    for (const address of ["::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::127.0.0.1"]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });

  test("public addresses are allowed", () => {
    for (const address of ["93.184.216.34", "8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255"]) {
      assert.equal(isBlockedAddress(address), false, address);
    }
  });

  test("public IPv6 addresses are allowed", () => {
    for (const address of ["2606:4700::1111", "2606:4700:4700::64", "2400:cb00::1"]) {
      assert.equal(isBlockedAddress(address), false, address);
    }
  });

  test("an unparseable address is blocked", () => {
    for (const address of ["", "not-an-ip", "999.999.999.999", "example.com", "1.2.3.4.5"]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });
});

describe("fetchMediaFromUrl URL gate", () => {
  /** Asserts the request is refused before a socket is ever opened. */
  async function assertRejected(rawUrl: string, expectedMessage?: string): Promise<void> {
    const error = await fetchMediaFromUrl(rawUrl).then(
      () => undefined,
      (cause: unknown) => cause,
    );

    assert.ok(error instanceof AppError, `${rawUrl} should be rejected with an AppError`);
    assert.equal(error.code, "invalid_media_url");
    if (expectedMessage) assert.equal(error.message, expectedMessage);
  }

  test("plain HTTP is rejected", async () => {
    await assertRejected("http://93.184.216.34/photo.jpg", "Only HTTPS URLs are supported.");
  });

  test("URLs carrying credentials are rejected (parser confusion)", async () => {
    await assertRejected("https://good.example.com@127.0.0.1/photo.jpg", "Invalid media URL.");
    await assertRejected("https://user:pass@93.184.216.34/photo.jpg", "Invalid media URL.");
  });

  test("non-http(s) schemes are rejected", async () => {
    await assertRejected("file:///etc/passwd", "Only HTTPS URLs are supported.");
    await assertRejected("ftp://93.184.216.34/photo.jpg", "Only HTTPS URLs are supported.");
    await assertRejected("data:image/png;base64,AAAA", "Only HTTPS URLs are supported.");
  });

  test("garbage and empty input are rejected", async () => {
    await assertRejected("", "Invalid media URL.");
    await assertRejected("   ", "Invalid media URL.");
    await assertRejected("https://", "Invalid media URL.");
    await assertRejected("not a url", "Invalid media URL.");
  });
});
