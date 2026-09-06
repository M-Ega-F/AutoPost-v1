import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, describe, test } from "node:test";

import {
  checkPasswordBreach,
  isPasswordPwned,
  isSuffixPwned,
  parsePwnedRanges,
  splitSha1,
} from "@/lib/auth/password-security";

const HIBP_ENDPOINT = "https://api.pwnedpasswords.com/range/";

// Public, widely published fixture: SHA-1("password") =
// 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8. It appears in every breach corpus,
// so it is a fixture rather than a secret.
const PWNED_PASSWORD = "password";
const PWNED_SHA1 = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";
const PWNED_PREFIX = "5BAA6";
const PWNED_SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

const SAFE_PASSWORD = "Zq7#vT2mXb9!kR4pLd8wYc3";
const UNICODE_PASSWORD = "pÄsswört-密码-🔐-Ω";

const STATIC_LOG_MESSAGES = [
  "password breach check failed",
  "password breach check unavailable",
];

type FetchInput = Parameters<typeof globalThis.fetch>[0];
type FetchInit = Parameters<typeof globalThis.fetch>[1];
type WriteFn = typeof process.stdout.write;
type ConsoleMethod = "log" | "warn" | "error";

type FetchCall = { url: string; init: FetchInit };

const originalFetch = globalThis.fetch;
const fetchCalls: FetchCall[] = [];

