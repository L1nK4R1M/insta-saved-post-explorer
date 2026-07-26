export type SafeLogFields = Record<string, unknown>;

export type WorkerLogger = {
  child(fields: SafeLogFields): WorkerLogger;
  debug(event: string, fields?: SafeLogFields): void;
  info(event: string, fields?: SafeLogFields): void;
  warn(event: string, fields?: SafeLogFields): void;
  error(event: string, fields?: SafeLogFields): void;
};

type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const secretKeyPattern = /authorization|credential|databaseurl|password|secret|token|accesskey/i;

export function createLogger(input: {
  level: LogLevel;
  secrets?: readonly string[];
  write?: (line: string) => void;
}): WorkerLogger {
  const secrets = [...new Set((input.secrets ?? []).filter(Boolean))];
  const write = input.write ?? ((line: string) => console.log(line));

  const replaceSecrets = (value: string): string => {
    let redacted = value.slice(0, 1_024);
    for (const secret of secrets) {
      redacted = redacted.split(secret).join("[REDACTED]");
    }
    return redacted;
  };

  const sanitize = (value: unknown, key: string | undefined, seen: WeakSet<object>): unknown => {
    if (key && secretKeyPattern.test(key)) return "[REDACTED]";
    if (typeof value === "string") return replaceSecrets(value);
    if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
    if (value === undefined) return undefined;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
      return { name: replaceSecrets(value.name), message: replaceSecrets(value.message) };
    }
    if (typeof value === "object") {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
      if (Array.isArray(value)) return value.map((entry) => sanitize(entry, undefined, seen));
      return Object.fromEntries(
        Object.entries(value).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey, seen)]),
      );
    }
    return replaceSecrets(String(value));
  };

  const buildLogger = (context: SafeLogFields): WorkerLogger => {
    const emit = (level: LogLevel, event: string, fields: SafeLogFields = {}) => {
      if (levelOrder[level] < levelOrder[input.level]) return;
      const record = sanitize(
        { timestamp: new Date().toISOString(), level, event, ...context, ...fields },
        undefined,
        new WeakSet(),
      );
      write(JSON.stringify(record));
    };

    return {
      child: (fields) => buildLogger({ ...context, ...fields }),
      debug: (event, fields) => emit("debug", event, fields),
      info: (event, fields) => emit("info", event, fields),
      warn: (event, fields) => emit("warn", event, fields),
      error: (event, fields) => emit("error", event, fields),
    };
  };

  return buildLogger({});
}
