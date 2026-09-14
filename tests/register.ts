import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Swaps three external boundaries for test doubles:
 *
 *   @/lib/db            -> a real Postgres in WASM (PGlite)
 *   @/lib/queue/publish and @/lib/queue/analytics -> in-memory recorders
 *   @/providers/social  -> scriptable fake providers
 *
 * Production code is untouched: nothing under `src/lib`, `src/app` or
 * `src/workers` imports this file.
 *
 * `node:test`'s `mock.module` is not available on this Node version, so the
 * swap is done with `registerHooks`, which the worker already uses successfully.
 */

// The domain layer encrypts and decrypts tokens, so a key must exist.
process.env.ENCRYPTION_KEY ??= "dGVzdC1lbmNyeXB0aW9uLWtleS0zMi1ieXRlcy1sb25nISE=";

const base = path.resolve("tests");

const replacements: Record<string, string> = {
  "@/lib/db": pathToFileURL(path.join(base, "db-harness.ts")).href,
  "@/lib/queue/publish": pathToFileURL(path.join(base, "fake-queue.ts")).href,
  "@/lib/queue/analytics": pathToFileURL(path.join(base, "fake-queue.ts")).href,
  "@/lib/queue": pathToFileURL(path.join(base, "fake-queue.ts")).href,
  "@/providers/social": pathToFileURL(path.join(base, "fake-providers.ts")).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const replacement = replacements[specifier];
    if (replacement) {
      return { url: replacement, format: "module", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
