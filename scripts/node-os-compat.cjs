/* global process */

// tsx uses process.geteuid() when it is available and falls back to
// os.userInfo() otherwise. Windows has neither a POSIX geteuid nor a reliable
// os.userInfo() in some Node 24 environments, so provide the harmless POSIX
// capability marker before tsx is imported by the test/worker scripts.
if (process.platform === "win32" && typeof process.geteuid !== "function") {
  Object.defineProperty(process, "geteuid", {
    configurable: true,
    value: () => 0,
  });
}

// drizzle-kit also asks Node for the current user when it starts. Some
// managed Windows runtimes expose that libuv call but return ENOMEM; a
// best-effort fallback is sufficient for a CLI-generated migration.
if (process.platform === "win32") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, no-undef
  const os = require("node:os");
  try {
    os.userInfo();
  } catch {
    Object.defineProperty(os, "userInfo", {
      configurable: true,
      value: () => ({
        username: process.env.USERNAME ?? "codex",
        homedir: process.env.USERPROFILE ?? "",
        shell: "",
        uid: -1,
        gid: -1,
      }),
    });
  }
}
