import pino from "pino";
import { env, isDevelopment } from "@/config";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { app: env.APP_NAME },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      }
    : undefined,
  redact: {
    paths: [
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.authorization",
      "*.secret",
    ],
    censor: "[REDACTED]",
  },
});

export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
