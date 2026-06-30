import pino from "pino";

/**
 * Создаёт логгер с привязкой к имени сервиса — обязательное поле `service`
 * в каждой строке лога упрощает grep/агрегацию при поднятии 7+ процессов локально.
 */
export function createLogger(serviceName: string) {
  return pino({
    name: serviceName,
    level: process.env.LOG_LEVEL ?? "info",
    transport:
      process.env.NODE_ENV !== "production"
        ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
        : undefined,
    base: { service: serviceName },
  });
}

export type Logger = ReturnType<typeof createLogger>;