function requestUrl(input: FetchInput): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function stubFetch(
  respond: (url: string, init: FetchInit) => Response | Promise<Response>,
): void {
  globalThis.fetch = (async (
    input: FetchInput,
    init: FetchInit,
  ): Promise<Response> => {
    const url = requestUrl(input);
    fetchCalls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof globalThis.fetch;
}

/** A HIBP suffix is 35 uppercase hex characters. */
function hexSuffix(seed: number): string {
  return seed.toString(16).toUpperCase().padStart(35, "0");
}

function rangeBody(
  entries: Array<[string, number]>,
  lineEnding = "\r\n",
): string {
  return (
    entries.map(([suffix, count]) => `${suffix}:${count}`).join(lineEnding) +
    lineEnding
  );
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

function manyLines(count: number): string {
  const entries: Array<[string, number]> = [];
  for (let index = 0; entries.length < count; index += 1) {
    entries.push([hexSuffix(index + 1), index + 1]);
  }
  return rangeBody(entries);
}

function onlyRequest(): FetchCall {
  const call = fetchCalls[0];
  assert.ok(call, "exactly one request should have been issued");
  assert.equal(fetchCalls.length, 1, "exactly one request should be issued");
  return call;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  fetchCalls.length = 0;
});

describe("splitSha1", () => {
  test("splits the documented SHA-1 of a known compromised password", () => {
    const split = splitSha1(PWNED_PASSWORD);

    assert.equal(split.prefix, PWNED_PREFIX);
    assert.equal(split.suffix, PWNED_SUFFIX);
    assert.equal(`${split.prefix}${split.suffix}`, PWNED_SHA1);
    assert.equal(split.prefix, split.prefix.toUpperCase());
    assert.equal(split.suffix, split.suffix.toUpperCase());
  });

  test("the prefix is exactly five characters and the suffix is the rest", () => {
    for (const password of [PWNED_PASSWORD, SAFE_PASSWORD, UNICODE_PASSWORD]) {
      const split = splitSha1(password);
      assert.equal(split.prefix.length, 5, "prefix is five characters");
      assert.match(split.prefix, /^[0-9A-F]{5}$/);
      assert.match(split.suffix, /^[0-9A-F]{35}$/);
      assert.equal(split.prefix.length + split.suffix.length, 40);
    }
  });

  test("agrees with an independently computed SHA-1 for every input shape", () => {
    const inputs = [
      "",
      "a",
      "password",
      "P@ssw0rd!",
      "  padded  ",
      "x".repeat(1000),
      UNICODE_PASSWORD,
    ];

    for (const password of inputs) {
      const expected = createHash("sha1")
        .update(password, "utf8")
        .digest("hex")
        .toUpperCase();
      const split = splitSha1(password);
      const label = `input of length ${password.length}`;

      assert.equal(split.prefix, expected.slice(0, 5), label);
      assert.equal(split.suffix, expected.slice(5), label);
      assert.equal(`${split.prefix}${split.suffix}`, expected, label);
    }
  });

  test("a non-ASCII password produces a valid uppercase hex split", () => {
    const split = splitSha1(UNICODE_PASSWORD);
    const expected = createHash("sha1")
      .update(UNICODE_PASSWORD, "utf8")
      .digest("hex")
      .toUpperCase();

    assert.equal(`${split.prefix}${split.suffix}`, expected);
    assert.match(split.prefix, /^[0-9A-F]{5}$/);
    assert.match(split.suffix, /^[0-9A-F]{35}$/);
    assert.equal(split.suffix, split.suffix.toUpperCase());
  });
});

describe("parsePwnedRanges", () => {
  const entries: Array<[string, number]> = [
    [hexSuffix(1), 5],
    [hexSuffix(255), 3730471],
    [hexSuffix(4096), 0],
  ];

  const body = [
    ...entries.map(([suffix, count]) => `${suffix}:${count}`),
    hexSuffix(7),
    `${hexSuffix(8).slice(0, -1)}G:12`,
    `${hexSuffix(9)}:not-a-count`,
    ":12",
    "",
    `   ${hexSuffix(11).toLowerCase()}:77   `,
  ].join("\r\n");

  test("parses a realistic range body and uppercases suffixes", () => {
    const parsed = parsePwnedRanges(body);

    assert.deepEqual(parsed, [
      { suffix: hexSuffix(1), count: 5 },
      { suffix: hexSuffix(255), count: 3730471 },
      { suffix: hexSuffix(4096), count: 0 },
      { suffix: hexSuffix(11), count: 77 },
    ]);
  });

  test("counts parse as numbers", () => {
    for (const entry of parsePwnedRanges(body)) {
      assert.equal(typeof entry.count, "number");
      assert.equal(Number.isNaN(entry.count), false);
      assert.equal(Number.isInteger(entry.count), true);
    }
  });

  test("malformed lines are skipped", () => {
    const parsed = parsePwnedRanges(body);
    const suffixes = parsed.map((entry) => entry.suffix);

    assert.equal(parsed.length, 4, "only the four well-formed lines survive");
    assert.equal(suffixes.includes(hexSuffix(7)), false, "no colon");
    assert.equal(
      suffixes.includes(`${hexSuffix(8).slice(0, -1)}G`),
      false,
      "non-hex suffix",
    );
    assert.equal(suffixes.includes(hexSuffix(9)), false, "non-numeric count");
    assert.equal(suffixes.includes(""), false, "empty suffix");
  });

  test("an empty or whitespace-only body returns no entries", () => {
    assert.deepEqual(parsePwnedRanges(""), []);
    assert.deepEqual(parsePwnedRanges("\r\n\r\n"), []);
    assert.deepEqual(parsePwnedRanges("   \n\t\n"), []);
  });

  test("a body with hundreds of lines is parsed in full", () => {
    const parsed = parsePwnedRanges(manyLines(500));
    assert.equal(parsed.length, 500);
    assert.deepEqual(parsed[0], { suffix: hexSuffix(1), count: 1 });
  });
});

describe("isSuffixPwned", () => {
  const cases: Array<{
    name: string;
    body: string;
    suffix: string;
    expected: boolean;
  }> = [
    {
      name: "exact match",
      body: rangeBody([[PWNED_SUFFIX, 3730471]]),
      suffix: PWNED_SUFFIX,
      expected: true,
    },
    {
      name: "match with a lowercase suffix argument",
      body: rangeBody([[PWNED_SUFFIX, 3730471]]),
      suffix: PWNED_SUFFIX.toLowerCase(),
      expected: true,
    },
    {
      name: "match with a lowercase body",
      body: rangeBody([[PWNED_SUFFIX.toLowerCase(), 12]]),
      suffix: PWNED_SUFFIX,
      expected: true,
    },
    {
      name: "CRLF line endings",
      body: rangeBody([[PWNED_SUFFIX, 9]], "\r\n"),
      suffix: PWNED_SUFFIX,
      expected: true,
    },
    {
      name: "LF line endings",
      body: rangeBody([[PWNED_SUFFIX, 9]], "\n"),
      suffix: PWNED_SUFFIX,
      expected: true,
    },
    {
      name: "no trailing newline",
      body: `${PWNED_SUFFIX}:9`,
      suffix: PWNED_SUFFIX,
      expected: true,
    },
    {
      name: "match on the last of hundreds of lines",
      body: `${manyLines(499)}\r\n${PWNED_SUFFIX}:42\r\n`,
      suffix: PWNED_SUFFIX,
      expected: true,
    },
    {
      name: "absent from hundreds of lines",
      body: manyLines(500),
      suffix: PWNED_SUFFIX,
      expected: false,
    },
    {
      name: "near miss differing by one hex character",
      body: rangeBody([["1E4C9B93F3F0682250B6CF8331B7EE68FD9", 5]]),
      suffix: PWNED_SUFFIX,
      expected: false,
    },
    {
      name: "near miss that is a strict prefix of the suffix",
      body: rangeBody([[PWNED_SUFFIX.slice(0, 34), 5]]),
      suffix: PWNED_SUFFIX,
      expected: false,
    },
    {
      name: "near miss sharing only a leading run",
      body: rangeBody([["1E4C9B93000000000000000000000000000", 5]]),
      suffix: PWNED_SUFFIX,
      expected: false,
    },
    {
      name: "empty body",
      body: "",
      suffix: PWNED_SUFFIX,
      expected: false,
    },
  ];

  for (const fixture of cases) {
    test(fixture.name, () => {
      assert.equal(
        isSuffixPwned(fixture.body, fixture.suffix),
        fixture.expected,
      );
    });
  }

  test("matching is exact, not substring based", () => {
    const suffix = splitSha1(SAFE_PASSWORD).suffix;
    const lastCharacter = suffix.slice(-1);
    const differentLast = lastCharacter === "F" ? "0" : "F";

    const body = rangeBody([
      [suffix.slice(0, 34), 1],
      [`${suffix.slice(0, 34)}${differentLast}`, 1],
      [`${suffix}0`, 1],
      [`0${suffix}`, 1],
    ]);

    assert.notEqual(`${suffix.slice(0, 34)}${differentLast}`, suffix);
    assert.equal(isSuffixPwned(body, suffix), false);
    assert.equal(isSuffixPwned(`${body}${suffix}:7\r\n`, suffix), true);
  });
});

describe("checkPasswordBreach", () => {
  test("a known compromised password is pwned, with one request per check", async () => {
    stubFetch(() =>
      textResponse(rangeBody([[PWNED_SUFFIX, 3730471], [hexSuffix(12), 3]])),
    );

    assert.equal(await checkPasswordBreach(PWNED_PASSWORD), "pwned");
    assert.equal(fetchCalls.length, 1, "one check issues exactly one request");

    assert.equal(await isPasswordPwned(PWNED_PASSWORD), true);
    assert.equal(fetchCalls.length, 2, "one more request for the second check");
  });

  test("a strong password is safe", async () => {
    const { prefix, suffix } = splitSha1(SAFE_PASSWORD);
    const lastCharacter = suffix.slice(-1);
    const differentLast = lastCharacter === "F" ? "0" : "F";

    const body = rangeBody([
      [hexSuffix(1), 4],
      [suffix.slice(0, 34), 9],
      [`${suffix.slice(0, 34)}${differentLast}`, 9],
      [`${suffix.slice(0, 10)}0000000000000000000000000`, 9],
      [`${suffix.slice(0, 10)}FFFFFFFFFFFFFFFFFFFFFFFFF`, 9],
      [hexSuffix(999), 2],
    ]);

    assert.equal(body.includes(suffix), false, "fixture body has no match");

    stubFetch(() => textResponse(body));

    assert.equal(await checkPasswordBreach(SAFE_PASSWORD), "safe");
    assert.equal(await isPasswordPwned(SAFE_PASSWORD), false);
    assert.equal(fetchCalls.length, 2, "one request per check");
    assert.equal(
      fetchCalls.every((call) => call.url === `${HIBP_ENDPOINT}${prefix}`),
      true,
    );
  });

  test("a safe password stays safe among hundreds of returned suffixes", async () => {
    const { suffix } = splitSha1(SAFE_PASSWORD);

    stubFetch(() => textResponse(manyLines(500)));
    assert.equal(await checkPasswordBreach(SAFE_PASSWORD), "safe");

    stubFetch(() => textResponse(`${manyLines(500)}${suffix}:1\r\n`));
    assert.equal(await checkPasswordBreach(SAFE_PASSWORD), "pwned");
  });

  test("a non-ASCII password is checked without crashing", async () => {
    const { prefix, suffix } = splitSha1(UNICODE_PASSWORD);

    stubFetch(() => textResponse(rangeBody([[suffix, 42]])));

    assert.equal(await checkPasswordBreach(UNICODE_PASSWORD), "pwned");
    assert.equal(onlyRequest().url, `${HIBP_ENDPOINT}${prefix}`);
    assert.match(prefix, /^[0-9A-F]{5}$/);
    assert.match(suffix, /^[0-9A-F]{35}$/);
  });

  test("the request carries only the prefix, uses GET, and is abortable", async () => {
    stubFetch(() => textResponse(rangeBody([[hexSuffix(1), 1]])));

    await checkPasswordBreach(PWNED_PASSWORD);

    const { url, init } = onlyRequest();
    assert.equal(url, `${HIBP_ENDPOINT}${PWNED_PREFIX}`);
    assert.equal(url, "https://api.pwnedpasswords.com/range/5BAA6");
    assert.equal(new URL(url).pathname, `/range/${PWNED_PREFIX}`);
    assert.equal(url.length, HIBP_ENDPOINT.length + 5);
    assert.equal(url.includes(PWNED_SUFFIX), false);
    assert.equal(url.toLowerCase().includes(PWNED_SHA1.toLowerCase()), false);
    assert.equal(new URL(url).search, "");
    assert.equal(new URL(url).hash, "");

    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal, "a timeout signal must be attached");
    assert.equal(init?.body, undefined);
    assert.equal(
      JSON.stringify(init?.headers ?? {}).includes(PWNED_SUFFIX),
      false,
      "headers must not carry the suffix",
    );
  });

  test("isPasswordPwned fails closed for every non-safe result", async () => {
    stubFetch(() => textResponse("rate limited", 429));
    assert.equal(await checkPasswordBreach(PWNED_PASSWORD), "unavailable");
    assert.equal(await isPasswordPwned(PWNED_PASSWORD), true);

    stubFetch(() => textResponse(rangeBody([[PWNED_SUFFIX, 1]])));
    assert.equal(await checkPasswordBreach(PWNED_PASSWORD), "pwned");
    assert.equal(await isPasswordPwned(PWNED_PASSWORD), true);

    stubFetch(() => textResponse(manyLines(10)));
    assert.equal(await checkPasswordBreach(SAFE_PASSWORD), "safe");
    assert.equal(await isPasswordPwned(SAFE_PASSWORD), false);
  });
});

describe("HIBP API errors", () => {
  for (const status of [429, 500, 503, 404]) {
    test(`HTTP ${status} is unavailable and fails closed without throwing`, async () => {
      stubFetch(() => textResponse("upstream error", status));

      await assert.doesNotReject(checkPasswordBreach(PWNED_PASSWORD));
      assert.equal(await checkPasswordBreach(PWNED_PASSWORD), "unavailable");
      assert.equal(await isPasswordPwned(PWNED_PASSWORD), true);
      assert.equal(fetchCalls.length, 3, "one request per check");
      assert.equal(
        fetchCalls.every(
          (call) => call.url === `${HIBP_ENDPOINT}${PWNED_PREFIX}`,
        ),
        true,
        "every request carries only the prefix",
      );
    });
  }

  test("a non-ok response is unavailable even for a safe password", async () => {
    stubFetch(() => textResponse(manyLines(20), 503));
    assert.equal(await checkPasswordBreach(SAFE_PASSWORD), "unavailable");
    assert.equal(await isPasswordPwned(SAFE_PASSWORD), true);
  });
});

describe("HIBP timeouts and network failures", () => {
  const failures: Array<{ name: string; error: Error }> = [
    {
      name: "AbortError",
      error: Object.assign(new Error("The operation was aborted"), {
        name: "AbortError",
      }),
    },
    {
      name: "TimeoutError",
      error: Object.assign(new Error("timeout"), { name: "TimeoutError" }),
    },
    {
      name: "TypeError",
      error: new TypeError("fetch failed"),
    },
    {
      name: "generic Error",
      error: new Error("socket hang up"),
    },
  ];

  for (const failure of failures) {
    test(`${failure.name} is unavailable and fails closed`, async () => {
      stubFetch(() => {
        throw failure.error;
      });

      await assert.doesNotReject(checkPasswordBreach(PWNED_PASSWORD));
      assert.equal(await checkPasswordBreach(PWNED_PASSWORD), "unavailable");
      assert.equal(await isPasswordPwned(PWNED_PASSWORD), true);
    });
  }

  test("a rejecting fetch does not throw out of the helper", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));

    const result = await checkPasswordBreach(PWNED_PASSWORD);
    assert.equal(result, "unavailable");
  });
});

