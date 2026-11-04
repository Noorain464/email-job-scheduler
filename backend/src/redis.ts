import { Redis } from 'ioredis';

export function createRedisConnection(): Redis {
  return new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
    // BullMQ needs Redis to keep retrying through brief Redis outages.
    maxRetriesPerRequest: null,
  });
}
