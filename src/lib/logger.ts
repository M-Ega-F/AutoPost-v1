const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|passwd|authorization|cookie|api[-_]?key|access[-_]?key|client[-_]?secret|refresh)/i;

const BEARER_PATTERN = /(bearer\s+)[A-Za-z0-9._~+/=-]+/gi;

const LONG_SECRET_PATTERN =
  /\b(?:EAA[A-Za-z0-9]{20,}|[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{10,})\b/g;

const REDACTED = "[redacted]";

function redactString(value: string): string {
  return value
    .replace(BEARER_PATTERN, `$1${REDACTED}`)
    .replace(LONG_SECRET_PATTERN, REDACTED);
}

/**
 * Recursively removes credentials from anything we are about to persist or log.
 * Used for `post_executions.response_log` and for every log line.
 */
export function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;

  if (typeof value === "string") return redactString(value);

  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, depth + 1));
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? REDACTED
        : sanitize(item, depth + 1);
    }
    return result;
  }

  return value;
}

export type LogLevel = "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

function emit(level: LogLevel, context: LogContext, message: string) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message: redactString(message),
    ...(sanitize(context) as LogContext),
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export type Logger = {
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, context?: LogContext) => void;
  child: (context: LogContext) => Logger;
};

export function createLogger(base: LogContext = {}): Logger {
  return {
    info: (message, context) => emit("info", { ...base, ...context }, message),
    warn: (message, context) => emit("warn", { ...base, ...context }, message),
    error: (message, context) => emit("error", { ...base, ...context }, message),
    child: (context) => createLogger({ ...base, ...context }),
  };
}

export const logger = createLogger();
