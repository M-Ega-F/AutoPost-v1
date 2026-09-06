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
