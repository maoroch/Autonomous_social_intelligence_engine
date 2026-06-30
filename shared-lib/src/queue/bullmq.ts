import { Queue, Worker, type Processor, type ConnectionOptions, QueueEvents } from "bullmq";

/**
 * Парсит REDIS_URL вида redis://host:port в опции подключения BullMQ.
 * Используем общий connection-конфиг, чтобы не плодить разные парсеры по сервисам.
 */
export function getRedisConnection(redisUrl: string): ConnectionOptions {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
  };
}

export function createQueue<T = unknown>(name: string, redisUrl: string): Queue<T> {
  return new Queue<T>(name, {
    connection: getRedisConnection(redisUrl),
    defaultJobOptions: {
      attempts: 1, // повторы агент/Open Claw контролируют сами на уровне бизнес-логики, не BullMQ retry
      removeOnComplete: { age: 3600 * 24, count: 1000 },
      removeOnFail: { age: 3600 * 24 * 7 },
    },
  });
}

export function createWorker<T = unknown>(
  name: string,
  processor: Processor<T>,
  redisUrl: string,
  concurrency = 5,
): Worker<T> {
  return new Worker<T>(name, processor, {
    connection: getRedisConnection(redisUrl),
    concurrency,
  });
}

export function createQueueEvents(name: string, redisUrl: string): QueueEvents {
  return new QueueEvents(name, { connection: getRedisConnection(redisUrl) });
}