describe("k-anonymity: nothing sensitive is written anywhere", () => {
  const logPassword = "Autopost-Test-Vector-7f3c1!not-in-logs";
  const logHash = createHash("sha1")
    .update(logPassword, "utf8")
    .digest("hex")
    .toUpperCase();
  const logPrefix = logHash.slice(0, 5);
  const logSuffix = logHash.slice(5);

  function captureConsole(sink: string[]): () => void {
    const originals: Array<[ConsoleMethod, typeof console.log]> = [
      ["log", console.log.bind(console)],
      ["warn", console.warn.bind(console)],
      ["error", console.error.bind(console)],
    ];

    for (const [method] of originals) {
      console[method] = (...args: unknown[]): void => {
        sink.push(
          args.map((arg) => (typeof arg === "string" ? arg : String(arg))).join(" "),
        );
      };
    }

    return () => {
      for (const [method, original] of originals) {
        console[method] = original;
      }
    };
  }

  function captureStream(stream: NodeJS.WriteStream, sink: string[]): () => void {
    const original = stream.write.bind(stream) as unknown as WriteFn;

    stream.write = ((chunk: Uint8Array | string, ...rest: unknown[]) => {
      sink.push(
        typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"),
      );
      return (original as unknown as (...args: unknown[]) => boolean)(
        chunk,
        ...rest,
      );
    }) as unknown as WriteFn;

    return () => {
      stream.write = original;
    };
  }

  async function captureOutput(run: () => Promise<void>): Promise<string> {
    const sink: string[] = [];
    const restoreConsole = captureConsole(sink);
    const restoreStdout = captureStream(process.stdout, sink);
    const restoreStderr = captureStream(process.stderr, sink);

    try {
      await run();
    } finally {
      restoreStderr();
      restoreStdout();
      restoreConsole();
    }

    return sink.join("\n");
  }

  test("the password, full hash and suffix never reach logs or stdout", async () => {
    const output = await captureOutput(async () => {
      stubFetch((url) =>
        url.endsWith(PWNED_PREFIX)
          ? textResponse(rangeBody([[PWNED_SUFFIX, 3730471]]))
          : textResponse("upstream error", 503),
      );

      assert.equal(await checkPasswordBreach(logPassword), "unavailable");
      assert.equal(await checkPasswordBreach(PWNED_PASSWORD), "pwned");

      stubFetch(() => {
        throw new TypeError("fetch failed");
      });
      assert.equal(await checkPasswordBreach(logPassword), "unavailable");
    });

    assert.ok(
      output.includes("password breach check failed"),
      "the HTTP failure should have been logged, otherwise this proves nothing",
    );
    assert.ok(
      output.includes("password breach check unavailable"),
      "the network failure should have been logged, otherwise this proves nothing",
    );

    for (const secret of [
      logPassword,
      logHash,
      logHash.toLowerCase(),
      logSuffix,
      logSuffix.toLowerCase(),
      PWNED_SHA1,
      PWNED_SHA1.toLowerCase(),
      PWNED_SUFFIX,
      PWNED_SUFFIX.toLowerCase(),
    ]) {
      assert.equal(output.includes(secret), false, "secret leaked to output");
    }
  });

  test("the fixture password itself is never logged", async () => {
    const output = await captureOutput(async () => {
      stubFetch(() => textResponse("upstream error", 503));
      assert.equal(await checkPasswordBreach(PWNED_PASSWORD), "unavailable");
    });

    // The two static log messages contain the word "password"; strip them so
    // the plaintext check is about the password itself, not the log wording.
    let scrubbed = output;
    for (const message of STATIC_LOG_MESSAGES) {
      scrubbed = scrubbed.split(message).join("");
    }

    assert.ok(output.includes("password breach check failed"));
    assert.equal(scrubbed.includes(PWNED_PASSWORD), false);
    assert.equal(scrubbed.includes(PWNED_SHA1), false);
    assert.equal(scrubbed.includes(PWNED_SUFFIX), false);
  });

  test("the outgoing URL holds the prefix and nothing else", async () => {
    stubFetch((url) =>
      url.endsWith(logPrefix)
        ? textResponse(rangeBody([[logSuffix, 12]]))
        : textResponse(manyLines(10)),
    );

    await captureOutput(async () => {
      assert.equal(await checkPasswordBreach(logPassword), "pwned");
    });

    const { url } = onlyRequest();
    assert.equal(url, `${HIBP_ENDPOINT}${logPrefix}`);
    assert.equal(url.length, HIBP_ENDPOINT.length + 5);
    assert.equal(url.includes(logSuffix), false);
    assert.equal(url.includes(logHash), false);
    assert.equal(url.includes(logHash.toLowerCase()), false);
    assert.equal(url.includes(logPassword), false);
  });
});
